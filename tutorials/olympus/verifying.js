// Olympus tutorial 09, How we know: the acceptance matrix, one criterion at a time.
// DATA: EVAL.md at Chtholly-Boss/Olympus 21662ef (final pass on 48360e9): the matrix (lines 13-26), the deviations
// (124-151), the fault history (209-221) and the reproducing note (223-225). Evidence paths are /ws/runs
// directories that pass `olympus provenance --require`.
(function () {
  'use strict';

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const SHA = '21662efe19b4037c0802b1de116428c00ef2fa2f';
  const src = (path, a, b) => {
    const md = /\.md$/.test(path) ? '?plain=1' : '';
    const name = path.replace(/^.*\//, '');
    return `<a class="src" href="https://github.com/Chtholly-Boss/Olympus/blob/${SHA}/${path}${md}#L${a}${b ? '-L' + b : ''}">${name}:${a}${b ? '–' + b : ''}</a>`;
  };
  const badge = (kind, en, zh) => `<span class="vf-badge ${kind}">${bi(en, zh)}</span>`;
  const F = '/ws/runs/m7/final-48360e9/';

  // One entry per row of the matrix. stats: [key en, key zh, value, sub en, sub zh]; a value is the same in both languages.
  const DATA = [
    { id: 'A1', name: ['Bit-identical outputs', '输出逐位一致'],
      target: ['Spliced and original kernels give bit-identical outputs on identical inputs; a kernel with atomics stays within its own run-to-run spread.', '相同输入下，拼接后的 kernel 与原 kernel 输出逐位一致；带原子操作的 kernel 保持在它自己的多次运行离散范围内。'],
      badge: ['met', 'met', '达到'],
      stats: [['case × sets bit-exact', 'case × 集合逐位一致', '60 / 60', 'the correctness tool, with the spread', '正确性工具，含离散'],
        ['trace sweep', '追踪扫描', '60 / 60', 'bit-exact, valid buffers, every .olyt decodes, kernels restored', '逐位一致、缓冲区有效、每个 .olyt 可解码、kernel 已恢复'],
        ['nondeterministic cases', '非确定的 case', '0', '5 original runs on the same inputs plus 1 on fresh inputs, one hash each', '原 kernel 在同样输入上 5 次、新输入上 1 次，各只有一个哈希']],
      result: ['nvjet\'s <code>ATOMG</code> tile counter is bit-stable and is held to bit-exactness like every other output.', 'nvjet 的 <code>ATOMG</code> tile 计数器逐位稳定，和其他输出一样按逐位一致要求。'],
      cause: null,
      check: ['Bit-exact outputs: the runtime\'s gate, run by <code>olympus.verify.correctness</code> and <code>olympus trace</code>.', '输出逐位一致：运行时的门，由 <code>olympus.verify.correctness</code> 与 <code>olympus trace</code> 运行。'],
      ev: [F + 'a1-m6', F + 'm6-trace'], line: [17] },
    { id: 'A2', name: ['Binary similarity, T1–T4', '二进制相似度，T1–T4'],
      target: ['0 changed basic blocks; at least 94% of original instructions unchanged; every changed instruction a relocated branch.', '0 个基本块改动；至少 94% 的原始指令不变；每条被改动的指令都是重定位的分支。'],
      badge: ['part', '◐ 29 / 30', '◐ 29 / 30'],
      stats: [['changed blocks', '改动的基本块', '0 / 30', 'and 0 on the 30 T0 case × sets, reported only', 'T0 的 30 个 case × 集合也是 0，只报告'],
        ['only relocated branches changed', '改动的只有重定位分支', '30 / 30', 'no opcode, operand or control bit of an original instruction differs', '原始指令的操作码、操作数、控制位都没有不同'],
        ['worst preservation, T1 / T2 / T3 / T4', '最差保留率，T1 / T2 / T3 / T4', '99.15 / 92.86 / 95.98 / 96.24%', 'the one cell below 94% is t2_cutlass_gemm trace-mem', '唯一低于 94% 的一格是 t2_cutlass_gemm 的 trace-mem']],
      result: ['Met on 29 of 30. On T0 (reported only) 6 branch-dense micro-kernels are below 94%, also with 0 changed blocks.', '30 项中 29 项达到。T0（只报告）有 6 个分支密集的微 kernel 低于 94%，同样 0 个基本块改动。'],
      cause: ['<b>D2.</b> 150 inline islands in a 1,900-instruction, branch-dense kernel relocate almost every branch that spans one, and the plan\'s definition counts a relocated branch as changed; scheduling cannot avoid it.', '<b>D2.</b> 在 1,900 条指令、分支密集的 kernel 里插入 150 个内联 island，几乎每条跨过 island 的分支都要重定位，而计划的定义把重定位的分支算作改动；调度无法避免。'],
      check: ['Binary similarity: <code>olympus.splice.similarity</code>, driven over the corpus by <code>olympus.verify.similarity</code> and the static sweep.', '二进制相似度：<code>olympus.splice.similarity</code>，由 <code>olympus.verify.similarity</code> 和静态扫描在语料库上驱动。'],
      ev: [F + 'm6-static', F + 'a2-side'], line: [18] },
    { id: 'A3', name: ['REGCOUNT unchanged', 'REGCOUNT 不变'],
      target: ['<code>REGCOUNT</code> unchanged unless the register-raising fallback is explicitly enabled.', '除非显式开启提升寄存器数的回退，否则 <code>REGCOUNT</code> 不变。'],
      badge: ['met', 'met', '达到'],
      stats: [['case × sets', 'case × 集合', '60 / 60', 'T0–T4, the search planner', 'T0–T4，搜索规划器']],
      result: ['The register raise exists as an opt-in per-warp fallback; the evaluated planner never used it.', '提升寄存器数是需显式开启的逐 warp 回退；被评估的规划器从未使用它。'],
      cause: null,
      check: ['The static sweep\'s A3 row.', '静态扫描的 A3 一行。'],
      ev: [F + 'm6-static', F + 'a2-side'], line: [19] },
    { id: 'A4', name: ['Overhead ≤ 1 / 3 / 6%, T1–T4', '开销 ≤ 1 / 3 / 6%，T1–T4'],
      target: ['End-to-end kernel duration: trace-sche ≤ 1%, trace-pp ≤ 3%, trace-mem ≤ 6%, on every T1–T4 kernel.', '端到端 kernel 时长：每个 T1–T4 kernel 上 trace-sche ≤ 1%、trace-pp ≤ 3%、trace-mem ≤ 6%。'],
      badge: ['miss', '✗ not met', '✗ 未达到'],
      stats: [['cells within target', '达标的格', '13 / 30', 'trace-sche 8 / 10 · trace-pp 3 / 10 · trace-mem 2 / 10', 'trace-sche 8 / 10 · trace-pp 3 / 10 · trace-mem 2 / 10'],
        ['protocol', '测量方式', '3 blocks', 'one process per variant on dedicated GPUs; identity as the A/A control; 7–11 processes where the 95% CI straddled the target', '每个变体一个进程，在专用 GPU 上；identity 作为 A/A 对照；95% 置信区间跨越目标的格跑 7–11 个进程']],
      result: ['trace-sche is within 1% on 8 of 10 kernels, among them FA-3 (+0.03%), CUTLASS (+0.06%), nvjet (+0.11%) and DeepGEMM k2048 (+0.28%). The misses grow with records per launch.', 'trace-sche 在 10 个 kernel 中的 8 个上在 1% 以内，其中有 FA-3（+0.03%）、CUTLASS（+0.06%）、nvjet（+0.11%）和 DeepGEMM k2048（+0.28%）。未达标的格随每次启动的记录数增长。'],
      cause: ['<b>D4.</b> The islands are close to their dependency-chain minimum. What remains: the record template\'s own per-record work in hot loops (the store\'s source-read release, clock → pack → store); a fixed per-launch cost of INIT and the exit calibration on microsecond kernels (axpy trace-sche is about +12%); and trace-mem traced as one full set. Two template changes were tried: psave kept (−1.26 points on matmul trace-mem), a persistent write pointer dropped (0.0%).', '<b>D4.</b> island 已接近依赖链的最小值。剩下的是：记录模板在热循环里每条记录自身的工作（store 读完源操作数才释放，时钟 → 打包 → 写入）；INIT 与退出校准在微秒级 kernel 上每次启动的固定开销（axpy 的 trace-sche 约 +12%）；以及 trace-mem 作为一整组追踪。试过两处模板改动：psave 保留（matmul trace-mem 降 1.26 个百分点），持久写指针放弃（0.0%）。'],
      check: ['The overhead protocol, <code>olympus bench</code>: pinned to the trace sweep\'s images.', '开销测量规程，<code>olympus bench</code>：固定使用追踪扫描的镜像。'],
      ev: [F + 'a4-bench-g3', F + 'a4-bench-g4', F + 'a4-table'], line: [20] },
    { id: 'A5', name: ['Counts and region timings as the reference tracer', '记录条数与区间计时与参照追踪器一致'],
      target: ['The same record counts as the evaluation\'s reference tracer; per-region p50 and p95 within max(5%, 50 ns) of it.', '记录条数与评估的参照追踪器相同；各区间的 p50 与 p95 与它相差不超过 max(5%, 50 ns)。'],
      badge: ['part', '◐ counts met, timing not', '◐ 条数达到，计时未达到'],
      stats: [['ordinary sites with equal counts', '条数相同的普通站点', '568 / 568', 'in every run of both tools', '两个工具的每次运行都相同'],
        ['regions with equal pair rates', '配对率相同的区间', '72 / 72', '', ''],
        ['regions within A5 as written', '按原文达标的区间', '51 / 72', '56 / 72 under the spread rule (DECISIONS 60); 16 exceed; 8 not compared (5 refused sites)', '按离散规则（DECISIONS 60）56 / 72；16 个超出；8 个未比较（5 个被拒绝的站点）']],
      result: ['Where the reference tracer is the perturbed tool, Olympus is closer to the kernel without probes: DeepGEMM k512 spans 31.0 µs under Olympus against 30.3 µs with no probes.', '在参照追踪器是扰动方的地方，Olympus 更接近不加探针的 kernel：DeepGEMM k512 在 Olympus 下跨度 31.0 µs，不加探针为 30.3 µs。'],
      cause: ['<b>D5.</b> Of the 16 exceedances, 11 are the reference tracer\'s own probe costs (9 of its probes wait on the kernel\'s TMA-store scoreboards; 2 are heavier probes on short or memory-bound regions); 1 comes from a refused site; 1 is slack moving within t2\'s producer pipeline; 2 are p95 tails of ≤ 72 ns with no established cause; 1 (k512 <code>p.kb0.wait</code>, 5 ns over the floor) has not been examined.', '<b>D5.</b> 16 个超出中，11 个是参照追踪器自己探针的开销（它的 9 个探针等待 kernel 的 TMA store scoreboard；2 个是落在短区间或访存受限区间上的较重探针）；1 个来自被拒绝的站点；1 个是 t2 producer 流水线内部余量的挪动；2 个是 ≤ 72 ns 的 p95 尾部，原因未查明；1 个（k512 <code>p.kb0.wait</code>，比下限多 5 ns）尚未检查。'],
      check: ['Record counts and region pairing over both tools\' traces; the comparison tooling was removed with DECISIONS 92 and the runs stay as the record.', '两个工具追踪的记录条数与区间配对；比较工具随 DECISIONS 92 移除，运行记录保留。'],
      ev: [F + 'a5rep-m6', F + 'a5rep-m6-table'], line: [21] },
    { id: 'A6', name: ['DeepGEMM k512 tile phases', 'DeepGEMM k512 的 tile 各阶段'],
      target: ['Per-tile phases of DeepGEMM 1d2d 4096×7168×512 within ±15% of the plan\'s source-level measurements (PLAN §2.4).', 'DeepGEMM 1d2d 4096×7168×512 每个 tile 的各阶段与计划的源码级测量（PLAN §2.4）相差不超过 ±15%。'],
      badge: ['miss', '✗ 2 / 8 phases', '✗ 2 / 8 个阶段'],
      stats: [['phases within ±15%', '±15% 以内的阶段', '2 / 8', 'tile total −1%, first K block −4%', 'tile 总计 −1%，第一个 K block −4%'],
        ['B-scale barrier, mean per warp-tile', 'B-scale barrier，每 warp-tile 均值', '470 ns', 'against 455 ns for the kernel without probes (ncu); the ~1.2 µs hold of the fenced planner is gone', '不加探针的 kernel（ncu）为 455 ns；加围栏规划器下约 1.2 µs 的等待已消失'],
        ['islands waiting on a kernel scoreboard', '等待 kernel scoreboard 的 island', '0', 'the final scoreboard scan, sbwait', '最终的 scoreboard 扫描，sbwait']],
      result: ['Not met as written: scheduler −24%, B-scale +50%, store wait −48%, STSM −27%, TMA issue +17% in cycles (within 15% in ns).', '按原文未达到：调度 −24%，B-scale +50%，store 等待 −48%，STSM −27%，TMA 发出按周期 +17%（按 ns 在 15% 以内）。'],
      cause: ['<b>D6.</b> The uninstrumented kernel, measured with ncu and gated bit-exact, itself misses §2.4 on 4 of its 6 consumer phases at these site boundaries; a phase shorter than §2.4 cannot come from probes. The B-scale excess is warp 1\'s own B-scale global load: it reaches the barrier 978 cycles into the phase, warps that do not load after 25. What the probes add is about 40 cycles per probe inside a phase. A6 is not redefined (DECISIONS 72).', '<b>D6.</b> 不加探针的 kernel 用 ncu 测量并经逐位一致门，在这些站点边界上自己就有 6 个 consumer 阶段中的 4 个不符合 §2.4；比 §2.4 更短的阶段不可能来自探针。B-scale 的超出是 warp 1 自己的 B-scale 全局加载：它在阶段开始 978 个周期后才到达 barrier，不加载的 warp 25 个周期就到。探针增加的是每个探针在阶段内约 40 个周期。A6 没有被重新定义（DECISIONS 72）。'],
      check: ['<code>olympus bench tile_phases</code> on the trace, <code>tile_phases_ncu</code> on the kernel without probes, <code>sbwait</code> on the spliced image.', '对追踪运行 <code>olympus bench tile_phases</code>，对不加探针的 kernel 运行 <code>tile_phases_ncu</code>，对拼接镜像运行 <code>sbwait</code>。'],
      ev: [F + 'a6-traces', F + 'a6'], line: [22] },
    { id: 'A7', name: ['No faulting launch', '没有出错的启动'],
      target: ['Olympus never launches a cubin that fails to load or faults; problems are reported before launch.', 'Olympus 绝不启动加载失败或会出错的 cubin；问题在启动前报告。'],
      badge: ['met', 'met', '达到'],
      stats: [['fuzz sets on the final commit', '最终提交上的模糊测试组', '800 / 800', '20 cases · 0 faults · 0 refused', '20 个 case · 0 次故障 · 0 次拒绝'],
        ['earlier campaigns on c569097', 'c569097 上更早的几轮', '2,400 / 2,400', 'conservative, exact and search planners', '保守、精确、搜索三种规划器'],
        ['faults in the history, all fixed', '历史上的故障，全部修复', '6 rows', 'VALUE reads outside the allocation in force; waits 1 cycle after their setter; a calibration with no free scoreboard, refused before launch', '读取当前分配之外的寄存器（VALUE）；等待紧跟占用者 1 个周期；校准没有空闲 scoreboard，启动前拒绝']],
      result: ['Every fault any run has hit is listed with its root cause and fixing commit; the dead-register check\'s deliberate faults are liveness findings, not tracing launches.', '任何运行遇到过的每一次故障都连同根本原因和修复提交列出；死寄存器检查里故意制造的故障是活跃性发现，不是追踪启动。'],
      cause: null,
      check: ['Fuzzing, <code>olympus.verify.fuzz</code>, through the <code>olympus trace</code> path unchanged.', '模糊测试，<code>olympus.verify.fuzz</code>，原样走 <code>olympus trace</code> 的路径。'],
      ev: [F + 'fuzz-m6'], line: [23], extra: [209, 221] },
    { id: 'A8', name: ['Analysis and search time', '分析与搜索耗时'],
      target: ['Analysis ≤ 1 s per kernel; search ≤ 10 ms per site.', '每个 kernel 分析 ≤ 1 s；每个站点搜索 ≤ 10 ms。'],
      badge: ['met', 'met', '达到'],
      stats: [['search per site', '每站点搜索', '2.99 ms', 'median; p95 4.92 ms; max 6.56 ms; 0 / 2,028 over 10 ms', '中位数；p95 4.92 ms；最长 6.56 ms；2,028 个中 0 个超过 10 ms'],
        ['analysis per kernel', '每 kernel 分析', '0.009 s', 'median; max 0.45 s, plus ≤ 0.36 s decode', '中位数；最长 0.45 s，另加 ≤ 0.36 s 解码'],
        ['sites proven optimal', '证明最优的站点', '1,406', '622 capped by the deterministic budget, 615 of those at the optimum anyway (DECISIONS 73)', '622 个被确定性预算截止，其中 615 个仍落在最优解上（DECISIONS 73）']],
      result: ['Outside A8\'s definition: counting a site\'s context and template building too, per-site time is median 5.6 ms and max 17.7 ms, with 126 sites over 10 ms.', '不在 A8 的定义之内：若把站点的上下文与模板构建也算进去，每站点中位数 5.6 ms、最长 17.7 ms，有 126 个站点超过 10 ms。'],
      cause: null,
      check: ['The static sweep\'s per-site plan report.', '静态扫描的逐站点计划报告。'],
      ev: [F + 'm6-static'], line: [24] },
    { id: 'A9', name: ['olympus show on any trace', 'olympus show 适用于任何追踪'],
      target: ['<code>olympus show</code> prints header, per-scope stats, pipeline bubbles and a timeline for any trace.', '<code>olympus show</code> 对任何追踪都输出头部、按范围的统计、流水线气泡和时间线。'],
      badge: ['met', 'met', '达到'],
      stats: [['views', '视图', '5 + HTML', 'header, per-scope stats, bubbles, timeline, concurrency, and the HTML panel', '头部、按范围的统计、气泡、时间线、并发，以及 HTML 面板']],
      result: ['Chapter 08 reads a trace through it; <code>docs/USAGE.md</code> §5 documents every view.', '第 08 章通过它读一份追踪；<code>docs/USAGE.md</code> §5 记录了每个视图。'],
      cause: null,
      check: ['<code>olympus show</code> over every trace of the sweeps.', '对扫描中的每份追踪运行 <code>olympus show</code>。'],
      ev: ['journal/STATUS.md (M8)'], line: [25] },
    { id: 'L', name: ['Liveness soundness', '活跃性分析的可靠性'],
      target: ['Every register the analysis calls dead is dead: overwriting it changes nothing.', '分析判为已死的每个寄存器确实已死：改写它不改变任何结果。'],
      badge: ['met', 'met', '达到'],
      stats: [['cases on the GPU', 'GPU 上的 case', '20 / 20', 'offline too on T0; every reachable instruction a test point, two phases', 'T0 上离线也通过；每条可达指令都是测试点，分两轮'],
        ['controls', '对照组', 'effective', 'each control that overwrites a live GPR changes the outputs, so a wrong liveness would be seen', '每个改写活跃 GPR 的对照都改变输出，所以错误的活跃性会被看见'],
        ['GB300', 'GB300', '10 / 10 + 2 / 2', '1,710 points on the T0 kernels; 1,280 and 1,382 on the sm100 GEMMs', 'T0 kernel 上 1,710 个点；sm100 GEMM 上 1,280 与 1,382 个点']],
      result: ['Liveness is unchanged between 311dd24 and the final commit, so the definitive run on 311dd24 stands for it.', '从 311dd24 到最终提交活跃性未变，所以 311dd24 上的最终运行对它仍然有效。'],
      cause: null,
      check: ['The dead-register check, <code>olympus.verify.deadcheck</code>.', '死寄存器检查，<code>olympus.verify.deadcheck</code>。'],
      ev: ['/ws/runs/m3/athena/20260929T054712Z-runtime-a', '/ws/runs/m3/athena/20260929T054712Z-runtime-b', '/ws/runs/m3/athena/20260929T063004Z-offline'], line: [26] }
  ];

  function initDash(host) {
    const tabs = $('.vd-tabs', host), panel = $('.vd-panel', host);
    let cur = 0;
    tabs.innerHTML = DATA.map((c, i) => `<button type="button" class="stage-btn" role="tab" id="vd-tab-${c.id}" data-i="${i}" aria-selected="false">${c.id}</button>`).join('');
    const btns = $$('.stage-btn', tabs);
    function render() {
      const c = DATA[cur];
      btns.forEach((b, j) => { b.setAttribute('aria-selected', String(j === cur)); if (j === cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
      panel.setAttribute('aria-labelledby', 'vd-tab-' + c.id);
      const cite = src('EVAL.md', c.line[0], c.line[1]) + (c.extra ? ' ' + src('EVAL.md', c.extra[0], c.extra[1]) : '');
      panel.innerHTML = `
        <h4><span class="id">${c.id}</span>${bi(c.name[0], c.name[1])}${badge(c.badge[0], c.badge[1], c.badge[2])}</h4>
        <p><span class="k">${bi('criterion', '标准')}</span>${bi(c.target[0], c.target[1])}</p>
        <div class="readouts">${c.stats.map(([ke, kz, v, se, sz], k) => `<div class="readout${k === 0 ? ' key' : ''}"><span class="k">${bi(ke, kz)}</span><span class="v">${v}</span>${se ? `<span class="s">${bi(se, sz)}</span>` : ''}</div>`).join('')}</div>
        <p>${bi(c.result[0], c.result[1])}</p>
        <p class="vd-cause${c.cause ? '' : ' ok'}"><span class="k">${c.cause ? bi('root cause', '根本原因') : bi('check', '检查')}</span>${c.cause ? bi(c.cause[0], c.cause[1]) : bi(c.check[0], c.check[1])}</p>
        ${c.cause ? `<p class="vd-ev"><span class="k">${bi('check', '检查')}</span>${bi(c.check[0], c.check[1])}</p>` : ''}
        <p class="vd-ev"><span class="k">${bi('evidence', '证据')}</span>${c.ev.map((e) => `<code>${e}</code>`).join(' ')} ${cite}</p>`;
    }
    btns.forEach((b) => b.addEventListener('click', () => { cur = +b.dataset.i; render(); }));
    tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      cur = (cur + (e.key === 'ArrowRight' ? 1 : DATA.length - 1)) % DATA.length;
      render(); btns[cur].focus();
    });
    const m = /^#dash-([A-Za-z0-9]+)$/.exec(location.hash);
    if (m) { const k = DATA.findIndex((c) => c.id === m[1]); if (k >= 0) cur = k; }
    render();
  }

  const host = document.getElementById('dash');
  if (host) initDash(host);
})();
