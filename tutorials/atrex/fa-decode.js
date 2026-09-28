// ATREX chapter 02 widgets: eligibility checker, paged-KV walk, split planner,
// and an online-softmax playground that follows the kernel's base-2 math.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const SRC = 'https://github.com/alibaba/atrex-kernels/blob/8ca113d5933595520baff1660c3a9751f0cd5dfc/';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const num = (x) => x.toLocaleString('en-US');
  const lang = () => (document.documentElement.dataset.lang === 'zh' ? 'zh' : 'en');

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function S(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function hatch(svg, id) {
    const defs = S('defs', null, svg);
    const pat = S('pattern', { id, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    S('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'hatch-line' }, pat);
    return defs;
  }

  // ---------- shared tooltip ----------
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

  function pulse(el) {
    if (!el || reduceMotion) return;
    el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  }

  // =====================================================================
  // 1. Eligibility checker: the checks of can_use_atrex_aka_fa4_decode, in order
  // =====================================================================
  function initElig(host) {
    const f = (id) => $('#' + id, host);
    const ctl = {
      arch: f('el-arch'), cuda: f('el-cuda'), dtype: f('el-dtype'), qh: f('el-qh'), kvh: f('el-kvh'),
      hd: f('el-hd'), page: f('el-page'), batch: f('el-batch'), qlen: f('el-qlen'), causal: f('el-causal'),
      scale: f('el-scale'), splits: f('el-splits'), lse: f('el-lse'), softcap: f('el-softcap'),
      window: f('el-window'), extra: f('el-extra'), threads: f('el-threads')
    };
    const batchOut = f('el-batch-out');
    const list = $('.fa-check', host), verdict = $('.fa-verdict', host);
    const L = (a, b) => `${SRC}src/nvidia/flash_attn/sm103/launch.py#L${a}-L${b}`;
    const CHECKS = [
      { a: 44, b: 50, en: 'NVIDIA SM103 with a CUDA 13+ runtime', zh: 'NVIDIA SM103，CUDA 运行时 ≥ 13', ok: (s) => s.arch === 'sm103' && s.cuda >= 13 },
      { a: 51, b: 52, en: 'q, k and v are BF16', zh: 'q、k、v 均为 BF16', ok: (s) => s.dtype === 'bf16' },
      { a: 55, b: 56, en: 'q is [tokens, 16 heads, 256]', zh: 'q 的形状为 [tokens, 16 头, 256]', ok: (s) => s.qh === 16 && s.hd === 256 },
      { a: 57, b: 62, en: 'k and v are [pages, 128, 1 head, 256]', zh: 'k、v 的形状为 [pages, 128, 1 头, 256]', ok: (s) => s.page === 128 && s.kvh === 1 && s.hd === 256 },
      { a: 72, b: 74, en: 'batch size is 16 to 28', zh: 'batch 大小在 16 到 28 之间', ok: (s) => s.batch >= 16 && s.batch <= 28 },
      { a: 75, b: 78, en: 'max_seqlen_q is 4, so q has batch × 4 rows', zh: 'max_seqlen_q 为 4，q 共 batch × 4 行', ok: (s) => s.qlen === 4 },
      { a: 116, b: 117, en: 'causal=True', zh: 'causal=True', ok: (s) => s.causal },
      { a: 118, b: 127, en: 'softmax_scale is 256^−0.5, or None', zh: 'softmax_scale 为 256^−0.5 或 None', ok: (s) => s.scale !== 'other' },
      { a: 128, b: 129, en: 'return_lse=False', zh: 'return_lse=False', ok: (s) => !s.lse },
      { a: 130, b: 131, en: 'num_splits=0, so the kernel picks the splits', zh: 'num_splits=0，由 kernel 自行划分', ok: (s) => s.splits === 0 },
      { a: 132, b: 133, en: 'no softcap', zh: '没有 softcap', ok: (s) => s.softcap !== 'on' },
      { a: 134, b: 137, en: 'no sliding window', zh: '没有滑动窗口', ok: (s) => !s.window },
      { a: 138, b: 164, en: 'no sink, descale factors, score/mask mods or other FA4 extras', zh: '没有 sink、descale、score/mask mod 等 FA4 额外选项', ok: (s) => !s.extra },
      { a: 165, b: 166, en: 'num_threads=384', zh: 'num_threads=384', ok: (s) => s.threads === 384 }
    ];
    const BASE = { arch: 'sm103', cuda: '13', dtype: 'bf16', qh: 16, kvh: 1, hd: '256', page: '128', batch: 16, qlen: '4', causal: true, scale: 'default', splits: '0', lse: false, softcap: 'none', window: false, extra: false, threads: '384' };
    const PRESETS = {
      prod: {},
      q1: { qlen: '1' },
      gqa: { qh: 32, kvh: 8, hd: '128', page: '16', batch: 32 },
      b200: { arch: 'sm100' },
      big: { batch: 40 }
    };

    function read() {
      return {
        arch: ctl.arch.value, cuda: +ctl.cuda.value, dtype: ctl.dtype.value, qh: +ctl.qh.value, kvh: +ctl.kvh.value,
        hd: +ctl.hd.value, page: +ctl.page.value, batch: +ctl.batch.value, qlen: +ctl.qlen.value, causal: ctl.causal.checked,
        scale: ctl.scale.value, splits: +ctl.splits.value, lse: ctl.lse.checked, softcap: ctl.softcap.value,
        window: ctl.window.checked, extra: ctl.extra.checked, threads: +ctl.threads.value
      };
    }
    function apply(p) {
      const v = Object.assign({}, BASE, p);
      for (const k in ctl) {
        if (ctl[k].type === 'checkbox') ctl[k].checked = !!v[k];
        else ctl[k].value = v[k];
      }
      update();
    }
    function update() {
      const s = read();
      batchOut.textContent = s.batch;
      let failed = -1;
      list.innerHTML = CHECKS.map((c, i) => {
        let cls, st;
        if (failed >= 0) { cls = 'skip'; st = '·'; }
        else if (c.ok(s)) { cls = 'pass'; st = '✓'; }
        else { cls = 'fail'; st = '✕'; failed = i; }
        const here = cls === 'fail' ? ` <b>${bi('rejected here', '在此被拒绝')}</b>` : '';
        return `<li class="${cls}"><span class="st" aria-hidden="true">${st}</span><span>${bi(c.en, c.zh)}${here}</span><a class="src" href="${L(c.a, c.b)}">launch.py:${c.a}–${c.b}</a></li>`;
      }).join('');
      if (failed < 0) {
        verdict.className = 'fa-verdict ok';
        verdict.innerHTML = `<span class="label">${bi('Accepted', '接受')}</span><p>${bi(
          'flash_attn_varlen_func runs <code>atrex_aka_fa4_decode</code>, which launches one decode kernel and one reduction kernel, both named <code>atrex_aka_*</code>.',
          'flash_attn_varlen_func 调用 <code>atrex_aka_fa4_decode</code>，后者启动一个 decode kernel 和一个 reduction kernel，名字都以 <code>atrex_aka_</code> 开头。')}</p>`;
      } else {
        verdict.className = 'fa-verdict no';
        verdict.innerHTML = `<span class="label">${bi('Rejected', '拒绝')}</span><p>${bi(
          '<code>can_use_flash_attn_varlen_func</code> returns False. Calling <code>flash_attn_varlen_func</code> anyway raises <code>NotImplementedError</code>, so the caller has to route this call to another backend.',
          '<code>can_use_flash_attn_varlen_func</code> 返回 False。若仍直接调用 <code>flash_attn_varlen_func</code>，会抛出 <code>NotImplementedError</code>，调用方需要把这次调用交给其他后端。')} <a class="src" href="${L(215, 218)}">launch.py:215–218</a></p>`;
      }
    }
    host.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => apply(PRESETS[b.dataset.preset])));
    Object.values(ctl).forEach((el) => el.addEventListener('input', update));
    apply(PRESETS.prod);
  }

  // =====================================================================
  // 2. Paged-KV walk: page table -> 64-token sub-pages -> K and V TMA boxes
  // =====================================================================
  function initPages(host) {
    const svg = $('svg', host), readouts = $('.readouts', host);
    const lenIn = $('#pg-len', host), lenOut = $('#pg-len-out', host);
    const tileIn = $('#pg-tile', host), tileOut = $('#pg-tile-out', host);
    const loadBtn = $('[data-act="load"]', host), shufBtn = $('[data-act="shuffle"]', host);
    const NPHYS = 16, MAXP = 12, X0 = 110, W = 760;
    const pw = W / MAXP, phw = W / NPHYS, bw = 92;
    let seed = 7, table = [], run = 0;

    function reshuffle() {
      const rnd = mulberry32(seed);
      const ids = [...Array(NPHYS).keys()];
      for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      table = ids.slice(0, MAXP);
    }

    function model() {
      const len = +lenIn.value;
      const tablePages = Math.ceil(len / 128), kPages = Math.ceil(len / 64), tiles = Math.ceil(len / 128);
      tileIn.max = String(tiles - 1);
      const t = Math.min(+tileIn.value, tiles - 1);
      if (+tileIn.value !== t) tileIn.value = String(t);
      const lanes = [0, 1].map((j) => {
        const logical = t * 2 + j;
        if (logical >= kPages) return { j, logical, entry: null, virt: -1 };
        return { j, logical, entry: table[t], virt: table[t] * 2 + j };
      });
      const rem = len % 128;
      const masked = t === tiles - 1 || (rem > 0 && rem < 4 && t === tiles - 2);
      const valid = Math.min(128, len - t * 128);
      return { len, tablePages, kPages, tiles, t, lanes, masked, valid };
    }

    const kHalf = (dk, j) => ({ x: X0 + dk * bw + 3 + j * 43 + 21.5, y: 262 });
    const vBox = (sk, dm) => ({ x: X0 + 4 * bw + 24 + (sk * 2 + dm) * bw + 43, y: 262 });
    const physSub = (virt) => ({ x: X0 + Math.floor(virt / 2) * phw + (virt % 2) * (phw / 2) + phw / 4, y: 165 });

    function draw(m, filled) {
      svg.innerHTML = '';
      hatch(svg, 'pg-hatch');
      const lbl = (y, t) => S('text', { x: 0, y, class: 't-sm muted' }, svg, t);
      lbl(42, 'logical tokens');
      lbl(90, 'page_table[b]');
      lbl(162, 'k / v cache');
      lbl(178, '(physical)');
      lbl(266, 'stage ring');
      // logical pages
      for (let i = 0; i < m.tablePages; i++) {
        const x = X0 + i * pw;
        const cur = i === m.t;
        S('rect', { x, y: 26, width: pw - 3, height: 26, rx: 2, class: cur ? 'seg-hot' : 'box-soft' }, svg);
        S('line', { x1: x + (pw - 3) / 2, y1: 26, x2: x + (pw - 3) / 2, y2: 52, class: 'guide' }, svg);
        const past = (i + 1) * 128 - m.len;
        if (past > 0) {
          const w = (past / 128) * (pw - 3);
          S('rect', { x: x + pw - 3 - w, y: 26, width: w, height: 26, fill: 'url(#pg-hatch)', stroke: 'none' }, svg);
        }
        S('text', { x: x + 5, y: 43, class: 't-sm' }, svg, 'P' + i);
      }
      S('text', { x: X0 + W, y: 16, class: 't-sm muted', 'text-anchor': 'end' }, svg, `128-token table pages · hatched = past seqused_k`);
      // page table and indirection lines
      for (let i = 0; i < m.tablePages; i++) {
        const x = X0 + i * pw;
        const cur = i === m.t;
        const px = X0 + table[i] * phw + phw / 2 - 1.5;
        S('line', { x1: x + (pw - 3) / 2, y1: 100, x2: px, y2: 150, class: cur ? 'ln-local' : 'guide' }, svg);
        S('rect', { x, y: 76, width: pw - 3, height: 24, rx: 2, class: cur ? 'seg-hot' : 'box' }, svg);
        S('text', { x: x + (pw - 3) / 2, y: 92, class: 't-sm', 'text-anchor': 'middle' }, svg, 'p' + table[i]);
      }
      // physical pages, each viewed as two 64-token sub-pages
      const used = new Set(table.slice(0, m.tablePages));
      for (let k = 0; k < NPHYS; k++) {
        const x = X0 + k * phw;
        const cur = m.lanes.some((l) => l.entry === k);
        S('rect', { x, y: 150, width: phw - 3, height: 30, rx: 2, class: cur ? 'seg-hot' : used.has(k) ? 'seg-mine' : 'box-soft' }, svg);
        S('line', { x1: x + (phw - 3) / 2, y1: 150, x2: x + (phw - 3) / 2, y2: 180, class: 'guide' }, svg);
        S('text', { x: x + (phw - 3) / 2, y: 196, class: 't-sm muted', 'text-anchor': 'middle' }, svg, 'p' + k);
      }
      S('text', { x: X0 + W, y: 214, class: 't-sm muted', 'text-anchor': 'end' }, svg, 'each page = sub-pages 2p and 2p+1 of the kernel view [pages × 2, 64, 1, 256]');
      // stage rings
      S('text', { x: X0, y: 236, class: 't-sm muted' }, svg, 'K: 4 stages (dk0…dk3), each 2 sub-pages × 64 dims');
      S('text', { x: X0 + 4 * bw + 24, y: 236, class: 't-sm muted' }, svg, 'V: 4 stages (sub-page, 128-dim half)');
      for (let dk = 0; dk < 4; dk++) {
        const x = X0 + dk * bw;
        S('rect', { x, y: 246, width: bw - 6, height: 32, rx: 3, class: 'box' }, svg);
        for (let j = 0; j < 2; j++) {
          const hx = x + 3 + j * 43;
          const lane = m.lanes[j];
          S('rect', { x: hx, y: 249, width: 40, height: 26, rx: 2, class: !filled ? 's-empty' : lane.virt < 0 ? 'seg-pad' : 'seg-local', 'data-k': `${dk}-${j}` }, svg);
          if (filled) S('text', { x: hx + 20, y: 266, class: 't-sm', 'text-anchor': 'middle' }, svg, lane.virt < 0 ? '−1' : 'v' + lane.virt);
        }
        S('text', { x: x + (bw - 6) / 2, y: 292, class: 't-sm muted', 'text-anchor': 'middle' }, svg, 'dk' + dk);
      }
      for (let sk = 0; sk < 2; sk++) for (let dm = 0; dm < 2; dm++) {
        const x = X0 + 4 * bw + 24 + (sk * 2 + dm) * bw;
        const lane = m.lanes[sk];
        S('rect', { x, y: 246, width: bw - 6, height: 32, rx: 3, class: !filled ? 's-empty' : lane.virt < 0 ? 'seg-pad' : 'seg-local' }, svg);
        if (filled) S('text', { x: x + (bw - 6) / 2, y: 266, class: 't-sm', 'text-anchor': 'middle' }, svg, lane.virt < 0 ? '−1' : `v${lane.virt} · d${dm * 128}`);
        S('text', { x: x + (bw - 6) / 2, y: 292, class: 't-sm muted', 'text-anchor': 'middle' }, svg, `sk${sk} dm${dm}`);
      }
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Tile', '序列 tile')}</span><span class="v">${m.t} / ${m.tiles - 1}</span><span class="s">${bi(`tokens ${num(m.t * 128)}–${num(m.t * 128 + 127)}, ${m.valid} valid`, `token ${num(m.t * 128)}–${num(m.t * 128 + 127)}，其中 ${m.valid} 个有效`)}</span></div>
        <div class="readout"><span class="k">${bi('Sub-page indices', '子页索引')}</span><span class="v">${m.lanes.map((l) => (l.virt < 0 ? '−1' : l.virt)).join(' · ')}</span><span class="s">${bi('entry × 2 + (logical page mod 2)', 'entry × 2 + (逻辑页 mod 2)')}</span></div>
        <div class="readout"><span class="k">${bi('Pages', '页数')}</span><span class="v">${m.tablePages} · ${m.kPages}</span><span class="s">${bi('128-token table pages · 64-token kernel pages', '128 token 的表页 · 64 token 的 kernel 页')}</span></div>
        <div class="readout"><span class="k">${bi('TMA copies', 'TMA 拷贝')}</span><span class="v">8 K + 4 V</span><span class="s">${bi('per 128-token tile', '每个 128 token 的 tile')}</span></div>
        <div class="readout"><span class="k">${bi('Causal mask path', '因果掩码路径')}</span><span class="v">${m.masked ? bi('masked', '带掩码') : bi('unmasked', '无掩码')}</span><span class="s">${bi('only the last tile (or last two) pays for masking', '只有最后一个（或两个）tile 需要掩码')}</span></div>`;
      lenOut.textContent = num(m.len);
      tileOut.textContent = m.t;
    }

    function flyBox(from, to, label, delay, token) {
      return new Promise((resolve) => {
        if (reduceMotion) { resolve(); return; }
        const g = S('g', { class: 'fa-flybox' }, svg);
        S('rect', { x: -18, y: -9, width: 36, height: 18, rx: 2, class: 'seg-local' }, g);
        S('text', { x: 0, y: 4, class: 't-sm', 'text-anchor': 'middle' }, g, label);
        const midY = Math.min(from.y, to.y) - 30;
        const anim = g.animate([
          { transform: `translate(${from.x}px, ${from.y}px)`, opacity: 0.3 },
          { transform: `translate(${(from.x + to.x) / 2}px, ${midY}px)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${to.x}px, ${to.y}px)`, opacity: 1 }
        ], { duration: 620, delay, easing: 'cubic-bezier(.3,.65,.25,1)', fill: 'both' });
        anim.finished.then(() => { g.remove(); resolve(token === run); }, () => { g.remove(); resolve(false); });
      });
    }

    async function load() {
      const token = ++run;
      const m = model();
      draw(m, false);
      if (reduceMotion) { draw(m, true); return; }
      const flights = [];
      let i = 0;
      for (let dk = 0; dk < 4; dk++) for (let j = 0; j < 2; j++) {
        const lane = m.lanes[j];
        if (lane.virt < 0) continue;
        flights.push(flyBox(physSub(lane.virt), kHalf(dk, j), 'v' + lane.virt, i++ * 90, token));
      }
      for (let sk = 0; sk < 2; sk++) for (let dm = 0; dm < 2; dm++) {
        const lane = m.lanes[sk];
        if (lane.virt < 0) continue;
        flights.push(flyBox(physSub(lane.virt), vBox(sk, dm), 'v' + lane.virt, i++ * 90, token));
      }
      await Promise.all(flights);
      if (token === run) draw(m, true);
    }

    lenIn.addEventListener('input', () => { run++; draw(model(), true); });
    tileIn.addEventListener('input', () => { run++; draw(model(), true); });
    loadBtn.addEventListener('click', load);
    shufBtn.addEventListener('click', () => { seed = Math.floor(Math.random() * 1e9); reshuffle(); load(); });
    reshuffle();
    draw(model(), true);
  }

  // =====================================================================
  // 3. Split planner: _atrex_aka_split_config + flatten_split_work_single_warp
  // =====================================================================
  function initSplit(host) {
    const Q4 = {
      p1: [1563, 12520, 14313, 2095, 3158, 2696, 4997, 6072, 2226, 565, 5312, 13175, 2882, 17340, 11425, 840],
      p3: [15070, 12926, 14788, 2513, 3748, 3115, 5403, 6643, 8725, 12043, 5796, 8069, 29358, 2419, 12102, 1236, 10964, 1629],
      p10: [14905, 12765, 14618, 2355, 3524, 2952, 5264, 6417, 8509, 11791, 5620, 7821, 5315, 17694, 11850, 1087, 4539, 11133, 272, 6528, 2184, 2748, 1783, 1261, 284, 9839, 661, 6000]
    };
    const preset = $('#sp-preset', host), sms = $('#sp-sms', host);
    const ub = $('#sp-batch', host), ubOut = $('#sp-batch-out', host), ul = $('#sp-len', host), ulOut = $('#sp-len-out', host);
    const uniformRow = $('.sp-uniform', host);
    const svg = $('svg', host), readouts = $('.readouts', host);

    function lengths() {
      if (preset.value === 'uniform') return Array(+ub.value).fill(+ul.value);
      return Q4[preset.value];
    }

    function plan() {
      const lens = lengths();
      const B = lens.length;
      const sm = Math.max(2, +sms.value || 2);
      const splitTarget = Math.max(1, Math.floor(sm / 2) - Math.floor(B / 2));
      const maxPages = Math.max(...lens.map((l) => Math.ceil(l / 128)));
      const tableTiles = Math.ceil((maxPages * 128) / 128);
      const maxSplits = Math.max(1, Math.min(16, splitTarget, tableTiles));
      const tiles = lens.map((l) => Math.ceil(l / 128));
      const total = tiles.reduce((a, b) => a + b, 0);
      const span = Math.max(1, Math.ceil(total / splitTarget));
      const splits = tiles.map((t) => Math.min(maxSplits, Math.ceil(t / span)));
      const starts = [];
      let acc = 0;
      splits.forEach((s) => { starts.push(acc); acc += s; });
      const gridX = splitTarget + B;
      const ctas = [];
      for (let c = 0; c < gridX; c++) {
        const b = starts.findIndex((st, i) => splits[i] > 0 && c >= st && c < st + splits[i]);
        if (b < 0) { ctas.push(null); continue; }
        const split = c - starts[b];
        const iters = Math.ceil((tiles[b] - split) / splits[b]);
        const own = [];
        for (let k = split; k < tiles[b] && own.length < 4; k += splits[b]) own.push(k);
        ctas.push({ b, split, splits: splits[b], iters, own, len: lens[b] });
      }
      const worked = splits.reduce((a, b) => a + b, 0);
      const longest = Math.max(...ctas.filter(Boolean).map((c) => c.iters));
      const planes = maxSplits + 1;
      const wsBytes = 4 * (planes * B * 4 * 16 * 256 + 2 * planes * B * 4 * 16);
      return { lens, B, sm, splitTarget, maxPages, maxSplits, tiles, total, span, splits, gridX, ctas, worked, longest, planes, wsBytes };
    }

    function niceMax(v) {
      const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
      for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
      return 10 * p;
    }

    function draw(p) {
      svg.innerHTML = '';
      const X0 = 48, W = 820, Y0 = 26, H = 170;
      const ymax = niceMax(Math.max(p.longest, p.span) * 1.1);
      const sy = (v) => Y0 + H - (v / ymax) * H;
      for (let i = 0; i <= 4; i++) {
        const v = (ymax / 4) * i, y = sy(v);
        S('line', { x1: X0, y1: y, x2: X0 + W, y2: y, class: 'axis' }, svg);
        S('text', { x: X0 - 6, y: y + 4, class: 't-sm muted', 'text-anchor': 'end' }, svg, String(Math.round(v)));
      }
      const cw = W / p.gridX;
      const bwid = Math.max(1.5, cw - 2);
      p.ctas.forEach((c, i) => {
        const x = X0 + i * cw + (cw - bwid) / 2;
        if (!c) {
          S('rect', { x, y: Y0 + H - 3, width: bwid, height: 3, class: 'sp-idle' }, svg);
        } else {
          const y = sy(c.iters);
          S('rect', { x, y, width: bwid, height: Y0 + H - y, rx: Math.min(2, bwid / 2), class: c.b % 2 ? 'sp-bar sp-odd' : 'sp-bar' }, svg);
        }
        const hit = S('rect', { x: X0 + i * cw, y: Y0, width: cw, height: H, class: 'hit' }, svg);
        const html = c
          ? (lang() === 'zh'
            ? `CTA ${i} → 请求 ${c.b}（seqused_k ${num(c.len)}）<br>split ${c.split} / ${c.splits}，处理 ${c.iters} 个 tile<br>tile ${c.own.join(', ')}${c.iters > c.own.length ? ', …' : ''}`
            : `CTA ${i} → request ${c.b} (seqused_k ${num(c.len)})<br>split ${c.split} of ${c.splits}, ${c.iters} tiles<br>tiles ${c.own.join(', ')}${c.iters > c.own.length ? ', …' : ''}`)
          : (lang() === 'zh' ? `CTA ${i}：没有分到工作，直接退出` : `CTA ${i}: no work, exits early`);
        hit.addEventListener('mouseenter', (ev) => showTip(html, ev));
        hit.addEventListener('mousemove', moveTip);
        hit.addEventListener('mouseleave', hideTip);
      });
      const ys = sy(p.span);
      S('line', { x1: X0, y1: ys, x2: X0 + W, y2: ys, class: 'sp-span' }, svg);
      S('text', { x: X0 + W, y: ys - 5, class: 't-sm', 'text-anchor': 'end' }, svg, `span = ${p.span} tiles`);
      S('line', { x1: X0, y1: Y0 + H, x2: X0 + W, y2: Y0 + H, class: 'ln' }, svg);
      S('text', { x: X0, y: Y0 + H + 18, class: 't-sm muted' }, svg, `CTA index along grid x: split_target + batch = ${p.splitTarget} + ${p.B} = ${p.gridX}`);
      S('text', { x: X0 + W, y: Y0 + H + 18, class: 't-sm muted', 'text-anchor': 'end' }, svg, 'bar = 128-token tiles per CTA · shade alternates by request');
      S('text', { x: X0, y: 12, class: 't-sm muted' }, svg, 'tiles per CTA');
    }

    function update() {
      const uni = preset.value === 'uniform';
      uniformRow.hidden = !uni;
      ubOut.textContent = ub.value;
      ulOut.textContent = num(+ul.value);
      const p = plan();
      draw(p);
      readouts.innerHTML = `
        <div class="readout key"><span class="k">split_target · max_splits</span><span class="v">${p.splitTarget} · ${p.maxSplits}</span><span class="s">${bi(`⌊${p.sm}/2⌋ − ⌊${p.B}/2⌋ · min(16, split_target, ${p.maxPages} tiles)`, `⌊${p.sm}/2⌋ − ⌊${p.B}/2⌋ · min(16, split_target, ${p.maxPages} 个 tile)`)}</span></div>
        <div class="readout"><span class="k">${bi('Total tiles · span', 'tile 总数 · span')}</span><span class="v">${num(p.total)} · ${p.span}</span><span class="s">${bi('span = ⌈total / split_target⌉', 'span = ⌈总数 / split_target⌉')}</span></div>
        <div class="readout key"><span class="k">${bi('Longest CTA', '最长的 CTA')}</span><span class="v">${p.longest} ${bi('tiles', '个 tile')}</span><span class="s">${bi('sets the decode kernel’s critical path', '决定 decode kernel 的关键路径')}</span></div>
        <div class="readout"><span class="k">${bi('CTAs launched · working', 'CTA 启动数 · 有工作')}</span><span class="v">${2 * p.gridX} · ${2 * p.worked}</span><span class="s">${bi('× 2: one CTA per prediction half, clustered in pairs', '× 2：每个 prediction 半区一个 CTA，两两成 cluster')}</span></div>
        <div class="readout"><span class="k">${bi('Workspace', '工作区')}</span><span class="v">${(p.wsBytes / 1048576).toFixed(1)} MiB</span><span class="s">${bi(`${p.planes} planes of FP32 O, M, L; the last carries split counts`, `${p.planes} 个平面的 FP32 O、M、L；最后一个平面存 split 数`)}</span></div>`;
    }

    [preset, sms, ub, ul].forEach((el) => el.addEventListener('input', update));
    document.addEventListener('click', (e) => { if (e.target.closest('[data-set-lang]')) setTimeout(update, 0); });
    update();
  }

  // =====================================================================
  // 4. Online softmax with two ping-pong O buffers, in base 2
  // =====================================================================
  function initSoftmax(host) {
    const svg = $('svg', host), readouts = $('.readouts', host);
    const stepBtn = $('[data-act="step"]', host), playBtn = $('[data-act="play"]', host);
    const resetBtn = $('[data-act="reset"]', host), newBtn = $('[data-act="new"]', host);
    const N = 48, TILE = 8, T = N / TILE;
    const X0 = 60, W = 800, tw = W / N, YC = 112, YS = 20;
    let seed = 21, xs = [], vs = [], k = 3, timer = null;

    function gen() {
      const rnd = mulberry32(seed);
      xs = Array.from({ length: N }, () => (rnd() + rnd() + rnd() - 1.5) * 1.8);
      vs = Array.from({ length: N }, () => rnd() * 2 - 1);
      const spike = 26 + Math.floor(rnd() * 16);
      xs[spike] = 3.3 + rnd() * 0.5;
    }

    function exact() {
      const m = Math.max(...xs);
      let o = 0, l = 0;
      xs.forEach((x, i) => { const w = Math.pow(2, x - m); o += w * vs[i]; l += w; });
      return o / l;
    }

    function runTo(kk) {
      let m = -Infinity, last = null;
      const buf = [{ O: 0, l: 0, m: null, tiles: [] }, { O: 0, l: 0, m: null, tiles: [] }];
      const hist = [];
      for (let t = 0; t < kk; t++) {
        const tileX = xs.slice(t * TILE, (t + 1) * TILE);
        const mNew = Math.max(m, ...tileX);
        const b = t % 2;
        let corr = null;
        if (buf[b].m !== null) { corr = Math.pow(2, buf[b].m - mNew); buf[b].O *= corr; buf[b].l *= corr; }
        tileX.forEach((x, j) => { const p = Math.pow(2, x - mNew); buf[b].O += p * vs[t * TILE + j]; buf[b].l += p; });
        buf[b].m = mNew; buf[b].tiles.push(t);
        m = mNew;
        hist.push(m);
        last = { t, b, corr, mNew };
      }
      let est = null;
      if (kk > 0) {
        let o = 0, l = 0;
        buf.forEach((bb) => { if (bb.m === null) return; const c = Math.pow(2, bb.m - m); o += c * bb.O; l += c * bb.l; });
        est = o / l;
      }
      return { m, buf, hist, last, est };
    }

    const sy = (v) => YC - v * YS;

    function draw(state, fresh) {
      svg.innerHTML = '';
      S('line', { x1: X0, y1: YC, x2: X0 + W, y2: YC, class: 'axis' }, svg);
      [-3, -2, -1, 0, 1, 2, 3, 4].forEach((v) => {
        S('text', { x: X0 - 8, y: sy(v) + 4, class: 't-sm muted', 'text-anchor': 'end' }, svg, String(v));
      });
      S('text', { x: 0, y: 14, class: 't-sm muted' }, svg, 'x = s · scale · log₂e');
      for (let t = 0; t < T; t++) {
        const done = t < k;
        const x0 = X0 + t * TILE * tw;
        S('line', { x1: x0, y1: 26, x2: x0, y2: 204, class: 'guide' }, svg);
        S('text', { x: x0 + (TILE * tw) / 2, y: 222, class: 't-sm' + (done ? '' : ' muted'), 'text-anchor': 'middle' }, svg, `tile ${t} → O${t % 2 ? '₁' : '₀'}`);
        for (let j = 0; j < TILE; j++) {
          const i = t * TILE + j, v = xs[i];
          const y = v >= 0 ? sy(v) : YC;
          const h = Math.max(1, Math.abs(v) * YS);
          const r = S('rect', { x: X0 + i * tw + 2.5, y, width: tw - 5, height: h, rx: 1.5, class: done ? (t % 2 ? 'sm-bar sm-odd' : 'sm-bar') : 'sm-todo' }, svg);
          if (fresh && t === k - 1 && !reduceMotion) r.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, delay: j * 40, fill: 'both' });
        }
      }
      S('line', { x1: X0 + W, y1: 26, x2: X0 + W, y2: 204, class: 'guide' }, svg);
      // running max, one step per processed tile
      let d = '';
      state.hist.forEach((m, t) => {
        const xa = X0 + t * TILE * tw, xb = X0 + (t + 1) * TILE * tw;
        d += (t === 0 ? `M${xa},${sy(m)}` : ` L${xa},${sy(m)}`) + ` L${xb},${sy(m)}`;
      });
      if (d) {
        S('path', { d, class: 'sm-max' }, svg);
        const lx = X0 + state.hist.length * TILE * tw;
        S('text', { x: Math.min(lx + 4, X0 + W - 70), y: sy(state.m) - 6, class: 't-sm sm-max-t' }, svg, `m = ${state.m.toFixed(2)}`);
      }
    }

    function fmt(x) { return x === null ? '—' : x.toFixed(4); }

    function render(fresh) {
      const st = runTo(k);
      draw(st, fresh);
      const ex = exact();
      const bufCard = (i) => {
        const b = st.buf[i];
        const tiles = b.tiles.length ? b.tiles.join(', ') : '—';
        return `<div class="readout${st.last && st.last.b === i ? ' key' : ''}"><span class="k">O${i ? '₁' : '₀'} ${bi('buffer', '缓冲')}</span><span class="v">${b.m === null ? '—' : `m ${b.m.toFixed(2)}`}</span><span class="s">${bi(`tiles ${tiles} · l = ${b.l.toFixed(3)}`, `tile ${tiles} · l = ${b.l.toFixed(3)}`)}</span></div>`;
      };
      let corr = bi('first tile for this buffer, nothing to rescale', '该缓冲的第一个 tile，无需重缩放');
      if (!st.last) corr = bi('no tiles yet', '尚未处理 tile');
      else if (st.last.corr !== null) corr = bi(`O${st.last.b ? '₁' : '₀'} × 2^(m_old − m_new) = ${st.last.corr.toFixed(4)}`, `O${st.last.b ? '₁' : '₀'} × 2^(m_old − m_new) = ${st.last.corr.toFixed(4)}`);
      const diff = st.est === null ? null : Math.abs(st.est - ex);
      readouts.innerHTML = `
        ${bufCard(0)}${bufCard(1)}
        <div class="readout"><span class="k">${bi('Last correction', '最近一次修正')}</span><span class="v sm-corr">${st.last && st.last.corr !== null ? '×' + st.last.corr.toFixed(3) : '—'}</span><span class="s">${corr}</span></div>
        <div class="readout key"><span class="k">${bi('Output so far', '当前输出')}</span><span class="v">${fmt(st.est)}</span><span class="s">${bi(`softmax · V over the ${k * TILE} tokens seen`, `已见 ${k * TILE} 个 token 上的 softmax · V`)}</span></div>
        <div class="readout"><span class="k">${bi('Exact', '精确值')}</span><span class="v">${ex.toFixed(4)}</span><span class="s">${bi(`|difference| ${diff === null ? '—' : diff.toExponential(1)}`, `|差值| ${diff === null ? '—' : diff.toExponential(1)}`)}</span></div>`;
      if (fresh) pulse($('.sm-corr', readouts));
      stepBtn.disabled = k >= T;
      playBtn.innerHTML = timer ? bi('Pause', '暂停') : bi(k >= T ? 'Replay' : 'Play', k >= T ? '重放' : '播放');
    }

    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    stepBtn.addEventListener('click', () => { stop(); if (k < T) { k++; render(true); } });
    playBtn.addEventListener('click', () => {
      if (timer) { stop(); render(false); return; }
      if (k >= T) k = 0;
      render(false);
      timer = setInterval(() => {
        if (k >= T) { stop(); render(false); return; }
        k++; render(true);
        if (k >= T) { stop(); render(false); }
      }, reduceMotion ? 500 : 900);
      render(false);
    });
    resetBtn.addEventListener('click', () => { stop(); k = 0; render(false); });
    newBtn.addEventListener('click', () => { stop(); seed = Math.floor(Math.random() * 1e9); gen(); k = 3; render(false); });
    gen();
    render(false);
  }

  const el = document.getElementById('fa-elig'); if (el) initElig(el);
  const pg = document.getElementById('fa-pages'); if (pg) initPages(pg);
  const sp = document.getElementById('fa-split'); if (sp) initSplit(sp);
  const sm = document.getElementById('fa-softmax'); if (sm) initSoftmax(sm);
})();
