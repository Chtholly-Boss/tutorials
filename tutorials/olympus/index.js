// Olympus tutorial 00, The promise: one warp, one island.
// K (the kernel's instructions) and ISLAND (the probe) are real: DeepGEMM 1d2d k512, indices 1095-1109, decoded by
// Olympus from /ws/corpus/t3_dg_1d2d_k512/kernel.cubin (sha256 e0f1350c...), and the search planner's c.tile_done
// island as listed in /ws/runs/m7/final-48360e9/a6/sbwait/scan.md. The issue model is a simple in-order one.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const num = (x) => x.toLocaleString('en-US');
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function S(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  // an SVG <text> with an English and a Chinese <tspan> (site.css hides the other [lang])
  function ST(parent, attrs, en, zh) {
    const t = S('text', attrs, parent);
    S('tspan', { lang: 'en' }, t, en);
    S('tspan', { lang: 'zh-CN' }, t, zh == null ? en : zh);
    return t;
  }

  // one floating tooltip (widgets.css .tip)
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(html, ev) {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - 14;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };

  // =====================================================================
  // One warp, one island: DeepGEMM k512's tile tail with no probe, and with the c.tile_done island.
  // =====================================================================
  function initPromise(host) {
    const svg = $('svg', host), detail = $('.pw-detail', host), readouts = $('.readouts', host), tbody = $('tbody', host);
    const toggle = $('#pw-kernel-sb', host);
    const viewBtns = $$('[data-view]', host);
    const playBtn = $('[data-act="play"]', host), stepBtn = $('[data-act="step"]', host), resetBtn = $('[data-act="reset"]', host);
    const GHZ = 1.75;          // DeepGEMM k512 runs at about 1.72-1.77 GHz under load (EVAL.md, A6)
    const ST_REL = 14;         // a store's read of its sources: priced so the island costs the planner's 28 cycles
    const S2UR_LAT = 37;       // scoreboarded S2UR, measured for a clock read (DECISIONS 40)
    const SB0_HOLD = 1450;     // cycles SB0 stays held after UTMACMDFLUSH: ~0.8-0.9 us per tile at 1.75 GHz (DECISIONS 61)
    const CLOSE = 130;

    // c = [wr_sb, rd_sb, wait mask, stall, yield], exactly as encoded.
    const K = [
      { i: 1095, t: 'UTMASTG.2D [UR20], [UR32]', c: [7, 2, [], 1, 0], lat: ST_REL,
        d: bi('A TMA store of the finished tile, one of four. It reads its uniform registers through read scoreboard SB2.', '把算完的 tile 用 TMA 写回，共四条之一。它通过读 scoreboard SB2 读取自己的 uniform 寄存器。') },
      { i: 1096, t: 'UTMASTG.2D [UR16], [UR32]', c: [7, 2, [], 3, 0], lat: ST_REL,
        d: bi('The next TMA store; stall 3.', '下一条 TMA store；stall 3。') },
      { i: 1097, t: 'UTMASTG.2D [UR24], [UR32]', c: [7, 2, [], 1, 0], lat: ST_REL,
        d: bi('The last of the tile\'s TMA stores.', '这个 tile 的最后一条 TMA store。') },
      { i: 1098, t: 'UTMACMDFLUSH', c: [7, 0, [], 2, 0], lat: 'sb0', async: true,
        d: bi('Commits the stores and claims SB0 until the TMA unit has read the tile out of shared memory. The kernel itself waits on SB0 only one tile later (<code>DEPBAR.LE SB0</code>), so without probes this warp goes straight on.', '提交这些 store，并占用 SB0，直到 TMA 单元把 tile 从共享内存读完。kernel 自己要到下一个 tile 才等 SB0（<code>DEPBAR.LE SB0</code>），所以没有探针时，这个 warp 直接往下走。') },
      { i: 1099, t: 'BSYNC PT, B0', c: [7, 7, [2], 5, 0],
        d: bi('Reconverges the warp. Its wait mask {2} holds it until the stores have read their registers.', '让 warp 重新汇合。等待掩码 {2} 让它一直等到各 store 读完寄存器。') },
      { i: 1100, t: 'S2UR UR16, SR_CTAID.X', c: [2, 7, [], 1, 0], lat: S2UR_LAT, key: true,
        d: bi('The instruction the site sits in front of. It reads the block index into UR16 and claims SB2 as a write scoreboard.', '站点就在这条指令之前。它把 block 下标读进 UR16，并把 SB2 占作写 scoreboard。') },
      { i: 1101, t: 'UIADD3 UR4, UPT, UPT, UR4, 0x1, URZ', c: [7, 7, [], 1, 0], d: bi('Counts the tile this block has finished.', '把这个 block 完成的 tile 数加一。') },
      { i: 1102, t: 'ISETP.NE.AND P0, PT, RZ, UR40, PT', c: [7, 7, [], 1, 0], d: bi('A predicate for the phase flip below.', '为下面的相位翻转准备一个谓词。') },
      { i: 1103, t: 'NOP', c: [7, 7, [], 3, 1], d: bi('ptxas\'s own padding: 3 more cycles.', 'ptxas 自己放的填充：再等 3 个周期。') },
      { i: 1104, t: 'SEL R5, RZ, 0x1, P0', c: [7, 7, [], 4, 1], d: bi('0 or 1 from P0.', '按 P0 取 0 或 1。') },
      { i: 1105, t: 'LOP3.LUT PT, R184, R184, R5, RZ, 0x3c, !PT', c: [7, 7, [], 1, 0], d: bi('Flips a phase bit (R184 ^= R5).', '翻转一个相位位（R184 ^= R5）。') },
      { i: 1106, t: 'UIMAD UR16, UR4, 0x84, UR16', c: [7, 7, [2], 4, 1],
        d: bi('Next tile index = UR4 × 0x84 + block index. Its wait mask {2} waits for the <code>S2UR</code>.', '下一个 tile 的下标 = UR4 × 0x84 + block 下标。等待掩码 {2} 等 <code>S2UR</code> 的结果。') },
      { i: 1107, t: 'UISETP.GE.U32.AND UP0, UPT, UR16, UR14, UPT', c: [7, 7, [], 6, 1], d: bi('Past the last tile?', '是否已超过最后一个 tile？') },
      { i: 1108, t: 'PLOP3.LUT P0, PT, PT, PT, UP0, 0x80, 0x0', c: [7, 7, [], 13, 1], d: bi('Moves the answer into P0; stall 13.', '把结果搬进 P0；stall 13。') },
      { i: 1109, t: '@!P0 BRA PT, -0x3f60', c: [7, 7, [], 5, 0], d: bi('Back to the top of the tile loop at 0x600.', '跳回 0x600 处 tile 循环的开头。') }
    ];
    // The island at site c.tile_done (s19, before index 1100). The last NOP's wait mask is the toggle's target.
    const ISLAND = [
      { t: 'ELECT P0, URZ, ~URZ', c: [7, 7, [], 1, 0], d: bi('Elects one lane to store. P0 is dead here.', '选出一个 lane 来执行 store。P0 在这里已死。') },
      { t: 'ULOP3.LUT UPT, UR0, UR62, 0xff, URZ, 0xc0, !UPT', c: [7, 7, [], 1, 0], d: bi('Ring index = record count &amp; 0xff. UR62 is the counter INIT keeps live; UR0 is dead.', '环形缓冲下标 = 记录计数 &amp; 0xff。UR62 是 INIT 一直保持活跃的计数器；UR0 已死。') },
      { t: 'CS2R.32 R4, SR_CLOCKLO', c: [7, 7, [], 1, 0], d: bi('Reads the SM clock into the dead R4. Fixed latency, no scoreboard.', '把 SM 时钟读进已死的 R4。固定延迟，不用 scoreboard。') },
      { t: 'UIADD3 UR62, UPT, UPT, UR62, 0x1, URZ', c: [7, 7, [], 2, 0], d: bi('Counts the record.', '记录计数加一。') },
      { t: 'UIMAD.WIDE.U32 {UR0,UR1}, UPT, UR0, 0x4, {UR60,UR61}', c: [7, 7, [], 1, 0], d: bi('Entry address = slot base {UR60,UR61} + 4 × index.', '条目地址 = 槽位基址 {UR60,UR61} + 4 × 下标。') },
      { t: 'LEA.LO R4, PT, R4, 0x14, 0x6', c: [7, 7, [], 7, 1], d: bi('Record word = clock &lt;&lt; 6 | (site 19 + 1).', '记录字 = 时钟 &lt;&lt; 6 | (站点 19 + 1)。') },
      { t: 'STG.E [RZ+UR0+0x20], R4', c: [7, 2, [], 2, 0], lat: ST_REL, d: bi('Stores the word past the 32-byte slot header. Its read of R4 releases SB2, which is free at this site.', '把记录字写到 32 字节槽位头之后。它读完 R4 就释放 SB2，而 SB2 在这个站点是空闲的。') },
      { t: 'NOP', c: [7, 7, [2], 1, 0], last: true, d: bi('Waits on SB2, the island\'s own claim, so no probe state outlives the island. With the toggle on, its wait mask becomes {0,2}: it also waits on SB0, which only the kernel\'s TMA stores hold.', '等 SB2，也就是 island 自己占用的那个，确保探针状态不会带出 island。打开开关后，它的等待掩码变成 {0,2}：还要等 SB0，而 SB0 只被 kernel 的 TMA store 占着。') }
    ];
    const SITE = 5;   // the island goes before K[5] (index 1100)
    const ctrlOf = (x, kernelWait) => (x.last && kernelWait) ? [7, 7, [0, 2], 1, 0] : x.c;

    const lanes = () => [
      { id: 'a', name: bi('(a) no probe', '(a) 无探针'), sub: bi('ptxas\'s schedule', 'ptxas 的调度'), list: K.map((x) => ({ x, kind: 'k' })) },
      { id: 'b', name: bi('(b) with the island', '(b) 有 island'), sub: toggle.checked ? bi('waits on SB0 too', '还要等 SB0') : bi('own scoreboard only', '只等自己的 scoreboard'),
        list: [...K.slice(0, SITE).map((x) => ({ x, kind: 'k' })), ...ISLAND.map((x) => ({ x, kind: 'o' })), ...K.slice(SITE).map((x) => ({ x, kind: 'k' }))] }
    ];

    // in-order issue: wait for the previous stall and the wait mask's scoreboards
    function simulate(list, T, kernelWait) {
      const rel = [0, 0, 0, 0, 0, 0], owner = ['', '', '', '', '', ''];
      let t = 0, asyncSpan = null;
      const rows = list.map(({ x, kind }) => {
        const c = ctrlOf(x, kernelWait);
        const [wr, rd, wait, stall] = c;
        let w = t;
        for (const s of wait) w = Math.max(w, rel[s]);
        const blockers = wait.filter((s) => rel[s] > t).map((s) => ({ s, owner: owner[s], until: rel[s] }));
        const issue = w;
        const lat = x.lat === 'sb0' ? T : (x.lat || 0);
        for (const s of [wr, rd]) if (s !== 7) { rel[s] = Math.max(rel[s], issue + lat); owner[s] = kind === 'k' ? 'kernel' : 'own'; }
        if (x.async) asyncSpan = { a: issue, b: issue + T };
        const row = { x, kind, c, ready: t, issue, blockers, next: issue + Math.max(stall, 1) };
        t = row.next;
        return row;
      });
      return { rows, end: t, asyncSpan };
    }

    let view = 'close', sims = [], cursor = 0, playing = false, raf = 0, sel = null, LANES = lanes();
    let marks = [];

    const rowDefs = [
      ...K.slice(0, SITE).map((x) => ({ x, tag: String(x.i), lanes: { a: x, b: x } })),
      ...ISLAND.map((x, j) => ({ x, tag: 'P' + (j + 1), cls: 'o', lanes: { b: x } })),
      ...K.slice(SITE).map((x) => ({ x, tag: String(x.i), lanes: { a: x, b: x } }))
    ];
    const ctrlText = (c) => `[${c[0]}:${c[1]}:{${c[2].join(',')}}:${c[3]}:${c[4]}]`;

    function buildTable() {
      tbody.innerHTML = rowDefs.map((r, k) =>
        `<tr data-k="${k}" class="${r.cls || ''}"><td class="mono">${r.tag}</td><td class="mono pw-ins">${esc(r.x.t)}</td><td class="mono pw-ctl" data-ctl></td>` +
        ['a', 'b'].map((l) => `<td class="num" data-l="${l}"></td>`).join('') + '</tr>').join('');
      $$('tr', tbody).forEach((tr) => tr.addEventListener('click', () => select(rowDefs[+tr.dataset.k].x)));
    }

    function viewEnd() {
      if (view === 'close') return CLOSE;
      return Math.max(...sims.map((s) => s.end), sims[0].asyncSpan ? sims[0].asyncSpan.b : 0) + 8;
    }

    function draw() {
      LANES = lanes();
      sims = LANES.map((L) => simulate(L.list, SB0_HOLD, toggle.checked));
      const V = viewEnd();
      const X0 = 150, X1 = 868, sx = (t) => X0 + (Math.min(t, V) / V) * (X1 - X0);
      const TOP = 34, PITCH = 84, BH = 30;
      svg.innerHTML = '';
      marks = [];
      const defs = S('defs', null, svg);
      const hatch = S('pattern', { id: 'pw-hatch', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      S('line', { x1: 0, y1: 0, x2: 0, y2: 5, class: 'pw-hatch-line' }, hatch);
      const ahatch = S('pattern', { id: 'pw-ahatch', width: 4, height: 4, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)' }, defs);
      S('line', { x1: 0, y1: 0, x2: 0, y2: 4, class: 'pw-ahatch-line' }, ahatch);
      const clip = S('clipPath', { id: 'pw-clip' }, defs);
      S('rect', { x: X0, y: 0, width: X1 - X0 + 1, height: 260 }, clip);

      const keyA = sims[0].rows.find((r) => r.x.key);
      S('line', { x1: sx(keyA.issue), y1: TOP - 14, x2: sx(keyA.issue), y2: TOP + 2 * PITCH - 30, class: 'pw-guide' }, svg);
      ST(svg, { x: sx(keyA.issue) + 4, y: TOP - 18, class: 't-sm muted' }, `S2UR @1100 without a probe: cycle ${keyA.issue}`, `无探针时 S2UR @1100：第 ${keyA.issue} 周期`);

      const plot = S('g', { 'clip-path': 'url(#pw-clip)' }, svg);
      LANES.forEach((L, li) => {
        const y = TOP + li * PITCH, sim = sims[li];
        const nameEl = S('foreignObject', { x: 0, y: y - 2, width: 146, height: 44 }, svg);
        nameEl.innerHTML = `<div xmlns="http://www.w3.org/1999/xhtml" class="pw-lane"><b>${L.name}</b><span>${L.sub}</span></div>`;
        S('line', { x1: X0, y1: y + BH + 1, x2: X1, y2: y + BH + 1, class: 'axis' }, plot);
        if (sim.asyncSpan) {
          const a = sx(sim.asyncSpan.a), b = sx(sim.asyncSpan.b);
          S('rect', { x: a, y: y + BH + 6, width: Math.max(b - a, 1), height: 7, rx: 2, class: 'pw-async' }, plot);
          if (li === 0) ST(plot, { x: a + 4, y: y + BH + 25, class: 't-sm pw-async-t' }, 'SB0 held: the TMA unit reads the tile out of shared memory', 'SB0 被占用：TMA 单元正从共享内存读出 tile');
          if (sim.asyncSpan.b > V) ST(svg, { x: X1 - 2, y: y + BH + 25, class: 't-sm muted', 'text-anchor': 'end' }, `released at ${num(Math.round(sim.asyncSpan.b))} →`, `第 ${num(Math.round(sim.asyncSpan.b))} 周期释放 →`);
        }
        let isl = null;
        sim.rows.forEach((r) => {
          if (r.issue > r.ready) {
            const a = sx(r.ready), b = sx(r.issue);
            const w = S('rect', { x: a, y: y + 4, width: Math.max(b - a, 1), height: BH - 8, class: 'pw-wait' }, plot);
            marks.push({ el: w, t: r.ready });
            const en = r.blockers.map((q) => `SB${q.s} (${q.owner === 'kernel' ? 'kernel' : 'own'})`).join(' + ');
            const zh = r.blockers.map((q) => `SB${q.s}（${q.owner === 'kernel' ? 'kernel 的' : '自己的'}）`).join(' + ');
            if (b - a > 150) {
              const tx = ST(plot, { x: (a + Math.min(b, X1)) / 2, y: y + BH / 2 + 4, class: 't-sm pw-wait-t', 'text-anchor': 'middle' }, 'waits on ' + en, '等待 ' + zh);
              marks.push({ el: tx, t: r.ready });
            }
          }
          if (r.x.key && li > 0 && r.issue >= V) {
            ST(svg, { x: X1 - 2, y: y - 5, class: 't-sm pw-shift', 'text-anchor': 'end' }, `S2UR @1100 at cycle ${num(r.issue)}: +${num(r.issue - keyA.issue)} →`, `S2UR @1100 在第 ${num(r.issue)} 周期：+${num(r.issue - keyA.issue)} →`);
          }
          if (r.issue >= V) return;
          const a = sx(r.issue), b = sx(r.next);
          const g = S('g', { class: 'pw-ins-g', tabindex: 0, role: 'button', 'aria-label': r.x.t }, plot);
          S('rect', { x: a, y: y, width: Math.max(b - a - 1.2, 1.5), height: BH, rx: 1.5, class: 'pw-' + r.kind + (r.x === sel ? ' sel' : '') }, g);
          if (b - a > 30) S('text', { x: a + 3, y: y + BH / 2 + 4, class: 't-sm pw-lbl' }, g, r.kind === 'k' ? String(r.x.i) : r.x.t.split(' ')[0]);
          g.addEventListener('click', () => select(r.x));
          g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(r.x); } });
          g.addEventListener('mousemove', (e) => showTip(`<b>${esc(r.x.t)}</b> ${ctrlText(r.c)}<br>${bi(`issues at cycle ${num(r.issue)}`, `第 ${num(r.issue)} 周期发射`)}`, e));
          g.addEventListener('mouseleave', hideTip);
          marks.push({ el: g, t: r.issue });
          if (r.kind !== 'k') { isl = isl || { a: r.issue, b: r.next }; isl.b = r.next; }
          if (r.x.key && li > 0) {
            S('path', { d: `M${a},${y - 3} l-4,-6 h8 z`, class: 'pw-key' }, svg);
            S('text', { x: Math.min(a + 7, X1 - 40), y: y - 4, class: 't-sm pw-shift' }, svg, `+${num(r.issue - keyA.issue)}`);
          }
        });
        if (isl) {
          const a = sx(isl.a), b = sx(Math.min(isl.b, V));
          S('path', { d: `M${a},${y - 4} v-4 H${b} v4`, class: 'pw-brace' }, plot);
        }
      });
      const AY = TOP + 2 * PITCH - 16;
      S('line', { x1: X0, y1: AY, x2: X1, y2: AY, class: 'axis' }, svg);
      const step = V <= 150 ? 20 : V <= 400 ? 50 : V <= 900 ? 100 : 250;
      for (let t = 0; t <= V; t += step) {
        S('line', { x1: sx(t), y1: AY, x2: sx(t), y2: AY + 4, class: 'axis' }, svg);
        S('text', { x: sx(t), y: AY + 16, class: 't-sm muted', 'text-anchor': t === 0 ? 'start' : 'middle' }, svg, num(t));
      }
      ST(svg, { x: X1, y: AY + 30, class: 't-sm muted', 'text-anchor': 'end' }, `cycles (${num(Math.round(V / GHZ))} ns at ${GHZ} GHz)`, `周期（${GHZ} GHz 下共 ${num(Math.round(V / GHZ))} ns）`);
      const cur = S('line', { x1: X0, y1: TOP - 10, x2: X0, y2: AY, class: 'pw-cursor' }, svg);
      cur.setAttribute('stroke', 'currentColor'); cur.setAttribute('stroke-width', '1.5');
      svg.__cur = { el: cur, sx };
      svg.setAttribute('viewBox', `0 0 880 ${AY + 38}`);
      fillTable();
      paintCursor();
      renderReadouts();
    }

    function fillTable() {
      const lookup = { a: new Map(sims[0].rows.map((r) => [r.x, r])), b: new Map(sims[1].rows.map((r) => [r.x, r])) };
      $$('tr', tbody).forEach((tr) => {
        const def = rowDefs[+tr.dataset.k];
        tr.classList.toggle('sel', def.x === sel);
        $('[data-ctl]', tr).textContent = ctrlText(ctrlOf(def.x, toggle.checked));
        $$('td[data-l]', tr).forEach((td) => {
          const l = td.dataset.l, r = def.lanes[l] ? lookup[l].get(def.lanes[l]) : null;
          td.dataset.t = r ? r.issue : '';
          td.innerHTML = r ? num(r.issue) + (r.blockers.length ? ` <span class="pw-waitnote">${bi('after', '等')} ${r.blockers.map((q) => 'SB' + q.s).join('+')}</span>` : '') : '<span class="muted">·</span>';
        });
      });
    }

    function renderReadouts() {
      const key = sims.map((s) => s.rows.find((r) => r.x.key).issue);
      const shift = key[1] - key[0];
      const last = sims[1].rows.find((r) => r.x.last);
      const waits = last.blockers.map((q) => 'SB' + q.s + (q.owner === 'kernel' ? '*' : '')).join(' + ') || '–';
      readouts.innerHTML = `
        <div class="readout"><span class="k">${bi('(a) no probe', '(a) 无探针')}</span><span class="v">${num(key[0])} / ${num(sims[0].end)}</span><span class="s">${bi('cycle of S2UR @1100 / end of the tail', 'S2UR @1100 的周期 / 尾部结束')}</span></div>
        <div class="readout key"><span class="k">${bi('(b) the kernel\'s instructions shift by', '(b) kernel 指令推迟')}</span><span class="v">+${num(shift)}</span><span class="s">${bi(`cycles, ≈ ${num(Math.round(shift / GHZ))} ns`, `个周期，约 ${num(Math.round(shift / GHZ))} ns`)}</span></div>
        <div class="readout"><span class="k">${bi('the island\'s last wait blocks on', 'island 最后的等待卡在')}</span><span class="v">${waits}</span><span class="s">${bi('* = a scoreboard only the kernel holds', '* = 只有 kernel 占用的 scoreboard')}</span></div>
        <div class="readout"><span class="k">${bi('SB0 held after the flush', 'flush 后 SB0 被占用')}</span><span class="v">${num(SB0_HOLD)}</span><span class="s">${bi(`cycles, ≈ ${(SB0_HOLD / GHZ / 1000).toFixed(2)} µs`, `个周期，约 ${(SB0_HOLD / GHZ / 1000).toFixed(2)} µs`)}</span></div>`;
    }

    function paintCursor() {
      const c = svg.__cur;
      if (!c) return;
      const x = c.sx(cursor);
      c.el.setAttribute('x1', x); c.el.setAttribute('x2', x);
      marks.forEach((m) => m.el.style.opacity = m.t > cursor + 1e-6 ? 0.22 : 1);
      $$('td[data-l]', tbody).forEach((td) => td.classList.toggle('done', td.dataset.t !== '' && +td.dataset.t <= cursor));
    }

    function select(x) {
      sel = x;
      const where = LANES.map((L, li) => {
        const r = sims[li].rows.find((q) => q.x === x);
        return r ? `${L.id}: ${num(r.issue)}` : null;
      }).filter(Boolean).join(' · ');
      detail.innerHTML = `<code>${esc(x.t)}</code> <code>${ctrlText(ctrlOf(x, toggle.checked))}</code> ${x.d}<span class="pw-where">${bi('issues at cycle', '发射周期')} ${where}</span>`;
      draw();
    }

    function stop(label) {
      playing = false;
      cancelAnimationFrame(raf);
      playBtn.innerHTML = label || bi('▶ Play', '▶ 播放');
    }
    function play() {
      if (playing) { stop(); return; }
      const V = viewEnd();
      if (cursor >= V) cursor = 0;
      if (reduceMotion) { cursor = V; paintCursor(); playBtn.innerHTML = bi('▶ Replay', '▶ 重放'); return; }
      playing = true;
      playBtn.innerHTML = bi('Pause', '暂停');
      const dur = view === 'close' ? 5200 : 7000;
      let last = performance.now();
      const tick = (now) => {
        cursor = Math.min(V, cursor + ((now - last) / dur) * V);
        last = now;
        paintCursor();
        if (cursor >= V) { stop(bi('▶ Replay', '▶ 重放')); return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    function step() {
      stop();
      const V = viewEnd();
      if (cursor >= V) cursor = -1;
      const times = [];
      sims.forEach((s) => s.rows.forEach((r) => { times.push(r.issue); if (r.issue > r.ready) times.push(r.ready); }));
      const nxt = times.filter((t) => t > cursor + 1e-6 && t <= V).sort((p, q) => p - q)[0];
      cursor = nxt == null ? V : nxt;
      paintCursor();
    }
    function setView(v) {
      view = v;
      viewBtns.forEach((o) => o.setAttribute('aria-pressed', String(o.dataset.view === v)));
      stop(); draw(); cursor = viewEnd(); paintCursor();
    }

    playBtn.addEventListener('click', play);
    stepBtn.addEventListener('click', step);
    resetBtn.addEventListener('click', () => { stop(); cursor = 0; paintCursor(); });
    toggle.addEventListener('change', () => {
      // a kernel wait is only visible on the whole tail; the island's own 28 cycles only up close
      setView(toggle.checked ? 'whole' : 'close');
      if (sel) select(sel);
    });
    viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    buildTable();
    sims = LANES.map((L) => simulate(L.list, SB0_HOLD, toggle.checked));
    cursor = Infinity;
    select(K[SITE]);
    cursor = viewEnd();
    paintCursor();
  }

  const host = document.getElementById('promise');
  if (host) initPromise(host);
})();
