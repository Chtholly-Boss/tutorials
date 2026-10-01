// Olympus tutorial 06, Not getting in the way: one warp at DeepGEMM k512's c.tile_done, under four splices, and
// the set-to-wait distance demo. DATA: the kernel's instruction stream and control words (indices 1089-1106,
// decoded from /ws/corpus/t3_dg_1d2d_k512/kernel.cubin), the search planner's island at this site and G-Watch
// 0.0.35's probe (decoded from its instrumented image), extracted CPU-only at commit 40a887a. The issue model is a
// simple in-order one; the release latencies are the cost model's, and the SB0 hold is our inference (see the page).
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const num = (x) => x.toLocaleString('en-US');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const bits = (m) => [0, 1, 2, 3, 4, 5].filter((s) => (m >> s) & 1);
  const bracket = (x) => `[${x.wr}:${x.rd}:{${bits(x.w).join(',')}}:${x.st}:${x.y}]`;
  const GHZ = 1.75;          // DeepGEMM k512's calibrated SM clock under load (EVAL.md, A6)
  const SB0_HOLD = 1450;     // cycles SB0 stays held after UTMACMDFLUSH: 0.8-0.9 us per tile at 1.75 GHz (DECISIONS 61)

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
  function tipOn(el, html) {
    el.addEventListener('mouseenter', (ev) => showTip(typeof html === 'function' ? html() : html, ev));
    el.addEventListener('mousemove', (ev) => showTip(tip.innerHTML, ev));
    el.addEventListener('mouseleave', hideTip);
  }

  const DATA = {"case":"t3_dg_1d2d_k512","set":"trace-pp","before":1100,"label":"c.tile_done","stream":[{"i":1089,"t":"UTMASTG.2D [UR28], [UR32]","g":null,"st":1,"w":0,"wr":7,"rd":2,"y":0},{"i":1090,"t":"UIADD3 UR24, UPT, UPT, UR28, 0xc000, URZ","g":null,"st":1,"w":0,"wr":7,"rd":7,"y":0},{"i":1091,"t":"UMOV UR22, UR30","g":null,"st":1,"w":0,"wr":7,"rd":7,"y":0},{"i":1092,"t":"UMOV UR17, UR29","g":null,"st":1,"w":0,"wr":7,"rd":7,"y":0},{"i":1093,"t":"UMOV UR25, UR21","g":null,"st":1,"w":0,"wr":7,"rd":7,"y":0},{"i":1094,"t":"UMOV UR26, UR18","g":null,"st":1,"w":0,"wr":7,"rd":7,"y":0},{"i":1095,"t":"UTMASTG.2D [UR20], [UR32]","g":null,"st":1,"w":0,"wr":7,"rd":2,"y":0},{"i":1096,"t":"UTMASTG.2D [UR16], [UR32]","g":null,"st":3,"w":0,"wr":7,"rd":2,"y":0},{"i":1097,"t":"UTMASTG.2D [UR24], [UR32]","g":null,"st":1,"w":0,"wr":7,"rd":2,"y":0},{"i":1098,"t":"UTMACMDFLUSH","g":null,"st":2,"w":0,"wr":7,"rd":0,"y":0},{"i":1099,"t":"BSYNC PT, B0","g":null,"st":5,"w":4,"wr":7,"rd":7,"y":0},{"i":1100,"t":"S2UR UR16, SR_CTAID.X","g":null,"st":1,"w":0,"wr":2,"rd":7,"y":0},{"i":1101,"t":"UIADD3 UR4, UPT, UPT, UR4, 0x1, URZ","g":null,"st":1,"w":0,"wr":7,"rd":7,"y":0},{"i":1102,"t":"ISETP.NE.AND P0, PT, RZ, UR40, PT","g":null,"st":1,"w":0,"wr":7,"rd":7,"y":0},{"i":1103,"t":"NOP","g":null,"st":3,"w":0,"wr":7,"rd":7,"y":1},{"i":1104,"t":"SEL R5, RZ, 0x1, P0","g":null,"st":4,"w":0,"wr":7,"rd":7,"y":1},{"i":1105,"t":"LOP3.LUT PT, R184, R184, R5, RZ, 0x3c, !PT","g":null,"st":1,"w":0,"wr":7,"rd":7,"y":0},{"i":1106,"t":"UIMAD UR16, UR4, 0x84, UR16","g":null,"st":4,"w":4,"wr":7,"rd":7,"y":1}],"probe":[{"t":"ELECT P0, URZ, ~URZ","st":1,"w":0,"wr":7,"rd":7,"y":0,"r":"pack"},{"t":"ULOP3.LUT UPT, UR0, UR62, 0x3f, URZ, 0xc0, !UPT","st":1,"w":0,"wr":7,"rd":7,"y":0,"r":"advance"},{"t":"CS2R.32 R4, SR_CLOCKLO","st":1,"w":0,"wr":7,"rd":7,"y":0,"r":"capture"},{"t":"UIADD3 UR62, UPT, UPT, UR62, 0x1, URZ","st":2,"w":0,"wr":7,"rd":7,"y":0,"r":"advance"},{"t":"UIMAD.WIDE.U32 {UR0,UR1}, UPT, UR0, 0x4, {UR60,UR61}","st":1,"w":0,"wr":7,"rd":7,"y":0,"r":"advance"},{"t":"LEA.LO R4, PT, R4, 0x14, 0x6","st":7,"w":0,"wr":7,"rd":7,"y":1,"r":"pack"},{"t":"@P0 STG.E [RZ+UR0+0x20], R4","st":2,"w":0,"wr":7,"rd":2,"y":0,"r":"store"},{"t":"NOP","st":1,"w":4,"wr":7,"rd":7,"y":0,"r":"wait"}],"gwatch":[{"t":"CS2R.32 R209, SR_CLOCKLO","st":6,"w":0,"wr":7,"rd":7,"y":0,"r":""},{"t":"SHF.L.U32 R210, R209, 0x6, RZ","st":1,"w":0,"wr":7,"rd":7,"y":0,"r":""},{"t":"ELECT P3, URZ, ~URZ","st":5,"w":0,"wr":7,"rd":7,"y":0,"r":""},{"t":"IADD3 R210, PT, PT, R210, 0x14, RZ","st":8,"w":2,"wr":7,"rd":7,"y":0,"r":""},{"t":"@P3 STG.E [RZ+UR58], R210","st":1,"w":0,"wr":7,"rd":2,"y":0,"r":""},{"t":"@P3 STG.E [RZ+UR58+0x4], R0","st":1,"w":0,"wr":7,"rd":2,"y":0,"r":""},{"t":"UIADD3.64 {UR58,UR59}, UPT, UPT, {UR58,UR59}, 0x8, URZ","st":1,"w":5,"wr":7,"rd":7,"y":0,"r":""}],"claims":[{"p":1010,"k":"rd","sb":1,"op":"STSM"},{"p":1017,"k":"rd","sb":1,"op":"STSM"},{"p":1020,"k":"rd","sb":1,"op":"STSM"},{"p":1023,"k":"rd","sb":1,"op":"STSM"},{"p":1026,"k":"rd","sb":1,"op":"STSM"},{"p":1029,"k":"rd","sb":1,"op":"STSM"},{"p":1032,"k":"rd","sb":1,"op":"STSM"},{"p":1035,"k":"rd","sb":1,"op":"STSM"},{"p":1038,"k":"rd","sb":1,"op":"STSM"},{"p":1041,"k":"rd","sb":1,"op":"STSM"},{"p":1044,"k":"rd","sb":1,"op":"STSM"},{"p":1047,"k":"rd","sb":1,"op":"STSM"},{"p":1050,"k":"rd","sb":1,"op":"STSM"},{"p":1053,"k":"rd","sb":1,"op":"STSM"},{"p":1056,"k":"rd","sb":1,"op":"STSM"},{"p":1059,"k":"rd","sb":1,"op":"STSM"},{"p":1062,"k":"rd","sb":1,"op":"STSM"},{"p":1065,"k":"rd","sb":1,"op":"STSM"},{"p":1068,"k":"rd","sb":1,"op":"STSM"},{"p":1071,"k":"rd","sb":1,"op":"STSM"},{"p":1074,"k":"rd","sb":1,"op":"STSM"},{"p":1075,"k":"rd","sb":1,"op":"STSM"},{"p":1078,"k":"rd","sb":1,"op":"BAR"},{"p":1098,"k":"grp","sb":0,"op":"UTMACMDFLUSH"},{"p":943,"k":"rd","sb":1,"op":"BAR"}],"kr":{"0":23,"1":14}};

  const opOf = (text) => text.replace(/^@!?U?P[T0-9]+\s+/, '').split(/[ .]/)[0];
  // exact.release_estimate for the operations this page meets (measured p50s; 30 = the model's default)
  function release(text, kind) {
    const op = opOf(text);
    if (kind === 'rd') {
      if (op === 'UTMACMDFLUSH') return SB0_HOLD;
      if (op === 'STG') return /\.128/.test(text) ? 34 : /\.64/.test(text) ? 16 : 14;
      return 30;
    }
    if (op === 'S2UR') return 37;
    if (op === 'S2R') return 27;
    if (op === 'LDC') return 28;
    return 30;
  }
  // One warp, provable cycles: issue max(stall, 1) after the previous instruction, or when every claim its wait
  // mask can see has released. A claim is visible to a wait only from 2 cycles after its setter (SB_SET_GAP).
  function issue(rows) {
    const claims = [[], [], [], [], [], []];
    const out = [], all = [];
    rows.forEach((r, i) => {
      const want = i === 0 ? 0 : out[i - 1].t + Math.max(out[i - 1].st, 1);
      let t = want, waited = 0;
      for (const s of bits(r.w)) {
        for (const c of claims[s]) {
          if (want - c.set >= 2 && c.rel > want) { t = Math.max(t, c.rel); waited |= 1 << s; c.heldBy = i; }
        }
        claims[s] = claims[s].filter((c) => want - c.set < 2);
      }
      out.push(Object.assign({}, r, { t, want, waited }));
      [[r.wr, 'wr'], [r.rd, 'rd']].forEach(([s, kind]) => {
        if (s < 6) {
          const c = { s, set: t, rel: t + release(r.text, kind), kind, row: i, probe: !!r.probe, op: opOf(r.text) };
          claims[s].push(c); all.push(c);
        }
      });
    });
    const last = out[out.length - 1];
    return { rows: out, claims: all, end: last.t + Math.max(last.st, 1) };
  }

  // A time axis whose idle stretches longer than maxGap cycles are compressed into a labelled break.
  function axis(keys, x0, x1, maxGap) {
    const K = Array.from(new Set(keys.map((k) => Math.round(k)))).sort((a, b) => a - b);
    const U = [0], breaks = [];
    for (let j = 1; j < K.length; j++) {
      const g = K[j] - K[j - 1];
      if (g > maxGap) { U.push(U[j - 1] + 10); breaks.push({ a: K[j - 1], b: K[j] }); } else U.push(U[j - 1] + g);
    }
    const total = Math.max(U[U.length - 1], 1);
    const sc = (x1 - x0) / total;
    function x(t) {
      if (t <= K[0]) return x0;
      for (let j = 1; j < K.length; j++) {
        if (t <= K[j]) return x0 + sc * (U[j - 1] + (U[j] - U[j - 1]) * (t - K[j - 1]) / (K[j] - K[j - 1]));
      }
      return x0 + sc * total;
    }
    function tOfU(u) {
      for (let j = 1; j < K.length; j++) {
        if (u <= U[j]) return K[j - 1] + (K[j] - K[j - 1]) * (u - U[j - 1]) / Math.max(U[j] - U[j - 1], 1e-9);
      }
      return K[K.length - 1];
    }
    return { x, tOfU, total, breaks };
  }
  function hatches(svg) {
    const defs = S('defs', null, svg);
    const h = S('pattern', { id: 'sb-hatch', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    S('line', { x1: 0, y1: 0, x2: 0, y2: 5, class: 'sb-hatch-line' }, h);
    const a = S('pattern', { id: 'sb-ahatch', width: 4, height: 4, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)' }, defs);
    S('line', { x1: 0, y1: 0, x2: 0, y2: 4, class: 'sb-ahatch-line' }, a);
  }

  // =====================================================================
  // 1. The scoreboard simulator at k512's c.tile_done
  // =====================================================================
  function initSim(host) {
    const svg = $('.sim svg', host), lamps = $('.sb-lamps', host), desc = $('.sb-desc', host), readouts = $('.sb-read', host);
    const playBtn = $('[data-act="play"]', host), stepBtn = $('[data-act="step"]', host), resetBtn = $('[data-act="reset"]', host);
    const probeBtns = $$('[data-probe]', host);
    const PROBES = {
      none: [],
      oly: DATA.probe,
      gw: DATA.gwatch,
      nop0: [{ t: 'NOP', st: 1, w: 1, wr: 7, rd: 7, y: 0 }]
    };
    const hex = (i) => '0x' + (16 * i).toString(16).padStart(4, '0');
    let mode = 'oly', R = null, base = null, ax = null, cur = 0, raf = null, els = [];

    function rowsFor(m) {
      const out = [];
      DATA.stream.forEach((x) => {
        if (x.i === DATA.before) PROBES[m].forEach((p) => out.push({ text: p.t, st: p.st, w: p.w, wr: p.wr, rd: p.rd, y: p.y, probe: true, pc: '' }));
        out.push({ text: (x.g ? x.g + ' ' : '') + x.t, st: x.st, w: x.w, wr: x.wr, rd: x.rd, y: x.y, probe: false, pc: hex(x.i), i: x.i });
      });
      return out;
    }
    const s2urOf = (r) => r.rows.find((x) => x.i === DATA.before);

    const DESC = {
      none: bi('The uninstrumented kernel. <code>UTMACMDFLUSH</code> claims SB0 for the TMA store group and nothing here waits on it: the kernel\'s own wait is the next tile\'s <code>DEPBAR.LE SB0</code>, so the store\'s latency overlaps the next tile.',
        '未插桩的 kernel。<code>UTMACMDFLUSH</code> 为 TMA store group 占用 SB0，这里没有任何指令等待它：kernel 自己的等待在下一个 tile 的 <code>DEPBAR.LE SB0</code>，所以 store 的延迟与下一个 tile 重叠。'),
      oly: bi('The search planner\'s island: the store claims a <em>free</em> scoreboard (SB2, released by the kernel\'s <code>BSYNC</code> just before), and the trailing <code>NOP</code> waits only on that claim. The kernel\'s SB0 is not touched; the kernel\'s <code>S2UR</code> is delayed by the island\'s own length.',
        'search 规划器的 island：store 占用一个<em>空闲</em>的 scoreboard（SB2，刚被 kernel 的 <code>BSYNC</code> 释放），末尾的 <code>NOP</code> 只等这个占用。kernel 的 SB0 不被触碰；kernel 的 <code>S2UR</code> 只推迟了 island 自身的长度。'),
      nop0: bi('The experiment of DECISIONS 61: one <code>NOP ;[7:7:{0}:1:0]</code> spliced into the uninstrumented kernel, nothing else. It waits on SB0, which only the kernel\'s TMA stores hold, so the warp stands still until the TMA unit has read the tile out of shared memory. Measured on the GPU: +18.4% end to end, 0.8–0.9 µs per tile boundary.',
        'DECISIONS 61 的实验：只在未插桩的 kernel 里拼接一条 <code>NOP ;[7:7:{0}:1:0]</code>，别无其他。它等待 SB0，而 SB0 只被 kernel 的 TMA store 占着，于是 warp 原地不动，直到 TMA 单元把 tile 从共享内存读完。GPU 上实测：端到端 +18.4%，每个 tile 边界 0.8–0.9 µs。'),
      gw: bi('G-Watch 0.0.35\'s probe at the same site, decoded from its image: <code>IADD3</code> waits on {1}, and <code>UIADD3.64</code> on {0,2}. SB0 is the kernel\'s TMA store group, so this probe pays the same wait as the NOP, plus its own instructions.',
        'G-Watch 0.0.35 在同一站点的探针，从它的镜像解码：<code>IADD3</code> 等待 {1}，<code>UIADD3.64</code> 等待 {0,2}。SB0 是 kernel 的 TMA store group，所以这个探针付出与那条 NOP 相同的等待，再加上自己的指令。')
    };

    function build() {
      R = issue(rowsFor(mode));
      base = issue(rowsFor('none'));
      const END = R.end;
      const keys = [0, END];
      R.rows.forEach((r) => { keys.push(r.t, r.want, r.t + Math.max(r.st, 1)); });
      R.claims.forEach((c) => { keys.push(c.set); if (c.rel <= END) keys.push(c.rel); });
      const N = R.rows.length, RH = 17, top = 52, laneTop = top + N * RH + 18, LH = 14;
      const H = laneTop + 6 * LH + 28;
      svg.setAttribute('viewBox', `0 0 880 ${H}`);
      ax = axis(keys, 262, 866, 24);
      svg.innerHTML = '';
      hatches(svg);
      const x = ax.x;
      S('line', { x1: 262, y1: top - 8, x2: 866, y2: top - 8, class: 'axis' }, svg);
      ST(svg, { x: 48, y: top - 16, class: 't-sm muted' }, 'cycle (one warp, provable) →', '周期（单个 warp，可证明）→');
      ST(svg, { x: 48, y: top - 32, class: 't-sm muted' }, 'compressed idle stretches →', '压缩掉的空闲段 →');
      const s2 = s2urOf(R);
      [[0, '0'], [s2.t, `S2UR @ ${num(s2.t)}`], [END, num(END)]].forEach(([t, lb], k) => {
        S('line', { x1: x(t), y1: top - 12, x2: x(t), y2: top - 4, class: 'brk' }, svg);
        S('text', { x: x(t), y: top - 16, class: 't-sm' + (k === 1 ? ' strong' : ' muted'), 'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle' }, svg, lb);
      });
      ax.breaks.forEach((b) => {
        const xa = x(b.a) + 2, xb = x(b.b) - 2, ym = top - 8;
        S('path', { d: `M${xa},${ym - 4} L${(xa + xb) / 2 - 3},${ym + 4} L${(xa + xb) / 2 + 3},${ym - 4} L${xb},${ym + 4}`, class: 'brk' }, svg);
        S('text', { x: (xa + xb) / 2, y: top - 32, class: 't-sm asy strong', 'text-anchor': 'middle' }, svg, `+${num(b.b - b.a)}`);
        S('line', { x1: xa, y1: top - 4, x2: xa, y2: laneTop + 6 * LH, class: 'guide' }, svg);
        S('line', { x1: xb, y1: top - 4, x2: xb, y2: laneTop + 6 * LH, class: 'guide' }, svg);
      });
      els = [];
      const firstProbe = R.rows.findIndex((q) => q.probe);
      R.rows.forEach((r, i) => {
        const y = top + i * RH;
        const g = S('g', null, svg);
        if (r.probe) S('rect', { x: 0, y: y - 1, width: 880, height: RH, class: 'row-p' }, g);
        if (r.probe && i === firstProbe) ST(g, { x: 0, y: y + 11, class: 't-sm oly strong' }, 'probe', '探针');
        else S('text', { x: 0, y: y + 11, class: 't-sm muted' }, g, r.pc);
        const txt = r.text.length > 34 ? r.text.slice(0, 33) + '…' : r.text;
        const lab = S('text', { x: 48, y: y + 11, class: 't-sm' + (r.probe ? ' oly' : '') }, g, txt);
        tipOn(lab, `${esc(r.text)} ;${bracket(r)}`);
        if (r.t > r.want) {
          const wx = x(r.want), ww = Math.max(x(r.t) - wx, 2);
          S('rect', { x: wx, y: y + 2, width: ww, height: RH - 5, class: 'wt' }, g);
          ST(g, { x: Math.min(wx + 4, 780), y: y + 11, class: 't-sm strong' }, `waits {${bits(r.waited).join(',')}}  +${num(r.t - r.want)}`, `等待 {${bits(r.waited).join(',')}}  +${num(r.t - r.want)}`);
        }
        const xi = x(r.t), xs = x(r.t + Math.max(r.st, 1));
        S('rect', { x: xi, y: y + 3, width: Math.max(xs - xi, 2), height: RH - 7, rx: 1.5, class: r.probe ? 'stl-p' : 'stl-k' }, g);
        S('rect', { x: xi - 1, y: y + 1, width: 3, height: RH - 3, class: r.probe ? 'iss-p' : 'iss-k' }, g);
        els.push({ g, t: r.t });
      });
      for (let s = 0; s < 6; s++) {
        const y = laneTop + s * LH;
        S('text', { x: 0, y: y + 10, class: 't-sm muted' }, svg, `SB${s}`);
        S('line', { x1: 262, y1: y + 12, x2: 866, y2: y + 12, class: 'axis' }, svg);
      }
      ST(svg, { x: 48, y: laneTop - 5, class: 't-sm muted' }, 'claims (set → release)', '占用（登记 → 释放）');
      R.claims.forEach((c) => {
        const y = laneTop + c.s * LH;
        const xa = x(c.set), xb = x(Math.min(c.rel, END));
        const held = c.heldBy != null && !c.probe && R.rows[c.heldBy].probe;
        const r = S('rect', { x: xa, y: y + 2, width: Math.max(xb - xa, 2), height: LH - 4, rx: 2, class: (c.probe ? 'clm-p' : 'clm-k') + (held ? ' clm-held' : '') }, svg);
        tipOn(r, bi(`SB${c.s} · ${c.kind === 'rd' ? 'read' : 'write'} claim by ${esc(c.op)} · set at ${num(c.set)}, releases at ${num(c.rel)}`, `SB${c.s} · ${esc(c.op)} 的${c.kind === 'rd' ? '读' : '写'}占用 · 第 ${num(c.set)} 周期登记，第 ${num(c.rel)} 周期释放`));
        if (c.rel > END) S('text', { x: 866, y: y + 10, class: 't-sm muted', 'text-anchor': 'end' }, svg, `→ ${num(c.rel)}`);
      });
      const cl = S('line', { x1: 262, y1: top - 6, x2: 262, y2: laneTop + 6 * LH, class: 'cur' }, svg);
      els.cursor = cl;
      paint(END);
      text();
    }

    function paint(t) {
      cur = t;
      const xx = ax.x(t);
      els.cursor.setAttribute('x1', xx); els.cursor.setAttribute('x2', xx);
      els.forEach((e) => e.g.classList.toggle('dim', e.t > t + 1e-9));
      let html = '';
      for (let s = 0; s < 6; s++) {
        const act = R.claims.filter((c) => c.s === s && c.set <= t && c.rel > t);
        const held = R.rows.some((r) => r.want <= t && r.t > t && (r.waited >> s) & 1);
        const k = act.length ? (act[act.length - 1].probe ? 'probe' : 'kern') : '';
        const who = act.length ? act.map((c) => c.op).filter((v, i, a) => a.indexOf(v) === i).join(', ') : bi('free', '空闲');
        html += `<div class="lamp ${k}${held ? ' hold' : ''}"><b>SB${s}</b><span>${held ? bi('the warp waits here', 'warp 在此等待') : who}</span></div>`;
      }
      lamps.innerHTML = html;
    }

    function text() {
      const s2 = s2urOf(R), b2 = s2urOf(base);
      const delay = s2.t - b2.t;
      const probeRows = R.rows.filter((r) => r.probe);
      const kw = new Set();
      probeRows.forEach((r) => bits(r.waited).forEach((s) => {
        const c = R.claims.find((q) => q.s === s && !q.probe && q.heldBy === R.rows.indexOf(r));
        if (c) kw.add(`SB${s} (${c.op})`);
      }));
      desc.innerHTML = DESC[mode];
      const stalls = probeRows.reduce((a, r) => a + Math.max(r.st, 1), 0);
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('The kernel\'s S2UR is delayed by', 'kernel 的 S2UR 推迟了')}</span><span class="v">${delay > 0 ? '+' : ''}${num(delay)} ${bi('cycles', '周期')}</span><span class="s">${bi(`≈ ${num(Math.round(delay / GHZ))} ns at ${GHZ} GHz; without a probe it issues at cycle ${b2.t}`, `按 ${GHZ} GHz 约 ${num(Math.round(delay / GHZ))} ns；无探针时它在第 ${b2.t} 周期发射`)}</span></div>
        <div class="readout"><span class="k">${bi('Probe', '探针')}</span><span class="v">${probeRows.length} ${bi('instr', '条')}</span><span class="s">${bi(`${stalls} cycles of stalls`, `stall 共 ${stalls} 周期`)}</span></div>
        <div class="readout"><span class="k">${bi('Waits on kernel claims', '等待 kernel 的占用')}</span><span class="v">${kw.size ? Array.from(kw).join(', ') : bi('none', '无')}</span><span class="s">${kw.size ? bi('overlapped latency turned into a stall: invariant 3 broken', '本可重叠的延迟变成了停顿：违反不变量 3') : bi('only the probe\'s own claims', '只等探针自己的占用')}</span></div>
        <div class="readout"><span class="k">${bi('Measured on the GPU', 'GPU 上的实测')}</span><span class="v">${mode === 'nop0' ? '+18.4%' : mode === 'oly' ? '−0.3%' : '–'}</span><span class="s">${mode === 'nop0' ? bi('k512 end to end, this NOP alone (DECISIONS 61)', 'k512 端到端，仅这条 NOP（DECISIONS 61）') : mode === 'oly' ? bi('the same island without the SB0 wait (DECISIONS 61)', '同一 island 不带 SB0 等待（DECISIONS 61）') : mode === 'gw' ? bi('18.4 of the oracle\'s 27.3 points on k512 trace-pp are this wait (DECISIONS 61)', 'oracle 在 k512 trace-pp 上 27.3 个百分点中的 18.4 个是这次等待（DECISIONS 61）') : bi('the baseline', '基线')}</span></div>`;
    }

    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } playBtn.innerHTML = bi('▶ Play', '▶ 播放'); }
    function play() {
      if (raf) { stop(); return; }
      if (reduceMotion) { paint(R.end); return; }
      let u = 0, last = null;
      playBtn.innerHTML = bi('Pause', '暂停');
      const rate = ax.total / 5.5;           // the whole window in about 5.5 s
      const tick = (ts) => {
        if (last != null) u += rate * (ts - last) / 1000;
        last = ts;
        if (u >= ax.total) { paint(R.end); stop(); return; }
        paint(ax.tOfU(u));
        raf = requestAnimationFrame(tick);
      };
      paint(0);
      raf = requestAnimationFrame(tick);
    }
    function step() {
      stop();
      const nexts = R.rows.map((r) => r.t).concat(R.claims.map((c) => c.rel)).filter((t) => t > cur + 1e-9 && t <= R.end).sort((a, b) => a - b);
      paint(nexts.length ? nexts[0] : 0);
    }
    probeBtns.forEach((b) => b.addEventListener('click', () => {
      stop(); mode = b.dataset.probe;
      probeBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      build();
    }));
    playBtn.addEventListener('click', play);
    stepBtn.addEventListener('click', step);
    resetBtn.addEventListener('click', () => { stop(); paint(0); });
    build();
  }

  // =====================================================================
  // 2. A wait one cycle after its setter (the first exact scheduler's INIT, DECISIONS 62)
  // =====================================================================
  function initGap(host) {
    const svg = $('.gap svg', host), readouts = $('.sb-gapread', host), gapBtns = $$('[data-gap]', host);
    const STALE = 0x00001f40, SMID = 0x2a, S2R = 27, LOP = 4, TMAX = 40;
    let d = 1, raf = null, cursorEl = null;
    const hx = (v) => '0x' + (v >>> 0).toString(16).padStart(8, '0');
    const X0 = 300, X1 = 868, sx = (t) => X0 + (t / TMAX) * (X1 - X0);

    function model() {
      const sees = d >= 2;                                // the claim is visible to a wait from 2 cycles after its setter
      const lopT = sees ? Math.max(d, S2R) : d;
      const read = sees ? SMID : STALE;
      const lopOut = (read | 0x80000000) >>> 0;
      // R7 over time: stale, then LOP3's result, then (if the wait missed) the late S2R result overwrites it
      const segs = sees
        ? [{ a: 0, b: S2R, v: STALE }, { a: S2R, b: lopT + LOP, v: SMID }, { a: lopT + LOP, b: TMAX, v: lopOut }]
        : [{ a: 0, b: lopT + LOP, v: STALE }, { a: lopT + LOP, b: S2R, v: lopOut }, { a: S2R, b: TMAX, v: SMID }];
      return { lopT, sees, read, segs, final: segs[segs.length - 1].v };
    }

    function draw() {
      const m = model();
      svg.innerHTML = '';
      const rowY = [40, 78], laneY = 122, regY = 168;
      ST(svg, { x: 0, y: 16, class: 't-sm muted' }, 'cycle →', '周期 →');
      for (let t = 0; t <= TMAX; t += 5) {
        S('line', { x1: sx(t), y1: 22, x2: sx(t), y2: 210, class: 'guide' }, svg);
        S('text', { x: sx(t), y: 16, class: 't-sm muted', 'text-anchor': 'middle' }, svg, String(t));
      }
      S('text', { x: 0, y: rowY[0] + 6, class: 't-sm' }, svg, 'S2R R7, SR_VIRTUALSMID');
      ST(svg, { x: 0, y: rowY[0] + 19, class: 't-sm muted' }, `;[0:7:{}:${d}:0]  write claim on SB0`, `;[0:7:{}:${d}:0]  SB0 上的写占用`);
      S('rect', { x: sx(0) - 1, y: rowY[0] + 2, width: 3, height: 14, class: 'iss-p' }, svg);
      S('rect', { x: sx(0), y: rowY[0] + 4, width: sx(d) - sx(0), height: 10, class: 'stl-p' }, svg);
      S('text', { x: 0, y: rowY[1] + 6, class: 't-sm' }, svg, 'LOP3.LUT PT, R7, R7, 0x80000000, …');
      ST(svg, { x: 0, y: rowY[1] + 19, class: 't-sm muted' }, ';[7:7:{0}:1:0]  waits on SB0', ';[7:7:{0}:1:0]  等待 SB0');
      if (m.lopT > d) {
        S('rect', { x: sx(d), y: rowY[1] + 3, width: sx(m.lopT) - sx(d), height: 12, class: 'wt' }, svg);
        ST(svg, { x: sx(d) + 6, y: rowY[1] + 13, class: 't-sm strong' }, `waits on SB0 until ${S2R}`, `等待 SB0 直到第 ${S2R} 周期`);
      }
      S('rect', { x: sx(m.lopT) - 1, y: rowY[1] + 2, width: 3, height: 14, class: 'iss-p' }, svg);
      const defs = S('defs', null, svg);
      const mk = S('marker', { id: 'sb-gap-arr', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
      S('path', { d: 'M0,0 L8,4 L0,8 z', class: 'iss-k' }, mk);
      S('path', { d: `M${sx(m.lopT)},${rowY[1] + 18} L${sx(m.lopT)},${regY - 2}`, class: 'rd-arrow', 'marker-end': 'url(#sb-gap-arr)' }, svg);
      ST(svg, { x: sx(m.lopT) + 5, y: regY - 8, class: 't-sm strong' }, `reads R7 = ${hx(m.read)}`, `读到 R7 = ${hx(m.read)}`);
      S('text', { x: 0, y: laneY + 11, class: 't-sm muted' }, svg, 'SB0');
      S('rect', { x: sx(0), y: laneY + 2, width: sx(S2R) - sx(0), height: 12, rx: 2, class: 'clm-p' }, svg);
      S('rect', { x: sx(0), y: laneY - 1, width: sx(2) - sx(0), height: 18, class: 'vis' }, svg);
      ST(svg, { x: sx(2) + 4, y: laneY + 12, class: 't-sm' }, 'visible to waits from cycle 2 · released at 27', '从第 2 周期起对等待可见 · 第 27 周期释放');
      S('text', { x: 0, y: regY + 13, class: 't-sm muted' }, svg, 'R7');
      m.segs.forEach((sg, k) => {
        const last = k === m.segs.length - 1;
        const cls = last ? (sg.v >>> 31 ? 'val-ok' : 'val-bad') : 'val';
        S('rect', { x: sx(sg.a), y: regY, width: Math.max(sx(sg.b) - sx(sg.a), 1), height: 20, rx: 2, class: cls }, svg);
        if (sx(sg.b) - sx(sg.a) > 64) S('text', { x: sx(sg.a) + 4, y: regY + 14, class: 't-sm' }, svg, hx(sg.v));
      });
      ST(svg, { x: X0, y: 232, class: 't-sm strong ' + (m.final >>> 31 ? 'nvl' : 'bad') },
        m.final >>> 31 ? `header word ${hx(m.final)}: the SM id with the valid bit` : `header word ${hx(m.final)}: the late S2R overwrote LOP3's result, no valid bit`,
        m.final >>> 31 ? `头部字 ${hx(m.final)}：SM 编号带有效位` : `头部字 ${hx(m.final)}：迟到的 S2R 覆盖了 LOP3 的结果，没有有效位`);
      cursorEl = S('line', { x1: sx(0), y1: 22, x2: sx(0), y2: 212, class: 'cur' }, svg);
      cursorEl.style.opacity = '0';
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Valid bit (31)', '有效位（第 31 位）')}</span><span class="v">${m.final >>> 31 ? bi('set', '已置位') : bi('missing', '缺失')}</span><span class="s">${m.final >>> 31 ? bi('the decoder sees a written slot', '解码器看到一个已写入的槽位') : bi('the decoder sees an unwritten slot header', '解码器看到一个未写入的槽位头')}</span></div>
        <div class="readout"><span class="k">${bi('LOP3 issues at', 'LOP3 发射于')}</span><span class="v">${bi(`cycle ${m.lopT}`, `第 ${m.lopT} 周期`)}</span><span class="s">${m.sees ? bi('its wait saw the claim', '它的等待看到了占用') : bi('its wait did not see the claim yet', '它的等待还没看到占用')}</span></div>
        <div class="readout"><span class="k">${bi('ptxas, 976 kernels', 'ptxas，976 个 kernel')}</span><span class="v">0 ${bi('at distance 1', '个距离为 1')}</span><span class="s">${bi('5,314 write and 1,416 read claims waited on at distance 2 (DECISIONS 62)', '距离 2 处被等待的写占用 5,314 个、读占用 1,416 个（DECISIONS 62）')}</span></div>
        <div class="readout"><span class="k">${bi('The first exact scheduler, on the GPU', '第一版 exact 调度器，GPU 上')}</span><span class="v">0 / 57</span><span class="s">${bi('trace-buffer checks passed before SB_SET_GAP = 2', '引入 SB_SET_GAP = 2 之前通过的追踪缓冲区检查')}</span></div>`;
    }
    function play() {
      if (reduceMotion || !cursorEl) return;
      if (raf) cancelAnimationFrame(raf);
      const t0 = performance.now(), dur = 3200;
      cursorEl.style.opacity = '1';
      const tick = (ts) => {
        const f = Math.min((ts - t0) / dur, 1);
        const xx = sx(f * TMAX);
        cursorEl.setAttribute('x1', xx); cursorEl.setAttribute('x2', xx);
        if (f < 1) raf = requestAnimationFrame(tick); else { raf = null; cursorEl.style.opacity = '0'; }
      };
      raf = requestAnimationFrame(tick);
    }
    gapBtns.forEach((b) => b.addEventListener('click', () => {
      d = +b.dataset.gap;
      gapBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      draw(); play();
    }));
    draw();
  }

  const host = document.getElementById('sbsim');
  if (host) { initSim(host); initGap(host); }
})();
