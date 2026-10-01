// Olympus tutorial 07, Running a traced kernel: the gate, stepped through on three real runs.
// RUNS: the final trace sweep's t3_dg_1d2d_k512 / trace-pp attempts at ring depth 64 (wrapped) and 256 (pass),
// /ws/runs/m7/final-48360e9/m6-trace, and the canary splice-check of t0_straight from docs/USAGE.md §7.1.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const num = (x) => x.toLocaleString('en-US');
  const OK = '<span class="ok">✓</span>', NO = '<span class="no">✗</span>';
  const B = (v) => (Array.isArray(v) ? bi(v[0], v[1]) : v);

  // a value cell: a string (same in both languages) or [en, zh]
  const RUNS = {
    d256: {
      name: ['k512 trace-pp · ring 256', 'k512 trace-pp · 环 256'], tool: 'olympus trace', verdictCls: '',
      verdict: ['pass · every check holds: these are the records chapter 08 reads', '通过 · 所有检查成立：第 08 章读的就是这些记录'],
      fail: null, ring: 256, sb: 1056, bytes: 1672704, sha: 'd7d11d6df03ff582cc7b6946d3c63d1d…', cuT: '0x8fd7b100', cuO: '0x71abf6f0', ptr: '0x7f15d5901000', olyt: 1676672, planS: '2.23 s', hz: true,
      json: { verdict: 'pass', stage: 'done', outputs: { match: true }, guards: { intact: true }, buffer_check: { ok: true, errors: [] }, ring: { depth: 256, max_records: 130, wrapped_slots: 0, next_depth: null }, decode: { records: 146876, sites: 41, regions: 29 } }
    },
    d64: {
      name: ['k512 trace-pp · ring 64', 'k512 trace-pp · 环 64'], tool: 'olympus trace', verdictCls: 'escalate',
      verdict: ['fail at check · ring depth 64 too small: a slot wrote 130 records (1,188 slots wrapped); re-run with depth 256. Outputs and guards were fine: the gate failed the run for lost records, not for a wrong kernel', '检查阶段失败 · 环深度 64 太小：有槽位写了 130 条记录（1,188 个槽位回绕）；以深度 256 重跑。输出和保护带都没问题：门因记录丢失而判这次运行失败，不是因为 kernel 有错'],
      fail: 'check', ring: 64, sb: 288, bytes: 456192, sha: '0fa5da8ab606baca08f010447135eaa6…', cuT: '0x8fa5f020', cuO: '0x71b50d20', ptr: '0x7f65f8221400', olyt: 460160, planS: '2.25 s', hz: false,
      json: { verdict: 'fail', stage: 'done', failures: ['ring depth 64 too small: a slot wrote 130 records (1,188 slots wrapped); re-run with depth 256'], outputs: { match: true }, guards: { intact: true }, ring: { depth: 64, max_records: 130, wrapped_slots: 1188, next_depth: 256 }, decode: { records: 76824 } }
    },
    canary: {
      name: ['t0_straight · canary rewriter', 't0_straight · canary 重写器'], tool: 'olympus splice-check --rewriter canary', verdictCls: '',
      verdict: ['pass as a negative control · the outputs differ from the reference (match=False), which is what a kernel that exits at instruction 1 must produce. Had they matched, the swap would not have run our image', '作为阴性对照通过 · 输出与参考不同（match=False），这正是一个在第 1 条指令退出的 kernel 必然产生的结果。若它们匹配，就说明替换并没有运行我们的镜像'],
      fail: 'check', canary: true,
      json: { case: 't0_straight', rewriter: 'canary', expect_match: false, verdict: 'pass', stage: 'done', load: { ok: true }, outputs: { match: false }, scratch_untouched: true, restored_match: true }
    }
  };

  const STAGES = [
    { id: 'capture', en: 'Capture', zh: '捕获',
      what: ['One run of the case with launch tracing on. The kernel the sites file names is found, must launch exactly once, and its image must equal the corpus cubin by sha256. The capture run\'s own outputs must already match the reference.',
        '开启启动追踪运行一次用例。找到站点文件所指的 kernel，它必须恰好启动一次，镜像的 sha256 必须等于语料库中的 cubin。捕获运行自己的输出必须已经与参考匹配。'],
      kv: (r) => r.canary ? [
        ['kernel', 'kernel', ['t0_straight\'s kernel, through the default backend on H200', 't0_straight 的 kernel，经 H200 上的默认后端']],
        ['launches of the kernel', '该 kernel 的启动次数', `1 ${OK}`],
        ['image sha256', '镜像 sha256', `= /ws/corpus/t0_straight/kernel.cubin ${OK}`],
        ['outputs of this run', '本次运行的输出', `= ref.json ${OK}`]] : [
        ['kernel launches', '该 kernel 的启动', ['1 · grid 132×1×1 · block 384×1×1 · 216,336 B shared memory', '1 次 · grid 132×1×1 · block 384×1×1 · 216,336 B 共享内存']],
        ['image sha256', '镜像 sha256', `e0f1350cd90ca693… = /ws/corpus/t3_dg_1d2d_k512/kernel.cubin ${OK}`],
        ['plan is for', '计划针对', [`this kernel and this image ${OK}`, `这个 kernel 和这个镜像 ${OK}`]],
        ['outputs of this run', '本次运行的输出', `= ref.json ${OK}`]] },
    { id: 'splice', en: 'Plan and splice', zh: '规划并拼接',
      what: ['The rewriter builds the spliced image on the CPU: the planner places INIT, one RECORD per site and an EXIT calibration per exit, picks dead registers and searches the control bits; the splicer inserts the islands, relocates every branch that crosses one, appends the 8-byte parameter and proves the result offline. A plan error stops here.',
        '重写器在 CPU 上构建拼接后的镜像：规划器放置 INIT、每个站点一个 RECORD、每个出口一个 EXIT 校准，挑选死寄存器并搜索控制位；拼接器插入 island，重定位每条跨越 island 的分支，追加 8 字节参数，并离线证明结果。计划出错就在此停止。'],
      kv: (r) => r.canary ? [
        ['rewriter', '重写器', ['canary: instruction 1 of every kernel overwritten with the kernel\'s own unguarded EXIT word', 'canary：每个 kernel 的第 1 条指令改写成该 kernel 自己的无 guard EXIT 字']],
        ['KernelEdit', 'KernelEdit', ['none: no parameter appended (kernels = {})', '无：不追加参数（kernels = {}）']],
        ['expect_match', 'expect_match', 'false'],
        ['notes', '备注', '"canary: <kernel> exits at instruction 1"']] : [
        ['planner', '规划器', 'search (Algorithm 1, deterministic budget)'],
        ['islands', 'island', ['46: 1 INIT, 41 RECORD, 4 EXIT calibrations · 386 instructions', '46 个：1 个 INIT、41 个 RECORD、4 个 EXIT 校准 · 386 条指令']],
        ['persistent registers', '持久寄存器', ['UR60, UR61 (slot base), UR62 (count)', 'UR60、UR61（槽位基址）、UR62（计数）']],
        ['layout', '布局', [`warp · ring ${r.ring} · 4-byte records · id_bits 6 · slot ${num(r.sb)} B`, `warp · 环深度 ${r.ring} · 4 字节记录 · id_bits 6 · 槽位 ${num(r.sb)} B`]],
        ['REGCOUNT', 'REGCOUNT', `168 → 168 ${OK}`],
        ['spliced sha256 · size', '拼接后 sha256 · 大小', `${r.sha} · 40,072 B`],
        ['instruction words', '指令字', ['1,504 → 1,896: 386 probe instructions plus 6 never-executed fillers that pad the text to 128 B; original words copied through', '1,504 → 1,896：386 条探针指令，加 6 条永不执行的填充字把代码段补齐到 128 B；原指令字原样复制']],
        ['parameter block', '参数块', ['624 → 632 B · buffer pointer at offset 624', '624 → 632 B · 缓冲区指针位于偏移 624']],
        ...(r.hz ? [['hazard check', '冒险检查', [`1,603 probe pairs, 0 violations touching a probe ${OK}`, `1,603 个探针指令对，0 个涉及探针的违例 ${OK}`]]] : []),
        ['time', '耗时', r.planS]] },
    { id: 'load', en: 'Load and layout', zh: '加载与布局',
      what: ['The backend loads the spliced image as its own module. Nothing launches unless the image defines the kernel with a distinct CUfunction and three views of the parameter layout agree: the KernelEdit, the images\' KPARAM_INFO records, and the driver\'s cuFuncGetParamInfo.',
        '后端把拼接后的镜像作为独立模块加载。只有当镜像以一个独立的 CUfunction 定义了该 kernel，且参数布局的三个视角一致（KernelEdit、镜像的 KPARAM_INFO 记录、驱动的 cuFuncGetParamInfo）时，才会启动。'],
      kv: (r) => r.canary ? [
        ['load', '加载', [`parses and loads; defines the kernel ${OK}`, `解析并加载；定义了该 kernel ${OK}`]],
        ['parameter layout', '参数布局', [`no edit, so the spliced layout must equal the original's: it does ${OK}`, `没有编辑，所以拼接后的布局必须等于原布局：相等 ${OK}`]]] : [
        ['parse', '解析', [`1,896 instructions = the image's 1,896 ${OK}`, `1,896 条指令 = 镜像中的 1,896 条 ${OK}`]],
        ['CUfunction', 'CUfunction', [`${r.cuT} (spliced) ≠ ${r.cuO} (original) ${OK}`, `${r.cuT}（拼接）≠ ${r.cuO}（原始）${OK}`]],
        ['NUM_REGS', 'NUM_REGS', [`168 / 168, backend and driver, both kernels ${OK}`, `168 / 168，后端与驱动，两个 kernel ${OK}`]],
        ['parameter layout', '参数布局', [`9 original parameters (… (496, 128)) + (624, 8), in the image's and the driver's views ${OK}`, `9 个原参数（…（496, 128））+（624, 8），镜像与驱动的视角一致 ${OK}`]]] },
    { id: 'launch', en: 'Buffer and launch', zh: '缓冲区与启动',
      what: ['One allocation: a 4 KiB guard band of 0xA5, the zeroed body, another 4 KiB guard; the body\'s address is the appended parameter. Every output byte is poisoned with 0xA5, the spliced kernel is registered in place of the original, and the case runs once with launch tracing on.',
        '一次分配：4 KiB 填 0xA5 的保护带、清零的主体、再一段 4 KiB 保护带；主体地址就是追加的参数。每个输出字节投毒为 0xA5，拼接后的 kernel 注册替换原 kernel，开启启动追踪把用例运行一次。'],
      kv: (r) => r.canary ? [
        ['outputs poisoned first', '事先投毒', `0xA5 ${OK}`],
        ['appended parameter', '追加的参数', ['none (no KernelEdit); the 4 KiB zeroed scratch buffer stands by', '无（没有 KernelEdit）；4 KiB 清零的暂存缓冲区待命']],
        ['launches of the kernel', '该 kernel 的启动次数', `1 ${OK}`]] : [
        ['slots', '槽位', ['1,584 = 132 blocks × 12 warps', '1,584 = 132 个 block × 12 个 warp']],
        ['bytes', '字节', `${num(r.bytes)} = 1,584 × ${num(r.sb)}`],
        ['guards', '保护带', ['4,096 B of 0xA5 on each side', '两侧各 4,096 B 的 0xA5']],
        ['pointer', '指针', r.ptr],
        ['outputs poisoned first', '事先投毒', [`0xA5; this is run 2 of the case's runner ${OK}`, `0xA5；这是用例运行器的第 2 次运行 ${OK}`]],
        ['launches of the kernel', '该 kernel 的启动次数', [`1, of 5 launches in the run ${OK}`, `1 次（本次运行共 5 次启动）${OK}`]],
        ['run time', '运行耗时', '0.235 s']] },
    { id: 'check', en: 'Check', zh: '检查',
      what: ['The gate. Outputs against the reference hashes; the buffer copied back and checked by the runtime and, independently, by the planner; the ring depth against the largest n_records.',
        '这道门。输出对照参考哈希；缓冲区拷回，由运行时检查一遍，再由规划器独立检查一遍；环深度对照最大的 n_records。'],
      kv: (r) => r.canary ? [
        ['outputs', '输出', [`≠ ref.json: they keep the 0xA5 poison ${NO}`, `≠ ref.json：仍是 0xA5 毒值 ${NO}`]],
        ['expected?', '符合预期？', [`yes: expect_match is false for the canary; a match would mean the swap did not run our image ${OK}`, `是：canary 的 expect_match 为 false；若匹配，说明替换没有运行我们的镜像 ${OK}`]],
        ['scratch buffer', '暂存缓冲区', `untouched ${OK}`]] : [
        ['outputs', '输出', `80f84e73d9a2d8bc… = ref.json ${OK}`],
        ['guard bands', '保护带', [`0 bytes changed ${OK}`, `0 字节被改动 ${OK}`]],
        ['slot headers', '槽位头', [`1,584 valid, 1,584 calibrated · 132 SM ids, max 131 ${OK}`, `1,584 个有效，1,584 个已校准 · 132 个 SM 编号，最大 131 ${OK}`]],
        ['stray bytes', '多余字节', [`0 in rings, 0 in padding, 0 empty records ${OK}`, `环中 0，填充中 0，空记录 0 ${OK}`]],
        ['ring', '环', r.ring === 256 ? [`max n_records 130 ≤ 256 ${OK}`, `最大 n_records 130 ≤ 256 ${OK}`] : [`max n_records 130 &gt; 64: 1,188 slots wrapped, records lost ${NO} → next depth 256`, `最大 n_records 130 &gt; 64：1,188 个槽位回绕，记录丢失 ${NO} → 下一深度 256`]],
        ['.olyt', '.olyt', r.ring === 256 ? [`${num(r.olyt)} B · 146,876 records decoded = the buffer's ${OK} · 41 sites · 29 regions · 1,584 rows`, `${num(r.olyt)} B · 解码 146,876 条记录 = 缓冲区中的条数 ${OK} · 41 个站点 · 29 个 region · 1,584 行`] : [`${num(r.olyt)} B · 76,824 records kept; 70,052 lost to the wrap`, `${num(r.olyt)} B · 保留 76,824 条；70,052 条因回绕丢失`]]] },
    { id: 'restore', en: 'Restore', zh: '恢复',
      what: ['The spliced kernel is unregistered, the outputs are poisoned again, and the case runs with the original kernel, which must reproduce the reference. Then result.json is written.',
        '注销拼接后的 kernel，再次对输出投毒，用原 kernel 运行用例，它必须复现参考结果。然后写出 result.json。'],
      kv: () => [['outputs', '输出', `= ref.json ${OK}`]] }
  ];

  function jsonHtml(o, ind) {
    ind = ind || '';
    if (o === null) return '<span class="b">null</span>';
    if (typeof o === 'boolean') return `<span class="b">${o}</span>`;
    if (typeof o === 'number') return `<span class="n">${o}</span>`;
    if (typeof o === 'string') return `<span class="s">"${o.replace(/"/g, '\\"')}"</span>`;
    if (Array.isArray(o)) return o.length ? `[\n${o.map((v) => ind + '  ' + jsonHtml(v, ind + '  ')).join(',\n')}\n${ind}]` : '[]';
    const keys = Object.keys(o);
    return `{\n${keys.map((k) => `${ind}  <span class="k">"${k}"</span>: ${jsonHtml(o[k], ind + '  ')}`).join(',\n')}\n${ind}}`;
  }

  function initGate(host) {
    const runsEl = $('.rg-runs', host), stagesEl = $('.rg-stages', host), detail = $('.rg-detail', host), playBtn = $('[data-act="play"]', host);
    let run = 'd256', cur = 4, shown = STAGES.length, timer = null;
    const status = (i) => {
      const r = RUNS[run];
      if (i >= shown) return 'pending';
      return r.fail === STAGES[i].id ? 'fail' : 'pass';
    };
    function render() {
      const r = RUNS[run];
      runsEl.innerHTML = Object.keys(RUNS).map((k) => `<button type="button" class="btn ghost" data-run="${k}" aria-pressed="${k === run}">${bi(RUNS[k].name[0], RUNS[k].name[1])}</button>`).join('');
      stagesEl.innerHTML = STAGES.map((g, i) => `<button type="button" class="rg-st" role="tab" data-i="${i}" data-st="${status(i)}" aria-selected="${i === cur}"><i></i>${i + 1}. ${bi(g.en, g.zh)}</button>`).join('');
      const g = STAGES[cur];
      const done = shown >= STAGES.length;
      const last = cur === STAGES.length - 1;
      detail.innerHTML = `<h4>${cur + 1}. ${bi(g.en, g.zh)} <small>${r.tool} · ${bi(r.name[0], r.name[1])}</small></h4><p>${bi(g.what[0], g.what[1])}</p>
        <dl class="rg-kv">${g.kv(r).map(([ke, kz, v]) => `<dt>${bi(ke, kz)}</dt><dd>${B(v)}</dd>`).join('')}</dl>
        ${done ? `<div class="rg-verdict ${r.verdictCls}">${bi(r.verdict[0], r.verdict[1])}</div>` : ''}
        ${done && last ? `<div class="label">${bi('the shape of result.json (keys as tracer.py / splicecheck.py write them)', 'result.json 的形状（键名按 tracer.py / splicecheck.py 的写法）')}</div><pre class="rg-json">${jsonHtml(r.json)}</pre>` : ''}`;
      playBtn.innerHTML = timer ? bi('Pause', '暂停') : bi('▶ Run', '▶ 运行');
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    stagesEl.addEventListener('click', (e) => { const b = e.target.closest('.rg-st'); if (!b) return; stop(); shown = STAGES.length; cur = +b.dataset.i; render(); });
    runsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-run]'); if (!b) return;
      stop(); run = b.dataset.run; shown = STAGES.length;
      cur = RUNS[run].fail ? STAGES.findIndex((g) => g.id === RUNS[run].fail) : 4;
      render();
    });
    playBtn.addEventListener('click', () => {
      if (timer) { stop(); shown = STAGES.length; render(); return; }
      shown = 1; cur = 0;
      if (reduceMotion) { shown = STAGES.length; cur = STAGES.length - 1; render(); return; }
      timer = setInterval(() => {
        if (shown >= STAGES.length) { stop(); render(); return; }
        shown++; cur = shown - 1; render();
      }, 1200);
      render();
    });
    render();
  }

  const host = document.getElementById('gate');
  if (host) initGate(host);
})();
