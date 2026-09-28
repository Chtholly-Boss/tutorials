// DeepEP chapter 03 widgets: allocation plan, collective explorer,
// reduce-scatter credit ring, and the hybrid all-gather chunk planner.
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
  const MiB = 1048576;
  const fmtBytes = (b) => b >= MiB ? (b / MiB).toFixed(b % MiB ? 2 : 0) + ' MiB' : b >= 1024 ? (b / 1024).toFixed(b % 1024 ? 1 : 0) + ' KiB' : b + ' B';
  const lang = () => (document.documentElement.dataset.lang === 'zh' ? 'zh' : 'en');

  function S(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

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

  // ---------- flying chip ----------
  function fly(stage, fromEl, toEl, html, delay, duration) {
    return new Promise((resolve) => {
      if (reduceMotion || !fromEl || !toEl) { resolve(); return; }
      const g0 = stage.getBoundingClientRect();
      const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
      const g = document.createElement('div');
      g.className = 'fly-ghost';
      g.innerHTML = html;
      stage.appendChild(g);
      const c = g.firstElementChild.getBoundingClientRect();
      const x0 = a.left - g0.left + (a.width - c.width) / 2, y0 = a.top - g0.top + (a.height - c.height) / 2;
      const x1 = b.left - g0.left + (b.width - c.width) / 2, y1 = b.top - g0.top + (b.height - c.height) / 2;
      const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 22;
      const anim = g.animate([
        { transform: `translate(${x0}px, ${y0}px)`, opacity: 0.25 },
        { transform: `translate(${mx}px, ${my}px) scale(1.1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${x1}px, ${y1}px)`, opacity: 1 }
      ], { duration: duration || 620, delay: delay || 0, easing: 'cubic-bezier(.3,.65,.25,1)', fill: 'both' });
      anim.finished.then(() => { g.remove(); resolve(); }, () => { g.remove(); resolve(); });
    });
  }

  // =====================================================================
  // 1. Allocation plan: BufferAllocator (2 MiB) versus session.allocate (64 B)
  // =====================================================================
  function initAlloc(host) {
    const stage = $('.alloc-stage', host), list = $('.alloc-list', host), svg = $('svg', host), readouts = $('.readouts', host);
    const preset = $('#al-preset', host), addBtn = $('[data-act="add"]', host), clearBtn = $('[data-act="clear"]', host), buildBtn = $('[data-act="build"]', host);
    const PLAN_ALIGN = 2 * MiB, SESSION_ALIGN = 64, MAX = 4;
    const PRESETS = {
      a: { shape: [3, 5], dtype: 'float32', size: 4 },
      b: { shape: [7], dtype: 'bfloat16', size: 2 },
      c: { shape: [1024, 1024], dtype: 'float32', size: 4 },
      d: { shape: [4096, 1536], dtype: 'bfloat16', size: 2 },
      e: { shape: [3, 1000], dtype: 'float32', size: 4 },
      f: { shape: [8, 1024, 1024], dtype: 'float32', size: 4 }
    };
    let tensors = [], built = false;

    function add(key) {
      if (tensors.length >= MAX) return;
      const p = PRESETS[key];
      tensors.push({ ...p, nbytes: p.shape.reduce((x, y) => x * y, 1) * p.size });
      built = false;
      render();
    }

    function plan() {
      let cur = 0, scur = 0;
      const rows = tensors.map((t) => {
        const off = alignUp(cur, PLAN_ALIGN);
        cur = alignUp(off + t.nbytes, PLAN_ALIGN);
        const soff = scur;
        scur += alignUp(t.nbytes, SESSION_ALIGN);
        return { ...t, off, soff };
      });
      return { rows, total: cur, stotal: scur, used: tensors.reduce((s, t) => s + t.nbytes, 0) };
    }

    function render() {
      const P = plan();
      list.innerHTML = P.rows.map((t, i) => `<span class="tok r${i}" data-t="${i}">t${i} · (${t.shape.join(', ')}${t.shape.length === 1 ? ',' : ''}) ${t.dtype === 'float32' ? 'f32' : 'bf16'} · ${built ? 'cuda' : 'meta'}</span>`).join('') ||
        `<span class="psum">${bi('Empty plan. Add a tensor.', '计划为空，请添加张量。')}</span>`;
      addBtn.disabled = tensors.length >= MAX;
      svg.innerHTML = '';
      const defs = S('defs', null, svg);
      const pat = S('pattern', { id: 'al-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      S('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'hatch-line' }, pat);
      const X0 = 20, W = 840;
      const drawBar = (y, total, offKey, title, unitLabel) => {
        S('text', { x: X0, y: y - 8, class: 't-sm' }, svg, title);
        S('rect', { x: X0, y, width: W, height: 26, class: 'seg-pad' }, svg).setAttribute('style', 'fill:url(#al-hatch)');
        if (!total) return;
        const s = W / total;
        let lastLabelX = -1e9;
        P.rows.forEach((t, i) => {
          const x = X0 + t[offKey] * s, w = Math.max(t.nbytes * s, 2.5);
          const r = S('rect', { x, y, width: w, height: 26, class: `bar-seg-${i}`, 'data-slot': `${offKey}-${i}` }, svg);
          r.addEventListener('mouseenter', (ev) => showTip(`t${i}: ${num(t.nbytes)} B at offset ${num(t[offKey])}`, ev));
          r.addEventListener('mousemove', moveTip);
          r.addEventListener('mouseleave', hideTip);
          if (x - lastLabelX >= 70) { S('text', { x, y: y + 42, class: 't-sm muted' }, svg, unitLabel(t[offKey])); lastLabelX = x; }
        });
        S('text', { x: X0 + W, y: y + 42, class: 't-sm muted', 'text-anchor': 'end' }, svg, unitLabel(total));
      };
      drawBar(28, P.total, 'off', `BufferAllocator plan · 2 MiB alignment · ${fmtBytes(P.total)}`, (v) => (v / MiB) + ' MiB');
      drawBar(112, P.stotal, 'soff', `session.allocate · 64 B alignment · ${fmtBytes(P.stotal)}`, (v) => fmtBytes(v));
      const pad = P.total ? (100 * (P.total - P.used) / P.total) : 0;
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Plan num_bytes', 'plan.num_bytes')}</span><span class="v">${fmtBytes(P.total)}</span><span class="s">${bi('becomes the storage size', '即 storage 大小')}</span></div>
        <div class="readout"><span class="k">${bi('Tensor bytes', '张量字节')}</span><span class="v">${fmtBytes(P.used)}</span><span class="s">${bi(`${tensors.length} tensors`, `${tensors.length} 个张量`)}</span></div>
        <div class="readout"><span class="k">${bi('Plan padding', '计划中的填充')}</span><span class="v">${pad.toFixed(1)}%</span><span class="s">${bi('every tensor starts on 2 MiB', '每个张量从 2 MiB 边界开始')}</span></div>
        <div class="readout"><span class="k">${bi('Session bytes', 'session 占用')}</span><span class="v">${fmtBytes(P.stotal)}</span><span class="s">${bi('staging packs at 64 B', '暂存区按 64 B 紧凑排布')}</span></div>`;
    }

    async function build() {
      if (!tensors.length) return;
      built = false; render();
      if (!reduceMotion) {
        const flights = $$('[data-t]', list).map((chip, i) => fly(stage, chip, svg.querySelector(`[data-slot="off-${i}"]`), chip.outerHTML, i * 160, 700));
        await Promise.all(flights);
      }
      built = true; render();
    }

    addBtn.addEventListener('click', () => add(preset.value));
    clearBtn.addEventListener('click', () => { tensors = []; built = false; render(); });
    buildBtn.addEventListener('click', build);
    add('a'); add('b'); add('c');
  }

  // =====================================================================
  // 2. Collective explorer: 4 ranks, three ops, three topologies
  // =====================================================================
  function initExplorer(host) {
    const stage = $('.cx-stage', host), nodesEl = $('.cx-nodes', host), stepEl = $('.cx-step', host), readouts = $('.readouts', host);
    const opBtns = $$('[data-op]', host), topoBtns = $$('[data-topo]', host);
    const stepBtn = $('[data-act="step"]', host), playBtn = $('[data-act="play"]', host), resetBtn = $('[data-act="reset"]', host);
    const REPO = 'https://github.com/deepseek-ai/DeepEP/blob/8c1d13a89b8fd0ba09fc631bd6a29aef37b7602d/';
    const src = (path, a, b, label) => `<a class="src" href="${REPO}${path}#L${a}-L${b}">${label}:${a}–${b}</a>`;
    const TOPO = { nvl: { rdma: 1, nvl: 4 }, rdma: { rdma: 4, nvl: 1 }, hybrid: { rdma: 2, nvl: 2 } };
    let op = 'reduce_scatter', topo = 'hybrid', model = null, k = 0, run = 0, counts = null;

    const T = (en, zh, via, cite, transfers) => ({ en, zh, via, cite, transfers: transfers || [] });

    function build() {
      const { rdma, nvl } = TOPO[topo];
      const R = rdma * nvl;
      const node = (r) => Math.floor(r / nvl), loc = (r) => r % nvl, rid = (n, l) => n * nvl + l;
      const cells = [...Array(R)].map((_, r) => [...Array(4)].map((_, s) => (op === 'all_gather' ? (s === r ? 1 << r : 0) : 1 << r)));
      const steps = [];
      const peersInNode = (r) => [...Array(nvl)].map((_, l) => rid(node(r), l)).filter((p) => p !== r);
      const others = (r) => [...Array(R)].map((_, p) => p).filter((p) => p !== r);
      const ag = 'deep_ep/include/deep_ep/impls/bucket/all_gather/', rs = 'deep_ep/include/deep_ep/impls/bucket/reduce_scatter/', ar = 'deep_ep/include/deep_ep/impls/bucket/all_reduce/';

      if (op === 'all_gather' && topo === 'nvl') {
        steps.push(T('<b>Signal round.</b> No kernel runs. The host enqueues stream memory operations: each rank writes a sequence number into every peer\'s signal slot, then waits until all peers have written theirs.',
          '<b>信号轮。</b>不启动任何 kernel。host 在 stream 上排入内存操作：每个 rank 把序号写进每个 peer 的信号槽，再等待所有 peer 写完。', 'none',
          src('csrc/kernels/driver/driver.cpp', 67, 80, 'driver.cpp')));
        steps.push(T('<b>Copy engines push.</b> One <code>cudaMemcpyBatchAsync</code> copies the local shard into the same offset on every peer through NVLink pointers. No SM takes part.',
          '<b>copy engine 推送。</b>一次 <code>cudaMemcpyBatchAsync</code> 通过 NVLink 指针，把本地分片拷到每个 peer 的相同偏移处，全程不占用 SM。', 'ce',
          src('csrc/kernels/driver/driver.cpp', 50, 65, 'driver.cpp'),
          [].concat(...[...Array(R)].map((_, r) => others(r).map((p) => ({ from: [r, r], to: [p, r], kind: 'copy', via: 'ce' }))))));
        steps.push(T('<b>Closing signal round.</b> A second sequence number tells the peers the copies have landed. The whole all-gather used zero SMs.',
          '<b>收尾信号轮。</b>第二个序号告知 peer 拷贝已落地。整个 all-gather 没用任何 SM。', 'none',
          src('csrc/kernels/bucket/all_gather.hpp', 105, 108, 'all_gather.hpp')));
      } else if (op === 'all_gather' && topo === 'rdma') {
        steps.push(T('<b>Entry barrier.</b> A cooperative kernel waits until every rank\'s shard is in place.',
          '<b>入口 barrier。</b>一个 cooperative kernel 等到每个 rank 的分片都已就位。', 'none', src(ag + 'rdma.cuh', 31, 36, 'rdma.cuh')));
        steps.push(T('<b>Puts.</b> Warps take destination ranks round-robin and put the local shard from storage into the same offset on each peer. Lanes cover different buckets.',
          '<b>put。</b>各 warp 轮流认领目标 rank，把本地分片从 storage 直接 put 到每个 peer 的相同偏移处，不同 lane 负责不同 bucket。', 'rdma', src(ag + 'rdma.cuh', 38, 48, 'rdma.cuh'),
          [].concat(...[...Array(R)].map((_, r) => others(r).map((p) => ({ from: [r, r], to: [p, r], kind: 'copy', via: 'rdma' }))))));
        steps.push(T('<b>Barrier at <code>wait()</code>.</b> The kernel has no closing barrier. The epilogue that runs when you call <code>wait()</code> does one and flushes the QPs, so every put is complete.',
          '<b><code>wait()</code> 时的 barrier。</b>kernel 本身没有收尾 barrier；调用 <code>wait()</code> 时运行的 epilogue 做一次 barrier 并 flush QP，确保所有 put 完成。', 'none',
          src('csrc/buffers/bucket.hpp', 313, 323, 'bucket.hpp')));
      } else if (op === 'all_gather') {
        steps.push(T('<b>Local shard over NVLink.</b> The copy engine pushes this rank\'s shard to its NVLink peers while the RDMA kernel starts.',
          '<b>本地分片走 NVLink。</b>RDMA kernel 启动的同时，copy engine 把本 rank 的分片推给 NVLink peer。', 'ce',
          src('csrc/kernels/bucket/all_gather.hpp', 198, 203, 'all_gather.hpp'),
          [].concat(...[...Array(R)].map((_, r) => peersInNode(r).map((p) => ({ from: [r, r], to: [p, r], kind: 'copy', via: 'ce' }))))));
        steps.push(T('<b>One SM per RDMA peer.</b> Each SM puts the shard to one rail peer, split over 8 QPs per chunk. Every QP bumps a per-chunk tail when its part lands.',
          '<b>每个 RDMA peer 一个 SM。</b>每个 SM 把分片 put 给一个 rail peer，每个 chunk 拆到 8 个 QP 上；每个 QP 的数据落地时把该 chunk 的 tail 加一。', 'rdma',
          src(ag + 'hybrid.cuh', 50, 79, 'hybrid.cuh'),
          [].concat(...[...Array(R)].map((_, r) => [...Array(rdma)].map((_, n) => rid(n, loc(r))).filter((p) => p !== r).map((p) => ({ from: [r, r], to: [p, r], kind: 'copy', via: 'rdma' }))))));
        steps.push(T('<b>Forward arrived chunks.</b> The host queued, per chunk, a stream wait on those tails and then a copy-engine push to the NVLink peers, so every chunk moves on as soon as it lands.',
          '<b>转发已到达的 chunk。</b>host 预先为每个 chunk 排入一次对这些 tail 的 stream 等待，再接一次 copy engine 推送给 NVLink peer，所以每个 chunk 一落地就继续前进。', 'ce',
          src('csrc/kernels/bucket/all_gather.hpp', 205, 225, 'all_gather.hpp'),
          [].concat(...[...Array(R)].map((_, r) => [...Array(rdma)].map((_, n) => rid(n, loc(r))).filter((q) => q !== r)
            .flatMap((q) => peersInNode(r).map((p) => ({ from: [r, q], to: [p, q], kind: 'copy', via: 'ce' })))))));
        steps.push(T('<b>Barrier at <code>wait()</code>.</b> The tails already confirmed every put, so this barrier skips the QP flush.',
          '<b><code>wait()</code> 时的 barrier。</b>tail 已经确认了每一次 put，所以这次 barrier 不再 flush QP。', 'none',
          src('csrc/buffers/bucket.hpp', 313, 323, 'bucket.hpp')));
      } else if (op === 'reduce_scatter' && topo === 'nvl') {
        steps.push(T('<b>Entry barrier.</b> Every rank has finished writing its FP32 input.',
          '<b>入口 barrier。</b>每个 rank 都已写完自己的 FP32 输入。', 'none', src(rs + 'nvlink.cuh', 26, 33, 'nvlink.cuh')));
        steps.push(T('<b><code>multimem.ld_reduce</code>.</b> Each rank reads its own shard through the multicast address. One load returns the sum over all NVLink ranks, and the thread stores it into the local shard.',
          '<b><code>multimem.ld_reduce</code>。</b>每个 rank 通过 multicast 地址读取自己的分片，一次 load 就返回所有 NVLink rank 的和，线程再把它写回本地分片。', 'mm',
          src(rs + 'nvlink.cuh', 36, 50, 'nvlink.cuh'),
          [].concat(...[...Array(R)].map((_, r) => others(r).map((p) => ({ from: [p, r], to: [r, r], kind: 'add', via: 'mm' }))))));
        steps.push(T('<b>Closing barrier.</b> No rank starts overwriting inputs that a peer may still be reading.',
          '<b>收尾 barrier。</b>保证没有 rank 在 peer 仍在读取时就改写输入。', 'none', src(rs + 'nvlink.cuh', 52, 56, 'nvlink.cuh')));
      } else if (op === 'reduce_scatter' && topo === 'rdma') {
        steps.push(T('<b>Put through a credit ring.</b> Issue warps send each 32 KiB chunk of peer <i>d</i>\'s shard into a slot of <i>d</i>\'s chunk storage, with a signal-add on the slot\'s tail. Reduce warps on <i>d</i> wait for the tail, add the chunk into <i>d</i>\'s own shard in FP32, and return a credit if the slot will be reused.',
          '<b>经信用环 put。</b>issue warp 把 peer <i>d</i> 分片的每个 32 KiB chunk 发进 <i>d</i> 的 chunk storage 某个槽，并对该槽的 tail 做 signal-add；<i>d</i> 上的 reduce warp 等到 tail，以 FP32 累加进 <i>d</i> 自己的分片，槽位还要复用时再归还信用。', 'rdma',
          src(rs + 'rdma.cuh', 94, 226, 'rdma.cuh'),
          [].concat(...[...Array(R)].map((_, r) => others(r).map((d) => ({ from: [r, d], to: [d, d], kind: 'add', via: 'rdma' }))))));
        steps.push(T('<b>Closing barrier.</b> Flushes every QP so no put is still in flight.',
          '<b>收尾 barrier。</b>flush 所有 QP，确保没有 put 还在路上。', 'none', src(rs + 'rdma.cuh', 228, 232, 'rdma.cuh')));
      } else if (op === 'reduce_scatter') {
        steps.push(T('<b>Reduce inside the node.</b> The rank with local index <i>l</i> uses <code>multimem.ld_reduce</code> to sum, over its node, every shard owned by a rank with local index <i>l</i>. The sum replaces its own copy of those shards.',
          '<b>节点内规约。</b>本地编号为 <i>l</i> 的 rank 用 <code>multimem.ld_reduce</code> 在本节点内，对所有归本地编号 <i>l</i> 的 rank 所有的分片求和，结果覆盖它自己那份分片。', 'mm',
          src(rs + 'hybrid.cuh', 102, 138, 'hybrid.cuh'),
          [].concat(...[...Array(R)].map((_, r) => [...Array(rdma)].map((_, d) => rid(d, loc(r))).flatMap((s) => peersInNode(r).map((p) => ({ from: [p, s], to: [r, s], kind: 'add', via: 'mm' })))))));
        steps.push(T('<b>One hop over the rail.</b> Issue warps put each node-reduced chunk to the rail peer that owns it, through the same credit ring. Reduce warps there TMA-load it into shared memory and TMA reduce-add it into the output.',
          '<b>沿 rail 走一跳。</b>issue warp 通过同样的信用环，把每个节点内已规约的 chunk put 给拥有它的 rail peer；对方的 reduce warp 用 TMA 读进共享内存，再用 TMA reduce-add 累加到输出。', 'rdma',
          src(rs + 'hybrid.cuh', 142, 278, 'hybrid.cuh'),
          [].concat(...[...Array(R)].map((_, r) => [...Array(rdma)].map((_, d) => rid(d, loc(r))).filter((o) => o !== r).map((o) => ({ from: [r, o], to: [o, o], kind: 'add', via: 'rdma' }))))));
      } else if (op === 'all_reduce' && topo === 'nvl') {
        steps.push(T('<b>Reduce the owned shard.</b> Each rank loads its shard with <code>multimem.ld_reduce</code> and gets the sum over the NVLink domain.',
          '<b>规约自己负责的分片。</b>每个 rank 用 <code>multimem.ld_reduce</code> 读取自己的分片，得到整个 NVLink 域的和。', 'mm',
          src(ar + 'nvlink.cuh', 35, 51, 'nvlink.cuh'),
          [].concat(...[...Array(R)].map((_, r) => others(r).map((p) => ({ from: [p, r], to: [r, r], kind: 'add', via: 'mm' }))))));
        steps.push(T('<b>Multicast the result.</b> In the same loop, <code>multimem.st</code> writes the sum to that shard on every rank at once. Reduce-scatter and all-gather are fused into one pass.',
          '<b>multicast 结果。</b>在同一个循环里，<code>multimem.st</code> 把和一次性写到所有 rank 的该分片上。reduce-scatter 与 all-gather 融合成一趟。', 'mm',
          src(ar + 'nvlink.cuh', 35, 51, 'nvlink.cuh'),
          [].concat(...[...Array(R)].map((_, r) => others(r).map((p) => ({ from: [r, r], to: [p, r], kind: 'copy', via: 'mm' }))))));
      } else if (op === 'all_reduce' && topo === 'rdma') {
        steps.push(T('<b>Send chunks to their owners.</b> Chunks are dealt out round-robin: chunk <i>c</i> belongs to rank <i>c</i> mod <i>R</i>. Issue warps put every chunk they don\'t own into the owner\'s chunk storage through the credit ring.',
          '<b>把 chunk 送给其所有者。</b>chunk 轮流分配：chunk <i>c</i> 归 rank <i>c</i> mod <i>R</i>。issue warp 经信用环把自己不拥有的每个 chunk put 进所有者的 chunk storage。', 'rdma',
          src(ar + 'rdma.cuh', 89, 132, 'rdma.cuh'),
          [].concat(...[...Array(R)].map((_, r) => [0, 1, 2, 3].filter((c) => c % R !== r).map((c) => ({ from: [r, c], to: [c % R, c], kind: 'add', via: 'rdma' }))))));
        steps.push(T('<b>Owner reduces and broadcasts.</b> Reduce warps TMA reduce-add each peer\'s copy into the chunk in place, release the slot, then put the finished chunk to every peer.',
          '<b>所有者规约并广播。</b>reduce warp 用 TMA reduce-add 把每个 peer 的副本原地累加进 chunk，释放槽位，再把完成的 chunk put 给所有 peer。', 'rdma',
          src(ar + 'rdma.cuh', 133, 251, 'rdma.cuh'),
          [].concat(...[0, 1, 2, 3].map((c) => others(c % R).map((p) => ({ from: [c % R, c], to: [p, c], kind: 'copy', via: 'rdma' }))))));
      } else {
        const lOf = (c) => c % nvl, dOf = (c) => Math.floor(c / nvl) % rdma;
        steps.push(T('<b>Reduce inside the node.</b> Chunk <i>c</i> is reduced by the rank with local index <i>c</i> mod <i>N</i> (<i>N</i> = NVLink ranks) using <code>multimem.ld_reduce</code>.',
          '<b>节点内规约。</b>chunk <i>c</i> 由本地编号为 <i>c</i> mod <i>N</i>（<i>N</i> 为 NVLink rank 数）的 rank 用 <code>multimem.ld_reduce</code> 规约。', 'mm',
          src(ar + 'hybrid.cuh', 145, 168, 'hybrid.cuh'),
          [].concat(...[0, 1, 2, 3].flatMap((c) => [...Array(rdma)].map((_, n) => rid(n, lOf(c))).map((r) => peersInNode(r).map((p) => ({ from: [p, c], to: [r, c], kind: 'add', via: 'mm' })))))));
        steps.push(T('<b>Send to the RDMA owner.</b> The node-reduced chunk goes to its rail owner, node (<i>c</i> / <i>N</i>) mod <i>R</i>.',
          '<b>发给 RDMA 所有者。</b>节点内规约后的 chunk 发往它的 rail 所有者，即节点 (<i>c</i> / <i>N</i>) mod <i>R</i>。', 'rdma',
          src(ar + 'hybrid.cuh', 171, 208, 'hybrid.cuh'),
          [0, 1, 2, 3].flatMap((c) => [...Array(rdma)].map((_, n) => n).filter((n) => n !== dOf(c)).map((n) => ({ from: [rid(n, lOf(c)), c], to: [rid(dOf(c), lOf(c)), c], kind: 'add', via: 'rdma' })))));
        steps.push(T('<b>Owner reduces and returns it.</b> The owner sums every node\'s contribution into a chunk-storage slot and puts the result back to each rail peer, bumping a tail per reduce warp.',
          '<b>所有者规约并送回。</b>所有者把各节点的贡献累加进 chunk storage 的一个槽，再把结果 put 回每个 rail peer，并给每个 reduce warp 的 tail 加一。', 'rdma',
          src(ar + 'hybrid.cuh', 209, 271, 'hybrid.cuh'),
          [0, 1, 2, 3].flatMap((c) => [...Array(rdma)].map((_, n) => n).filter((n) => n !== dOf(c)).map((n) => ({ from: [rid(dOf(c), lOf(c)), c], to: [rid(n, lOf(c)), c], kind: 'copy', via: 'rdma' })))));
        steps.push(T('<b>Multicast inside the node.</b> Broadcast warps TMA-load each finished chunk and write it to every NVLink peer with <code>multimem.cp.async.bulk</code>, then return the credit.',
          '<b>节点内 multicast。</b>broadcast warp 用 TMA 读入每个完成的 chunk，再用 <code>multimem.cp.async.bulk</code> 写给所有 NVLink peer，然后归还信用。', 'mm',
          src(ar + 'hybrid.cuh', 272, 331, 'hybrid.cuh'),
          [0, 1, 2, 3].flatMap((c) => [...Array(rdma)].map((_, n) => rid(n, lOf(c))).flatMap((r) => peersInNode(r).map((p) => ({ from: [r, c], to: [p, c], kind: 'copy', via: 'mm' }))))));
      }
      return { rdma, nvl, R, node, loc, cells, steps };
    }

    function renderNodes() {
      const m = model;
      const segName = op === 'all_reduce' ? 'chunk' : 'shard';
      let html = '';
      for (let n = 0; n < m.rdma; n++) {
        html += `<div class="cx-node"><div class="cx-node-h">${m.rdma > 1 ? 'node ' + n : bi('one node', '单节点')}</div><div class="cx-ranks">`;
        for (let l = 0; l < m.nvl; l++) {
          const r = n * m.nvl + l;
          html += `<div class="cx-rank"><div class="cx-rank-h"><b>rank ${r}</b><span>${m.rdma > 1 && m.nvl > 1 ? `node ${n} · local ${l}` : ''}</span></div><div class="cx-segs">`;
          for (let s = 0; s < 4; s++) html += `<div class="cx-seg${op === 'reduce_scatter' && s === r ? ' own' : ''}" data-cell="${r}-${s}"><span class="lbl">${segName} ${s}</span><span class="cx-dots"></span></div>`;
          html += '</div></div>';
        }
        html += '</div></div>';
      }
      nodesEl.innerHTML = html;
    }

    function paintCells() {
      model.cells.forEach((row, r) => row.forEach((mask, s) => {
        const el = nodesEl.querySelector(`[data-cell="${r}-${s}"]`);
        el.querySelector('.cx-dots').innerHTML = [0, 1, 2, 3].map((b) => `<i class="${mask & (1 << b) ? 'on' + b : ''}"></i>`).join('');
        const done = op === 'reduce_scatter' ? (s === r && mask === 15) : mask === 15;
        el.classList.toggle('full', done);
      }));
    }

    function paintStatus() {
      const m = model;
      const tagName = { nvl: 'NVLink', rdma: 'RDMA', ce: 'copy engine', mm: 'multimem', none: bi('sync', '同步') };
      if (k === 0) {
        const intro = {
          all_gather: bi('Each rank starts with only its own shard. Step through to gather all four.', '每个 rank 起初只有自己的分片。逐步执行，收齐全部四个分片。'),
          reduce_scatter: bi('Each rank starts with a full FP32 input. Rank <i>r</i> must end with shard <i>r</i> summed over all ranks (outlined cells).', '每个 rank 起初都有完整的 FP32 输入。rank <i>r</i> 最终要得到对所有 rank 求和后的分片 <i>r</i>（带描边的格子）。'),
          all_reduce: bi('Each rank starts with a full FP32 input. Every chunk on every rank must end summed over all ranks, in place.', '每个 rank 起初都有完整的 FP32 输入。最终每个 rank 的每个 chunk 都要原地变成所有 rank 的和。')
        }[op];
        stepEl.innerHTML = `<span class="tag via-none">${bi('start', '开始')}</span>${intro}`;
      } else {
        const st = m.steps[k - 1];
        stepEl.innerHTML = `<span class="tag via-${st.via}">${k}/${m.steps.length} · ${tagName[st.via]}</span>${bi(st.en, st.zh)} ${st.cite}`;
      }
      readouts.innerHTML = `
        <div class="readout"><span class="k">${bi('Step', '步骤')}</span><span class="v">${k} / ${m.steps.length}</span><span class="s">${m.rdma} × ${m.nvl}</span></div>
        <div class="readout"><span class="k">${bi('RDMA transfers', 'RDMA 传输')}</span><span class="v t-rdma">${counts.rdma}</span><span class="s">${bi('shard or chunk copies over the NIC', '经网卡的分片或 chunk 拷贝')}</span></div>
        <div class="readout"><span class="k">${bi('NVLink by SMs', 'SM 发起的 NVLink')}</span><span class="v t-nvl">${counts.mm}</span><span class="s">${bi('multimem loads and stores', 'multimem 读写')}</span></div>
        <div class="readout"><span class="k">${bi('Copy-engine copies', 'copy engine 拷贝')}</span><span class="v t-local">${counts.ce}</span><span class="s">${bi('no SM involved', '不占用 SM')}</span></div>`;
      stepBtn.disabled = k >= m.steps.length;
      playBtn.disabled = k >= m.steps.length;
    }

    function reset() {
      run++;
      if (typeof resets === 'number') resets++;
      $$('.fly-ghost', stage).forEach((g) => g.remove());
      model = build(); k = 0; counts = { rdma: 0, mm: 0, ce: 0 };
      opBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.op === op)));
      topoBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.topo === topo)));
      renderNodes(); paintCells(); paintStatus();
    }

    async function step() {
      if (k >= model.steps.length) return;
      const token = ++run;
      const st = model.steps[k];
      k++;
      paintStatus();
      const before = model.cells.map((row) => row.slice());
      const flights = st.transfers.map((t, i) => {
        const mask = before[t.from[0]][t.from[1]];
        const label = [0, 1, 2, 3].filter((b) => mask & (1 << b)).join('+');
        const html = `<span class="tok cx-flow${t.via === 'mm' ? ' mm' : ''}" style="--tc: var(${t.via === 'rdma' ? '--rdma' : t.via === 'ce' ? '--local' : '--nvl'})">${label}</span>`;
        return fly(stage, nodesEl.querySelector(`[data-cell="${t.from[0]}-${t.from[1]}"]`), nodesEl.querySelector(`[data-cell="${t.to[0]}-${t.to[1]}"]`), html, Math.min(i * 45, 900), 650);
      });
      st.transfers.forEach((t) => {
        const v = before[t.from[0]][t.from[1]];
        model.cells[t.to[0]][t.to[1]] = t.kind === 'copy' ? v : (model.cells[t.to[0]][t.to[1]] | v);
        counts[t.via === 'rdma' ? 'rdma' : t.via === 'ce' ? 'ce' : 'mm']++;
      });
      await Promise.all(flights);
      if (token !== run) return;
      paintCells(); paintStatus();
    }

    let resets = 0, playing = false;
    async function play() {
      if (playing) return;
      playing = true;
      const mine = resets;
      while (k < model.steps.length && mine === resets) {
        await step();
        await sleep(reduceMotion ? 200 : 450);
      }
      playing = false;
    }

    opBtns.forEach((b) => b.addEventListener('click', () => { op = b.dataset.op; reset(); }));
    topoBtns.forEach((b) => b.addEventListener('click', () => { topo = b.dataset.topo; reset(); }));
    stepBtn.addEventListener('click', step);
    playBtn.addEventListener('click', play);
    resetBtn.addEventListener('click', reset);
    reset();
  }

  // =====================================================================
  // 3. Credit ring: one sender, one receiver, S slots per sender region
  // =====================================================================
  function initCredit(host) {
    const svg = $('svg', host), readouts = $('.readouts', host);
    const playBtn = $('[data-act="play"]', host), stepBtn = $('[data-act="step"]', host), resetBtn = $('[data-act="reset"]', host);
    const slotsIn = $('#cr-slots', host), slotsOut = $('#cr-slots-out', host), redIn = $('#cr-reduce', host), redOut = $('#cr-reduce-out', host);
    const N = 10, TICK = 420;
    let st, timer = null;

    function reset(pre) {
      const S0 = +slotsIn.value;
      st = { t: 0, S: S0, sent: 0, head: Array(S0).fill(0), tail: Array(S0).fill(0), occ: Array(S0).fill(null), events: [],
             busy: null, left: 0, reduced: 0, stalls: 0, credits: 0, anim: [] };
      for (let i = 0; i < (pre || 0); i++) tick(true);
      draw();
    }

    function tick(silent) {
      if (st.reduced >= N) return;
      st.t++;
      st.anim = [];
      // deliveries
      st.events = st.events.filter((e) => {
        if (e.at > st.t) return true;
        if (e.kind === 'data') { st.tail[e.slot]++; st.occ[e.slot] = { c: e.c, state: 'landed' }; }
        else st.head[e.slot] = e.value;
        return false;
      });
      // sender
      if (st.sent < N) {
        const c = st.sent, slot = c % st.S, gen = Math.floor(c / st.S);
        if (st.head[slot] >= gen) {
          st.events.push({ kind: 'data', slot, c, at: st.t + 1 });
          st.occ[slot] = { c, state: 'flight' };
          st.anim.push({ kind: 'data', slot });
          st.sent++;
        } else st.stalls++;
      }
      // receiver: reduce in order
      if (st.busy !== null) {
        st.left--;
        if (st.left === 0) {
          const c = st.busy, slot = c % st.S;
          st.reduced++;
          st.occ[slot] = st.occ[slot] && st.occ[slot].c === c ? { c, state: 'done' } : st.occ[slot];
          if (c + st.S < N) { st.events.push({ kind: 'credit', slot, value: Math.floor(c / st.S) + 1, at: st.t + 1 }); st.credits++; st.anim.push({ kind: 'credit', slot }); }
          st.busy = null;
        }
      }
      if (st.busy === null && st.reduced < N) {
        const c = st.reduced, slot = c % st.S;
        if (st.tail[slot] >= Math.floor(c / st.S) + 1) { st.busy = c; st.left = +redIn.value; st.occ[slot] = { c, state: 'reduce' }; }
      }
      if (!silent) draw();
    }

    function draw() {
      svg.innerHTML = '';
      const W = 880, X0 = 250, slotW = Math.min(90, (W - X0 - 40) / st.S - 10);
      const sx = (i) => X0 + i * (slotW + 10);
      // sender
      S('rect', { x: 0, y: 34, width: 212, height: 96, rx: 4, class: 'box' }, svg);
      S('text', { x: 12, y: 56, class: 't-lg' }, svg, 'sender · issue warp');
      const c = st.sent, slot = c % st.S, gen = Math.floor(c / st.S);
      S('text', { x: 12, y: 76, class: 't-sm' }, svg, st.sent < N ? `next chunk ${c} → slot ${slot}` : 'all chunks sent');
      S('text', { x: 12, y: 94, class: 't-sm' + (st.sent < N && st.head[slot] < gen ? ' rdma' : ' muted') }, svg,
        st.sent < N ? (st.head[slot] >= gen ? `head[${slot}] = ${st.head[slot]} ≥ ${gen} · send` : `waits: head[${slot}] = ${st.head[slot]} < ${gen}`) : '');
      S('text', { x: 12, y: 116, class: 't-sm muted' }, svg, `head (credits) = [${st.head.join(', ')}]`);
      // slots
      S('text', { x: X0, y: 20, class: 't-sm muted' }, svg, `receiver chunk storage · region for this sender · ${st.S} slots`);
      for (let i = 0; i < st.S; i++) {
        const o = st.occ[i];
        const cls = !o ? 's-empty' : o.state === 'flight' ? 's-landed' : o.state === 'landed' ? 's-landed-cr' : o.state === 'reduce' ? 's-reduce' : 's-empty';
        S('rect', { x: sx(i), y: 34, width: slotW, height: 56, rx: 4, class: cls }, svg);
        S('text', { x: sx(i) + slotW / 2, y: 54, class: 't-sm muted', 'text-anchor': 'middle' }, svg, `slot ${i}`);
        if (o && o.state !== 'done') S('text', { x: sx(i) + slotW / 2, y: 76, class: 't-lg', 'text-anchor': 'middle' }, svg, `c${o.c}`);
        S('text', { x: sx(i) + slotW / 2, y: 110, class: 't-sm', 'text-anchor': 'middle' }, svg, `tail ${st.tail[i]}`);
      }
      // receiver
      S('text', { x: X0, y: 140, class: 't-sm' }, svg, st.busy !== null ? `reduce warp: adding c${st.busy} into the shard (${st.left} tick${st.left > 1 ? 's' : ''} left)` :
        st.reduced >= N ? 'reduce warp: done' : `reduce warp: waits for tail[${st.reduced % st.S}] ≥ ${Math.floor(st.reduced / st.S) + 1}`);
      S('text', { x: X0, y: 160, class: 't-sm muted' }, svg, `reduced ${st.reduced} / ${N} · credits returned only when a later chunk reuses the slot`);
      if (!reduceMotion) st.anim.forEach((a) => {
        const dot = S('circle', { cx: 0, cy: 0, r: 5, class: a.kind === 'data' ? 'dot-rdma' : 'dot-credit' }, svg);
        const from = a.kind === 'data' ? [212, 70] : [sx(a.slot) + slotW / 2, 90];
        const to = a.kind === 'data' ? [sx(a.slot) + slotW / 2, 62] : [212, 116];
        dot.animate([{ transform: `translate(${from[0]}px, ${from[1]}px)` }, { transform: `translate(${to[0]}px, ${to[1]}px)` }],
          { duration: TICK - 40, easing: 'ease-in-out', fill: 'both' });
      });
      const done = st.reduced >= N;
      readouts.innerHTML = `
        <div class="readout"><span class="k">${bi('Ticks', '时钟')}</span><span class="v">${st.t}</span><span class="s">${done ? bi('all 10 chunks reduced', '10 个 chunk 均已规约') : bi('put and credit each take 1 tick', 'put 与信用各需 1 个时钟')}</span></div>
        <div class="readout key"><span class="k">${bi('Sender stalls', '发送方等待')}</span><span class="v">${st.stalls}</span><span class="s">${bi('ticks waiting for a credit', '等待信用的时钟数')}</span></div>
        <div class="readout"><span class="k">${bi('Credits returned', '归还的信用')}</span><span class="v">${st.credits}</span><span class="s">${bi(`at most ${Math.max(0, N - st.S)} (= chunks − slots)`, `至多 ${Math.max(0, N - st.S)}（= chunk 数 − 槽数）`)}</span></div>`;
      playBtn.innerHTML = timer ? bi('Pause', '暂停') : bi(done ? 'Replay' : 'Play', done ? '重放' : '播放');
      stepBtn.disabled = done;
    }

    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    playBtn.addEventListener('click', () => {
      if (timer) { stop(); draw(); return; }
      if (st.reduced >= N) reset(0);
      timer = setInterval(() => { tick(false); if (st.reduced >= N) { stop(); draw(); } }, TICK);
      draw();
    });
    stepBtn.addEventListener('click', () => { stop(); tick(false); });
    resetBtn.addEventListener('click', () => { stop(); reset(0); });
    const onParam = () => { slotsOut.textContent = slotsIn.value; redOut.textContent = redIn.value; stop(); reset(0); };
    slotsIn.addEventListener('input', onParam);
    redIn.addEventListener('input', onParam);
    slotsOut.textContent = slotsIn.value; redOut.textContent = redIn.value;
    reset(7);
  }

  // =====================================================================
  // 4. Hybrid all-gather chunk planner (all_gather.hpp cost model)
  // =====================================================================
  function initPlanner(host) {
    const svg = $('svg', host), readouts = $('.readouts', host), note = $('.pl-note', host);
    const shard = $('#pl-shard', host), shardOut = $('#pl-shard-out', host);
    const rdmaSel = $('#pl-rdma', host), nvlSel = $('#pl-nvl', host), nvlGbs = $('#pl-nvlgbs', host), rdmaGbs = $('#pl-rdmagbs', host);
    const MIN_CHUNK = 4 * MiB, QP_ALIGN = 8 * 64, MAX_CHUNK = 256 * MiB;

    function compute() {
      const bytes = +shard.value * MiB, rdma = +rdmaSel.value, nvl = +nvlSel.value;
      const nvlBw = +nvlGbs.value * 1e9, rdmaBw = +rdmaGbs.value * 1e9;
      const pushT = bytes * (nvl - 1) / nvlBw, rdmaT = bytes * (rdma - 1) / rdmaBw, fwdT = pushT * (rdma - 1);
      const imax = Math.min(64, Math.floor(bytes / MIN_CHUNK));
      const pts = [];
      let best = 1, bestT = Infinity;
      for (let i = 1; i <= imax; i++) {
        const ce = Math.max(pushT, rdmaT / i) + fwdT + i * 10e-6, nic = rdmaT + fwdT / i;
        const t = Math.max(ce, nic);
        pts.push({ i, t, bound: ce >= nic ? 'CE' : 'RDMA' });
        if (t < bestT) { bestT = t; best = i; }
      }
      const chunk = Math.min(Math.max(alignUp(Math.ceil(bytes / best), QP_ALIGN), 4096), MAX_CHUNK);
      return { bytes, rdma, nvl, pushT, rdmaT, fwdT, imax, pts, best, bestT, chunk, numChunks: Math.ceil(bytes / chunk) };
    }

    function draw(r) {
      svg.innerHTML = '';
      const X0 = 56, X1 = 600, Y0 = 28, Y1 = 176;
      if (!r.pts.length) {
        S('text', { x: 320, y: 100, class: 't-sm muted', 'text-anchor': 'middle' }, svg, 'shard < 4 MiB: the loop never runs, one chunk');
        return;
      }
      const tmax = Math.max(...r.pts.map((p) => p.t)) * 1e3, tmin = Math.min(...r.pts.map((p) => p.t)) * 1e3;
      const lo = Math.max(0, tmin - (tmax - tmin) * 0.15 - 0.001), hi = tmax + (tmax - tmin) * 0.1 + 0.001;
      const sx = (i) => X0 + (r.pts.length === 1 ? (X1 - X0) / 2 : (i - 1) / (r.pts.length - 1) * (X1 - X0));
      const sy = (ms) => Y1 - (ms - lo) / (hi - lo) * (Y1 - Y0);
      for (let g = 0; g <= 4; g++) {
        const v = lo + (hi - lo) * g / 4, y = sy(v);
        S('line', { x1: X0, y1: y, x2: X1, y2: y, class: 'grid' }, svg);
        S('text', { x: X0 - 6, y: y + 4, class: 't-sm muted', 'text-anchor': 'end' }, svg, v.toFixed(v < 10 ? 2 : 1));
      }
      const ticks = [...new Set([1, Math.ceil(r.pts.length / 4), Math.ceil(r.pts.length / 2), Math.ceil(3 * r.pts.length / 4), r.pts.length])];
      ticks.forEach((i) => S('text', { x: sx(i), y: Y1 + 16, class: 't-sm muted', 'text-anchor': 'middle' }, svg, String(i)));
      S('text', { x: X1, y: Y1 + 32, class: 't-sm muted', 'text-anchor': 'end' }, svg, 'number of chunks');
      S('text', { x: 0, y: 11, class: 't-sm muted' }, svg, 'estimated ms');
      S('path', { d: r.pts.map((p, j) => `${j ? 'L' : 'M'}${sx(p.i)},${sy(p.t * 1e3)}`).join(' '), class: 'line-local' }, svg);
      const bp = r.pts[r.best - 1];
      S('circle', { cx: sx(bp.i), cy: sy(bp.t * 1e3), r: 5.5, class: 'pt-best' }, svg);
      const lx = Math.min(sx(bp.i) + 10, X1 - 150);
      S('text', { x: lx, y: Math.min(sy(bp.t * 1e3) + 20, Y1 - 6), class: 't-sm' }, svg, `best: ${bp.i} chunk${bp.i > 1 ? 's' : ''}, ${(bp.t * 1e3).toFixed(2)} ms`);
      const hair = S('line', { x1: 0, y1: Y0, x2: 0, y2: Y1, class: 'hair', visibility: 'hidden' }, svg);
      const hit = S('rect', { x: X0 - 8, y: Y0, width: X1 - X0 + 16, height: Y1 - Y0, fill: 'transparent' }, svg);
      hit.addEventListener('mousemove', (ev) => {
        const box = svg.getBoundingClientRect();
        const ux = (ev.clientX - box.left) / box.width * 640;
        const i = Math.max(1, Math.min(r.pts.length, Math.round((ux - X0) / (X1 - X0) * (r.pts.length - 1) + 1)));
        const p = r.pts[i - 1];
        hair.setAttribute('x1', sx(i)); hair.setAttribute('x2', sx(i)); hair.setAttribute('visibility', 'visible');
        showTip(`${p.i} chunk${p.i > 1 ? 's' : ''} · ${(p.t * 1e3).toFixed(3)} ms · ${p.bound}-bound`, ev);
      });
      hit.addEventListener('mouseleave', () => { hair.setAttribute('visibility', 'hidden'); hideTip(); });
    }

    function update() {
      shardOut.textContent = shard.value + ' MiB';
      const r = compute();
      draw(r);
      note.hidden = r.imax > 0;
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Chunks · chunk size', 'chunk 数 · 大小')}</span><span class="v">${r.numChunks} · ${fmtBytes(r.chunk)}</span><span class="s">${bi('aligned to 8 QPs × 64 B', '按 8 个 QP × 64 B 对齐')}</span></div>
        <div class="readout"><span class="k">push_t</span><span class="v">${(r.pushT * 1e3).toFixed(2)} ms</span><span class="s">${bi(`local shard to ${r.nvl - 1} NVLink peers`, `本地分片推给 ${r.nvl - 1} 个 NVLink peer`)}</span></div>
        <div class="readout"><span class="k">rdma_t</span><span class="v">${(r.rdmaT * 1e3).toFixed(2)} ms</span><span class="s">${bi(`shard to ${r.rdma - 1} rail peers`, `分片发往 ${r.rdma - 1} 个 rail peer`)}</span></div>
        <div class="readout"><span class="k">forward_t</span><span class="v">${(r.fwdT * 1e3).toFixed(2)} ms</span><span class="s">${bi('copy-engine forwarding of remote shards', 'copy engine 转发远端分片')}</span></div>`;
    }

    [shard, rdmaSel, nvlSel, nvlGbs, rdmaGbs].forEach((el) => el.addEventListener('input', update));
    update();
  }

  const al = document.getElementById('alloc'); if (al) initAlloc(al);
  const cx = document.getElementById('explorer'); if (cx) initExplorer(cx);
  const cr = document.getElementById('credit'); if (cr) initCredit(cr);
  const pl = document.getElementById('planner'); if (pl) initPlanner(pl);
})();
