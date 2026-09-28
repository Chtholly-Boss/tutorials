// ATREX chapter 01 widgets: recurrence-vs-chunk playground, blockwise triangular inverse,
// SM103 warp-role handoffs, and the persistent tile scheduler.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmt = (x, d) => { const s = x.toFixed(d == null ? 2 : d); return /^-0\.0*$/.test(s) ? s.slice(1) : s; };
  const lang = () => (document.documentElement.dataset.lang === 'zh' ? 'zh' : 'en');

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
  function randn(rnd) {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const sigmoid = (x) => 1 / (1 + Math.exp(-x));
  const zeros = (r, c) => Array.from({ length: r }, () => Array(c).fill(0));
  const copyM = (m) => m.map((r) => r.slice());

  // ---------- tooltip ----------
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(html, ev) { tip.innerHTML = html; tip.hidden = false; moveTip(ev); }
  function moveTip(ev) {
    const pad = 14, r = tip.getBoundingClientRect();
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { tip.hidden = true; }

  // ---------- matrix heatmap ----------
  // rows: 2D array of numbers; mask(i, j) -> 'z' (structural zero) | 'na' | null
  function matHTML(rows, opts) {
    const o = opts || {};
    let max = o.max || 0;
    if (!max) rows.forEach((r, i) => r.forEach((x, j) => { if (!o.mask || !o.mask(i, j)) max = Math.max(max, Math.abs(x)); }));
    if (!max) max = 1;
    const cols = rows[0].length;
    let h = `<div class="mat${o.small ? ' small' : ''}" style="grid-template-columns:repeat(${cols}, auto)">`;
    rows.forEach((r, i) => r.forEach((x, j) => {
      const m = o.mask ? o.mask(i, j) : null;
      if (m === 'z') { h += '<span class="c z">0</span>'; return; }
      if (m === 'na') { h += '<span class="c na">·</span>'; return; }
      const p = Math.min(Math.abs(x) / max, 1) * 58;
      const hue = x >= 0 ? 'var(--pos)' : 'var(--neg)';
      h += `<span class="c" style="background:color-mix(in srgb, ${hue} ${p.toFixed(1)}%, var(--paper))">${fmt(x, o.digits)}</span>`;
    }));
    return h + '</div>';
  }
  const block = (cap, inner, key) => `<div class="mat-block" data-k="${key || ''}"><span class="mat-cap">${cap}</span>${inner}</div>`;

  // =====================================================================
  // 1. Playground: gated delta rule token by token vs the chunked form
  // =====================================================================
  function initPlay(host) {
    const D = 4, T = 8, C = 4, SCALE = 1 / Math.sqrt(D);
    const carryBox = $('#gp-carry', host);
    const recScalars = $('[data-slot="rec-scalars"]', host), recMats = $('[data-slot="rec-mats"]', host);
    const chkMats = $('[data-slot="chk-mats"]', host), chkSteps = $('[data-slot="chk-steps"]', host);
    const otab = $('[data-slot="otab"]', host), readouts = $('[data-slot="readouts"]', host);
    const chunkBtns = $$('[data-chunk]', host);
    let seed = 3, inp, rec, chk, t = 4, chunkSel = 0, shown = new Set([0]), run = 0;

    function makeInputs() {
      const rnd = mulberry32(seed);
      const unit = () => { const x = Array.from({ length: D }, () => randn(rnd)); const n = Math.sqrt(x.reduce((a, b) => a + b * b, 0) + 1e-6); return x.map((y) => y / n); };
      const q = [], k = [], v = [], alpha = [], beta = [];
      for (let i = 0; i < T; i++) {
        q.push(unit()); k.push(unit());
        v.push(Array.from({ length: D }, () => randn(rnd)));
        alpha.push(sigmoid(randn(rnd) + 1.0));   // exp(logsigmoid(x)) = sigmoid(x)
        beta.push(sigmoid(randn(rnd)));
      }
      const S0 = carryBox.checked ? Array.from({ length: D }, () => Array.from({ length: D }, () => 0.3 * randn(rnd))) : zeros(D, D);
      return { q, k, v, alpha, beta, S0 };
    }

    // The reference loop from test_chunk_gdn_sm103.py, with S stored as [K, V]
    function recurrent() {
      let Sm = copyM(inp.S0);
      const steps = [];
      for (let i = 0; i < T; i++) {
        const a = inp.alpha[i], b = inp.beta[i], k = inp.k[i], v = inp.v[i], q = inp.q[i];
        const decayed = Sm.map((r) => r.map((x) => a * x));
        const pred = Array.from({ length: D }, (_, j) => k.reduce((acc, kk, r) => acc + kk * decayed[r][j], 0));
        const delta = pred.map((p, j) => b * (v[j] - p));
        const write = k.map((kk) => delta.map((d) => kk * d));
        Sm = decayed.map((r, ri) => r.map((x, j) => x + write[ri][j]));
        const o = Array.from({ length: D }, (_, j) => SCALE * q.reduce((acc, qq, r) => acc + qq * Sm[r][j], 0));
        steps.push({ decayed, write, S: copyM(Sm), o, a, b });
      }
      return steps;
    }

    // The chunked form the kernels compute (one 4-token chunk at a time)
    function chunked() {
      let S0 = copyM(inp.S0);
      const out = [];
      for (let c = 0; c < T / C; c++) {
        const idx = Array.from({ length: C }, (_, i) => c * C + i);
        const g = []; let run = 1;
        idx.forEach((ti) => { run *= inp.alpha[ti]; g.push(run); });
        const Tm = g.map((gi, i) => g.map((gj, j) => (j <= i ? gi / gj : 0)));
        const dot = (x, y) => x.reduce((a, b, i) => a + b * y[i], 0);
        const K = idx.map((ti) => inp.k[ti]), Q = idx.map((ti) => inp.q[ti]), V = idx.map((ti) => inp.v[ti]), B = idx.map((ti) => inp.beta[ti]);
        const M = Tm.map((r, i) => r.map((tij, j) => (j < i ? B[i] * tij * dot(K[i], K[j]) : 0)));
        // (I + M)^-1 by forward substitution (unit lower triangular)
        const X = zeros(C, C);
        for (let i = 0; i < C; i++) {
          X[i][i] = 1;
          for (let j = 0; j < i; j++) { let s = 0; for (let l = j; l < i; l++) s += M[i][l] * X[l][j]; X[i][j] = -s; }
        }
        const S0tk = (vec) => Array.from({ length: D }, (_, j) => vec.reduce((a, x, r) => a + x * S0[r][j], 0));
        const W = idx.map((_, i) => { const ks = S0tk(K[i]); return V[i].map((vv, j) => B[i] * (vv - g[i] * ks[j])); });
        const U = X.map((r) => Array.from({ length: D }, (_, j) => r.reduce((a, x, l) => a + x * W[l][j], 0)));
        const O = idx.map((_, i) => {
          const qs = S0tk(Q[i]);
          return Array.from({ length: D }, (_, j) => {
            let s = g[i] * qs[j];
            for (let l = 0; l <= i; l++) s += Tm[i][l] * dot(Q[i], K[l]) * U[l][j];
            return SCALE * s;
          });
        });
        const gC = g[C - 1];
        const Sn = S0.map((r, ri) => r.map((x, j) => {
          let s = gC * x;
          for (let l = 0; l < C; l++) s += (gC / g[l]) * K[l][ri] * U[l][j];
          return s;
        }));
        out.push({ g, M, X, U, O, Sn });
        S0 = Sn;
      }
      return out;
    }

    const STEPS = [
      bi('γ = running gate product', 'γ = 门控累乘'),
      bi('M = β·T·(K Kᵀ), strictly lower', 'M = β·T·(K Kᵀ)，严格下三角'),
      bi('(I + M)⁻¹', '(I + M)⁻¹'),
      bi('U = (I+M)⁻¹ diag(β)(V − diag(γ)K S₀)', 'U = (I+M)⁻¹ diag(β)(V − diag(γ)K S₀)'),
      bi('O = s·(diag(γ)Q S₀ + (T ⊙ QKᵀ) U)', 'O = s·(diag(γ)Q S₀ + (T ⊙ QKᵀ) U)'),
      bi('S_C = γ_C S₀ + Kᵀ diag(γ_C/γ) U', 'S_C = γ_C S₀ + Kᵀ diag(γ_C/γ) U')
    ];

    function paintRec() {
      if (t === 0) {
        recScalars.innerHTML = bi('before token 0', '处理 token 0 之前');
        recMats.innerHTML = block(bi('<b>S₀</b> · K × V', '<b>S₀</b> · K × V'), matHTML(inp.S0));
      } else {
        const s = rec[t - 1];
        recScalars.innerHTML = `<span>${bi('token', 'token')} <b>${t - 1}</b></span><span>α = <b>${fmt(s.a, 3)}</b></span><span>β = <b>${fmt(s.b, 3)}</b></span>`;
        recMats.innerHTML =
          block(bi('<b>α·S</b> decayed', '<b>α·S</b> 衰减后'), matHTML(s.decayed), 'dec') +
          block(bi('<b>k·Δᵀ</b> write', '<b>k·Δᵀ</b> 写入'), matHTML(s.write), 'wr') +
          block(bi(`<b>S</b> after token ${t - 1}`, `token ${t - 1} 之后的 <b>S</b>`), matHTML(s.S), 'st');
        if (!reduceMotion) $$('.mat-block[data-k="st"] .c', recMats).forEach((c) => c.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 320 }));
      }
      $('[data-act="step"]', host).disabled = t >= T;
    }

    function paintChunk(revealAll) {
      const c = chk[chunkSel];
      const lower = (i, j) => (j >= i ? 'z' : null);
      const lowerIncl = (i, j) => (j > i ? 'z' : null);
      chkMats.innerHTML =
        block(bi('<b>γ</b> per token', '每个 token 的 <b>γ</b>'), matHTML([c.g], { digits: 3 }), 's0') +
        block('<b>M</b>', matHTML(c.M, { mask: lower }), 's1') +
        block('<b>(I + M)⁻¹</b>', matHTML(c.X, { mask: lowerIncl }), 's2') +
        block(bi('<b>U</b> corrected values', '<b>U</b> 修正后的 value'), matHTML(c.U), 's3') +
        block('<b>O</b>', matHTML(c.O), 's4') +
        block('<b>S<sub>C</sub></b>', matHTML(c.Sn), 's5');
      chunkBtns.forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.chunk === chunkSel)));
      chkSteps.innerHTML = STEPS.map((s, i) => `<li data-i="${i}" class="${revealAll ? 'done' : ''}">${i + 1} · ${s}</li>`).join('');
    }

    function paintTable() {
      let h = `<table><thead><tr><th class="num">t</th><th>${bi('o, token by token', 'o，逐 token')}</th><th>${bi('o, chunked', 'o，分块')}</th><th class="num">max |Δ|</th></tr></thead><tbody>`;
      for (let i = 0; i < T; i++) {
        const r = i < t ? rec[i].o : null;
        const cc = shown.has(Math.floor(i / C)) ? chk[Math.floor(i / C)].O[i % C] : null;
        const d = r && cc ? Math.max(...r.map((x, j) => Math.abs(x - cc[j]))) : null;
        const cls = r == null && cc == null ? 'empty' : (i === t - 1 ? 'fresh' : '');
        h += `<tr class="${cls}"><td class="num">${i}</td><td>${r ? r.map((x) => fmt(x, 3)).join('  ') : '—'}</td><td>${cc ? cc.map((x) => fmt(x, 3)).join('  ') : '—'}</td><td class="num">${d == null ? '—' : d.toExponential(1)}</td></tr>`;
      }
      otab.innerHTML = h + '</tbody></table>';
      let maxO = 0, n = 0;
      for (let i = 0; i < T; i++) {
        if (i < t && shown.has(Math.floor(i / C))) { n++; maxO = Math.max(maxO, ...rec[i].o.map((x, j) => Math.abs(x - chk[Math.floor(i / C)].O[i % C][j]))); }
      }
      const endBoth = t === T && shown.has(1);
      const maxS = endBoth ? Math.max(...rec[T - 1].S.flatMap((r, i) => r.map((x, j) => Math.abs(x - chk[1].Sn[i][j])))) : null;
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Tokens compared', '已对比 token')}</span><span class="v">${n} / ${T}</span><span class="s">${bi('step tokens and play chunks to add rows', '逐 token 推进并播放分块以增加对比行')}</span></div>
        <div class="readout key"><span class="k">max |o<sub>rec</sub> − o<sub>chunk</sub>|</span><span class="v">${n ? maxO.toExponential(1) : '—'}</span><span class="s">${bi('float64 in your browser', '浏览器中的 float64')}</span></div>
        <div class="readout"><span class="k">${bi('Final state difference', '最终状态差')}</span><span class="v">${maxS == null ? '—' : maxS.toExponential(1)}</span><span class="s">${bi('after token 7 and chunk 1', 'token 7 与 chunk 1 之后')}</span></div>`;
    }

    function rebuild() {
      inp = makeInputs(); rec = recurrent(); chk = chunked();
      paintRec(); paintChunk(true); paintTable();
    }

    async function playChunk() {
      const my = ++run;
      shown.add(chunkSel);
      paintChunk(false);
      paintTable();
      const blocks = $$('.mat-block', chkMats), items = $$('li', chkSteps);
      if (reduceMotion) { items.forEach((li) => li.classList.add('done')); return; }
      blocks.forEach((b) => b.classList.add('veil'));
      for (let i = 0; i < blocks.length; i++) {
        if (my !== run) return;
        blocks[i].classList.remove('veil'); blocks[i].classList.add('hot');
        items[i].classList.add('on');
        await sleep(700);
        blocks[i].classList.remove('hot');
        items[i].classList.remove('on'); items[i].classList.add('done');
      }
    }

    $('[data-act="step"]', host).addEventListener('click', () => { if (t < T) { t++; paintRec(); paintTable(); } });
    $('[data-act="run"]', host).addEventListener('click', () => { t = T; paintRec(); paintTable(); });
    $('[data-act="rewind"]', host).addEventListener('click', () => { t = 0; paintRec(); paintTable(); });
    $('[data-act="chunk-play"]', host).addEventListener('click', playChunk);
    $('[data-act="reseed"]', host).addEventListener('click', () => { seed = Math.floor(Math.random() * 1e9); run++; rebuild(); });
    carryBox.addEventListener('change', () => { run++; rebuild(); });
    chunkBtns.forEach((b) => b.addEventListener('click', () => { run++; chunkSel = +b.dataset.chunk; shown.add(chunkSel); paintChunk(true); paintTable(); }));
    rebuild();
  }

  // =====================================================================
  // 2. Hierarchical inverse of a 64x64 unit lower-triangular matrix
  // =====================================================================
  function initInverse(host) {
    const svg = $('svg', host), side = $('.inv-side', host), readouts = $('.readouts', host);
    const stageBtns = $$('[data-stage]', host), playBtn = $('[data-act="play"]', host);
    const B = 8, NB = 8, CELL = 22;
    let stage = 0, run = 0;

    // Owners of the work at each stage, per chunk (pair layout of _partial/_finish_pair_inverse)
    function activeBlocks(s, chunk) {
      const res = [];
      if (s === 1) for (let i = 0; i < NB; i++) res.push({ r: i, c: i, w: chunk * 2 + (i < 4 ? 0 : 1) });
      if (s === 2) for (let w = 0; w < 4; w++) res.push({ r: 2 * w + 1, c: 2 * w, w });
      if (s === 3) for (let t2 = 0; t2 < 2; t2++) for (const r of [4 * t2 + 2, 4 * t2 + 3]) for (const c of [4 * t2, 4 * t2 + 1]) res.push({ r, c, w: chunk * 2 + t2 });
      if (s === 4) for (let r = 4; r < 8; r++) for (let c = 0; c < 4; c++) res.push({ r, c, w: chunk * 2 + (r < 6 ? 0 : 1) });
      return res;
    }
    function doneBefore(s, r, c) {
      for (let k = 1; k < s; k++) if (activeBlocks(k, 0).some((b) => b.r === r && b.c === c)) return true;
      return false;
    }

    const TEXT = {
      0: bi('<b>Input.</b> The KK epilogue has written KK·T·β into shared memory for two chunks. Only the lower triangle matters: the diagonal is forced to 1 and everything above it is ignored.',
            '<b>输入。</b>KK epilogue 已把两个 chunk 的 KK·T·β 写入共享内存。只有下三角有意义：对角线被强制为 1，其上方全部忽略。'),
      1: bi('<b>Stage 1 · 8×8 diagonal blocks.</b> Gauss–Jordan in registers: 8 threads per block, one row each, 7 pivot steps with warp shuffles and no block barrier. Warps 0–1 take chunk 0, warps 2–3 chunk 1.',
            '<b>阶段 1 · 8×8 对角块。</b>在寄存器中做 Gauss–Jordan：每块 8 个线程、每线程一行，7 步主元消去用 warp shuffle，不需要 block 级 barrier。warp 0–1 负责 chunk 0，warp 2–3 负责 chunk 1。'),
      2: bi('<b>Stage 2 · 16×16.</b> Each warp fixes the bottom-left 8×8 of its 16×16 diagonal tile, C ← −D⁻¹·C·A⁻¹, with warp mma m16n8k8. Warp <i>w</i> handles tile <i>w</i> in both chunks.',
            '<b>阶段 2 · 16×16。</b>每个 warp 用 warp mma m16n8k8 修正其 16×16 对角 tile 左下角的 8×8 块：C ← −D⁻¹·C·A⁻¹。warp <i>w</i> 在两个 chunk 中都处理 tile <i>w</i>。'),
      3: bi('<b>Stage 3 · 32×32.</b> Same update on the bottom-left 16×16 of each 32×32 diagonal tile, with mma m16n8k16. Warps 0–1 work on chunk 0, warps 2–3 on chunk 1.',
            '<b>阶段 3 · 32×32。</b>对每个 32×32 对角 tile 的左下 16×16 做同样的更新，使用 mma m16n8k16。warp 0–1 处理 chunk 0，warp 2–3 处理 chunk 1。'),
      4: bi('<b>Stage 4 · 64×64.</b> The bottom-left 32×32, two warps per chunk, each a 16×32 slice. Afterwards every column is scaled by β<sub>j</sub> and the result Â is published to the MMA warp.',
            '<b>阶段 4 · 64×64。</b>左下 32×32，每个 chunk 两个 warp，各算一个 16×32 条带。随后每一列乘以 β<sub>j</sub>，得到的 Â 发布给 MMA warp。')
    };

    function draw() {
      svg.innerHTML = '';
      [0, 1].forEach((chunk) => {
        const x0 = 30 + chunk * 250, y0 = 34;
        S('text', { x: x0, y: 20, class: 't-sm muted' }, svg, `chunk ${chunk} · 64 × 64 (8 × 8 blocks)`);
        const act = stage ? activeBlocks(stage, chunk) : [];
        for (let r = 0; r < NB; r++) for (let c = 0; c < NB; c++) {
          const x = x0 + c * CELL, y = y0 + r * CELL;
          if (c > r) { S('rect', { x: x + 1, y: y + 1, width: CELL - 2, height: CELL - 2, class: 'blk-zero' }, svg); continue; }
          const a = act.find((b) => b.r === r && b.c === c);
          const cls = a ? 'blk-active' : (doneBefore(stage, r, c) ? 'blk-done' : 'blk-empty');
          S('rect', { x: x + 1, y: y + 1, width: CELL - 2, height: CELL - 2, rx: 2, class: cls }, svg);
          if (a) S('text', { x: x + CELL / 2, y: y + CELL / 2 + 3.5, class: 't-sm on-active', 'text-anchor': 'middle' }, svg, 'w' + a.w);
        }
        S('line', { x1: x0, y1: y0 + NB * CELL + 1, x2: x0 + NB * CELL, y2: y0 + NB * CELL + 1, class: 'grid' }, svg);
      });
      // legend
      const lx = 530;
      [['blk-empty', 'not solved yet'], ['blk-done', 'solved in an earlier stage'], ['blk-active', 'solved now (label = warp)']].forEach(([c, t2], i) => {
        S('rect', { x: lx, y: 40 + i * 24, width: 16, height: 16, rx: 2, class: c }, svg);
        S('text', { x: lx + 24, y: 52 + i * 24, class: 't-sm' }, svg, t2);
      });
      S('text', { x: lx, y: 136, class: 't-sm muted' }, svg, 'upper triangle: never read');
      S('text', { x: lx, y: 170, class: 't-sm' }, svg, stage === 0 ? 'I + M as written by the epilogue' : ['', '8 × 8 Gauss–Jordan', 'C ← −D⁻¹ C A⁻¹  (m16n8k8)', 'C ← −D⁻¹ C A⁻¹  (m16n8k16)', 'C ← −D⁻¹ C A⁻¹, then × β'][stage]);
      S('text', { x: lx, y: 190, class: 't-sm muted' }, svg, `solved diagonal size: ${stage === 0 ? 1 : [0, 8, 16, 32, 64][stage]}`);
      side.innerHTML = TEXT[stage];
      stageBtns.forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.stage === stage)));
    }

    // Numeric check: the four-stage algorithm equals forward substitution (float64)
    function check() {
      const rnd = mulberry32(99), N = 64, DK = 32;
      const unit = () => { const x = Array.from({ length: DK }, () => randn(rnd)); const n = Math.hypot(...x); return x.map((y) => y / n); };
      const K = Array.from({ length: N }, unit);
      const beta = Array.from({ length: N }, () => sigmoid(randn(rnd)));
      const lg = []; let acc = 0;
      for (let i = 0; i < N; i++) { acc += Math.log2(sigmoid(randn(rnd) + 3)); lg.push(acc); }
      const M = zeros(N, N);
      for (let i = 0; i < N; i++) for (let j = 0; j < i; j++) M[i][j] = beta[i] * Math.pow(2, lg[i] - lg[j]) * K[i].reduce((a, x, l) => a + x * K[j][l], 0);
      // reference
      const R = zeros(N, N);
      for (let i = 0; i < N; i++) { R[i][i] = 1; for (let j = 0; j < i; j++) { let s = 0; for (let l = j; l < i; l++) s += M[i][l] * R[l][j]; R[i][j] = -s; } }
      // hierarchical
      const X = zeros(N, N);
      for (let b0 = 0; b0 < N; b0 += 8) for (let i = 0; i < 8; i++) {
        X[b0 + i][b0 + i] = 1;
        for (let j = 0; j < i; j++) { let s = 0; for (let l = j; l < i; l++) s += M[b0 + i][b0 + l] * X[b0 + l][b0 + j]; X[b0 + i][b0 + j] = -s; }
      }
      for (const n of [16, 32, 64]) for (let t0 = 0; t0 < N; t0 += n) {
        const h = n / 2, a0 = t0, d0 = t0 + h;
        const CA = zeros(h, h);
        for (let i = 0; i < h; i++) for (let j = 0; j < h; j++) { let s = 0; for (let l = 0; l < h; l++) s += M[d0 + i][a0 + l] * X[a0 + l][a0 + j]; CA[i][j] = s; }
        for (let i = 0; i < h; i++) for (let j = 0; j < h; j++) { let s = 0; for (let l = 0; l < h; l++) s += X[d0 + i][d0 + l] * CA[l][j]; X[d0 + i][a0 + j] = -s; }
      }
      let err = 0, big = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j <= i; j++) { err = Math.max(err, Math.abs(X[i][j] - R[i][j])); if (j < i) big = Math.max(big, Math.abs(R[i][j])); }
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Four stages vs forward substitution', '四阶段 vs 前代')}</span><span class="v">${err.toExponential(1)}</span><span class="s">${bi('max |Δ| on a 64×64 system, float64', '64×64 方程组上的最大 |Δ|，float64')}</span></div>
        <div class="readout"><span class="k">${bi('Largest off-diagonal |entry| of (I+M)⁻¹', '(I+M)⁻¹ 非对角元素的最大绝对值')}</span><span class="v">${big.toFixed(2)}</span><span class="s">${bi('unit keys, β from sigmoid, mild decay', '单位 key、β 取 sigmoid、较弱衰减')}</span></div>`;
    }

    async function play() {
      const my = ++run;
      for (let s = 0; s <= 4; s++) {
        if (my !== run) return;
        stage = s; draw();
        await sleep(reduceMotion ? 500 : 1400);
      }
    }
    stageBtns.forEach((b) => b.addEventListener('click', () => { run++; stage = +b.dataset.stage; draw(); }));
    playBtn.addEventListener('click', play);
    stage = 2; draw(); check();
  }

  // =====================================================================
  // 3. SM103 warp roles and the pipelines between them, for one chunk pair
  // =====================================================================
  function initRoles(host) {
    const svg = $('svg', host), status = $('.sim-status', host);
    const prev = $('[data-act="prev"]', host), next = $('[data-act="next"]', host), playBtn = $('[data-act="play"]', host);
    const NODES = {
      tma: { x: 10, y: 20, w: 190, h: 58, cls: 'node-mem', t: 'warp 9 · TMA', s: 'Q, K, V tiles' },
      gate: { x: 10, y: 252, w: 190, h: 58, cls: 'node-mem', t: 'warp 11 · gate/β, O', s: 'log2 scan · TMA store' },
      mma0: { x: 345, y: 20, w: 190, h: 58, cls: 'node-mma', t: 'warp 8 · MMA', s: 'KK, QK' },
      mma1: { x: 345, y: 136, w: 190, h: 58, cls: 'node-mma', t: 'warp 10 · MMA', s: 'KS, QS, NV, QKV, KV' },
      cg0: { x: 680, y: 20, w: 190, h: 58, cls: 'node-sync', t: 'warps 0–3 · CG0', s: 'T, β, inverse' },
      cg1: { x: 680, y: 252, w: 190, h: 58, cls: 'node-sync', t: 'warps 4–7 · CG1', s: 'decay, V − γKS, O' }
    };
    // Routed paths keep edges out of the node boxes; the dot follows each path.
    const EDGES = {
      qk0: { d: 'M200,40 L343,40', l: 'load_q · load_k', lx: 272, ly: 32 },
      qk1: { d: 'M200,64 C270,64 280,160 343,160', l: '' },
      v: { d: 'M150,78 C150,236 560,236 700,252', l: 'load_v', lx: 420, ly: 246 },
      gate0: { d: 'M160,252 C160,110 640,104 800,80', l: 'load_gate · load_beta', lx: 470, ly: 104 },
      gate1: { d: 'M200,276 L678,276', l: 'load_gate', lx: 300, ly: 270 },
      acc0: { d: 'M535,40 L678,40', l: 'cg0_shared_acc', lx: 607, ly: 32 },
      ainv: { d: 'M700,78 C690,130 600,160 537,165', l: 'a_inv_ready · qk_ready', lx: 770, ly: 124 },
      inp1: { d: 'M820,252 C820,180 640,172 537,180', l: 'state_inp · vks · nv · decay_v', lx: 780, ly: 166 },
      acc1: { d: 'M510,194 C520,236 700,210 760,250', l: 'cg1_shared_acc · q_state_acc', lx: 650, ly: 218 },
      o: { d: 'M678,298 L202,298', l: 'o_store', lx: 300, ly: 292 }
    };
    const STEPS = [
      { on: ['tma', 'mma0', 'mma1', 'cg1'], e: ['qk0', 'qk1', 'v'],
        txt: bi('<b>1 · Load.</b> Warp 9 TMA-loads Q and K for both chunks of the pair (three Q stages, four K stages) and V for CG1.', '<b>1 · 加载。</b>warp 9 用 TMA 加载这对 chunk 的 Q、K（Q 三级、K 四级缓冲）以及供 CG1 使用的 V。') },
      { on: ['gate', 'cg0', 'cg1'], e: ['gate0', 'gate1'],
        txt: bi('<b>2 · Gates.</b> Warp 11 takes log2 of each gate, runs a warp-wide prefix scan, and writes Λ = cumulative log and γ = 2<sup>Λ</sup> to shared memory, along with β.', '<b>2 · 门控。</b>warp 11 对每个 gate 取 log2，做 warp 内前缀和，把累积对数 Λ 与 γ = 2<sup>Λ</sup>，连同 β 一起写入共享内存。') },
      { on: ['mma0', 'cg0'], e: ['acc0'],
        txt: bi('<b>3 · KK.</b> Warp 8 issues K·Kᵀ for both chunks into CG0\'s two TMEM accumulator stages.', '<b>3 · KK。</b>warp 8 为两个 chunk 发射 K·Kᵀ，结果写入 CG0 的两级 TMEM 累加器。') },
      { on: ['cg0', 'mma1'], e: ['ainv'],
        txt: bi('<b>4 · Inverse.</b> CG0 scales KK by T·β, inverts I + M in four stages, scales columns by β and publishes Â through a_inv_ready.', '<b>4 · 求逆。</b>CG0 把 KK 乘以 T·β，分四阶段求 I + M 的逆，按列乘以 β，再经 a_inv_ready 发布 Â。') },
      { on: ['mma0', 'cg0', 'mma1'], e: ['acc0', 'ainv'],
        txt: bi('<b>5 · QK.</b> Warp 8 issues Q·Kᵀ into the same ring. CG0 reuses its T registers, multiplies by T·s, and publishes the scores through qk_ready.', '<b>5 · QK。</b>warp 8 把 Q·Kᵀ 发射进同一个环形累加器。CG0 复用寄存器里的 T，乘以 T·s，经 qk_ready 发布分数。') },
      { on: ['cg1', 'mma1'], e: ['inp1', 'acc1'],
        txt: bi('<b>6 · State in.</b> CG1 publishes a BF16 copy of the state as an MMA operand and decays the FP32 state in TMEM by γ<sub>C</sub>. Warp 10 issues K·S and Q·S.', '<b>6 · 状态输入。</b>CG1 把状态的 BF16 副本发布为 MMA 操作数，并把 TMEM 中的 FP32 状态乘以 γ<sub>C</sub>。warp 10 发射 K·S 与 Q·S。') },
      { on: ['cg1', 'mma1'], e: ['inp1', 'acc1'],
        txt: bi('<b>7 · New values.</b> CG1 forms V − γ·KS and scales QS by γ·s in place. Warp 10 issues NV = Â·(V − γKS).', '<b>7 · 新 value。</b>CG1 计算 V − γ·KS，并把 QS 原地乘以 γ·s。warp 10 发射 NV = Â·(V − γKS)。') },
      { on: ['cg1', 'mma1'], e: ['inp1', 'acc1'],
        txt: bi('<b>8 · Output and state.</b> CG1 publishes NV and NV·γ<sub>C</sub>/γ<sub>j</sub>. Warp 10 accumulates the scores times NV onto the QS accumulator (O) and Kᵀ·(decayed NV) onto the state.', '<b>8 · 输出与状态。</b>CG1 发布 NV 与 NV·γ<sub>C</sub>/γ<sub>j</sub>。warp 10 把分数乘 NV 累加到 QS 累加器（即 O），把 Kᵀ·(衰减后的 NV) 累加到状态上。') },
      { on: ['cg1', 'gate'], e: ['o'],
        txt: bi('<b>9 · Store.</b> CG1 moves O from TMEM to shared memory and hands it to warp 11, which TMA-stores it. The state never leaves TMEM until the tile\'s last chunk.', '<b>9 · 存储。</b>CG1 把 O 从 TMEM 搬到共享内存交给 warp 11，由它用 TMA 写回。状态在整个 tile 的最后一个 chunk 之前一直留在 TMEM 中。') }
    ];
    let step = 0, run = 0;

    function draw(animate) {
      svg.innerHTML = '';
      const defs = S('defs', null, svg);
      const mk = S('marker', { id: 'rl-a', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, markerUnits: 'userSpaceOnUse', orient: 'auto' }, defs);
      S('path', { d: 'M0,0 L8,4 L0,8 z', class: 'fill-mute' }, mk);
      const cur = STEPS[step];
      const paths = {};
      Object.entries(EDGES).forEach(([k, e]) => {
        const on = cur.e.includes(k);
        paths[k] = S('path', { d: e.d, class: 'edge' + (on ? ' on' : ''), 'marker-end': 'url(#rl-a)' }, svg);
        if (e.l) S('text', { x: e.lx, y: e.ly, class: 'edge-l' + (on ? ' on' : ''), 'text-anchor': 'middle' }, svg, e.l);
      });
      Object.entries(NODES).forEach(([k, n]) => {
        const on = cur.on.includes(k);
        S('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: 5, class: n.cls + (on ? ' node-on' : '') }, svg);
        S('text', { x: n.x + 12, y: n.y + 24, class: 't-lg' }, svg, n.t);
        S('text', { x: n.x + 12, y: n.y + 44, class: 't-sm muted' }, svg, n.s);
      });
      status.innerHTML = cur.txt;
      prev.disabled = step === 0; next.disabled = step === STEPS.length - 1;
      if (animate && !reduceMotion) {
        cur.e.forEach((k, i) => {
          const p = paths[k], len = p.getTotalLength();
          const frames = [];
          for (let f = 0; f <= 16; f++) { const pt = p.getPointAtLength((len * f) / 16); frames.push({ transform: `translate(${pt.x}px, ${pt.y}px)` }); }
          const dot = S('circle', { cx: 0, cy: 0, r: 5, class: 'dot' }, svg);
          dot.animate(frames, { duration: 1000, delay: i * 140, easing: 'ease-in-out', fill: 'forwards' });
        });
      }
    }
    async function play() {
      const my = ++run;
      for (let s = 0; s < STEPS.length; s++) {
        if (my !== run) return;
        step = s; draw(true);
        await sleep(reduceMotion ? 900 : 1900);
      }
    }
    prev.addEventListener('click', () => { run++; if (step > 0) { step--; draw(true); } });
    next.addEventListener('click', () => { run++; if (step < STEPS.length - 1) { step++; draw(true); } });
    playBtn.addEventListener('click', play);
    step = 3; draw(false);
  }

  // =====================================================================
  // 4. Persistent tile scheduler (GDNTileScheduler, SM103 M64 contract)
  // =====================================================================
  function initSched(host) {
    const lens = $('#gs-lens', host), sms = $('#gs-sms', host), preset = $('#gs-preset', host);
    const svg = $('svg', host), readouts = $('.readouts', host), legend = $('.legend-row', host), err = $('.err', host);
    const TILES_PER_SEQ = 64;  // 32 value heads x 2 value-row halves
    const MAX_TOKENS = 16384;

    function parse() {
      const vals = lens.value.split(/[,\s]+/).filter(Boolean).map(Number);
      if (!vals.length || vals.some((x) => !Number.isInteger(x) || x <= 0)) return { error: bi('Enter positive integer lengths, separated by commas.', '请输入以逗号分隔的正整数长度。') };
      if (vals.length > 4) return { error: bi('This widget colors up to 4 sequences; the kernel contract allows 16.', '本组件最多为 4 条序列着色；kernel 契约允许 16 条。') };
      const total = vals.reduce((a, b) => a + b, 0);
      if (total > MAX_TOKENS) return { error: bi(`Total ${total} tokens exceeds the SM103 contract limit of 16,384.`, `总计 ${total} 个 token，超过 SM103 契约上限 16,384。`) };
      const n = +sms.value;
      if (!Number.isInteger(n) || n < 1 || n > 1024) return { error: bi('SM count must be between 1 and 1024.', 'SM 数须在 1 到 1024 之间。') };
      return { vals, n, total };
    }

    function simulate(vals, n) {
      const tiles = [];
      vals.forEach((len, b) => {
        const work = 2 * Math.ceil(len / 128);  // chunks, rounded to 128-token pairs
        for (let h = 0; h < TILES_PER_SEQ; h++) tiles.push({ b, h, work });
      });
      const grid = Math.min(tiles.length, n);
      const ctas = Array.from({ length: grid }, () => ({ segs: [], end: 0 }));
      tiles.forEach((tl, i) => {  // head-major linear index; CTA c takes c, c + grid, ...
        const c = ctas[i % grid];
        c.segs.push({ ...tl, s: c.end, i });
        c.end += tl.work;
      });
      const makespan = Math.max(...ctas.map((c) => c.end));
      const totalWork = tiles.reduce((a, t2) => a + t2.work, 0);
      return { tiles, grid, ctas, makespan, ideal: totalWork / grid, waves: Math.ceil(tiles.length / grid) };
    }

    function draw(r, vals) {
      svg.innerHTML = '';
      const X0 = 44, W = 820, Y0 = 14, H = 230;
      const colW = W / r.grid;
      const ymax = r.makespan * 1.06;
      const sy = (v) => Y0 + H - (v / ymax) * H;
      const step = ymax > 400 ? 100 : ymax > 160 ? 50 : ymax > 60 ? 20 : ymax > 24 ? 10 : 4;
      for (let v = 0; v <= ymax; v += step) {
        S('line', { x1: X0, y1: sy(v), x2: X0 + W, y2: sy(v), class: 'grid' }, svg);
        S('text', { x: X0 - 6, y: sy(v) + 3.5, class: 't-sm muted', 'text-anchor': 'end' }, svg, String(v));
      }
      const gap = colW > 3 ? 1 : 0;
      r.ctas.forEach((c, ci) => {
        const x = X0 + ci * colW;
        c.segs.forEach((sg) => {
          const y1 = sy(sg.s + sg.work), y0 = sy(sg.s);
          S('rect', { x: x + gap / 2, y: y1 + 0.5, width: Math.max(colW - gap, 0.6), height: Math.max(y0 - y1 - 1, 0.5), class: 'seg-r' + sg.b }, svg);
        });
        const hit = S('rect', { x, y: Y0, width: Math.max(colW, 1), height: H, class: 'col-hit' }, svg);
        const list = c.segs.map((sg) => `seq ${sg.b} · head ${sg.h >> 1}${sg.h & 1 ? 'b' : 'a'} · ${sg.work}`).join('<br>');
        hit.addEventListener('mouseenter', (ev) => showTip(`<b>CTA ${ci}</b> · ${c.end} ${lang() === 'zh' ? 'chunk' : 'chunks'}<br>${list}`, ev));
        hit.addEventListener('mousemove', moveTip);
        hit.addEventListener('mouseleave', hideTip);
      });
      S('line', { x1: X0, y1: sy(r.ideal), x2: X0 + W, y2: sy(r.ideal), class: 'ideal' }, svg);
      S('text', { x: X0 + W, y: sy(r.ideal) - 5, class: 't-sm', 'text-anchor': 'end' }, svg, `perfect balance ${r.ideal.toFixed(1)}`);
      S('line', { x1: X0, y1: Y0 + H, x2: X0 + W, y2: Y0 + H, class: 'grid' }, svg);
      S('text', { x: X0, y: Y0 + H + 16, class: 't-sm muted' }, svg, 'CTA 0');
      S('text', { x: X0 + W, y: Y0 + H + 16, class: 't-sm muted', 'text-anchor': 'end' }, svg, `CTA ${r.grid - 1}`);
      S('text', { x: X0 + W / 2, y: Y0 + H + 16, class: 't-sm muted', 'text-anchor': 'middle' }, svg, 'one column per persistent CTA · height = 64-token chunks processed');
      S('text', { x: 4, y: Y0 - 2, class: 't-sm muted' }, svg, 'chunks');
      legend.innerHTML = vals.map((len, b) => `<span><span class="sw seg-r${b}" style="background:var(--r${b})"></span>seq ${b} · ${len} tokens</span>`).join('') +
        `<span><span class="sw" style="border-top:2px dashed var(--ink);height:0;width:1.2rem"></span>${bi('perfect balance', '理想均衡')}</span>`;
    }

    function update() {
      const p = parse();
      if (p.error) { err.innerHTML = p.error; err.hidden = false; return; }
      err.hidden = true;
      const r = simulate(p.vals, p.n);
      draw(r, p.vals);
      readouts.innerHTML = `
        <div class="readout"><span class="k">${bi('Tiles', 'tile 数')}</span><span class="v">${r.tiles.length}</span><span class="s">${bi(`${p.vals.length} × 64 (32 heads × 2 halves)`, `${p.vals.length} × 64（32 个 head × 2 半）`)}</span></div>
        <div class="readout"><span class="k">${bi('Persistent CTAs', '常驻 CTA')}</span><span class="v">${r.grid}</span><span class="s">min(${r.tiles.length}, ${p.n})</span></div>
        <div class="readout"><span class="k">${bi('Tiles per CTA', '每 CTA 的 tile 数')}</span><span class="v">≤ ${r.waves}</span><span class="s">${bi('round-robin, head-major', '轮转分配，head 优先')}</span></div>
        <div class="readout key"><span class="k">${bi('Longest CTA', '最慢的 CTA')}</span><span class="v">${r.makespan}</span><span class="s">${bi('chunks, sets the kernel time', '个 chunk，决定 kernel 时间')}</span></div>
        <div class="readout key"><span class="k">${bi('Balance', '均衡度')}</span><span class="v">${(100 * r.ideal / r.makespan).toFixed(0)}%</span><span class="s">${bi('average CTA work ÷ longest', '平均 CTA 工作量 ÷ 最长')}</span></div>`;
    }

    const PRESETS = { perf: '4224, 4224, 4224', pair: '65, 63', one: '16384', skew: '9000, 3000, 1000, 200' };
    preset.addEventListener('change', () => { if (PRESETS[preset.value]) { lens.value = PRESETS[preset.value]; update(); } });
    [lens, sms].forEach((el) => el.addEventListener('input', () => { preset.value = 'custom'; update(); }));
    document.addEventListener('click', (e) => { if (e.target.closest('[data-set-lang]')) setTimeout(update, 0); });
    update();
  }

  const play = document.getElementById('gdn-play'); if (play) initPlay(play);
  const inv = document.getElementById('gdn-inv'); if (inv) initInverse(inv);
  const roles = document.getElementById('gdn-roles'); if (roles) initRoles(roles);
  const sched = document.getElementById('gdn-sched'); if (sched) initSched(sched);
})();
