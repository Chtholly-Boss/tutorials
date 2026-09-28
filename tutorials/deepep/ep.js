// DeepEP chapter 01 widgets: dispatch/combine simulator, token-slot byte map,
// hybrid tail-signal pipeline, and the SM/QP estimator (a port of ep.py).
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const alignUp = (x, a) => Math.ceil(x / a) * a;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const num = (x) => x.toLocaleString('en-US');
  const mib = (b) => (b / 1048576).toFixed(b >= 100 * 1048576 ? 0 : 1) + ' MiB';

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

  // ---------- shared tooltip ----------
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(html, ev) { tip.innerHTML = html; tip.hidden = false; moveTip(ev); }
  function moveTip(ev) {
    const pad = 14;
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { tip.hidden = true; }

  // =====================================================================
  // 1. Dispatch / combine simulator: EP4, direct mode, 3 tokens per rank,
  //    top-2 of 8 experts, expert_alignment = 4.
  // =====================================================================
  function initSim(host) {
    const R = 4, T = 3, E = 8, EPR = 2, K = 2, ALIGN = 4, LET = 'ABCD';
    const grid = $('.sim-grid', host);
    const statusEl = $('.sim-status', host);
    const msgsEl = $('.msgs', host);
    const stageBtns = $$('.stage-btn', host);
    const playBtn = $('[data-act="play"]', host);
    const rerouteBtn = $('[data-act="reroute"]', host);
    const mrBox = $('#sim-mr', host);
    const rankOf = (e) => Math.floor(e / EPR);

    let seed = 11, model = null, plan = null, stage = 1, run = 0;

    function tryModel(s) {
      const rnd = mulberry32(s);
      const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
      const toks = [];
      for (let r = 0; r < R; r++) for (let t = 0; t < T; t++) {
        const e0 = Math.floor(rnd() * E);
        let e1; do { e1 = Math.floor(rnd() * E); } while (e1 === e0);
        const k = { r, t, name: LET[r] + t, ex: [e0, e1], slot: {} };
        k.dst = [...new Set(k.ex.map(rankOf))];
        toks.push(k);
      }
      if (!toks.some((k) => k.dst.length === 1)) return null;
      const expCount = Array(E).fill(0);
      toks.forEach((k) => k.ex.forEach((e) => expCount[e]++));
      if (expCount.some((c) => c > 6)) return null;

      const countsTo = [...Array(R)].map(() => Array(R).fill(0));
      toks.forEach((k) => k.dst.forEach((d) => countsTo[k.r][d]++));

      // Send: every source races its tokens; slots come from the sender's own counter per destination
      const counter = [...Array(R)].map(() => Array(R).fill(0));
      const recv = [...Array(R)].map(() => [...Array(R)].map(() => Array(T).fill(null)));
      const sends = [];
      for (let r = 0; r < R; r++) {
        shuffle([0, 1, 2]).forEach((t, pos) => {
          const k = toks[r * T + t];
          k.dst.forEach((d) => {
            const slot = counter[r][d]++;
            recv[d][r][slot] = k; k.slot[d] = slot;
            sends.push({ k, d, slot, when: pos + rnd() * 0.9 });
          });
        });
      }
      sends.sort((a, b) => a.when - b.when);

      // Copy epilogue: expand into expert-grouped rows, padded to ALIGN
      const epi = [];
      for (let d = 0; d < R; d++) {
        const count = [expCount[d * EPR], expCount[d * EPR + 1]];
        const aligned = count.map((c) => alignUp(c, ALIGN));
        const start = [0, aligned[0]];
        const rows = Array(aligned[0] + aligned[1]).fill(null);
        const received = [];
        for (let src = 0; src < R; src++) for (let sl = 0; sl < countsTo[src][d]; sl++) received.push({ k: recv[d][src][sl], src, slot: sl });
        const cursor = start.slice();
        const moves = [];
        shuffle(received.slice()).forEach((it) => {
          it.k.ex.forEach((e, lane) => {
            if (rankOf(e) !== d) return;
            const le = e - d * EPR;
            const row = cursor[le]++;
            rows[row] = { k: it.k, lane, e };
            moves.push({ it, row });
          });
        });
        for (let le = 0; le < 2; le++) for (let i = start[le] + count[le]; i < start[le] + aligned[le]; i++) rows[i] = 'pad';
        epi.push({ count, aligned, start, rows, received, moves, psum: [start[0] + count[0], start[1] + count[1]] });
      }
      return { toks, countsTo, recv, sends, epi };
    }

    function buildModel(s) {
      for (let i = 0; i < 400; i++) { const m = tryModel(s + i * 101); if (m) return m; }
      return tryModel(11);
    }

    function combinePlan(m, multiRed) {
      const msgs = [];
      const cb = [...Array(R)].map(() => [...Array(K)].map(() => Array(T).fill(null)));
      for (let d = 0; d < R; d++) {
        const ep = m.epi[d];
        ep.received.forEach((it) => {
          const rows = [];
          ep.rows.forEach((row, idx) => { if (row && row !== 'pad' && row.k === it.k) rows.push({ idx, lane: row.lane }); });
          rows.sort((a, b) => a.lane - b.lane);
          if (multiRed) {
            // One message per (token, rank), written into the slot of the highest local top-k lane
            const master = rows[rows.length - 1].lane;
            const msg = { d, k: it.k, slot: master, rows: rows.map((x) => x.idx), reduce: rows.length > 1 };
            msgs.push(msg); cb[it.k.r][master][it.k.t] = msg;
          } else {
            rows.forEach((x) => {
              const msg = { d, k: it.k, slot: x.lane, rows: [x.idx], reduce: false };
              msgs.push(msg); cb[it.k.r][x.lane][it.k.t] = msg;
            });
          }
        });
      }
      return { msgs, cb };
    }

    const tokHTML = (k, sub, extra) => `<span class="tok r${k.r}${extra || ''}">${k.name}${sub ? `<span class="sub">${sub}</span>` : ''}</span>`;

    function buildDOM() {
      grid.innerHTML = '';
      for (let d = 0; d < R; d++) {
        const ep = model.epi[d];
        const xr = [0, 1, 2].map((t) => {
          const k = model.toks[d * T + t];
          const same = k.dst.length === 1 ? ' same' : '';
          return `<div class="xrow"><span data-x="${d}-${t}">${tokHTML(k)}</span>${k.ex.map((e) => `<span class="etag${same}">E${e}</span>`).join('')}</div>`;
        }).join('');
        const hdr = `<div class="cnt"><span></span>${[0, 1, 2, 3].map((j) => `<span class="c hd">r${j}</span>`).join('')}</div>`;
        const toRow = `<div class="cnt"><span>to</span>${[0, 1, 2, 3].map((j) => `<span class="c" data-to="${d}-${j}"></span>`).join('')}</div>`;
        const fromRow = `<div class="cnt"><span>from</span>${[0, 1, 2, 3].map((j) => `<span class="c" data-from="${d}-${j}"></span>`).join('')}</div>`;
        const recvRows = [0, 1, 2, 3].map((src) => `<div class="slots"><span>r${src}</span>${[0, 1, 2].map((sl) => `<span class="slot" data-rs="${d}-${src}-${sl}"></span>`).join('')}</div>`).join('');
        let rowsHTML = '';
        ep.rows.forEach((_, idx) => {
          const le = idx < ep.start[1] ? 0 : 1;
          if (idx === ep.start[1] && idx > 0) rowsHTML += '<span class="ebreak"></span>';
          const first = idx === ep.start[le];
          rowsHTML += `<span>${first ? 'E' + (d * EPR + le) : ''}</span><span class="slot" data-row="${d}-${idx}"></span>`;
        });
        if (!ep.rows.length) rowsHTML = `<span></span><span class="psum">${bi('no rows', '没有行')}</span>`;
        const cbHead = `<div class="slots"><span></span>${[0, 1, 2].map((t) => `<span style="text-align:center">${LET[d]}${t}</span>`).join('')}</div>`;
        const cbRows = [0, 1].map((k) => `<div class="slots"><span>k=${k}</span>${[0, 1, 2].map((t) => `<span class="slot" data-cb="${d}-${k}-${t}"></span>`).join('')}</div>`).join('');
        const cxRow = `<div class="slots"><span>out</span>${[0, 1, 2].map((t) => `<span class="slot" data-cx="${d}-${t}"></span>`).join('')}</div>`;

        const col = document.createElement('div');
        col.className = 'rk';
        col.innerHTML = `
          <div class="rk-h"><b>rank ${d}</b><span>E${d * 2} · E${d * 2 + 1}</span></div>
          <div class="blk" data-b="1"><div class="blk-h"><span>x · topk_idx</span></div>${xr}</div>
          <div class="blk" data-b="2"><div class="blk-h"><span>notify</span><span>${bi('tokens', 'token 数')}</span></div>${hdr}${toRow}${fromRow}<div class="psum" data-ecount="${d}"></div></div>
          <div class="blk" data-b="3"><div class="blk-h"><span>${bi('receive buffer', '接收 buffer')}</span><span>[src][slot]</span></div>${recvRows}</div>
          <div class="blk" data-b="4"><div class="blk-h"><span>recv_x</span><span>align ${ALIGN}</span></div><div class="rows">${rowsHTML}</div><div class="psum" data-psum="${d}"></div></div>
          <div class="blk" data-b="5"><div class="blk-h"><span>${bi('combine buffer', 'combine buffer')}</span><span>[k][token]</span></div>${cbHead}${cbRows}${cxRow}</div>`;
        grid.appendChild(col);
      }
    }

    const cell = (attr, key) => grid.querySelector(`[data-${attr}="${key}"]`);

    const STATUS = {
      1: bi('<b>Routing.</b> Four ranks hold three tokens each. The router picked 2 of 8 experts per token, and rank <i>r</i> owns experts E2<i>r</i> and E2<i>r</i>+1. A token whose two experts sit on the same rank has both tags outlined.',
            '<b>路由。</b>4 个 rank 各持有 3 个 token。router 为每个 token 从 8 个专家中选出 2 个，rank <i>r</i> 持有专家 E2<i>r</i> 与 E2<i>r</i>+1。两个专家落在同一 rank 上的 token，两个标签都带描边。'),
      2: bi('<b>Notify.</b> Notify warps count, per destination rank, the tokens that must go there. A token counts once even when both of its experts live on that rank. After the counts are exchanged, every rank knows how many tokens arrive from each source (<code>from</code>) and how many rows each local expert gets.',
            '<b>Notify。</b>notify warp 按目标 rank 统计需要发过去的 token 数；即使一个 token 的两个专家都在该 rank 上，也只计一次。计数交换完成后，每个 rank 都知道会从各个来源收到多少 token（<code>from</code>），以及每个本地专家会分到多少行。'),
      3: bi('<b>Send.</b> Dispatch warps copy each token once per destination rank. Every sender owns a private region on each receiver, so the slot comes from an <code>atomicAdd</code> on the sender\'s own counter, with no remote atomics. The slot a token lands in depends on which warp reaches the counter first.',
            '<b>发送。</b>dispatch warp 把每个 token 按目标 rank 各拷贝一份。每个发送方在每个接收方上都有专属区域，因此槽位来自发送方本地计数器上的 <code>atomicAdd</code>，不需要远程原子操作。token 落在哪个槽，取决于哪个 warp 先抢到计数器。'),
      4: bi('<b>Copy epilogue.</b> Each rank expands its receive buffer into <code>recv_x</code>: one row per (token, local expert), grouped by expert. An <code>atomicAdd</code> on the expert\'s cursor picks the row, and each expert block is padded with zero rows up to the alignment (4 here). The subscript <code>k</code> is the top-k lane the row came from.',
            '<b>Copy epilogue。</b>每个 rank 把接收 buffer 展开成 <code>recv_x</code>：每个（token, 本地专家）占一行，按专家分组。行号由该专家游标上的 <code>atomicAdd</code> 决定，每个专家区块用零行补齐到对齐值（这里是 4）。下标 <code>k</code> 表示该行来自哪个 top-k lane。'),
      '5on': bi('<b>Combine.</b> Expert outputs travel back to each token\'s source rank. With <code>allow_multiple_reduction</code> on, rows of the same token on the same rank are summed locally first (double border), so at most one message per (token, rank) crosses the fabric. It lands in the slot of the highest local top-k lane, and the source sums its slots into the output row.',
                '<b>Combine。</b>专家输出被送回各 token 的来源 rank。开启 <code>allow_multiple_reduction</code> 时，同一 token 在同一 rank 上的多行先在本地求和（双线边框），因此每个（token, rank）最多只有一条消息跨越互连；它写入本地最高 top-k lane 对应的槽位，来源 rank 再把各槽位累加成输出行。'),
      '5off': bi('<b>Combine.</b> Expert outputs travel back to each token\'s source rank. With <code>allow_multiple_reduction</code> off, every expert row travels on its own into slot <code>k</code>, and the source rank performs the only reduction. Precision is better; traffic is higher when two experts share a rank.',
                 '<b>Combine。</b>专家输出被送回各 token 的来源 rank。关闭 <code>allow_multiple_reduction</code> 时，每个专家行单独发往槽位 <code>k</code>，只在来源 rank 做唯一一次规约。精度更好；当两个专家位于同一 rank 时流量更大。')
    };

    function paint(st) {
      stage = st;
      const m = model;
      for (let d = 0; d < R; d++) {
        for (let j = 0; j < R; j++) {
          cell('to', `${d}-${j}`).textContent = st >= 2 ? m.countsTo[d][j] : '';
          cell('from', `${d}-${j}`).textContent = st >= 2 ? m.countsTo[j][d] : '';
        }
        const ep = m.epi[d];
        cell('ecount', d).innerHTML = st >= 2 ? `E${d * 2} ×<b>${ep.count[0]}</b> · E${d * 2 + 1} ×<b>${ep.count[1]}</b>` : '&nbsp;';
        for (let src = 0; src < R; src++) for (let sl = 0; sl < T; sl++) {
          const k = m.recv[d][src][sl];
          cell('rs', `${d}-${src}-${sl}`).innerHTML = st >= 3 && k ? tokHTML(k) : '';
        }
        ep.rows.forEach((row, idx) => {
          const c = cell('row', `${d}-${idx}`);
          c.classList.toggle('pad', st >= 4 && row === 'pad');
          c.innerHTML = st >= 4 ? (row === 'pad' ? '0' : row ? tokHTML(row.k, 'k' + row.lane) : '') : '';
        });
        cell('psum', d).innerHTML = st >= 4 ? `psum_…_per_expert = [<b>${ep.psum[0]}</b>, <b>${ep.psum[1]}</b>]` : '&nbsp;';
        for (let kk = 0; kk < K; kk++) for (let t = 0; t < T; t++) {
          const msg = plan.cb[d][kk][t];
          cell('cb', `${d}-${kk}-${t}`).innerHTML = st >= 5 && msg ? tokHTML(msg.k, '←' + msg.d, msg.reduce ? ' sum' : '') : '';
        }
        for (let t = 0; t < T; t++) {
          const k = m.toks[d * T + t];
          cell('cx', `${d}-${t}`).innerHTML = st >= 5 ? tokHTML(k, 'Σ', ' sum') : '';
        }
      }
      $$('.blk', grid).forEach((b) => b.classList.toggle('idle', +b.dataset.b > st));
      stageBtns.forEach((b) => {
        const n = +b.dataset.stage;
        b.classList.toggle('done', n < st);
        if (n === st) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      statusEl.innerHTML = st === 5 ? STATUS[mrBox.checked ? '5on' : '5off'] : STATUS[st];
      const picks = R * T * K;
      const parts = [];
      if (st >= 3) parts.push(bi(`dispatch: <b>${m.sends.length}</b> token copies for ${picks} top-k picks`, `dispatch：${picks} 个 top-k 选择只需 <b>${m.sends.length}</b> 份 token 拷贝`));
      if (st >= 5) parts.push(bi(`combine: <b>${plan.msgs.length}</b> messages`, `combine：<b>${plan.msgs.length}</b> 条消息`));
      msgsEl.innerHTML = parts.join(' · ') || '&nbsp;';
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
        const chip = g.firstElementChild;
        chip.style.width = b.w + 'px';
        chip.style.height = b.h + 'px';
        grid.appendChild(g);
        const x0 = a.x + (a.w - b.w) / 2, y0 = a.y + (a.h - b.h) / 2;
        const mx = (x0 + b.x) / 2, my = Math.min(y0, b.y) - 26;
        const anim = g.animate([
          { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 0.2 },
          { transform: `translate(${mx}px, ${my}px) scale(1.12)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${b.x}px, ${b.y}px) scale(1)`, opacity: 1 }
        ], { duration: 640, delay, easing: 'cubic-bezier(.3,.65,.25,1)', fill: 'both' });
        anim.finished.then(() => { g.remove(); if (token === run) reveal(toEl); resolve(); }, () => { g.remove(); resolve(); });
      });
    }

    function reveal(el) {
      el.classList.remove('pending');
      const chip = el.querySelector('.tok') || el;
      chip.classList.remove('pulse'); void chip.offsetWidth; chip.classList.add('pulse');
    }

    function abort() { run++; $$('.fly-ghost', grid).forEach((g) => g.remove()); }

    async function animateStage(n) {
      abort();
      const token = run;
      paint(n);
      if (reduceMotion) return;
      const flights = [];
      if (n === 2) {
        const froms = [];
        for (let d = 0; d < R; d++) for (let j = 0; j < R; j++) {
          const to = cell('to', `${d}-${j}`), from = cell('from', `${j}-${d}`);
          from.classList.add('pending'); froms.push([to, from, d, model.countsTo[d][j]]);
          to.classList.add('pending');
        }
        for (let d = 0; d < R; d++) for (let j = 0; j < R; j++) setTimeout(() => token === run && reveal(cell('to', `${d}-${j}`)), (d * R + j) * 25);
        await sleep(450);
        froms.forEach(([to, from, d, c], i) => flights.push(fly(to, from, `<span class="tok r${d}">${c}</span>`, i * 55, token)));
      } else if (n === 3) {
        model.sends.forEach((s) => cell('rs', `${s.d}-${s.k.r}-${s.slot}`).classList.add('pending'));
        model.sends.forEach((s, i) => flights.push(fly(cell('x', `${s.k.r}-${s.k.t}`), cell('rs', `${s.d}-${s.k.r}-${s.slot}`), tokHTML(s.k), i * 110, token)));
      } else if (n === 4) {
        const pads = [];
        let maxLen = 0;
        model.epi.forEach((ep, d) => {
          ep.rows.forEach((row, idx) => { const c = cell('row', `${d}-${idx}`); c.classList.add('pending'); if (row === 'pad') pads.push(c); });
          maxLen = Math.max(maxLen, ep.moves.length);
        });
        let i = 0;
        for (let step = 0; step < maxLen; step++) model.epi.forEach((ep, d) => {
          const mv = ep.moves[step];
          if (!mv) return;
          const row = ep.rows[mv.row];
          flights.push(fly(cell('rs', `${d}-${mv.it.src}-${mv.it.slot}`), cell('row', `${d}-${mv.row}`), tokHTML(row.k, 'k' + row.lane), i++ * 95, token));
        });
        await Promise.all(flights);
        if (token !== run) return;
        pads.forEach((c, j) => setTimeout(() => token === run && reveal(c), j * 60));
        return;
      } else if (n === 5) {
        plan.msgs.forEach((msg) => cell('cb', `${msg.k.r}-${msg.slot}-${msg.k.t}`).classList.add('pending'));
        for (let r = 0; r < R; r++) for (let t = 0; t < T; t++) cell('cx', `${r}-${t}`).classList.add('pending');
        plan.msgs.forEach((msg, i) => {
          const src = cell('row', `${msg.d}-${msg.rows[msg.rows.length - 1]}`);
          if (msg.reduce) setTimeout(() => { if (token === run) msg.rows.forEach((ri) => reveal(cell('row', `${msg.d}-${ri}`))); }, i * 120);
          flights.push(fly(src, cell('cb', `${msg.k.r}-${msg.slot}-${msg.k.t}`), tokHTML(msg.k, '←' + msg.d, msg.reduce ? ' sum' : ''), i * 120 + (msg.reduce ? 260 : 0), token));
        });
        await Promise.all(flights);
        if (token !== run) return;
        for (let r = 0; r < R; r++) for (let t = 0; t < T; t++) setTimeout(() => token === run && reveal(cell('cx', `${r}-${t}`)), (r * T + t) * 70);
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
        await sleep(reduceMotion ? 250 : 450);
        if (run !== expected) return;
        await animateStage(n);  // bumps `run` once
        expected += 1;
        if (run !== expected) return;
      }
    }

    // wiring
    stageBtns.forEach((b) => b.addEventListener('click', () => {
      const n = +b.dataset.stage;
      if (n === 1) { abort(); paint(1); } else animateStage(n);
    }));
    playBtn.addEventListener('click', playAll);
    rerouteBtn.addEventListener('click', () => {
      abort();
      seed = Math.floor(Math.random() * 1e9);
      model = buildModel(seed); plan = combinePlan(model, mrBox.checked);
      buildDOM(); paint(1);
    });
    mrBox.addEventListener('change', () => {
      plan = combinePlan(model, mrBox.checked);
      if (stage === 5) animateStage(5); else paint(stage);
    });

    model = buildModel(seed);
    plan = combinePlan(model, mrBox.checked);
    buildDOM();
    paint(1);
  }

  // =====================================================================
  // 2. Token slot byte map (layout/ep/token.cuh)
  // =====================================================================
  function initByteMap(host) {
    const hid = $('#bm-hidden', host), hidOut = $('#bm-hidden-out', host);
    const dtype = $('#bm-dtype', host), topk = $('#bm-topk', host), topkOut = $('#bm-topk-out', host);
    const role = $('#bm-role', host), ranks = $('#bm-ranks', host), toks = $('#bm-tokens', host);
    const svg = $('svg', host), readouts = $('.readouts', host), tbody = $('tbody', host), note = $('.bm-note', host);
    const SMEM = 232448, EXPERTS = 256;

    function layout() {
      const H = +hid.value, k = +topk.value, disp = role.value === 'dispatch';
      const fp8 = disp && dtype.value === 'fp8';
      const hiddenB = H * (fp8 ? 1 : 2);
      const packs = fp8 ? Math.ceil(H / 128) : 0;
      const sfB = packs * 4;
      const metaB = k * 8 + (disp ? (1 + k) * 4 : 0);
      const a32 = (x) => alignUp(x, 32);
      const m0 = hiddenB + a32(sfB);
      const data = alignUp(a32(hiddenB) + a32(sfB) + a32(metaB), 64);
      const smem = data + 32;
      const fields = [{ key: 'hidden', label: 'hidden', short: 'hidden', start: 0, len: hiddenB, cls: 'seg-hidden' }];
      if (sfB) fields.push({ key: 'sf', label: 'scale factors', short: 'SF', start: hiddenB, len: sfB, cls: 'seg-sf' });
      fields.push({ key: 'idx', label: 'topk_idx', short: 'idx', start: m0, len: 4 * k, cls: 'seg-meta' });
      fields.push({ key: 'w', label: 'topk_weights', short: 'w', start: m0 + 4 * k, len: 4 * k, cls: 'seg-meta' });
      if (disp) {
        fields.push({ key: 'src', label: 'src_token_global_idx', short: 'src', start: m0 + 8 * k, len: 4, cls: 'seg-meta' });
        fields.push({ key: 'll', label: 'linked_list_idx', short: 'list', start: m0 + 8 * k + 4, len: 4 * k, cls: 'seg-meta' });
      }
      // padding = uncovered ranges inside [0, data)
      const pads = [];
      let cur = 0;
      fields.slice().sort((a, b) => a.start - b.start).forEach((f) => { if (f.start > cur) pads.push({ start: cur, len: f.start - cur }); cur = Math.max(cur, f.start + f.len); });
      if (data > cur) pads.push({ start: cur, len: data - cur });
      pads.forEach((p) => fields.push({ key: 'pad', label: 'padding', short: 'pad', start: p.start, len: p.len, cls: 'seg-pad' }));
      fields.push({ key: 'mbar', label: 'mbarrier (shared memory only)', short: 'mbar', start: data, len: 32, cls: 'seg-mbar' });
      fields.sort((a, b) => a.start - b.start);
      const used = hiddenB + sfB + metaB;
      const R = +ranks.value, M = +toks.value;
      const notify = alignUp(R + EXPERTS, 128) * 4;
      const warps = disp ? Math.min(Math.floor((SMEM - notify) / smem), 28) : Math.min(Math.floor(SMEM / smem), 32);
      const bufBytes = disp ? R * M * data : Math.min(R, k) * M * data;
      return { H, k, disp, fp8, hiddenB, sfB, metaB, data, smem, fields, used, warps, bufBytes, R, M, notify };
    }

    function draw(L) {
      svg.innerHTML = '';
      const defs = S('defs', null, svg);
      const pat = S('pattern', { id: 'bm-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      S('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'hatch-line' }, pat);
      const X0 = 20, W = 840;
      const s1 = W / L.smem;
      S('text', { x: X0, y: 16, class: 't-sm muted' }, svg, `whole slot, to scale · ${num(L.smem)} B`);
      L.fields.forEach((f) => S('rect', { x: X0 + f.start * s1, y: 26, width: Math.max(f.len * s1, 0.8), height: 24, class: f.cls }, svg));
      S('text', { x: X0 + 8, y: 42, class: 't-sm' }, svg, `hidden · ${num(L.hiddenB)} B`);
      // zoom window
      const zs = Math.max(0, L.hiddenB - 64), ze = L.smem;
      const s2 = W / (ze - zs);
      S('path', { d: `M${X0 + zs * s1},50 L${X0},96 M${X0 + W},50 L${X0 + W},96`, class: 'guide' }, svg);
      S('text', { x: X0 + W, y: 68, class: 't-sm muted', 'text-anchor': 'end' }, svg, `zoom: last ${num(ze - zs)} B`);
      const ticks = new Set();
      L.fields.forEach((f) => {
        const a = Math.max(f.start, zs), b = f.start + f.len;
        if (b <= zs) return;
        const x = X0 + (a - zs) * s2, w = (b - a) * s2;
        S('rect', { x, y: 96, width: Math.max(w, 0.8), height: 34, class: f.cls }, svg);
        const lbl = f.key === 'hidden' ? '… hidden' : f.short;
        if (w >= lbl.length * 6.6 + 8) S('text', { x: x + w / 2, y: 117, class: 't-sm', 'text-anchor': 'middle' }, svg, lbl);
        ticks.add(a); ticks.add(b);
      });
      let lastX = -1e9;
      [...ticks].sort((a, b) => a - b).forEach((t) => {
        const x = X0 + (t - zs) * s2;
        S('line', { x1: x, y1: 131, x2: x, y2: 137, class: 'guide' }, svg);
        if (x - lastX >= 44) { S('text', { x, y: 150, class: 't-sm muted', 'text-anchor': 'middle' }, svg, String(t)); lastX = x; }
      });
      const legend = [['seg-hidden', 'hidden'], ['seg-sf', 'FP8 scales'], ['seg-meta', 'metadata'], ['seg-pad', 'padding'], ['seg-mbar', 'mbarrier (SMEM copy only)']];
      let lx = X0;
      legend.forEach(([c, t]) => {
        S('rect', { x: lx, y: 170, width: 14, height: 12, class: c }, svg);
        S('text', { x: lx + 20, y: 180, class: 't-sm' }, svg, t);
        lx += 36 + t.length * 6.5;
      });
    }

    function update() {
      hidOut.textContent = num(+hid.value);
      topkOut.textContent = topk.value;
      dtype.disabled = role.value !== 'dispatch';
      const L = layout();
      draw(L);
      const warpsLabel = L.disp ? bi('Dispatch warps per SM', '每 SM 的 dispatch warp') : bi('Combine warps per SM', '每 SM 的 combine warp');
      const warpsSub = L.disp
        ? bi(`⌊(232,448 − ${num(L.notify)}) / ${num(L.smem)}⌋, max 28`, `⌊(232,448 − ${num(L.notify)}) / ${num(L.smem)}⌋，上限 28`)
        : bi(`⌊232,448 / ${num(L.smem)}⌋, max 32`, `⌊232,448 / ${num(L.smem)}⌋，上限 32`);
      const bufSub = L.disp
        ? bi(`${L.R} ranks × ${num(L.M)} tokens × slot`, `${L.R} 个 rank × ${num(L.M)} 个 token × 槽大小`)
        : bi(`min(${L.R}, top-k ${L.k}) × ${num(L.M)} × slot`, `min(${L.R}, top-k ${L.k}) × ${num(L.M)} × 槽大小`);
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Slot in HBM', '显存中的槽')}</span><span class="v">${num(L.data)} B</span><span class="s">${bi('rounded up to 64 B for RDMA', '向上对齐到 64 B（RDMA）')}</span></div>
        <div class="readout"><span class="k">${bi('Slot in SMEM', '共享内存中的槽')}</span><span class="v">${num(L.smem)} B</span><span class="s">${bi('+32 B for the mbarrier', '另加 32 B 给 mbarrier')}</span></div>
        <div class="readout"><span class="k">${bi('Padding', '填充')}</span><span class="v">${num(L.data - L.used)} B</span><span class="s">${bi(`${(100 * (L.data - L.used) / L.data).toFixed(2)}% of the slot`, `占槽的 ${(100 * (L.data - L.used) / L.data).toFixed(2)}%`)}</span></div>
        <div class="readout"><span class="k">${warpsLabel}</span><span class="v">${L.warps}</span><span class="s">${warpsSub}</span></div>
        <div class="readout"><span class="k">${bi('Direct receive buffer', 'direct 接收 buffer')}</span><span class="v">${mib(L.bufBytes)}</span><span class="s">${bufSub}</span></div>`;
      tbody.innerHTML = L.fields.map((f) => `<tr><td class="mono">${f.label}</td><td class="num">${num(f.start)}</td><td class="num">${num(f.len)}</td></tr>`).join('');
      note.hidden = L.disp;
    }
    [hid, dtype, topk, role, ranks, toks].forEach((el) => el.addEventListener('input', update));
    update();
  }

  // =====================================================================
  // 3. Hybrid pipeline: scale-out sender, batched tail signal, forwarder
  // =====================================================================
  function initPipe(host) {
    const svg = $('svg', host), readouts = $('.readouts', host);
    const playBtn = $('[data-act="play"]', host), stepBtn = $('[data-act="step"]', host), resetBtn = $('[data-act="reset"]', host);
    const iv = $('#pp-interval', host), ivOut = $('#pp-interval-out', host);
    const N = 24, TICK = 300;
    const rnd = mulberry32(5);
    const dest = Array.from({ length: N }, () => 4 + Math.floor(rnd() * 4));
    let st, timer = null;

    function reset(preTicks) {
      st = { t: 0, sent: 0, tail: 0, inflight: null, lastSig: 0, consumed: 0, signals: 0, stalls: 0, finish: false, dst: [0, 0, 0, 0] };
      for (let i = 0; i < preTicks; i++) tick(true);
      draw(null);
    }

    function tick(silent) {
      if (st.consumed >= N) return null;
      st.t++;
      if (st.inflight !== null) { st.tail = st.inflight.tail; st.finish = st.finish || st.inflight.finish; st.inflight = null; }
      if (st.sent < N) {
        st.sent++;
        const interval = +iv.value;
        if (st.sent - st.lastSig >= interval || st.sent === N) {
          st.inflight = { tail: st.sent, finish: st.sent === N };
          st.lastSig = st.sent; st.signals++;
        }
      }
      let moved = null;
      if (st.consumed < st.tail) { moved = st.consumed; st.dst[dest[moved] - 4]++; st.consumed++; }
      else if (st.consumed < N) st.stalls++;
      if (!silent) draw(moved);
      return moved;
    }

    function draw(moved) {
      svg.innerHTML = '';
      const defs = S('defs', null, svg);
      const pat = S('pattern', { id: 'pp-hatch', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      S('line', { x1: 0, y1: 0, x2: 0, y2: 5, class: 'hatch-line' }, pat);
      const mk = S('marker', { id: 'pp-ar', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', orient: 'auto' }, defs);
      S('path', { d: 'M0,0 L8,4 L0,8 z', class: 'fill-rdma' }, mk);
      // sender
      S('rect', { x: 0, y: 52, width: 150, height: 76, rx: 4, class: 'box' }, svg);
      S('text', { x: 12, y: 74, class: 't-lg' }, svg, 'rank 1');
      S('text', { x: 12, y: 92, class: 't-sm muted' }, svg, 'scale-out warp · ch c');
      S('text', { x: 12, y: 114, class: 't-sm' }, svg, `sent ${st.sent} / ${N}`);
      S('line', { x1: 150, y1: 88, x2: 196, y2: 88, class: 'ln-rdma', 'marker-end': 'url(#pp-ar)' }, svg);
      S('text', { x: 173, y: 80, class: 't-sm', 'text-anchor': 'middle' }, svg, 'put');
      // slots on the rail peer
      S('text', { x: 200, y: 62, class: 't-sm muted' }, svg, 'rank 5 · scaleout_recv_buffer[node 0][ch c]');
      for (let i = 0; i < N; i++) {
        const x = 200 + i * 20;
        let cls = 's-empty';
        if (i < st.consumed) cls = 's-fwd';
        else if (i < st.tail) cls = 's-visible';
        else if (i < st.sent) cls = 's-landed';
        S('rect', { x, y: 72, width: 18, height: 30, rx: 2, class: cls }, svg);
        if (i < st.sent) S('text', { x: x + 9, y: 91, class: 't-sm', 'text-anchor': 'middle' }, svg, String(dest[i]));
      }
      const px = (n) => 200 + n * 20 - 1;
      const clampX = (x) => Math.min(Math.max(x, 240), 640);
      S('path', { d: `M${px(st.tail)},106 l-5,8 h10 z`, class: 'fill-rdma' }, svg);
      S('text', { x: clampX(px(st.tail)), y: 128, class: 't-sm', 'text-anchor': 'middle' }, svg, `signaled tail = ${st.tail}`);
      S('path', { d: `M${px(st.consumed)},136 l-5,8 h10 z`, class: 'fill-nvl' }, svg);
      S('text', { x: clampX(px(st.consumed)), y: 158, class: 't-sm', 'text-anchor': 'middle' }, svg, `forwarded = ${st.consumed}`);
      S('text', { x: 200, y: 186, class: 't-sm' + (st.inflight ? '' : ' muted') }, svg,
        st.inflight ? `tail signal in flight → ${st.inflight.tail}${st.inflight.finish ? ' + finish flag' : ''}` : (st.finish ? 'finish flag received' : 'no signal in flight'));
      // forwarder
      S('line', { x1: 682, y1: 88, x2: 700, y2: 88, class: 'guide' }, svg);
      S('rect', { x: 700, y: 58, width: 78, height: 60, rx: 4, class: 'box' }, svg);
      S('text', { x: 710, y: 80, class: 't-lg' }, svg, 'rank 5');
      S('text', { x: 710, y: 97, class: 't-sm muted' }, svg, 'fwd warp');
      S('text', { x: 710, y: 111, class: 't-sm muted' }, svg, 'ch c');
      for (let j = 0; j < 4; j++) {
        const y = 6 + j * 44;
        S('line', { x1: 778, y1: 88, x2: 806, y2: y + 17, class: 'ln-nvl' }, svg);
        S('rect', { x: 806, y, width: 74, height: 34, rx: 3, class: 'dst-box' }, svg);
        S('text', { x: 814, y: y + 21, class: 't-sm' }, svg, `rank ${4 + j} · ${st.dst[j]}`);
      }
      if (moved !== null && !reduceMotion) {
        const dot = S('circle', { cx: 0, cy: 0, r: 5, class: 'fill-nvl' }, svg);
        const j = dest[moved] - 4;
        dot.animate([
          { transform: `translate(${200 + moved * 20 + 9}px, 87px)` },
          { transform: `translate(739px, 88px)`, offset: 0.45 },
          { transform: `translate(843px, ${6 + j * 44 + 17}px)` }
        ], { duration: TICK - 20, easing: 'ease-in-out', fill: 'both' });
      }
      const done = st.consumed >= N;
      readouts.innerHTML = `
        <div class="readout"><span class="k">${bi('Ticks', '时钟')}</span><span class="v">${st.t}</span><span class="s">${done ? bi('all 24 forwarded', '24 个已全部转发') : bi('1 token per side per tick', '每侧每个时钟 1 个 token')}</span></div>
        <div class="readout"><span class="k">${bi('Data puts', '数据 put')}</span><span class="v">${st.sent}</span><span class="s">${bi('one per token', '每个 token 一次')}</span></div>
        <div class="readout key"><span class="k">${bi('Tail signals', 'tail 信号')}</span><span class="v">${st.signals}</span><span class="s">${bi('RDMA atomics on the tail word', 'tail 字上的 RDMA 原子操作')}</span></div>
        <div class="readout key"><span class="k">${bi('Forwarder stalls', 'forwarder 空等')}</span><span class="v">${st.stalls}</span><span class="s">${bi('ticks with data landed but not yet visible', '数据已到但尚不可见的时钟数')}</span></div>`;
      playBtn.innerHTML = timer ? bi('Pause', '暂停') : bi(done ? 'Replay' : 'Play', done ? '重放' : '播放');
      stepBtn.disabled = done;
    }

    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    playBtn.addEventListener('click', () => {
      if (timer) { stop(); draw(null); return; }
      if (st.consumed >= N) reset(0);
      timer = setInterval(() => { const r = tick(false); if (st.consumed >= N) { stop(); draw(r); } }, TICK);
      draw(null);
    });
    stepBtn.addEventListener('click', () => { stop(); tick(false); });
    resetBtn.addEventListener('click', () => { stop(); reset(0); });
    iv.addEventListener('input', () => { ivOut.textContent = iv.value; stop(); reset(0); });
    ivOut.textContent = iv.value;
    reset(11);
  }

  // =====================================================================
  // 4. SM / QP estimator: EPBuffer.get_theoretical_num_sms + get_theoretical_num_qps
  // =====================================================================
  function initEstimator(host) {
    const f = (id) => $('#' + id, host);
    const els = {
      preset: f('est-preset'), nodes: f('est-nodes'), gpn: f('est-gpn'), experts: f('est-experts'), topk: f('est-topk'),
      hybrid: f('est-hybrid'), nvl: f('est-nvl'), rdma: f('est-rdma'), smr: f('est-smr'), smw: f('est-smw'),
      sms: f('est-sms'), overlap: f('est-overlap'), fast: f('est-fast')
    };
    const chart = $('.est-chart svg', host), readouts = $('.readouts', host), chain = $('.est-chain', host), warn = $('.est-warn', host);
    const PRESETS = {
      ep8: { nodes: 1, gpn: 8, hybrid: true },
      ep8x2: { nodes: 2, gpn: 8, hybrid: true },
      ep8x4: { nodes: 4, gpn: 8, hybrid: true },
      ep16d: { nodes: 2, gpn: 8, hybrid: false }
    };

    function expectedTopk(E, k, G) {
      let ratio = 1;
      const out = E - E / G;
      for (let i = 0; i < k; i++) ratio *= Math.max(out - i, 0) / (E - i);
      return G * (1 - ratio);
    }

    function compute() {
      const nodes = +els.nodes.value, gpn = +els.gpn.value, E = +els.experts.value, k = +els.topk.value;
      const hybrid = els.hybrid.checked;
      const ranks = nodes * gpn;
      const scaleout = hybrid ? nodes : 1;
      const nvlRanks = gpn, rdmaRanks = nodes;
      const nvlGbs = +els.nvl.value, rdmaGbs = rdmaRanks > 1 ? +els.rdma.value : 0;
      const smr = +els.smr.value, smw = +els.smw.value, devSMs = +els.sms.value;
      if (!(E > 0 && k > 0 && k <= E && E % ranks === 0 && (scaleout === 1 || E % scaleout === 0))) return { error: true, ranks, E };

      let smRead = 0, smWrite = 0, rdmaT = 0, nvlT = 0;
      const expScaleout = scaleout > 1 ? expectedTopk(E, k, scaleout) : 0;
      const expAll = expectedTopk(E, k, ranks);
      smRead += 1 / expAll;
      if (scaleout > 1) {
        smWrite += 1 / expAll;
        smWrite += (1 / expAll) * (expScaleout / scaleout);
        rdmaT += (1 / expAll) * (expScaleout * (1 - 1 / scaleout));
        smRead += expScaleout / expAll;
        smWrite += 1;
        nvlT += 1 - 1 / gpn;
      } else {
        if (rdmaRanks > 1) smWrite += 1 / expAll;
        smWrite += nvlRanks / ranks;
        nvlT += (nvlRanks / ranks) * (1 - 1 / nvlRanks);
        rdmaT += (ranks - nvlRanks) / ranks;
      }
      const rdmaBound = scaleout > 1 && rdmaT / rdmaGbs > nvlT / nvlGbs;
      const bt = rdmaBound ? rdmaT : nvlT, bg = rdmaBound ? rdmaGbs : nvlGbs;
      const c = bt > 0 ? bg / bt : 0;
      const cands = [
        { en: 'dispatch · HBM read', zh: 'dispatch · HBM 读', term: 'sm_read', v: c * smRead / smr, formula: `${bg} / ${bt.toFixed(4)} × ${smRead.toFixed(4)} / ${smr}` },
        { en: 'dispatch · HBM write', zh: 'dispatch · HBM 写', term: 'sm_write', v: c * smWrite / smw, formula: `${bg} / ${bt.toFixed(4)} × ${smWrite.toFixed(4)} / ${smw}` },
        { en: 'combine · HBM read', zh: 'combine · HBM 读', term: 'sm_write − nvlink', v: c * (smWrite - nvlT) / smr, formula: `${bg} / ${bt.toFixed(4)} × (${smWrite.toFixed(4)} − ${nvlT.toFixed(4)}) / ${smr}` },
        { en: 'combine · HBM write', zh: 'combine · HBM 写', term: 'sm_read + nvlink', v: c * (smRead + nvlT) / smw, formula: `${bg} / ${bt.toFixed(4)} × (${smRead.toFixed(4)} + ${nvlT.toFixed(4)}) / ${smw}` }
      ];
      const raw = bt > 0 ? Math.max(...cands.map((x) => x.v)) : devSMs;
      const scaled = raw * 1.3;
      const ceil = Math.ceil(scaled);
      const floor4 = Math.max(4, ceil);
      const aligned = alignUp(floor4, 4);
      const overlapped = els.overlap.checked ? aligned : Math.max(aligned, 64);
      const cap = Math.floor(devSMs / 2) * 2;
      const final = Math.min(overlapped, cap);
      const allocated = hybrid ? (els.fast.checked ? 65 : 129) : 17;
      const theoQPs = hybrid ? final * 16 + 1 : Math.min(final, 9);
      return { nodes, gpn, ranks, scaleout, hybrid, expScaleout, expAll, smRead, smWrite, rdmaT, nvlT, rdmaBound, bt, bg, cands, raw, scaled, ceil, aligned, overlapped, cap, final, allocated, theoQPs, qps: Math.min(theoQPs, allocated) };
    }

    function niceMax(v) {
      if (v <= 0) return 1;
      const p = Math.pow(10, Math.floor(Math.log10(v)));
      for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
      return 10 * p;
    }

    function drawChart(r) {
      chart.innerHTML = '';
      const X0 = 190, W = 380, rowH = 34, top = 10;
      const max = niceMax(Math.max(...r.cands.map((c) => c.v)) * 1.08);
      const sx = (v) => X0 + (v / max) * W;
      for (let i = 0; i <= 4; i++) {
        const v = (max / 4) * i, x = sx(v);
        S('line', { x1: x, y1: top - 4, x2: x, y2: top + rowH * 4 - 6, class: 'grid' }, chart);
        S('text', { x, y: top + rowH * 4 + 10, class: 't-sm muted', 'text-anchor': 'middle' }, chart, (Math.round(v * 10) / 10).toString());
      }
      const barCls = r.rdmaBound ? 'bar-rdma' : 'bar-nvl';
      const lang = document.documentElement.dataset.lang === 'zh' ? 'zh' : 'en';
      r.cands.forEach((c, i) => {
        const y = top + i * rowH;
        const isMax = c.v === r.raw;
        S('text', { x: 0, y: y + 14, class: 't-sm' + (isMax ? '' : ' muted') }, chart, lang === 'zh' ? c.zh : c.en);
        S('rect', { x: X0, y: y + 4, width: Math.max((c.v / max) * W, 1), height: 14, rx: 3, class: `bar ${barCls}${isMax ? '' : ' dim'}` }, chart);
        S('text', { x: sx(c.v) + 6, y: y + 15, class: 't-sm' }, chart, c.v.toFixed(2) + (isMax ? '  ← max' : ''));
        const hit = S('rect', { x: 0, y, width: 640, height: rowH - 2, class: 'hit' }, chart);
        const html = `<b>${lang === 'zh' ? c.zh : c.en}</b><br>${c.formula}<br>= ${c.v.toFixed(3)} SMs`;
        hit.addEventListener('mouseenter', (ev) => showTip(html, ev));
        hit.addEventListener('mousemove', moveTip);
        hit.addEventListener('mouseleave', hideTip);
      });
      S('text', { x: X0 + W, y: top + rowH * 4 + 26, class: 't-sm muted', 'text-anchor': 'end' }, chart, 'SMs needed to keep pace with the bounding link');
    }

    function update() {
      const r = compute();
      if (r.error) {
        readouts.innerHTML = `<div class="readout"><span class="k">${bi('Invalid shape', '形状无效')}</span><span class="s">${bi(`experts must divide evenly across ${r.ranks} ranks`, `专家数必须能被 ${r.ranks} 个 rank 整除`)}</span></div>`;
        chain.innerHTML = ''; chart.innerHTML = ''; warn.hidden = true;
        return;
      }
      drawChart(r);
      const link = r.rdmaBound ? '<span class="t-rdma">RDMA</span>' : '<span class="t-nvl">NVLink</span>';
      readouts.innerHTML = `
        <div class="readout key"><span class="k">num_sms · num_qps</span><span class="v">${r.final} · ${r.qps}</span><span class="s">${bi(`QPs: min(${r.theoQPs}, ${r.allocated} allocated)`, `QP：min(${r.theoQPs}, 已分配 ${r.allocated})`)}</span></div>
        <div class="readout key"><span class="k">${bi('Bounding link', '瓶颈链路')}</span><span class="v">${link}</span><span class="s">${r.bt.toFixed(3)} / ${r.bg} GB/s</span></div>
        <div class="readout"><span class="k">${bi('Expected ranks per token', '每 token 期望命中 rank 数')}</span><span class="v">${r.expAll.toFixed(3)}</span><span class="s">${bi(`of ${r.ranks}`, `共 ${r.ranks} 个`)}</span></div>
        <div class="readout"><span class="k">${bi('Expected nodes per token', '每 token 期望命中节点数')}</span><span class="v">${r.scaleout > 1 ? r.expScaleout.toFixed(3) : '—'}</span><span class="s">${r.scaleout > 1 ? bi(`of ${r.scaleout}`, `共 ${r.scaleout} 个`) : bi('one scale-out rank', '只有一个 scale-out rank')}</span></div>
        <div class="readout"><span class="k">sm_read · sm_write</span><span class="v">${r.smRead.toFixed(3)} · ${r.smWrite.toFixed(3)}</span><span class="s">${bi('HBM bytes per unit of scale-up traffic', '每单位 scale-up 流量的 HBM 字节')}</span></div>
        <div class="readout"><span class="k">nvlink · rdma</span><span class="v">${r.nvlT.toFixed(3)} · ${r.rdmaT.toFixed(3)}</span><span class="s">${bi('link traffic, same unit', '链路流量，同一单位')}</span></div>`;
      chain.innerHTML = `max <b>${r.raw.toFixed(2)}</b> → × 1.3 = ${r.scaled.toFixed(2)} → ceil ${r.ceil} → ≥ 4, align 4 → ${r.aligned}` +
        (els.overlap.checked ? '' : ` → ≥ 64 → ${r.overlapped}`) + ` → cap ${r.cap} → <b>${r.final}</b>`;
      warn.hidden = !(r.scaleout === 1 && r.nodes > 1);
    }

    els.preset.addEventListener('change', () => {
      const p = PRESETS[els.preset.value];
      if (!p) return;
      els.nodes.value = p.nodes; els.gpn.value = p.gpn; els.hybrid.checked = p.hybrid;
      update();
    });
    Object.entries(els).forEach(([key, el]) => {
      if (key === 'preset') return;
      el.addEventListener('input', () => { els.preset.value = 'custom'; update(); });
    });
    document.addEventListener('click', (e) => { if (e.target.closest('[data-set-lang]')) setTimeout(update, 0); });
    update();
  }

  const sim = document.getElementById('sim'); if (sim) initSim(sim);
  const bm = document.getElementById('bytemap'); if (bm) initByteMap(bm);
  const pp = document.getElementById('pipe'); if (pp) initPipe(pp);
  const est = document.getElementById('estimator'); if (est) initEstimator(est);
})();
