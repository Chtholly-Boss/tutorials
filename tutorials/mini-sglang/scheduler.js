// Mini-SGLang chapter 01 widgets: scheduler simulator, overlap timeline, TP batch-order demo.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const num = (x) => x.toLocaleString('en-US');

  function S(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  // FLIP: animate elements carrying data-flip from their previous position
  function flipCapture(root) {
    const m = new Map();
    $$('[data-flip]', root).forEach((el) => m.set(el.dataset.flip, el.getBoundingClientRect()));
    return m;
  }
  function flipPlay(root, before) {
    if (reduceMotion) return;
    $$('[data-flip]', root).forEach((el) => {
      const a = before.get(el.dataset.flip);
      const b = el.getBoundingClientRect();
      if (!a) {
        el.animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'ease-out' });
        return;
      }
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.3,.7,.2,1)' });
    });
  }

  // =====================================================================
  // 1. Scheduler simulator: PrefillAdder + DecodeManager at page_size = 1,
  //    naive cache (no prefix hits), results processed in the same step.
  // =====================================================================
  function initSim(host) {
    const SCEN = {
      chunk: { budget: 256, cap: 2000, slots: 4, reqs: [{ L: 600, O: 6, at: 0 }, { L: 90, O: 8, at: 0 }, { L: 140, O: 5, at: 1 }, { L: 60, O: 9, at: 4 }] },
      memory: { budget: 256, cap: 300, slots: 4, reqs: [{ L: 100, O: 12, at: 0 }, { L: 120, O: 10, at: 0 }, { L: 90, O: 8, at: 0 }, { L: 30, O: 4, at: 0 }] },
      slots: { budget: 128, cap: 2000, slots: 2, reqs: [{ L: 70, O: 5, at: 0 }, { L: 50, O: 7, at: 0 }, { L: 90, O: 4, at: 0 }, { L: 60, O: 6, at: 1 }] }
    };
    const els = {
      scen: $('#ss-scen', host), budget: $('#ss-budget', host), budgetOut: $('#ss-budget-out', host),
      cap: $('#ss-cap', host), capOut: $('#ss-cap-out', host), slots: $('#ss-slots', host), slotsOut: $('#ss-slots-out', host),
      step: $('[data-act="step"]', host), play: $('[data-act="play"]', host), reset: $('[data-act="reset"]', host)
    };
    const board = $('.ss-board', host), status = $('.ss-status', host), mem = $('.ss-mem', host), readouts = $('.readouts', host), notes = $('.ss-notes', host);
    let st = null, timer = null;

    const P = () => ({ B: +els.budget.value, C: +els.cap.value, T: +els.slots.value });
    const running = () => st.reqs.filter((r) => r.state === 'running');
    const used = () => st.reqs.reduce((a, r) => a + (r.state === 'running' ? r.L + r.g - 1 : (r.state === 'pending' && r.admitted ? r.c : 0)), 0);
    const inflight = () => running().reduce((a, r) => a + (r.O - r.g), 0);
    const slotsUsed = () => st.reqs.filter((r) => r.state === 'running' || (r.state === 'pending' && r.admitted)).length;
    const done = () => st.reqs.every((r) => r.state === 'finished');

    function reset(pre) {
      stop();
      const sc = SCEN[els.scen.value];
      st = { step: 0, pending: [], last: null, reqs: sc.reqs.map((r, i) => ({ id: i, L: r.L, O: r.O, at: r.at, state: 'future', c: 0, g: 0, admitted: false })) };
      for (let i = 0; i < pre; i++) doStep();
      render(false);
    }

    function doStep() {
      const { B, C, T } = P();
      st.reqs.forEach((r) => { if (r.state === 'future' && r.at <= st.step) { r.state = 'pending'; st.pending.push(r); } });
      const notesOut = [];
      const entries = [];
      let phase = 'idle';
      if (st.pending.length) {
        let budget = B, reserved = inflight();
        const avail = C - used();
        let free = T - slotsUsed();
        const added = [];
        for (let i = 0; i < st.pending.length; i++) {
          const r = st.pending[i];
          if (budget <= 0) {
            notesOut.push(bi(`Token budget spent; R${r.id} waits for the next step.`, `token 预算已用完，R${r.id} 等下一步。`));
            break;
          }
          if (!r.admitted) {
            if (free === 0) {
              notesOut.push(bi(`R${r.id} waits: no free table slot (max_running_req = ${T}).`, `R${r.id} 等待：没有空闲的 table 槽（max_running_req = ${T}）。`));
              if (i + 1 < st.pending.length) notesOut.push(bi('Requests behind it wait too: the loop stops at the first request that fails.', '排在它后面的请求也要等：循环在第一个失败的请求处停止。'));
              break;
            }
            const est = (r.L - r.c) + r.O;
            if (est + reserved > avail) {
              notesOut.push(bi(`R${r.id} waits: needs ${est} + reserved ${reserved} = ${est + reserved} > available ${avail}.`, `R${r.id} 等待：需要 ${est} + 已预留 ${reserved} = ${est + reserved} > 可用 ${avail}。`));
              if (i + 1 < st.pending.length) notesOut.push(bi('Requests behind it wait too: the loop stops at the first request that fails.', '排在它后面的请求也要等：循环在第一个失败的请求处停止。'));
              break;
            }
            r.admitted = true; free--;
          }
          const remain = r.L - r.c;
          const chunk = Math.min(budget, remain);
          budget -= chunk;
          reserved += remain + r.O;
          added.push({ r, chunk, chunked: chunk < remain });
        }
        if (added.length) {
          phase = 'prefill';
          const chunkedList = [];
          added.forEach((a) => {
            a.r.c += a.chunk;
            entries.push({ id: a.r.id, tokens: a.chunk, chunked: a.chunked });
            if (a.chunked) {
              chunkedList.push(a.r);
              notesOut.push(bi(`R${a.r.id} is split: ${a.chunk} of its remaining ${a.chunk + (a.r.L - a.r.c)} tokens run now as a ChunkedReq.`, `R${a.r.id} 被切分：剩余 ${a.chunk + (a.r.L - a.r.c)} 个 token 中的 ${a.chunk} 个作为 ChunkedReq 本步执行。`));
            } else {
              a.r.g = 1;
              a.r.state = a.r.g < a.r.O ? 'running' : 'finished';
              if (a.r.state === 'finished') a.r.admitted = false;
            }
          });
          st.pending = chunkedList.concat(st.pending.slice(added.length));
          const waiting = st.reqs.filter((r) => r.state === 'running' && !added.some((a) => a.r === r));
          if (waiting.length) notesOut.push(bi(`Prefill goes first: ${waiting.map((r) => 'R' + r.id).join(', ')} skip decoding this step.`, `prefill 优先：${waiting.map((r) => 'R' + r.id).join('、')} 本步不做 decode。`));
        }
      }
      if (phase === 'idle') {
        const run = running().sort((a, b) => a.id - b.id);
        if (run.length) {
          phase = 'decode';
          run.forEach((r) => {
            r.g += 1;
            entries.push({ id: r.id, tokens: 1 });
            if (r.g >= r.O) { r.state = 'finished'; r.admitted = false; }
          });
          notesOut.push(bi(`Decode batch of every running request, sorted by uid: ${run.map((r) => 'R' + r.id).join(', ')}.`, `decode 批包含所有运行中的请求，按 uid 排序：${run.map((r) => 'R' + r.id).join('、')}。`));
        }
      }
      st.last = { step: st.step, phase, entries, notes: notesOut, budget: B };
      st.step++;
    }

    const chip = (r, extra) => `<span class="tok r${r.id}${extra || ''}">R${r.id}</span>`;

    function reqCard(r) {
      let frac, label;
      if (r.state === 'running' || r.state === 'finished') { frac = r.g / r.O; label = `${r.g}/${r.O} out`; }
      else { frac = r.c / r.L; label = `${r.c}/${r.L} in`; }
      const kind = r.state === 'running' || r.state === 'finished' ? 'out' : 'in';
      const tag = r.state === 'pending' && r.admitted && r.c > 0 ? '<span class="ss-tag">ChunkedReq</span>' : '';
      return `<div class="ss-req" data-flip="r${r.id}">${chip(r)}<span class="ss-bar ${kind}"><i style="width:${(100 * frac).toFixed(1)}%"></i></span><span class="ss-n">${label}</span>${tag}</div>`;
    }

    function render(animate) {
      const before = animate ? flipCapture(board) : null;
      const { B, C, T } = P();
      const last = st.last;
      const future = st.reqs.filter((r) => r.state === 'future');
      const pend = st.pending.map(reqCard).join('') +
        future.map((r) => `<div class="ss-req future">${chip(r)}<span class="ss-n">${bi(`arrives at step ${r.at}`, `第 ${r.at} 步到达`)}</span></div>`).join('');
      const run = running().sort((a, b) => a.id - b.id).map(reqCard).join('');
      const fin = st.reqs.filter((r) => r.state === 'finished').map(reqCard).join('');
      let batch = `<p class="ss-empty">${bi('No step run yet.', '尚未执行任何一步。')}</p>`;
      if (last) {
        const tokens = last.entries.reduce((a, e) => a + e.tokens, 0);
        const phaseLbl = last.phase === 'prefill' ? 'prefill' : last.phase === 'decode' ? 'decode' : bi('idle', '空闲');
        batch = `<div class="ss-phase ${last.phase}">${phaseLbl}<span>${last.phase === 'prefill' ? bi(`${tokens} / ${last.budget} budget`, `预算 ${tokens} / ${last.budget}`) : last.phase === 'decode' ? bi(`${tokens} tokens`, `${tokens} 个 token`) : ''}</span></div>` +
          last.entries.map((e) => `<div class="ss-entry">${chip(st.reqs[e.id])}<span class="ss-n">+${e.tokens}${e.chunked ? ' · chunk' : ''}</span></div>`).join('');
      }
      board.innerHTML = `
        <div class="ss-col"><div class="blk-h"><span>pending_list</span><span>${bi('FIFO', '先进先出')}</span></div>${pend || `<p class="ss-empty">${bi('empty', '空')}</p>`}</div>
        <div class="ss-col ss-now"><div class="blk-h"><span>${bi('batch', '本步 batch')}</span><span>${last ? bi(`step ${last.step}`, `第 ${last.step} 步`) : ''}</span></div>${batch}</div>
        <div class="ss-col"><div class="blk-h"><span>running_reqs</span><span>decode</span></div>${run || `<p class="ss-empty">${bi('empty', '空')}</p>`}</div>
        <div class="ss-col"><div class="blk-h"><span>${bi('finished', '已完成')}</span><span></span></div>${fin || `<p class="ss-empty">${bi('none yet', '暂无')}</p>`}</div>`;
      if (animate) flipPlay(board, before);

      const u = used(), res = inflight(), freeTok = Math.max(0, C - u - res);
      mem.innerHTML = `
        <div class="ss-membar" role="img" aria-label="KV cache: ${u} used, ${res} reserved, ${freeTok} free of ${C}">
          <i class="u" style="width:${(100 * u / C).toFixed(2)}%"></i><i class="r" style="width:${(100 * res / C).toFixed(2)}%"></i>
        </div>
        <div class="ss-memkey"><span><i class="u"></i>${bi(`used ${num(u)}`, `已用 ${num(u)}`)}</span><span><i class="r"></i>${bi(`reserved ${num(res)}`, `已预留 ${num(res)}`)}</span><span><i class="f"></i>${bi(`free ${num(freeTok)}`, `空闲 ${num(freeTok)}`)}</span><span class="muted">${bi(`of ${num(C)} KV tokens`, `共 ${num(C)} 个 KV token`)}</span></div>`;
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Next step', '下一步')}</span><span class="v">${st.step}</span><span class="s">${done() ? bi('all requests finished', '所有请求已完成') : bi('press Step or Play', '点击单步或播放')}</span></div>
        <div class="readout"><span class="k">${bi('Table slots', 'table 槽')}</span><span class="v">${slotsUsed()} / ${T}</span><span class="s">max_running_req</span></div>
        <div class="readout"><span class="k">${bi('Prefill budget', 'prefill 预算')}</span><span class="v">${num(B)}</span><span class="s">max_extend_tokens</span></div>`;
      notes.innerHTML = last && last.notes.length ? last.notes.map((n) => `<li>${n}</li>`).join('') : `<li>${bi('Each step runs either one prefill batch or one decode batch.', '每一步要么执行一个 prefill 批，要么执行一个 decode 批。')}</li>`;
      status.innerHTML = last ? bi(`Step ${last.step} ran a <b>${last.phase}</b> batch.`, `第 ${last.step} 步执行了一个 <b>${last.phase}</b> 批。`) : '&nbsp;';
      els.step.disabled = done();
      els.play.innerHTML = timer ? bi('Pause', '暂停') : bi(done() ? 'Replay' : 'Play', done() ? '重放' : '播放');
    }

    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function stepOnce() { if (done()) return; doStep(); render(true); if (done()) { stop(); render(false); } }

    els.step.addEventListener('click', () => { stop(); stepOnce(); });
    els.play.addEventListener('click', () => {
      if (timer) { stop(); render(false); return; }
      if (done()) reset(0);
      timer = setInterval(stepOnce, reduceMotion ? 1200 : 900);
      render(false);
    });
    els.reset.addEventListener('click', () => reset(0));
    els.scen.addEventListener('change', () => {
      const sc = SCEN[els.scen.value];
      els.budget.value = sc.budget; els.cap.value = sc.cap; els.slots.value = sc.slots;
      sync(); reset(0);
    });
    function sync() { els.budgetOut.textContent = num(+els.budget.value); els.capOut.textContent = num(+els.cap.value); els.slotsOut.textContent = els.slots.value; }
    [els.budget, els.cap, els.slots].forEach((e) => e.addEventListener('input', () => { sync(); reset(0); }));
    sync();
    reset(2);
  }

  // =====================================================================
  // 2. Overlap timeline: overlap_loop vs normal_loop
  // =====================================================================
  function initOverlap(host) {
    const svg = $('svg', host), readouts = $('.readouts', host);
    const on = $('#ov-on', host), eos = $('#ov-eos', host);
    const sl = { s: $('#ov-s', host), p: $('#ov-p', host), f: $('#ov-f', host) };
    const out = { s: $('#ov-s-out', host), p: $('#ov-p-out', host), f: $('#ov-f-out', host) };
    const playBtn = $('[data-act="play"]', host);
    const N = 6, EOS_STEP = 2;

    function compute(overlap, s, p, f) {
      const cpu = [], F = [];
      let t = 0, gfree = 0;
      const proc = (k) => {
        const pa = Math.max(t, F[k].b);
        if (pa > t + 1e-9) cpu.push({ k, kind: 'W', a: t, b: pa });
        cpu.push({ k, kind: 'P', a: pa, b: pa + p });
        t = pa + p;
      };
      for (let k = 0; k < N; k++) {
        cpu.push({ k, kind: 'S', a: t, b: t + s });
        t += s;
        const fs = Math.max(t, gfree);
        F.push({ k, a: fs, b: fs + f, launch: t });
        gfree = fs + f;
        if (overlap) { if (k > 0) proc(k - 1); } else proc(k);
      }
      if (overlap) proc(N - 1);
      const busy = N * f, span = F[N - 1].b - F[0].a;
      return { cpu, F, end: t, util: busy / span, span };
    }

    function draw() {
      const s = +sl.s.value, p = +sl.p.value, f = +sl.f.value, overlap = on.checked;
      out.s.textContent = s.toFixed(1); out.p.textContent = p.toFixed(1); out.f.textContent = f.toFixed(1);
      const r = compute(overlap, s, p, f);
      const worst = Math.max(compute(true, s, p, f).end, compute(false, s, p, f).end);
      svg.innerHTML = '';
      const defs = S('defs', null, svg);
      const pat = S('pattern', { id: 'ov-hatch', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      S('line', { x1: 0, y1: 0, x2: 0, y2: 5, class: 'hatch-line' }, pat);
      const X0 = 96, W = 770, sx = (t) => X0 + (t / worst) * W;
      S('text', { x: 0, y: 58, class: 't-sm' }, svg, 'CPU');
      S('text', { x: 0, y: 72, class: 't-sm muted' }, svg, 'scheduler');
      S('text', { x: 0, y: 138, class: 't-sm' }, svg, 'GPU');
      S('text', { x: 0, y: 152, class: 't-sm muted' }, svg, 'engine stream');
      r.cpu.forEach((b) => {
        const x = sx(b.a), w = Math.max(sx(b.b) - x, 0.5);
        if (b.kind === 'W') {
          S('rect', { x, y: 48, width: w, height: 28, class: 'ov-wait' }, svg);
          return;
        }
        S('rect', { x, y: 48, width: w, height: 28, rx: 2, class: b.kind === 'S' ? 'ov-s' : 'ov-p' }, svg);
        const lbl = (b.kind === 'S' ? 'S' : 'P') + b.k;
        if (w > 20) S('text', { x: x + w / 2, y: 66, class: 't-sm', 'text-anchor': 'middle' }, svg, lbl);
      });
      r.F.forEach((b, k) => {
        const x = sx(b.a), w = sx(b.b) - x;
        S('line', { x1: sx(b.launch), y1: 78, x2: x + 2, y2: 126, class: 'ov-launch' }, svg);
        S('rect', { x, y: 128, width: w, height: 28, rx: 2, class: 'ov-f' }, svg);
        if (w > 20) S('text', { x: x + w / 2, y: 146, class: 't-sm', 'text-anchor': 'middle' }, svg, 'F' + k);
        if (k > 0) {
          const gap = b.a - r.F[k - 1].b;
          if (gap > 1e-6) S('rect', { x: sx(r.F[k - 1].b), y: 128, width: sx(b.a) - sx(r.F[k - 1].b), height: 28, class: 'ov-idle' }, svg);
        }
      });
      // EOS consequence
      let wasted = 0;
      if (eos.checked) {
        const fe = r.F[EOS_STEP];
        S('text', { x: sx(fe.b) - 4, y: 122, class: 't-sm ov-eos-t', 'text-anchor': 'end' }, svg, 'EOS');
        S('circle', { cx: sx(fe.b) - 2, cy: 128, r: 3.5, class: 'ov-eos' }, svg);
        const pEnd = r.cpu.find((b) => b.kind === 'P' && b.k === EOS_STEP).b;
        const nextLaunch = r.F[EOS_STEP + 1].launch;
        if (nextLaunch < pEnd) {
          wasted = 1;
          const nf = r.F[EOS_STEP + 1];
          S('rect', { x: sx(nf.a) + 3, y: 160, width: Math.max(sx(nf.b) - sx(nf.a) - 6, 4), height: 6, rx: 2, class: 'ov-waste' }, svg);
          S('text', { x: sx(nf.a) + 3, y: 180, class: 't-sm' }, svg, overlap ? 'still in F3: one extra row' : '');
        }
      }
      // axis
      S('line', { x1: X0, y1: 196, x2: X0 + W, y2: 196, class: 'axis' }, svg);
      for (let i = 0; i <= 4; i++) {
        const t = (worst / 4) * i;
        S('text', { x: sx(t), y: 212, class: 't-sm muted', 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle' }, svg, t.toFixed(1) + ' ms');
      }
      const cursor = S('line', { x1: X0, y1: 40, x2: X0, y2: 196, class: 'ov-cursor' }, svg);
      cursor.style.opacity = '0';
      svg.__cursor = { el: cursor, end: sx(r.end) - X0 };
      const waitCpu = r.cpu.filter((b) => b.kind === 'W').reduce((a, b) => a + (b.b - b.a), 0);
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('6 steps take', '6 步耗时')}</span><span class="v">${r.end.toFixed(1)} ms</span><span class="s">${overlap ? 'overlap_loop' : 'normal_loop'}</span></div>
        <div class="readout key"><span class="k">${bi('GPU busy', 'GPU 忙碌')}</span><span class="v">${(100 * r.util).toFixed(0)}%</span><span class="s">${bi('between F0 start and F5 end', 'F0 开始到 F5 结束之间')}</span></div>
        <div class="readout"><span class="k">${bi('CPU waiting', 'CPU 等待')}</span><span class="v">${waitCpu.toFixed(1)} ms</span><span class="s">${bi('in copy_done.synchronize()', '在 copy_done.synchronize() 中')}</span></div>
        <div class="readout"><span class="k">${bi('Extra rows after EOS', 'EOS 之后的多余行')}</span><span class="v">${eos.checked ? wasted : '—'}</span><span class="s">${bi('F3 was launched before P2 saw EOS', 'F3 在 P2 看到 EOS 之前就已启动')}</span></div>`;
    }

    playBtn.addEventListener('click', () => {
      const c = svg.__cursor;
      if (!c || reduceMotion) return;
      c.el.style.opacity = '1';
      c.el.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${c.end}px)` }], { duration: 3200, easing: 'linear', fill: 'forwards' })
        .finished.then(() => { c.el.style.opacity = '0'; }, () => {});
    });
    [on, eos, sl.s, sl.p, sl.f].forEach((e) => e.addEventListener('input', draw));
    draw();
  }

  // =====================================================================
  // 3. TP batch order: list(set) vs sorted by uid (commit 9a91cfa)
  // =====================================================================
  function initTP(host) {
    const grid = $('.tp-grid', host), readouts = $('.readouts', host);
    const fixed = $('#tp-fixed', host), reroll = $('[data-act="reroll"]', host);
    let seed = 3;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    function perm() { const a = [0, 1, 2, 3]; for (let i = 3; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    let orders = [[2, 0, 3, 1], [1, 2, 0, 3]];

    function draw(animate) {
      const before = animate ? flipCapture(grid) : null;
      const ord = fixed.checked ? [[0, 1, 2, 3], [0, 1, 2, 3]] : orders;
      let bad = 0;
      const rows = [0, 1, 2, 3].map((i) => {
        const a = ord[0][i], b = ord[1][i];
        const ok = a === b;
        if (!ok) bad++;
        return `<div class="tp-cell">${ok ? `<span class="tok r${a}">R${a}</span><span class="tp-ok">✓</span>` : `<span class="tok r${a}">R${a}</span><span class="tp-plus">+</span><span class="tok r${b}">R${b}</span><span class="tp-bad">✗</span>`}</div>`;
      }).join('');
      const col = (rk) => ord[rk].map((u, i) => `<div class="tp-cell"><span class="tp-row">row ${i}</span><span class="tok r${u}" data-flip="k${rk}-${u}">R${u}</span></div>`).join('');
      grid.innerHTML = `
        <div class="tp-col"><div class="blk-h"><span>rank 0</span><span>${fixed.checked ? 'sorted(…, uid)' : 'list(set)'}</span></div>${col(0)}</div>
        <div class="tp-col"><div class="blk-h"><span>rank 1</span><span>${fixed.checked ? 'sorted(…, uid)' : 'list(set)'}</span></div>${col(1)}</div>
        <div class="tp-col tp-sum"><div class="blk-h"><span>${bi('all-reduce, row by row', '逐行 all-reduce')}</span><span></span></div>${rows}</div>`;
      if (animate) flipPlay(grid, before);
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Rows mixing two requests', '混合了两个请求的行')}</span><span class="v">${bad} / 4</span><span class="s">${fixed.checked ? bi('after #113: same order on every rank', '#113 之后：各 rank 顺序一致') : bi('before #113: order follows object addresses', '#113 之前：顺序取决于对象地址')}</span></div>`;
      reroll.disabled = fixed.checked;
    }
    fixed.addEventListener('change', () => draw(true));
    reroll.addEventListener('click', () => { orders = [perm(), perm()]; draw(true); });
    draw(false);
  }

  const sim = document.getElementById('ssim'); if (sim) initSim(sim);
  const ov = document.getElementById('overlap'); if (ov) initOverlap(ov);
  const tp = document.getElementById('tporder'); if (tp) initTP(tp);
})();
