// ATREX chapter 03 widgets: NVFP4 block quantizer, scale-factor swizzle explorer,
// routing / expand / finalize animation, and a port of the SM120 dispatcher.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const alignUp = (x, a) => Math.ceil(x / a) * a;

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

  // =====================================================================
  // Number formats, as the kernels round them
  // =====================================================================
  const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);

  // Round a float to BF16 (round-to-nearest-even), the dtype of hidden_states.
  function toBf16(x) {
    f32[0] = x;
    const u = u32[0];
    if ((u & 0x7f800000) === 0x7f800000) return f32[0];
    const lsb = (u >>> 16) & 1;
    u32[0] = ((u + 0x7fff + lsb) & 0xffff0000) >>> 0;
    return f32[0];
  }

  // Positive E4M3 values for codes 0..126 (127 is NaN). Max finite = 448.
  const E4M3 = [];
  for (let c = 0; c < 127; c++) {
    const e = c >> 3, m = c & 7;
    E4M3.push(e === 0 ? (m / 8) * Math.pow(2, -6) : (1 + m / 8) * Math.pow(2, e - 7));
  }
  // __nv_fp8_e4m3(float): round to nearest even, saturate to 448.
  function toE4M3(x) {
    if (!(x > 0)) return { code: 0, value: 0 };
    if (x >= 448) return { code: 126, value: 448 };
    let lo = 0, hi = 126;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (E4M3[mid] <= x) lo = mid; else hi = mid; }
    const dl = x - E4M3[lo], dh = E4M3[hi] - x;
    const c = dl < dh ? lo : dh < dl ? hi : (lo % 2 === 0 ? lo : hi);
    return { code: c, value: E4M3[c] };
  }

  // cvt.rn.satfinite.e2m1x2.f32: nearest even, saturate at ±6. Returns a 4-bit code.
  const E2M1 = [0, 0.5, 1, 1.5, 2, 3, 4, 6];
  function toE2M1(x) {
    const s = x < 0 ? 8 : 0;
    const a = Math.abs(x);
    if (a >= 6) return s | 7;
    let lo = 0;
    while (lo < 7 && E2M1[lo + 1] <= a) lo++;
    if (lo === 7) return s | 7;
    const dl = a - E2M1[lo], dh = E2M1[lo + 1] - a;
    const c = dl < dh ? lo : dh < dl ? lo + 1 : (lo % 2 === 0 ? lo : lo + 1);
    return s | c;
  }
  const e2m1Value = (code) => (code & 8 ? -1 : 1) * E2M1[code & 7];

  // One 16-element NVFP4 block, following expand_input_rows.cu:84-113.
  function quantizeBlock(xs, gs) {
    const xb = xs.map(toBf16);
    const amax = xb.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    const sv = Math.fround(gs * Math.fround(amax / 6));
    const sf = toE4M3(sv);
    const oscale = amax !== 0 ? 1 / (sf.value / gs) : 0;
    const scaled = xb.map((x) => x * oscale);
    const codes = scaled.map(toE2M1);
    const deq = codes.map((c) => e2m1Value(c) * sf.value / gs);
    const err = deq.map((d, i) => d - xb[i]);
    const bytes = [];
    for (let j = 0; j < 8; j++) bytes.push((codes[2 * j + 1] << 4) | codes[2 * j]);
    const num = err.reduce((s, e) => s + e * e, 0), den = xb.reduce((s, x) => s + x * x, 0);
    return { xb, amax, sv, sf, oscale, scaled, codes, deq, err, bytes,
             maxErr: err.reduce((m, e) => Math.max(m, Math.abs(e)), 0),
             relRms: den > 0 ? Math.sqrt(num / den) : 0,
             lost: amax > 0 && sf.value === 0 };
  }

  function fmt(x, sig = 4) {
    if (!isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : 'NaN';
    if (x === 0) return '0';
    const a = Math.abs(x);
    const s = a >= 1e4 || a < 1e-3 ? x.toExponential(2) : x.toPrecision(sig);
    return s.replace('-', '−');
  }
  const hex = (v, w) => '0x' + v.toString(16).toUpperCase().padStart(w, '0');

  // =====================================================================
  // 1. NVFP4 block quantizer
  // =====================================================================
  function initQuant(host) {
    const presetSel = $('#q-preset', host), gsSel = $('#q-gs', host), gsNum = $('#q-gs-custom', host);
    const randBtn = $('[data-act="rand"]', host);
    const svg = $('svg', host), readouts = $('.readouts', host), table = $('.q-table', host), warn = $('.q-warn', host);
    let seed = 3, xs = [];

    function gaussian(rnd) {
      const u = Math.max(rnd(), 1e-12), v = rnd();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    function makeValues() {
      const rnd = mulberry32(seed);
      const p = presetSel.value;
      if (p === 'ramp') return Array.from({ length: 16 }, (_, i) => i / 10 - 0.75);
      const base = Array.from({ length: 16 }, () => gaussian(rnd));
      if (p === 'randn') return base.map((x) => x / 10);
      if (p === 'outlier') { const v = base.map((x) => x / 10); v[Math.floor(rnd() * 16)] = 2.5; return v; }
      return base.map((x) => x * 1e-4); // tiny
    }
    function globalScale(amax) {
      if (gsSel.value === 'one') return 1;
      if (gsSel.value === 'amax') return amax > 0 ? 448 * 6 / amax : 1;
      const v = parseFloat(gsNum.value);
      return v > 0 ? v : 1;
    }

    function drawLine(q) {
      svg.innerHTML = '';
      const X0 = 40, X1 = 840, lo = -6.6, hi = 6.6;
      const sx = (v) => X0 + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * (X1 - X0);
      S('text', { x: 0, y: 14, class: 't-sm muted' }, svg, 'x · oscale (dots)  →  nearest E2M1 code (diamonds), round-to-nearest-even, saturate at ±6');
      S('line', { x1: X0, y1: 112, x2: X1, y2: 112, class: 'axis' }, svg);
      E2M1.forEach((v) => {
        [v, -v].forEach((w, j) => {
          if (j === 1 && v === 0) return;
          S('line', { x1: sx(w), y1: 106, x2: sx(w), y2: 118, class: 'guide' }, svg);
          S('text', { x: sx(w), y: 134, class: 't-sm', 'text-anchor': 'middle' }, svg, String(w).replace('-', '−'));
        });
      });
      S('text', { x: X0, y: 156, class: 't-sm muted' }, svg, 'E2M1 grid: 0, 0.5, 1, 1.5, 2, 3, 4, 6 and negatives');
      q.scaled.forEach((v, i) => {
        const y0 = 34 + (i % 4) * 14;
        const x0 = isFinite(v) ? sx(v) : (v > 0 ? X1 : X0);
        const x1 = sx(e2m1Value(q.codes[i]));
        S('line', { x1: x0, y1: y0, x2: x1, y2: 106, class: 'ln-rdma', style: 'stroke-width:1;opacity:.55' }, svg);
        const d = S('path', { d: `M${x1},104 l5,8 l-5,8 l-5,-8 z`, class: 'fill-nvl' }, svg);
        const dot = S('circle', { cx: x0, cy: y0, r: 4.5, class: 'fill-ink' }, svg);
        dot.setAttribute('style', 'fill: var(--ink)');
        if (!reduceMotion) {
          d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 250 + i * 25, fill: 'both' });
          dot.animate([{ transform: 'translate(0,-10px)', opacity: 0 }, { transform: 'translate(0,0)', opacity: 1 }],
                      { duration: 260, delay: i * 25, fill: 'both', easing: 'ease-out' });
        }
      });
    }

    function update() {
      gsNum.disabled = gsSel.value !== 'custom';
      const amax0 = xs.map(toBf16).reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      const gs = globalScale(amax0);
      const q = quantizeBlock(xs, gs);
      drawLine(q);
      readouts.innerHTML = `
        <div class="readout"><span class="k">amax</span><span class="v">${fmt(q.amax)}</span><span class="s">${bi('largest |x| in the 16-value block', '块内 16 个值的最大绝对值')}</span></div>
        <div class="readout"><span class="k">global_scale</span><span class="v">${fmt(gs)}</span><span class="s">${bi('per-expert FP32 input', '每个专家一个 FP32 输入')}</span></div>
        <div class="readout key"><span class="k">${bi('block scale (E4M3)', '块缩放（E4M3）')}</span><span class="v">${hex(q.sf.code, 2)} = ${fmt(q.sf.value)}</span><span class="s">${bi(`round(gs · amax / 6) from ${fmt(q.sv)}`, `由 ${fmt(q.sv)} 舍入：gs · amax / 6`)}</span></div>
        <div class="readout"><span class="k">oscale</span><span class="v">${fmt(q.oscale)}</span><span class="s">1 / (SF / gs)</span></div>
        <div class="readout"><span class="k">${bi('packed bytes', '打包字节')}</span><span class="v" style="font-size:.82rem">${q.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}</span><span class="s">${bi('element 2j in the low nibble', '第 2j 个元素在低 4 位')}</span></div>
        <div class="readout key"><span class="k">${bi('error', '误差')}</span><span class="v">${fmt(q.relRms, 3)}</span><span class="s">${bi(`relative RMS · max |err| ${fmt(q.maxErr, 3)}`, `相对 RMS · 最大 |err| ${fmt(q.maxErr, 3)}`)}</span></div>`;
      const cells = (arr, f, hot) => arr.map((v, i) => `<td${hot && hot(i) ? ' class="hot"' : ''}>${f(v, i)}</td>`).join('');
      const worst = q.err.reduce((w, e, i) => (Math.abs(e) > Math.abs(q.err[w]) ? i : w), 0);
      table.innerHTML = `
        <thead><tr><th>i</th>${q.xb.map((_, i) => `<th>${i}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><td>x (BF16)</td>${cells(q.xb, (v) => fmt(v))}</tr>
          <tr><td>x · oscale</td>${cells(q.scaled, (v) => fmt(v, 3))}</tr>
          <tr><td>code</td>${cells(q.codes, (c) => c.toString(2).padStart(4, '0'))}</tr>
          <tr><td>E2M1</td>${cells(q.codes, (c) => fmt(e2m1Value(c)))}</tr>
          <tr><td>x̂</td>${cells(q.deq, (v) => fmt(v))}</tr>
          <tr><td>x̂ − x</td>${cells(q.err, (v) => fmt(v, 2), (i) => i === worst && q.maxErr > 0)}</tr>
        </tbody>`;
      warn.hidden = !q.lost;
    }

    presetSel.addEventListener('change', () => { xs = makeValues(); update(); });
    randBtn.addEventListener('click', () => { seed = Math.floor(Math.random() * 1e9); xs = makeValues(); update(); });
    gsSel.addEventListener('change', update);
    gsNum.addEventListener('input', update);
    xs = makeValues();
    update();
  }

  // =====================================================================
  // 2. Scale-factor swizzle (quantization_utils.cuh:241-261)
  // =====================================================================
  function initSfGrid(host) {
    const rowIn = $('#sf-row', host), rowOut = $('#sf-row-out', host);
    const kvIn = $('#sf-kv', host), kvOut = $('#sf-kv-out', host);
    const kSel = $('#sf-k', host);
    const svg = $('svg', host), formula = $('.sf-formula', host);

    function draw() {
      const K = +kSel.value;
      const kvCount = alignUp(K, 64) / 16;
      kvIn.max = kvCount - 1;
      if (+kvIn.value > kvCount - 1) kvIn.value = kvCount - 1;
      const r = +rowIn.value, kv = +kvIn.value;
      rowOut.textContent = r; kvOut.textContent = kv;
      const numKTiles = Math.ceil(kvCount / 4);
      const mTileStride = numKTiles * 512;
      const inner = (r % 32) * 16 + Math.floor((r % 128) / 32) * 4 + (kv % 4);
      const offset = Math.floor(r / 128) * mTileStride + Math.floor(kv / 4) * 512 + inner;
      const line = r % 32, word = line * 16 + Math.floor((r % 128) / 32) * 4;

      svg.innerHTML = '';
      const X0 = 64, CW = 16, CH = 10, Y0 = 34;
      ['rows 0–31', '32–63', '64–95', '96–127'].forEach((t, g) => {
        S('text', { x: X0 + g * 4 * CW + 2 * CW, y: 14, class: 't-sm muted', 'text-anchor': 'middle' }, svg, t);
      });
      [0, 1, 2, 3].forEach((g) => [0, 1, 2, 3].forEach((k) => {
        S('text', { x: X0 + (g * 4 + k) * CW + CW / 2, y: 28, class: 't-sm muted', 'text-anchor': 'middle', style: 'font-size:8px' }, svg, 'k' + k);
      }));
      for (let i = 0; i < 32; i++) {
        const y = Y0 + i * (CH + 1);
        if (i % 4 === 0) S('text', { x: X0 - 6, y: y + 8, class: 't-sm muted', 'text-anchor': 'end', style: 'font-size:9px' }, svg, `+${i * 16}`);
        for (let b = 0; b < 16; b++) {
          const off = i * 16 + b;
          let cls = 'box-soft';
          if (i === line) cls = 'seg-hidden';
          if (off >= word && off < word + 4) cls = 'seg-meta';
          const rect = S('rect', { x: X0 + b * CW, y, width: CW - 1, height: CH, class: cls }, svg);
          if (off === inner) rect.setAttribute('style', 'fill: var(--ink); stroke: var(--ink)');
        }
      }
      S('text', { x: X0, y: Y0 + 32 * (CH + 1) + 14, class: 't-sm muted' }, svg, '512-byte tile · 128 rows × 4 vectors');

      formula.innerHTML = `
        <div>K = ${K} → ${kvCount} ${bi('scale vectors per row', '个缩放向量/行')} (${bi('padded to a multiple of 64 elements', '按 64 元素对齐')})</div>
        <div>mTileStride = ⌈${kvCount}/4⌉ · 512 = ${mTileStride}</div>
        <div>offset = ⌊${r}/128⌋·${mTileStride} + ⌊${kv}/4⌋·512 + (${r} mod 32)·16 + ⌊(${r} mod 128)/32⌋·4 + ${kv} mod 4</div>
        <div>= <b>${offset}</b> &nbsp;(${bi('inner byte', '块内字节')} ${inner})</div>
        <div style="margin-top:.4rem">${bi(`Green: the 4 bytes a GEMM thread reads with one 32-bit shared load for row ${r}, which are the four scales of one 64-wide K atom.`,
                                            `绿色：GEMM 线程为第 ${r} 行用一次 32 位共享内存读取拿到的 4 个字节，正好是一个 64 宽 K atom 的四个缩放。`)}</div>
        <div>${bi('Blue: the 16-byte line shared by rows r, r+32, r+64, r+96.', '蓝色：第 r、r+32、r+64、r+96 行共享的 16 字节行。')}</div>`;
    }
    [rowIn, kvIn, kSel].forEach((el) => el.addEventListener('input', draw));
    draw();
  }

  // =====================================================================
  // 3. Routing sort → expand → tiles → finalize (toy: M=4, E=8, top-3)
  // =====================================================================
  function initRoute(host) {
    const M = 4, E = 8, K = 3;
    const grid = $('.rt-grid', host), statusEl = $('.sim-status', host);
    const stageBtns = $$('.stage-btn', host);
    const playBtn = $('[data-act="play"]', host), rerouteBtn = $('[data-act="reroute"]', host);
    const sentBox = $('#rt-sentinel', host);
    let seed = 21, model, stage = 1, run = 0;

    function build(s, sentinels) {
      const rnd = mulberry32(s);
      const ids = [], w = [];
      for (let t = 0; t < M; t++) {
        const pick = [];
        while (pick.length < K) { const e = Math.floor(rnd() * E); if (!pick.includes(e)) pick.push(e); }
        const raw = pick.map(() => 0.2 + rnd());
        const sum = raw.reduce((a, b) => a + b, 0);
        ids.push(pick); w.push(raw.map((x) => x / sum));
      }
      if (sentinels) { ids[1][2] = -1; ids[3][1] = -1; }
      // routing_sort (blocked path): per expert, tokens in increasing order; unpermuted row = k*M + t
      const rows = [], offset = [], unperm = {};
      for (let e = 0; e < E; e++) {
        offset.push(rows.length);
        for (let t = 0; t < M; t++) {
          const k = ids[t].indexOf(e);
          if (k >= 0) { unperm[k * M + t] = rows.length; rows.push({ t, k, e, u: k * M + t }); }
        }
      }
      offset.push(rows.length);
      const counts = offset.slice(1).map((o, e) => o - offset[e]);
      const sfStart = counts.map((_, e) => alignUp(offset[e] + e * 127, 128));
      const sfTotal = alignUp(M * K + E * 127, 128);
      return { ids, w, rows, offset, counts, unperm, sfStart, sfTotal };
    }

    const chip = (t, label, sub, extra) => `<span class="tok r${t}${extra || ''}">${label}${sub ? `<span class="sub">${sub}</span>` : ''}</span>`;

    function buildDOM() {
      const m = model;
      const colA = [0, 1, 2, 3].map((t) => `
        <div class="rt-row"><span data-tok="${t}">${chip(t, 't' + t)}</span>
          ${[0, 1, 2].map((k) => m.ids[t][k] < 0
            ? `<span class="rt-slot empty">${chip(t, '−1')}<span>k${k}</span></span>`
            : `<span class="rt-slot" data-slot="${t}-${k}">${chip(t, 'E' + m.ids[t][k])}<span>k${k} · ${m.w[t][k].toFixed(2)}</span></span>`).join('')}
        </div>`).join('');
      const colB = [...Array(E).keys()].map((e) => {
        const cells = m.rows.map((r, p) => ({ r, p })).filter(({ r }) => r.e === e)
          .map(({ r, p }) => `<span class="rt-cell"><span class="slot" data-p="${p}"></span><span class="pidx">p=${p} · u=${r.u}</span></span>`).join('');
        return `<div class="rt-exp"><span data-eoff="${e}">E${e}</span><div class="rt-bucket">${cells}</div></div>`;
      }).join('');
      grid.innerHTML = `
        <div class="rt-col">
          <div class="blk" data-b="1"><div class="blk-h"><span>topk_ids · topk_weights</span><span>M=${M}, top-${K}</span></div>${colA}</div>
        </div>
        <div class="rt-col">
          <div class="blk" data-b="2"><div class="blk-h"><span>${bi('permuted rows, grouped by expert', '按专家分组的置换行')}</span></div>${colB}
            <div class="psum" data-offsets></div></div>
        </div>
        <div class="rt-col">
          <div class="blk" data-b="3"><div class="blk-h"><span>fc1_act_sf ${bi('rows', '行')}</span><span>${m.sfTotal} ${bi('rows', '行')}</span></div>
            <div class="w-svg"><svg viewBox="0 0 300 70" role="img" aria-label="Scale-factor row space with one 128-row region per expert"></svg></div><div class="psum" data-sfnote></div></div>
          <div class="blk" data-b="4"><div class="blk-h"><span>${bi('GEMM1 tiles (128 rows)', 'GEMM1 tile（128 行）')}</span></div><div class="rt-tiles" data-tiles></div></div>
          <div class="blk" data-b="5"><div class="blk-h"><span>output = Σ<sub>k</sub> w · y</span></div>
            ${[0, 1, 2, 3].map((t) => `<div class="rt-out"><span data-out="${t}">${chip(t, 't' + t)}</span><span data-sum="${t}"></span></div>`).join('')}</div>
        </div>`;
    }

    const cell = (sel) => grid.querySelector(sel);

    const STATUS = {
      1: bi('<b>Input.</b> The router already ran: each token carries three expert ids and weights. A −1 slot means "no expert" and is skipped everywhere downstream.',
            '<b>输入。</b>router 已经运行过：每个 token 带三个专家 id 和权重。−1 表示“没有专家”，下游各处都会跳过它。'),
      2: bi('<b>routing_sort.</b> Rows are grouped by expert, and inside an expert they keep token order. Each row remembers its unpermuted id u = k·M + t, and <code>expert_first_token_offset</code> marks where each expert starts.',
            '<b>routing_sort。</b>行按专家分组，同一专家内保持 token 顺序。每行记住未置换编号 u = k·M + t，<code>expert_first_token_offset</code> 标出每个专家的起点。'),
      3: bi('<b>expand_input_rows.</b> Each permuted row is copied from its token and quantized to NVFP4. Its scale factors go into a per-expert region that starts on a 128-row boundary, so the GEMM can read whole 128-row scale tiles.',
            '<b>expand_input_rows。</b>每个置换行从对应 token 拷贝并量化为 NVFP4。其缩放因子写入按专家划分、从 128 行边界开始的区域，GEMM 因此可以整块读取 128 行的缩放 tile。'),
      4: bi('<b>GEMM1 tiles.</b> The v20 kernel gives every non-empty expert whole 128-row M-tiles. With a handful of rows per expert almost all of each tile is padding, which is why small batches use 16-row kernels.',
            '<b>GEMM1 tile。</b>v20 kernel 给每个非空专家分配整块 128 行的 M-tile。每个专家只有几行时，tile 几乎全是填充，所以小 batch 改用 16 行的 kernel。'),
      5: bi('<b>finalize.</b> For every token, the down-projection rows of its valid slots are looked up through u = k·M + t, scaled by the router weight and summed in FP32 into the BF16 output.',
            '<b>finalize。</b>对每个 token，通过 u = k·M + t 找到其有效槽位的 down 投影行，乘以 router 权重，在 FP32 中求和后写成 BF16 输出。')
    };

    function paint(st) {
      stage = st;
      const m = model;
      m.rows.forEach((r, p) => { cell(`[data-p="${p}"]`).innerHTML = st >= 2 ? chip(r.t, `t${r.t}`, 'k' + r.k) : ''; });
      for (let e = 0; e < E; e++) cell(`[data-eoff="${e}"]`).innerHTML = st >= 2 ? `E${e} <span style="color:var(--ink-2)">@${m.offset[e]}</span>` : `E${e}`;
      cell('[data-offsets]').innerHTML = st >= 2 ? `expert_first_token_offset = [${m.offset.join(', ')}]` : '&nbsp;';
      // SF regions
      const svg = cell('.rt-col svg');
      svg.innerHTML = '';
      if (st >= 3) {
        const W = 300, scale = W / m.sfTotal;
        for (let b = 0; b <= m.sfTotal; b += 128) S('line', { x1: b * scale, y1: 6, x2: b * scale, y2: 40, class: 'guide' }, svg);
        m.counts.forEach((c, e) => {
          if (c === 0) return;
          const x = m.sfStart[e] * scale;
          S('rect', { x, y: 10, width: Math.max(128 * scale - 1, 1), height: 26, class: 'seg-pad' }, svg);
          S('rect', { x, y: 10, width: Math.max(c * scale, 1.5), height: 26, class: 'seg-hidden' }, svg);
          S('text', { x: x + 2, y: 52, class: 't-sm', style: 'font-size:8.5px' }, svg, 'E' + e);
        });
        S('text', { x: 0, y: 66, class: 't-sm muted', style: 'font-size:8.5px' }, svg, `start(e) = align(offset[e] + 127·e, 128)`);
      }
      const used = m.rows.length;
      cell('[data-sfnote]').innerHTML = st >= 3 ? bi(`${used} data rows in ${m.sfTotal} scale rows; hatched = zero padding`, `${m.sfTotal} 行缩放空间中只有 ${used} 行数据；斜线为零填充`) : '&nbsp;';
      const nonEmpty = m.counts.map((c, e) => ({ c, e })).filter((x) => x.c > 0);
      cell('[data-tiles]').innerHTML = st >= 4
        ? nonEmpty.map(({ c, e }) => `<div>E${e}: ${c} / 128 ${bi('rows', '行')}<div class="bar"><i style="width:${(100 * c / 128).toFixed(1)}%"></i></div></div>`).join('') +
          `<div style="color:var(--ink-2)">${bi(`${nonEmpty.length} tiles · ${(100 * used / (nonEmpty.length * 128)).toFixed(1)}% of computed rows are real`, `${nonEmpty.length} 个 tile · 计算的行中只有 ${(100 * used / (nonEmpty.length * 128)).toFixed(1)}% 是真实数据`)}</div>`
        : '';
      for (let t = 0; t < M; t++) {
        const terms = [0, 1, 2].filter((k) => m.ids[t][k] >= 0).map((k) => `${m.w[t][k].toFixed(2)}·y<sub>${m.unperm[k * M + t]}</sub>`);
        cell(`[data-sum="${t}"]`).innerHTML = st >= 5 ? terms.join(' + ') : '';
      }
      $$('.blk', grid).forEach((b) => b.classList.toggle('idle', +b.dataset.b > st));
      stageBtns.forEach((b) => {
        const n = +b.dataset.stage;
        b.classList.toggle('done', n < st);
        if (n === st) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      statusEl.innerHTML = STATUS[st];
    }

    function rel(el) {
      const g = grid.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { x: r.left - g.left, y: r.top - g.top, w: r.width, h: r.height };
    }
    function fly(fromEl, toEl, html, delay, token) {
      return new Promise((resolve) => {
        if (reduceMotion || !fromEl || !toEl) { resolve(); return; }
        const a = rel(fromEl), b = rel(toEl);
        const g = document.createElement('div');
        g.className = 'fly-ghost';
        g.innerHTML = html;
        const c = g.firstElementChild;
        c.style.width = b.w + 'px'; c.style.height = b.h + 'px';
        grid.appendChild(g);
        const x0 = a.x + (a.w - b.w) / 2, y0 = a.y + (a.h - b.h) / 2;
        const mx = (x0 + b.x) / 2, my = Math.min(y0, b.y) - 22;
        const anim = g.animate([
          { transform: `translate(${x0}px, ${y0}px)`, opacity: 0.2 },
          { transform: `translate(${mx}px, ${my}px) scale(1.1)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${b.x}px, ${b.y}px)`, opacity: 1 }
        ], { duration: 620, delay, easing: 'cubic-bezier(.3,.65,.25,1)', fill: 'both' });
        anim.finished.then(() => {
          g.remove();
          if (token === run) { toEl.classList.remove('pending'); const t = toEl.querySelector('.tok') || toEl; t.classList.remove('pulse'); void t.offsetWidth; t.classList.add('pulse'); }
          resolve();
        }, () => { g.remove(); resolve(); });
      });
    }
    function abort() { run++; $$('.fly-ghost', grid).forEach((g) => g.remove()); }

    async function animateStage(n) {
      abort();
      const token = run;
      paint(n);
      if (reduceMotion) return;
      const flights = [];
      if (n === 2) {
        model.rows.forEach((r, p) => cell(`[data-p="${p}"]`).classList.add('pending'));
        model.rows.forEach((r, p) => flights.push(fly(cell(`[data-slot="${r.t}-${r.k}"]`), cell(`[data-p="${p}"]`), chip(r.t, `t${r.t}`, 'k' + r.k), p * 110, token)));
      } else if (n === 5) {
        for (let t = 0; t < M; t++) cell(`[data-sum="${t}"]`).classList.add('pending');
        model.rows.forEach((r, p) => flights.push(fly(cell(`[data-p="${p}"]`), cell(`[data-out="${r.t}"]`), chip(r.t, `y${p}`), p * 90, token)));
        await Promise.all(flights);
        if (token !== run) return;
        for (let t = 0; t < M; t++) cell(`[data-sum="${t}"]`).classList.remove('pending');
        return;
      }
      await Promise.all(flights);
    }

    async function playAll() {
      abort();
      let expected = run;
      const from = stage >= 5 ? 1 : stage;
      paint(from);
      for (let n = from + 1; n <= 5; n++) {
        await sleep(reduceMotion ? 250 : 600);
        if (run !== expected) return;
        await animateStage(n);
        expected += 1;
        if (run !== expected) return;
      }
    }

    stageBtns.forEach((b) => b.addEventListener('click', () => {
      const n = +b.dataset.stage;
      if (n === 1) { abort(); paint(1); } else animateStage(n);
    }));
    playBtn.addEventListener('click', playAll);
    rerouteBtn.addEventListener('click', () => { abort(); seed = Math.floor(Math.random() * 1e9); model = build(seed, sentBox.checked); buildDOM(); paint(1); });
    sentBox.addEventListener('change', () => { abort(); model = build(seed, sentBox.checked); buildDOM(); paint(Math.min(stage, 5)); });

    model = build(seed, sentBox.checked);
    buildDOM();
    paint(1);
  }

  // =====================================================================
  // 4. Dispatcher: a port of nvfp4_fused_moe() in nvfp4_fused_moe_sm120.py
  // =====================================================================
  const SHAPES = {
    e256i512: { E: 256, k: 8, H: 2048, I: 512 },
    e256i256: { E: 256, k: 8, H: 2048, I: 256 },
    e128i768: { E: 128, k: 8, H: 2048, I: 768 },
    e128i384: { E: 128, k: 8, H: 2048, I: 384 },
    e512k10: { E: 512, k: 10, H: 2560, I: 320 }
  };
  const M_STEPS = [1, 2, 4, 8, 16, 17, 32, 64, 128, 256, 511, 512, 513, 1024, 1025, 2047, 2048, 4096, 8192, 16384];

  function plan(sh, M, pipe, fp4In, extAlpha, preinit, gatherMin) {
    const v5 = pipe === 'hybrid_v5';
    const steps = [], why = [];
    let tileM = 128, tileName = 'v20 · 128 × 128 × 128';
    const add = (n, k, en, zh, tag) => steps.push({ n, k, en, zh, tag });
    if (!extAlpha) add('torch.mul, torch.reciprocal', 'py', 'gemm1_alpha, gemm2_alpha = 1 / (a_gs · w_gs)', 'gemm1_alpha、gemm2_alpha = 1 / (a_gs · w_gs)', 'torch');
    const expand = () => add('expand_input_rows', 'expand',
      fp4In ? 'copy NVFP4 rows, re-lay scales into 128×4 tiles' : 'gather BF16 rows, quantize to NVFP4',
      fp4In ? '拷贝 NVFP4 行，把缩放重排成 128×4 tile' : '收集 BF16 行并量化为 NVFP4', 'kernel');
    const e512 = sh.E === 512 && sh.k === 10 && sh.H === 2560 && sh.I === 320;
    if (e512) {
      const staged = M >= 1 && M <= 16, large = M > 1024;
      why.push(bi('Shape (512, 10, 2560, 320) takes the dedicated e512_topk10 branch; <code>pipeline</code> no longer matters.', '形状 (512, 10, 2560, 320) 走专用的 e512_topk10 分支，<code>pipeline</code> 不再起作用。'));
      if (!staged) add('fc2_act_sf.zero_()', 'py', 'clear GEMM2 activation scales', '清零 GEMM2 激活缩放', 'torch');
      const aEn = extAlpha ? '' : ', writes alphas', aZh = extAlpha ? '' : '、写 alpha';
      add('routing_sort', 'route', staged ? `one CTA × 512 threads, also zeroes output and counters${aEn}` : `3 kernels, output memset and counters folded in${aEn}`,
          staged ? `单个 CTA × 512 线程，同时清零输出与计数器${aZh}` : `3 个 kernel，顺带清零输出与计数器${aZh}`, 'kernel');
      why.push(staged ? bi('M ≤ 16: compact routing and shared scale-factor staging.', 'M ≤ 16：紧凑 routing 与共享缩放暂存。') : bi('M > 16: blocked routing, scale factors not staged.', 'M > 16：分块 routing，缩放不暂存。'));
      expand();
      if (M === 1) {
        add('e512_topk10_task29_forward_fused', 'gemm', 'split-K GEMM1 for one token → BF16', '单 token 的 split-K GEMM1 → BF16', 'kernel');
        add('e512_topk10_do_activation', 'act', 'SwiGLU on the BF16 rows, requantize', '对 BF16 行做 SwiGLU 并重新量化', 'kernel');
        tileM = 16; tileName = 'task29 · 16-row, split-K';
      } else if (!large) {
        add('e512_topk10_task29_forward_grouped_m16_fused_act', 'gemm', 'GEMM1 in 16-row tiles, SwiGLU + FP4 in the epilogue', '16 行 tile 的 GEMM1，epilogue 内完成 SwiGLU + FP4', 'kernel');
        tileM = 16; tileName = 'task29 · 16-row';
      } else {
        add('gemm_forward_v20_fused_act', 'gemm', 'tile-info kernel + 128×128×128 GEMM1 with fused SwiGLU', 'tile-info kernel + 融合 SwiGLU 的 128×128×128 GEMM1', 'kernel');
      }
      if (!large) {
        add('e512_topk10_task30_forward_fixed', 'final', 'GEMM2 rows in BF16, last CTA sums the 10 slots in fixed order (FP32)', 'GEMM2 行写成 BF16，最后到达的 CTA 按固定顺序（FP32）累加 10 个槽', 'kernel');
        why.push(bi('M ≤ 1024: fixed-order finalize inside GEMM2, so repeated runs give identical bits.', 'M ≤ 1024：GEMM2 内做固定顺序 finalize，多次运行结果逐位一致。'));
      } else {
        add('setup_fused_finalize_group_ptrs', 'py', 'per-expert pointer arrays for CUTLASS', '为 CUTLASS 准备每专家的指针数组', 'kernel');
        add('cutlass_gemm_fused_finalize_forward', 'final', 'CUTLASS 256×128×128, epilogue scatters with red.add', 'CUTLASS 256×128×128，epilogue 用 red.add 散射累加', 'kernel');
        why.push(bi('M > 1024: CUTLASS fused-finalize GEMM2; accumulation order can vary between runs.', 'M > 1024：CUTLASS fused-finalize GEMM2，累加顺序可能因运行而异。'));
      }
    } else {
      const phase6 = v5 && M >= 1 && M < gatherMin && M <= 512;
      const t30 = v5 && M >= 1 && M <= 512;
      const t13 = v5 && M >= gatherMin;
      if (!v5) why.push(bi('hybrid_v3: none of the small-M or gather kernels are enabled.', 'hybrid_v3：不启用任何小 M 或 gather kernel。'));
      if (t13) {
        add('routing_sort_with_scales', 'route', 'memset + count + prefix + scatter; row order inside an expert comes from atomics', 'memset + 计数 + 前缀和 + 散射；专家内行序由原子操作决定', 'kernel');
        add('task13_gemm1_gather_fused_act_forward', 'gemm', '80×256×128 tiles read rows straight from hidden_states, fused SwiGLU', '80×256×128 tile 直接从 hidden_states 读行，融合 SwiGLU', 'kernel');
        tileM = 80; tileName = 'task13 · 80 × 256 × 128';
        why.push(bi(`M ≥ ${gatherMin} (HYBRID_V5_GATHER_MIN_M): GEMM1 gathers its own rows, no expand kernel.`, `M ≥ ${gatherMin}（HYBRID_V5_GATHER_MIN_M）：GEMM1 自己收集行，不需要 expand kernel。`));
      } else {
        add('fc2_act_sf.zero_()', 'py', 'clear GEMM2 activation scales', '清零 GEMM2 激活缩放', 'torch');
        add('routing_sort', 'route', '3 kernels: block prefix, global prefix, merge', '3 个 kernel：块内前缀、全局前缀、合并', 'kernel');
        expand();
        if (phase6 && M === 1) {
          add('task29_gemm1_small_m_forward_fused', 'gemm', 'GEMM1 for one token → BF16', '单 token 的 GEMM1 → BF16', 'kernel');
          add('do_activation', 'act', 'SwiGLU + requantize', 'SwiGLU + 重新量化', 'kernel');
          tileM = 16; tileName = 'task29 · 16-row';
        } else if (phase6) {
          add('task29_gemm1_small_m_forward_grouped_m16_fused_act', 'gemm', 'GEMM1 in 16-row tiles with fused SwiGLU', '16 行 tile 的 GEMM1，融合 SwiGLU', 'kernel');
          tileM = 16; tileName = 'task29 · 16-row';
        } else if (M >= 2048) {
          add('gemm_forward_v20_fused_act', 'gemm', 'tile-info kernel + 128×128×128 GEMM1 with fused SwiGLU', 'tile-info kernel + 融合 SwiGLU 的 128×128×128 GEMM1', 'kernel');
        } else {
          add('gemm_forward_v20', 'gemm', 'tile-info kernel + 128×128×128 GEMM1 → BF16', 'tile-info kernel + 128×128×128 GEMM1 → BF16', 'kernel');
          add('do_activation', 'act', 'SwiGLU on interleaved columns + requantize', '对交错列做 SwiGLU 并重新量化', 'kernel');
        }
      }
      if (t30) {
        if (!preinit) add('output.zero_()', 'py', 'clear output before atomics', '原子累加前清零输出', 'torch');
        add('task30_gemm2_small_m_forward', 'final', '16-row GEMM2, BF16 atomicAdd straight into output', '16 行 GEMM2，BF16 atomicAdd 直接写入输出', 'kernel');
        why.push(bi('M ≤ 512 on hybrid_v5: GEMM2 and the top-k sum happen in one small-M kernel.', 'hybrid_v5 且 M ≤ 512：GEMM2 与 top-k 求和在一个小 M kernel 中完成。'));
      } else if (M >= 2048) {
        if (!preinit) add('output.zero_()', 'py', 'clear output before red.add', 'red.add 前清零输出', 'torch');
        add('setup_fused_finalize_group_ptrs', 'py', 'per-expert pointer arrays for CUTLASS', '为 CUTLASS 准备每专家的指针数组', 'kernel');
        add('cutlass_gemm_fused_finalize_forward', 'final', 'CUTLASS 256×128×128, epilogue scatters with red.add', 'CUTLASS 256×128×128，epilogue 用 red.add 散射累加', 'kernel');
        why.push(bi('M ≥ 2048: CUTLASS GEMM2 with the weighted scatter fused into its epilogue.', 'M ≥ 2048：CUTLASS GEMM2，加权散射融合在 epilogue 中。'));
      } else {
        add('setup_gemm2_group_ptrs', 'py', 'per-expert pointer arrays for CUTLASS', '为 CUTLASS 准备每专家的指针数组', 'kernel');
        add('cutlass_gemm_forward', 'gemm', 'CUTLASS 128×128×128 GEMM2 → BF16 rows', 'CUTLASS 128×128×128 GEMM2 → BF16 行', 'kernel');
        add('finalize_moe_routing', 'final', 'per token: Σ_k weight · row, FP32, slot order', '逐 token：Σ_k 权重 · 行，FP32，按槽位顺序', 'kernel');
        why.push(bi('Otherwise: plain grouped GEMM2 and a separate finalize kernel.', '其他情况：普通 grouped GEMM2 加独立的 finalize kernel。'));
      }
    }
    // Expected tile fill under uniform routing
    const rows = M * sh.k;
    const active = sh.E * (1 - Math.pow(1 - sh.k / sh.E, M));
    const perExpert = rows / active;
    const fill = perExpert / (Math.ceil(perExpert / tileM) * tileM);
    return { steps, why, rows, active, perExpert, fill, tileM, tileName };
  }

  function initPaths(host) {
    const shapeSel = $('#p-shape', host), mIn = $('#p-m', host), mOut = $('#p-m-out', host);
    const pipeSel = $('#p-pipe', host), inSel = $('#p-in', host), extBox = $('#p-ext', host), preBox = $('#p-pre', host);
    const flow = $('.path-flow', host), whyEl = $('.path-why', host), readouts = $('.readouts', host);
    mIn.max = M_STEPS.length - 1;

    function update(animate) {
      const sh = SHAPES[shapeSel.value];
      const M = M_STEPS[+mIn.value];
      mOut.textContent = M.toLocaleString('en-US');
      const r = plan(sh, M, pipeSel.value, inSel.value === 'nvfp4', extBox.checked, preBox.checked, 512);
      flow.innerHTML = r.steps.map((s) => `
        <div class="path-step k-${s.k}"><small>${s.tag === 'torch' ? 'torch' : 'kernel'}</small><b>${s.n}</b><span>${bi(s.en, s.zh)}</span></div>`).join('');
      whyEl.innerHTML = r.why.map((w) => `<li>${w}</li>`).join('');
      const kernels = r.steps.filter((s) => s.tag === 'kernel').length;
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('launch steps', '启动步骤')}</span><span class="v">${kernels}</span><span class="s">${bi('host calls into the extension', '对扩展模块的 host 调用')}</span></div>
        <div class="readout"><span class="k">${bi('expanded rows', '展开行数')}</span><span class="v">${r.rows.toLocaleString('en-US')}</span><span class="s">M · top-k</span></div>
        <div class="readout"><span class="k">${bi('active experts', '活跃专家')}</span><span class="v">${r.active.toFixed(1)}</span><span class="s">${bi(`of ${sh.E}, expected`, `共 ${sh.E} 个，期望值`)}</span></div>
        <div class="readout"><span class="k">${bi('rows / expert', '行 / 专家')}</span><span class="v">${r.perExpert.toFixed(1)}</span><span class="s">${bi('mean over active experts', '活跃专家的平均')}</span></div>
        <div class="readout key"><span class="k">${bi('GEMM1 M-tile fill', 'GEMM1 M-tile 填充率')}</span><span class="v">${(100 * r.fill).toFixed(1)}%</span><span class="s">${r.tileName}</span></div>`;
      if (animate && !reduceMotion) {
        $$('.path-step', flow).forEach((el, i) => el.animate(
          [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
          { duration: 260, delay: i * 55, fill: 'both', easing: 'ease-out' }));
      }
    }
    [shapeSel, mIn, pipeSel, inSel, extBox, preBox].forEach((el) => el.addEventListener('input', () => update(true)));
    update(false);
  }

  const q = document.getElementById('quant'); if (q) initQuant(q);
  const sf = document.getElementById('sfgrid'); if (sf) initSfGrid(sf);
  const rt = document.getElementById('route'); if (rt) initRoute(rt);
  const pp = document.getElementById('paths'); if (pp) initPaths(pp);
})();
