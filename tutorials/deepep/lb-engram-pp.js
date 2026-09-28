// DeepEP chapter 04 widgets: LB weight/gradient exchange, Engram fetch,
// Engram QP sizing (port of get_theoretical_config), and PP flow control.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const num = (x) => x.toLocaleString('en-US');

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Flying chips inside a positioned container. `onLand` runs when the chip arrives
  // (immediately under reduced motion) unless the flyer was aborted meanwhile.
  function makeFlyer(container) {
    let run = 0;
    const rel = (el) => {
      const g = container.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { x: r.left - g.left, y: r.top - g.top, w: r.width, h: r.height };
    };
    function fly(fromEl, toEl, html, delay, onLand, dur) {
      const token = run;
      return new Promise((resolve) => {
        const land = () => { if (token === run && onLand) onLand(); resolve(); };
        if (reduceMotion || !fromEl || !toEl) { land(); return; }
        const g = document.createElement('div');
        g.className = 'fly-ghost';
        g.innerHTML = html;
        container.appendChild(g);
        const c = g.firstElementChild.getBoundingClientRect();
        const a = rel(fromEl), b = rel(toEl);
        const x0 = a.x + (a.w - c.width) / 2, y0 = a.y + (a.h - c.height) / 2;
        const x1 = b.x + (b.w - c.width) / 2, y1 = b.y + (b.h - c.height) / 2;
        const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 26;
        const anim = g.animate([
          { transform: `translate(${x0}px, ${y0}px) scale(0.9)`, opacity: 0.25 },
          { transform: `translate(${mx}px, ${my}px) scale(1.1)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${x1}px, ${y1}px) scale(1)`, opacity: 1 }
        ], { duration: dur || 620, delay: delay || 0, easing: 'cubic-bezier(.3,.65,.25,1)', fill: 'both' });
        anim.finished.then(() => { g.remove(); land(); }, () => { g.remove(); resolve(); });
      });
    }
    function abort() { run++; $$('.fly-ghost', container).forEach((g) => g.remove()); }
    return { fly, abort };
  }

  function pulse(el) {
    if (!el) return;
    el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  }

  // =====================================================================
  // 1. Redundant-expert exchange (EPBuffer.lb_prefetch_weights / lb_reduce_grads)
  //    4 NVLink ranks, 2 local experts each, 2 redundant slots per rank.
  // =====================================================================
  function initLB(host) {
    const R = 4, L = 2, C = 2, WCH = 3, GCH = 2;
    const mapTable = $('.lb-map', host), grid = $('.lb-grid', host);
    const readouts = $('.readouts', host), statusEl = $('.lb-status', host);
    const btnPre = $('[data-act="prefetch"]', host), btnRed = $('[data-act="reduce"]', host);
    const btnRand = $('[data-act="random"]', host), btnReset = $('[data-act="reset"]', host);
    const flyer = makeFlyer(grid);
    const owner = (e) => Math.floor(e / L);
    let mapping = [[5, 2], [4, 6], [1, -1], [0, 5]];
    let st = null;

    const STATUS = {
      idle: bi('Four NVLink ranks own two experts each and hold two redundant slots. Every rank reads the same <code>redundancy_mapping</code> and keeps only the entries whose expert it owns: that list is its task list. Click a mapping cell to change it.',
               '4 个 NVLink rank 各持有 2 个专家和 2 个冗余槽位。每个 rank 读取同一份 <code>redundancy_mapping</code>，只保留自己持有的专家所在的条目，这就是它的任务列表。点击映射表的格子可以修改。'),
      pre: bi('<b>Prefetch.</b> Each owner pushes its expert, 12 KiB at a time, straight into the peer\'s redundant slot through an NVLink pointer. Chunks are claimed round-robin across tasks, so all of an owner\'s destinations fill together.',
              '<b>预取。</b>每个持有者把自己的专家按 12 KiB 一块，经 NVLink 指针直接写进 peer 的冗余槽位。分块按任务轮转领取，所以同一持有者的各个目标同时被填满。'),
      red: bi('<b>Reduce.</b> The direction flips but the owner still drives: it reads each replica\'s FP32 gradient, 24 KiB at a time, over NVLink and adds it into its own <code>expert_grads</code> with a TMA reduce-add. The replica slots are left untouched.',
              '<b>规约。</b>方向反过来，但仍由持有者驱动：它经 NVLink 按 24 KiB 一块读取各副本的 FP32 梯度，再用 TMA reduce-add 累加到自己的 <code>expert_grads</code> 中。副本槽位本身不被清零。')
    };

    function tasksOf(r) {
      const t = [];
      for (let i = 0; i < R * C; i++) {
        const e = mapping[Math.floor(i / C)][i % C];
        if (e >= 0 && owner(e) === r) t.push({ e, local: e % L, dst: Math.floor(i / C), slot: i % C });
      }
      return t;
    }
    function options(r) {
      const o = [-1];
      for (let e = 0; e < R * L; e++) if (owner(e) !== r) o.push(e);
      return o;
    }
    function freshState() {
      return {
        arrived: [...Array(R)].map(() => Array(C).fill(0)),
        grads: [...Array(R)].map(() => Array(L).fill(0))
      };
    }

    function renderMap() {
      let h = '<thead><tr><th></th>' + [...Array(C)].map((_, c) => `<th>slot ${c}</th>`).join('') + '</tr></thead><tbody>';
      for (let r = 0; r < R; r++) {
        h += `<tr><th class="rowh">rank ${r}</th>`;
        for (let c = 0; c < C; c++) {
          const e = mapping[r][c];
          const cls = e >= 0 ? `lb-cell tok r${owner(e)}` : 'lb-cell';
          h += `<td><button type="button" class="${cls}" data-r="${r}" data-c="${c}" aria-label="rank ${r} slot ${c}">${e >= 0 ? 'E' + e : '−1'}</button></td>`;
        }
        h += '</tr>';
      }
      mapTable.innerHTML = h + '</tbody>';
    }

    function buildGrid() {
      grid.innerHTML = '';
      for (let r = 0; r < R; r++) {
        const tasks = tasksOf(r);
        const col = document.createElement('div');
        col.className = 'rk';
        const slots = [...Array(C)].map((_, c) => {
          const e = mapping[r][c];
          const who = e >= 0 ? `E${e} ← r${owner(e)}` : bi('unused', '未使用');
          return `<div class="lb-slot${e >= 0 ? ' assigned' : ''}" data-s="${r}-${c}"><span class="tag">slot ${c}</span><span class="who${e >= 0 ? '' : ' none'}">${who}</span>` +
            (e >= 0 ? `<span class="chunks">${[...Array(WCH)].map(() => '<i></i>').join('')}</span>` : '') + '</div>';
        }).join('');
        const tlist = tasks.length
          ? tasks.map((t) => `<li><b>E${t.e}</b> → r${t.dst} · slot ${t.slot}</li>`).join('')
          : `<li class="none">${bi('no tasks', '没有任务')}</li>`;
        col.innerHTML = `
          <div class="rk-h"><b>rank ${r}</b><span>E${r * L} · E${r * L + 1}</span></div>
          <div class="blk"><div class="blk-h"><span>expert_weights</span><span>${bi('original', '原始')}</span></div>
            <div class="xrow">${[...Array(L)].map((_, l) => `<span data-w="${r}-${l}"><span class="tok r${r}">E${r * L + l}</span></span>`).join('')}</div></div>
          <div class="blk"><div class="blk-h"><span>${bi('redundant slots', '冗余槽位')}</span><span>LB region</span></div>${slots}</div>
          <div class="blk"><div class="blk-h"><span>tasks</span><span>build_tasks</span></div><ol class="lb-tasks">${tlist}</ol></div>
          <div class="blk"><div class="blk-h"><span>expert_grads</span><span>fp32</span></div>
            <div class="xrow">${[...Array(L)].map((_, l) => `<span data-g="${r}-${l}"></span>`).join('')}</div></div>`;
        grid.appendChild(col);
      }
    }

    function paint() {
      for (let r = 0; r < R; r++) {
        for (let c = 0; c < C; c++) {
          const bars = $$(`[data-s="${r}-${c}"] .chunks i`, grid);
          bars.forEach((b, i) => b.classList.toggle('on', i < st.arrived[r][c]));
        }
        for (let l = 0; l < L; l++) {
          const e = r * L + l;
          let replicas = 0;
          mapping.forEach((row) => row.forEach((x) => { if (x === e) replicas++; }));
          const done = Math.floor(st.grads[r][l] / GCH);
          const el = $(`[data-g="${r}-${l}"]`, grid);
          el.innerHTML = `<span class="tok r${r}${done > 0 ? ' sum' : ''}">∇E${e}<span class="sub">${replicas ? `+${done}/${replicas}` : 'local'}</span></span>`;
        }
      }
      const counts = [...Array(R)].map((_, r) => tasksOf(r).length);
      const busiest = counts.indexOf(Math.max(...counts));
      const total = counts.reduce((a, b) => a + b, 0);
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Tasks per owner', '每个持有者的任务数')}</span><span class="v">${counts.join(' · ')}</span><span class="s">${bi(`ranks 0–3 · ${total} replicas in total`, `rank 0–3 · 共 ${total} 个副本`)}</span></div>
        <div class="readout"><span class="k">${bi('Busiest owner', '最忙的持有者')}</span><span class="v">rank ${busiest}</span><span class="s">${bi(`${counts[busiest] * WCH} weight chunks · ${counts[busiest] * GCH} grad chunks`, `${counts[busiest] * WCH} 个权重块 · ${counts[busiest] * GCH} 个梯度块`)}</span></div>
        <div class="readout"><span class="k">${bi('Chunk sizes', '分块大小')}</span><span class="v">12 · 24 KiB</span><span class="s">${bi('prefetch · reduce (drawn as 3 and 2 chunks)', '预取 · 规约（图中画作 3 块和 2 块）')}</span></div>`;
    }

    function reset(msg) {
      flyer.abort();
      st = freshState();
      renderMap(); buildGrid(); paint();
      statusEl.innerHTML = STATUS[msg || 'idle'];
    }

    async function prefetch() {
      flyer.abort();
      st = freshState(); paint();
      statusEl.innerHTML = STATUS.pre;
      const flights = [];
      for (let r = 0; r < R; r++) {
        const tasks = tasksOf(r);
        // EPWeightIterator: chunk index -> (chunk = idx / num_tasks, task = idx % num_tasks)
        for (let k = 0; k < WCH * tasks.length; k++) {
          const t = tasks[k % tasks.length];
          const from = $(`[data-w="${r}-${t.local}"] .tok`, grid);
          const to = $(`[data-s="${t.dst}-${t.slot}"]`, grid);
          flights.push(flyer.fly(from, to, `<span class="tok r${r}">E${t.e}<span class="sub">c${Math.floor(k / tasks.length)}</span></span>`,
            k * 190 + r * 40, () => { st.arrived[t.dst][t.slot]++; paint(); }));
        }
      }
      await Promise.all(flights);
    }

    async function reduce() {
      flyer.abort();
      st.grads = [...Array(R)].map(() => Array(L).fill(0));
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (mapping[r][c] >= 0) st.arrived[r][c] = WCH;
      paint();
      statusEl.innerHTML = STATUS.red;
      const flights = [];
      for (let r = 0; r < R; r++) {
        const tasks = tasksOf(r);
        for (let k = 0; k < GCH * tasks.length; k++) {
          const t = tasks[k % tasks.length];
          const from = $(`[data-s="${t.dst}-${t.slot}"]`, grid);
          const to = $(`[data-g="${r}-${t.local}"]`, grid);
          flights.push(flyer.fly(from, to, `<span class="tok r${r}">∇E${t.e}<span class="sub">c${Math.floor(k / tasks.length)}</span></span>`,
            k * 230 + r * 40, () => { st.grads[r][t.local]++; paint(); pulse($(`[data-g="${r}-${t.local}"] .tok`, grid)); }));
        }
      }
      await Promise.all(flights);
    }

    mapTable.addEventListener('click', (ev) => {
      const b = ev.target.closest('.lb-cell');
      if (!b) return;
      const r = +b.dataset.r, c = +b.dataset.c;
      const opts = options(r);
      mapping[r][c] = opts[(opts.indexOf(mapping[r][c]) + 1) % opts.length];
      reset('idle');
    });
    btnPre.addEventListener('click', prefetch);
    btnRed.addEventListener('click', reduce);
    btnReset.addEventListener('click', () => reset('idle'));
    btnRand.addEventListener('click', () => {
      const rnd = mulberry32(Math.floor(Math.random() * 1e9));
      mapping = [...Array(R)].map((_, r) => [...Array(C)].map(() => {
        if (rnd() < 0.2) return -1;
        const opts = options(r).slice(1);
        return opts[Math.floor(rnd() * opts.length)];
      }));
      reset('idle');
    });
    reset('idle');
  }

  // =====================================================================
  // 2. Engram fetch: rank 0 fetches 2 layers x 4 tokens x 2 entries from
  //    4 ranks (2 nodes x 2 GPUs, hybrid mode, one RDMA peer per node).
  // =====================================================================
  function initEngram(host) {
    const RANKS = 4, PER_PEER = 2, PEERS = 2, LAYERS = 2, ENTRIES = 6, TOKENS = 4, EPT = 2;
    const wrap = $('.eg-wrap', host), statusEl = $('.eg-status', host), readouts = $('.readouts', host);
    const btnFetch = $('[data-act="fetch"]', host), btnNew = $('[data-act="indices"]', host);
    const hookBtns = $$('.hook', host);
    const flyer = makeFlyer(wrap);
    const peerOf = (rank) => Math.floor(rank / PER_PEER);
    let seed = 3, indices, st, fetchRun = 0;

    function genIndices() {
      const rnd = mulberry32(seed);
      indices = [...Array(LAYERS)].map(() => [...Array(TOKENS)].map(() => [...Array(EPT)].map(() => Math.floor(rnd() * RANKS * ENTRIES))));
    }

    function build() {
      const stor = [...Array(PEERS)].map((_, n) => {
        const shards = [...Array(PER_PEER)].map((_, i) => {
          const r = n * PER_PEER + i;
          const rows = [...Array(LAYERS)].map((_, l) =>
            `<span>L${l}</span><div class="eg-row">${[...Array(ENTRIES)].map((_, j) =>
              `<span class="eg-cell r${r}" data-st="${r}-${l}-${j}">${r * ENTRIES + j}</span>`).join('')}</div>`).join('');
          return `<div class="eg-shard"><span style="grid-column:1/-1">rank ${r} · ${bi('shard', '分片')}</span>${rows}</div>`;
        }).join('');
        return `<div class="eg-node"><div class="eg-node-h"><span>node ${n}</span><span>RDMA peer ${n}</span></div>${shards}</div>`;
      }).join('');
      const warps = [...Array(PEERS)].map((_, n) =>
        `<div class="eg-warp" data-warp="${n}"><b>issue warp → peer ${n}</b><span data-wq="${n}">${bi('idle', '空闲')}</span></div>`).join('');
      const recv = [...Array(LAYERS)].map((_, l) => {
        const rows = [...Array(TOKENS)].map((_, t) =>
          `<span>t${t}</span>${[...Array(EPT)].map((_, k) => `<span class="eg-dst" data-rv="${l}-${t}-${k}">${indices[l][t][k]}</span>`).join('')}`).join('');
        return `<div class="eg-recv eg-layer" data-layer="${l}"><div class="eg-recv-h"><span>layer ${l}</span><span data-lstate="${l}"></span></div><div class="eg-tok"><span></span><span>e0</span><span>e1</span>${rows}</div></div>`;
      }).join('');
      wrap.innerHTML = `
        <div class="eg-panel"><div class="blk-h"><span>${bi('RDMA storage', 'RDMA 存储')}</span><span>${bi('one shard per rank', '每 rank 一个分片')}</span></div>${stor}</div>
        <div class="eg-panel"><div class="blk-h"><span>engram_fetch_impl</span><span>rank 0</span></div>${warps}
          <p class="psum">${bi('Each issue warp owns one (RDMA peer, GIN context) pair and only issues gets whose row lives behind its peer.', '每个 issue warp 负责一个（RDMA peer, GIN context）组合，只发出行数据位于该 peer 之后的 get。')}</p></div>
        <div class="eg-panel"><div class="blk-h"><span>${bi('rank 0 receive buffer', 'rank 0 接收 buffer')}</span><span>[layer][token][entry]</span></div>${recv}</div>`;
    }

    function paint() {
      for (let l = 0; l < LAYERS; l++) {
        const left = st.remaining[l];
        $(`[data-lstate="${l}"]`, wrap).textContent = !st.started ? '' : left > 0 ? `${left} gets in flight` : 'all landed';
      }
      hookBtns.forEach((b) => {
        const l = +b.dataset.layer;
        const state = !st.started ? 'idle' : st.returned[l] ? 'returned' : st.remaining[l] === 0 ? 'ready' : st.waiting[l] ? 'waiting' : 'pending';
        b.dataset.state = state;
        b.disabled = !st.started;
        const label = { idle: 'fetch first', pending: 'not waited', waiting: 'waiting…', ready: 'data landed', returned: 'returned tensor' }[state];
        b.querySelector('.hs').textContent = label;
      });
      const perPeer = [...Array(PEERS)].map(() => 0);
      indices.forEach((layer) => layer.forEach((tok) => tok.forEach((g) => perPeer[peerOf(Math.floor(g / ENTRIES))]++)));
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Gets issued', '发出的 get')}</span><span class="v">${LAYERS * TOKENS * EPT}</span><span class="s">${bi(`${LAYERS} layers × ${TOKENS} tokens × ${EPT} entries`, `${LAYERS} 层 × ${TOKENS} 个 token × ${EPT} 个条目`)}</span></div>
        <div class="readout"><span class="k">${bi('Per RDMA peer', '每个 RDMA peer')}</span><span class="v">${perPeer.join(' · ')}</span><span class="s">${bi('node 0 · node 1', '节点 0 · 节点 1')}</span></div>
        <div class="readout"><span class="k">${bi('Kernel launches', 'kernel 启动次数')}</span><span class="v">1 + ${LAYERS}</span><span class="s">${bi('one fetch, one wait per layer hook', '一次 fetch，每个层 hook 一次 wait')}</span></div>`;
    }

    function reset() {
      flyer.abort();
      fetchRun++;
      st = { started: false, remaining: Array(LAYERS).fill(0), waiting: Array(LAYERS).fill(false), returned: Array(LAYERS).fill(false) };
      build(); paint();
      statusEl.innerHTML = bi('Rank 0 holds an index tensor of shape [2 layers, 4 tokens, 2 entries]. Each number is a global row: rank <i>r</i> stores rows 6<i>r</i> to 6<i>r</i>+5 of every layer. Press <b>fetch()</b>.',
                               'rank 0 持有形状为 [2 层, 4 个 token, 2 个条目] 的索引张量。每个数字是一个全局行号：rank <i>r</i> 存放每层的第 6<i>r</i> 到 6<i>r</i>+5 行。点击 <b>fetch()</b>。');
    }

    function fetch() {
      flyer.abort();
      const myRun = ++fetchRun;
      build();
      st = { started: true, remaining: Array(LAYERS).fill(TOKENS * EPT), waiting: Array(LAYERS).fill(false), returned: Array(LAYERS).fill(false) };
      paint();
      statusEl.innerHTML = bi('<b>fetch()</b> launches one kernel for every layer. Each issue warp walks the indices layer by layer, keeps the ones behind its peer, and posts them as RDMA gets. Rows from rank 0\'s own node take the same Gin path. The call returns at once with one hook per layer.',
                              '<b>fetch()</b> 为所有层只启动一个 kernel。每个 issue warp 逐层扫描索引，留下位于自己 peer 之后的那些，作为 RDMA get 发出。来自 rank 0 本节点的行也走同样的 Gin 路径。调用立即返回，每层一个 hook。');
      const rnd = mulberry32(seed * 7 + 1);
      const issued = [0, 0];
      for (let l = 0; l < LAYERS; l++) {
        for (let t = 0; t < TOKENS; t++) for (let k = 0; k < EPT; k++) {
          const g = indices[l][t][k];
          const r = Math.floor(g / ENTRIES), j = g % ENTRIES, p = peerOf(r);
          const order = issued[p]++;
          const delay = order * 170 + Math.floor(rnd() * 500);
          const src = $(`[data-st="${r}-${l}-${j}"]`, wrap), dst = $(`[data-rv="${l}-${t}-${k}"]`, wrap);
          setTimeout(() => {
            if (myRun !== fetchRun) return;
            const q = $(`[data-wq="${p}"]`, wrap);
            if (q) q.textContent = `layer ${l} · get row ${g}`;
            src && src.classList.add('hit');
          }, delay);
          flyer.fly(src, dst, `<span class="tok r${r}">${g}</span>`, delay, () => {
            dst.innerHTML = `<span class="tok r${r}">${g}</span>`;
            st.remaining[l]--;
            if (st.remaining[l] === 0 && st.waiting[l]) complete(l);
            paint();
          }, 780);
        }
      }
    }

    function complete(l) {
      st.waiting[l] = false; st.returned[l] = true;
      const el = $(`[data-layer="${l}"]`, wrap);
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
      paint();
    }

    hookBtns.forEach((b) => b.addEventListener('click', () => {
      const l = +b.dataset.layer;
      if (!st.started || st.returned[l]) return;
      if (st.remaining[l] === 0) complete(l);
      else { st.waiting[l] = true; paint(); }
    }));
    btnFetch.addEventListener('click', fetch);
    btnNew.addEventListener('click', () => { seed = Math.floor(Math.random() * 1e9); genIndices(); reset(); });
    genIndices();
    reset();
  }

  // =====================================================================
  // 3. Engram QP sizing: EngramBuffer.get_theoretical_config
  // =====================================================================
  function initEngramConfig(host) {
    const f = (id) => $('#' + id, host);
    const els = { nic: f('eq-nic'), peers: f('eq-peers'), layers: f('eq-layers'), tokens: f('eq-tokens'), ept: f('eq-ept'), rq: f('eq-rq') };
    const readouts = $('.readouts', host);
    const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);
    function update() {
      const mpps = +els.nic.value, peers = +els.peers.value, layers = +els.layers.value;
      const tokens = +els.tokens.value, ept = +els.ept.value, rq = +els.rq.value;
      if (!(mpps > 0 && peers > 0 && layers > 0 && tokens > 0 && ept > 0 && rq > 0)) return;
      const inflight = mpps * 1e6 * 10e-6;  // reads outstanding over a 10 us RTT
      let qps = Math.max(Math.ceil(inflight / rq / peers), 1);
      const requests = layers * tokens * ept;
      const slots = ceilDiv(requests, qps * peers);
      let depth, restrict = false;
      if (slots > 32768) {
        qps = Math.trunc(ceilDiv(requests, 32768 * peers) * 1.05);
        depth = 32768; restrict = true;
      } else {
        depth = 1024;
        while (depth < slots && depth < 32768) depth *= 2;
      }
      readouts.innerHTML = `
        <div class="readout key"><span class="k">num_qps</span><span class="v">${qps}</span><span class="s">${bi(`${inflight.toFixed(0)} reads in flight ÷ ${rq} per QP ÷ ${peers} peer${peers > 1 ? 's' : ''}`, `${inflight.toFixed(0)} 个在途读 ÷ 每 QP ${rq} ÷ ${peers} 个 peer`)}</span></div>
        <div class="readout key"><span class="k">qp_depth</span><span class="v">${num(depth)}</span><span class="s">${bi(`needs ${num(slots)} slots per QP; flush depth ${num(depth - 256)}`, `每个 QP 需要 ${num(slots)} 个槽；flush 深度 ${num(depth - 256)}`)}</span></div>
        <div class="readout"><span class="k">restrict_rd_atomic</span><span class="v">${restrict}</span><span class="s">${bi(restrict ? 'more than 32,768 slots per QP: add QPs instead' : 'the default depths are enough', restrict ? '每个 QP 需要超过 32,768 个槽：改为增加 QP' : '默认深度足够')}</span></div>
        <div class="readout"><span class="k">${bi('Requests', '请求数')}</span><span class="v">${num(requests)}</span><span class="s">${bi('layers × tokens × entries', '层数 × token 数 × 条目数')}</span></div>`;
    }
    Object.values(els).forEach((el) => el.addEventListener('input', update));
    update();
  }

  // =====================================================================
  // 4. PP flow control: one direction of the ring (stage s -> stage s+1)
  // =====================================================================
  function initPP(host) {
    const N = 10, TICK = 700;
    const wrap = $('.pp-wrap', host), readouts = $('.readouts', host), statusEl = $('.pp-status', host);
    const inflightEl = $('#pp-inflight', host), inflightOut = $('#pp-inflight-out', host);
    const everyEl = $('#pp-every', host), everyOut = $('#pp-every-out', host);
    const playBtn = $('[data-act="play"]', host), stepBtn = $('[data-act="step"]', host), resetBtn = $('[data-act="reset"]', host);
    const flyer = makeFlyer(wrap);
    let st, timer = null;
    const inflight = () => +inflightEl.value, every = () => +everyEl.value;

    function build() {
      const K = inflight();
      wrap.innerHTML = `
        <div class="pp-panel">
          <div class="rk-h"><b>stage s · send</b><span>rank s</span></div>
          <div class="blk"><div class="blk-h"><span>${bi('tensors to send', '待发送张量')}</span></div><div class="pp-queue" data-q></div></div>
          <div class="blk"><div class="blk-h"><span>${bi('send staging', '发送暂存')}</span><span>${K} slots</span></div>
            <div class="pp-slots">${[...Array(K)].map((_, i) => `<span class="pp-slot" data-ss="${i}">${i}</span>`).join('')}</div></div>
          <dl class="kv"><dt>send_count</dt><dd data-v="send"></dd><dt>release</dt><dd data-v="rel"></dd></dl>
          <p class="pp-cond" data-cond></p>
        </div>
        <div class="pp-mid">
          <span>gin.put + signal</span><span class="arrow-r"></span>
          <span style="margin-top:1.2rem">release +1</span><span class="arrow-l"></span>
        </div>
        <div class="pp-panel">
          <div class="rk-h"><b>stage s+1 · recv</b><span>rank s+1</span></div>
          <div class="blk"><div class="blk-h"><span>${bi('receive slots', '接收槽')}</span><span>${K} slots</span></div>
            <div class="pp-slots">${[...Array(K)].map((_, i) => `<span class="pp-slot" data-rs="${i}">${i}</span>`).join('')}</div></div>
          <dl class="kv"><dt>arrival</dt><dd data-v="arr"></dd><dt>recv_count</dt><dd data-v="recv"></dd></dl>
          <div class="blk"><div class="blk-h"><span>${bi('received tensors', '已接收张量')}</span></div><div class="pp-queue" data-out></div></div>
        </div>`;
    }

    function reset(pre) {
      flyer.abort();
      st = { t: 0, send: 0, rel: 0, arr: 0, recv: 0, stalls: 0, slotData: Array(inflight()).fill(-1), stageData: Array(inflight()).fill(-1),
             pendingArr: [], pendingRel: [], out: [] };
      build();
      for (let i = 0; i < pre; i++) tick(true);
      draw();
    }

    function tick(silent) {
      if (st.recv >= N) return;
      st.t++;
      const K = inflight();
      // signals issued last tick land now
      st.arr += st.pendingArr.length; st.pendingArr.forEach((p) => { st.slotData[p.slot] = p.id; }); st.pendingArr = [];
      st.rel += st.pendingRel.length; st.pendingRel = [];
      const moves = [];
      // receiver: consumes the next tensor every `every` ticks if it has arrived
      if (st.t % every() === 0 && st.arr > st.recv) {
        const slot = st.recv % K, id = st.slotData[slot];
        st.slotData[slot] = -1; st.out.push(id); st.recv++;
        st.pendingRel.push(1);
        moves.push({ kind: 'recv', slot, id });
      }
      // sender: may reuse slot `send % K` once the receiver released the send made K sends ago
      if (st.send < N) {
        const target = st.send - K + 1;
        if (st.rel >= target) {
          const slot = st.send % K;
          st.stageData[slot] = st.send;
          st.pendingArr.push({ slot, id: st.send });
          moves.push({ kind: 'send', slot, id: st.send });
          st.send++;
        } else st.stalls++;
      }
      if (!silent) { draw(); animate(moves); }
    }

    function animate(moves) {
      moves.forEach((m) => {
        if (m.kind === 'send') {
          const from = $(`[data-ss="${m.slot}"]`, wrap), to = $(`[data-rs="${m.slot}"]`, wrap);
          flyer.fly(from, to, `<span class="tok r0">t${m.id}</span>`, 60, null, TICK - 120);
        } else {
          const from = $(`[data-rs="${m.slot}"]`, wrap), to = $('[data-out]', wrap);
          flyer.fly(from, to, `<span class="tok r1">t${m.id}</span>`, 0, null, TICK - 200);
          const back = $('[data-v="rel"]', wrap);
          flyer.fly(from, back, '<span class="rel-chip">release</span>', 120, null, TICK - 160);
        }
      });
    }

    function draw() {
      const K = inflight();
      const q = $('[data-q]', wrap);
      q.innerHTML = [...Array(N)].map((_, i) => i).filter((i) => i >= st.send).map((i) => `<span class="tok r0">t${i}</span>`).join('') || `<span class="psum">${bi('all sent', '已全部发送')}</span>`;
      for (let i = 0; i < K; i++) {
        const ss = $(`[data-ss="${i}"]`, wrap), rs = $(`[data-rs="${i}"]`, wrap);
        ss.classList.toggle('cur', st.send < N && i === st.send % K);
        rs.classList.toggle('cur', i === st.recv % K);
        ss.innerHTML = st.stageData[i] >= 0 ? `<span class="tok r0">t${st.stageData[i]}</span>` : String(i);
        rs.innerHTML = st.slotData[i] >= 0 ? `<span class="tok r0">t${st.slotData[i]}</span>` : String(i);
      }
      $('[data-out]', wrap).innerHTML = st.out.map((i) => `<span class="tok r1">t${i}</span>`).join('') || `<span class="psum">—</span>`;
      $('[data-v="send"]', wrap).textContent = st.send;
      $('[data-v="rel"]', wrap).textContent = st.rel;
      $('[data-v="arr"]', wrap).textContent = st.arr;
      $('[data-v="recv"]', wrap).textContent = st.recv;
      const cond = $('[data-cond]', wrap);
      if (st.send >= N) {
        cond.className = 'pp-cond'; cond.innerHTML = bi('all sends issued', '所有 send 已发出');
      } else {
        const target = st.send - K + 1, ok = st.rel >= target;
        cond.className = 'pp-cond' + (ok ? '' : ' blocked');
        cond.innerHTML = `next send waits for release ≥ ${st.send} − ${K} + 1 = <b>${target}</b> · ${ok ? 'free' : 'spinning'}`;
      }
      const done = st.recv >= N;
      readouts.innerHTML = `
        <div class="readout"><span class="k">${bi('Ticks', '时钟')}</span><span class="v">${st.t}</span><span class="s">${done ? bi('all 10 received', '10 个已全部接收') : bi('one send and one check per tick', '每个时钟一次发送、一次检查')}</span></div>
        <div class="readout key"><span class="k">${bi('Sender stalls', '发送方空等')}</span><span class="v">${st.stalls}</span><span class="s">${bi('ticks the send kernel spun on release', 'send kernel 在 release 上自旋的时钟数')}</span></div>
        <div class="readout"><span class="k">${bi('Slots in use', '已占用槽位')}</span><span class="v">${st.send - st.rel} / ${K}</span><span class="s">${bi('sent but not yet released', '已发送但尚未释放')}</span></div>`;
      playBtn.innerHTML = timer ? bi('Pause', '暂停') : bi(done ? 'Replay' : 'Play', done ? '重放' : '播放');
      stepBtn.disabled = done;
      statusEl.innerHTML = bi(
        `Stage s sends 10 tensors to stage s+1, which calls <code>recv</code> once every ${every()} tick${every() > 1 ? 's' : ''}. With ${K} in-flight slot${K > 1 ? 's' : ''}, send number <i>n</i> reuses slot <i>n</i> mod ${K} and must wait until the receiver has released send <i>n</i> − ${K}.`,
        `stage s 向 stage s+1 发送 10 个张量，后者每 ${every()} 个时钟调用一次 <code>recv</code>。有 ${K} 个在途槽位时，第 <i>n</i> 次 send 复用槽位 <i>n</i> mod ${K}，必须等接收方释放第 <i>n</i> − ${K} 次 send 的槽位。`);
    }

    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    playBtn.addEventListener('click', () => {
      if (timer) { stop(); draw(); return; }
      if (st.recv >= N) reset(0);
      timer = setInterval(() => { tick(false); if (st.recv >= N) { stop(); draw(); } }, TICK);
      draw();
    });
    stepBtn.addEventListener('click', () => { stop(); tick(false); });
    resetBtn.addEventListener('click', () => { stop(); reset(0); });
    inflightEl.addEventListener('input', () => { inflightOut.textContent = inflightEl.value; stop(); reset(0); });
    everyEl.addEventListener('input', () => { everyOut.textContent = everyEl.value; stop(); reset(0); });
    inflightOut.textContent = inflightEl.value;
    everyOut.textContent = everyEl.value;
    reset(6);
  }

  const lb = document.getElementById('lbx'); if (lb) initLB(lb);
  const eg = document.getElementById('engram'); if (eg) initEngram(eg);
  const eq = document.getElementById('engram-qp'); if (eq) initEngramConfig(eq);
  const pp = document.getElementById('ppflow'); if (pp) initPP(pp);
})();
