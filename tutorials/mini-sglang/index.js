// Mini-SGLang overview widgets: request lifecycle, wire-format inspector, Req length stepper.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const SHA = '9a91cfafe754aa85daee49998176275667eb58f2';
  const src = (path, a, b) =>
    `<a class="src" href="https://github.com/sgl-project/mini-sglang/blob/${SHA}/python/minisgl/${path}#L${a}-L${b}">${path.split('/').pop()}:${a}–${b}</a>`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function S(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  // =====================================================================
  // 1. Request lifecycle across processes
  // =====================================================================
  function initLife(host) {
    const svg = $('svg', host), list = $('.hops', host);
    const tpSel = $('#life-tp', host), tokSel = $('#life-tok', host), outSel = $('#life-out', host);
    const playBtn = $('[data-act="play"]', host), stepBtn = $('[data-act="step"]', host), resetBtn = $('[data-act="reset"]', host);
    const TOP = 34, ROW = 86, BH = 64;
    let g = null, steps = [], cur = -1, run = 0, playing = false;
    let flashes = [], ncclLine = null;

    function layout() {
      const tp = +tpSel.value, ntok = +tokSel.value, shared = ntok === 0;
      const rows = Math.max(tp, shared ? 1 : 1 + ntok);
      const geo = {
        tp, ntok, shared, H: TOP + rows * ROW + 20,
        client: { x: 0, y: TOP, w: 96 },
        api: { x: 134, y: TOP, w: 150 },
        detok: { x: 326, y: TOP, w: 172 },
        toks: shared ? [] : Array.from({ length: ntok }, (_, k) => ({ x: 326, y: TOP + ROW * (k + 1), w: 172 })),
        ranks: Array.from({ length: tp }, (_, i) => ({ y: TOP + ROW * i }))
      };
      geo.tok0 = shared ? geo.detok : geo.toks[0];
      return geo;
    }

    function box(x, y, w, cls, title, sub) {
      S('rect', { x, y, width: w, height: BH, rx: 4, class: cls }, svg);
      S('text', { x: x + 10, y: y + 26, class: 't-lg' }, svg, title);
      S('text', { x: x + 10, y: y + 46, class: 't-sm muted' }, svg, sub);
    }

    function draw() {
      svg.innerHTML = '';
      svg.setAttribute('viewBox', `0 0 880 ${g.H}`);
      S('text', { x: 134, y: 16, class: 't-head' }, svg, 'MAIN PROCESS');
      S('text', { x: 326, y: 16, class: 't-head' }, svg, 'TOKENIZER PROCESSES');
      S('text', { x: 540, y: 16, class: 't-head' }, svg, 'ONE PROCESS PER TP RANK');
      // static links
      const dn = TOP + 22, up = TOP + 44;
      S('path', { d: `M96,${dn} H134`, class: 'ln-ink' }, svg);
      S('path', { d: `M134,${up} H96`, class: 'ln-ink' }, svg);
      S('path', { d: `M284,${dn} H305 V${g.tok0.y + 22} H326`, class: 'ln-cpu' }, svg);
      S('path', { d: `M498,${g.tok0.y + 22} H519 V${dn} H540`, class: 'ln-cpu' }, svg);
      S('path', { d: `M540,${up} H498`, class: 'ln-cpu' }, svg);
      S('path', { d: `M326,${up} H284`, class: 'ln-cpu' }, svg);
      box(0, TOP, 96, 'box-plain', 'client', 'HTTP · SSE');
      box(134, TOP, 150, 'box-cpu', 'API server', 'FastAPI · asyncio');
      if (g.shared) {
        box(326, TOP, 172, 'box-cpu', 'tokenize_worker', 'tokenizes + detokenizes');
      } else {
        box(326, TOP, 172, 'box-cpu', 'detokenizer', `tokenize_worker id ${g.ntok}`);
        g.toks.forEach((t, k) => box(326, t.y, 172, 'box-cpu', `tokenizer ${k}`, `tokenize_worker id ${k}`));
      }
      flashes = [];
      if (g.tp > 1) {
        const last = g.ranks[g.tp - 1].y;
        S('path', { d: `M560,${TOP + BH} V${last}`, class: 'ln-cpu' }, svg);
        S('path', { d: `M580,${TOP + BH} V${last}`, class: 'ln-gloo' }, svg);
        S('text', { x: 592, y: TOP + BH + 15, class: 't-sm muted' }, svg, 'PUB bytes + gloo count');
        ncclLine = S('path', { d: `M866,${TOP + 32} V${last + 32}`, class: 'ln-nvl' }, svg);
        g.ranks.forEach((r) => S('path', { d: `M854,${r.y + 32} H866`, class: 'ln-nvl' }, svg));
        S('text', { x: 854, y: last + BH + 15, class: 't-sm gpu', 'text-anchor': 'end' }, svg, 'NCCL all-reduce (pynccl)');
      } else {
        ncclLine = null;
      }
      g.ranks.forEach((r, i) => {
        const sub = i === 0 ? (g.tp > 1 ? 'ZMQ PULL · PUSH · PUB' : 'ZMQ PULL · PUSH') : 'ZMQ SUB';
        box(540, r.y, 150, 'box-cpu', `scheduler ${i}`, sub);
        box(704, r.y, 150, 'box-gpu', `Engine · cuda:${i}`, 'model · KV cache');
        flashes.push(S('rect', { x: 705, y: r.y + 1, width: 148, height: BH - 2, rx: 3, class: 'flash-gpu' }, svg));
      });
    }

    // chip travelling along a polyline; keyframe offsets follow path length
    function chip(label, cls, pts, dur) {
      return new Promise((resolve) => {
        if (reduceMotion) { resolve(); return; }
        const w = label.length * 6.5 + 14;
        const grp = S('g', { class: 'chip ' + cls }, svg);
        S('rect', { x: -w / 2, y: -9, width: w, height: 18, rx: 3 }, grp);
        S('text', { x: 0, y: 4, 'text-anchor': 'middle' }, grp, label);
        const d = [0];
        for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        const total = d[d.length - 1] || 1;
        const frames = pts.map(([x, y], i) => ({ transform: `translate(${x}px, ${y}px)`, offset: d[i] / total }));
        const anim = grp.animate(frames, { duration: dur, easing: 'ease-in-out', fill: 'forwards' });
        anim.finished.then(() => { grp.remove(); resolve(); }, () => { grp.remove(); resolve(); });
      });
    }

    function gpuPulse(dur) {
      if (reduceMotion) return Promise.resolve();
      const ps = flashes.map((f) => f.animate([{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 1, offset: 0.65 }, { opacity: 0 }], { duration: dur }).finished);
      if (ncclLine && g.tp > 1) {
        const last = g.ranks[g.tp - 1].y;
        const dot = S('circle', { cx: 0, cy: 0, r: 5, class: 'dot-gpu' }, svg);
        ps.push(dot.animate([
          { transform: `translate(866px, ${TOP + 32}px)` },
          { transform: `translate(866px, ${last + 32}px)`, offset: 0.5 },
          { transform: `translate(866px, ${TOP + 32}px)` }
        ], { duration: dur, easing: 'ease-in-out' }).finished.then(() => dot.remove(), () => dot.remove()));
      }
      return Promise.all(ps.map((p) => p.catch(() => {})));
    }

    function buildSteps() {
      const T = +outSel.value;
      const dn = TOP + 22, up = TOP + 44;
      const tokName = g.shared ? 'tokenize_worker' : 'tokenizer 0';
      const detName = g.shared ? 'tokenize_worker' : 'detokenizer';
      const tokSock = g.shared ? 'ipc:///tmp/minisgl_1' : 'ipc:///tmp/minisgl_4';
      const out = [];
      out.push({
        k: bi('client → API server', 'client → API server'), msg: 'POST /v1/chat/completions', sock: 'HTTP · 127.0.0.1:1919',
        d: bi('The FastAPI handler turns <code>messages</code> into a list of dicts, takes a fresh uid from <code>new_user()</code>, and wraps both in a <code>TokenizeMsg</code>.',
              'FastAPI 处理函数把 <code>messages</code> 转成 dict 列表，用 <code>new_user()</code> 取得新的 uid，再把二者封装进 <code>TokenizeMsg</code>。') + src('server/api_server.py', 255, 278),
        anim: () => chip('POST', 'chip-http', [[96, dn], [134, dn]], 600)
      });
      out.push({
        k: bi(`API server → ${tokName}`, `API server → ${tokName}`), msg: 'TokenizeMsg', sock: `ZMQ PUSH → PULL · ${tokSock}`,
        d: (g.shared
          ? bi('With <code>--num-tokenizer 0</code> (the default) the detokenizer process also tokenizes, so the API server pushes to the detokenizer\'s address.',
               '<code>--num-tokenizer 0</code>（默认）时，detokenizer 进程同时负责分词，因此 API server 直接推送到 detokenizer 的地址。')
          : bi('With separate tokenizers the API server binds <code>minisgl_4</code> and every tokenizer connects to it; ZMQ PUSH hands successive messages to them in turn.',
               '启用独立 tokenizer 时，API server 绑定 <code>minisgl_4</code>，各 tokenizer 连接到它；ZMQ PUSH 会把后续消息轮流交给它们。')) + src('server/args.py', 25, 47),
        anim: () => chip('TokenizeMsg', 'chip-cpu', [[284, dn], [305, dn], [305, g.tok0.y + 22], [326, g.tok0.y + 22]], 800)
      });
      out.push({
        k: bi(`${tokName} → scheduler 0`, `${tokName} → scheduler 0`), msg: 'UserMsg', sock: 'ZMQ PUSH → PULL · ipc:///tmp/minisgl_0',
        d: bi('The tokenizer applies the chat template, encodes to a 1D int32 tensor, and sends <code>UserMsg(uid, input_ids, sampling_params)</code> to rank 0 only.',
              'tokenizer 套用 chat template，编码成一维 int32 张量，然后只向 rank 0 发送 <code>UserMsg(uid, input_ids, sampling_params)</code>。') + src('tokenizer/server.py', 87, 101),
        anim: () => chip('UserMsg', 'chip-cpu', [[498, g.tok0.y + 22], [519, g.tok0.y + 22], [519, dn], [540, dn]], 800)
      });
      if (g.tp > 1) {
        out.push({
          k: bi(`scheduler 0 → schedulers 1…${g.tp - 1}`, `scheduler 0 → scheduler 1…${g.tp - 1}`), msg: bi('raw bytes + count', '原始字节 + 计数'), sock: 'ZMQ PUB → SUB · ipc:///tmp/minisgl_2 · gloo broadcast',
          d: bi('Rank 0 forwards the undecoded bytes on a PUB socket and broadcasts how many messages it drained over the gloo CPU group, so every rank processes exactly the same messages in the same step.',
                'rank 0 把未解码的字节原样经 PUB socket 转发，并通过 gloo CPU group 广播本轮取到的消息数，保证每个 rank 在同一步处理完全相同的消息。') + src('scheduler/io.py', 88, 122),
          anim: () => Promise.all(g.ranks.slice(1).map((r) => chip('bytes', 'chip-cpu', [[560, TOP + BH], [560, r.y + 10]], 700)))
        });
      }
      for (let t = 1; t <= T; t++) {
        const last = t === T;
        out.push({
          k: bi(`every rank · ${t === 1 ? 'prefill' : 'decode'} step`, `所有 rank · ${t === 1 ? 'prefill' : 'decode'} 步`), msg: 'Engine.forward_batch', sock: g.tp > 1 ? 'GPU · NCCL all-reduce inside TP layers' : 'GPU',
          d: (t === 1
            ? bi('Each scheduler adds the request to its prefill queue, builds the same batch, and runs the model on its own GPU.',
                 '每个 scheduler 把请求加入 prefill 队列，构造相同的 batch，并在各自的 GPU 上运行模型。')
            : bi('The request now sits in the decode set; each step feeds back the one token sampled last time. Small decode batches can replay a captured CUDA graph.',
                 '请求此时位于 decode 集合；每一步把上次采样出的那一个 token 送回模型。较小的 decode batch 可以重放已捕获的 CUDA graph。')) + src('engine/engine.py', 191, 206),
          anim: () => gpuPulse(900)
        });
        out.push({
          k: bi(`scheduler 0 → ${detName}`, `scheduler 0 → ${detName}`), msg: `DetokenizeMsg${last ? ' · finished' : ''}`, sock: 'ZMQ PUSH → PULL · ipc:///tmp/minisgl_1',
          d: bi(`Rank 0 turns the sampled token into <code>DetokenizeMsg(uid, next_token, finished=${last ? 'True' : 'False'})</code>. The other ranks run the same bookkeeping but send nothing.`,
                `rank 0 把采样出的 token 封装成 <code>DetokenizeMsg(uid, next_token, finished=${last ? 'True' : 'False'})</code>。其他 rank 执行同样的记账，但不发送任何消息。`) + src('scheduler/scheduler.py', 138, 167),
          anim: () => chip('DetokenizeMsg', 'chip-cpu', [[540, up], [498, up]], 600)
        });
        out.push({
          k: bi(`${detName} → API server`, `${detName} → API server`), msg: 'UserReply', sock: 'ZMQ PUSH → PULL · ipc:///tmp/minisgl_3',
          d: bi('The detokenizer decodes incrementally and holds back text that a later token could still change, then sends <code>UserReply(uid, incremental_output, finished)</code>.',
                'detokenizer 增量解码，先扣住后续 token 仍可能改变的文本，再发送 <code>UserReply(uid, incremental_output, finished)</code>。') + src('tokenizer/detokenize.py', 70, 111),
          anim: () => chip('UserReply', 'chip-cpu', [[326, up], [284, up]], 600)
        });
        out.push({
          k: bi('API server → client', 'API server → client'), msg: last ? 'SSE chunk · [DONE]' : 'SSE chunk', sock: 'HTTP · text/event-stream',
          d: bi('<code>listen()</code> files the reply under its uid and sets that request\'s <code>asyncio.Event</code>; the streaming generator wakes up and yields a chunk.' + (last ? ' After <code>finished</code> it sends <code>finish_reason: "stop"</code> and <code>[DONE]</code>.' : ''),
                '<code>listen()</code> 把回复按 uid 存好并置位该请求的 <code>asyncio.Event</code>；流式生成器被唤醒并产出一个 chunk。' + (last ? '收到 <code>finished</code> 后再发送 <code>finish_reason: "stop"</code> 和 <code>[DONE]</code>。' : '')) + src('server/api_server.py', 116, 188),
          anim: () => chip(last ? 'chunk + [DONE]' : 'chunk', 'chip-http', [[134, up], [96, up]], 600)
        });
      }
      return out;
    }

    function renderList() {
      list.innerHTML = steps.map((s, i) =>
        `<li data-i="${i}"><div class="hop-k"><span>${s.k}</span><code>${s.msg}</code><span class="hop-sock">${s.sock}</span></div><div class="hop-d">${s.d}</div></li>`).join('');
    }

    function mark(i) {
      cur = i;
      list.querySelectorAll('li').forEach((li) => li.classList.toggle('cur', +li.dataset.i === i));
      stepBtn.disabled = cur >= steps.length - 1;
    }

    function rebuild() {
      run++; playing = false;
      g = layout(); draw(); steps = buildSteps(); renderList(); mark(-1);
      playBtn.innerHTML = bi('▶ Play', '▶ 播放');
    }

    async function doStep(token) {
      if (cur >= steps.length - 1) return false;
      mark(cur + 1);
      await steps[cur].anim();
      return token === run;
    }

    playBtn.addEventListener('click', async () => {
      if (playing) { run++; playing = false; playBtn.innerHTML = bi('▶ Play', '▶ 播放'); return; }
      if (cur >= steps.length - 1) mark(-1);
      playing = true;
      const token = ++run;
      playBtn.innerHTML = bi('Pause', '暂停');
      while (token === run && cur < steps.length - 1) {
        const ok = await doStep(token);
        if (!ok) return;
        await sleep(reduceMotion ? 700 : 250);
      }
      if (token === run) { playing = false; playBtn.innerHTML = bi('▶ Replay', '▶ 重放'); }
    });
    stepBtn.addEventListener('click', () => { run++; playing = false; playBtn.innerHTML = bi('▶ Play', '▶ 播放'); doStep(run); });
    resetBtn.addEventListener('click', rebuild);
    [tpSel, tokSel, outSel].forEach((el) => el.addEventListener('change', rebuild));
    rebuild();
  }

  // =====================================================================
  // 2. Wire format: serialize_type + msgpack.packb(use_bin_type=True)
  // =====================================================================
  function initWire(host) {
    const typeSel = $('#wire-type', host), txt = $('#wire-text', host), ids = $('#wire-ids', host), fin = $('#wire-fin', host);
    const txtWrap = $('[data-for="text"]', host), idsWrap = $('[data-for="ids"]', host), finWrap = $('[data-for="fin"]', host);
    const pre = $('.wire-dict', host), hex = $('.hex', host), readouts = $('.readouts', host);

    const D = (...entries) => ({ t: 'dict', entries });
    const str = (v) => ({ t: 'str', v }), int = (v) => ({ t: 'int', v }), flt = (v) => ({ t: 'float', v });
    const bool = (v) => ({ t: 'bool', v }), bytes = (v) => ({ t: 'bytes', v }), list = (v) => ({ t: 'list', v });
    const obj = (name, ...fields) => D(['__type__', str(name)], ...fields);
    // field order follows the dataclass declarations (self.__dict__ order)
    const sampling = () => obj('SamplingParams', ['temperature', flt(1.0)], ['top_k', int(-1)], ['top_p', flt(1.0)], ['ignore_eos', bool(false)], ['max_tokens', int(16)]);
    const tensor = (arr) => {
      const b = new Uint8Array(arr.length * 4);
      const dv = new DataView(b.buffer);
      arr.forEach((x, i) => dv.setInt32(i * 4, x, true));
      return D(['__type__', str('Tensor')], ['buffer', bytes(b)], ['dtype', str('torch.int32')]);
    };
    const parseIds = () => ids.value.split(/[\s,]+/).filter(Boolean).map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n)).map((n) => Math.max(-2147483648, Math.min(2147483647, n))).slice(0, 64);

    function build() {
      switch (typeSel.value) {
        case 'tok-text': return obj('TokenizeMsg', ['uid', int(0)], ['text', str(txt.value)], ['sampling_params', sampling()]);
        case 'tok-chat': return obj('TokenizeMsg', ['uid', int(0)], ['text', list([D(['role', str('user')], ['content', str(txt.value)])])], ['sampling_params', sampling()]);
        case 'user': return obj('UserMsg', ['uid', int(0)], ['input_ids', tensor(parseIds())], ['sampling_params', sampling()]);
        case 'detok': return obj('DetokenizeMsg', ['uid', int(0)], ['next_token', int(parseIds()[0] ?? 0)], ['finished', bool(fin.checked)]);
        default: return obj('UserReply', ['uid', int(0)], ['incremental_output', str(txt.value)], ['finished', bool(fin.checked)]);
      }
    }

    const be = (n, len) => { const a = []; for (let i = len - 1; i >= 0; i--) a.push(Math.floor(n / Math.pow(256, i)) % 256); return a; };
    function encInt(n) {
      if (n >= 0) {
        if (n < 128) return [n];
        if (n < 256) return [0xcc, n];
        if (n < 65536) return [0xcd, ...be(n, 2)];
        if (n < 4294967296) return [0xce, ...be(n, 4)];
        return [0xcf, ...be(n, 8)];
      }
      if (n >= -32) return [n & 0xff];
      if (n >= -128) return [0xd0, n & 0xff];
      if (n >= -32768) return [0xd1, ...be(n & 0xffff, 2)];
      return [0xd2, ...be(n >>> 0, 4)];
    }
    function pack(root) {
      const out = [], roles = [];
      const push = (arr, role) => { for (const b of arr) { out.push(b); roles.push(role); } };
      function enc(v, role) {
        switch (v.t) {
          case 'bool': push([v.v ? 0xc3 : 0xc2], role); break;
          case 'int': push(encInt(v.v), role); break;
          case 'float': { const b = new ArrayBuffer(8); new DataView(b).setFloat64(0, v.v, false); push([0xcb, ...new Uint8Array(b)], role); break; }
          case 'str': {
            const b = new TextEncoder().encode(v.v), n = b.length;
            push(n < 32 ? [0xa0 | n] : n < 256 ? [0xd9, n] : n < 65536 ? [0xda, ...be(n, 2)] : [0xdb, ...be(n, 4)], role);
            push(b, role); break;
          }
          case 'bytes': {
            const n = v.v.length;
            push(n < 256 ? [0xc4, n] : n < 65536 ? [0xc5, ...be(n, 2)] : [0xc6, ...be(n, 4)], role);
            push(v.v, role); break;
          }
          case 'list': {
            const n = v.v.length;
            push(n < 16 ? [0x90 | n] : [0xdc, ...be(n, 2)], 'hdr');
            v.v.forEach((x) => enc(x, 'val')); break;
          }
          case 'dict': {
            const n = v.entries.length;
            push(n < 16 ? [0x80 | n] : [0xde, ...be(n, 2)], 'hdr');
            for (const [k, x] of v.entries) { enc(str(k), 'key'); enc(x, k === '__type__' ? 'tag' : 'val'); }
            break;
          }
          default: push([0xc0], role);
        }
      }
      enc(root, 'val');
      return { out, roles };
    }

    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const pyStr = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
    function pyBytes(b) {
      let s = "b'";
      const n = Math.min(b.length, 24);
      for (let i = 0; i < n; i++) {
        const c = b[i];
        s += c === 0x5c ? '\\\\' : c === 0x27 ? "\\'" : (c >= 32 && c < 127) ? String.fromCharCode(c) : '\\x' + c.toString(16).padStart(2, '0');
      }
      return s + "'" + (b.length > n ? ` … (${b.length} bytes)` : '');
    }
    function repr(v, ind) {
      switch (v.t) {
        case 'bool': return v.v ? 'True' : 'False';
        case 'int': return String(v.v);
        case 'float': return Number.isInteger(v.v) ? v.v.toFixed(1) : String(v.v);
        case 'str': return pyStr(v.v);
        case 'bytes': return pyBytes(v.v);
        case 'list': return '[' + v.v.map((x) => repr(x, ind)).join(', ') + ']';
        case 'dict': {
          const pad = ind + '    ';
          return '{\n' + v.entries.map(([k, x]) => pad + pyStr(k) + ': ' + repr(x, pad)).join(',\n') + '\n' + ind + '}';
        }
        default: return 'None';
      }
    }

    function update() {
      const t = typeSel.value;
      txtWrap.hidden = !(t === 'tok-text' || t === 'tok-chat' || t === 'reply');
      idsWrap.hidden = !(t === 'user' || t === 'detok');
      finWrap.hidden = !(t === 'detok' || t === 'reply');
      const msg = build();
      pre.textContent = repr(msg, '');
      const { out, roles } = pack(msg);
      let html = '';
      for (let r = 0; r < out.length; r += 16) {
        html += `<div class="row"><span class="off">${r.toString(16).padStart(4, '0')}</span><span>`;
        for (let i = r; i < Math.min(r + 16, out.length); i++) html += `<span class="b ${roles[i]}">${out[i].toString(16).padStart(2, '0')}</span>`;
        html += '</span></div>';
      }
      hex.innerHTML = html;
      const schema = roles.filter((x) => x !== 'val').length;
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Bytes on the wire', '线上字节数')}</span><span class="v">${out.length}</span><span class="s">msgpack.packb(serialize_type(msg))</span></div>
        <div class="readout"><span class="k">${bi('Names, tags and headers', '字段名、类型标签与头')}</span><span class="v">${schema}</span><span class="s">${bi(`${Math.round(100 * schema / out.length)}% of the message`, `占消息的 ${Math.round(100 * schema / out.length)}%`)}</span></div>
        <div class="readout"><span class="k">${bi('Values', '取值')}</span><span class="v">${out.length - schema}</span><span class="s">${bi('includes each value\'s own length header', '含每个值自身的长度头')}</span></div>`;
    }
    [typeSel, txt, ids, fin].forEach((el) => el.addEventListener('input', update));
    update();
  }

  // =====================================================================
  // 3. Req length stepper (core.Req)
  // =====================================================================
  function initReq(host) {
    const L = $('#req-L', host), H = $('#req-h', host), M = $('#req-M', host);
    const Lo = $('#req-L-out', host), Ho = $('#req-h-out', host), Mo = $('#req-M-out', host);
    const strip = $('.req-strip', host), status = $('.req-status', host), readouts = $('.readouts', host);
    const fwd = $('[data-act="fwd"]', host), reset = $('[data-act="reset"]', host);
    let st;

    function init() {
      const l = +L.value;
      H.max = String(l - 1);
      if (+H.value > l - 1) H.value = String(l - 1);
      Lo.textContent = L.value; Ho.textContent = H.value; Mo.textContent = M.value;
      st = { L: l, M: +M.value, cached: +H.value, device: l, max: l + +M.value, steps: 0 };
      paint();
    }

    function paint() {
      const remain = st.max - st.device, extend = st.device - st.cached;
      let html = '';
      for (let i = 0; i < st.max; i++) {
        if (i === st.L) html += '<span class="gap" aria-hidden="true"></span>';
        const cls = i < st.cached ? 'cached' : i < st.device ? 'extend' : '';
        html += `<span class="cell ${cls}${i >= st.L ? ' out' : ''}" title="position ${i}">${i}</span>`;
      }
      strip.innerHTML = html;
      const finished = st.steps > 0 && remain === 0;
      readouts.innerHTML = [
        ['cached_len', st.cached, bi('KV already in the cache', 'KV 已在 cache 中')],
        ['device_len', st.device, bi('positions the GPU knows', 'GPU 已知的位置数')],
        ['max_device_len', st.max, bi('input + output_len', 'input + output_len')],
        ['extend_len', extend, bi('fed to the next forward', '送入下一次 forward')],
        ['remain_len', remain, bi('tokens still to sample', '还需采样的 token 数')],
        ['can_decode', remain > 0 ? 'True' : 'False', bi('remain_len &gt; 0', 'remain_len &gt; 0')]
      ].map(([k, v, s]) => `<div class="readout${k === 'extend_len' ? ' key' : ''}"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></div>`).join('');
      if (st.steps === 0) {
        status.innerHTML = bi(`Before the first forward. The prefix cache supplied ${st.cached} tokens, so this prefill batch computes extend_len = ${extend} positions.`,
                              `第一次 forward 之前。前缀 cache 提供了 ${st.cached} 个 token，因此这个 prefill batch 计算 extend_len = ${extend} 个位置。`);
      } else if (!finished) {
        status.innerHTML = bi(`After forward ${st.steps}: complete_one() raised cached_len to the old device_len and added one position for the token just sampled. The next batch is a decode with extend_len = 1.`,
                              `第 ${st.steps} 次 forward 之后：complete_one() 把 cached_len 提到原来的 device_len，并为刚采样出的 token 增加一个位置。下一个 batch 是 extend_len = 1 的 decode。`);
      } else {
        status.innerHTML = bi(`Finished after ${st.steps} forwards: remain_len is 0, so can_decode is False and rank 0 sends finished=True. The last sampled token goes to the user, but its KV entry is never computed.`,
                              `${st.steps} 次 forward 后结束：remain_len 为 0，can_decode 为 False，rank 0 发送 finished=True。最后一个采样出的 token 会返回给用户，但它的 KV 永远不会被计算。`);
      }
      fwd.disabled = remain <= 0;
    }

    fwd.addEventListener('click', () => {
      if (st.max - st.device <= 0) return;
      st.cached = st.device; st.device += 1; st.steps++;
      paint();
    });
    reset.addEventListener('click', init);
    [L, H, M].forEach((el) => el.addEventListener('input', init));
    init();
  }

  const life = document.getElementById('life'); if (life) initLife(life);
  const wire = document.getElementById('wire'); if (wire) initWire(wire);
  const req = document.getElementById('req'); if (req) initReq(req);
})();
