// ATREX overview widgets: dispatch explorer, JIT build identity, test selection.
// Every rule here mirrors a check in alibaba/atrex-kernels @ 8ca113d; the
// citation next to each row links to it.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const SHA = '8ca113d5933595520baff1660c3a9751f0cd5dfc';
  const src = (path, a, b) =>
    `<a class="src" href="https://github.com/alibaba/atrex-kernels/blob/${SHA}/${path}#L${a}-L${b}">${path.split('/').pop()}:${a}–${b}</a>`;
  const num = (x) => Number(x).toLocaleString('en-US');
  const major = (v) => { const m = /^(\d+)/.exec(v || ''); return m ? +m[1] : 0; };

  const API_FA = 'python/atrex/api/flash_attn.py';
  const LAUNCH_FA = 'src/nvidia/flash_attn/sm103/launch.py';
  const API_GDN = 'python/atrex/api/chunk_gdn_cutedsl.py';
  const API_MOE = 'python/atrex/api/nvfp4_fused_moe.py';
  const MOE120 = 'python/atrex/api/nvfp4_fused_moe_sm120.py';
  const DEV = 'python/atrex/utils/device_target.py';

  // ---------------------------------------------------------------------
  // Device presets and detect_device_target()
  // ---------------------------------------------------------------------
  const DEVICES = {
    'nv103-13': { name: 'NVIDIA … (capability 10.3)', hip: null, cuda: '13.0', cap: [10, 3] },
    'nv103-12': { name: 'NVIDIA … (capability 10.3)', hip: null, cuda: '12.9', cap: [10, 3] },
    'nv120': { name: 'NVIDIA … (capability 12.0)', hip: null, cuda: '12.9', cap: [12, 0] },
    'nv90': { name: 'NVIDIA H200', hip: null, cuda: '12.8', cap: [9, 0] },
    'amd': { name: 'AMD Instinct MI308X', hip: '7.2.26015', cuda: null, cap: [9, 4], gfx: 'gfx942:sramecc+:xnack-' },
    'ppu': { name: 'ZW-M890P', hip: null, cuda: '13.0', cap: [8, 9] }
  };
  const PPU = { 'ZW-M890P': 'zwm890p' };

  function detect(d) {
    if (d.hip !== null) {
      return { family: 'amd', arch: d.gfx.split(':')[0], runtime: d.hip,
        why: bi(`<code>torch.version.hip</code> is set, so ROCm wins before any CUDA check`, `<code>torch.version.hip</code> 有值，因此先判定为 ROCm，不再做任何 CUDA 判断`), cite: src(DEV, 51, 54) };
    }
    if (PPU[d.name]) {
      return { family: 'alibaba_ppu', arch: PPU[d.name], runtime: d.cuda,
        why: bi(`exact PPU product name, even though it reports capability ${d.cap.join('.')}`, `精确匹配 PPU 产品名，尽管它报告的 capability 是 ${d.cap.join('.')}`), cite: src(DEV, 56, 60) };
    }
    if (d.cuda !== null && d.name.toUpperCase().startsWith('NVIDIA ')) {
      return { family: 'nvidia', arch: `sm${d.cap[0]}${d.cap[1]}`, runtime: d.cuda,
        why: bi(`CUDA runtime present and the name starts with "NVIDIA ", so the capability names the arch`, `存在 CUDA runtime 且名称以 "NVIDIA " 开头，因此由 capability 决定 arch`), cite: src(DEV, 62, 64) };
    }
    return { family: 'unknown', arch: 'unknown', runtime: null, why: 'no rule matched', cite: src(DEV, 66, 66) };
  }

  // ---------------------------------------------------------------------
  // Operator policies
  // ---------------------------------------------------------------------
  const SHAPES = {
    s1: [256, 8, 2048, 512], s2: [256, 8, 2048, 256], s3: [128, 8, 2048, 768],
    s4: [128, 8, 2048, 384], s5: [512, 10, 2560, 320]
  };
  const isE512 = (E, k, h, i) => E === 512 && k === 10 && h === 2560 && i === 320;
  const validated = (E, k, h, i) => isE512(E, k, h, i) || (k === 8 && h === 2048 &&
    ((E === 256 && (i === 512 || i === 256)) || (E === 128 && (i === 768 || i === 384))));

  function gdnDirectOK(t, hv, ofs) {
    if (t <= 0) return false;
    if (ofs) {
      if (t % 32 !== 0) return hv === 48 && t >= 4096 && t < 32768;
      return t < 65536;
    }
    return t < 32768;
  }

  const OPS = {
    fa: {
      api: 'atrex.flash_attn_varlen_func',
      params: [
        { id: 'dtype', label: 'q/k/v dtype', type: 'select', options: [['bf16', 'bfloat16'], ['fp16', 'float16']], value: 'bf16' },
        { id: 'batch', label: 'batch', type: 'number', min: 1, max: 64, value: 20 },
        { id: 'sq', label: 'max_seqlen_q', type: 'number', min: 1, max: 8, value: 4 },
        { id: 'qh', label: 'q heads', type: 'select', options: [[8, '8'], [16, '16'], [32, '32']], value: 16 },
        { id: 'kvh', label: 'kv heads', type: 'select', options: [[1, '1'], [2, '2'], [4, '4']], value: 1 },
        { id: 'hd', label: 'head dim', type: 'select', options: [[128, '128'], [256, '256']], value: 256 },
        { id: 'page', label: 'page size', type: 'select', options: [[64, '64'], [128, '128'], [256, '256']], value: 128 },
        { id: 'splits', label: 'num_splits', type: 'select', options: [[0, '0'], [1, '1 (API default)'], [2, '2']], value: 0 },
        { id: 'causal', label: 'causal', type: 'check', value: true },
        { id: 'lse', label: 'return_lse', type: 'check', value: false }
      ],
      checks(t, p) {
        return [
          { en: 'Detected target is nvidia/sm103', zh: '检测到的目标是 nvidia/sm103', cite: src(API_FA, 49, 51), ok: t.family === 'nvidia' && t.arch === 'sm103' },
          { en: 'CUDA runtime major version ≥ 13', zh: 'CUDA runtime 主版本 ≥ 13', cite: src(LAUNCH_FA, 44, 50), ok: major(t.runtime) >= 13 },
          { en: 'q, k and v are bfloat16', zh: 'q、k、v 均为 bfloat16', cite: src(LAUNCH_FA, 51, 52), ok: p.dtype === 'bf16' },
          { en: 'q is [tokens, 16 heads, 256]', zh: 'q 形状为 [tokens, 16 heads, 256]', cite: src(LAUNCH_FA, 55, 56), ok: +p.qh === 16 && +p.hd === 256 },
          { en: 'KV pages are [pages, 128, 1 head, 256]', zh: 'KV page 形状为 [pages, 128, 1 head, 256]', cite: src(LAUNCH_FA, 57, 62), ok: +p.page === 128 && +p.kvh === 1 && +p.hd === 256 },
          { en: 'batch size is 16 to 28', zh: 'batch 在 16 到 28 之间', cite: src(LAUNCH_FA, 72, 74), ok: p.batch >= 16 && p.batch <= 28 },
          { en: 'max_seqlen_q is exactly 4', zh: 'max_seqlen_q 恰好为 4', cite: src(LAUNCH_FA, 75, 78), ok: +p.sq === 4 },
          { en: 'causal=True', zh: 'causal=True', cite: src(LAUNCH_FA, 116, 117), ok: !!p.causal },
          { en: 'return_lse=False', zh: 'return_lse=False', cite: src(LAUNCH_FA, 128, 129), ok: !p.lse },
          { en: 'num_splits is 0 (the signature default is 1)', zh: 'num_splits 为 0（函数签名默认值是 1）', cite: src(LAUNCH_FA, 130, 131), ok: +p.splits === 0 }
        ];
      },
      result(t, p, rows, failAt) {
        if (failAt < 0) return {
          kind: 'ok', v: 'atrex_aka_fa4_decode(…)',
          body: bi('Compiled once per (device, capability), then launched as two kernels: the paged GQA decode and its split reduction, both named <code>atrex_aka_*</code>.',
                   '每个（device, capability）只编译一次，随后以两个 kernel 运行：分页 GQA decode 与其 split 规约，二者都以 <code>atrex_aka_*</code> 命名。'),
          cite: src('src/nvidia/flash_attn/sm103/aka_decode_runtime.py', 250, 265)
        };
        return {
          kind: 'reject', v: 'can_use_flash_attn_varlen_func(…) → False',
          body: bi('Calling <code>flash_attn_varlen_func</code> anyway raises <code>NotImplementedError</code> before any kernel launches, so the caller keeps its own FA4 backend.',
                   '若仍调用 <code>flash_attn_varlen_func</code>，会在任何 kernel 启动前抛出 <code>NotImplementedError</code>，调用方继续使用自己的 FA4 后端。'),
          cite: src(LAUNCH_FA, 215, 218)
        };
      }
    },

    gdn: {
      api: 'atrex.chunk_gdn_fwd_cutedsl',
      params: [
        { id: 'h', label: 'H (q/k heads)', type: 'select', options: [[4, '4'], [8, '8'], [16, '16']], value: 4 },
        { id: 'hv', label: 'HV (v heads)', type: 'select', options: [[32, '32'], [48, '48'], [64, '64']], value: 32 },
        { id: 'kd', label: 'K = V', type: 'select', options: [[64, '64'], [128, '128']], value: 128 },
        { id: 'gdt', label: 'g / beta dtype', type: 'select', options: [['fp32', 'float32'], ['bf16', 'bfloat16']], value: 'fp32' },
        { id: 't', label: 'total tokens T', type: 'number', min: 1, max: 131072, value: 8192 },
        { id: 'seqs', label: 'sequences', type: 'number', min: 1, max: 32, value: 4 },
        { id: 'cu', label: 'pass cu_seqlens', type: 'check', value: true },
        { id: 'ofs', label: 'output_final_state', type: 'check', value: true },
        { id: 'l2', label: 'use_qk_l2norm_in_kernel', type: 'check', value: true },
        { id: 'ckpt', label: 'state checkpoints', type: 'check', value: false },
        { id: 'graph', label: 'capturing a CUDA Graph', type: 'check', value: false }
      ],
      checks(t, p) {
        const seqs = p.cu ? Math.max(1, p.seqs) : 1;
        const rows = [];
        const sel = t.family === 'nvidia' && (t.arch === 'sm103' || t.arch === 'sm120');
        rows.push({ en: 'An NVIDIA SM103 or SM120 implementation module imports', zh: '存在可导入的 NVIDIA SM103 或 SM120 实现模块', cite: src('src/nvidia/chunk_gdn/__init__.py', 8, 23), ok: sel });
        if (!sel) return rows;
        if (t.arch === 'sm103') {
          rows.push({ en: 'Not capturing a CUDA Graph', zh: '当前没有在捕获 CUDA Graph', cite: src(API_GDN, 432, 433), ok: !p.graph });
          rows.push({ en: 'use_qk_l2norm_in_kernel=True', zh: 'use_qk_l2norm_in_kernel=True', cite: src(API_GDN, 434, 435), ok: !!p.l2 });
          rows.push({ en: 'CUDA runtime major version ≥ 13', zh: 'CUDA runtime 主版本 ≥ 13', cite: src(API_GDN, 174, 180), ok: major(t.runtime) >= 13 });
          rows.push({ en: 'q, k, v bfloat16; g and beta float32', zh: 'q、k、v 为 bfloat16；g 与 beta 为 float32', cite: src(API_GDN, 183, 186), ok: p.gdt === 'fp32' });
          rows.push({ en: 'B=1, H=4, HV=32, K=V=128, T ≤ 16,384', zh: 'B=1、H=4、HV=32、K=V=128、T ≤ 16,384', cite: src(API_GDN, 191, 206), ok: +p.h === 4 && +p.hv === 32 && +p.kd === 128 && p.t >= 1 && p.t <= 16384 });
          rows.push({ en: 'No state checkpoints', zh: '不使用 state checkpoint', cite: src(API_GDN, 209, 214), ok: !p.ckpt });
          rows.push({ en: '1 to 16 packed sequences', zh: '1 到 16 条打包序列', cite: src(API_GDN, 219, 221), ok: seqs >= 1 && seqs <= 16 && p.t >= seqs });
        } else {
          const hv = +p.hv, h = +p.h;
          rows.push({ en: 'q, k, v bfloat16; g and beta bfloat16 or float32', zh: 'q、k、v 为 bfloat16；g 与 beta 为 bfloat16 或 float32', cite: src(API_GDN, 120, 123), ok: true });
          rows.push({ en: 'B=1 and K=V=128', zh: 'B=1 且 K=V=128', cite: src(API_GDN, 126, 130), ok: +p.kd === 128 });
          rows.push({ en: 'H ∈ {8, 16}, HV ∈ {32, 48, 64}, HV/H ∈ {2, 3, 4}', zh: 'H ∈ {8, 16}，HV ∈ {32, 48, 64}，HV/H ∈ {2, 3, 4}', cite: src(API_GDN, 131, 137),
            ok: (h === 8 || h === 16) && [32, 48, 64].includes(hv) && hv % h === 0 && [2, 3, 4].includes(hv / h) });
          rows.push({ en: 'use_qk_l2norm_in_kernel=True', zh: 'use_qk_l2norm_in_kernel=True', cite: src(API_GDN, 142, 143), ok: !!p.l2 });
          if (p.cu) {
            rows.push({ en: 'cu_seqlens starts at 0, ends at T, strictly increases', zh: 'cu_seqlens 从 0 开始、到 T 结束且严格递增', cite: src(API_GDN, 311, 321), ok: p.t >= seqs });
          } else {
            const rule = p.ofs ? (p.t % 32 ? 'final state with a T tail needs HV=48 and 4,096 ≤ T < 32,768' : 'T < 65,536') : 'T < 32,768';
            const ruleZh = p.ofs ? (p.t % 32 ? '带尾块且输出 final state 时需 HV=48 且 4,096 ≤ T < 32,768' : 'T < 65,536') : 'T < 32,768';
            rows.push({ en: `Direct single sequence: ${rule}`, zh: `单序列直接调用：${ruleZh}`, cite: src(API_GDN, 248, 262), ok: gdnDirectOK(p.t, hv, p.ofs) });
          }
          rows.push({ en: 'Checkpoints (if any) every multiple of 64 tokens with matching buffers', zh: 'checkpoint（如有）间隔为 64 的倍数且缓冲区匹配', cite: src(API_GDN, 325, 363), ok: true });
        }
        return rows;
      },
      result(t, p, rows, failAt) {
        if (failAt < 0 && t.arch === 'sm103') return {
          kind: 'ok', v: 'atrex_aka_chunk_gated_delta_rule_sm103_m64(…)',
          body: bi('The adapter first runs the fused Q/K L2 normalizer and turns the log gate into <code>exp(g)</code>, then launches the AKA M64 kernel with a zero initial state if none was given.',
                   'adapter 先运行融合的 Q/K L2 归一化，把 log gate 转成 <code>exp(g)</code>，未给初始状态时补零，再启动 AKA M64 kernel。'),
          cite: src(API_GDN, 899, 942)
        };
        if (failAt < 0) return {
          kind: 'ok', v: 'delta_rule_prefill_dsl_sm120(…)',
          body: bi('Every prefill, single or packed, goes to one varlen kernel. Its compile key is only aligned full blocks, initial state, cu_seqlens dtype and checkpointing, so sequence length stays a runtime value.',
                   '所有 prefill（单序列或打包）都走同一个 varlen kernel。它的编译键只含对齐整块、初始状态、cu_seqlens dtype 与 checkpoint，序列长度保持为运行时值。'),
          cite: src(API_GDN, 1059, 1075)
        };
        const graphFail = t.arch === 'sm103' && p.graph;
        return {
          kind: 'reject', v: 'can_use_chunk_gdn_fwd_cutedsl(…) → False',
          body: graphFail
            ? bi('Calling <code>chunk_gdn_fwd_cutedsl</code> during capture raises <code>RuntimeError</code> before metadata sync or launch.', '在捕获期间调用 <code>chunk_gdn_fwd_cutedsl</code> 会在元数据同步与启动前抛出 <code>RuntimeError</code>。')
            : bi('Calling <code>chunk_gdn_fwd_cutedsl</code> anyway fails validation with a <code>ValueError</code> or <code>RuntimeError</code> before any kernel launches.', '若仍调用 <code>chunk_gdn_fwd_cutedsl</code>，会在任何 kernel 启动前因校验失败抛出 <code>ValueError</code> 或 <code>RuntimeError</code>。'),
          cite: graphFail ? src(API_GDN, 651, 657) : src(API_GDN, 880, 898)
        };
      }
    },

    moe: {
      api: 'atrex.nvfp4_fused_moe',
      params: [
        { id: 'shape', label: 'shape (E, top-k, hidden, inter)', type: 'select', options: [['s1', '256, 8, 2048, 512'], ['s2', '256, 8, 2048, 256'], ['s3', '128, 8, 2048, 768'], ['s4', '128, 8, 2048, 384'], ['s5', '512, 10, 2560, 320'], ['x', '256, 8, 4096, 512 (not validated)']], value: 's5' },
        { id: 'm', label: 'M (tokens)', type: 'number', min: 1, max: 16384, value: 8 },
        { id: 'pipe', label: 'pipeline', type: 'select', options: [['hybrid_v5', 'hybrid_v5'], ['hybrid_v3', 'hybrid_v3'], ['fused', 'fused']], value: 'hybrid_v5' },
        { id: 'hs', label: 'hidden_states', type: 'select', options: [['bf16', 'bfloat16'], ['u8', 'uint8 + input_sf'], ['u8x', 'uint8, no input_sf']], value: 'bf16' },
        { id: 'ev', label: 'shared_event', type: 'check', value: false },
        { id: 'pre', label: 'output_preinitialized', type: 'check', value: false }
      ],
      checks(t, p) {
        const [E, k, h, i] = p.shape === 'x' ? [256, 8, 4096, 512] : SHAPES[p.shape];
        return [
          { en: 'Detected target is nvidia/sm120, the only entry in _IMPL_MODULES', zh: '检测到的目标是 nvidia/sm120，也是 _IMPL_MODULES 中唯一的条目', cite: src(API_MOE, 25, 36), ok: t.family === 'nvidia' && t.arch === 'sm120', exc: 'RuntimeError' },
          { en: 'pipeline is "hybrid_v3" or "hybrid_v5"', zh: 'pipeline 为 "hybrid_v3" 或 "hybrid_v5"', cite: src(MOE120, 277, 281), ok: p.pipe === 'hybrid_v3' || p.pipe === 'hybrid_v5', exc: 'ValueError' },
          { en: 'hidden_states is bf16, or packed uint8 with input_sf', zh: 'hidden_states 为 bf16，或带 input_sf 的打包 uint8', cite: src(MOE120, 348, 358), ok: p.hs !== 'u8x', exc: 'ValueError' },
          { en: '(E, top-k, hidden, inter) is one of five validated shapes', zh: '(E, top-k, hidden, inter) 属于五个已验证形状之一', cite: src(MOE120, 383, 393), ok: validated(E, k, h, i), exc: 'ValueError' },
          { en: 'shared_event only with output_preinitialized=True', zh: 'shared_event 只能与 output_preinitialized=True 同用', cite: src(MOE120, 395, 401), ok: !p.ev || !!p.pre, exc: 'ValueError' }
        ];
      },
      result(t, p, rows, failAt) {
        if (failAt >= 0) return {
          kind: 'reject', v: `raises ${rows[failAt].exc}`,
          body: bi('This API has no <code>can_use_*</code> probe. It validates while it runs and raises before the JIT build or any launch.',
                   '该 API 没有 <code>can_use_*</code> 探测函数，它在执行时校验，并在 JIT 构建与任何启动之前抛出异常。'),
          cite: rows[failAt].cite
        };
        const [E, k, h, i] = SHAPES[p.shape];
        const M = p.m, v5 = p.pipe === 'hybrid_v5', gatherMin = 512;
        const e512 = isE512(E, k, h, i);
        const flags = [
          ['e512_topk10 dedicated kernels', e512],
          ['compact shared-SF staging (M ≤ 16)', M >= 1 && M <= 16 && e512],
          ['phase6 small-M', v5 && M >= 1 && M < gatherMin && M <= 512],
          ['task30 small-M GEMM2', v5 && M >= 1 && M <= 512],
          ['task13 gather GEMM1', v5 && M >= gatherMin]
        ];
        return {
          kind: 'ok', v: 'JIT module nvfp4_fused_moe_sm120_steps',
          body: bi(`The first call compiles the native extension, then routing, row expansion and two NVFP4 GEMMs run. Inside, a second dispatch picks kernels by M; the gather threshold is <code>HYBRID_V5_GATHER_MIN_M</code>, default 512.`,
                   `首次调用编译原生扩展，随后执行路由、行展开与两次 NVFP4 GEMM。内部还有第二层按 M 选择 kernel 的分派，gather 阈值为 <code>HYBRID_V5_GATHER_MIN_M</code>，默认 512。`),
          flags, cite: src(MOE120, 436, 468)
        };
      }
    }
  };

  // ---------------------------------------------------------------------
  // Widget 1: dispatch explorer
  // ---------------------------------------------------------------------
  function initDispatch(host) {
    const opSel = $('#dx-op', host), devSel = $('#dx-dev', host);
    const paramsEl = $('.dx-params', host), detectEl = $('.dx-detect', host);
    const traceWrap = $('.dx-trace-wrap', host), resultEl = $('.dx-result', host);
    const replay = $('[data-act="replay"]', host);
    let values = {}, run = 0;

    function buildParams() {
      const op = OPS[opSel.value];
      values = {};
      paramsEl.innerHTML = op.params.map((q) => {
        values[q.id] = q.value;
        const id = `dx-p-${q.id}`;
        if (q.type === 'check') return `<label class="ctrl-inline" for="${id}"><input type="checkbox" id="${id}" data-p="${q.id}"${q.value ? ' checked' : ''}> ${q.label}</label>`;
        if (q.type === 'number') return `<label class="ctrl" for="${id}">${q.label}<input type="number" id="${id}" data-p="${q.id}" min="${q.min}" max="${q.max}" value="${q.value}"></label>`;
        return `<label class="ctrl" for="${id}">${q.label}<select id="${id}" data-p="${q.id}">${q.options.map(([v, l]) => `<option value="${v}"${String(v) === String(q.value) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
      }).join('');
    }

    function readParams() {
      paramsEl.querySelectorAll('[data-p]').forEach((el) => {
        const k = el.dataset.p;
        values[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Math.max(+el.min, Math.min(+el.max, Math.round(+el.value || 0))) : el.value;
      });
    }

    function evaluate(animate) {
      readParams();
      const op = OPS[opSel.value];
      const dev = DEVICES[devSel.value];
      const t = detect(dev);
      detectEl.innerHTML =
        `<span><b>detect_device_target(q.device)</b> ${t.cite}</span>` +
        `<span>DeviceTarget(family=<b>'${t.family}'</b>, arch=<b>'${t.arch}'</b>, runtime_version=${t.runtime ? `'${t.runtime}'` : 'None'})</span>` +
        `<span class="muted" style="color:var(--ink-2)">${t.why}</span>`;
      const rows = op.checks(t, values);
      const failAt = rows.findIndex((r) => !r.ok);
      const res = op.result(t, values, rows, failAt);
      traceWrap.innerHTML = `<ol class="dx-trace">${rows.map((r) =>
        `<li class="dx-step" data-state="pending"><span class="dx-mark">·</span><span class="dx-label">${bi(r.en, r.zh)}</span>${r.cite}</li>`).join('')}</ol>`;
      const items = Array.from(traceWrap.querySelectorAll('.dx-step'));
      const paint = (idx) => items.forEach((li, j) => {
        const state = failAt >= 0 && j > failAt ? 'skip' : j === failAt ? 'fail' : 'pass';
        if (j <= idx) { li.dataset.state = state; li.querySelector('.dx-mark').textContent = state === 'fail' ? '✗' : state === 'skip' ? '–' : '✓'; }
      });
      const finish = () => {
        paint(items.length);
        resultEl.dataset.kind = res.kind;
        resultEl.innerHTML =
          `<span class="k">${res.kind === 'ok' ? bi('Dispatched to', '分派到') : bi('Rejected before launch', '启动前被拒绝')}</span>` +
          `<span class="v">${res.v}</span><p>${res.body}</p>` +
          (res.flags ? `<div class="dx-flags">${res.flags.map(([n, on]) => `<span class="dx-flag ${on ? 'on' : 'off'}">${n}</span>`).join('')}</div>` : '') +
          `<span>${res.cite}</span>`;
        resultEl.hidden = false;
      };
      const token = ++run;
      if (!animate || reduceMotion) { finish(); return; }
      resultEl.hidden = true;
      const probe = document.createElement('span');
      probe.className = 'dx-probe';
      traceWrap.appendChild(probe);
      const stop = failAt >= 0 ? failAt : items.length - 1;
      let j = 0;
      const step = () => {
        if (token !== run) return;
        const li = items[j];
        const y = li.offsetTop + (li.offsetHeight - 26) / 2;
        const prev = j === 0 ? y : items[j - 1].offsetTop + (items[j - 1].offsetHeight - 26) / 2;
        probe.animate([{ transform: `translateY(${prev}px)` }, { transform: `translateY(${y}px)` }], { duration: 120, fill: 'forwards', easing: 'ease-out' })
          .finished.then(() => {
            if (token !== run) return;
            paint(j);
            if (j === failAt) li.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 220 });
            if (j >= stop) { setTimeout(() => { if (token === run) { probe.remove(); finish(); } }, 160); return; }
            j++; step();
          });
      };
      step();
    }

    opSel.addEventListener('change', () => { buildParams(); evaluate(true); });
    devSel.addEventListener('change', () => evaluate(true));
    paramsEl.addEventListener('input', () => evaluate(false));
    paramsEl.addEventListener('change', () => evaluate(true));
    replay.addEventListener('click', () => evaluate(true));
    document.addEventListener('click', (e) => { if (e.target.closest('[data-set-lang]')) setTimeout(() => evaluate(false), 0); });
    buildParams();
    evaluate(false);
  }

  // ---------------------------------------------------------------------
  // Widget 2: build identity for a native .cu operator
  // ---------------------------------------------------------------------
  function initIdentity(host) {
    const fieldsEl = $('.bi-fields', host), idEl = $('.bi-id', host), pathEl = $('.bi-path', host);
    const capSel = $('#bi-cap', host), torchSel = $('#bi-torch', host), cudaSel = $('#bi-cuda', host);
    const base = { cap: '12.0', torch: '2.10.0', cuda: '12.9', src: 0, hdr: 0, ext: 0 };
    const st = Object.assign({}, base);

    const rows = (s) => [
      ['module_name', 'nvfp4_fused_moe_sm120_steps', null],
      ['family', 'nvidia', null],
      ['capability', `(${s.cap.replace('.', ', ')})`, 'cap'],
      ['torch', s.torch, 'torch'],
      ['runtime (torch.version.cuda)', s.cuda, 'cuda'],
      ['compiler', `nvcc ${s.cuda} · c++`, 'cuda'],
      ['python_abi', 'cpython-312', null],
      ['extra_cuda_cflags', '19 flags: -std=c++20, -use_fast_math, …', null],
      ['cuda_arch_suffix', '"f"', null],
      ['20 sources (path + bytes)', `revision ${s.src}`, 'src'],
      ['2 include dirs (every file)', `revision ${s.hdr}`, 'hdr'],
      ['CUTLASS include dirs (every file)', `revision ${s.ext}`, 'ext']
    ];

    function fnv64(str) {
      let h = 0xcbf29ce484222325n;
      for (let i = 0; i < str.length; i++) { h ^= BigInt(str.charCodeAt(i)); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
      return h.toString(16).padStart(16, '0');
    }
    async function digest(str) {
      try {
        if (window.crypto && crypto.subtle) {
          const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
          return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
        }
      } catch (e) { /* fall through */ }
      return fnv64(str);
    }

    let baseId = null;
    async function render() {
      st.cap = capSel.value; st.torch = torchSel.value; st.cuda = cudaSel.value;
      const list = rows(st);
      fieldsEl.innerHTML = list.map(([n, v, key]) =>
        `<div class="bi-row${key && st[key] !== base[key] ? ' changed' : ''}"><span class="n">${n}</span><span class="val">${v}</span></div>`).join('');
      const id = await digest(JSON.stringify(list.map(([n, v]) => [n, v])));
      if (baseId === null) baseId = await digest(JSON.stringify(rows(base).map(([n, v]) => [n, v])));
      const name = `nvfp4_fused_moe_sm120_steps_${id}`;
      const arch = st.cap.replace('.', '');
      idEl.innerHTML = [...id].map((c, i) => (baseId && baseId[i] !== c ? `<span class="d">${c}</span>` : c)).join('');
      pathEl.innerHTML =
        `<div>${bi('build directory', '构建目录')}: <b>~/.cache/atrex/jit/${name}</b></div>` +
        `<div>${bi('process lock', '进程锁')}: ~/.cache/atrex/jit/.${name}.lock</div>` +
        `<div>nvcc: <b>-gencode=arch=compute_${arch}f,code=sm_${arch}f</b></div>` +
        `<div>${id === baseId ? bi('Same identity as the baseline: an existing build is reused.', '与基线相同：复用已有构建。') : bi('New identity: a new directory is built; the old one stays on disk for the old inputs.', '新的 identity：会在新目录中构建；旧目录仍留在磁盘上，对应旧的输入。')}</div>`;
    }

    host.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bump]');
      if (b) { st[b.dataset.bump]++; render(); }
      if (e.target.closest('[data-act="reset"]')) {
        Object.assign(st, base); capSel.value = base.cap; torchSel.value = base.torch; cudaSel.value = base.cuda; render();
      }
    });
    [capSel, torchSel, cudaSel].forEach((el) => el.addEventListener('change', render));
    render();
  }

  // ---------------------------------------------------------------------
  // Widget 3: which operator tests run on this machine
  // ---------------------------------------------------------------------
  function initTests(host) {
    const devSel = $('#ts-dev', host), treeBox = $('#ts-tree', host), tbody = $('tbody', host);
    const FILES = [
      ['op_test/test_device_target.py', null],
      ['op_test/test_lazy_import.py', null],
      ['op_test/test_compile_cu.py', null],
      ['op_test/nvidia/chunk_gdn/test_chunk_gdn_sm103.py', 'sm103'],
      ['op_test/nvidia/chunk_gdn/test_chunk_gdn_sm120.py', 'sm120'],
      ['op_test/nvidia/flash_attn/test_flash_attn_sm103.py', 'sm103'],
      ['op_test/nvidia/nvfp4_fused_moe/test_nvfp4_fused_moe_sm120.py', 'sm120']
    ];
    function render() {
      const noTorch = devSel.value === 'none';
      const t = noTorch ? null : detect(DEVICES[devSel.value]);
      tbody.innerHTML = FILES.map(([f, arch]) => {
        let state, why;
        if (treeBox.checked) {
          state = 'error'; why = bi('collection fails: atrex was imported from <code>python/atrex</code>, not the installed wheel', '收集失败：atrex 是从 <code>python/atrex</code> 导入的，而不是已安装的 wheel');
        } else if (!arch) {
          state = 'run'; why = bi('framework test; uses a fake <code>torch</code> or a patched loader', '框架测试；使用假的 <code>torch</code> 或打过补丁的 loader');
        } else if (noTorch) {
          state = 'skip'; why = bi('requires Torch and NVIDIA hardware', '需要 Torch 与 NVIDIA 硬件');
        } else if (t.family !== 'nvidia') {
          state = 'skip'; why = bi(`requires NVIDIA hardware, detected ${t.family}/${t.arch}`, `需要 NVIDIA 硬件，检测到 ${t.family}/${t.arch}`);
        } else if (t.arch !== arch) {
          state = 'skip'; why = bi(`requires NVIDIA ${arch}, detected ${t.arch}`, `需要 NVIDIA ${arch}，检测到 ${t.arch}`);
        } else {
          state = 'run'; why = bi('arch from the filename matches the detected target', '文件名中的 arch 与检测到的目标一致');
        }
        const label = state === 'run' ? bi('run', '运行') : state === 'skip' ? bi('skip', '跳过') : bi('error', '错误');
        return `<tr><td class="mono">${f}</td><td class="state ${state}">${label}</td><td>${why}</td></tr>`;
      }).join('');
    }
    devSel.addEventListener('change', render);
    treeBox.addEventListener('change', render);
    render();
  }

  const d = document.getElementById('explorer'); if (d) initDispatch(d);
  const b = document.getElementById('identity'); if (b) initIdentity(b);
  const s = document.getElementById('tests'); if (s) initTests(s);
})();
