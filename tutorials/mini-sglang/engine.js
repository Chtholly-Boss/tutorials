// Mini-SGLang chapter 03 widgets: KV-pool sizing, CUDA graph capture/replay,
// attention-backend selection, and per-batch attention metadata.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const GiB = 1024 ** 3;
  const num = (x) => x.toLocaleString('en-US');
  const gib = (b) => (b / GiB).toFixed(2) + ' GiB';
  const align = (x, a) => Math.ceil(x / a) * a;

  function S(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function pulse(el) {
    if (!el || reduceMotion) return;
    el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
  }

  // div_even from minisgl/utils/misc.py
  function divEven(a, b, allowReplicate) {
    if (allowReplicate && b > a) {
      if (b % a !== 0) throw new Error(`${b} must be divisible by ${a} for KV head replication`);
      return 1;
    }
    if (a % b !== 0) throw new Error(`${a} must be divisible by ${b}`);
    return a / b;
  }

  // Example model shapes (Hugging Face configs; not part of the repository)
  const MODELS = {
    'qwen3-0.6b': { name: 'Qwen3-0.6B', layers: 28, qHeads: 16, kvHeads: 8, headDim: 128, maxPos: 40960, weightsGiB: 1.11 },
    'qwen3-14b': { name: 'Qwen3-14B', layers: 40, qHeads: 40, kvHeads: 8, headDim: 128, maxPos: 40960, weightsGiB: 27.6 },
    'qwen3-32b': { name: 'Qwen3-32B', layers: 64, qHeads: 64, kvHeads: 8, headDim: 128, maxPos: 40960, weightsGiB: 61.1 },
    'llama-8b': { name: 'Llama-3.1-8B', layers: 32, qHeads: 32, kvHeads: 8, headDim: 128, maxPos: 131072, weightsGiB: 14.96 },
    'llama-70b': { name: 'Llama-3.1-70B', layers: 80, qHeads: 64, kvHeads: 8, headDim: 128, maxPos: 131072, weightsGiB: 131.4 }
  };

  // =====================================================================
  // 1. KV-pool sizing: Engine._determine_num_pages
  // =====================================================================
  function initKV(host) {
    const f = (id) => $('#' + id, host);
    const model = f('kv-model'), gpu = f('kv-gpu'), free = f('kv-free'), tp = f('kv-tp');
    const page = f('kv-page'), ratio = f('kv-ratio'), ratioOut = f('kv-ratio-out'), weights = f('kv-weights');
    const svg = $('svg', host), readouts = $('.readouts', host), err = $('.kv-err', host);
    const GPUS = { h100: 78.7, h200: 130.5 };

    function applyPreset() {
      weights.value = MODELS[model.value].weightsGiB;
      update();
    }
    function applyGpu() {
      if (GPUS[gpu.value] != null) free.value = GPUS[gpu.value];
      update();
    }

    function update() {
      ratioOut.textContent = (+ratio.value).toFixed(2);
      const m = MODELS[model.value];
      const tpSize = +tp.value, ps = +page.value, r = +ratio.value;
      const freeB = Math.round(+free.value * GiB);
      const modelB = Math.round((+weights.value / tpSize) * GiB);
      svg.innerHTML = '';
      let kvLocal;
      try { kvLocal = divEven(m.kvHeads, tpSize, true); divEven(m.qHeads, tpSize, false); }
      catch (e) { err.textContent = 'AssertionError: ' + e.message; readouts.innerHTML = ''; return; }
      const perPage = 2 * m.headDim * kvLocal * ps * 2 * m.layers;
      const available = Math.floor(r * freeB) - modelB;
      const numPages = Math.floor(available / perPage);
      if (!(numPages > 1)) {
        err.textContent = 'AssertionError: Not enough memory for KV cache, try reducing --num-pages';
        readouts.innerHTML = '';
        drawBar(freeB, modelB, 0, r);
        return;
      }
      err.textContent = '';
      const numTokens = numPages * ps;
      const kvB = numPages * perPage;
      const maxSeq = Math.min(m.maxPos, numTokens);
      const tableB = (256 + 1) * align(maxSeq, 32) * 4;
      const headroom = freeB - modelB - kvB;
      const graphBs = +free.value > 80 ? 256 : 160;
      drawBar(freeB, modelB, kvB, r);
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('KV tokens', 'KV token 数')}</span><span class="v">${num(numTokens)}</span><span class="s">${bi(`${num(numPages)} pages × ${ps}`, `${num(numPages)} 页 × ${ps}`)}</span></div>
        <div class="readout"><span class="k">${bi('Bytes per token', '每 token 字节数')}</span><span class="v">${num(perPage / ps)} B</span><span class="s">2 × ${m.headDim} × ${kvLocal} × 2 B × ${m.layers}</span></div>
        <div class="readout"><span class="k">${bi('K + V pool', 'K + V 池')}</span><span class="v">${gib(kvB)}</span><span class="s">${bi('plus one dummy page', '另加一个 dummy 页')}</span></div>
        <div class="readout"><span class="k">max_seq_len</span><span class="v">${num(maxSeq)}</span><span class="s">min(${num(m.maxPos)}, ${num(numTokens)})</span></div>
        <div class="readout"><span class="k">${bi('Page table', 'page table')}</span><span class="v">${(tableB / 1048576).toFixed(1)} MiB</span><span class="s">257 × ${num(align(maxSeq, 32))} × int32</span></div>
        <div class="readout key"><span class="k">${bi('Left after KV', 'KV 之后剩余')}</span><span class="v">${gib(headroom)}</span><span class="s">${bi(`graphs, workspaces, activations · auto graph max bs ${graphBs}`, `graph、workspace、激活 · 自动 graph max bs ${graphBs}`)}</span></div>`;
    }

    function drawBar(freeB, modelB, kvB, r) {
      const defs = S('defs', null, svg);
      const pat = S('pattern', { id: 'kv-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      S('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'hatch-line' }, pat);
      const W = 880, y = 34, h = 36;
      const sx = (b) => (Math.max(b, 0) / freeB) * W;
      const wM = Math.min(sx(modelB), W), wK = Math.min(sx(kvB), W - wM), wH = Math.max(W - wM - wK, 0);
      S('text', { x: 0, y: 16, class: 't-sm muted' }, svg, `free memory before loading the model · ${(freeB / GiB).toFixed(1)} GiB (drawn to scale)`);
      S('rect', { x: 0, y, width: wM, height: h, class: 'seg-w' }, svg);
      S('rect', { x: wM, y, width: wK, height: h, class: 'seg-kv' }, svg);
      S('rect', { x: wM + wK, y, width: wH, height: h, class: 'seg-head' }, svg);
      const label = (x, w, t) => { if (w > t.length * 6.6 + 10) S('text', { x: x + 8, y: y + 23, class: 't-sm' }, svg, t); };
      label(0, wM, `weights ${(modelB / GiB).toFixed(1)} GiB`);
      label(wM, wK, `KV pool ${(kvB / GiB).toFixed(1)} GiB`);
      label(wM + wK, wH, 'headroom');
      const rx = r * W;
      S('line', { x1: rx, y1: y - 8, x2: rx, y2: y + h + 8, class: 'ratio-line' }, svg);
      S('text', { x: Math.min(Math.max(rx, 130), W - 130), y: y + h + 24, class: 't-sm', 'text-anchor': 'middle' }, svg, `memory_ratio × free = ${(r * freeB / GiB).toFixed(1)} GiB`);
    }

    model.addEventListener('input', applyPreset);
    gpu.addEventListener('input', applyGpu);
    [free, tp, page, ratio, weights].forEach((el) => el.addEventListener('input', () => {
      if (el === free) gpu.value = 'custom';
      update();
    }));
    applyPreset();
  }

  // =====================================================================
  // 2. CUDA graphs: _determine_cuda_graph_bs, pad_batch, can_use_cuda_graph
  // =====================================================================
  function initGraph(host) {
    const f = (id) => $('#' + id, host);
    const mode = f('gx-mode'), maxIn = f('gx-max'), phase = f('gx-phase'), bs = f('gx-bs'), bsOut = f('gx-bs-out');
    const chips = $('.gx-chips', host), real = $('.gx-pad .real', host), dummy = $('.gx-pad .dummy', host);
    const padL = $('.gx-pad-l', host), readouts = $('.readouts', host), svg = $('svg', host), runBtn = f('gx-run');

    function graphSizes() {
      let max;
      if (mode.value === 'auto160') max = 160;
      else if (mode.value === 'auto256') max = 256;
      else max = +maxIn.value;
      if (max < 1) return [];
      const list = [1, 2, 4];
      for (let b = 8; b <= max; b += 8) list.push(b);
      return list;
    }

    function state() {
      const list = graphSizes();
      const maxBs = list.length ? Math.max(...list) : 0;
      const size = +bs.value;
      const isDecode = phase.value === 'decode';
      const canUse = isDecode && size <= maxBs;
      const padded = canUse ? list.find((b) => b >= size) : size;
      let reason;
      if (!list.length) reason = bi('CUDA graphs are disabled (max bs < 1)', 'CUDA graph 已关闭（max bs < 1）');
      else if (!isDecode) reason = bi('prefill always runs eagerly', 'prefill 总是 eager 执行');
      else if (!canUse) reason = bi(`batch ${size} is larger than the largest graph (${maxBs})`, `batch ${size} 超过最大的 graph（${maxBs}）`);
      else reason = bi(`replay the graph captured for bs = ${padded}`, `重放为 bs = ${padded} 捕获的 graph`);
      return { list, maxBs, size, canUse, padded, reason };
    }

    function update() {
      maxIn.disabled = mode.value !== 'custom';
      bsOut.textContent = bs.value;
      const s = state();
      chips.innerHTML = s.list.length
        ? s.list.map((b) => `<span class="gx-chip${s.canUse && b === s.padded ? ' hit' : b < s.size ? ' small' : ''}">${b}</span>`).join('')
        : `<span class="gx-none">${bi('no graphs captured', '没有捕获 graph')}</span>`;
      const pad = s.padded - s.size;
      real.style.width = (100 * s.size / s.padded) + '%';
      dummy.style.width = (100 * pad / s.padded) + '%';
      padL.innerHTML = `<span>${bi(`${s.size} real requests`, `${s.size} 个真实请求`)}</span><span>${bi(`${pad} dummy`, `${pad} 个 dummy`)}</span>`;
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Path', '路径')}</span><span class="v">${s.canUse ? 'graph.replay()' : 'model.forward()'}</span><span class="s">${s.reason}</span></div>
        <div class="readout"><span class="k">padded_size</span><span class="v">${s.padded}</span><span class="s">${bi('first captured size ≥ batch', '第一个 ≥ batch 的捕获尺寸')}</span></div>
        <div class="readout"><span class="k">${bi('Padding', '填充')}</span><span class="v">${(100 * pad / s.padded).toFixed(1)}%</span><span class="s">${bi(`${pad} rows point at the dummy page`, `${pad} 行指向 dummy 页`)}</span></div>
        <div class="readout"><span class="k">${bi('Graphs captured', '捕获的 graph 数')}</span><span class="v">${s.list.length}</span><span class="s">${bi('largest first, one shared memory pool', '从大到小，共用一个内存池')}</span></div>`;
      drawTimeline(s, false);
    }

    // Schematic timeline: 24 kernels. Widths are illustrative, not measured.
    function drawTimeline(s, animate) {
      svg.innerHTML = '';
      const K = 24, launch = 13, kernel = 6 + Math.min(s.size, 256) * 0.06, X0 = 96;
      const row = (Y, title) => {
        S('text', { x: 0, y: Y + 12, class: 't-lg' }, svg, title);
        S('text', { x: 0, y: Y + 34, class: 't-sm muted' }, svg, 'CPU');
        S('line', { x1: X0, y1: Y + 44, x2: 880, y2: Y + 44, class: 'lane' }, svg);
        S('text', { x: 0, y: Y + 62, class: 't-sm muted' }, svg, 'GPU');
      };
      const E = 6, R = 92;
      row(E, 'eager');
      row(R, 'replay');
      // eager: every kernel launched from Python
      let cpu = X0, gpu = X0;
      for (let i = 0; i < K; i++) {
        S('rect', { x: cpu, y: E + 24, width: launch - 2, height: 14, rx: 2, class: 'k-cpu' }, svg);
        const start = Math.max(cpu + launch, gpu);
        S('rect', { x: start, y: E + 52, width: kernel - 1.5, height: 14, rx: 2, class: 'k-gpu' }, svg);
        cpu += launch; gpu = start + kernel;
      }
      const eagerEnd = gpu;
      S('text', { x: Math.min(eagerEnd + 8, 800), y: E + 63, class: 't-sm' }, svg, `done at ${Math.round(eagerEnd - X0)}`);
      if (!s.canUse) {
        S('text', { x: X0, y: R + 34, class: 't-sm muted' }, svg, 'not eligible: this batch runs eagerly');
      } else {
        // replay: copy_from + prepare_for_replay + one launch
        S('rect', { x: X0, y: R + 24, width: 30, height: 14, rx: 2, class: 'k-cpu' }, svg);
        S('rect', { x: X0 + 32, y: R + 24, width: 30, height: 14, rx: 2, class: 'k-cpu' }, svg);
        S('rect', { x: X0 + 64, y: R + 24, width: 14, height: 14, rx: 2, class: 'k-cpu' }, svg);
        S('text', { x: X0 + 86, y: R + 35, class: 't-sm muted' }, svg, 'copy_from · prepare_for_replay · g.replay()');
        let g2 = X0 + 78;
        for (let i = 0; i < K; i++) {
          S('rect', { x: g2, y: R + 52, width: kernel - 1.5, height: 14, rx: 2, class: 'k-gpu' }, svg);
          g2 += kernel;
        }
        S('text', { x: Math.min(g2 + 8, 800), y: R + 63, class: 't-sm' }, svg, `done at ${Math.round(g2 - X0)}`);
        if (animate && !reduceMotion) {
          [[E, eagerEnd], [R, g2]].forEach(([Y, end]) => {
            const line = S('line', { x1: 0, y1: Y + 18, x2: 0, y2: Y + 70, class: 'head-line' }, svg);
            line.animate([{ transform: `translateX(${X0}px)` }, { transform: `translateX(${end}px)` }],
              { duration: 1600 * (end - X0) / Math.max(eagerEnd - X0, 1), easing: 'linear', fill: 'forwards' });
          });
        }
        return;
      }
      if (animate && !reduceMotion) {
        const line = S('line', { x1: 0, y1: E + 18, x2: 0, y2: E + 70, class: 'head-line' }, svg);
        line.animate([{ transform: `translateX(${X0}px)` }, { transform: `translateX(${eagerEnd}px)` }], { duration: 1600, easing: 'linear', fill: 'forwards' });
      }
    }

    [mode, maxIn, phase, bs].forEach((el) => el.addEventListener('input', update));
    runBtn.addEventListener('click', () => drawTimeline(state(), true));
    update();
  }

  // =====================================================================
  // 3. Attention backend selection: _adjust_config + create_attention_backend
  // =====================================================================
  function initAttn(host) {
    const f = (id) => $('#' + id, host);
    const arch = f('ax-arch'), attn = f('ax-attn'), page = f('ax-page'), gqa = f('ax-gqa');
    const steps = $('.ax-steps', host), readouts = $('.readouts', host);
    const SUPPORTED = ['trtllm', 'fi', 'fa'];

    function resolve() {
      const cap = +arch.value;               // e.g. 9.0
      const sm90 = cap >= 9.0, sm100 = cap >= 10.0;
      const out = { steps: [], prefill: null, decode: null, page: +page.value, error: null, notes: [] };
      let backend = attn.value;

      // argparse: validate_attn_backend
      if (backend !== 'auto') {
        const bad = backend.split(',').filter((b) => !SUPPORTED.includes(b));
        if (bad.length) {
          out.steps.push({ cls: 'err', en: `<code>--attn ${backend}</code> fails at argument parsing: <code>${bad[0]}</code> is not a registered backend.`, zh: `<code>--attn ${backend}</code> 在参数解析时失败：<code>${bad[0]}</code> 不是已注册的 backend。` });
          out.error = true;
          return out;
        }
        out.steps.push({ cls: 'skip', en: 'Not <code>auto</code>: the value is kept as given.', zh: '不是 <code>auto</code>：保持原值。' });
      } else {
        backend = sm100 ? 'trtllm' : (sm90 ? 'fa,fi' : 'fi');
        out.steps.push({ cls: 'on', en: `<code>auto</code> resolves to <code>${backend}</code> (${sm100 ? 'capability ≥ 10.0' : sm90 ? 'capability ≥ 9.0' : 'below 9.0'}).`, zh: `<code>auto</code> 解析为 <code>${backend}</code>（${sm100 ? 'capability ≥ 10.0' : sm90 ? 'capability ≥ 9.0' : '低于 9.0'}）。` });
      }

      if (backend.includes('trtllm') && ![16, 32, 64].includes(out.page)) {
        out.steps.push({ cls: 'on', en: `TRT-LLM needs page size 16, 32 or 64: <code>page_size</code> ${out.page} → 64.`, zh: `TRT-LLM 需要页大小 16、32 或 64：<code>page_size</code> ${out.page} → 64。` });
        out.page = 64;
      } else {
        out.steps.push({ cls: 'skip', en: `Page size stays ${out.page}.`, zh: `页大小保持 ${out.page}。` });
      }

      if (backend.includes(',')) {
        if ((backend.match(/,/g) || []).length !== 1) {
          out.steps.push({ cls: 'err', en: 'AssertionError: Only one comma is allowed in hybrid backend.', zh: 'AssertionError：hybrid backend 中只允许一个逗号。' });
          out.error = true;
          return out;
        }
        const [p, d] = backend.split(',');
        if (p !== d) {
          out.prefill = p; out.decode = d;
          out.steps.push({ cls: 'on', en: `Two different names: <code>HybridBackend(prefill=${p}, decode=${d})</code>. Graph capture and replay go to the decode backend.`, zh: `两个不同的名字：<code>HybridBackend(prefill=${p}, decode=${d})</code>。graph 的捕获与重放交给 decode backend。` });
        } else {
          out.prefill = out.decode = p;
          out.steps.push({ cls: 'on', en: `Both halves are <code>${p}</code>: a warning, then a single backend.`, zh: `两半都是 <code>${p}</code>：打出警告，然后使用单一 backend。` });
        }
      } else {
        out.prefill = out.decode = backend;
        out.steps.push({ cls: 'on', en: `Single backend <code>${backend}</code> for both phases.`, zh: `两个阶段共用单一 backend <code>${backend}</code>。` });
      }

      const describe = (b, role) => {
        if (b === 'fa') return `FlashAttention ${sm100 ? 4 : 3} (sgl_kernel)`;
        if (b === 'trtllm') return role === 'prefill' ? 'trtllm_batch_context_with_kv_cache' : 'trtllm_batch_decode_with_kv_cache';
        if (b === 'fi') return role === 'prefill' ? 'FlashInfer prefill (fa2)' : `FlashInfer decode (fa2, tensor cores ${+gqa.value >= 4 ? 'on' : 'off'})`;
        return b;
      };
      out.prefillDesc = describe(out.prefill, 'prefill');
      out.decodeDesc = describe(out.decode, 'decode');
      if (out.prefill === 'fi' || out.decode === 'fi') out.notes.push(bi('FlashInfer always plans with page size 1 over raw token locations.', 'FlashInfer 始终以页大小 1、按原始 token 位置做 plan。'));
      if (sm100 && cap >= 12.0) out.notes.push(bi('Capability 12.x also passes the ≥ 10.0 check.', 'capability 12.x 同样通过 ≥ 10.0 的检查。'));
      return out;
    }

    function update() {
      const r = resolve();
      steps.innerHTML = r.steps.map((s, i) => `<li class="${s.cls}"><span class="n">${i + 1}</span><span>${bi(s.en, s.zh)}</span></li>`).join('');
      if (!reduceMotion) $$('li', steps).forEach((li, i) => li.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: li.classList.contains('skip') ? 0.5 : 1, transform: 'none' }], { duration: 260, delay: i * 90, fill: 'backwards', easing: 'ease-out' }));
      if (r.error) {
        readouts.innerHTML = `<div class="readout"><span class="k">${bi('Result', '结果')}</span><span class="v">${bi('no engine', '无法启动')}</span></div>`;
        return;
      }
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Prefill', 'Prefill')}</span><span class="v">${r.prefill}</span><span class="s">${r.prefillDesc}</span></div>
        <div class="readout key"><span class="k">${bi('Decode + CUDA graphs', 'Decode 与 CUDA graph')}</span><span class="v">${r.decode}</span><span class="s">${r.decodeDesc}</span></div>
        <div class="readout"><span class="k">page_size</span><span class="v">${r.page}</span><span class="s">${r.notes.join(' ') || '&nbsp;'}</span></div>`;
    }

    [arch, attn, page, gqa].forEach((el) => el.addEventListener('input', update));
    update();
  }

  // =====================================================================
  // 4. Attention metadata for one batch (fa.py / trtllm.py / fi.py prepare_metadata)
  // =====================================================================
  function initMeta(host) {
    const f = (id) => $('#' + id, host);
    const preset = f('mx-preset'), page = f('mx-page');
    const inputs = [0, 1, 2].map((i) => ({ c: f(`mx-c${i}`), d: f(`mx-d${i}`) }));
    const out = $('.mx-grid', host), err = $('.mx-err', host);
    const PRESETS = {
      decode: [[11, 12], [6, 7], [17, 18]],
      fresh: [[0, 7], [0, 4], [0, 9]],
      prefix: [[8, 12], [0, 5], [8, 10]]
    };

    function setPreset() {
      const p = PRESETS[preset.value];
      if (!p) return;
      p.forEach(([c, d], i) => { inputs[i].c.value = c; inputs[i].d.value = d; });
      update();
    }

    function cells(values, cls, extra) {
      return values.map((v, i) => `<span class="mx-cell ${typeof cls === 'function' ? cls(i) : (cls || '')}">${v}</span>`).join('') + (extra || '');
    }

    function update() {
      const ps = +page.value;
      const reqs = inputs.map((x) => ({ cached: +x.c.value, dev: +x.d.value }));
      const bad = reqs.findIndex((r) => !(r.cached >= 0 && r.cached < r.dev));
      if (bad >= 0) {
        err.textContent = `req ${bad}: need 0 ≤ cached_len < device_len`;
        out.innerHTML = '';
        return;
      }
      err.textContent = '';
      // Illustrative allocation: each request owns whole pages taken from a shuffled free list.
      const freePages = [5, 2, 9, 0, 7, 3, 11, 6, 1, 10, 4, 8, 14, 12, 13, 15, 17, 16, 19, 18, 21, 20, 23, 22, 25, 24];
      let next = 0;
      const locs = reqs.map((r) => {
        const pages = [];
        for (let i = 0; i < Math.ceil(r.dev / ps); i++) pages.push(freePages[next++ % freePages.length]);
        return Array.from({ length: r.dev }, (_, i) => pages[Math.floor(i / ps)] * ps + (i % ps));
      });
      const q = reqs.map((r) => r.dev - r.cached), k = reqs.map((r) => r.dev);
      const cum = (a) => a.reduce((acc, v) => (acc.push(acc[acc.length - 1] + v), acc), [0]);
      const maxQ = Math.max(...q), maxK = Math.max(...k);
      let cuQ, caseTxt;
      if (maxQ === 1) { cuQ = Array.from({ length: reqs.length + 1 }, (_, i) => i); caseTxt = bi('decode: arange', 'decode：arange'); }
      else if (reqs.every((r) => r.cached === 0)) { cuQ = cum(k); caseTxt = bi('no cache hit: = cu_seqlens_k', '无缓存命中：= cu_seqlens_k'); }
      else { cuQ = cum(q); caseTxt = bi('partial hit: cumsum(extend_len)', '部分命中：cumsum(extend_len)'); }
      const cuK = cum(k);

      const tableRows = locs.map((row, r) => {
        const shown = row.map((v, i) => `<span class="mx-cell r${r}${i < reqs[r].cached ? ' cached' : ''}">${v}</span>`).join('');
        return `<span class="mx-rowlbl">r${r}</span>${shown}`;
      }).join('<span style="flex-basis:100%;height:0"></span>');

      const faRows = locs.map((row, r) => {
        const vals = [];
        for (let i = 0; i < maxK; i += ps) vals.push(i < row.length ? `<span class="mx-cell r${r}">${Math.floor(row[i] / ps)}</span>` : '<span class="mx-cell unused">·</span>');
        return `<span class="mx-rowlbl">r${r}</span>${vals.join('')}`;
      }).join('<span style="flex-basis:100%;height:0"></span>');

      const fiIdx = locs.map((row, r) => row.map((v) => `<span class="mx-cell r${r}">${v}</span>`).join('')).join('<span class="mx-sep"></span>');
      const last = cuQ.slice(1).map((v) => v - 1);
      const isPrefill = maxQ > 1;

      out.innerHTML = `
        <span class="k">${bi('global page_table rows', '全局 page_table 行')}</span><span class="v">${tableRows}</span>
        <span class="k">seqlens_q (extend_len)</span><span class="v">${cells(q, (i) => 'r' + i)}</span>
        <span class="k">seqlens_k (device_len)</span><span class="v">${cells(k, (i) => 'r' + i)}</span>
        <span class="k">cu_seqlens_k</span><span class="v">${cells(cuK)}</span>
        <span class="k">cu_seqlens_q</span><span class="v">${cells(cuQ)}<span class="mx-case">${caseTxt}</span></span>
        <span class="k">max_seqlen_q · max_seqlen_k</span><span class="v"><span class="mx-cell">${maxQ}</span><span class="mx-cell">${maxK}</span></span>
        <span class="k">FA / TRT-LLM page_table</span><span class="v">${faRows}</span>
        <span class="k">FlashInfer indices</span><span class="v">${fiIdx}</span>
        <span class="k">${bi('LM head rows', 'LM head 取的行')}</span><span class="v">${isPrefill ? cells(last) : `<span class="mx-cell unused">${bi('decode: every row', 'decode：全部行')}</span>`}</span>`;
      $$('.mx-cell', out).forEach(pulse);
    }

    preset.addEventListener('input', setPreset);
    page.addEventListener('input', update);
    inputs.forEach(({ c, d }) => [c, d].forEach((el) => el.addEventListener('input', () => { preset.value = 'custom'; update(); })));
    setPreset();
  }

  const kv = document.getElementById('kvcalc'); if (kv) initKV(kv);
  const gx = document.getElementById('graphx'); if (gx) initGraph(gx);
  const ax = document.getElementById('attnx'); if (ax) initAttn(ax);
  const mx = document.getElementById('metax'); if (mx) initMeta(mx);
})();
