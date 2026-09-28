// Mini-SGLang chapter 04 widgets: TP shard map, one decoder layer across ranks,
// and the moe_align_block_size layout used by the fused MoE path.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const num = (x) => x.toLocaleString('en-US');
  const alignUp = (x, a) => Math.ceil(x / a) * a;
  const divCeil = (a, b) => Math.floor((a + b - 1) / b);
  const gib = (b) => (b / 1073741824).toFixed(b >= 10 * 1073741824 ? 1 : 2) + ' GiB';
  const mib = (b) => (b / 1048576).toFixed(b >= 100 * 1048576 ? 0 : 1) + ' MiB';
  const kib = (b) => (b / 1024).toFixed(b >= 100 * 1024 ? 0 : 1) + ' KiB';
  const bytes = (b) => (b >= 1073741824 ? gib(b) : b >= 1048576 ? mib(b) : kib(b));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function S(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Example configs (public Hugging Face config.json values, not part of the repo)
  const PRESETS = {
    'qwen3-0.6b': { name: 'Qwen3-0.6B', hidden: 1024, layers: 28, hq: 16, hkv: 8, hd: 128, inter: 3072, vocab: 151936, tie: true, qknorm: true, experts: 0, moeInter: 0 },
    'qwen3-14b': { name: 'Qwen3-14B', hidden: 5120, layers: 40, hq: 40, hkv: 8, hd: 128, inter: 17408, vocab: 151936, tie: false, qknorm: true, experts: 0, moeInter: 0 },
    'qwen3-32b': { name: 'Qwen3-32B', hidden: 5120, layers: 64, hq: 64, hkv: 8, hd: 128, inter: 25600, vocab: 151936, tie: false, qknorm: true, experts: 0, moeInter: 0 },
    'llama-70b': { name: 'Llama-3.1-70B', hidden: 8192, layers: 80, hq: 64, hkv: 8, hd: 128, inter: 28672, vocab: 128256, tie: false, qknorm: false, experts: 0, moeInter: 0 },
    'qwen3-30b-a3b': { name: 'Qwen3-30B-A3B', hidden: 2048, layers: 48, hq: 32, hkv: 4, hd: 128, inter: 6144, vocab: 151936, tie: false, qknorm: true, experts: 128, moeInter: 768 }
  };

  // div_even from utils/misc.py, returning an error message instead of asserting
  function divEven(a, b, allowReplicate) {
    if (allowReplicate && b > a) {
      if (b % a !== 0) return { err: `b = ${b} must be divisible by a = ${a} for KV head replication` };
      return { v: 1 };
    }
    if (a % b !== 0) return { err: `a = ${a} must be divisible by b = ${b}` };
    return { v: a / b };
  }

  // =====================================================================
  // 1. Shard map
  // =====================================================================
  function initShard(host) {
    const f = (id) => $('#' + id, host);
    const el = {
      preset: f('sh-preset'), tp: f('sh-tp'), rank: f('sh-rank'),
      hidden: f('sh-hidden'), layers: f('sh-layers'), hq: f('sh-hq'), hkv: f('sh-hkv'), hd: f('sh-hd'),
      inter: f('sh-inter'), vocab: f('sh-vocab'), experts: f('sh-experts'), moeInter: f('sh-moeinter'), tie: f('sh-tie')
    };
    const svg = $('svg', host), checksEl = $('.check-list', host), readouts = $('.readouts', host);
    let qknorm = true;

    function load(p) {
      el.hidden.value = p.hidden; el.layers.value = p.layers; el.hq.value = p.hq; el.hkv.value = p.hkv; el.hd.value = p.hd;
      el.inter.value = p.inter; el.vocab.value = p.vocab; el.experts.value = p.experts; el.moeInter.value = p.moeInter;
      el.tie.checked = p.tie; qknorm = p.qknorm;
    }

    function cfg() {
      return {
        hidden: +el.hidden.value, layers: +el.layers.value, hq: +el.hq.value, hkv: +el.hkv.value, hd: +el.hd.value,
        inter: +el.inter.value, vocab: +el.vocab.value, experts: +el.experts.value, moeInter: +el.moeInter.value,
        tie: el.tie.checked, qknorm
      };
    }

    function syncRanks() {
      const tp = +el.tp.value, cur = Math.min(+el.rank.value || 0, tp - 1);
      el.rank.innerHTML = Array.from({ length: tp }, (_, i) => `<option value="${i}"${i === cur ? ' selected' : ''}>${i}</option>`).join('');
    }

    function analyze(c, tp) {
      const checks = [];
      const push = (label, res, src) => { checks.push({ label, ok: !res.err, msg: res.err || '', src }); return res.v; };
      const hqOK = c.hq % c.hkv === 0;
      checks.push({ label: 'num_qo_heads % num_kv_heads == 0', ok: hqOK, msg: hqOK ? '' : `${c.hq} % ${c.hkv} != 0 (AttentionLayer assert)` });
      const qLocal = push(`q heads: div_even(${c.hq}, ${tp})`, divEven(c.hq, tp));
      const kvLocal = push(`kv heads: div_even(${c.hkv}, ${tp}, allow_replicate=True)`, divEven(c.hkv, tp, true));
      push(`o_proj input: div_even(${c.hq * c.hd}, ${tp})`, divEven(c.hq * c.hd, tp));
      let iLocal = null, imLocal = null;
      if (c.experts > 0) imLocal = push(`experts: div_even(${c.moeInter}, ${tp})`, divEven(c.moeInter, tp));
      else iLocal = push(`gate_up / down: div_even(${c.inter}, ${tp})`, divEven(c.inter, tp));
      const vTp = divCeil(c.vocab, tp);
      const lastRows = c.vocab - (tp - 1) * vTp;
      const vocabWarn = tp > 1 && c.vocab % tp !== 0;
      checks.push({ label: `vocab rows per rank: ⌈${num(c.vocab)} / ${tp}⌉ = ${num(vTp)}`, ok: !vocabWarn, warn: vocabWarn,
        msg: vocabWarn ? `last rank's checkpoint slice has ${num(lastRows)} rows, not ${num(vTp)}` : '' });
      const ok = checks.every((x) => x.ok || x.warn);
      return { checks, ok, qLocal, kvLocal, iLocal, imLocal, vTp, lastRows };
    }

    function params(c, tp, a) {
      // Parameter counts per rank, following the tensors each layer allocates
      const d = c.hd, H = c.hidden;
      const qkv = H * (a.qLocal + 2 * a.kvLocal) * d;
      const o = (c.hq * d / tp) * H;
      const norms = 2 * H + (c.qknorm ? 2 * d : 0);
      let mlp;
      if (c.experts > 0) mlp = H * c.experts + c.experts * (2 * a.imLocal * H) + c.experts * (H * a.imLocal);
      else mlp = H * 2 * a.iLocal + H * a.iLocal;
      const layer = qkv + o + norms + mlp;
      const embed = a.vTp * H;
      const head = c.tie ? 0 : a.vTp * H;
      const total = layer * c.layers + embed + head + H;
      // full (tp = 1) model
      const qkvF = H * (c.hq + 2 * c.hkv) * d, oF = c.hq * d * H;
      const mlpF = c.experts > 0 ? H * c.experts + c.experts * 3 * c.moeInter * H : 3 * H * c.inter;
      const full = (qkvF + oF + norms + mlpF) * c.layers + c.vocab * H * (c.tie ? 1 : 2) + H;
      return { layer, total, full, qkv, o, mlp, embed, head };
    }

    function draw(c, tp, r, a) {
      svg.innerHTML = '';
      const defs = S('defs', null, svg);
      const pat = S('pattern', { id: 'mt-hatch', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      S('line', { x1: 0, y1: 0, x2: 0, y2: 5, class: 'hatch-line' }, pat);
      const X0 = 172, W = 700, H = 22;
      let y = 18;
      const row = (label, sub) => {
        S('text', { x: 0, y: y + 15, class: 't-sm' }, svg, label);
        if (sub) S('text', { x: 0, y: y + 29, class: 't-sm muted' }, svg, sub);
      };
      const label = (x, w, text, sel) => { if (w >= text.length * 6.4 + 4) S('text', { x: x + w / 2, y: y + 15, class: 't-sm' + (sel ? ' on-sel' : ''), 'text-anchor': 'middle' }, svg, text); };
      const slices = (n, x0, width, pick, lab) => {
        for (let i = 0; i < n; i++) {
          const x = x0 + (width * i) / n, w = width / n;
          const sel = pick(i);
          S('rect', { x, y, width: w, height: H, class: sel ? 'mt-sel' : 'mt-slice' }, svg);
          label(x, w, lab ? lab(i) : `r${i}`, sel);
        }
      };

      // qkv_proj rows: q heads | k heads | v heads
      if (a.qLocal && a.kvLocal) {
        row('qkv_proj · rows', `${c.hq}q + ${c.hkv}k + ${c.hkv}v heads`);
        const nH = c.hq + 2 * c.hkv, u = W / nH;
        const qLo = r * a.qLocal, qHi = qLo + a.qLocal;
        const kvLo = c.hkv >= tp ? r * a.kvLocal : Math.floor((r * c.hkv) / tp);
        const kvHi = kvLo + a.kvLocal;
        for (let h = 0; h < nH; h++) {
          const x = X0 + h * u;
          let sel, cls;
          if (h < c.hq) { sel = h >= qLo && h < qHi; cls = sel ? 'mt-sel' : 'mt-slice'; }
          else { const kh = (h - c.hq) % c.hkv; sel = kh >= kvLo && kh < kvHi; cls = sel ? 'mt-sel' : (c.hkv < tp ? 'mt-rep' : 'mt-kv'); }
          S('rect', { x, y, width: u, height: H, class: cls }, svg);
        }
        [['q', 0, c.hq], ['k', c.hq, c.hkv], ['v', c.hq + c.hkv, c.hkv]].forEach(([t, s, n]) => {
          S('text', { x: X0 + (s + n / 2) * u, y: y - 4, class: 't-sm muted', 'text-anchor': 'middle' }, svg, t);
        });
        y += 44;
      }
      // o_proj columns
      row('o_proj · columns', `${num(c.hq * c.hd)} split ${tp} ways`);
      slices(tp, X0, W, (i) => i === r);
      y += 44;
      // MLP
      if (c.experts > 0) {
        row('gate (router)', 'LinearReplicated');
        S('rect', { x: X0, y, width: W, height: H, class: 'mt-full' }, svg);
        S('text', { x: X0 + W / 2, y: y + 15, class: 't-sm', 'text-anchor': 'middle' }, svg, `[${c.experts}, ${num(c.hidden)}] on every rank`);
        y += 44;
        row('experts.gate_up_proj', `[${c.experts}, 2·${num(c.moeInter)}/${tp}, H]`);
        slices(tp, X0, W / 2, (i) => i === r, (i) => `g${i}`);
        slices(tp, X0 + W / 2, W / 2, (i) => i === r, (i) => `u${i}`);
        y += 44;
        row('experts.down_proj', `[${c.experts}, H, ${num(c.moeInter)}/${tp}]`);
        slices(tp, X0, W, (i) => i === r);
        y += 44;
      } else {
        row('gate_up_proj · rows', `gate ${num(c.inter)} | up ${num(c.inter)}`);
        slices(tp, X0, W / 2, (i) => i === r, (i) => `g${i}`);
        slices(tp, X0 + W / 2, W / 2, (i) => i === r, (i) => `u${i}`);
        y += 44;
        row('down_proj · columns', `${num(c.inter)} split ${tp} ways`);
        slices(tp, X0, W, (i) => i === r);
        y += 44;
      }
      // embedding / lm_head rows
      row('embed_tokens · rows', `⌈${num(c.vocab)} / ${tp}⌉ per rank`);
      const unit = W / (a.vTp * tp);
      for (let i = 0; i < tp; i++) {
        const rows = i === tp - 1 ? a.lastRows : a.vTp;
        const x = X0 + i * a.vTp * unit, w = Math.max(rows, 0) * unit;
        S('rect', { x, y, width: Math.max(w, 1), height: H, class: i === r ? 'mt-sel' : 'mt-slice' }, svg);
        label(x, w, `r${i}`, i === r);
      }
      y += 44;
      row('lm_head · rows', c.tie ? 'tied to embed_tokens' : 'same vocab split');
      if (c.tie) {
        S('rect', { x: X0, y, width: W, height: H, class: 'mt-rep' }, svg);
        S('text', { x: X0 + W / 2, y: y + 15, class: 't-sm', 'text-anchor': 'middle' }, svg, 'no tensor of its own: reuses embed_tokens.weight');
      } else {
        for (let i = 0; i < tp; i++) {
          const rows = i === tp - 1 ? a.lastRows : a.vTp;
          const x = X0 + i * a.vTp * unit, w = Math.max(rows, 0) * unit;
          S('rect', { x, y, width: Math.max(w, 1), height: H, class: i === r ? 'mt-sel' : 'mt-slice' }, svg);
          label(x, w, `r${i}`, i === r);
        }
      }
      y += 36;
      svg.setAttribute('viewBox', `0 0 880 ${y}`);
    }

    function update() {
      syncRanks();
      const c = cfg(), tp = +el.tp.value, r = +el.rank.value;
      const a = analyze(c, tp);
      checksEl.innerHTML = a.checks.map((x) => {
        const cls = x.ok ? 'ok' : x.warn ? 'warn' : 'bad';
        const mk = x.ok ? '✓' : x.warn ? '!' : '✕';
        return `<li class="${cls}"><span class="mk">${mk}</span><span>${x.label}${x.msg ? `<br><span class="msg">${x.msg}</span>` : ''}</span></li>`;
      }).join('');
      const valid = a.checks.every((x) => x.ok || x.warn);
      if (!valid) {
        svg.innerHTML = '';
        svg.setAttribute('viewBox', '0 0 880 40');
        S('text', { x: 0, y: 24, class: 't-sm' }, svg, 'Model construction would stop at the failing assert above.');
        readouts.innerHTML = '';
        return;
      }
      draw(c, tp, r, a);
      const p = params(c, tp, a);
      const kvRep = c.hkv < tp ? tp / c.hkv : 1;
      const kvLo = c.hkv >= tp ? r * a.kvLocal : Math.floor((r * c.hkv) / tp);
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi(`rank ${r} weights (bf16)`, `rank ${r} 权重（bf16）`)}</span><span class="v">${gib(p.total * 2)}</span><span class="s">${bi(`${(100 * p.total / p.full).toFixed(1)}% of the full ${gib(p.full * 2)}`, `占完整模型 ${gib(p.full * 2)} 的 ${(100 * p.total / p.full).toFixed(1)}%`)}</span></div>
        <div class="readout"><span class="k">${bi('heads on this rank', '本 rank 的 head')}</span><span class="v">${a.qLocal} q · ${a.kvLocal} kv</span><span class="s">${kvRep > 1 ? bi(`kv head ${kvLo} is copied to ${kvRep} ranks`, `kv head ${kvLo} 被复制到 ${kvRep} 个 rank`) : bi(`kv heads ${kvLo}–${kvLo + a.kvLocal - 1}`, `kv head ${kvLo}–${kvLo + a.kvLocal - 1}`)}</span></div>
        <div class="readout"><span class="k">${bi('local qkv width', '本地 qkv 宽度')}</span><span class="v">${num((a.qLocal + 2 * a.kvLocal) * c.hd)}</span><span class="s">(${a.qLocal} + 2·${a.kvLocal}) × ${c.hd}</span></div>
        <div class="readout"><span class="k">${bi('per layer', '每层')}</span><span class="v">${bytes(p.layer * 2)}</span><span class="s">${bi(`MLP ${(100 * p.mlp / p.layer).toFixed(0)}%, attention ${(100 * (p.qkv + p.o) / p.layer).toFixed(0)}%`, `MLP 占 ${(100 * p.mlp / p.layer).toFixed(0)}%，attention 占 ${(100 * (p.qkv + p.o) / p.layer).toFixed(0)}%`)}</span></div>
        <div class="readout"><span class="k">${bi('vocab slice', '词表切片')}</span><span class="v">${num(r * a.vTp)}–${num(Math.min((r + 1) * a.vTp, c.vocab) - 1)}</span><span class="s">${bi('rows of embed_tokens', 'embed_tokens 的行')}</span></div>`;
    }

    el.preset.addEventListener('change', () => { const p = PRESETS[el.preset.value]; if (p) { load(p); } update(); });
    ['tp', 'rank'].forEach((k) => el[k].addEventListener('input', update));
    ['hidden', 'layers', 'hq', 'hkv', 'hd', 'inter', 'vocab', 'experts', 'moeInter', 'tie'].forEach((k) =>
      el[k].addEventListener('input', () => { el.preset.value = 'custom'; update(); }));
    load(PRESETS[el.preset.value] || PRESETS['qwen3-32b']);
    update();
  }

  // =====================================================================
  // 2. One decoder layer across TP ranks
  // =====================================================================
  function initLayer(host) {
    const svg = $('svg', host), desc = $('.ly-desc', host), readouts = $('.readouts', host);
    const tpSel = $('#ly-tp', host), kindSel = $('#ly-kind', host), tokSel = $('#ly-tokens', host);
    const playBtn = $('[data-act="play"]', host), stepBtn = $('[data-act="step"]', host), resetBtn = $('[data-act="reset"]', host);
    const DENSE = { name: 'Qwen3-32B', H: 5120, hq: 64, hkv: 8, d: 128, I: 25600, L: 64 };
    const MOE = { name: 'Qwen3-30B-A3B', H: 2048, hq: 32, hkv: 4, d: 128, E: 128, Im: 768, L: 48 };
    let step = -1, timer = null;

    function stages() {
      const tp = +tpSel.value, moe = kindSel.value === 'moe', m = moe ? MOE : DENSE;
      const q = m.hq / tp, kv = m.hkv >= tp ? m.hkv / tp : 1;
      const common = [
        { id: 'norm1', name: 'add+norm', shape: `[T, ${m.H}]`, kind: 'rep',
          en: '<code>fused_add_rmsnorm</code> adds the previous output to the residual and normalizes. Every rank holds the same full hidden state, so this runs redundantly on each.',
          zh: '<code>fused_add_rmsnorm</code> 把上一步输出加进残差再做归一化。每个 rank 持有同样完整的 hidden state，所以这一步在每个 rank 上重复执行。' },
        { id: 'qkv', name: 'qkv_proj', shape: `[T, ${(q + 2 * kv) * m.d}]`, kind: 'col',
          en: `Column parallel: each rank multiplies the full input by its own ${q} q heads and ${kv} kv head${kv > 1 ? 's' : ''}. No communication is needed because the input is replicated.`,
          zh: `列并行：每个 rank 用完整输入乘以自己的 ${q} 个 q head 和 ${kv} 个 kv head。输入是复制的，因此不需要通信。` },
        { id: 'attn', name: 'attention', shape: `[T, ${q * m.d}]`, kind: 'attn',
          en: 'Each rank runs attention over its own heads and reads only its slice of the KV cache. Heads are independent, so there is still no communication.',
          zh: '每个 rank 只对自己的 head 做 attention，只读自己那部分 KV cache。各 head 相互独立，所以仍然不需要通信。' },
        { id: 'o', name: 'o_proj', shape: `[T, ${m.H}] partial`, kind: 'row',
          en: 'Row parallel: each rank multiplies its head outputs by its slice of o_proj columns. Each result is a full-width partial sum.',
          zh: '行并行：每个 rank 用自己 head 的输出乘以 o_proj 对应的列切片，得到的是全宽的部分和。' },
        { id: 'ar1', name: 'all-reduce', shape: `${m.H}·T·2 B`, kind: 'sum',
          en: '<code>LinearOProj.forward</code> sums the partials across ranks with one all-reduce. Afterwards every rank holds the same full output again.',
          zh: '<code>LinearOProj.forward</code> 用一次 all-reduce 跨 rank 求和，之后每个 rank 又持有相同的完整输出。' },
        { id: 'norm2', name: 'add+norm', shape: `[T, ${m.H}]`, kind: 'rep',
          en: 'The second fused add + RMSNorm, again replicated.',
          zh: '第二个融合的 add + RMSNorm，同样在各 rank 上重复执行。' }
      ];
      if (!moe) {
        const il = m.I / tp;
        return { m, tp, moe, list: common.concat([
          { id: 'gu', name: 'gate_up', shape: `[T, ${2 * il}]`, kind: 'col',
            en: `Column parallel: the local weight is [gate slice | up slice], ${il} rows each, so <code>silu_and_mul</code> can pair them without talking to other ranks.`,
            zh: `列并行：本地权重是 [gate 切片 | up 切片]，各 ${il} 行，因此 <code>silu_and_mul</code> 不需要与其他 rank 通信就能配对。` },
          { id: 'act', name: 'silu·mul', shape: `[T, ${il}]`, kind: 'col',
            en: 'Elementwise activation on the local half-width slice.',
            zh: '在本地的半宽切片上做逐元素激活。' },
          { id: 'down', name: 'down_proj', shape: `[T, ${m.H}] partial`, kind: 'row',
            en: 'Row parallel again: each rank produces a full-width partial sum from its intermediate slice.',
            zh: '又是行并行：每个 rank 从自己的中间维切片算出全宽的部分和。' },
          { id: 'ar2', name: 'all-reduce', shape: `${m.H}·T·2 B`, kind: 'sum',
            en: '<code>LinearRowParallel.forward</code> all-reduces the partial sums. The layer ends with replicated activations, ready for the next layer.',
            zh: '<code>LinearRowParallel.forward</code> 对部分和做 all-reduce。本层结束时激活再次在各 rank 上一致，可以进入下一层。' }
        ]) };
      }
      const iml = m.Im / tp;
      return { m, tp, moe, list: common.concat([
        { id: 'router', name: 'router', shape: `[T, ${m.E}]`, kind: 'rep',
          en: `The router is a <code>LinearReplicated</code>: every rank computes the same logits over all ${m.E} experts.`,
          zh: `router 是 <code>LinearReplicated</code>：每个 rank 都对全部 ${m.E} 个专家算出同样的 logits。` },
        { id: 'moe', name: 'fused MoE', shape: `[T, ${m.H}] partial`, kind: 'row',
          en: `Every rank holds all ${m.E} experts, sliced to ${iml} intermediate columns. Routing, both GEMMs and the top-k sum run locally and produce a partial sum.`,
          zh: `每个 rank 都持有全部 ${m.E} 个专家，只是中间维切成 ${iml} 列。路由、两个 GEMM 和 top-k 求和都在本地完成，得到部分和。` },
        { id: 'ar2', name: 'all-reduce', shape: `${m.H}·T·2 B`, kind: 'sum',
          en: '<code>MoELayer.forward</code> all-reduces the partial sums, which is the only communication in the MoE block.',
          zh: '<code>MoELayer.forward</code> 对部分和做 all-reduce，这是 MoE 块里唯一的通信。' }
      ]) };
    }

    function geometry(st) {
      const n = st.list.length, X0 = 78, W = 880 - X0 - 4;
      const col = W / n, top = 58, laneH = 46;
      return { n, X0, col, top, laneH, h: top + st.tp * laneH + 12 };
    }

    function draw() {
      const st = stages(), g = geometry(st);
      svg.innerHTML = '';
      svg.setAttribute('viewBox', `0 0 880 ${g.h}`);
      st.list.forEach((s, i) => {
        const cx = g.X0 + g.col * i + g.col / 2;
        const cur = i === step;
        S('text', { x: cx, y: 16, class: 't-sm' + (cur ? '' : ' muted'), 'text-anchor': 'middle', 'font-weight': cur ? 600 : 400 }, svg, s.name);
        S('text', { x: cx, y: 32, class: 't-sm muted', 'text-anchor': 'middle' }, svg, s.shape.replace(' partial', ''));
        if (s.shape.includes('partial')) S('text', { x: cx, y: 46, class: 't-sm muted', 'text-anchor': 'middle' }, svg, 'partial');
        if (s.kind === 'sum') {
          const r = S('rect', { x: cx - g.col / 2 + 6, y: g.top, width: g.col - 12, height: st.tp * g.laneH - 8, rx: 4, class: 'mt-sum' + (cur ? ' mt-cur' : '') }, svg);
          S('text', { x: cx, y: g.top + (st.tp * g.laneH - 8) / 2 + 6, class: 't-lg', 'text-anchor': 'middle' }, svg, 'Σ');
          return r;
        }
        for (let k = 0; k < st.tp; k++) {
          const y = g.top + k * g.laneH;
          const cls = s.kind === 'rep' ? 'mt-rep-box' : s.kind === 'attn' ? 'mt-attn' : 'mt-gpu';
          S('rect', { x: cx - g.col / 2 + 6, y, width: g.col - 12, height: 30, rx: 3, class: cls + (cur ? ' mt-cur' : '') }, svg);
          const tag = s.kind === 'rep' ? 'same' : s.kind === 'col' ? `slice ${k}` : s.kind === 'row' ? `part ${k}` : `heads ${k}`;
          S('text', { x: cx, y: y + 19, class: 't-sm', 'text-anchor': 'middle' }, svg, tag);
        }
      });
      for (let k = 0; k < st.tp; k++) S('text', { x: 0, y: g.top + k * g.laneH + 19, class: 't-sm' }, svg, `rank ${k}`);
      desc.innerHTML = step < 0
        ? bi(`Press Play or Step to walk one ${st.moe ? 'MoE' : 'dense'} decoder layer across ${st.tp} ranks.`, `按“播放”或“单步”，看一个${st.moe ? ' MoE' : '稠密'} decoder 层如何在 ${st.tp} 个 rank 上执行。`)
        : bi(`<b>${st.list[step].name}.</b> ${st.list[step].en}`, `<b>${st.list[step].name}。</b>${st.list[step].zh}`);
      readout(st);
    }

    function readout(st) {
      const T = +tokSel.value, m = st.m;
      const arBytes = T * m.H * 2;
      const buf = Math.min(8192 * m.H * 2, 1073741824);
      const fits = arBytes <= buf;
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('all-reduces per layer', '每层 all-reduce')}</span><span class="v">2</span><span class="s">${bi(`after o_proj and after the ${st.moe ? 'MoE block' : 'MLP'}`, `o_proj 之后与${st.moe ? ' MoE 块' : ' MLP'}之后各一次`)}</span></div>
        <div class="readout"><span class="k">${bi('per forward', '每次前向')}</span><span class="v">${2 * m.L + 1} + 1</span><span class="s">${bi(`${2 * m.L} in ${m.L} layers, 1 in the embedding, plus 1 all-gather in lm_head`, `${m.L} 层共 ${2 * m.L} 次，embedding 1 次，另有 lm_head 的 1 次 all-gather`)}</span></div>
        <div class="readout"><span class="k">${bi('bytes per all-reduce', '每次 all-reduce 字节数')}</span><span class="v">${bytes(arBytes)}</span><span class="s">${num(T)} × ${num(m.H)} × 2 B</span></div>
        <div class="readout key"><span class="k">PyNCCL</span><span class="v">${fits ? bi('symmetric buffer', '对称 buffer') : bi('in place', '原地')}</span><span class="s">${bi(`buffer ${bytes(buf)} = 8192 × ${num(m.H)} × 2 B`, `buffer ${bytes(buf)} = 8192 × ${num(m.H)} × 2 B`)}</span></div>`;
    }

    async function animate(i) {
      const st = stages(), g = geometry(st), s = st.list[i];
      if (reduceMotion || !s) return;
      const cx = g.X0 + g.col * i + g.col / 2, px = cx - g.col;
      const dots = [];
      for (let k = 0; k < st.tp; k++) {
        const y = g.top + k * g.laneH + 15;
        const dot = S('circle', { cx: 0, cy: 0, r: 5, class: 'pkt' }, svg);
        dots.push(dot);
        if (s.kind === 'sum') {
          const mid = g.top + (st.tp * g.laneH - 8) / 2;
          dot.animate([
            { transform: `translate(${px}px, ${y}px)` },
            { transform: `translate(${cx}px, ${mid}px)`, offset: 0.5 },
            { transform: `translate(${cx + g.col / 2}px, ${y}px)` }
          ], { duration: 900, easing: 'ease-in-out', fill: 'forwards' });
        } else {
          dot.animate([
            { transform: `translate(${i === 0 ? cx - g.col / 2 : px}px, ${y}px)` },
            { transform: `translate(${cx}px, ${y}px)` }
          ], { duration: 500, easing: 'ease-out', fill: 'forwards' });
        }
      }
      await sleep(s.kind === 'sum' ? 950 : 550);
      dots.forEach((d) => d.remove());
    }

    function stop() { if (timer) { clearTimeout(timer); timer = null; } playBtn.innerHTML = bi('Play', '播放'); }
    async function go(i) { step = i; draw(); await animate(i); }
    function playFrom() {
      const n = stages().list.length;
      if (step >= n - 1) step = -1;
      playBtn.innerHTML = bi('Pause', '暂停');
      const tick = async () => {
        if (step >= n - 1) { stop(); return; }
        await go(step + 1);
        timer = setTimeout(tick, reduceMotion ? 900 : 350);
      };
      tick();
    }
    playBtn.addEventListener('click', () => { if (timer) stop(); else playFrom(); });
    stepBtn.addEventListener('click', () => { stop(); const n = stages().list.length; go(step >= n - 1 ? 0 : step + 1); });
    resetBtn.addEventListener('click', () => { stop(); step = -1; draw(); });
    [tpSel, kindSel].forEach((s) => s.addEventListener('input', () => { stop(); step = -1; draw(); }));
    tokSel.addEventListener('input', () => readout(stages()));
    step = 3;
    draw();
  }

  // =====================================================================
  // 3. moe_align_block_size
  // =====================================================================
  function initAlign(host) {
    const mSel = $('#al-m', host), kSel = $('#al-k', host), eSel = $('#al-e', host), bSel = $('#al-b', host);
    const topkEl = $('.al-topk', host), blocksEl = $('.al-blocks', host), readouts = $('.readouts', host), stage = $('.al-stage', host);
    const playBtn = $('[data-act="play"]', host), rerollBtn = $('[data-act="reroll"]', host), exampleBtn = $('[data-act="example"]', host);
    let ids = [[1, 2, 3], [0, 1, 3], [0, 2, 3], [0, 1, 2]];
    let run = 0;

    function reroll(seed) {
      const M = +mSel.value, K = +kSel.value, E = +eSel.value, rnd = mulberry32(seed);
      ids = Array.from({ length: M }, () => {
        const pool = Array.from({ length: E }, (_, i) => i);
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        return pool.slice(0, K);
      });
    }

    function model() {
      const M = ids.length, K = ids[0].length, E = +eSel.value, B = +bSel.value;
      const flat = ids.flat(), numel = flat.length;
      const blocks = [];
      const counts = Array(E).fill(0);
      for (let e = 0; e < E; e++) {
        const mine = [];
        flat.forEach((x, i) => { if (x === e) mine.push(i); });
        counts[e] = mine.length;
        const padded = alignUp(mine.length, B);
        for (let b = 0; b < padded / B; b++) blocks.push({ e, slots: Array.from({ length: B }, (_, j) => (mine[b * B + j] ?? null)) });
      }
      const post = blocks.length * B;
      return { M, K, E, B, flat, numel, blocks, counts, post, maxPadded: numel + (E + 1) * (B - 1) };
    }

    const tok = (e, text, sub) => `<span class="tok r${e}">${text}${sub != null ? `<span class="sub">${sub}</span>` : ''}</span>`;

    function render() {
      const md = model();
      topkEl.innerHTML = `<div class="al-row"><span class="lbl"></span>${Array.from({ length: md.K }, (_, k) => `<span style="width:2.6rem;text-align:center">k=${k}</span>`).join('')}</div>` +
        ids.map((row, t) => `<div class="al-row"><span class="lbl">t${t}</span>${row.map((e, k) => `<span class="al-cell" data-fi="${t * md.K + k}">${tok(e, 'e' + e)}<span class="fi">${t * md.K + k}</span></span>`).join('')}</div>`).join('');
      blocksEl.innerHTML = md.blocks.map((b, j) => `<div class="al-block" data-blk="${j}"><div class="bh"><span>block ${j}</span><span>expert ${b.e}</span></div><div class="bs">${
        b.slots.map((fi) => fi === null ? `<span class="al-slot pad" data-pad>${md.numel}</span>` : `<span class="al-slot" data-slot="${fi}">${tok(b.e, fi)}</span>`).join('')}</div></div>`).join('');
      const pads = md.post - md.numel;
      const realM = md.M <= md.E ? 16 : 64;
      readouts.innerHTML = `
        <div class="readout"><span class="k">${bi('routed rows', '路由后的行')}</span><span class="v">${md.numel}</span><span class="s">${md.M} tokens × top-${md.K}</span></div>
        <div class="readout key"><span class="k">num_tokens_post_padded</span><span class="v">${md.post}</span><span class="s">${bi(`${md.blocks.length} blocks × ${md.B}; ${pads} padding rows`, `${md.blocks.length} 个 block × ${md.B}；${pads} 行填充`)}</span></div>
        <div class="readout"><span class="k">${bi('allocated for sorted_ids', 'sorted_ids 分配长度')}</span><span class="v">${md.maxPadded}</span><span class="s">numel + (E + 1)·(B − 1)</span></div>
        <div class="readout"><span class="k">${bi('real BLOCK_SIZE_M', '实际 BLOCK_SIZE_M')}</span><span class="v">${realM}</span><span class="s">${bi(`M = ${md.M} ${md.M <= md.E ? '≤' : '>'} E = ${md.E}`, `M = ${md.M} ${md.M <= md.E ? '≤' : '>'} E = ${md.E}`)}</span></div>`;
      // hover links: a sorted slot points at its (token, k) cell
      $$('[data-slot]', blocksEl).forEach((s) => {
        const fi = +s.dataset.slot;
        const cell = $(`[data-fi="${fi}"]`, topkEl);
        const on = () => { s.classList.add('link'); cell && cell.classList.add('link'); stage.innerHTML = bi(`Row ${fi}: GEMM 1 reads token ${Math.floor(fi / md.K)} (= ${fi} // top_k) and writes cache row ${fi}.`, `第 ${fi} 行：GEMM 1 读取 token ${Math.floor(fi / md.K)}（= ${fi} // top_k），写入 cache 第 ${fi} 行。`); };
        const off = () => { s.classList.remove('link'); cell && cell.classList.remove('link'); };
        s.addEventListener('mouseenter', on); s.addEventListener('mouseleave', off);
        s.addEventListener('focus', on); s.addEventListener('blur', off);
        s.tabIndex = 0;
      });
      return md;
    }

    function relTo(elm, base) {
      const a = elm.getBoundingClientRect(), b = base.getBoundingClientRect();
      return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
    }

    async function play() {
      const my = ++run;
      const md = render();
      const slots = $$('[data-slot]', blocksEl);
      if (reduceMotion) { stage.innerHTML = bi('Sorted by expert, each block padded to the block size.', '按专家排序，每个 block 用填充补齐到 block 大小。'); return; }
      const wrap = host.querySelector('.al-grid');
      slots.forEach((s) => s.firstElementChild.style.visibility = 'hidden');
      $$('[data-pad]', blocksEl).forEach((p) => p.style.opacity = 0);
      stage.innerHTML = bi('Flatten topk_ids, then group the flat indices by expert.', '把 topk_ids 展平，再按专家对展平后的索引分组。');
      const order = [];
      md.blocks.forEach((b) => b.slots.forEach((fi) => { if (fi !== null) order.push(fi); }));
      await Promise.all(order.map((fi, n) => new Promise((resolve) => {
        const src = $(`[data-fi="${fi}"] .tok`, topkEl), dstSlot = $(`[data-slot="${fi}"]`, blocksEl);
        const a = relTo(src, wrap), b = relTo(dstSlot, wrap);
        const g = document.createElement('div');
        g.className = 'fly-ghost';
        g.innerHTML = dstSlot.innerHTML;
        g.firstElementChild.style.visibility = 'visible';
        g.firstElementChild.style.width = b.w + 'px';
        wrap.appendChild(g);
        const an = g.animate([
          { transform: `translate(${a.x}px, ${a.y}px)` },
          { transform: `translate(${(a.x + b.x) / 2}px, ${Math.min(a.y, b.y) - 24}px)`, offset: 0.5 },
          { transform: `translate(${b.x}px, ${b.y}px)` }
        ], { duration: 620, delay: n * 90, easing: 'cubic-bezier(.3,.65,.25,1)', fill: 'both' });
        an.finished.then(() => { g.remove(); if (my === run) dstSlot.firstElementChild.style.visibility = 'visible'; resolve(); }, () => { g.remove(); resolve(); });
      })));
      if (my !== run) return;
      $$('[data-pad]', blocksEl).forEach((p) => { p.style.transition = 'opacity .3s'; p.style.opacity = 1; });
      stage.innerHTML = bi(`Pad each expert up to a multiple of ${md.B} with the out-of-range id ${md.numel}. The kernels mask those rows.`, `每个专家用越界 id ${md.numel} 填充到 ${md.B} 的倍数，kernel 会屏蔽这些行。`);
      await sleep(900);
      for (let j = 0; j < md.blocks.length; j++) {
        if (my !== run) return;
        const blk = $(`[data-blk="${j}"]`, blocksEl);
        blk.classList.add('hot');
        stage.innerHTML = bi(`Block ${j}: one Triton program tile multiplies these ${md.B} rows by expert ${md.blocks[j].e}'s weights.`, `Block ${j}：一个 Triton 程序 tile 用专家 ${md.blocks[j].e} 的权重乘这 ${md.B} 行。`);
        await sleep(520);
        blk.classList.remove('hot');
      }
      stage.innerHTML = bi('Every block uses exactly one expert, so each GEMM tile loads one weight matrix.', '每个 block 恰好对应一个专家，因此每个 GEMM tile 只加载一个权重矩阵。');
    }

    function resetAndRender() { run++; render(); stage.innerHTML = bi('Hover a sorted row to see which token it reads. Play animates the sort.', '把鼠标移到排序后的行上，可看到它读取哪个 token。点“播放”看排序动画。'); }
    [mSel, kSel, eSel].forEach((s) => s.addEventListener('input', () => {
      if (+kSel.value > +eSel.value) kSel.value = eSel.value;
      reroll(Math.floor(Math.random() * 1e9)); resetAndRender();
    }));
    bSel.addEventListener('input', resetAndRender);
    rerollBtn.addEventListener('click', () => { reroll(Math.floor(Math.random() * 1e9)); resetAndRender(); });
    exampleBtn.addEventListener('click', () => {
      mSel.value = 4; kSel.value = 3; eSel.value = 4; bSel.value = 4;
      ids = [[1, 2, 3], [0, 1, 3], [0, 2, 3], [0, 1, 2]];
      resetAndRender();
    });
    playBtn.addEventListener('click', play);
    resetAndRender();
  }

  const sh = document.getElementById('shardmap'); if (sh) initShard(sh);
  const ly = document.getElementById('layerwalk'); if (ly) initLayer(ly);
  const al = document.getElementById('moealign'); if (al) initAlign(al);
})();
