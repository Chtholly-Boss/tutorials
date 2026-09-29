// Olympus overview widgets: three ways to trace one warp, the pipeline explorer, the results dashboard.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  // inside SVG <text>, language twins are <tspan>s (site.css hides the other [lang])
  const tbi = (en, zh) => `<tspan lang="en">${en}</tspan><tspan lang="zh-CN">${zh}</tspan>`;
  const num = (x) => x.toLocaleString('en-US');
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SHA = '40a887a020392413478b73c2ae8996f5ff9d61cc';
  const GH = `https://github.com/Chtholly-Boss/Olympus/blob/${SHA}/`;
  // a.src link pinned to the commit; Markdown files use ?plain=1 so line anchors work
  const src = (path, a, b) => {
    const md = /\.md$/.test(path) ? '?plain=1' : '';
    const range = b && b !== a ? `#L${a}-L${b}` : `#L${a}`;
    const label = b && b !== a ? `${a}–${b}` : `${a}`;
    return `<a class="src" href="${GH}${path}${md}${range}">${path.split('/').pop()}:${label}</a>`;
  };
  const PAPER = 'https://arxiv.org/html/2609.28769v1';
  const sec = (id, label) => `<a class="paper" href="${PAPER}#${id}">${bi('paper', '论文')} §${label}</a>`;

  function S(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  // an SVG <text> with an English and a Chinese <tspan>
  function ST(parent, attrs, en, zh) {
    const t = S('text', attrs, parent);
    S('tspan', { lang: 'en' }, t, en);
    S('tspan', { lang: 'zh-CN' }, t, zh == null ? en : zh);
    return t;
  }

  // one floating tooltip for every widget on the page (styled by widgets.css .tip)
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
  // 1. Three ways to trace one warp: DeepGEMM 1d2d k512's tile tail with no probe,
  //    G-Watch's c.tile_done island and Olympus M6's, on a simple in-order issue model.
  // =====================================================================
  function initThree(host) {
    const svg = $('svg', host), detail = $('.tw-detail', host), readouts = $('.readouts', host), tbody = $('tbody', host);
    const sb0 = $('#tw-sb0', host), sb0Out = $('#tw-sb0-out', host);
    const viewBtns = $$('[data-view]', host);
    const playBtn = $('[data-act="play"]', host), stepBtn = $('[data-act="step"]', host), resetBtn = $('[data-act="reset"]', host);
    const GHZ = 1.75;          // DeepGEMM k512 runs at about 1.72-1.77 GHz under load (EVAL.md, A6)
    const ST_REL = 14;         // a store's read of its sources: priced so M6's island costs the plan report's 28 cycles
    const S2UR_LAT = 37;       // scoreboarded S2UR, measured for a clock read (DECISIONS 40)
    const CLOSE = 130;

    // Kernel: indices 1095-1109, decoded by Olympus from /ws/corpus/t3_dg_1d2d_k512/kernel.cubin.
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
      { i: 1101, t: 'UIADD3 UR4, UPT, UPT, UR4, 0x1, URZ', c: [7, 7, [], 1, 0],
        d: bi('Counts the tile this block has finished.', '把这个 block 完成的 tile 数加一。') },
      { i: 1102, t: 'ISETP.NE.AND P0, PT, RZ, UR40, PT', c: [7, 7, [], 1, 0],
        d: bi('A predicate for the phase flip below.', '为下面的相位翻转准备一个谓词。') },
      { i: 1103, t: 'NOP', c: [7, 7, [], 3, 1], d: bi('ptxas\'s own padding: 3 more cycles.', 'ptxas 自己放的填充：再等 3 个周期。') },
      { i: 1104, t: 'SEL R5, RZ, 0x1, P0', c: [7, 7, [], 4, 1], d: bi('0 or 1 from P0.', '按 P0 取 0 或 1。') },
      { i: 1105, t: 'LOP3.LUT PT, R184, R184, R5, RZ, 0x3c, !PT', c: [7, 7, [], 1, 0], d: bi('Flips a phase bit (R184 ^= R5).', '翻转一个相位位（R184 ^= R5）。') },
      { i: 1106, t: 'UIMAD UR16, UR4, 0x84, UR16', c: [7, 7, [2], 4, 1],
        d: bi('Next tile index = UR4 × 0x84 + block index. Its wait mask {2} waits for the <code>S2UR</code>.', '下一个 tile 的下标 = UR4 × 0x84 + block 下标。等待掩码 {2} 等 <code>S2UR</code> 的结果。') },
      { i: 1107, t: 'UISETP.GE.U32.AND UP0, UPT, UR16, UR14, UPT', c: [7, 7, [], 6, 1], d: bi('Past the last tile?', '是否已超过最后一个 tile？') },
      { i: 1108, t: 'PLOP3.LUT P0, PT, PT, PT, UP0, 0x80, 0x0', c: [7, 7, [], 13, 1], d: bi('Moves the answer into P0; stall 13.', '把结果搬进 P0；stall 13。') },
      { i: 1109, t: '@!P0 BRA PT, -0x3f60', c: [7, 7, [], 5, 0], d: bi('Back to the top of the tile loop at 0x600.', '跳回 0x600 处 tile 循环的开头。') }
    ];
    // Islands at site c.tile_done (s19, before 1100), from /ws/runs/m7/final-48360e9/a6/sbwait/scan.md
    const M6 = [
      { t: 'ELECT P0, URZ, ~URZ', c: [7, 7, [], 1, 0], d: bi('Elects one lane to store. P0 is dead here.', '选出一个 lane 来执行 store。P0 在这里已死。') },
      { t: 'ULOP3.LUT UPT, UR0, UR62, 0xff, URZ, 0xc0, !UPT', c: [7, 7, [], 1, 0], d: bi('Ring index = record count & 0xff. UR62 is the counter INIT keeps live; UR0 is dead.', '环形缓冲下标 = 记录计数 & 0xff。UR62 是 INIT 一直保持活跃的计数器；UR0 已死。') },
      { t: 'CS2R.32 R4, SR_CLOCKLO', c: [7, 7, [], 1, 0], d: bi('Reads the SM clock into the dead R4. Fixed latency, no scoreboard.', '把 SM 时钟读进已死的 R4。固定延迟，不用 scoreboard。') },
      { t: 'UIADD3 UR62, UPT, UPT, UR62, 0x1, URZ', c: [7, 7, [], 2, 0], d: bi('Counts the record.', '记录计数加一。') },
      { t: 'UIMAD.WIDE.U32 {UR0,UR1}, UPT, UR0, 0x4, {UR60,UR61}', c: [7, 7, [], 1, 0], d: bi('Entry address = slot base {UR60,UR61} + 4 × index.', '条目地址 = 槽位基址 {UR60,UR61} + 4 × 下标。') },
      { t: 'LEA.LO R4, PT, R4, 0x14, 0x6', c: [7, 7, [], 7, 1], d: bi('Record word = clock &lt;&lt; 6 | (site 19 + 1).', '记录字 = 时钟 &lt;&lt; 6 | (站点 19 + 1)。') },
      { t: 'STG.E [RZ+UR0+0x20], R4', c: [7, 2, [], 2, 0], lat: ST_REL, d: bi('Stores the word past the 32-byte slot header. Its read of R4 releases SB2, which is free at this site.', '把记录字写到 32 字节槽位头之后。它读完 R4 就释放 SB2，而 SB2 在这个站点是空闲的。') },
      { t: 'NOP', c: [7, 7, [2], 1, 0], d: bi('Waits on SB2, the island\'s own claim, so no probe state outlives the island.', '等 SB2，也就是 island 自己占用的那个，确保探针状态不会带出 island。') }
    ];
    const GW = [
      { t: 'CS2R.32 R209, SR_CLOCKLO', c: [7, 7, [], 6, 0], d: bi('Reads the SM clock; stall 6.', '读 SM 时钟；stall 6。') },
      { t: 'SHF.L.U32 R210, R209, 0x6, RZ', c: [7, 7, [], 1, 0], d: bi('Shifts the clock up 6 bits.', '把时钟左移 6 位。') },
      { t: 'ELECT P3, URZ, ~URZ', c: [7, 7, [], 5, 0], d: bi('Elects one lane.', '选出一个 lane。') },
      { t: 'IADD3 R210, PT, PT, R210, 0x14, RZ', c: [7, 7, [1], 8, 0], d: bi('Adds the site id. It waits on SB1, which nothing holds here.', '加上站点编号。它等 SB1，而这里没有谁占着 SB1。') },
      { t: 'STG.E [RZ+UR58], R210', c: [7, 2, [], 1, 0], lat: ST_REL, d: bi('Stores the record word; its source read releases SB2.', '写入记录字；读完源操作数后释放 SB2。') },
      { t: 'STG.E [RZ+UR58+0x4], R0', c: [7, 2, [], 1, 0], lat: ST_REL, d: bi('Stores a second 32-bit word: the oracle\'s runs use 8-byte records (DECISIONS 16).', '再写一个 32 位字：oracle 的运行使用 8 字节记录（DECISIONS 16）。') },
      { t: 'UIADD3.64 {UR58,UR59}, UPT, UPT, {UR58,UR59}, 0x8, URZ', c: [7, 7, [0, 2], 1, 0], d: bi('Advances the write pointer. Its wait mask {0,2} waits on its own stores (SB2) and on SB0, which only the kernel\'s TMA stores hold.', '推进写指针。等待掩码 {0,2} 既等它自己的 store（SB2），也等 SB0，而 SB0 只被 kernel 的 TMA store 占着。') }
    ];
    const SITE = 5;   // islands go before K[5] (index 1100)
    const LANES = [
      { id: 'a', name: bi('(a) no probe', '(a) 无探针'), sub: bi('ptxas\'s schedule', 'ptxas 的调度'), list: K.map((x) => ({ x, kind: 'k' })) },
      { id: 'b', name: bi('(b) G-Watch', '(b) G-Watch'), sub: bi('waits on SB0 too', '还要等 SB0'), list: [...K.slice(0, SITE).map((x) => ({ x, kind: 'k' })), ...GW.map((x) => ({ x, kind: 'g' })), ...K.slice(SITE).map((x) => ({ x, kind: 'k' }))] },
      { id: 'c', name: bi('(c) Olympus', '(c) Olympus'), sub: bi('own scoreboard only', '只等自己的 scoreboard'), list: [...K.slice(0, SITE).map((x) => ({ x, kind: 'k' })), ...M6.map((x) => ({ x, kind: 'o' })), ...K.slice(SITE).map((x) => ({ x, kind: 'k' }))] }
    ];

    // in-order issue: wait for the previous stall and the wait mask's scoreboards
    function simulate(list, T) {
      const rel = [0, 0, 0, 0, 0, 0], owner = ['', '', '', '', '', ''];
      let t = 0, asyncSpan = null;
      const rows = list.map(({ x, kind }) => {
        const [wr, rd, wait, stall] = x.c;
        let w = t;
        for (const s of wait) w = Math.max(w, rel[s]);
        const blockers = wait.filter((s) => rel[s] > t).map((s) => ({ s, owner: owner[s], until: rel[s] }));
        const issue = w;
        const lat = x.lat === 'sb0' ? T : (x.lat || 0);
        for (const s of [wr, rd]) if (s !== 7) { rel[s] = Math.max(rel[s], issue + lat); owner[s] = kind === 'k' ? 'kernel' : 'own'; }
        if (x.async) asyncSpan = { a: issue, b: issue + T };
        const row = { x, kind, ready: t, issue, blockers, next: issue + Math.max(stall, 1) };
        t = row.next;
        return row;
      });
      return { rows, end: t, asyncSpan };
    }

    let T = +sb0.value, view = 'close', sims = [], cursor = 0, playing = false, raf = 0, sel = null;
    let marks = [];    // {el, t} for the issue-time fade

    // table rows in program order: kernel head, both islands, kernel tail
    const rowDefs = [
      ...K.slice(0, SITE).map((x) => ({ x, tag: String(x.i), lanes: { a: x, b: x, c: x } })),
      ...GW.map((x, j) => ({ x, tag: 'G' + (j + 1), cls: 'g', lanes: { b: x } })),
      ...M6.map((x, j) => ({ x, tag: 'O' + (j + 1), cls: 'o', lanes: { c: x } })),
      ...K.slice(SITE).map((x) => ({ x, tag: String(x.i), lanes: { a: x, b: x, c: x } }))
    ];
    const ctrlText = (c) => `[${c[0]}:${c[1]}:{${c[2].join(',')}}:${c[3]}:${c[4]}]`;

    function buildTable() {
      tbody.innerHTML = rowDefs.map((r, k) =>
        `<tr data-k="${k}" class="${r.cls || ''}"><td class="mono">${r.tag}</td><td class="mono tw-ins">${esc(r.x.t)}</td><td class="mono tw-ctl">${ctrlText(r.x.c)}</td>` +
        ['a', 'b', 'c'].map((l) => `<td class="num" data-l="${l}"></td>`).join('') + '</tr>').join('');
      $$('tr', tbody).forEach((tr) => tr.addEventListener('click', () => select(rowDefs[+tr.dataset.k].x)));
    }

    function viewEnd() {
      if (view === 'close') return CLOSE;
      return Math.max(...sims.map((s) => s.end), sims[0].asyncSpan ? sims[0].asyncSpan.b : 0) + 8;
    }

    function draw() {
      sims = LANES.map((L) => simulate(L.list, T));
      const V = viewEnd();
      const X0 = 150, X1 = 868, sx = (t) => X0 + (Math.min(t, V) / V) * (X1 - X0);
      const TOP = 34, PITCH = 84, BH = 30;
      svg.innerHTML = '';
      marks = [];
      const defs = S('defs', null, svg);
      const hatch = S('pattern', { id: 'tw-hatch', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      S('line', { x1: 0, y1: 0, x2: 0, y2: 5, class: 'tw-hatch-line' }, hatch);
      const ahatch = S('pattern', { id: 'tw-ahatch', width: 4, height: 4, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)' }, defs);
      S('line', { x1: 0, y1: 0, x2: 0, y2: 4, class: 'tw-ahatch-line' }, ahatch);
      const clip = S('clipPath', { id: 'tw-clip' }, defs);
      S('rect', { x: X0, y: 0, width: X1 - X0 + 1, height: 330 }, clip);

      const keyA = sims[0].rows.find((r) => r.x.key);
      // guide at the no-probe issue time of index 1100
      S('line', { x1: sx(keyA.issue), y1: TOP - 14, x2: sx(keyA.issue), y2: TOP + 3 * PITCH - 30, class: 'tw-guide' }, svg);
      ST(svg, { x: sx(keyA.issue) + 4, y: TOP - 18, class: 't-sm muted' }, `S2UR @1100 without a probe: cycle ${keyA.issue}`, `无探针时 S2UR @1100：第 ${keyA.issue} 周期`);

      const plot = S('g', { 'clip-path': 'url(#tw-clip)' }, svg);
      LANES.forEach((L, li) => {
        const y = TOP + li * PITCH, sim = sims[li];
        const nameEl = S('foreignObject', { x: 0, y: y - 2, width: 146, height: 44 }, svg);
        nameEl.innerHTML = `<div xmlns="http://www.w3.org/1999/xhtml" class="tw-lane"><b>${L.name}</b><span>${L.sub}</span></div>`;
        S('line', { x1: X0, y1: y + BH + 1, x2: X1, y2: y + BH + 1, class: 'axis' }, plot);
        // SB0 held by the TMA stores
        if (sim.asyncSpan && T > 0) {
          const a = sx(sim.asyncSpan.a), b = sx(sim.asyncSpan.b);
          S('rect', { x: a, y: y + BH + 6, width: Math.max(b - a, 1), height: 7, rx: 2, class: 'tw-async' }, plot);
          if (li === 0) ST(plot, { x: a + 4, y: y + BH + 25, class: 't-sm tw-async-t' }, 'SB0 held: the TMA unit reads the tile out of shared memory', 'SB0 被占用：TMA 单元正从共享内存读出 tile');
          if (sim.asyncSpan.b > V) ST(svg, { x: X1 - 2, y: y + BH + 25, class: 't-sm muted', 'text-anchor': 'end' }, `released at ${num(Math.round(sim.asyncSpan.b))} →`, `第 ${num(Math.round(sim.asyncSpan.b))} 周期释放 →`);
        }
        let isl = null;
        sim.rows.forEach((r) => {
          if (r.issue > r.ready) {
            const a = sx(r.ready), b = sx(r.issue);
            const w = S('rect', { x: a, y: y + 4, width: Math.max(b - a, 1), height: BH - 8, class: 'tw-wait' }, plot);
            marks.push({ el: w, t: r.ready });
            const en = r.blockers.map((q) => `SB${q.s} (${q.owner === 'kernel' ? 'kernel' : 'own'})`).join(' + ');
            const zh = r.blockers.map((q) => `SB${q.s}（${q.owner === 'kernel' ? 'kernel 的' : '自己的'}）`).join(' + ');
            if (b - a > 150) {
              const tx = ST(plot, { x: (a + Math.min(b, X1)) / 2, y: y + BH / 2 + 4, class: 't-sm tw-wait-t', 'text-anchor': 'middle' }, 'waits on ' + en, '等待 ' + zh);
              marks.push({ el: tx, t: r.ready });
            }
          }
          if (r.x.key && li > 0 && r.issue >= V) {
            ST(svg, { x: X1 - 2, y: y - 5, class: 't-sm tw-shift', 'text-anchor': 'end' }, `S2UR @1100 at cycle ${num(r.issue)}: +${num(r.issue - keyA.issue)} →`, `S2UR @1100 在第 ${num(r.issue)} 周期：+${num(r.issue - keyA.issue)} →`);
          }
          if (r.issue >= V) return;
          const a = sx(r.issue), b = sx(r.next);
          const g = S('g', { class: 'tw-ins-g', tabindex: 0, role: 'button', 'aria-label': r.x.t }, plot);
          S('rect', { x: a, y: y, width: Math.max(b - a - 1.2, 1.5), height: BH, rx: 1.5, class: 'tw-' + r.kind + (r.x === sel ? ' sel' : '') }, g);
          if (b - a > 30) S('text', { x: a + 3, y: y + BH / 2 + 4, class: 't-sm tw-lbl' }, g, r.kind === 'k' ? String(r.x.i) : r.x.t.split(' ')[0]);
          g.addEventListener('click', () => select(r.x));
          g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(r.x); } });
          g.addEventListener('mousemove', (e) => showTip(`<b>${esc(r.x.t)}</b> ${ctrlText(r.x.c)}<br>${bi(`issues at cycle ${num(r.issue)}`, `第 ${num(r.issue)} 周期发射`)}`, e));
          g.addEventListener('mouseleave', hideTip);
          marks.push({ el: g, t: r.issue });
          if (r.kind !== 'k') { isl = isl || { a: r.issue, b: r.next }; isl.b = r.next; }
          if (r.x.key && li > 0) {
            const shift = r.issue - keyA.issue;
            S('path', { d: `M${a},${y - 3} l-4,-6 h8 z`, class: 'tw-key' }, svg);
            S('text', { x: Math.min(a + 7, X1 - 40), y: y - 4, class: 't-sm tw-shift' }, svg, `+${num(shift)}`);
          }
        });
        if (isl) {
          const a = sx(isl.a), b = sx(Math.min(isl.b, V));
          S('path', { d: `M${a},${y - 4} v-4 H${b} v4`, class: 'tw-brace ' + (li === 1 ? 'g' : 'o') }, plot);
        }
      });
      // axis
      const AY = TOP + 3 * PITCH - 16;
      S('line', { x1: X0, y1: AY, x2: X1, y2: AY, class: 'axis' }, svg);
      const step = V <= 150 ? 20 : V <= 400 ? 50 : V <= 900 ? 100 : 250;
      for (let t = 0; t <= V; t += step) {
        S('line', { x1: sx(t), y1: AY, x2: sx(t), y2: AY + 4, class: 'axis' }, svg);
        S('text', { x: sx(t), y: AY + 16, class: 't-sm muted', 'text-anchor': t === 0 ? 'start' : 'middle' }, svg, num(t));
      }
      ST(svg, { x: X1, y: AY + 30, class: 't-sm muted', 'text-anchor': 'end' }, `cycles (${num(Math.round(V / GHZ))} ns at ${GHZ} GHz)`, `周期（${GHZ} GHz 下共 ${num(Math.round(V / GHZ))} ns）`);
      const cur = S('line', { x1: X0, y1: TOP - 10, x2: X0, y2: AY, class: 'tw-cursor' }, svg);
      svg.__cur = { el: cur, sx };
      svg.setAttribute('viewBox', `0 0 880 ${AY + 38}`);
      fillTable();
      paintCursor();
      renderReadouts();
    }

    function fillTable() {
      const lanes = { a: sims[0], b: sims[1], c: sims[2] };
      const lookup = {};
      ['a', 'b', 'c'].forEach((l) => { lookup[l] = new Map(lanes[l].rows.map((r) => [r.x, r])); });
      $$('tr', tbody).forEach((tr) => {
        const def = rowDefs[+tr.dataset.k];
        tr.classList.toggle('sel', def.x === sel);
        $$('td[data-l]', tr).forEach((td) => {
          const l = td.dataset.l, r = def.lanes[l] ? lookup[l].get(def.lanes[l]) : null;
          td.dataset.t = r ? r.issue : '';
          td.innerHTML = r ? num(r.issue) + (r.blockers.length ? ` <span class="tw-waitnote">${bi('after', '等')} ${r.blockers.map((q) => 'SB' + q.s).join('+')}</span>` : '') : '<span class="muted">·</span>';
        });
      });
    }

    function renderReadouts() {
      const key = sims.map((s) => s.rows.find((r) => r.x.key).issue);
      const g = sims[1].rows.find((r) => r.x.t.startsWith('UIADD3.64'));
      readouts.innerHTML = `
        <div class="readout"><span class="k">${bi('(a) no probe', '(a) 无探针')}</span><span class="v">${num(key[0])} / ${num(sims[0].end)}</span><span class="s">${bi('cycle of S2UR @1100 / end of the tail', 'S2UR @1100 的周期 / 尾部结束')}</span></div>
        <div class="readout key"><span class="k">${bi('(b) G-Watch shifts the kernel', '(b) G-Watch 让 kernel 推迟')}</span><span class="v">+${num(key[1] - key[0])}</span><span class="s">${bi(`cycles, ≈ ${((key[1] - key[0]) / GHZ).toFixed(0)} ns; waits ${g.blockers.map((q) => 'SB' + q.s).join(' + ') || 'nothing'}`, `个周期，约 ${((key[1] - key[0]) / GHZ).toFixed(0)} ns；等待 ${g.blockers.map((q) => 'SB' + q.s).join(' + ') || '无'}`)}</span></div>
        <div class="readout key"><span class="k">${bi('(c) Olympus shifts the kernel', '(c) Olympus 让 kernel 推迟')}</span><span class="v">+${num(key[2] - key[0])}</span><span class="s">${bi('cycles; waits only SB2, its own claim', '个周期；只等 SB2，也就是它自己占用的')}</span></div>
        <div class="readout"><span class="k">${bi('SB0 held after the flush', 'flush 后 SB0 被占用')}</span><span class="v">${num(T)}</span><span class="s">${bi(`cycles, ≈ ${(T / GHZ / 1000).toFixed(2)} µs`, `个周期，约 ${(T / GHZ / 1000).toFixed(2)} µs`)}</span></div>`;
    }

    function paintCursor() {
      const c = svg.__cur;
      if (!c) return;
      const x = c.sx(cursor);
      c.el.setAttribute('x1', x); c.el.setAttribute('x2', x);
      marks.forEach((m) => m.el.classList.toggle('dim', m.t > cursor + 1e-6));
      $$('td[data-l]', tbody).forEach((td) => td.classList.toggle('done', td.dataset.t !== '' && +td.dataset.t <= cursor));
    }

    function select(x) {
      sel = x;
      const where = LANES.map((L, li) => {
        const r = sims[li].rows.find((q) => q.x === x);
        return r ? `${L.id}: ${num(r.issue)}` : null;
      }).filter(Boolean).join(' · ');
      detail.innerHTML = `<code>${esc(x.t)}</code> <code>${ctrlText(x.c)}</code> ${x.d}<span class="tw-where">${bi('issues at cycle', '发射周期')} ${where}</span>`;
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
      if (cursor >= V) cursor = -1;             // a finished picture: step through it again from the start
      const times = [];
      sims.forEach((s) => s.rows.forEach((r) => { times.push(r.issue); if (r.issue > r.ready) times.push(r.ready); }));
      const nxt = times.filter((t) => t > cursor + 1e-6 && t <= V).sort((p, q) => p - q)[0];
      cursor = nxt == null ? V : nxt;
      paintCursor();
    }

    playBtn.addEventListener('click', play);
    stepBtn.addEventListener('click', step);
    resetBtn.addEventListener('click', () => { stop(); cursor = 0; paintCursor(); });
    sb0.addEventListener('input', () => {
      T = +sb0.value; sb0Out.textContent = num(T);
      if (!playing) cursor = Infinity;          // show the whole new state; Reset rewinds
      draw();
      if (!playing) { cursor = viewEnd(); paintCursor(); }
    });
    function setView(v) {
      view = v;
      viewBtns.forEach((o) => o.setAttribute('aria-pressed', String(o.dataset.view === v)));
      stop(); draw(); cursor = viewEnd(); paintCursor();
    }
    viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    buildTable();
    sb0Out.textContent = num(T);
    sims = LANES.map((L) => simulate(L.list, T));
    // #three-whole opens the whole-tail view
    if (/three-whole/.test(location.hash)) view = 'whole';
    viewBtns.forEach((o) => o.setAttribute('aria-pressed', String(o.dataset.view === view)));
    cursor = Infinity;
    select(K[SITE]);
    cursor = viewEnd();                         // start with the finished picture; Play replays it from 0
    paintCursor();
  }

  // =====================================================================
  // 2. Pipeline explorer (README "What it does")
  // =====================================================================
  const CH = {
    '01': ['sass.html', bi('01 SASS, control bits and splicing', '01 SASS、控制位与指令拼接')],
    '02': ['liveness.html', bi('02 Dead registers', '02 死寄存器')],
    '03': ['search.html', bi('03 Hazards and the splicing search', '03 冒险与拼接搜索')],
    '04': ['probes.html', bi('04 Probes, records and the runtime', '04 探针、记录与运行时')],
    '05': ['fidelity.html', bi('05 Fidelity against G-Watch', '05 对照 G-Watch 的保真度')]
  };
  const STAGES = [
    { k: 'decode', name: bi('decode', '解码'), mod: 'olympus/isa', out: 'list[Instr]',
      code: src('olympus/isa/decode.py', 1, 24) + ' ' + src('olympus/isa/instr.py', 125, 130),
      paper: sec('S3', '3') + ' ' + sec('S4.SS1', '4.1'), ch: '01',
      what: bi('Turns every 128-bit instruction word into an <code>Instr</code>: mnemonic, pipe, the registers it reads and writes with their widths, its guard, and its control word. Decoding must be complete, because liveness and hazards need every instruction\'s operands; encoding is only needed for probe instructions and relocated branches.',
               '把每个 128 位指令字解成一个 <code>Instr</code>：助记符、流水线、读写的寄存器及其宽度、guard 谓词，以及控制字。解码必须完整，因为活跃性分析和冒险检查需要每条指令的操作数；编码则只用于探针指令和重定位的分支。'),
      fact: bi('M1: 100% decode coverage on 563,372 instructions in 1,010 kernels, and a byte-identical re-encode.', 'M1：在 1,010 个 kernel 的 563,372 条指令上解码覆盖率 100%，重编码逐字节一致。') },
    { k: 'cfg', name: bi('CFG', '控制流图'), mod: 'olympus/cfg', out: 'blocks + edges',
      code: src('olympus/cfg/graph.py', 1, 28), paper: sec('S4.SS3', '4.3'), ch: '02',
      what: bi('Basic blocks and edges over the decoded kernel: direct branches, <code>BRX</code> jump tables from their EIATTR, <code>CALL</code> and <code>RET</code> with a context-insensitive call graph, <code>WARPSYNC.COLLECTIVE</code> targets, predicated <code>EXIT</code>s.',
               '在解码后的 kernel 上划分基本块并连边：直接分支、依据 EIATTR 解析的 <code>BRX</code> 跳转表、用上下文无关调用图处理的 <code>CALL</code> 与 <code>RET</code>、<code>WARPSYNC.COLLECTIVE</code> 的目标，以及带谓词的 <code>EXIT</code>。'),
      fact: bi('A <code>WARPSYNC.COLLECTIVE</code> target decoded as an anchor hung the t2 null splice until it was fixed (DECISIONS 33, 35).', '把 <code>WARPSYNC.COLLECTIVE</code> 的目标误解为锚点，曾让 t2 的空拼接卡死，修复后才通过（DECISIONS 33、35）。') },
    { k: 'live', name: bi('liveness', '活跃性'), mod: 'olympus/liveness', out: 'dead_before(i)',
      code: src('olympus/liveness/api.py', 1, 19) + ' ' + src('olympus/liveness/analysis.py', 1, 36), paper: sec('S4.SS3', '4.3'), ch: '02',
      what: bi('Which registers an island before instruction <i>i</i> may overwrite: not live, not held by an in-flight WGMMA, load or store, outside every wgmma fence window, below the role\'s <code>USETMAXREG</code> cap, and not one of the two GPRs sm_90 reserves at the top of every allocation. Also which scoreboards are free at <i>i</i>.',
               '指令 <i>i</i> 之前的 island 可以改写哪些寄存器：不活跃、没有被在途的 WGMMA、load 或 store 占用、不在任何 wgmma fence 窗口内、低于该角色的 <code>USETMAXREG</code> 上限，并且不是 sm_90 在每次分配顶部保留的两个 GPR 之一。它还给出 <i>i</i> 处哪些 scoreboard 空闲。'),
      fact: bi('The dead-register check overwrites every register called dead at every reachable instruction: outputs unchanged on 20 / 20 kernels.', '死寄存器检查在每条可达指令处改写所有判为已死的寄存器：20 / 20 个 kernel 输出不变。') },
    { k: 'haz', name: bi('hazard model', '冒险模型'), mod: 'olympus/hazards', out: 'minimum gaps',
      code: src('olympus/hazards/model.py', 1, 41) + ' ' + src('olympus/hazards/tables.py', 1, 28), paper: sec('S4.SS1', '4.1') + ' ' + sec('S4.SS4', '4.4'), ch: '03',
      what: bi('The minimum issue distance of any instruction pair from <code>sm_90_latencies.txt</code> (RAW, WAW and WAR tables per register file, plus pipe occupancy), the provable delay of the instructions in between, and scoreboard coverage for variable-latency operations.',
               '依据 <code>sm_90_latencies.txt</code> 求任意指令对的最小发射间隔（按寄存器文件分的 RAW、WAW、WAR 表，外加流水线占用），计算中间指令可证明的延迟，并检查变延迟操作的 scoreboard 覆盖。'),
      fact: bi('ptxas schedules 7,245 corpus pairs closer than the table allows. Minimum gaps measured on 957 other kernels accept them, leaving 0 unexplained violations; 6 pairs are explained only by corpus evidence (DECISIONS 43).', 'ptxas 在语料库里有 7,245 个指令对排得比表更近。用另外 957 个 kernel 测出的最小间隔可以接受它们，未解释的违例为 0；其中 6 对只能用语料库本身的证据来解释（DECISIONS 43）。') },
    { k: 'probe', name: bi('probe templates', '探针模板'), mod: 'olympus/probes', out: 'bare probe bodies',
      code: src('olympus/probes/templates.py', 1, 41), paper: sec('S4.SS5', '4.5') + ' ' + sec('A1.SS2.SSS1', 'A.2.1'), ch: '04',
      what: bi('INIT at kernel entry (the buffer address from the appended parameter, this warp\'s slot, the slot header), a RECORD per site (timestamp, value or SM id), and an exit calibration that pairs the SM clock with the global timer again.',
               'kernel 入口处的 INIT（从追加的参数取缓冲区地址，算出本 warp 的槽位，写好槽位头）、每个站点一个 RECORD（时间戳、寄存器值或 SM 编号），以及再次把 SM 时钟与全局计时器配对的退出校准。'),
      fact: bi('Warp mode keeps 3 uniform registers live (slot base pair and counter). URs survive <code>USETMAXREG</code>, so one INIT serves every warp role (DECISIONS 40).', 'warp 模式下只让 3 个 uniform 寄存器保持活跃（槽位基址对与计数器）。UR 在 <code>USETMAXREG</code> 之后依然有效，所以一个 INIT 就能服务所有 warp 角色（DECISIONS 40）。') },
    { k: 'search', name: bi('search', '搜索'), mod: 'olympus/splice/search.py', out: 'one island per site',
      code: src('olympus/splice/search.py', 1, 60) + ' ' + src('olympus/splice/search.py', 892, 917), paper: sec('S4.SS2', '4.2') + ' ' + sec('S5.SS6', '5.6'), ch: '03',
      what: bi('Algorithm 1 per site: depth-first over topological orders, with register partitions over the dead set and the scoreboard choices at each claim, bounded by the critical path; the greedy variant (Xtrace-g) orders by Eq. 4\'s price in one pass. The cost is the delay added before the kernel\'s next instruction.',
               '每个站点跑一遍算法 1：对拓扑序做深度优先搜索，在死寄存器集合上枚举寄存器划分，在每次占用时选择 scoreboard，用关键路径做剪枝；贪心版本（Xtrace-g）按公式 4 的代价一遍排出顺序。代价是 kernel 下一条指令被推迟的时间。'),
      fact: bi('Search median 2.99 ms per site, max 6.56 ms, under a deterministic work budget; greedy equals the optimum on 97.5% of T1–T4 sites (1,603 / 1,644; the 31 worse ones use the borrow or psave form).', '在确定性工作量预算下，每个站点搜索中位数 2.99 ms，最长 6.56 ms；在 97.5% 的 T1–T4 站点上贪心结果等于最优（1,603 / 1,644；较差的 31 个都是 borrow 或 psave 形式）。') },
    { k: 'splice', name: bi('splicer', '拼接器'), mod: 'olympus/splice · olympus/cubin', out: 'spliced cubin',
      code: src('olympus/splice/islands.py', 1, 21) + ' ' + src('olympus/splice/islands.py', 36, 41), paper: sec('S4.SS5', '4.5') + ' ' + sec('S5.SS3', '5.3'), ch: '01',
      what: bi('Inserts the islands and relocates everything that encodes a code offset: branch targets, <code>BRX</code> tables, <code>RET.REL</code> anchors, return-address literals, offset-bearing EIATTRs, symbol sizes. Appends the 8-byte trace-buffer parameter. Anything it cannot relocate makes it leave the kernel untouched.',
               '插入 island，并重定位一切编码了代码偏移的东西：分支目标、<code>BRX</code> 跳转表、<code>RET.REL</code> 锚点、返回地址常量、带偏移的 EIATTR、符号大小。再追加 8 字节的追踪缓冲区参数。凡是无法重定位的，就原样保留该 kernel。'),
      fact: bi('Island filler must not use usched 0 (DRAIN): ptxas\'s own padding NOP cost +59.6% on matmul when placed before every block (DECISIONS 54).', 'island 的填充指令不能用 usched 0（DRAIN）：把 ptxas 自己的填充 NOP 放在每个基本块前，matmul 慢了 59.6%（DECISIONS 54）。') },
    { k: 'rt', name: bi('runtime', '运行时'), mod: 'olympus/runtime', out: 'one traced launch',
      code: src('olympus/runtime/gw.py', 1, 23) + ' ' + src('olympus/runtime/tracer.py', 1, 27), paper: sec('S3', '3') + ' ' + sec('S4.SS5', '4.5'), ch: '04',
      what: bi('Through G-Watch 0.0.35\'s Python API: capture the kernel\'s image at load, load the spliced one, register it in place of the original with a zeroed trace buffer between 0xA5 guard bands, run the case once, check outputs and guards, then run the original again.',
               '通过 G-Watch 0.0.35 的 Python API：在加载时捕获 kernel 的镜像，加载拼接后的镜像，把它连同夹在 0xA5 保护带之间、已清零的追踪缓冲区一起注册为原 kernel 的替身，运行一次，检查输出与保护带，再重新运行一次原 kernel。'),
      fact: bi('Reused, not rewritten (DECISIONS 29). Olympus writes no interception code.', '复用而非重写（DECISIONS 29）。Olympus 不写任何拦截代码。') },
    { k: 'rec', name: bi('.olyt records', '.olyt 记录'), mod: 'olympus/trace/record.py', out: '.olyt file',
      code: src('olympus/trace/record.py', 1, 27), paper: sec('S4.SS5', '4.5') + ' ' + sec('A1.SS2.SSS1', 'A.2.1'), ch: '04',
      what: bi('One slot per warp: a 32-byte header with the (global timer, SM clock) pairs from INIT and from the exit calibration, then a ring of records. Decoding unwraps the truncated clock and converts cycles to ns with each warp\'s own pairs, so no clock frequency is assumed.',
               '每个 warp 一个槽位：32 字节头部，里面是 INIT 和退出校准时各记下的（全局计时器, SM 时钟）对，后面跟着一个记录环。解码时先还原被截断的时钟，再用每个 warp 自己的这两对把周期换算成纳秒，因此不假定任何时钟频率。'),
      fact: bi('Word 0 is clock &lt;&lt; 6 | (site + 1): 26 clock bits, which wrap every 33.9 ms at 1.98 GHz.', '第 0 个字是 时钟 &lt;&lt; 6 | (站点 + 1)：时钟占 26 位，在 1.98 GHz 下每 33.9 ms 回绕一次。') },
    { k: 'ana', name: bi('analysis', '分析'), mod: 'olympus/trace', out: 'trace.json',
      code: src('olympus/trace/pairing.py', 1, 36) + ' ' + src('olympus/trace/analysis.py', 1, 64), paper: bi('not in the paper', '论文中没有对应小节'), ch: '05',
      what: bi('Pairs each warp\'s records into region intervals, then per-region percentiles, pipeline bubbles, per-role activity and concurrency, written as <code>trace.json</code> (schema <code>olympus-trace/1</code>).',
               '把每个 warp 的记录配对成区间，再算出各区间的分位数、流水线气泡、按角色的活动情况和并发度，写成 <code>trace.json</code>（schema 为 <code>olympus-trace/1</code>）。'),
      fact: bi('Both tools\' records go through this same pairing code, so A5 compares like with like (DECISIONS 10).', '两种工具的记录都经过这同一套配对代码，所以 A5 比较的是同一口径（DECISIONS 10）。') },
    { k: 'show', name: bi('olympus show', 'olympus show'), mod: 'olympus/report', out: bi('text view, HTML panel', '文本视图、HTML 面板'),
      code: src('olympus/report/show.py', 1, 40), paper: bi('not in the paper', '论文中没有对应小节'), ch: '04',
      what: bi('The agent view: header, per-region stats, bubbles, an ASCII timeline, concurrency and outliers, with filters by block, warp, role and time window, plus a self-contained HTML panel.',
               '给 agent 看的视图：头部、各区间统计、气泡、ASCII 时间线、并发度和离群值，可按 block、warp、角色和时间窗口过滤，另有一个自包含的 HTML 面板。'),
      fact: bi('A9: from <code>olympus show</code> alone, DeepGEMM\'s tile boundary was located at the math warps\' barrier after the B-scale load (M8).', 'A9：只用 <code>olympus show</code>，就定位到 DeepGEMM 的 tile 边界停在 B-scale 加载之后数学 warp 的 barrier 上（M8）。') }
  ];

  function initPipe(host) {
    const track = $('.pl-track', host), detail = $('.pl-detail', host);
    const walkBtn = $('[data-act="walk"]', host), prevBtn = $('[data-act="prev"]', host), nextBtn = $('[data-act="next"]', host);
    let cur = 0, timer = null;
    track.innerHTML = STAGES.map((s, i) =>
      `<li><button type="button" class="pl-stage" data-i="${i}" aria-pressed="false"><span class="pl-n">${String(i + 1).padStart(2, '0')}</span><span class="pl-name">${s.name}</span><span class="pl-mod">${s.mod}</span></button></li>`).join('');
    const btns = $$('.pl-stage', track);

    function show(i, animate) {
      cur = (i + STAGES.length) % STAGES.length;
      btns.forEach((b, j) => {
        b.setAttribute('aria-pressed', String(j === cur));
        b.classList.toggle('past', j < cur);
      });
      const s = STAGES[cur], [href, chName] = CH[s.ch];
      const prevOut = cur > 0 ? STAGES[cur - 1].out : 'kernel.cubin';
      detail.innerHTML = `
        <div class="pl-io"><span class="pl-chip">${prevOut}</span><span class="pl-arrow" aria-hidden="true">→</span><b>${s.name}</b><span class="pl-arrow" aria-hidden="true">→</span><span class="pl-chip out">${s.out}</span></div>
        <p class="pl-what">${s.what}</p>
        <p class="pl-fact">${s.fact}</p>
        <div class="pl-links">
          <span><span class="k">${bi('code', '代码')}</span>${s.code}</span>
          <span><span class="k">${bi('paper', '论文')}</span>${s.paper}</span>
          <span><span class="k">${bi('chapter', '章节')}</span><a href="${href}">${chName}</a></span>
        </div>`;
      if (animate && !reduceMotion) {
        const chip = $('.pl-chip.out', detail);
        if (chip) chip.animate([{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'ease-out' });
        btns[cur].animate([{ transform: 'translateY(-3px)' }, { transform: 'none' }], { duration: 300, easing: 'ease-out' });
      }
    }
    function stopWalk() { if (timer) { clearInterval(timer); timer = null; } walkBtn.innerHTML = bi('▶ Walk', '▶ 漫游'); }
    btns.forEach((b) => b.addEventListener('click', () => { stopWalk(); show(+b.dataset.i, true); }));
    prevBtn.addEventListener('click', () => { stopWalk(); show(cur - 1, true); });
    nextBtn.addEventListener('click', () => { stopWalk(); show(cur + 1, true); });
    walkBtn.addEventListener('click', () => {
      if (timer) { stopWalk(); return; }
      show(0, true);
      walkBtn.innerHTML = bi('Pause', '暂停');
      timer = setInterval(() => {
        if (cur >= STAGES.length - 1) { stopWalk(); return; }
        show(cur + 1, true);
      }, reduceMotion ? 3200 : 2400);
    });
    show(0, false);
  }

  // =====================================================================
  // 3. Results dashboard (EVAL.md at 48360e9)
  // =====================================================================
  const B = {
    met: bi('✓ met', '✓ 达到'), part: (n) => bi(`◐ ${n}`, `◐ ${n}`), miss: bi('✗ not met', '✗ 未达到'),
    na: bi('— not measured', '— 未测'), ref: bi('reference', '基准')
  };
  const badge = (kind, text) => `<span class="db-badge ${kind}">${text}</span>`;
  const CASES = ['t0_call', 't0_cpasync', 't0_divloop', 't0_ldg_use', 't0_predstore', 't0_regpressure', 't0_shfl', 't0_smem_sync', 't0_straight', 't0_switch',
    't1_attention', 't1_axpy', 't1_matmul_bf16', 't1_softmax', 't2_cutlass_gemm', 't3_dg_1d2d_k2048', 't3_dg_1d2d_k512', 't3_fa3_fwd', 't3_flashmla_decode', 't4_cublas_nvjet'];
  const SETS = ['trace-sche', 'trace-pp', 'trace-mem'];
  const K10 = ['t1_attention', 't1_axpy', 't1_matmul_bf16', 't1_softmax', 't2_cutlass_gemm', 't3_dg_1d2d_k2048', 't3_dg_1d2d_k512', 't3_fa3_fwd', 't3_flashmla_decode', 't4_cublas_nvjet'];
  // A4 overhead %, EVAL.md table (M6 / G-Watch); null = no G-Watch number
  const A4 = {
    'trace-sche': { target: 1, m6: [0.90, 12.45, 0.39, 3.40, 0.06, 0.28, 0.63, 0.03, 0.24, 0.11], gw: [0.39, 12.15, 0.33, 4.57, 0.25, 0.21, 1.47, 0.09, 0.02, 0.00] },
    'trace-pp': { target: 3, m6: [13.83, 14.74, 2.64, 17.68, 3.15, 6.26, 8.86, 6.38, 2.33, 1.66], gw: [null, 16.18, 8.92, 18.94, 3.60, 11.72, 27.46, 8.21, 3.22, 3.35],
      gwNote: { 0: ['G-Watch outputs wrong', 'G-Watch 输出错误'] } },
    'trace-mem': { target: 6, m6: [12.75, 27.15, 20.24, 31.62, 1.66, 21.57, 32.42, 4.92, 31.41, 11.75], gw: null,
      gwText: ['c0 outputs wrong, c1 +1.01 ✓', '+10.40', '+20.14, +0.72 ✓', '+27.67', '3 of 3 chunks ✓', '1 of 3 chunks ✓', '0 of 2 chunks ✓', '3 of 3 chunks ✓', '5 of 7 chunks ✓ (chunk 6: none)', '1 of 2 chunks ✓'] }
  };
  const CI = { 't1_attention|trace-sche': '[0.74, 1.01]', 't2_cutlass_gemm|trace-pp': '[2.93, 3.33]' };

  function tipAttr(tips, html) { tips.push(html); return `data-tip="${tips.length - 1}"`; }
  function details(summaryEn, summaryZh, tableHtml) {
    return `<details class="db-table"><summary>${bi(summaryEn, summaryZh)}</summary><div class="tbl">${tableHtml}</div></details>`;
  }
  const legend = (items) => `<div class="db-legend">${items.map(([cls, lbl]) => `<span><i class="${cls}"></i>${lbl}</span>`).join('')}</div>`;

  function vizA1(tips) {
    const bad = { 't0_call': [1, 1, 1], 't1_attention': [0, 1, 1] };
    const part = { 't3_flashmla_decode': [0, 0, 1] };
    const cell = (tool, c, j) => {
      let k = 'ok', g = '✓', t = bi('outputs bit-exact', '输出逐位一致');
      if (tool === 'gw' && bad[c] && bad[c][j]) { k = 'bad'; g = '✗'; t = c === 't0_call' ? bi('calls not relocated: wrong outputs or a fault (DECISIONS 20)', '调用未重定位：输出错误或出错（DECISIONS 20）') : bi('clobbers a WGMMA\'s register A operand: wrong outputs (DECISIONS 25)', '覆盖了 WGMMA 的寄存器 A 操作数：输出错误（DECISIONS 25）'); }
      else if (tool === 'gw' && part[c] && part[c][j]) { k = 'part'; g = '◐'; t = bi('chunk 6 never completes (DECISIONS 45, 70)', '第 6 块始终无法完成（DECISIONS 45、70）'); }
      return `<span class="db-cell ${k}" ${tipAttr(tips, `<b>${c}</b> · ${SETS[j]}<br>${tool === 'm6' ? 'Olympus' : 'G-Watch'}: ${t}`)}>${g}</span>`;
    };
    const grid = (tool) => `<div class="db-grid">${CASES.map((c) => `<div class="db-col"><span class="db-cname">${c.replace(/^t(\d)_/, 'T$1 ')}</span>${[0, 1, 2].map((j) => cell(tool, c, j)).join('')}</div>`).join('')}</div>`;
    return `<div class="db-gridwrap"><div class="db-gridrow"><span class="db-gl">Olympus</span>${grid('m6')}</div><div class="db-gridrow"><span class="db-gl">G-Watch</span>${grid('gw')}</div></div>
      <p class="db-small">${bi('Each column is a case, rows are trace-sche, trace-pp, trace-mem. G-Watch cells come from its oracle runs (DECISIONS 20, 25, 45).', '每一列是一个 case，三行依次是 trace-sche、trace-pp、trace-mem。G-Watch 的格子取自它的 oracle 运行（DECISIONS 20、25、45）。')}</p>`;
  }

  // horizontal dot plot over a percentage axis
  function dotPlot(tips, rows, opt) {
    const W = 880, L = 210, R = 850, top = 22, rh = 30, H = top + rows.length * rh + 34;
    const sx = (v) => L + ((Math.max(opt.min, Math.min(opt.max, v)) - opt.min) / (opt.max - opt.min)) * (R - L);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${opt.aria}">`;
    if (opt.band) s += `<rect class="db-band" x="${sx(opt.band[0])}" y="${top - 8}" width="${sx(opt.band[1]) - sx(opt.band[0])}" height="${rows.length * rh + 4}"/>`;
    opt.ticks.forEach((t) => { s += `<line class="db-grid-l" x1="${sx(t)}" y1="${top - 8}" x2="${sx(t)}" y2="${top + rows.length * rh - 4}"/><text class="t-sm muted" x="${sx(t)}" y="${top + rows.length * rh + 12}" text-anchor="middle">${t}${opt.unit}</text>`; });
    const lab = (v) => (Array.isArray(v) ? tbi(v[0], v[1]) : v), hlab = (v) => (Array.isArray(v) ? bi(v[0], v[1]) : v);
    if (opt.line != null) s += `<line class="db-target" x1="${sx(opt.line)}" y1="${top - 12}" x2="${sx(opt.line)}" y2="${top + rows.length * rh}"/><text class="t-sm" x="${sx(opt.line) + 4}" y="${top - 12}">${lab(opt.lineLabel)}</text>`;
    rows.forEach((r, i) => {
      const y = top + i * rh + 8;
      s += `<text class="t-sm" x="${L - 10}" y="${y + 4}" text-anchor="end">${lab(r.label)}</text><line class="db-row-l" x1="${L}" y1="${y}" x2="${R}" y2="${y}"/>`;
      r.pts.forEach((p) => {
        if (p.v == null) return;
        const over = p.v > opt.max, x = sx(p.v), dy = p.dy || 0;
        const t = tipAttr(tips, `<b>${r.tipLabel || hlab(r.label)}</b><br>${p.name}: ${p.fmt || (p.v > 0 && opt.signed ? '+' : '') + p.v + opt.unit}`);
        if (p.shape === 'sq') s += `<rect class="db-pt ${p.cls}" x="${x - 5}" y="${y + dy - 5}" width="10" height="10" rx="1.5" ${t}/>`;
        else s += `<circle class="db-pt ${p.cls}" cx="${x}" cy="${y + dy}" r="${p.hollow ? 5 : 5.5}" ${t}/>`;
        if (over) s += `<text class="t-sm" x="${x - 9}" y="${y + dy + 4}" text-anchor="end">${p.fmt} ▶</text>`;
      });
    });
    return s + '</svg>';
  }

  function hbars(tips, set) {
    const d = A4[set], rows = K10.length, W = 880, L = 170, R = 820, top = 20, rh = 28;
    const max = set === 'trace-sche' ? 14 : set === 'trace-pp' ? 30 : 35;
    const sx = (v) => L + (v / max) * (R - L);
    const H = top + rows * rh + 30;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Overhead per kernel for ${set}, Olympus against G-Watch, with the ${d.target}% target.">`;
    for (let t = 0; t <= max; t += set === 'trace-sche' ? 2 : 5) s += `<line class="db-grid-l" x1="${sx(t)}" y1="${top - 6}" x2="${sx(t)}" y2="${top + rows * rh - 6}"/><text class="t-sm muted" x="${sx(t)}" y="${top + rows * rh + 10}" text-anchor="middle">${t}%</text>`;
    K10.forEach((k, i) => {
      const y = top + i * rh;
      s += `<text class="t-sm" x="${L - 8}" y="${y + 10}" text-anchor="end">${k}</text>`;
      const m = d.m6[i], ok = m <= d.target, ci = CI[k + '|' + set];
      s += `<rect class="db-bar o" x="${L}" y="${y}" width="${Math.max(sx(m) - L, 2)}" height="9" rx="2" ${tipAttr(tips, `<b>${k}</b> · ${set}<br>Olympus M6: +${m.toFixed(2)}%${ci ? ' ' + ci : ''} ${ok ? bi('within target', '达标') : bi('over target', '超标')}`)}/>`;
      if (ok) s += `<text class="t-sm db-ok" x="${sx(m) + 4}" y="${y + 8}">✓</text>`;
      if (d.gw) {
        const g = d.gw[i];
        if (g == null) s += `<text class="t-sm muted" x="${sx(d.target) + 8}" y="${y + 20}">${tbi(d.gwNote[i][0], d.gwNote[i][1])}</text>`;
        else {
          const gok = g <= d.target;
          s += `<rect class="db-bar g" x="${L}" y="${y + 11}" width="${Math.max(sx(g) - L, 2)}" height="9" rx="2" ${tipAttr(tips, `<b>${k}</b> · ${set}<br>G-Watch: +${g.toFixed(2)}% ${gok ? bi('within target', '达标') : bi('over target', '超标')}`)}/>`;
          if (gok) s += `<text class="t-sm db-ok" x="${sx(g) + 4}" y="${y + 19}">✓</text>`;
        }
      }
    });
    s += `<line class="db-target" x1="${sx(d.target)}" y1="${top - 12}" x2="${sx(d.target)}" y2="${top + rows * rh - 4}"/><text class="t-sm" x="${sx(d.target) + 4}" y="${top - 10}">${tbi('target', '目标')} ${d.target}%</text>`;
    return s + '</svg>';
  }

  function vizA4(tips, set) {
    const d = A4[set];
    const tabs = SETS.map((s) => `<button type="button" class="btn ghost db-set" data-set="${s}" aria-pressed="${s === set}">${s} ≤ ${A4[s].target}%</button>`).join('');
    const table = `<table><thead><tr><th>${bi('kernel', 'kernel')}</th><th class="num">Olympus M6</th><th>${bi('G-Watch 0.0.35', 'G-Watch 0.0.35')}</th></tr></thead><tbody>` +
      K10.map((k, i) => `<tr><td class="mono">${k}</td><td class="num">+${d.m6[i].toFixed(2)}${d.m6[i] <= d.target ? ' ✓' : ''}</td><td class="mono">${d.gw ? (d.gw[i] == null ? bi(d.gwNote[i][0], d.gwNote[i][1]) : '+' + d.gw[i].toFixed(2) + (d.gw[i] <= d.target ? ' ✓' : '')) : d.gwText[i]}</td></tr>`).join('') + '</tbody></table>';
    const note = set === 'trace-mem'
      ? `<p class="db-small">${bi('Olympus runs trace-mem as one full set; G-Watch splits it into chunks of at most 63 sites, so its column is per chunk. On G-Watch\'s own chunks, Olympus is within 6% on 16 / 26 and G-Watch on 15 / 25.', 'Olympus 把 trace-mem 作为一整组来跑；G-Watch 把它拆成每块最多 63 个站点，所以它那一列按块给出。在 G-Watch 自己的分块上，Olympus 有 16 / 26 块在 6% 以内，G-Watch 有 15 / 25 块。')}</p>`
      : '';
    const leg = legend(set === 'trace-mem' ? [['o', 'Olympus M6'], ['t', bi('target', '目标')]] : [['o', 'Olympus M6'], ['g', 'G-Watch 0.0.35'], ['t', bi('target', '目标')]]);
    return `<div class="db-sets" role="group" aria-label="Probe set">${tabs}</div><div class="w-svg db-chart">${hbars(tips, set)}</div>${leg}${note}${details('Numbers (overhead %, ✓ within target)', '数值（开销 %，✓ 表示达标）', table)}`;
  }

  function stacked(tips, parts, total, aria) {
    const W = 880, L = 20, R = 860, y = 10, h = 22;
    let x = L, s = `<svg viewBox="0 0 ${W} 56" role="img" aria-label="${aria}">`;
    parts.forEach((p) => {
      const w = (p.n / total) * (R - L);
      s += `<rect class="db-seg ${p.cls}" x="${x + 1}" y="${y}" width="${Math.max(w - 2, 1.5)}" height="${h}" rx="2" ${tipAttr(tips, `<b>${num(p.n)}</b> · ${p.label}`)}/>`;
      if (w > 34) s += `<text class="t-sm db-seg-t" x="${x + 2}" y="${y + h + 15}">${num(p.n)}</text>`;
      x += w;
    });
    return s + '</svg>';
  }

  const CRIT = [
    { id: 'A1', name: bi('Correctness: bit-identical outputs', '正确性：输出逐位一致'),
      target: bi('Spliced and original kernels give bit-identical outputs on identical inputs.', '相同输入下，拼接后的 kernel 与原 kernel 输出逐位一致。'),
      oly: [badge('met', B.met), bi('60 / 60 case × sets bit-exact; no case is nondeterministic (5 original runs plus 1 on fresh inputs). The trace sweep is also 60 / 60, with valid buffers.', '60 / 60 个 case × 组合逐位一致；没有哪个 case 是非确定的（原 kernel 跑 5 次，再换新输入跑 1 次）。追踪扫描同样是 60 / 60，缓冲区全部有效。')],
      gw: [badge('miss', B.miss), bi('Wrong outputs on t1_attention trace-pp and trace-mem chunk 0; a broken t0_call image in every set.', 't1_attention 的 trace-pp 和 trace-mem 第 0 块输出错误；t0_call 的镜像在每一组都是坏的。')],
      viz: vizA1, ev: ['/ws/runs/m7/final-48360e9/a1-m6', '/ws/runs/m7/final-48360e9/m6-trace'], cite: src('EVAL.md', 17) },
    { id: 'A2', name: bi('Binary similarity (T1–T4)', '二进制相似度（T1–T4）'),
      target: bi('0 changed basic blocks, ≥ 94% of original instructions unchanged, every changed instruction a relocated branch.', '0 个基本块被改动，≥ 94% 的原始指令不变，改动的指令只能是重定位的分支。'),
      oly: [badge('part', B.part('29 / 30')), bi('0 changed blocks in all 30, and every changed instruction is a relocated branch. t2_cutlass_gemm trace-mem is at 92.86%.', '全部 30 项都没有被改动的基本块，改动的指令也都是重定位的分支。t2_cutlass_gemm 的 trace-mem 为 92.86%。')],
      gw: [badge('miss', bi('✗ 0 / 30', '✗ 0 / 30')), bi('Changed blocks in all 30 (up to 47, in t2 trace-mem); 828 original instructions altered, all by added scoreboard waits.', '30 项都有被改动的基本块（最多 47 个，在 t2 trace-mem）；改动了 828 条原始指令，全部是加 scoreboard 等待。')],
      paper: bi('No changed block; 94–98% of instructions preserved; the changed 2–6% are branches ', '没有基本块被改动；保留 94–98% 的指令；改动的 2–6% 都是分支 ') + sec('S5.SS3', '5.3'),
      cause: bi('D2: 150 inline islands in a 1,900-instruction, branch-dense kernel relocate almost every branch that spans one, and PLAN\'s definition counts a relocated branch as changed.', 'D2：在一个 1,900 条指令、分支密集的 kernel 里插入 150 个内联 island，几乎每个跨过 island 的分支都要重定位，而 PLAN 的定义把重定位的分支算作改动。'),
      viz: (tips) => {
        const T = [['T1', 99.15, 88.10], ['T2', 92.86, 92.16], ['T3', 95.98, 95.68], ['T4', 96.24, 96.02]];
        const rows = T.map(([t, o, g]) => ({ label: t, tipLabel: bi(`${t}, worst case × set`, `${t}，最差的 case × 组合`), pts: [{ v: o, cls: 'o', name: 'Olympus', dy: -5 }, { v: g, cls: 'g', name: 'G-Watch', shape: 'sq', dy: 5 }] }));
        const table = `<table><thead><tr><th>${bi('tier', '档')}</th><th class="num">Olympus</th><th class="num">G-Watch</th></tr></thead><tbody>${T.map(([t, o, g]) => `<tr><td class="mono">${t}</td><td class="num">${o.toFixed(2)}%</td><td class="num">${g.toFixed(2)}%</td></tr>`).join('')}</tbody></table>`;
        return `<div class="w-svg db-chart">${dotPlot(tips, rows, { min: 86, max: 100, ticks: [86, 88, 90, 92, 94, 96, 98, 100], unit: '%', line: 94, lineLabel: '94%', aria: 'Minimum preservation per tier, Olympus against G-Watch, with the 94% threshold.' })}</div>` +
          legend([['o', 'Olympus M6'], ['g sq', 'G-Watch 0.0.35'], ['t', bi('threshold', '阈值')]]) +
          `<p class="db-small">${bi('Worst preservation per tier. Preservation alone does not decide A2: G-Watch\'s T3 and T4 cells are above 94% but still fail, because they have changed blocks.', '各档中最差的保留率。仅凭保留率不能判定 A2：G-Watch 的 T3、T4 高于 94%，却仍不达标，因为它们有被改动的基本块。')}</p>` +
          details('Numbers (minimum preservation)', '数值（最低保留率）', table);
      },
      ev: ['/ws/runs/m7/final-48360e9/m6-static', '/ws/runs/m7/final-48360e9/a2-side'], cite: src('EVAL.md', 30, 44) },
    { id: 'A3', name: bi('Registers: REGCOUNT unchanged', '寄存器：REGCOUNT 不变'),
      target: bi('<code>REGCOUNT</code> unchanged unless the register-raising fallback is explicitly enabled.', '除非显式开启提升寄存器数的回退方案，否则 <code>REGCOUNT</code> 不变。'),
      oly: [badge('met', B.met), bi('60 / 60. The register raise exists as an opt-in fallback and is never used by the evaluated planner.', '60 / 60。提升寄存器数只是一个需显式开启的回退方案，被评估的规划器从不使用它。')],
      gw: [badge('met', B.met), bi('30 / 30 on T1–T4.', 'T1–T4 上 30 / 30。')],
      paper: bi('No register added on any of the six kernels ', '六个 kernel 上都没有增加寄存器 ') + sec('S5.SS5', '5.5'),
      viz: () => `<div class="readouts"><div class="readout key"><span class="k">Olympus</span><span class="v">60 / 60</span><span class="s">${bi('case × sets, T0–T4', 'case × 组合，T0–T4')}</span></div><div class="readout"><span class="k">G-Watch</span><span class="v">30 / 30</span><span class="s">${bi('case × sets, T1–T4', 'case × 组合，T1–T4')}</span></div><div class="readout"><span class="k">${bi('Tightest role cap traced', '所追踪的最紧角色上限')}</span><span class="v">24</span><span class="s">${bi('the producers of FA-3 and nvjet, where G-Watch cannot splice some sites', 'FA-3 与 nvjet 的 producer，G-Watch 在那里有些站点无法拼接')}</span></div></div>`,
      ev: ['/ws/runs/m7/final-48360e9/m6-static', '/ws/runs/m7/final-48360e9/a2-side'], cite: src('EVAL.md', 19) },
    { id: 'A4', name: bi('Overhead ≤ 1 / 3 / 6%', '开销 ≤ 1 / 3 / 6%'),
      target: bi('End-to-end kernel duration: trace-sche ≤ 1%, trace-pp ≤ 3%, trace-mem ≤ 6% on every T1–T4 kernel.', '端到端 kernel 时长：每个 T1–T4 kernel 上 trace-sche ≤ 1%、trace-pp ≤ 3%、trace-mem ≤ 6%。'),
      oly: [badge('miss', B.miss), bi('13 / 30 cells: sche 8 / 10, pp 3 / 10, mem 2 / 10. On trace-pp Olympus is lower than G-Watch on all 9 kernels G-Watch can time.', '13 / 30 格达标：sche 8 / 10，pp 3 / 10，mem 2 / 10。在 trace-pp 上，G-Watch 能测时的 9 个 kernel，Olympus 全都比它低。')],
      gw: [badge('miss', B.miss), bi('7 / 10 sche, 0 / 9 pp, 15 / 25 mem chunks (9 / 29 counted per set).', 'sche 7 / 10，pp 0 / 9，mem 15 / 25 块（按组计为 9 / 29）。')],
      paper: bi('trace-sche ≤ 0.8%, trace-pp 0.9–2.7%, trace-mem 0.7–5.4% across its kernels ', '在论文的各 kernel 上 trace-sche ≤ 0.8%、trace-pp 0.9–2.7%、trace-mem 0.7–5.4% ') + sec('S5.SS4.SSS2', '5.4.2'),
      cause: bi('D4: the record template\'s own work in hot loops (the store\'s source-read release, clock → pack → store); a fixed per-launch cost of INIT and the exit calibration on microsecond T1 kernels; and trace-mem traced as one full set. Two template changes were tried: psave was kept (−1.26 points on matmul trace-mem), a persistent write pointer dropped (0.0%).', 'D4：记录模板在热循环里自身的开销（store 读取源操作数后才释放、时钟 → 打包 → 写入这条链）；INIT 与退出校准在微秒级 T1 kernel 上每次 launch 的固定开销；以及 trace-mem 作为一整组来追踪。尝试过两处模板改动：psave 保留（matmul trace-mem 降低 1.26 个百分点），持久写指针被放弃（0.0%）。'),
      viz: (tips, st) => vizA4(tips, st.set || 'trace-pp'),
      ev: ['/ws/runs/m7/final-48360e9/a4-bench-g3', '/ws/runs/m7/final-48360e9/a4-bench-g4', '/ws/runs/m7/final-48360e9/a4-table'], cite: src('EVAL.md', 59, 88) },
    { id: 'A5', name: bi('Consistency with G-Watch', '与 G-Watch 的一致性'),
      target: bi('The same record counts; per-region p50 and p95 within max(5%, 50 ns) of G-Watch.', '记录条数相同；各区间 p50 与 p95 与 G-Watch 相差不超过 max(5%, 50 ns)。'),
      oly: [badge('part', bi('◐ counts met, timing not', '◐ 条数达到，计时未达到')), bi('Record counts equal on 568 / 568 ordinary sites and pair rates on 72 / 72 regions. Timing: 51 / 72 regions within A5 as written, 56 / 72 under the spread rule (DECISIONS 60), 16 exceed.', '568 / 568 个普通站点记录条数相同，72 / 72 个区间配对率相同。计时：按 A5 原文 51 / 72 个区间达标，按离散规则（DECISIONS 60）56 / 72，16 个超出。')],
      gw: [badge('ref', B.ref), bi('A5 is defined against G-Watch, which makes it the reference even where its own probes perturb the kernel.', 'A5 是相对 G-Watch 定义的，因此即使 G-Watch 自己的探针扰动了 kernel，它仍是基准。')],
      cause: bi('D5: 11 of the 16 are G-Watch\'s own probe costs (9 waits on the kernel\'s TMA-store scoreboards, 2 heavier probes on short or memory-bound regions); 1 is a refused site, 1 is slack moving inside t2\'s producer pipeline, 2 are p95 tails of ≤ 72 ns with no established cause, and 1 (k512 p.kb0.wait, 5 ns over the floor) has not been examined.', 'D5：16 个中有 11 个来自 G-Watch 自己探针的开销（9 个等待 kernel 的 TMA store scoreboard，2 个是较重的探针落在短区间或访存受限的区间上）；1 个来自被拒绝的站点，1 个是 t2 producer 流水线内部余量的挪动，2 个是 ≤ 72 ns 的 p95 尾部，原因未查明；还有 1 个（k512 p.kb0.wait，比下限多 5 ns）尚未检查。'),
      viz: (tips) => {
        const parts = [
          { n: 56, cls: 'n', label: bi('within the spread rule', '在离散规则之内') },
          { n: 9, cls: 'g', label: bi('G-Watch probes wait on TMA-store scoreboards', 'G-Watch 探针等待 TMA store scoreboard') },
          { n: 3, cls: 'g2', label: bi('G-Watch\'s heavier probes', 'G-Watch 较重的探针') },
          { n: 1, cls: 'o', label: bi('a site Olympus refuses', 'Olympus 拒绝的站点') },
          { n: 1, cls: 'o2', label: bi('slack inside t2\'s producer pipeline', 't2 producer 流水线内部的余量') },
          { n: 2, cls: 'u', label: bi('unexplained p95 tails ≤ 72 ns', '原因不明的 p95 尾部 ≤ 72 ns') }
        ];
        const span = [[['no probes', '无探针'], 30.3], [['Olympus', 'Olympus'], 31.0], [['G-Watch', 'G-Watch'], 36.6]];
        let bars = '<svg viewBox="0 0 880 96" role="img" aria-label="DeepGEMM k512 span: uninstrumented 30.3 microseconds, Olympus 31.0, G-Watch 36.6.">';
        span.forEach(([n, v], i) => {
          const y = 8 + i * 26, w = (v / 40) * 600;
          bars += `<text class="t-sm" x="150" y="${y + 12}" text-anchor="end">${tbi(n[0], n[1])}</text><rect class="db-bar ${['n', 'o', 'g'][i]}" x="160" y="${y}" width="${w}" height="16" rx="2" ${tipAttr(tips, `<b>k512</b> ${bi(n[0], n[1])}: ${v} µs`)}/><text class="t-sm" x="${166 + w}" y="${y + 12}">${v.toFixed(1)} µs</text>`;
        });
        bars += '</svg>';
        return `<div class="w-svg db-chart">${stacked(tips, parts, 72, 'The 72 compared regions: 56 within the rule, 16 exceeding by cause.')}</div>
          <ul class="db-causes">${parts.map((p) => `<li><i class="db-sw ${p.cls}"></i><b>${p.n}</b> ${p.label}</li>`).join('')}</ul>
          <p class="db-small">${bi('Where G-Watch is the perturbed tool, Olympus is closer to the kernel without probes. DeepGEMM k512\'s span:', '在 G-Watch 是扰动方的地方，Olympus 更接近不加探针的 kernel。DeepGEMM k512 的跨度：')}</p>
          <div class="w-svg db-chart">${bars}</div>`;
      },
      ev: ['/ws/runs/m7/final-48360e9/a5rep-m6', '/ws/runs/m7/final-48360e9/a5rep-m6-table'], cite: src('EVAL.md', 90, 103) },
    { id: 'A6', name: bi('DeepGEMM tile phases vs source-level truth', 'DeepGEMM tile 各阶段对照源码级真值'),
      target: bi('DeepGEMM 1d2d 4096×7168×512: per-tile phases within ±15% of the 2026-09-27 source-level measurements (PLAN §2.4).', 'DeepGEMM 1d2d 4096×7168×512：每个 tile 的各阶段与 2026-09-27 的源码级测量（PLAN §2.4）相差不超过 ±15%。'),
      oly: [badge('miss', bi('✗ 2 / 8', '✗ 2 / 8')), bi('2 / 8 phases in cycles, 3 / 8 in ns. The ~1.2 µs B-scale barrier hold is gone: as means, 470 ns against 455 ns for the kernel without probes (G-Watch 1,067 ns).', '按周期 2 / 8 个阶段达标，按纳秒 3 / 8。原先约 1.2 µs 的 B-scale barrier 等待消失了：按均值算是 470 ns，而不加探针的 kernel 是 455 ns（G-Watch 为 1,067 ns）。')],
      gw: [badge('miss', bi('✗ 1 / 8', '✗ 1 / 8')), bi('1 / 8. B-scale barrier 1,262 ns, because its probes wait on the kernel\'s TMA scoreboard.', '1 / 8。B-scale barrier 为 1,262 ns，因为它的探针等待 kernel 的 TMA scoreboard。')],
      cause: bi('D6: the kernel without probes, measured with ncu and gated bit-exact, itself misses §2.4 on 4 of its 6 consumer phases; a phase shorter than §2.4 cannot come from probes. The B-scale excess is warp 1\'s own global load. Olympus adds about 40 cycles per probe inside a phase.', 'D6：不加探针的 kernel（用 ncu 测量，并经逐位一致检查）自己在 6 个 consumer 阶段中就有 4 个不符合 §2.4；比 §2.4 更短的阶段不可能是探针造成的。B-scale 多出来的时间是 warp 1 自己的全局加载。Olympus 在一个阶段内每个探针大约增加 40 个周期。'),
      viz: (tips) => {
        const P = [
          [['tile total', 'tile 总计'], 7200, 7129, 8819, -1, 22, -8],
          [['scheduler', '调度'], 580, 444, 546, -24, -6, -27],
          [['B-scale load + barrier', 'B-scale 加载 + barrier'], 520, 778, 2216, 50, 326, 54],
          [['store wait + barrier', 'store 等待 + barrier'], 175, 92, 135, -48, -23, -77],
          [['STSM + barrier', 'STSM + barrier'], 850, 619, 657, -27, -23, -28],
          [['TMA issue', 'TMA 发出'], 370, 432, 273, 17, -26, null],
          [['first K block', '第一个 K block'], 4400, 4211, 5919, -4, 35, null]
        ];
        const rows = P.map(([n, , , , o, g, u]) => ({ label: n, pts: [
          { v: u, cls: 'u', hollow: true, name: bi('no probes (ncu)', '无探针（ncu）'), fmt: u == null ? null : (u > 0 ? '+' : '') + u + '%', dy: 0 },
          { v: o, cls: 'o', name: 'Olympus M6', dy: -6, fmt: (o > 0 ? '+' : '') + o + '%' },
          { v: g, cls: 'g', shape: 'sq', name: 'G-Watch', dy: 6, fmt: (g > 0 ? '+' : '') + g + '%' }] }));
        const plot = dotPlot(tips, rows, { min: -100, max: 100, ticks: [-100, -50, -15, 0, 15, 50, 100], unit: '%', band: [-15, 15], signed: true, aria: 'Deviation of each DeepGEMM tile phase from the source-level reference, for Olympus, G-Watch and the kernel without probes, with the ±15% band.' });
        const table = `<table><thead><tr><th>${bi('phase', '阶段')}</th><th class="num">§2.4</th><th class="num">Olympus M6</th><th class="num">G-Watch</th></tr></thead><tbody>${P.map(([n, r, o, g, od, gd]) => `<tr><td>${bi(n[0], n[1])}</td><td class="num">${num(r)}</td><td class="num">${num(o)} (${od > 0 ? '+' : ''}${od}%)</td><td class="num">${num(g)} (${gd > 0 ? '+' : ''}${gd}%)</td></tr>`).join('')}<tr><td>${bi('later K blocks', '之后的 K block')}</td><td class="num">&lt; 2,350</td><td class="num">4,086</td><td class="num">5,461</td></tr></tbody></table>`;
        return `<div class="w-svg db-chart">${plot}</div>` + legend([['o', 'Olympus M6'], ['g sq', 'G-Watch 0.0.35'], ['u', bi('kernel without probes (ncu), where EVAL gives it', '不加探针的 kernel（ncu），EVAL 给出的部分')], ['band', '±15%']]) +
          `<p class="db-small">${bi('p50 cycles at each run\'s calibrated clock, as deviation from §2.4. "Later K blocks" (not plotted) measures consumer lateness; where consumers really waited for data, issue → ready is 2,039–2,346 cycles, within §2.4.', '各次运行按校准后的时钟换算的 p50 周期数，画的是相对 §2.4 的偏差。“之后的 K block”（未画出）反映的是 consumer 的迟到；在 consumer 真正等数据的那些 block 里，发出 → 就绪为 2,039–2,346 个周期，符合 §2.4。')}</p>` +
          details('Numbers (p50 cycles)', '数值（p50 周期）', table);
      },
      ev: ['/ws/runs/m7/final-48360e9/a6-traces', '/ws/runs/m7/final-48360e9/a6'], cite: src('EVAL.md', 105, 120) },
    { id: 'A7', name: bi('Robustness: never launch a faulting cubin', '健壮性：绝不启动会出错的 cubin'),
      target: bi('Olympus never launches a cubin that fails to load or faults; problems are reported before launch.', 'Olympus 绝不启动加载失败或会出错的 cubin；问题在启动前报告。'),
      oly: [badge('met', B.met), bi('Fuzz on the final commit: 800 / 800 random site sets over 20 cases, 0 faults, 0 refused. Earlier campaigns: 2,400 / 2,400 across the conservative, M5 and M6 planners.', '最终提交上的模糊测试：20 个 case 上 800 / 800 组随机站点，0 次出错，0 次拒绝。更早的几轮：保守、M5、M6 三种规划器共 2,400 / 2,400。')],
      gw: [badge('na', B.na), bi('Not fuzzed. Its FlashMLA trace-mem chunk 6 hit an illegal instruction at every budget in M0, and timed out in the clean re-run.', '没有做模糊测试。它的 FlashMLA trace-mem 第 6 块在 M0 中无论预算多大都触发非法指令，在干净的重跑中则超时。')],
      viz: () => {
        const H = [
          [bi('fuzz c1', '模糊测试 c1'), bi('VALUE reads of registers outside the allocation in force', '读取了当前分配之外的寄存器（VALUE）'), '2eb25f4'],
          [bi('fuzz m5a', '模糊测试 m5a'), bi('the M5 scheduler', 'M5 调度器'), bi('Artemis / Apollo fix', 'Artemis / Apollo 修复')],
          [bi('M5 v1 sweep', 'M5 v1 扫描'), bi('a scoreboard wait 1 cycle after its setter', 'scoreboard 等待紧跟在占用者之后 1 个周期'), '0987470, b91385b'],
          [bi('fuzz c4', '模糊测试 c4'), bi('the conservative template\'s wait after a setter', '保守模板在占用者之后的等待'), '24d1cba'],
          [bi('fuzz, M5 with zero sites', '模糊测试，M5 零站点'), bi('INIT / exit-calibration wait 1 cycle after its setter', 'INIT / 退出校准的等待紧跟占用者 1 个周期'), '0987470'],
          [bi('fuzz m5d / m6a', '模糊测试 m5d / m6a'), bi('refused before launch: no free scoreboard for a calibration', '启动前拒绝：校准没有空闲 scoreboard'), 'b91385b']
        ];
        return `<p class="db-small">${bi('Every fault any Olympus tracing run hit, and its fix. The deliberate faults of the dead-register check are excluded: there a fault is a liveness finding.', 'Olympus 追踪运行遇到过的每一次出错及其修复。死寄存器检查中故意制造的出错不计入：在那里出错本身就是活跃性分析的发现。')}</p>
          <div class="tbl"><table><thead><tr><th>${bi('where', '在哪')}</th><th>${bi('root cause', '根本原因')}</th><th>${bi('fixed in', '修复于')}</th></tr></thead><tbody>${H.map(([w, c, f]) => `<tr><td>${w}</td><td>${c}</td><td class="mono">${f}</td></tr>`).join('')}</tbody></table></div>`;
      },
      ev: ['/ws/runs/m7/final-48360e9/fuzz-m6'], cite: src('EVAL.md', 150, 162) },
    { id: 'A8', name: bi('Splicing time', '拼接耗时'),
      target: bi('Analysis ≤ 1 s per kernel; search ≤ 10 ms per site.', '每个 kernel 分析 ≤ 1 s；每个站点搜索 ≤ 10 ms。'),
      oly: [badge('met', B.met), bi('Search per site: median 2.99 ms, p95 4.92 ms, max 6.56 ms; 0 / 2,028 over 10 ms. Analysis per kernel: median 0.009 s, max 0.45 s, plus ≤ 0.36 s of decoding.', '每个站点搜索：中位数 2.99 ms，p95 4.92 ms，最长 6.56 ms；2,028 个站点中 0 个超过 10 ms。每个 kernel 分析：中位数 0.009 s，最长 0.45 s，另加 ≤ 0.36 s 解码。')],
      gw: [badge('na', B.na), bi('Not measured.', '未测。')],
      paper: bi('Analysis 0.33–0.68 s and search 2.6–4.9 ms at the median ', '中位数：分析 0.33–0.68 s，搜索 2.6–4.9 ms ') + sec('S5.SS6', '5.6'),
      causeLabel: bi('note', '附注'),
      cause: bi('Outside A8\'s definition: counting each site\'s context and template building too, the per-site time is median 5.6 ms, max 17.7 ms, with 126 sites over 10 ms.', '不在 A8 的定义之内：若把每个站点的上下文与模板构建也算进去，每站点耗时中位数 5.6 ms，最长 17.7 ms，有 126 个站点超过 10 ms。'),
      viz: (tips) => {
        const rows = [
          { label: ['search', '搜索'], pts: [{ v: 2.99, cls: 'o', name: 'median', fmt: '2.99 ms' }, { v: 4.92, cls: 'o', name: 'p95', fmt: '4.92 ms' }, { v: 6.56, cls: 'o', name: 'max', fmt: '6.56 ms' }] },
          { label: ['with context', '含上下文'], pts: [{ v: 5.6, cls: 'u', hollow: true, name: 'median', fmt: '5.6 ms' }, { v: 17.7, cls: 'u', hollow: true, name: 'max', fmt: '17.7 ms' }] }
        ];
        return `<div class="w-svg db-chart">${dotPlot(tips, rows, { min: 0, max: 20, ticks: [0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20], unit: '', band: [2.6, 4.9], line: 10, lineLabel: ['10 ms target', '目标 10 ms'], aria: 'Search time per site: median, p95 and max, against the 10 ms target and the paper range.' })}</div>` +
          legend([['o', bi('Olympus search: median, p95, max', 'Olympus 搜索：中位数、p95、最长')], ['u', bi('including context and templates', '含上下文与模板构建')], ['band', bi('paper range, 2.6–4.9 ms', '论文范围 2.6–4.9 ms')], ['t', bi('target', '目标')]]) +
          `<p class="db-small">${bi('Milliseconds per site. The search runs under a deterministic work budget of 5,000 units and never reads the clock, so a plan is the same on every machine; 1,406 sites are proven optimal and 622 capped (615 of those land on the optimum anyway).', '单位：每站点毫秒。搜索在 5,000 个单位的确定性工作量预算下运行，从不读时钟，因此在任何机器上计划都相同；1,406 个站点被证明最优，622 个触顶（其中 615 个仍然落在最优解上）。')}</p>`;
      },
      ev: ['/ws/runs/m7/final-48360e9/m6-static'], cite: src('EVAL.md', 24) },
    { id: 'A9', name: bi('Agent view: olympus show', 'agent 视图：olympus show'),
      target: bi('<code>olympus show</code> prints header, per-scope stats, pipeline bubbles and a timeline for any trace.', '<code>olympus show</code> 对任何追踪都输出头部、按范围的统计、流水线气泡和时间线。'),
      oly: [badge('met', B.met), bi('Every view on all 56 G-Watch-derived traces and all 57 Olympus-derived ones, plus an HTML panel. DeepGEMM\'s tile-boundary wait was located from <code>olympus show</code> alone.', '在全部 56 个源自 G-Watch 的追踪和 57 个源自 Olympus 的追踪上，所有视图都能工作，另有 HTML 面板。DeepGEMM 的 tile 边界等待只用 <code>olympus show</code> 就定位到了。')],
      gw: [badge('na', B.na), bi('Has its own <code>gwatch show</code>, which PLAN M8 took as the model.', '它有自己的 <code>gwatch show</code>，PLAN 的 M8 以它为样板。')],
      viz: () => `<pre class="db-pre">olympus show TRACE [--stats] [--sites] [--bubbles] [--timeline] [--concurrency] [--outliers]
             [--longest REGION] [--json] [--html PATH]
             [--launch N] [--block 0-3] [--warp 0-1] [--role consumer] [--stime 5us --etime 8us]</pre>
        <p class="db-small">${bi('Every region and both ends of every bubble are printed as <code>s&lt;id&gt;@&lt;index&gt;</code>, so an agent can go from a gap straight to the SASS.', '每个区间以及每个气泡的两端都打印成 <code>s&lt;id&gt;@&lt;index&gt;</code>，agent 可以从一段空隙直接跳到对应的 SASS。')} ${src('olympus/report/show.py', 1, 40)}</p>`,
      ev: ['/ws/runs/m8/aphrodite/20260928T171959Z', '/ws/runs/m7/demeter/20260928T185951Z/m8'], cite: src('EVAL.md', 25) },
    { id: 'M3', name: bi('Liveness soundness', '活跃性分析的可靠性'),
      target: bi('Every register the analysis calls dead is dead: overwriting it changes nothing.', '分析判为已死的寄存器确实已死：改写它不改变任何结果。'),
      oly: [badge('met', B.met), bi('20 / 20 cases on the GPU. Every reachable instruction is a test point, in two phases (0x5a5a5a5a / TRUE and 0xa5a5a5a5 / FALSE into every dead register); a control that overwrites a live GPR changes the outputs, so the check can see a wrong liveness.', 'GPU 上 20 / 20 个 case。每条可达指令都是测试点，分两轮（向每个死寄存器写 0x5a5a5a5a / TRUE 和 0xa5a5a5a5 / FALSE）；对照组改写一个活跃的 GPR 会改变输出，说明这项检查确实能发现错误的活跃性。')],
      gw: [badge('na', B.na), bi('Its liveness frees registers Olympus keeps, including WGMMA register A operands in flight, which is t1_attention\'s wrong output (DECISIONS 25).', '它的活跃性会释放 Olympus 保留的寄存器，包括在途 WGMMA 的寄存器 A 操作数，这正是 t1_attention 输出错误的原因（DECISIONS 25）。')],
      viz: () => `<div class="readouts"><div class="readout key"><span class="k">${bi('cases', 'case')}</span><span class="v">20 / 20</span><span class="s">${bi('outputs unchanged', '输出不变')}</span></div><div class="readout"><span class="k">${bi('bugs found by it', '由它发现的 bug')}</span><span class="v">2</span><span class="s">${bi('sm_90 reserves the top two GPRs; wgmma fence windows', 'sm_90 保留顶部两个 GPR；wgmma fence 窗口')}</span></div></div>`,
      ev: ['/ws/runs/m3/athena/20260929T054712Z-runtime-a', '/ws/runs/m3/athena/20260929T054712Z-runtime-b'], cite: src('EVAL.md', 26) },
    { id: bi('Coverage', '覆盖'), key: 'cov', name: bi('Which sites each tool can trace', '各工具能追踪哪些站点'),
      target: bi('Not a criterion: of the 2,038 sites in the three sets, which each tool splices.', '不是验收标准：三组共 2,038 个站点中，各工具能拼接哪些。'),
      oly: [badge('count', bi('2,028 sites', '2,028 个站点')), bi('Both tools trace 1,823. Only Olympus traces 205: G-Watch\'s 142 "no feasible schedule" sites and the 63 FlashMLA trace-mem chunk-6 sites.', '两者都能追踪 1,823 个。只有 Olympus 能追踪的有 205 个：G-Watch 报“no feasible schedule”的 142 个站点，以及 FlashMLA trace-mem 第 6 块的 63 个站点。')],
      gw: [badge('count', bi('1,833 sites', '1,833 个站点')), bi('Only G-Watch traces 10, where the kernel holds all six scoreboards and G-Watch reaches them by waiting on kernel scoreboards.', '只有 G-Watch 能追踪的有 10 个：kernel 占满了全部六个 scoreboard，G-Watch 靠等待 kernel 的 scoreboard 才能拼进去。')],
      paper: bi('Dead registers fed every one of the 53 NVIDIA splices without a fallback ', '在 NVIDIA 上的 53 次拼接中，死寄存器每次都够用，无需回退 ') + sec('S5.SS5', '5.5'),
      viz: (tips) => `<div class="w-svg db-chart">${stacked(tips, [
          { n: 1823, cls: 'n', label: bi('both tools', '两者都能') }, { n: 205, cls: 'o', label: bi('only Olympus', '只有 Olympus') }, { n: 10, cls: 'g', label: bi('only G-Watch', '只有 G-Watch') }], 2038, 'Of 2,038 sites: 1,823 traced by both, 205 only by Olympus, 10 only by G-Watch.')}</div>` +
        legend([['n', bi('both', '两者')], ['o', bi('only Olympus', '只有 Olympus')], ['g', bi('only G-Watch', '只有 G-Watch')]]) +
        `<p class="db-small">${bi('What the difference buys: FA-3\'s producer role runs with 24 registers. Olympus traces its K and V waits there and finds the paper\'s result, that the producer waits on K releases, not V: in the final M6 trace, K p50 1,616 ns against V 54 ns (1,925 against 138 under M4, DECISIONS 65; paper §5.2.1).', '这个差别换来了什么：FA-3 的 producer 角色只有 24 个寄存器。Olympus 能在那里追踪它对 K 和 V 的等待，并得到与论文相同的结论：producer 等的是 K 的释放，而不是 V：在最终的 M6 追踪中，K 的 p50 为 1,616 ns，V 为 54 ns（M4 下为 1,925 对 138，DECISIONS 65；论文 §5.2.1）。')}</p>`,
      ev: ['/ws/runs/m6/apollo/20260929T075829Z-a8cap'], cite: src('EVAL.md', 50, 57) }
  ];

  function initDash(host) {
    const tabs = $('.db-tabs', host), panel = $('.db-panel', host);
    const st = { i: 0, set: 'trace-pp' };
    let tips = [];
    tabs.innerHTML = CRIT.map((c, i) => `<button type="button" class="stage-btn" role="tab" id="db-tab-${i}" aria-selected="false" data-i="${i}">${c.id}</button>`).join('');
    const btns = $$('.stage-btn', tabs);
    function render() {
      const c = CRIT[st.i];
      tips = [];
      btns.forEach((b, j) => { b.setAttribute('aria-selected', String(j === st.i)); if (j === st.i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
      panel.setAttribute('aria-labelledby', 'db-tab-' + st.i);
      const cmp = [['o', 'Olympus', c.oly], ['g', 'G-Watch 0.0.35', c.gw]];
      panel.innerHTML = `
        <div class="db-top"><h4>${typeof c.id === 'string' && /^[AM]\d/.test(c.id) ? `<span class="db-id">${c.id}</span>` : ''}${c.name}</h4><p class="db-target-t"><span class="k">${bi('target', '目标')}</span>${c.target}</p></div>
        <div class="db-cmp">${cmp.map(([cls, who, [b, t]]) => `<div class="db-side ${cls}"><div class="db-who"><i></i>${who}${b}</div><p>${t}</p></div>`).join('')}
          ${c.paper ? `<div class="db-side p"><div class="db-who">${bi('Paper (Xtrace)', '论文（Xtrace）')}</div><p>${c.paper}</p></div>` : ''}</div>
        ${c.cause ? `<p class="db-cause"><span class="k">${c.causeLabel || bi('root cause', '根本原因')}</span>${c.cause}</p>` : ''}
        <div class="db-viz">${c.viz(tips, st)}</div>
        <p class="db-ev"><span class="k">${bi('evidence', '证据')}</span>${c.ev.map((e) => `<code>${e}</code>`).join(' ')} ${c.cite}</p>`;
      $$('[data-tip]', panel).forEach((el) => {
        el.addEventListener('mousemove', (e) => showTip(tips[+el.dataset.tip], e));
        el.addEventListener('mouseleave', hideTip);
      });
      $$('.db-set', panel).forEach((b) => b.addEventListener('click', () => { st.set = b.dataset.set; render(); }));
      if (!reduceMotion) $$('.db-bar, .db-pt, .db-seg, .db-cell', panel).forEach((el, k) => {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: Math.min(k * 12, 360), easing: 'ease-out', fill: 'backwards' });
      });
    }
    const tabKey = (c) => c.key || c.id;
    btns.forEach((b) => b.addEventListener('click', () => {
      st.i = +b.dataset.i; render();
      try { history.replaceState(null, '', '#dash-' + tabKey(CRIT[st.i])); } catch (e) { /* file:// or sandboxed */ }
    }));
    // deep links: #dash-A4, #dash-A4-trace-mem, #dash-cov
    const m = /^#dash-([A-Za-z0-9]+)(?:-(trace-(?:sche|pp|mem)))?$/.exec(location.hash);
    if (m) {
      const k = CRIT.findIndex((c) => tabKey(c) === m[1]);
      if (k >= 0) st.i = k;
      if (m[2]) st.set = m[2];
    }
    tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      st.i = (st.i + (e.key === 'ArrowRight' ? 1 : CRIT.length - 1)) % CRIT.length;
      render(); btns[st.i].focus();
    });
    render();
  }

  const three = document.getElementById('three'); if (three) initThree(three);
  const pipe = document.getElementById('pipe'); if (pipe) initPipe(pipe);
  const dash = document.getElementById('dash'); if (dash) initDash(dash);
})();
