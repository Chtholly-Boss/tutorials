// DeepEP chapter 02 widgets: pointer resolver (NCCLGin), QP explorer (get_qp_mode),
// NVLink barrier (phase/sign counters), and a TMA + mbarrier step-through.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const SHA = '8c1d13a89b8fd0ba09fc631bd6a29aef37b7602d';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const src = (path, a, b, label) => `<a class="src" href="https://github.com/deepseek-ai/DeepEP/blob/${SHA}/${path}#L${a}-L${b}">${label}</a>`;
  const HANDLE = 'deep_ep/include/deep_ep/comm/handle.cuh';

  function S(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function animateAlong(el, pts, duration, iterations) {
    if (reduceMotion || pts.length < 2) return;
    const seg = [0];
    for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = seg[seg.length - 1] || 1;
    el.animate(pts.map((p, i) => ({ transform: `translate(${p.x}px, ${p.y}px)`, offset: seg[i] / total })),
      { duration, iterations: iterations || 1, easing: 'linear', fill: 'both' });
  }

  // =====================================================================
  // 1. Pointer resolver: team + destination -> local / NVLink / NIC
  // =====================================================================
  function initResolver(host) {
    const f = (id) => $('#' + id, host);
    const nodesEl = f('pr-nodes'), gpnEl = f('pr-gpn'), srcEl = f('pr-src'), teamEl = f('pr-team'), dstEl = f('pr-dst'), opEl = f('pr-op');
    const svg = $('svg', host), out = $('.pr-out', host);

    function fill(sel, n, label, want) {
      sel.innerHTML = '';
      for (let i = 0; i < n; i++) { const o = document.createElement('option'); o.value = i; o.textContent = label(i); sel.appendChild(o); }
      sel.value = String(want < n ? want : 0);
    }
    function syncSelects(prefSrc, prefDst) {
      const N = +nodesEl.value, G = +gpnEl.value, team = teamEl.value;
      fill(srcEl, N * G, (i) => `rank ${i}`, prefSrc != null ? prefSrc : +srcEl.value);
      const n = team === 'world' ? N * G : team === 'lsa' ? G : N;
      fill(dstEl, n, (i) => team === 'world' ? `rank ${i}` : team === 'lsa' ? `LSA ${i}` : `rail ${i}`, prefDst != null ? prefDst : +dstEl.value);
    }

    function resolve() {
      const N = +nodesEl.value, G = +gpnEl.value, s = +srcEl.value, team = teamEl.value, d = +dstEl.value, op = opEl.value;
      const node = Math.floor(s / G), local = s % G;
      const world = team === 'world' ? d : team === 'lsa' ? node * G + d : d * G + local;
      let ptr;
      if (team === 'rail') ptr = d === node ? 'self' : null;
      else {
        const accessible = team === 'lsa' || (world >= node * G && world < (node + 1) * G);
        if (!accessible) ptr = null;
        else { const dnvl = team === 'lsa' ? d : d - node * G; ptr = dnvl === local ? 'self' : 'lsa'; }
      }
      const r = { N, G, s, node, local, team, d, op, world, ptr, path: 'none', instr: '', cite: '', note: '' };
      if (op === 'put_value') {
        r.cite = src(HANDLE, 227, 247, 'handle.cuh:227–247');
        if (ptr) { r.path = ptr === 'self' ? 'local' : 'nvlink'; r.instr = 'st.relaxed.sys.global'; }
        else if (team === 'lsa') { r.path = 'invalid'; }
        else { r.path = 'rdma'; r.instr = 'gin.putValue(…)'; }
      } else if (op === 'red') {
        r.cite = src(HANDLE, 94, 120, 'handle.cuh:94–120');
        if (ptr) { r.path = ptr === 'self' ? 'local' : 'nvlink'; r.instr = (team === 'rail' || ptr === 'self') ? 'red.release.gpu.global.add' : 'red.release.sys.global.add'; }
        else if (team === 'lsa') { r.path = 'invalid'; }
        else { r.path = 'rdma'; r.instr = 'gin.signal(ncclGin_VASignalAdd)'; r.note = bi('The Gin path only accepts 64-bit values.', 'Gin 路径只接受 64 位数值。'); }
      } else if (op === 'put') {
        r.cite = src(HANDLE, 200, 225, 'handle.cuh:200–225');
        if (team === 'lsa') { r.path = 'invalid'; r.note = bi('<code>put()</code> only compiles for the World and Rail teams.', '<code>put()</code> 只对 World 和 Rail team 生效。'); }
        else {
          r.path = 'rdma'; r.instr = 'gin.put(…) → NIC';
          if (ptr) r.note = bi('This destination is reachable by pointer, but <code>put()</code> still goes through the NIC. Kernels that want NVLink bulk copies call <code>get_sym_ptr</code> and issue TMA stores themselves.',
                               '该目标本可以用指针访问，但 <code>put()</code> 仍然走 NIC。需要 NVLink 批量拷贝的 kernel 会先调 <code>get_sym_ptr</code>，再自己发 TMA store。');
        }
      } else {
        r.cite = src('deep_ep/include/deep_ep/impls/ep/dispatch.cuh', 367, 389, 'dispatch.cuh:367–389');
        if (ptr) { r.path = ptr === 'self' ? 'local' : 'nvlink'; r.instr = 'cp.async.bulk.global.shared::cta (TMA store)'; }
        else { r.path = 'fallback'; r.note = bi('<code>get_sym_ptr</code> returns <code>nullptr</code>, so the kernel stages the slot in its send buffer and posts <code>gin.put</code> instead.', '<code>get_sym_ptr</code> 返回 <code>nullptr</code>，kernel 于是把槽先放进发送 buffer，再改发 <code>gin.put</code>。'); }
      }
      if (r.path === 'invalid' && !r.note) r.note = bi('An LSA-team call with no NVLink pointer hits <code>EP_DEVICE_ASSERT</code>; the LSA team has no NIC path.', 'LSA team 拿不到 NVLink 指针时会触发 <code>EP_DEVICE_ASSERT</code>：LSA team 没有 NIC 路径。');
      return r;
    }

    function draw(r) {
      const rowH = 84, H = 30 + r.N * rowH;
      svg.setAttribute('viewBox', `0 0 880 ${H}`);
      svg.innerHTML = '';
      const X = (g) => 70 + g * 58, Y = (n) => 18 + n * rowH;
      const cx = (w) => X(w % r.G) + 23, cy = (w) => Y(Math.floor(w / r.G)) + 17;
      const dstNode = Math.floor(r.world / r.G);
      // path first, boxes cover the inner segments
      let pts = null, cls = '';
      if (r.path === 'nvlink') {
        const y = Y(r.node);
        pts = [{ x: cx(r.s), y: y + 34 }, { x: cx(r.s), y: y + 52 }, { x: cx(r.world), y: y + 52 }, { x: cx(r.world), y: y + 34 }];
        cls = 'nvl';
      } else if (r.path === 'rdma') {
        const ys = Y(r.node), yd = Y(dstNode);
        pts = [
          { x: cx(r.s), y: ys + 34 }, { x: cx(r.s), y: ys + 52 }, { x: 635, y: ys + 52 }, { x: 635, y: ys + 34 },
          { x: 670, y: ys + 17 }, { x: 740, y: ys + 17 }, { x: 740, y: yd + 17 }, { x: 670, y: yd + 17 },
          { x: 635, y: yd + 34 }, { x: 635, y: yd + 52 }, { x: cx(r.world), y: yd + 52 }, { x: cx(r.world), y: yd + 34 }
        ];
        cls = 'rdma';
      }
      if (r.N > 1) {
        S('line', { x1: 740, y1: Y(0) + 17, x2: 740, y2: Y(r.N - 1) + 17, class: 'fabric' }, svg);
        S('text', { x: 752, y: Y(0) + 21, class: 't-sm muted' }, svg, 'RDMA fabric');
      }
      if (pts) S('polyline', { points: pts.map((p) => `${p.x},${p.y}`).join(' '), class: cls === 'nvl' ? 'ln-nvl' : 'ln-rdma' }, svg);
      for (let n = 0; n < r.N; n++) {
        const y = Y(n);
        S('text', { x: 0, y: y + 22, class: 't-sm muted' }, svg, `node ${n}`);
        for (let g = 0; g < r.G; g++) {
          const w = n * r.G + g, isSrc = w === r.s;
          S('rect', { x: X(g), y, width: 46, height: 34, rx: 3, class: isSrc ? 'box-hot' : 'box' }, svg);
          S('text', { x: X(g) + 23, y: y + 21, class: 't-sm' + (isSrc ? ' on-hot' : ''), 'text-anchor': 'middle' }, svg, `r${w}`);
        }
        S('rect', { x: 600, y, width: 70, height: 34, rx: 3, class: 'box-nic' }, svg);
        S('text', { x: 635, y: y + 21, class: 't-sm', 'text-anchor': 'middle' }, svg, 'NIC');
        if (r.N > 1) S('line', { x1: 670, y1: y + 17, x2: 740, y2: y + 17, class: 'fabric' }, svg);
      }
      if (r.path !== 'invalid') {
        if (r.world === r.s) S('circle', { cx: cx(r.s), cy: cy(r.s), r: 30, class: 'ring-local' }, svg);
        else S('rect', { x: X(r.world % r.G) - 4, y: Y(dstNode) - 4, width: 54, height: 42, rx: 5, class: 'ring-dst' }, svg);
      }
      if (pts) {
        const dot = S('circle', { cx: 0, cy: 0, r: 5, class: cls === 'nvl' ? 'dot-nvl' : 'dot-rdma' }, svg);
        if (reduceMotion) { dot.setAttribute('cx', pts[pts.length - 1].x); dot.setAttribute('cy', pts[pts.length - 1].y); }
        else animateAlong(dot, pts, cls === 'nvl' ? 900 : 1600, 3);
      }
    }

    function update() {
      const r = resolve();
      draw(r);
      const label = {
        local: bi('Local rank', '本 rank'), nvlink: '<span class="t-nvl">NVLink</span>', rdma: '<span class="t-rdma">RDMA via NIC</span>',
        fallback: bi('No pointer', '拿不到指针'), invalid: bi('Not allowed', '不允许')
      }[r.path];
      const sub = {
        local: bi('the pointer is returned unchanged', '指针原样返回'),
        nvlink: bi('<code>ncclGetLsaPointer(window, offset, peer)</code>', '<code>ncclGetLsaPointer(window, offset, peer)</code>'),
        rdma: bi('Gin posts the work request from the GPU', 'Gin 由 GPU 直接提交工作请求'),
        fallback: bi('fall back to Gin', '改走 Gin'), invalid: bi('device assert', '设备端断言')
      }[r.path];
      out.innerHTML = `
        <div class="readouts">
          <div class="readout key"><span class="k">${bi('Path', '路径')}</span><span class="v">${label}</span><span class="s">${sub}</span></div>
          <div class="readout"><span class="k">${bi('Destination', '目标')}</span><span class="v">rank ${r.world}</span><span class="s">${bi(`node ${Math.floor(r.world / r.G)}, local ${r.world % r.G}`, `节点 ${Math.floor(r.world / r.G)}，本地编号 ${r.world % r.G}`)}</span></div>
          <div class="readout"><span class="k">get_sym_ptr</span><span class="v">${r.ptr === 'self' ? 'ptr' : r.ptr === 'lsa' ? 'LSA ptr' : 'nullptr'}</span><span class="s">${src(HANDLE, 63, 92, 'handle.cuh:63–92')}</span></div>
          <div class="readout"><span class="k">${bi('Instruction', '指令')}</span><span class="v" style="font-size:.82rem">${r.instr || '—'}</span><span class="s">${r.cite}</span></div>
        </div>
        ${r.note ? `<p class="pr-note">${r.note}</p>` : ''}`;
    }

    [nodesEl, gpnEl].forEach((el) => el.addEventListener('input', () => { syncSelects(); update(); }));
    teamEl.addEventListener('input', () => { syncSelects(null, 0); update(); });
    [srcEl, dstEl, opEl].forEach((el) => el.addEventListener('input', update));
    syncSelects(3, 11);
    update();
  }

  // =====================================================================
  // 2. QP explorer: comm::get_qp_mode
  // =====================================================================
  function qpMode(SMs, QPs, chPerSM, withNotify, sm, ch, isNotify) {
    const grid = SMs === 1 ? 'CTA' : 'GPU';
    if (QPs === 1) return [0, grid];
    if (isNotify) return [0, 'CTA'];
    const start = withNotify ? 1 : 0, avail = QPs - start;
    if (SMs <= avail) {
      const n = Math.floor(avail / SMs) + (sm < avail % SMs ? 1 : 0);
      return [start + sm + (ch % n) * SMs, 'CTA'];
    }
    const g = sm * chPerSM + ch;
    return [start + (g % avail), grid];
  }

  function initQP(host) {
    const f = (id) => $('#' + id, host);
    const preset = f('qp-preset'), sms = f('qp-sms'), ch = f('qp-ch'), qps = f('qp-qps'), notify = f('qp-notify');
    const smsOut = f('qp-sms-out'), chOut = f('qp-ch-out'), qpsOut = f('qp-qps-out');
    const gridEl = $('.qp-grid', host), readouts = $('.readouts', host), hover = $('.qp-hover', host);
    const PRESETS = {
      ep8: { sms: 16, ch: 15, qps: 129, notify: true },
      ep8x2: { sms: 16, ch: 7, qps: 129, notify: true },
      direct: { sms: 16, ch: 15, qps: 9, notify: true },
      small: { sms: 3, ch: 5, qps: 10, notify: false }
    };
    let cells = [];

    function render() {
      const SMs = +sms.value, C = +ch.value, Q = +qps.value, withN = notify.checked;
      smsOut.textContent = SMs; chOut.textContent = C; qpsOut.textContent = Q;
      const cols = C + (withN ? 1 : 0);
      gridEl.style.gridTemplateColumns = `3.4rem repeat(${cols}, 1.9rem)`;
      let html = '<span></span>';
      if (withN) html += '<span class="h">N</span>';
      for (let c = 0; c < C; c++) html += `<span class="h">${c}</span>`;
      cells = [];
      const used = new Map();
      let mode = 'CTA';
      for (let s = 0; s < SMs; s++) {
        html += `<span class="rl">SM ${s}</span>`;
        if (withN) {
          const [q] = qpMode(SMs, Q, C, withN, s, 0, true);
          html += `<span class="qp-cell notify" data-qp="${q}" data-sm="${s}">${q}</span>`;
          used.set(q, (used.get(q) || 0) + 1);
        }
        for (let c = 0; c < C; c++) {
          const [q, m] = qpMode(SMs, Q, C, withN, s, c, false);
          mode = m;
          html += `<span class="qp-cell${m === 'GPU' ? ' shared' : ''}" data-qp="${q}" data-sm="${s}">${q}</span>`;
          used.set(q, (used.get(q) || 0) + 1);
        }
      }
      gridEl.innerHTML = html;
      const dataQPs = new Set();
      $$('.qp-cell:not(.notify)', gridEl).forEach((c) => dataQPs.add(c.dataset.qp));
      let maxShare = 0;
      used.forEach((v, k) => { if (dataQPs.has(String(k))) maxShare = Math.max(maxShare, v); });
      const perSM = SMs <= Q - (withN ? 1 : 0) ? Math.ceil((Q - (withN ? 1 : 0)) / SMs) : null;
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Sharing mode', '共享模式')}</span><span class="v">${mode === 'CTA' ? 'CTA' : 'GPU'}</span><span class="s">${mode === 'CTA' ? bi('each data QP stays inside one SM', '每个数据 QP 只在一个 SM 内使用') : bi('channels from different SMs share QPs', '不同 SM 的 channel 共享 QP')}</span></div>
        <div class="readout"><span class="k">${bi('Data QPs in use', '在用的数据 QP')}</span><span class="v">${dataQPs.size}</span><span class="s">${bi(`of ${Q - (withN ? 1 : 0)} available`, `可用 ${Q - (withN ? 1 : 0)} 个`)}</span></div>
        <div class="readout"><span class="k">${bi('Channels per busiest QP', '最忙 QP 上的 channel 数')}</span><span class="v">${maxShare}</span><span class="s">${perSM ? bi(`up to ${perSM} QPs per SM`, `每 SM 最多 ${perSM} 个 QP`) : bi('round-robin over all QPs', '在全部 QP 上轮转')}</span></div>`;
      hover.innerHTML = bi('Hover a cell to see every channel that shares its QP.', '鼠标悬停在格子上，可以看到共享同一 QP 的所有 channel。');
    }

    gridEl.addEventListener('mouseover', (e) => {
      const c = e.target.closest('.qp-cell');
      if (!c) return;
      const q = c.dataset.qp;
      const same = $$(`.qp-cell[data-qp="${q}"]`, gridEl);
      $$('.qp-cell.hl', gridEl).forEach((x) => x.classList.remove('hl'));
      same.forEach((x) => x.classList.add('hl'));
      const smsUsing = [...new Set(same.map((x) => x.dataset.sm))];
      hover.innerHTML = bi(`QP ${q}: ${same.length} channel${same.length > 1 ? 's' : ''} on SM ${smsUsing.join(', ')}`, `QP ${q}：SM ${smsUsing.join('、')} 上的 ${same.length} 个 channel`);
    });
    gridEl.addEventListener('mouseleave', () => { $$('.qp-cell.hl', gridEl).forEach((x) => x.classList.remove('hl')); });

    preset.addEventListener('change', () => {
      const p = PRESETS[preset.value];
      if (!p) return;
      sms.value = p.sms; ch.value = p.ch; qps.value = p.qps; notify.checked = p.notify;
      render();
    });
    [sms, ch, qps, notify].forEach((el) => el.addEventListener('input', () => { preset.value = 'custom'; render(); }));
    render();
  }

  // =====================================================================
  // 3. NVLink barrier: two slots, a phase bit and a sign bit
  // =====================================================================
  function initBarrier(host) {
    const R = 4;
    const grid = $('.bar-grid', host), log = $('.bar-log', host);
    const playBtn = $('[data-act="play"]', host), resetBtn = $('[data-act="reset"]', host);
    let st, timer = null, busy = false;

    function fresh() {
      return { counter: Array(R).fill(0), slot: [...Array(R)].map(() => [0, 0]), wait: Array(R).fill(null), passed: Array(R).fill(0) };
    }

    function build() {
      grid.innerHTML = '';
      for (let r = 0; r < R; r++) {
        const card = document.createElement('div');
        card.className = 'bar-card';
        card.dataset.rank = r;
        card.innerHTML = `
          <div class="rk-h"><b>rank ${r}</b><span class="tok r${r}" style="height:1.1rem;min-width:1.6rem">${'ABCD'[r]}</span></div>
          <div class="kv"><span>counter</span><span data-f="counter"></span><span>phase · sign</span><span data-f="ps"></span><span>${bi('passed', '已通过')}</span><span data-f="passed"></span></div>
          <div class="slotpair"><div class="slotbox" data-slot="${r}-0"><small>slot 0</small><span></span></div><div class="slotbox" data-slot="${r}-1"><small>slot 1</small><span></span></div></div>
          <div class="bar-status" data-f="status"></div>
          <button type="button" class="btn ghost" data-arrive="${r}">${bi('Arrive', '到达')}</button>`;
        grid.appendChild(card);
      }
    }

    function paint() {
      for (let r = 0; r < R; r++) {
        const card = grid.children[r];
        const c = st.counter[r], status = c & 3;
        card.querySelector('[data-f="counter"]').textContent = c;
        card.querySelector('[data-f="ps"]').textContent = `${status & 1} · ${status >> 1 ? '−1' : '+1'}`;
        card.querySelector('[data-f="passed"]').textContent = st.passed[r];
        for (let p = 0; p < 2; p++) {
          const box = card.querySelector(`[data-slot="${r}-${p}"]`);
          box.querySelector('span').textContent = st.slot[r][p];
          box.classList.toggle('active', !!st.wait[r] && st.wait[r].phase === p);
        }
        const w = st.wait[r];
        card.classList.toggle('wait', !!w);
        card.querySelector('[data-f="status"]').innerHTML = w
          ? bi(`waiting: slot ${w.phase} == ${w.target}`, `等待：slot ${w.phase} == ${w.target}`)
          : bi(`running · next barrier uses slot ${status & 1}, ${status >> 1 ? '−1' : '+1'}`, `运行中 · 下一次 barrier 用 slot ${status & 1}，${status >> 1 ? '−1' : '+1'}`);
        card.querySelector('[data-arrive]').disabled = !!w || busy;
      }
    }

    function check() {
      const done = [];
      for (let r = 0; r < R; r++) {
        const w = st.wait[r];
        if (w && st.slot[r][w.phase] === w.target) { st.wait[r] = null; st.passed[r]++; done.push(r); }
      }
      return done;
    }

    function fly(fromEl, toEl, html) {
      return new Promise((resolve) => {
        if (reduceMotion) { resolve(); return; }
        const g = grid.getBoundingClientRect(), a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
        const ghost = document.createElement('div');
        ghost.className = 'fly-ghost';
        ghost.innerHTML = html;
        grid.appendChild(ghost);
        const x0 = a.left - g.left + a.width / 2 - 14, y0 = a.top - g.top;
        const x1 = b.left - g.left + b.width / 2 - 14, y1 = b.top - g.top + b.height / 2 - 10;
        ghost.animate([
          { transform: `translate(${x0}px, ${y0}px)`, opacity: 0.3 },
          { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 30}px)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${x1}px, ${y1}px)`, opacity: 1 }
        ], { duration: 560, easing: 'cubic-bezier(.3,.65,.25,1)', fill: 'both' }).finished.then(() => { ghost.remove(); resolve(); });
      });
    }

    async function arrive(r, animate) {
      if (st.wait[r] || busy) return;
      const status = st.counter[r] & 3, phase = status & 1, sign = status >> 1, delta = sign ? -1 : 1;
      const target = sign ? 0 : R;
      st.counter[r]++;
      st.wait[r] = { phase, target };
      log.innerHTML = bi(`rank ${r} enters barrier #${st.passed[r] + 1}: adds ${delta > 0 ? '+1' : '−1'} to slot ${phase} on every rank, then waits for ${target}.`,
                         `rank ${r} 进入第 ${st.passed[r] + 1} 次 barrier：给所有 rank 的 slot ${phase} 加 ${delta > 0 ? '+1' : '−1'}，然后等它变成 ${target}。`);
      if (animate && !reduceMotion) {
        busy = true; paint();
        const from = grid.children[r].querySelector('[data-arrive]');
        await Promise.all([...Array(R).keys()].map((i) => fly(from, grid.querySelector(`[data-slot="${i}-${phase}"]`), `<span class="tok r${r}">${delta > 0 ? '+1' : '−1'}</span>`)));
        busy = false;
      }
      for (let i = 0; i < R; i++) st.slot[i][phase] += delta;
      const done = check();
      if (done.length) log.innerHTML += ' ' + bi(`Released: rank ${done.join(', ')}.`, `放行：rank ${done.join('、')}。`);
      paint();
    }

    function reset() {
      stop();
      st = fresh();
      // Resting state: ranks 0-2 already wait in barrier #1, rank 3 is late
      [0, 1, 2].forEach((r) => arrive(r, false));
      log.innerHTML = bi('Ranks 0–2 have arrived at barrier #1 and wait for slot 0 to reach 4. Press Arrive on rank 3.',
                         'rank 0–2 已到达第 1 次 barrier，正等待 slot 0 变成 4。点 rank 3 的“到达”。');
      paint();
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } playBtn.innerHTML = bi('▶ Random arrivals', '▶ 随机到达'); }

    grid.addEventListener('click', (e) => {
      const b = e.target.closest('[data-arrive]');
      if (b) arrive(+b.dataset.arrive, true);
    });
    playBtn.addEventListener('click', () => {
      if (timer) { stop(); return; }
      playBtn.innerHTML = bi('Pause', '暂停');
      timer = setInterval(() => {
        if (busy) return;
        const ready = [...Array(R).keys()].filter((r) => !st.wait[r]);
        if (!ready.length) return;
        arrive(ready[Math.floor(Math.random() * ready.length)], true);
      }, reduceMotion ? 700 : 900);
    });
    resetBtn.addEventListener('click', reset);
    build();
    reset();
  }

  // =====================================================================
  // 4. TMA + mbarrier step-through (one token of direct dispatch)
  // =====================================================================
  function initTMA(host) {
    const svg = $('svg', host), list = $('.steps', host), note = $('.step-note', host);
    const prevBtn = $('[data-act="prev"]', host), nextBtn = $('[data-act="next"]', host), playBtn = $('[data-act="play"]', host);
    const fenceBox = $('#tma-fence', host);
    const D = 'deep_ep/include/deep_ep/impls/ep/dispatch.cuh';

    // hidden: prev | free | loading | full ; meta: empty | generic | async ; peer: empty | full
    const STEPS = [
      { code: 'mbarrier.init … 1; fence.mbarrier_init', ln: [270, 274], s: { hidden: 'prev', meta: 'empty', phase: 0, pending: 1, tx: 0, inflight: 0, groups: 1, peer: 'empty', local: 0 },
        en: 'Before the loop, one lane initializes the mbarrier with an arrival count of 1. The previous token\'s TMA store (one bulk group) may still be reading this shared-memory slot.',
        zh: '进入循环前，一个 lane 以到达数 1 初始化 mbarrier。上一个 token 的 TMA store（一个 bulk group）可能还在读这个共享内存槽。' },
      { code: 'ptx::tma_store_wait();', ln: [283, 284], s: { hidden: 'free', meta: 'empty', phase: 0, pending: 1, tx: 0, inflight: 0, groups: 0, peer: 'empty', local: 0 },
        en: '<code>cp.async.bulk.wait_group 0</code> blocks until every committed bulk store has finished. Only then may the warp overwrite the slot.',
        zh: '<code>cp.async.bulk.wait_group 0</code> 阻塞到所有已提交的 bulk store 完成，warp 这时才能覆盖这个槽。' },
      { code: 'ptx::tma_load_1d(hidden, x + token, mbarrier, kNumHiddenBytes);', ln: [287, 290], s: { hidden: 'loading', meta: 'empty', phase: 0, pending: 1, tx: 0, inflight: 14336, groups: 0, peer: 'empty', local: 0 }, anim: 'load',
        en: 'An elected lane issues a 1D TMA load of the 14,336-byte hidden vector. The copy engine reports each landed byte to the mbarrier as a completed transaction; the warp keeps going.',
        zh: '选出的一个 lane 发起一次 1D TMA load，读入 14,336 字节的 hidden 向量。每落地一段字节，TMA 就向 mbarrier 报告一次完成的事务；warp 不等待，继续往下执行。' },
      { code: 'tma_buffer.get_topk_idx_ptr()[lane_idx] = …; weights[lane_idx] = …;', ln: [314, 323], s: { hidden: 'loading', meta: 'generic', phase: 0, pending: 1, tx: 0, inflight: 14336, groups: 0, peer: 'empty', local: 0 },
        en: 'Meanwhile the lanes write the top-k indices and weights into the slot\'s metadata with ordinary stores. Those writes belong to the generic proxy.',
        zh: '与此同时，各 lane 用普通 store 把 top-k 索引和权重写进槽的元数据区。这些写入属于 generic proxy。' },
      { code: '*src_token_global_idx = …; ptx::tma_store_fence();', ln: [327, 330], fence: true, s: { hidden: 'loading', meta: 'async', phase: 0, pending: 1, tx: 0, inflight: 14336, groups: 0, peer: 'empty', local: 0 },
        en: 'After the last metadata write, <code>fence.proxy.async.shared::cta</code> makes the generic writes visible to the async proxy, which is the one TMA stores read through.',
        zh: '最后一次元数据写入之后，<code>fence.proxy.async.shared::cta</code> 让这些 generic 写入对 async proxy 可见，而 TMA store 正是经 async proxy 读取的。' },
      { code: 'ptx::mbarrier_arrive_and_set_tx(mbarrier, kNumHiddenBytes);', ln: [352, 353], s: { hidden: 'loading', meta: 'async', phase: 0, pending: 0, tx: 14336, inflight: 14336, groups: 0, peer: 'empty', local: 0 },
        en: 'The elected lane arrives and raises the expected transaction count by 14,336. The one expected arrival is in; the phase now waits only for the bytes.',
        zh: '选出的 lane 执行 arrive，并把期望的事务字节数加上 14,336。唯一期望的到达已经完成，这个 phase 只差字节到齐。' },
      { code: '(hardware) complete_tx → phase 0 → 1', ln: [352, 356], s: { hidden: 'full', meta: 'async', phase: 1, pending: 1, tx: 0, inflight: 0, groups: 0, peer: 'empty', local: 0 }, flip: true,
        en: 'When the last byte lands the transaction count reaches zero with no pending arrivals, so the mbarrier completes phase 0, flips to phase 1 and reloads its pending count to 1 for the next token.',
        zh: '最后一个字节落地时事务计数归零，也没有未完成的到达，于是 mbarrier 完成 phase 0，翻转到 phase 1，并把待到达数重新装填为 1，供下一个 token 使用。' },
      { code: 'ptx::mbarrier_wait_and_flip_phase(mbarrier, phase);', ln: [354, 356], s: { hidden: 'full', meta: 'async', phase: 1, pending: 1, tx: 0, inflight: 0, groups: 0, peer: 'empty', local: 1 },
        en: '<code>mbarrier.try_wait.parity</code> with the warp\'s parity bit (0) now succeeds. The warp flips its own bit to 1, so the next token waits for phase 1.',
        zh: '用 warp 自己的奇偶位（0）执行 <code>mbarrier.try_wait.parity</code>，这次成功返回。warp 把自己的奇偶位翻成 1，下一个 token 就等待 phase 1。' },
      { code: 'ptx::tma_store_1d(peer_slot, tma_buffer, 14464); ptx::tma_store_commit();', ln: [367, 375], s: { hidden: 'full', meta: 'async', phase: 1, pending: 1, tx: 0, inflight: 0, groups: 1, peer: 'full', local: 1 }, anim: 'store',
        en: 'A TMA store copies the whole 14,464-byte slot (hidden plus metadata) to the peer\'s receive buffer through its NVLink pointer, and <code>commit_group</code> closes a bulk group. The next iteration starts at step 1 and waits for this group.',
        zh: '一次 TMA store 把整个 14,464 字节的槽（hidden 加元数据）经 NVLink 指针写进 peer 的接收 buffer，<code>commit_group</code> 封闭一个 bulk group。下一轮从第 1 步开始，等待的正是这个 group。' }
    ];
    let idx = 0, timer = null;

    list.innerHTML = STEPS.map((s, i) => `<li data-i="${i}"><span>${i}</span><code>${s.code.replace(/</g, '&lt;')}</code><span class="ln">${s.ln ? `L${s.ln[0]}` : ''}</span></li>`).join('');

    function drawState(k, animate) {
      const s = STEPS[k].s;
      const fenceOn = fenceBox.checked;
      const meta = (!fenceOn && s.meta === 'async') ? 'generic' : s.meta;
      svg.innerHTML = '';
      const defs = S('defs', null, svg);
      const pat = S('pattern', { id: 'tma-hatch', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      S('line', { x1: 0, y1: 0, x2: 0, y2: 5, class: 'hatch-line' }, pat);
      // HBM source
      S('rect', { x: 0, y: 70, width: 150, height: 60, rx: 4, class: 'box' }, svg);
      S('text', { x: 12, y: 94, class: 't-lg' }, svg, 'x[token]');
      S('text', { x: 12, y: 114, class: 't-sm muted' }, svg, 'HBM · 14,336 B');
      // TMA engine
      const tmaBusy = s.inflight > 0 || (STEPS[k].anim === 'store');
      S('rect', { x: 180, y: 8, width: 166, height: 34, rx: 4, class: tmaBusy ? 'box-busy' : 'box-soft' }, svg);
      S('text', { x: 263, y: 30, class: 't-sm', 'text-anchor': 'middle' }, svg, s.inflight ? `TMA · ${s.inflight.toLocaleString('en-US')} B in flight` : 'TMA engine');
      // SMEM slot
      S('rect', { x: 180, y: 62, width: 350, height: 90, rx: 4, class: 'box-soft' }, svg);
      S('text', { x: 192, y: 80, class: 't-sm muted' }, svg, 'shared-memory slot · 14,496 B');
      S('rect', { x: 192, y: 90, width: 230, height: 28, rx: 2, class: 'bar-' + (s.hidden === 'free' ? 'empty' : s.hidden) }, svg);
      S('text', { x: 307, y: 108, class: 't-sm', 'text-anchor': 'middle' }, svg, { prev: 'previous token (being stored)', free: 'hidden · free', loading: 'hidden · loading', full: 'hidden · 14,336 B' }[s.hidden]);
      S('rect', { x: 428, y: 90, width: 90, height: 28, rx: 2, class: 'bar-' + (meta === 'empty' ? 'empty' : meta) }, svg);
      S('text', { x: 473, y: 108, class: 't-sm', 'text-anchor': 'middle' }, svg, 'metadata');
      S('text', { x: 192, y: 142, class: 't-sm' + (meta === 'generic' ? '' : ' muted') }, svg,
        meta === 'empty' ? '' : meta === 'generic' ? 'metadata: generic proxy only' : 'metadata: visible to async proxy (TMA)');
      // mbarrier
      S('rect', { x: 560, y: 8, width: 150, height: 96, rx: 4, class: 'box' }, svg);
      S('text', { x: 572, y: 28, class: 't-sm muted' }, svg, 'mbarrier (SMEM)');
      S('text', { x: 572, y: 50, class: 't-sm' + (STEPS[k].flip ? ' flip' : '') }, svg, `phase ${s.phase}${STEPS[k].flip ? '  ← flipped' : ''}`);
      S('text', { x: 572, y: 70, class: 't-sm' }, svg, `pending arrivals ${s.pending}`);
      S('text', { x: 572, y: 90, class: 't-sm' }, svg, `expected tx ${s.tx.toLocaleString('en-US')} B`);
      S('text', { x: 560, y: 124, class: 't-sm muted' }, svg, `warp parity bit: ${s.local}`);
      // bulk groups
      S('rect', { x: 560, y: 134, width: 150, height: 34, rx: 4, class: s.groups ? 'box-busy' : 'box-soft' }, svg);
      S('text', { x: 635, y: 156, class: 't-sm', 'text-anchor': 'middle' }, svg, `bulk groups open: ${s.groups}`);
      // peer
      S('rect', { x: 740, y: 62, width: 140, height: 90, rx: 4, class: s.peer === 'full' ? 'box-nvl' : 'box-soft' }, svg);
      S('text', { x: 752, y: 84, class: 't-sm' }, svg, 'peer receive slot');
      S('text', { x: 752, y: 102, class: 't-sm muted' }, svg, 'over NVLink');
      if (s.peer === 'full') S('text', { x: 752, y: 130, class: 't-sm' }, svg, fenceOn ? 'hidden + metadata' : 'metadata may be stale');
      // static flows
      S('line', { x1: 150, y1: 100, x2: 190, y2: 104, class: 'guide' }, svg);
      S('line', { x1: 530, y1: 107, x2: 740, y2: 107, class: s.peer === 'full' ? 'ln-nvl' : 'guide' }, svg);
      if (animate && !reduceMotion) {
        if (STEPS[k].anim === 'load') {
          for (let i = 0; i < 3; i++) {
            const d = S('circle', { r: 4, class: 'dot-local' }, svg);
            d.animate([{ transform: 'translate(150px,100px)' }, { transform: 'translate(263px,42px)', offset: 0.45 }, { transform: 'translate(307px,104px)' }],
              { duration: 900, delay: i * 180, fill: 'both', easing: 'ease-in-out' });
          }
        } else if (STEPS[k].anim === 'store') {
          for (let i = 0; i < 3; i++) {
            const d = S('circle', { r: 4, class: 'dot-nvl' }, svg);
            d.animate([{ transform: 'translate(518px,104px)' }, { transform: 'translate(760px,107px)' }],
              { duration: 800, delay: i * 160, fill: 'both', easing: 'ease-in-out' });
          }
        }
      }
    }

    function go(k, animate) {
      idx = Math.max(0, Math.min(STEPS.length - 1, k));
      $$('li', list).forEach((li, i) => { li.classList.toggle('cur', i === idx); li.classList.toggle('done', i < idx); });
      const s = STEPS[idx];
      let text = bi(s.en, s.zh);
      if (!fenceBox.checked && idx >= 4) text += ' ' + bi('<b>With the fence removed</b>, nothing orders the metadata stores before the TMA store reads them, so the peer may receive stale metadata.',
                                                        '<b>去掉 fence 之后</b>，没有任何机制保证元数据写入先于 TMA store 的读取，peer 可能收到过期的元数据。');
      note.innerHTML = text + (s.ln ? ` <a class="src" href="https://github.com/deepseek-ai/DeepEP/blob/${SHA}/${D}#L${s.ln[0]}-L${s.ln[1]}">dispatch.cuh:${s.ln[0]}–${s.ln[1]}</a>` : '');
      drawState(idx, animate);
      prevBtn.disabled = idx === 0;
      nextBtn.disabled = idx === STEPS.length - 1;
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } playBtn.innerHTML = bi('▶ Play', '▶ 播放'); }

    prevBtn.addEventListener('click', () => { stop(); go(idx - 1, true); });
    nextBtn.addEventListener('click', () => { stop(); go(idx + 1, true); });
    playBtn.addEventListener('click', () => {
      if (timer) { stop(); return; }
      if (idx === STEPS.length - 1) go(0, false);
      playBtn.innerHTML = bi('Pause', '暂停');
      timer = setInterval(() => { if (idx >= STEPS.length - 1) { stop(); return; } go(idx + 1, true); }, 1700);
    });
    list.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) { stop(); go(+li.dataset.i, true); } });
    fenceBox.addEventListener('change', () => go(idx, false));
    go(4, false);
  }

  const pr = document.getElementById('resolver'); if (pr) initResolver(pr);
  const qp = document.getElementById('qpx'); if (qp) initQP(qp);
  const nb = document.getElementById('nvlbar'); if (nb) initBarrier(nb);
  const tm = document.getElementById('tma'); if (tm) initTMA(tm);
})();
