// Olympus chapter 05 widgets: the A4 overhead explorer, the A5 region comparison, the A6 tile-boundary
// timeline with its SB0 mechanism, and FA-3's producer waits. Every constant below names the file it was
// generated from; all are from the final pass on F = 48360e9 unless their comment says otherwise.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh || en}</span>`;
  const int = (x) => Math.round(x).toLocaleString('en-US');
  const sgn = (x, d = 2) => (x < 0 ? '−' : '+') + Math.abs(x).toFixed(d);
  const pctS = (x, d = 2) => sgn(x, d) + '%';
  const sgnI = (x) => (x < 0 ? '−' : '+') + int(Math.abs(x));

  function S(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  // bilingual SVG text: one <text> per language; site.css hides the one not in use
  function T2(parent, attrs, en, zh) {
    const g = S('g', null, parent);
    S('text', Object.assign({ lang: 'en' }, attrs), g, en);
    S('text', Object.assign({ lang: 'zh-CN' }, attrs), g, zh == null ? en : zh);
    return g;
  }
  function hatch(defs, id, cls, size, angle) {
    const p = S('pattern', { id, width: size, height: size, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${angle || 45})` }, defs);
    S('line', { x1: 0, y1: 0, x2: 0, y2: size, class: cls }, p);
  }
  function grow(el, delay, origin) {
    if (reduceMotion || !el.animate) return;
    el.style.transformBox = 'fill-box';
    el.style.transformOrigin = origin || '0 50%';
    el.animate([{ transform: origin === '50% 100%' ? 'scaleY(0)' : 'scaleX(0)' }, { transform: 'none' }],
      { duration: 520, delay: delay || 0, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'backwards' });
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }
  function ticksFor(lo, hi, n) {
    const raw = (hi - lo) / (n || 5);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }

  // ---------- shared tooltip ----------
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
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
  }
  function hideTip() { tip.hidden = true; }
  function hover(el, html) {
    el.addEventListener('mouseenter', (ev) => showTip(typeof html === 'function' ? html() : html, ev));
    el.addEventListener('mousemove', moveTip);
    el.addEventListener('mouseleave', hideTip);
  }
  function press(btns, attr, value) { btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === value))); }

  // ---------- data ----------
  // A4, final pass on F = 48360e9. Source: /ws/runs/m7/final-48360e9/a4-table/a4-final/a4-final.json ("cells").
  // Overhead % [95% CI lo, hi], verdict (olympus.bench.a4.verdict), processes. G-Watch rows are per chunk
  // (chunk null = the whole set); a null value is a cell that was not timed, with the reason.
  const A4_CASES = ["t1_attention", "t1_axpy", "t1_matmul_bf16", "t1_softmax", "t2_cutlass_gemm", "t3_dg_1d2d_k2048", "t3_dg_1d2d_k512", "t3_fa3_fwd", "t3_flashmla_decode", "t4_cublas_nvjet"];
  const A4 = {"trace-mem":{"t1_attention":{"M6":[12.75,12.36,13.35,"FAIL",1],"GW":[["0",null,null,null,"outputs differ from the reference: ['o']"],["1",1.01,0.62,1.81,"pass"]]},"t1_axpy":{"M6":[27.15,26.88,29.83,"FAIL",1],"GW":[[null,10.4,8.78,12.92,"FAIL"]]},"t1_matmul_bf16":{"M6":[20.24,20.01,20.53,"FAIL",1],"GW":[["0",20.14,20.05,20.21,"FAIL"],["1",0.72,0.61,0.79,"pass"]]},"t1_softmax":{"M6":[31.62,30.29,33.34,"FAIL",1],"GW":[[null,27.67,26.21,28.71,"FAIL"]]},"t2_cutlass_gemm":{"M6":[1.66,1.1,2.11,"pass",1],"GW":[["0",4.26,3.93,4.7,"pass"],["1",1.64,1.26,2.0,"pass"],["2",0.4,0.05,0.88,"pass"]]},"t3_dg_1d2d_k2048":{"M6":[21.57,21.44,21.72,"FAIL",1],"GW":[["0",20.57,20.42,20.7,"FAIL"],["1",6.43,6.33,6.58,"FAIL"],["2",0.07,-0.05,0.23,"pass"]]},"t3_dg_1d2d_k512":{"M6":[32.42,31.94,32.79,"FAIL",1],"GW":[["0",33.49,33.11,33.93,"FAIL"],["1",6.12,5.74,6.39,"FAIL (CI)"]]},"t3_fa3_fwd":{"M6":[4.92,4.83,5.03,"pass",1],"GW":[["0",4.07,4.0,4.2,"pass"],["1",0.67,0.54,0.77,"pass"],["2",0.09,-0.01,0.15,"pass"]]},"t3_flashmla_decode":{"M6":[31.41,31.17,31.65,"FAIL",1],"GW":[["0",1.83,1.7,1.95,"pass"],["1",13.38,13.23,13.54,"FAIL"],["2",1.84,1.73,1.99,"pass"],["3",7.88,7.76,8.01,"FAIL"],["4",0.98,0.81,1.11,"pass"],["5",1.42,1.26,1.59,"pass"],["7",-0.01,-0.15,0.16,"pass"]]},"t4_cublas_nvjet":{"M6":[11.75,11.64,12.25,"FAIL",1],"GW":[["0",6.66,6.34,6.94,"FAIL"],["1",0.81,0.48,1.24,"pass"]]}},"trace-pp":{"t1_attention":{"M6":[13.83,13.36,14.24,"FAIL",1],"GW":[[null,null,null,null,"outputs differ from the reference: ['o']"]]},"t1_axpy":{"M6":[14.74,12.18,15.26,"FAIL",1],"GW":[[null,16.18,14.28,17.14,"FAIL"]]},"t1_matmul_bf16":{"M6":[2.64,2.53,2.74,"pass",1],"GW":[[null,8.92,8.82,9.01,"FAIL"]]},"t1_softmax":{"M6":[17.68,16.31,19.07,"FAIL",1],"GW":[[null,18.94,18.11,20.23,"FAIL"]]},"t2_cutlass_gemm":{"M6":[3.15,2.93,3.33,"FAIL (CI)",11],"GW":[[null,3.6,3.02,4.05,"FAIL"]]},"t3_dg_1d2d_k2048":{"M6":[6.26,6.12,6.37,"FAIL",1],"GW":[[null,11.72,11.64,11.89,"FAIL"]]},"t3_dg_1d2d_k512":{"M6":[8.86,8.58,9.18,"FAIL",1],"GW":[[null,27.46,27.33,27.75,"FAIL"]]},"t3_fa3_fwd":{"M6":[6.38,6.24,6.46,"FAIL",1],"GW":[[null,8.21,8.13,8.31,"FAIL"]]},"t3_flashmla_decode":{"M6":[2.33,2.21,2.45,"pass",1],"GW":[[null,3.22,3.04,3.37,"FAIL"]]},"t4_cublas_nvjet":{"M6":[1.66,1.2,2.23,"pass",1],"GW":[[null,3.35,3.21,3.98,"FAIL"]]}},"trace-sche":{"t1_attention":{"M6":[0.9,0.74,1.01,"pass (CI)",11],"GW":[[null,0.39,0.09,0.98,"pass"]]},"t1_axpy":{"M6":[12.45,9.56,12.86,"FAIL",1],"GW":[[null,12.15,8.96,12.99,"FAIL"]]},"t1_matmul_bf16":{"M6":[0.39,0.26,0.49,"pass",1],"GW":[[null,0.33,0.25,0.45,"pass"]]},"t1_softmax":{"M6":[3.4,2.43,4.13,"FAIL",1],"GW":[[null,4.57,3.9,5.46,"FAIL"]]},"t2_cutlass_gemm":{"M6":[0.06,-0.39,0.53,"pass",1],"GW":[[null,0.25,-0.17,0.7,"pass"]]},"t3_dg_1d2d_k2048":{"M6":[0.28,0.14,0.44,"pass",1],"GW":[[null,0.21,0.05,0.35,"pass"]]},"t3_dg_1d2d_k512":{"M6":[0.63,0.52,0.74,"pass",7],"GW":[[null,1.47,1.15,1.78,"FAIL"]]},"t3_fa3_fwd":{"M6":[0.03,-0.03,0.12,"pass",1],"GW":[[null,0.09,-0.01,0.14,"pass"]]},"t3_flashmla_decode":{"M6":[0.24,0.13,0.35,"pass",1],"GW":[[null,0.02,-0.07,0.17,"pass"]]},"t4_cublas_nvjet":{"M6":[0.11,-0.03,0.78,"pass",1],"GW":[[null,0.0,-0.34,0.63,"pass"]]}}};
  // The A/A control (identity), per case: % [CI lo, hi], processes. Source: a4-final.md, column "A/A".
  const AA = {"t1_attention":[-0.05,-0.23,0.14,11],"t1_axpy":[1.8,-1.96,2.46,1],"t1_matmul_bf16":[0.04,-0.05,0.13,1],"t1_softmax":[0.16,-0.49,1.24,1],"t2_cutlass_gemm":[0.13,-0.03,0.27,11],"t3_dg_1d2d_k2048":[-0.04,-0.21,0.09,1],"t3_dg_1d2d_k512":[0.1,0.0,0.21,7],"t3_fa3_fwd":[0.05,-0.06,0.12,1],"t3_flashmla_decode":[-0.16,-0.29,-0.03,1],"t4_cublas_nvjet":[0.06,-0.28,1.36,1]};

  // trace-mem like for like: M6 re-planned on each G-Watch chunk's own sites. [case, chunk, sites, M6 [%, lo, hi],
  // G-Watch [%, lo, hi]]. Source: /ws/runs/m7/final-48360e9/a4-table/chunks/chunks.json ("cells", "plan_not_timed").
  const CHUNKS = [["t1_attention",0,49,[10.76,10.32,11.11],[null,null,null,"outputs differ from the reference: ['o']"]],["t1_attention",1,12,[1.12,0.73,1.6],[1.01,0.62,1.81]],["t1_axpy",0,2,[13.31,12.0,14.59],[10.4,8.78,12.92]],["t1_matmul_bf16",0,49,[12.97,12.58,13.09],[20.14,20.05,20.21]],["t1_matmul_bf16",1,11,[0.67,0.55,0.76],[0.72,0.61,0.79]],["t1_softmax",0,14,[27.2,26.0,28.36],[27.67,26.21,28.71]],["t2_cutlass_gemm",0,63,[0.71,0.41,1.43],[4.26,3.93,4.7]],["t2_cutlass_gemm",1,63,[1.05,0.55,1.41],[1.64,1.26,2.0]],["t2_cutlass_gemm",2,12,[0.1,-0.4,0.63],[0.4,0.05,0.88]],["t3_dg_1d2d_k2048",0,63,[15.37,15.24,15.54],[20.57,20.42,20.7]],["t3_dg_1d2d_k2048",1,63,[6.21,6.02,6.36],[6.43,6.33,6.58]],["t3_dg_1d2d_k2048",2,28,[0.28,0.16,0.42],[0.07,-0.05,0.23]],["t3_dg_1d2d_k512",0,63,[27.39,26.99,27.84],[33.49,33.11,33.93]],["t3_dg_1d2d_k512",1,55,[5.03,4.81,5.3],[6.12,5.74,6.39]],["t3_fa3_fwd",0,60,[3.26,3.17,3.38],[4.07,4.0,4.2]],["t3_fa3_fwd",1,43,[0.51,0.45,0.63],[0.67,0.54,0.77]],["t3_fa3_fwd",2,12,[0.3,0.21,0.39],[0.09,-0.01,0.15]],["t3_flashmla_decode",0,63,[2.03,1.91,2.16],[1.83,1.7,1.95]],["t3_flashmla_decode",1,63,[13.4,13.27,13.56],[13.38,13.23,13.54]],["t3_flashmla_decode",2,63,[2.1,1.95,2.22],[1.84,1.73,1.99]],["t3_flashmla_decode",3,44,[8.71,8.53,8.83],[7.88,7.76,8.01]],["t3_flashmla_decode",4,63,[1.24,1.03,1.39],[0.98,0.81,1.11]],["t3_flashmla_decode",5,59,[1.86,1.7,2.02],[1.42,1.26,1.59]],["t3_flashmla_decode",7,24,[0.18,0.03,0.31],[-0.01,-0.15,0.16]],["t4_cublas_nvjet",0,62,[10.36,10.26,10.48],[6.66,6.34,6.94]],["t4_cublas_nvjet",1,19,[1.38,1.21,1.47],[0.81,0.48,1.24]]];
  const CHUNKS_NOT_TIMED = [{"case":"t3_flashmla_decode","chunk":6,"why":"the G-Watch oracle run never completed (no result.json)"}];

  // A5 per region, final pass. Source: /ws/runs/m7/final-48360e9/a5rep-m6-table/a5rep.json ("case_sets" -> "regions").
  // [case, set, region, verdict, intervals, then for p50 and for p95: Olympus median / min / max over runs,
  // G-Watch median / min / max, the A5 tolerance max(5%, 50 ns), the spread 2 x the larger range], ns.
  const A5 = [["t0_straight","trace-sche","warp","A5",65536,2271.0,2209,2295,2336.0,2330,2460,116.8,260.0,3867.0,3645,4318,3933.0,3741,4413,196.7,1346.0],["t0_straight","trace-pp","load","spread",65536,2175.0,2112,2236,2267.0,2220,2278,113.4,248.0,3662.0,3584,4092,4144.0,4022,4535,207.2,1026.0],["t0_straight","trace-pp","compute","spread",65536,45.0,45,46,53.0,53,54,50,2.0,152.0,146,221,343.0,298,404,50,212.0],["t0_straight","trace-pp","store","EXCEEDS",65536,13.0,13,13,36.0,36,37,50,2.0,87.0,83,110,413.0,392,448,50,112.0],["t0_straight","trace-pp","warp","spread",65536,2332.0,2274,2401,2559.0,2548,2561,128.0,254.0,3870.0,3770,4319,4572.0,4458,5066,228.6,1216.0],["t1_matmul_bf16","trace-pp","prologue","A5",4096,1473.0,1470,1474,1418.0,1415,1430,70.9,30.0,2377.0,2326,2453,2399.0,2017,2653,120.0,1272.0],["t1_matmul_bf16","trace-pp","mma_issue","EXCEEDS",262144,71.0,71,71,63.0,63,64,50,2.0,203.0,203,205,131.0,131,132,50,4.0],["t1_matmul_bf16","trace-pp","mma_wait","A5",262144,20.0,19,20,33.0,32,33,50,2.0,68.0,68,68,39.0,39,40,50,2.0],["t1_matmul_bf16","trace-pp","bar","A5",262144,21.0,21,21,31.0,31,31,50,0.0,25.0,25,25,35.0,35,35,50,0.0],["t1_matmul_bf16","trace-pp","convert","A5",4096,37.0,36,37,51.0,51,51,50,2.0,45.0,45,45,59.0,59,60,50,2.0],["t1_matmul_bf16","trace-pp","warp","EXCEEDS",4096,45644.0,45437,45956,48566.0,48374,49173,2428.3,1598.0,49675.0,49433,49941,53141.0,52470,53717,2657.1,2494.0],["t2_cutlass_gemm","trace-pp","setup","A5",1584,617.0,601,641,619.0,613,624,50,80.0,773.0,762,829,764.0,760,780,50,134.0],["t2_cutlass_gemm","trace-pp","setup_bar","A5",1584,22.0,21,22,28.0,27,28,50,2.0,29.0,28,29,36.0,34,37,50,6.0],["t2_cutlass_gemm","trace-pp","c.setmaxreg","spread",1056,802.0,778,845,857.0,834,869,50,134.0,874.0,842,945,927.0,924,943,50,206.0],["t2_cutlass_gemm","trace-pp","c.k_wait","A5",516096,77.0,72,96,83.0,81,85,50,48.0,397.0,380,420,385.0,357,403,50,92.0],["t2_cutlass_gemm","trace-pp","c.mma_issue","A5",516096,110.0,100,118,112.0,108,119,50,36.0,200.0,198,202,179.0,177,181,50,8.0],["t2_cutlass_gemm","trace-pp","c.mma_wait","A5",516096,39.0,37,42,35.0,35,36,50,10.0,102.0,101,103,56.0,55,57,50,4.0],["t2_cutlass_gemm","trace-pp","c.release","A5",516096,26.0,26,26,37.0,37,37,50,0.0,35.0,35,35,46.0,46,47,50,2.0],["t2_cutlass_gemm","trace-pp","c.k_iter","A5",516096,316.0,314,317,310.0,309,311,50,6.0,529.0,514,551,542.0,516,560,50,88.0],["t2_cutlass_gemm","trace-pp","c.acc_drain","A5",8192,270.0,263,284,220.0,206,222,50,42.0,298.0,294,299,267.0,266,269,50,10.0],["t2_cutlass_gemm","trace-pp","c.epi_convert","A5",8192,297.0,295,298,304.0,304,306,50,6.0,335.0,334,337,360.0,360,363,50,6.0],["t2_cutlass_gemm","trace-pp","c.epi_store","EXCEEDS",8192,857.0,842,861,1025.0,1010,1033,51.2,46.0,1057.0,1034,1066,1229.0,1216,1236,61.5,64.0],["t2_cutlass_gemm","trace-pp","c.sched","A5",8192,307.0,303,309,289.0,288,291,50,12.0,432.0,430,435,408.0,407,411,50,10.0],["t2_cutlass_gemm","trace-pp","c.tile","A5",8192,24388.0,24009,24891,25061.0,24992,25543,1253.1,1764.0,31519.0,30986,32570,31802.0,30587,31963,1590.1,3168.0],["t2_cutlass_gemm","trace-pp","pwg.setmaxreg","A5",528,576.0,559,606,614.0,603,626,50,94.0,774.0,745,810,820.0,804,831,50,130.0],["t2_cutlass_gemm","trace-pp","p.k_wait","EXCEEDS",65536,223.0,222,224,147.0,146,149,50,6.0,513.0,495,532,467.0,429,492,50,126.0],["t2_cutlass_gemm","trace-pp","p.k_issue","A5",65536,78.0,77,79,102.0,101,103,50,4.0,102.0,101,103,120.0,119,121,50,4.0],["t2_cutlass_gemm","trace-pp","p.k_iter","A5",65536,330.0,329,331,297.0,296,299,50,6.0,625.0,603,635,601.0,564,624,50,120.0],["t2_cutlass_gemm","trace-pp","p.tile","spread",1916,2143.0,1974,2800,2390.0,2354,2672,119.5,1652.0,26625.0,26499,26837,26732.0,25715,26832,1336.6,2234.0],["t3_dg_1d2d_k512","trace-pp","warp","EXCEEDS",1584,29564.0,29341,29693,34903.0,34745,34935,1745.2,704.0,30749.0,30680,30904,36695.0,36599,36759,1834.8,448.0],["t3_dg_1d2d_k512","trace-pp","c.sched","EXCEEDS",8224,249.0,248,252,307.0,307,309,50,8.0,423.0,416,426,1207.0,1192,1219,60.4,54.0],["t3_dg_1d2d_k512","trace-pp","c.tile","EXCEEDS",7168,4055.0,4040,4080,4857.0,4844,4868,242.9,80.0,5159.0,5150,5183,5280.0,5266,5307,264.0,82.0],["t3_dg_1d2d_k512","trace-pp","c.bscale_load","A5",7168,49.0,49,49,50.0,50,50,50,0.0,400.0,395,413,449.0,429,500,50,142.0],["t3_dg_1d2d_k512","trace-pp","c.bscale_bar","A5",7168,14.0,14,14,20.0,20,20,50,0.0,16.0,16,17,22.0,22,22,50,2.0],["t3_dg_1d2d_k512","trace-pp","c.kb0.wait","A5",7168,51.0,51,52,54.0,54,55,50,2.0,1073.0,1024,1134,1082.0,890,1139,54.1,498.0],["t3_dg_1d2d_k512","trace-pp","c.kb0.math","A5",7168,650.0,645,652,654.0,654,657,50,14.0,746.0,745,753,746.0,746,748,50,16.0],["t3_dg_1d2d_k512","trace-pp","c.kb1.wait","A5",7168,52.0,52,52,62.0,61,62,50,2.0,55.0,55,56,70.0,70,70,50,2.0],["t3_dg_1d2d_k512","trace-pp","c.kb1.math","A5",7168,605.0,602,607,606.0,605,609,50,10.0,655.0,654,661,648.0,647,650,50,14.0],["t3_dg_1d2d_k512","trace-pp","c.kb2.wait","A5",7168,92.0,91,92,101.0,101,102,50,2.0,127.0,125,143,123.0,122,125,50,36.0],["t3_dg_1d2d_k512","trace-pp","c.kb2.math","A5",7168,591.0,588,594,590.0,589,593,50,12.0,633.0,631,637,632.0,631,635,50,12.0],["t3_dg_1d2d_k512","trace-pp","c.kb3.wait","A5",7168,95.0,95,96,103.0,103,104,50,2.0,126.0,115,258,122.0,121,128,50,286.0],["t3_dg_1d2d_k512","trace-pp","c.kb3.math","A5",7168,645.0,643,650,644.0,642,647,50,14.0,689.0,682,729,686.0,682,687,50,94.0],["t3_dg_1d2d_k512","trace-pp","c.epi.store_wait","A5",7168,32.0,32,33,51.0,51,51,50,2.0,44.0,44,45,66.0,66,66,50,2.0],["t3_dg_1d2d_k512","trace-pp","c.epi.bar1","A5",7168,17.0,17,17,25.0,24,25,50,2.0,48.0,36,50,68.0,67,70,50,28.0],["t3_dg_1d2d_k512","trace-pp","c.epi.stsm","A5",7168,314.0,312,318,325.0,323,327,50,12.0,506.0,502,508,504.0,503,508,50,12.0],["t3_dg_1d2d_k512","trace-pp","c.epi.bar2","A5",7168,45.0,45,45,35.0,35,36,50,2.0,169.0,162,173,134.0,126,134,50,22.0],["t3_dg_1d2d_k512","trace-pp","c.epi.tma_issue","EXCEEDS",7168,72.0,70,73,67.0,66,67,50,6.0,322.0,320,327,263.0,261,267,50,14.0],["t3_dg_1d2d_k512","trace-pp","p.sched","A5",1028,153.0,150,153,173.0,172,174,50,6.0,231.0,222,239,250.0,233,270,50,74.0],["t3_dg_1d2d_k512","trace-pp","p.tile","EXCEEDS",896,4022.0,4013,4056,4946.0,4927,4953,247.3,86.0,4328.0,4287,4398,5212.0,5207,5229,260.6,222.0],["t3_dg_1d2d_k512","trace-pp","p.kb0.wait","EXCEEDS",896,418.0,398,420,363.0,354,366,50,44.0,465.0,463,470,434.0,429,437,50,16.0],["t3_dg_1d2d_k512","trace-pp","p.kb0.issue","A5",896,170.0,169,172,179.0,179,181,50,6.0,231.0,229,232,232.0,231,234,50,6.0],["t3_dg_1d2d_k512","trace-pp","p.kb1.wait","A5",896,432.0,427,434,415.0,413,417,50,14.0,495.0,494,505,475.0,472,477,50,22.0],["t3_dg_1d2d_k512","trace-pp","p.kb1.issue","A5",896,93.0,90,94,108.0,105,109,50,8.0,145.0,144,146,153.0,151,154,50,6.0],["t3_dg_1d2d_k512","trace-pp","p.kb2.wait","A5",896,489.0,488,493,489.0,488,490,50,10.0,570.0,566,589,542.0,541,551,50,46.0],["t3_dg_1d2d_k512","trace-pp","p.kb2.issue","A5",896,97.0,95,99,103.0,101,105,50,8.0,123.0,122,123,125.0,122,126,50,8.0],["t3_dg_1d2d_k512","trace-pp","p.kb3.wait","EXCEEDS",896,1984.0,1973,1993,2851.0,2829,2858,142.6,58.0,2240.0,2231,2324,3146.0,3130,3173,157.3,186.0],["t3_dg_1d2d_k512","trace-pp","p.kb3.issue","A5",896,112.0,111,117,116.0,114,117,50,12.0,141.0,140,144,149.0,147,154,50,14.0],["t3_dg_1d2d_k512","trace-pp","p.drain","A5",132,1796.0,1790,1813,1793.0,1791,1801,89.7,46.0,1848.0,1842,1864,1831.0,1824,1836,91.6,44.0],["t4_cublas_nvjet","trace-sche","warp","A5",1584,1259514.0,1259132,1260059,1260022.0,1259254,1261814,63001.1,5120.0,1353499.0,1352636,1354010,1353750.0,1352118,1354454,67687.5,4672.0],["t4_cublas_nvjet","trace-pp","warp","A5",1584,1280667.0,1278747,1282651,1298838.0,1297366,1302102,64941.9,9472.0,1374716.0,1374106,1377436,1396054.0,1394198,1399670,69802.7,10944.0],["t4_cublas_nvjet","trace-pp","c.kb.wait","A5",1136800,21.0,21,22,31.0,31,31,50,2.0,182.0,180,184,220.0,218,223,50,10.0],["t4_cublas_nvjet","trace-pp","c.kbB.wait","A5",567136,21.0,21,21,30.0,30,31,50,2.0,165.0,163,168,200.0,192,202,50,20.0],["t4_cublas_nvjet","trace-pp","c.kb.math","A5",1703936,777.0,776,779,776.0,775,779,50,8.0,833.0,832,835,847.0,845,849,50,8.0],["t4_cublas_nvjet","trace-pp","c.epi","EXCEEDS",13312,2082.0,2057,2096,2052.0,2047,2058,102.6,78.0,2586.0,2577,2602,2369.0,2330,2403,118.5,146.0],["t4_cublas_nvjet","trace-pp","c.epi.prep","EXCEEDS",13312,284.0,281,286,284.0,283,285,50,10.0,357.0,347,361,438.0,430,445,50,30.0],["t4_cublas_nvjet","trace-pp","c.epi.store","EXCEEDS",13312,1807.0,1788,1819,1765.0,1761,1769,88.2,62.0,2252.0,2241,2265,2050.0,2001,2084,102.5,166.0],["t4_cublas_nvjet","trace-pp","c.sched","EXCEEDS",13312,163.0,163,164,354.0,354,356,50,4.0,233.0,232,233,444.0,436,462,50,52.0],["t4_cublas_nvjet","trace-pp","p.kb.wait","A5",142100,654.0,654,655,651.0,650,652,50,4.0,717.0,716,718,746.0,745,747,50,4.0],["t4_cublas_nvjet","trace-pp","p.kbB.wait","A5",70892,645.0,644,646,643.0,642,644,50,4.0,707.0,706,709,745.0,742,746,50,8.0],["t4_cublas_nvjet","trace-pp","p.kb.issue","A5",212992,158.0,158,158,173.0,173,173,50,0.0,178.0,177,178,196.0,196,197,50,2.0],["t4_cublas_nvjet","trace-pp","p.sched_wait","A5",1532,67.0,67,67,80.0,79,80,50,2.0,73.0,73,74,89.0,87,89,50,4.0],["t4_cublas_nvjet","trace-pp","s.tile","A5",766,105759.0,105709,106035,107402.0,107162,107626,5370.1,928.0,106585.0,106387,106886,108155.0,107953,108414,5407.8,998.0]];
  const A5_TOTALS = {"regions_compared":72,"regions_refused":8,"A5":51,"spread":5,"EXCEEDS":16,"exceeds_olympus_longer":6,"exceeds_olympus_shorter":10,"sites_equal_all_runs":568,"sites_undeclared":568,"pair_rate_equal":72,"sites_refused":5};

  // A6 per-warp p50 cycles of each phase (warps 0-7), the last arriver at the B-scale barrier after each CTA's
  // first tile, and the pooled p50s [cycles, ns]. Source: /ws/runs/m7/final-48360e9/a6/a6/a6.json ("pooled").
  const A6_WARPS = {"M6":{"sched":[421,448,452,445,424,444,460,442],"bscale_arrive":[80,641,109,109,107,109,109,107],"bscale_wait":[579,40,666,695,587,723,698,720],"epi_tma":[426,0,0,0,437,0,0,0],"last":{"0":0.144,"1":0.572,"4":0.284},"p50":{"tile":[7129,4105.0],"sched":[444,256.0],"bscale":[778,450.0],"bscale_wait":[622,359.5],"epi_wait":[92,53.0],"epi_stsm":[619,357.0],"epi_tma":[432,249.5],"kb0":[4211,2425.0],"kb_mid":[4086,2353.0]},"mhz":[1733,1729,1737]},"GW":{"sched":[1822,453,451,451,1588,536,543,537],"bscale_arrive":[93,752,123,123,121,125,125,125],"bscale_wait":[49,1573,2205,2209,1168,2287,2277,2290],"epi_tma":[356,0,0,0,214,0,0,0],"last":{"0":0.708,"1":0.001,"4":0.291},"p50":{"tile":[8819,5022.0],"sched":[546,311.0],"bscale":[2216,1262.0],"bscale_wait":[1944,1107.0],"epi_wait":[135,77.0],"epi_stsm":[657,374.0],"epi_tma":[273,155.5],"kb0":[5919,3371.0],"kb_mid":[5461,3110.0]},"mhz":[1756,1756,1756,1756,1756]}};

  // A6 means per consumer warp-tile, cycles at each run's clock (mhz). Source: /ws/runs/m7/final-48360e9/a6/a6-ncu/a6ncu.json
  // ("uninstrumented_phases" for the kernel under ncu, "traces" for M6 and G-Watch). epi_tma is the store leaders only;
  // for the uninstrumented kernel it is a lower bound (tma_max the upper). loader: warp 1's B-scale load per tile.
  const A6_MEANS = {"ncu":{"mhz":1766.4,"c":{"tile":6651,"sched":399,"bscale":804,"bscale_arrive":144,"bscale_wait":644,"epi_wait":37,"epi_stsm":609,"epi_tma":164,"epi_total":764},"tma_max":471,"loader":{"arrival":978,"block":953,"ldg_wait":725}},"M6":{"mhz":1732.6,"c":{"tile":7326,"sched":486,"bscale":815,"bscale_arrive":183,"bscale_wait":632,"epi_wait":96,"epi_stsm":676,"epi_tma":428,"epi_total":979}},"GW":{"mhz":1756.0,"c":{"tile":8834,"sched":827,"bscale":1873,"bscale_arrive":205,"bscale_wait":1669,"epi_wait":142,"epi_stsm":673,"epi_tma":368,"epi_total":991}}};
  // PLAN.md 2.4 (source-level counters, 2026-09-27), cycles at 1.7 GHz. Source: a6.json ("ground_truth", "gt_sm_ghz").
  const A6_GT = {"tile":7200,"tile_body":7200,"sched":580,"bscale":520,"bscale_arrive":520,"epi_wait":175,"epi_stsm":850,"epi_tma":370,"epi_total":1395,"kb0":4400,"kb_mid":2350,"kb_mid_waited":2350};
  const A6_GT_GHZ = 1.7;

  // M4 (the fenced planner, not shipped): means in cycles at its median run clock, and a few p50s [cycles, ns].
  // Not part of the final pass: from the earlier run /ws/runs/m7/ares/20260929T075036Z-a6-final/a6/a6.json
  // ("pooled", label M4; DECISIONS 72).
  const A6_M4 = {"mhz":1753.3,"c":{"tile":10712,"sched":727,"bscale":2229,"bscale_arrive":2065,"bscale_wait":165,"epi_wait":364,"epi_stsm":985,"epi_tma":1877,"epi_total":1954},"p50":{"tile":[10602,6054.5],"sched":[670,383.0],"bscale":[2618,1492.0]}};

  // FA-3 producer waits, M6, final pass. Computed for this page (read-only, CPU) by /ws/scratch/ares-tut/fa3_kv.py
  // from /ws/runs/m7/final-48360e9/m6-trace/t3_fa3_fwd/trace-pp/d1024/trace-pp.olyt (output fa3_kv.json), ns.
  // hist[i] counts intervals in [edges[i], edges[i+1]); the last bin is open. sites: id -> [intervals, p50, p95].
  const FA3 = {"p.k_wait":{"intervals":6144,"p05":44.0,"p25":1420.0,"p50":1616.0,"p75":1695.0,"p95":1827.0,"mean":1409.9287109375,"min":38.0,"max":5214.0,"hist":[381,593,9,5,12,35,7,131,125,78,460,3581,459,6,126,4,0,132],"sites":{"45":[512,53.0,267],"47":[512,53.0,84],"49":[2560,1627.0,4182],"51":[2560,1658.0,2258]}},"p.v_wait":{"intervals":6144,"p05":44.0,"p25":51.0,"p50":54.0,"p75":60.0,"p95":1650.8499999999995,"mean":197.09000651041666,"min":39.0,"max":1967.0,"hist":[1060,4236,61,118,124,33,0,0,0,0,10,407,95,0,0,0,0,0],"sites":{"53":[512,51.0,198],"55":[2560,54.0,87],"57":[2560,54.0,107],"59":[512,1669.0,1816]}},"c.iter":{"intervals":45056,"p05":1897.0,"p25":1944.0,"p50":1976.0,"p75":2011.0,"p95":2122.0,"mean":1987.2816716974432,"min":1557.0,"max":2812.0,"hist":[0,0,0,0,0,0,0,0,0,0,0,471,30491,13283,446,365,0,0],"sites":{"17":[45056,1976.0,2122]}},"edges":[0,50,100,150,200,300,400,600,800,1000,1250,1500,1750,2000,2250,2500,3000,4000]};

  // =====================================================================
  // 1. A4 overhead explorer
  // =====================================================================
  function initOverhead(host) {
    const svg = $('svg', host), readouts = $('.readouts', host), status = $('.fd-status', host);
    const setBtns = $$('[data-pset]', host);
    const el = { m6: $('#ovx-m6', host), gw: $('#ovx-gw', host), aa: $('#ovx-aa', host), ch: $('#ovx-chunks', host), zoom: $('#ovx-zoom', host) };
    const TARGET = { 'trace-sche': 1, 'trace-pp': 3, 'trace-mem': 6 };
    let set = 'trace-pp';

    const ntText = (why) => /never completed|no result/.test(why || '') ? bi('no G-Watch result (its run never completes)', '没有 G-Watch 结果（它的运行从未完成）')
      : /outputs differ/.test(why || '') ? bi('wrong outputs: not timed', '输出错误：未计时') : bi('not timed', '未计时');
    const ntShort = (why) => /never completed|no result/.test(why || '') ? ['no G-Watch result', '无 G-Watch 结果'] : ['wrong outputs, not timed', '输出错误，未计时'];

    function groups() {
      if (el.ch.checked) {
        const out = [];
        CHUNKS.forEach(([c, k, sites, m, g]) => {
          out.push({ label: c, sub: [`c${k} · ${sites} sites`, `c${k} · ${sites} 个插桩点`], bars: [
            { tool: 'oly', tag: 'M6', v: m[0], lo: m[1], hi: m[2], nt: m[3] },
            { tool: 'gw', tag: `c${k}`, v: g[0], lo: g[1], hi: g[2], nt: g[3] }] });
          const miss = CHUNKS_NOT_TIMED.find((x) => x.case === c && x.chunk === k + 1);
          if (miss) out.push({ label: c, sub: [`c${miss.chunk}`, `c${miss.chunk}`], bars: [{ tool: 'gw', tag: `c${miss.chunk}`, v: null, nt: miss.why }] });
        });
        return out;
      }
      return A4_CASES.map((c) => {
        const cell = A4[set][c];
        const bars = [{ tool: 'oly', tag: 'M6', v: cell.M6[0], lo: cell.M6[1], hi: cell.M6[2], verdict: cell.M6[3], procs: cell.M6[4] }];
        cell.GW.forEach((g) => bars.push({ tool: 'gw', tag: g[0] == null ? 'G-Watch' : `c${g[0]}`, chunk: g[0], v: g[1], lo: g[2], hi: g[3],
          verdict: g[1] == null ? null : g[4], nt: g[1] == null ? g[4] : null }));
        if (set === 'trace-mem') CHUNKS_NOT_TIMED.filter((x) => x.case === c).forEach((x) => bars.push({ tool: 'gw', tag: `c${x.chunk}`, chunk: String(x.chunk), v: null, nt: x.why }));
        const gw = bars.filter((b) => b.tool === 'gw').sort((a, b) => (+a.chunk || 0) - (+b.chunk || 0));
        bars.splice(1, gw.length, ...gw);
        bars.push({ tool: 'aa', tag: 'A/A', v: AA[c][0], lo: AA[c][1], hi: AA[c][2], procs: AA[c][3] });
        return { label: c, bars };
      });
    }

    function draw(animate) {
      const t = TARGET[set];
      const show = { oly: el.m6.checked, gw: el.gw.checked, aa: el.aa.checked };
      const gs = groups().map((g) => ({ ...g, bars: g.bars.filter((b) => show[b.tool]) })).filter((g) => g.bars.length);
      const vals = [];
      gs.forEach((g) => g.bars.forEach((b) => { if (b.v != null) vals.push(b.lo, b.hi, b.v); }));
      const minLo = Math.min(0, ...vals);
      let xmax = el.zoom.checked ? 3 * t : niceMax(Math.max(t * 1.25, ...vals) * 1.04);
      let xmin = minLo < 0 ? -Math.max(0.5, Math.ceil(-minLo * 2) / 2) : 0;
      if (el.zoom.checked) xmin = Math.max(xmin, -t * 0.5);
      const X0 = 214, X1 = 812, W = X1 - X0;
      const sx = (v) => X0 + ((Math.min(Math.max(v, xmin), xmax) - xmin) / (xmax - xmin)) * W;
      const BH = 10, GAP = 4, GP = 9;
      let y = 34;
      const layout = gs.map((g) => { const top = y; y += GP + g.bars.length * (BH + GAP) + 3; return { g, top }; });
      const H = Math.max(y + 12, 120);
      svg.setAttribute('viewBox', `0 0 880 ${H}`);
      svg.innerHTML = '';
      const defs = S('defs', null, svg);
      hatch(defs, 'ovx-hatch', 'hatch-line', 5);
      // alternating bands per group
      layout.forEach(({ g, top }, i) => { if (i % 2 === 0) S('rect', { x: 0, y: top - 3, width: 880, height: GP + g.bars.length * (BH + GAP) + 3, class: 'row-band' }, svg); });
      // grid and axis
      ticksFor(xmin, xmax, 6).forEach((v) => {
        S('line', { x1: sx(v), y1: 24, x2: sx(v), y2: H - 8, class: v === 0 ? 'zero' : 'grid' }, svg);
        S('text', { x: sx(v), y: 18, class: 't-sm muted', 'text-anchor': 'middle' }, svg, (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%');
      });
      S('line', { x1: sx(t), y1: 24, x2: sx(t), y2: H - 8, class: 'target' }, svg);
      T2(svg, { x: sx(t) + 4, y: 32, class: 't-sm strong' }, `target ${t}%`, `目标 ${t}%`);

      let k = 0;
      layout.forEach(({ g, top }) => {
        S('text', { x: 8, y: top + GP + 8, class: 't-sm' }, svg, g.label);
        if (g.sub) T2(svg, { x: 8, y: top + GP + 21, class: 't-xs muted' }, g.sub[0], g.sub[1]);
        g.bars.forEach((b, j) => {
          const by = top + GP + j * (BH + GAP);
          const cls = b.tool === 'oly' ? 'oly' : b.tool === 'gw' ? 'gw' : 'muted';
          S('text', { x: X0 - 8, y: by + 8.5, class: `t-xs ${cls}`, 'text-anchor': 'end' }, svg, b.tag);
          if (b.v == null) {
            const r = S('rect', { x: sx(0), y: by, width: 150, height: BH, class: 'b-nt' }, svg);
            const [en, zh] = ntShort(b.nt);
            T2(svg, { x: sx(0) + 156, y: by + 8.5, class: 't-xs muted' }, en, zh);
            const hit = S('rect', { x: 0, y: by - 2, width: 880, height: BH + GAP, class: 'hit' }, svg);
            hover(hit, `<b>${g.label}</b> · ${b.tag}<br>${ntText(b.nt)}`);
            if (animate) grow(r, k * 18);
            k++;
            return;
          }
          const z = sx(0), a = sx(Math.min(b.v, t)), e = sx(b.v);
          const base = b.tool === 'aa' ? 'b-aa' : `b-${cls}`;
          const parts = [];
          if (b.tool !== 'aa' && b.v > t) {
            parts.push(S('rect', { x: z, y: by, width: Math.max(a - z, 0.5), height: BH, rx: 1.5, class: base }, svg));
            parts.push(S('rect', { x: a, y: by, width: Math.max(e - a, 0.5), height: BH, rx: 1.5, class: base + '-over' }, svg));
          } else {
            parts.push(S('rect', { x: Math.min(z, e), y: by, width: Math.max(Math.abs(e - z), 1), height: BH, rx: 1.5, class: base }, svg));
          }
          const cy = by + BH / 2;
          S('line', { x1: sx(b.lo), y1: cy, x2: sx(b.hi), y2: cy, class: 'whisk' }, svg);
          S('line', { x1: sx(b.lo), y1: cy - 3.5, x2: sx(b.lo), y2: cy + 3.5, class: 'whisk' }, svg);
          S('line', { x1: sx(b.hi), y1: cy - 3.5, x2: sx(b.hi), y2: cy + 3.5, class: 'whisk' }, svg);
          if (b.v > xmax || b.hi > xmax) S('path', { d: `M${X1 + 2},${cy - 5} l6,5 l-6,5 z`, class: 'clip-mark' }, svg);
          const ok = b.tool === 'aa' ? null : b.v <= t;
          const lab = pctS(b.v) + (ok == null ? '' : ok ? ' ✓' : ' ✗') + (b.verdict && /\(CI\)/.test(b.verdict) ? ' (CI)' : '');
          S('text', { x: Math.min(Math.max(sx(b.hi), e) + 6, X1 + 12), y: by + 8.5, class: `t-xs ${cls}` }, svg, lab);
          const hit = S('rect', { x: 0, y: by - 2, width: 880, height: BH + GAP, class: 'hit' }, svg);
          const who = b.tool === 'oly' ? 'Olympus M6' : b.tool === 'gw' ? 'G-Watch 0.0.35' : bi('A/A control (identity)', 'A/A 对照（identity）');
          const scope = b.tool === 'gw' && b.chunk != null ? bi(`chunk ${b.chunk}`, `第 ${b.chunk} 块`) : b.tool === 'oly' && set === 'trace-mem' && !el.ch.checked ? bi('whole set, one run', '整个集合，一次运行') : '';
          const verdict = ok == null ? '' : `<br>${ok ? bi('within', '达标：') : bi('over', '超标：')} ${bi(`the ${t}% target`, `目标 ${t}%`)}${b.verdict && /\(CI\)/.test(b.verdict) ? bi(', CI straddles it', '，CI 跨过目标线') : ''}`;
          const procs = b.procs && b.procs > 1 ? `<br>${bi(`${b.procs} processes, CI over processes`, `${b.procs} 个进程，CI 以进程重采样`)}` : '';
          hover(hit, `<b>${g.label}</b>${g.sub ? ' · ' + bi(g.sub[0], g.sub[1]) : ''} · ${set}<br>${who}${scope ? ' · ' + scope : ''}<br>${pctS(b.v)} [${sgn(b.lo)}, ${sgn(b.hi)}]${verdict}${procs}`);
          if (animate) parts.forEach((p) => grow(p, k * 18));
          k++;
        });
      });

      // readouts
      const within = (v) => v != null && v <= t;
      if (el.ch.checked) {
        const m = CHUNKS.filter((c) => c[3][0] != null), g = CHUNKS.filter((c) => c[4][0] != null);
        const both = CHUNKS.filter((c) => c[3][0] != null && c[4][0] != null);
        readouts.innerHTML = `
          <div class="readout key"><span class="k">${bi('Olympus M6 within 6%', 'Olympus M6 在 6% 以内')}</span><span class="v">${m.filter((c) => within(c[3][0])).length} / ${m.length}</span><span class="s">${bi("chunks, on G-Watch's own sites", '分块，使用 G-Watch 自己的插桩点')}</span></div>
          <div class="readout key"><span class="k">${bi('G-Watch within 6%', 'G-Watch 在 6% 以内')}</span><span class="v">${g.filter((c) => within(c[4][0])).length} / ${g.length}</span><span class="s">${bi('chunks timed', '已计时的分块')}</span></div>
          <div class="readout"><span class="k">${bi('M6 lower', 'M6 更低')}</span><span class="v">${both.filter((c) => c[3][0] < c[4][0]).length} / ${both.length}</span><span class="s">${bi('chunks timed for both', '两者都计时的分块')}</span></div>`;
        status.innerHTML = bi('trace-mem, like for like: M6 planned on exactly the sites of each G-Watch chunk (at most 63 each).', 'trace-mem 同口径比较：M6 在每个 G-Watch 分块（每块至多 63 个插桩点）完全相同的插桩点上规划。');
        return;
      }
      let mIn = 0, gIn = 0, gN = 0, gSetIn = 0, gSetN = 0, lower = 0, cmp = 0;
      A4_CASES.forEach((c) => {
        const cell = A4[set][c];
        if (within(cell.M6[0])) mIn++;
        const timed = cell.GW.filter((x) => x[1] != null);
        gN += timed.length; gIn += timed.filter((x) => within(x[1])).length;
        const missing = set === 'trace-mem' && CHUNKS_NOT_TIMED.some((x) => x.case === c);
        if (timed.length) { gSetN++; if (timed.length === cell.GW.length && !missing && timed.every((x) => within(x[1]))) gSetIn++; }
        if (set !== 'trace-mem' && timed.length === 1 && cell.GW.length === 1) { cmp++; if (cell.M6[0] < timed[0][1]) lower++; }
      });
      const gSub = set === 'trace-mem' ? bi(`chunks; per set ${gSetIn} / ${gSetN} (every chunk within)`, `分块；按集合为 ${gSetIn} / ${gSetN}（所有分块都达标）`) : bi('kernels G-Watch can time', 'G-Watch 能计时的 kernel');
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi(`Olympus M6 within ${t}%`, `Olympus M6 在 ${t}% 以内`)}</span><span class="v">${mIn} / ${A4_CASES.length}</span><span class="s">${set === 'trace-mem' ? bi('whole sets', '整个集合') : bi('T1–T4 kernels', 'T1–T4 kernel')}</span></div>
        <div class="readout key"><span class="k">${bi(`G-Watch within ${t}%`, `G-Watch 在 ${t}% 以内`)}</span><span class="v">${gIn} / ${gN}</span><span class="s">${gSub}</span></div>
        <div class="readout"><span class="k">${bi('M6 below G-Watch', 'M6 低于 G-Watch')}</span><span class="v">${set === 'trace-mem' ? '—' : `${lower} / ${cmp}`}</span><span class="s">${set === 'trace-mem' ? bi('whole set against chunks is not like for like: tick the chunk view', '整个集合对分块不是同口径：请勾选分块视图') : bi('kernels both tools timed', '两个工具都计时的 kernel')}</span></div>
        <div class="readout"><span class="k">${bi('A/A floor', 'A/A 下限')}</span><span class="v">≈ ±0.5%</span><span class="s">${bi('identity against the original; tick "A/A control"', 'identity 对原 kernel；勾选“A/A 对照”')}</span></div>`;
      const what = { 'trace-sche': bi('trace-sche: a timestamp at each warp\'s entry and exit (plus the SM id at entry).', 'trace-sche：每个 warp 的入口和出口各记一个时间戳（入口另记 SM id）。'),
        'trace-pp': bi('trace-pp: a timestamp before and after every pipeline stage.', 'trace-pp：每个流水线阶段的前后各记一个时间戳。'),
        'trace-mem': bi('trace-mem: every memory instruction, with its address and a timestamp. Olympus traces the whole set in one run; G-Watch one chunk per run.', 'trace-mem：每条访存指令，记地址和时间戳。Olympus 一次运行追踪整个集合，G-Watch 每次运行一个分块。') };
      status.innerHTML = what[set];
    }

    setBtns.forEach((b) => b.addEventListener('click', () => {
      set = b.dataset.pset; press(setBtns, 'pset', set);
      if (set !== 'trace-mem') el.ch.checked = false;
      draw(true);
    }));
    el.ch.addEventListener('change', () => {
      if (el.ch.checked && set !== 'trace-mem') { set = 'trace-mem'; press(setBtns, 'pset', set); }
      draw(true);
    });
    [el.m6, el.gw, el.aa, el.zoom].forEach((e) => e.addEventListener('change', () => draw(true)));
    draw(false);
  }

  // =====================================================================
  // 2. A5 region comparison
  // =====================================================================
  function initA5(host) {
    const svg = $('svg', host), detail = $('.fd-a5-detail', host), readouts = $('.readouts', host);
    const chips = $$('[data-grp]', host), statBtns = $$('[data-stat]', host);
    let grp = 'k512', stat = 'p50', sel = null;
    const GRP = {
      k512: (r) => r[0] === 't3_dg_1d2d_k512', t2: (r) => r[0] === 't2_cutlass_gemm', nvjet: (r) => r[0] === 't4_cublas_nvjet',
      matmul: (r) => r[0] === 't1_matmul_bf16', t0: (r) => r[0] === 't0_straight', exceeds: (r) => r[3] === 'EXCEEDS'
    };
    const SHORT = { t0_straight: 't0_straight', t1_matmul_bf16: 'matmul', t2_cutlass_gemm: 't2', t3_dg_1d2d_k512: 'k512', t4_cublas_nvjet: 'nvjet' };
    // Causes of the 16 exceedances: DECISIONS 69 and journal/demeter.md:571-617 (checked in both tools' SASS);
    // "edge" is k512 p.kb0.wait, which crossed out of A5 only in the final pass and has no classified cause.
    const CAT = {
      sb: ["G-Watch's probe waits on the kernel's TMA-store scoreboard", 'G-Watch 的探针等待 kernel 的 TMA 存储 scoreboard'],
      heavy: ["G-Watch's heavier probe on a short or memory-bound region", 'G-Watch 较重的探针落在短区域或访存受限的区域'],
      refused: ['different probe sets: sites Olympus refuses', '探针集合不同：Olympus 拒绝的插桩点'],
      slack: ['slack moving within a producer pipeline', 'producer 流水线中松弛时间的转移'],
      tail: ['p95 tail, no established cause', 'p95 尾部，原因未确定'],
      edge: ['at the tolerance edge; not classified in EVAL.md', '处在容差边缘；EVAL.md 未归类']
    };
    const K = (c, s, r) => `${c}|${s}|${r}`;
    const CAUSE = {
      [K('t3_dg_1d2d_k512', 'trace-pp', 'c.sched')]: ['sb', "At c.tile_done G-Watch's probe waits on SB0, which the store leaders' UTMACMDFLUSH still holds, right after its clock read. The hold lands in G-Watch's scheduler phase for warps 0 and 4, which is why its p95 is 1,207 ns against Olympus's 423.", '在 c.tile_done 处，G-Watch 的探针在读完时钟之后立刻等待 SB0，而 SB0 仍被两个存储 leader 的 UTMACMDFLUSH 占着。于是 warp 0 和 4 的这段等待落进了 G-Watch 的调度阶段，这就是它的 p95 为 1,207 ns、而 Olympus 只有 423 ns 的原因。'],
      [K('t3_dg_1d2d_k512', 'trace-pp', 'c.tile')]: ['sb', 'The tile is 802 ns longer under G-Watch: the SB0 hold at the tile boundary, which the one-NOP experiment prices at 0.8–0.9 µs per tile.', 'tile 在 G-Watch 下长了 802 ns：这就是 tile 边界上的 SB0 等待，单条 NOP 实验给出的代价是每个 tile 0.8–0.9 µs。'],
      [K('t3_dg_1d2d_k512', 'trace-pp', 'p.tile')]: ['sb', "The producer's tile is paced by the consumers, so it inherits the same hold: 924 ns.", 'producer 的 tile 由 consumer 的节奏决定，所以同样继承了这段等待：924 ns。'],
      [K('t3_dg_1d2d_k512', 'trace-pp', 'p.kb3.wait')]: ['sb', 'The producer waits for the late consumers to free the stage: 867 ns longer under G-Watch.', 'producer 要等来晚了的 consumer 把 stage 空出来：在 G-Watch 下长了 867 ns。'],
      [K('t3_dg_1d2d_k512', 'trace-pp', 'warp')]: ['sb', "Summed over a warp's tiles: 5,339 ns. The trace spans 31.0 µs under Olympus, 36.6 µs under G-Watch, and the kernel runs 30.3 µs with no probes.", '把一个 warp 的所有 tile 加起来：5,339 ns。trace 跨度在 Olympus 下为 31.0 µs，在 G-Watch 下为 36.6 µs，不插探针时 kernel 运行 30.3 µs。'],
      [K('t2_cutlass_gemm', 'trace-pp', 'c.epi_store')]: ['sb', "At c.epi.store0 G-Watch's probe waits on SB0 after its clock read, before the tile's first UTMASTG. SB0 is the previous tile's last TMA flush, which the kernel waits for only after that store (DEPBAR.LE SB0, 0x1). Its record STGs also claim SB0. M6's probe claims SB3 and waits only on it.", '在 c.epi.store0 处，G-Watch 的探针读完时钟后、在 tile 的第一条 UTMASTG 之前等待 SB0。SB0 是上一个 tile 最后一次 TMA flush，kernel 要到这条存储之后才等它（DEPBAR.LE SB0, 0x1）。G-Watch 记录用的 STG 也占用 SB0。M6 的探针占用 SB3，也只等 SB3。'],
      [K('t4_cublas_nvjet', 'trace-pp', 'c.sched')]: ['sb', 'At c.next G-Watch waits on SB0, SB3 and SB5 (the tile\'s UTMASTG and both flush scoreboards) after its clock read. The kernel itself waits only on SB0 there.', '在 c.next 处，G-Watch 读完时钟后等待 SB0、SB3 和 SB5（tile 的 UTMASTG 以及两个 flush 的 scoreboard），而 kernel 自己在这里只等 SB0。'],
      [K('t4_cublas_nvjet', 'trace-pp', 'c.epi.store')]: ['sb', "The other half of the same shift. Under Olympus the kernel waits for the previous tile's last flush where the kernel put that wait, at the WARPGROUP.ARRIVE after the tile's first UTMASTG (SB5); under G-Watch it was already drained in c.sched. Summed, c.epi + c.sched is shorter under Olympus: 2,245 against 2,406 ns (p50s).", '这是同一次转移的另一半。在 Olympus 下，kernel 在它自己安排的位置等上一个 tile 的最后一次 flush，即 tile 第一条 UTMASTG 之后的 WARPGROUP.ARRIVE（SB5）；在 G-Watch 下这次等待已经在 c.sched 里提前付掉了。两段加起来，c.epi + c.sched 在 Olympus 下更短：2,245 对 2,406 ns（p50）。'],
      [K('t4_cublas_nvjet', 'trace-pp', 'c.epi')]: ['sb', 'Contains c.epi.store: the SB5 wait that G-Watch moved into c.sched happens here under Olympus, where the kernel put it.', '它包含 c.epi.store：G-Watch 挪到 c.sched 里的那次 SB5 等待，在 Olympus 下发生在 kernel 原本安排的这里。'],
      [K('t0_straight', 'trace-pp', 'store')]: ['heavy', "p50 differs by 23 ns (within A5), p95 by 326 ns. In replay outside G-Watch, per-load waits are +15% over the kernel with no probes under G-Watch and +5.4% under M5's hazard-exact probes (DECISIONS 64).", 'p50 相差 23 ns（在 A5 以内），p95 相差 326 ns。在 G-Watch 之外重放时，每次加载的等待在 G-Watch 下比不插探针多 15%，在 M5 的精确冒险探针下多 5.4%（DECISIONS 64）。'],
      [K('t4_cublas_nvjet', 'trace-pp', 'c.epi.prep')]: ['heavy', "p50 is equal (284 ns); G-Watch's p95 on this short region is 81 ns longer.", 'p50 相同（284 ns）；在这个短区域上 G-Watch 的 p95 长了 81 ns。'],
      [K('t1_matmul_bf16', 'trace-pp', 'warp')]: ['refused', 'G-Watch records k-loop sites 2, 3 and 9 (262,144 records each) that M6 refuses for want of a free scoreboard, so the warp region holds different probes. Spans: Olympus 184.1 µs, no probes 183.8, G-Watch 194.8.', 'G-Watch 记录了 k 循环里的插桩点 2、3、9（各 262,144 条记录），M6 因为没有空闲 scoreboard 而拒绝了它们，所以这个 warp 区域里的探针不同。跨度：Olympus 184.1 µs，无探针 183.8，G-Watch 194.8。'],
      [K('t2_cutlass_gemm', 'trace-pp', 'p.k_wait')]: ['slack', "Olympus's producer reaches the empty-stage wait earlier and waits longer (+76 ns); the pipeline is paced by the consumers, and the rest of the producer loop is within A5.", 'Olympus 的 producer 更早到达空槽等待，等得也更久（+76 ns）；流水线由 consumer 定节奏，producer 循环的其余部分都在 A5 以内。'],
      [K('t1_matmul_bf16', 'trace-pp', 'mma_issue')]: ['tail', 'p50 +8 ns, p95 +72 ns. It follows the refused sites 2 and 3, so the probe sequence before it differs between the tools.', 'p50 +8 ns，p95 +72 ns。它紧跟在被拒绝的插桩点 2、3 之后，所以两个工具在它之前的探针序列不同。'],
      [K('t3_dg_1d2d_k512', 'trace-pp', 'c.epi.tma_issue')]: ['tail', "p50 +5 ns, p95 +59 ns. No wait comes before either tool's clock read at c.tile_done.", 'p50 +5 ns，p95 +59 ns。在 c.tile_done 处，两个工具读时钟之前都没有等待。'],
      [K('t3_dg_1d2d_k512', 'trace-pp', 'p.kb0.wait')]: ['edge', 'p50 418 against 363 ns: 5 ns beyond the 50 ns floor and beyond twice the larger spread (44 ns). In the run DECISIONS 69 classified it was +50 ns and within A5, so EVAL.md\'s cause list does not cover it. My reading, not checked in the SASS: like t2\'s p.k_wait, it is a producer wait paced by the consumers.', 'p50 为 418 对 363 ns：比 50 ns 的下限多 5 ns，也超过了较大波动的两倍（44 ns）。在 DECISIONS 69 做分类的那次运行中它是 +50 ns，在 A5 以内，所以 EVAL.md 的原因列表没有覆盖它。我的理解（未在 SASS 中核实）：与 t2 的 p.k_wait 一样，这是一个由 consumer 定节奏的 producer 等待。']
    };

    // per statistic: 'a5' | 'spread' | 'x'
    const sub = (r, s) => { const b = s === 'p50' ? 5 : 13; return { oM: r[b], oMin: r[b + 1], oMax: r[b + 2], gM: r[b + 3], gMin: r[b + 4], gMax: r[b + 5], tol: r[b + 6], sp: r[b + 7] }; };
    const stOf = (q) => { const d = Math.abs(q.oM - q.gM); return d <= q.tol ? 'a5' : d <= Math.max(q.tol, q.sp) ? 'spread' : 'x'; };

    function rows() {
      const rs = A5.filter(GRP[grp]);
      const out = [];
      let last = null;
      rs.forEach((r) => {
        const key = r[0] + '|' + r[1];
        if (key !== last) { out.push({ head: true, text: `${SHORT[r[0]]} · ${r[1]}` }); last = key; }
        out.push({ r });
      });
      return out;
    }

    function draw() {
      const list = rows();
      const RH = 22, HH = 20, X0 = 222, X1 = 796, XC = (X0 + X1) / 2, U = (X1 - X0) / 16;
      const sx = (u) => XC + Math.max(-8, Math.min(8, u)) * U;
      let y = 40;
      const pos = list.map((it) => { const p = y; y += it.head ? HH : RH; return p; });
      const H = y + 10;
      svg.setAttribute('viewBox', `0 0 880 ${H}`);
      svg.innerHTML = '';
      // bands and axis
      S('rect', { x: sx(-1), y: 30, width: sx(1) - sx(-1), height: H - 36, class: 'band-a5' }, svg);
      [-8, -4, -2, -1, 0, 1, 2, 4, 8].forEach((u) => {
        S('line', { x1: sx(u), y1: 30, x2: sx(u), y2: H - 6, class: u === 0 ? 'zero' : 'grid' }, svg);
        S('text', { x: sx(u), y: 24, class: 't-xs muted', 'text-anchor': 'middle' }, svg, u === 0 ? '0' : (u > 0 ? '+' : '−') + Math.abs(u));
      });
      T2(svg, { x: X0, y: 11, class: 't-xs muted' }, '← Olympus shorter', '← Olympus 更短');
      T2(svg, { x: X1, y: 11, class: 't-xs muted', 'text-anchor': 'end' }, 'Olympus longer →', 'Olympus 更长 →');
      T2(svg, { x: XC, y: 11, class: 't-xs muted', 'text-anchor': 'middle' }, `${stat}: difference in A5 tolerances`, `${stat}：以 A5 容差为单位的差值`);
      T2(svg, { x: 8, y: 24, class: 't-xs muted' }, 'region', '区域');
      T2(svg, { x: 150, y: 24, class: 't-xs muted' }, 'verdict', '结论');

      list.forEach((it, i) => {
        const y0 = pos[i];
        if (it.head) { S('text', { x: 8, y: y0 + 14, class: 't-xs grp' }, svg, it.text.toUpperCase()); return; }
        const r = it.r, q = sub(r, stat), st = stOf(q), key = K(r[0], r[1], r[2]);
        if (sel === key) S('rect', { x: 0, y: y0, width: 880, height: RH, class: 'row-sel' }, svg);
        const cy = y0 + RH / 2;
        const s = q.sp / q.tol;
        if (s > 1) S('rect', { x: sx(-s), y: y0 + 3, width: sx(s) - sx(-s), height: RH - 6, class: 'band-sp' }, svg);
        S('text', { x: 8, y: cy + 4, class: 't-sm' }, svg, r[2]);
        const v = r[3], vc = v === 'EXCEEDS' ? 'exceeds' : v === 'spread' ? 'spread' : '';
        S('rect', { x: 150, y: cy - 7.5, width: 60, height: 15, rx: 3, class: 'badge ' + vc }, svg);
        T2(svg, { x: 180, y: cy + 3.5, class: 't-xs' + (vc === 'exceeds' ? ' on-ink' : ''), 'text-anchor': 'middle' },
          v === 'A5' ? 'A5' : v === 'spread' ? 'spread' : 'exceeds', v === 'A5' ? 'A5' : v === 'spread' ? '波动内' : '超出');
        // G-Watch at 0 with its range
        const gy = cy - 3.5, oy = cy + 3.5;
        S('line', { x1: sx((q.gMin - q.gM) / q.tol), y1: gy, x2: sx((q.gMax - q.gM) / q.tol), y2: gy, class: 'wk-gw' }, svg);
        S('path', { d: `M${sx(0)},${gy - 4} l4,4 l-4,4 l-4,-4 z`, class: 'pt-gw' }, svg);
        // Olympus at its difference
        S('line', { x1: sx((q.oMin - q.gM) / q.tol), y1: oy, x2: sx((q.oMax - q.gM) / q.tol), y2: oy, class: 'wk-oly' }, svg);
        const u = (q.oM - q.gM) / q.tol, ox = sx(u);
        if (st === 'a5') S('circle', { cx: ox, cy: oy, r: 4, class: 'pt-oly' }, svg);
        else if (st === 'spread') S('circle', { cx: ox, cy: oy, r: 3.6, class: 'pt-oly-ring' }, svg);
        else { S('path', { d: `M${ox - 3.8},${oy - 3.8} L${ox + 3.8},${oy + 3.8} M${ox + 3.8},${oy - 3.8} L${ox - 3.8},${oy + 3.8}`, class: 'pt-oly-x' }, svg); }
        if (Math.abs(u) > 8) S('path', { d: u > 0 ? `M${X1 + 3},${oy - 4} l6,4 l-6,4 z` : `M${X0 - 3},${oy - 4} l-6,4 l6,4 z`, class: 'clip-mark' }, svg);
        S('text', { x: 812, y: cy + 4, class: 't-xs ' + (st === 'x' ? 'strong' : 'muted') }, svg, `${sgnI(q.oM - q.gM)} ns`);
        const hit = S('rect', { x: 0, y: y0, width: 880, height: RH, class: 'hit click' }, svg);
        hover(hit, () => `<b>${SHORT[r[0]]} · ${r[1]} · ${r[2]}</b><br>${stat}: Olympus ${int(q.oM)} (${int(q.oMin)}–${int(q.oMax)}) · G-Watch ${int(q.gM)} (${int(q.gMin)}–${int(q.gMax)}) ns<br>${bi('difference', '差值')} ${sgnI(q.oM - q.gM)} ns · ${bi('tolerance', '容差')} ${int(q.tol)} · ${bi('spread', '波动')} ${int(q.sp)}`);
        hit.addEventListener('click', () => { sel = key; draw(); showDetail(r); });
      });
    }

    function showDetail(r) {
      if (!r) {
        detail.innerHTML = bi('Click a row to see its numbers and, for an exceedance, its cause.', '点击某一行，查看它的数字；如果是超出项，还会显示原因。');
        return;
      }
      const v = r[3], vc = v === 'EXCEEDS' ? 'exceeds' : v === 'spread' ? 'spread' : '';
      const line = (s) => {
        const q = sub(r, s);
        return `<div><span>${s} · Olympus <b>${int(q.oM)}</b> (${int(q.oMin)}–${int(q.oMax)}) · G-Watch <b>${int(q.gM)}</b> (${int(q.gMin)}–${int(q.gMax)}) ns</span>` +
          `<span>${bi('difference', '差值')} <b>${sgnI(q.oM - q.gM)}</b> ns · ${bi('tolerance', '容差')} ${int(q.tol)} · ${bi('spread rule', '波动规则')} ${int(q.sp)} · ${({ a5: bi('within A5', 'A5 以内'), spread: bi('spread only', '仅在波动内'), x: bi('beyond both', '两者都超出') })[stOf(q)]}</span></div>`;
      };
      const c = CAUSE[K(r[0], r[1], r[2])];
      let why;
      if (v === 'EXCEEDS' && c) why = `<span class="cat${c[0] === 'edge' ? ' inferred' : ''}">${bi(CAT[c[0]][0], CAT[c[0]][1])}</span><span>${bi(c[1], c[2])}</span>`;
      else if (v === 'spread') why = bi('Outside max(5%, 50 ns) on at least one statistic, but within twice the larger tool\'s run-to-run range (DECISIONS 60).', '至少一个统计量超出 max(5%, 50 ns)，但仍在两个工具中较大运行间波动的两倍以内（DECISIONS 60）。');
      else why = bi('p50 and p95 are both within max(5%, 50 ns) of G-Watch.', 'p50 与 p95 都在 G-Watch 的 max(5%, 50 ns) 以内。');
      detail.innerHTML = `<div class="h"><span>${SHORT[r[0]]} · ${r[1]} · ${r[2]}</span><span class="v ${vc}">${v === 'A5' ? 'A5' : v === 'spread' ? bi('spread', '波动内') : bi('exceeds', '超出')}</span><span class="cat">${int(r[4])} ${bi('intervals per tool', '个区间（每个工具）')}</span></div>` +
        `<div class="nums">${line('p50')}${line('p95')}</div><div class="why">${why}</div>`;
    }

    chips.forEach((b) => b.addEventListener('click', () => {
      grp = b.dataset.grp;
      chips.forEach((x) => { if (x === b) x.setAttribute('aria-current', 'step'); else x.removeAttribute('aria-current'); });
      const first = A5.find((r) => GRP[grp](r) && r[3] === 'EXCEEDS') || A5.find(GRP[grp]);
      sel = first ? K(first[0], first[1], first[2]) : null;
      draw(); showDetail(first);
    }));
    statBtns.forEach((b) => b.addEventListener('click', () => { stat = b.dataset.stat; press(statBtns, 'stat', stat); draw(); }));
    const T = A5_TOTALS;
    readouts.innerHTML = `
      <div class="readout key"><span class="k">${bi('Within A5', 'A5 以内')}</span><span class="v">${T.A5} / ${T.regions_compared}</span><span class="s">${bi(`${T.A5 + T.spread} with the spread rule`, `加上波动规则共 ${T.A5 + T.spread} 个`)}</span></div>
      <div class="readout key"><span class="k">${bi('Exceed', '超出')}</span><span class="v">${T.EXCEEDS}</span><span class="s">${bi(`Olympus longer on ${T.exceeds_olympus_longer}, shorter on ${T.exceeds_olympus_shorter}`, `Olympus 更长 ${T.exceeds_olympus_longer} 个，更短 ${T.exceeds_olympus_shorter} 个`)}</span></div>
      <div class="readout"><span class="k">${bi('Record counts', '记录数')}</span><span class="v">${T.sites_equal_all_runs} / ${T.sites_undeclared}</span><span class="s">${bi(`ordinary sites equal in every run; pair rates equal ${T.pair_rate_equal} / ${T.regions_compared}`, `普通插桩点每次运行都相同；配对率相同 ${T.pair_rate_equal} / ${T.regions_compared}`)}</span></div>
      <div class="readout"><span class="k">${bi('Not compared', '未比较')}</span><span class="v">${T.regions_refused}</span><span class="s">${bi(`regions; ${T.sites_refused} sites refused (no free scoreboard)`, `个区域；拒绝了 ${T.sites_refused} 个插桩点（没有空闲 scoreboard）`)}</span></div>`;
    const first = A5.find((r) => GRP[grp](r) && r[3] === 'EXCEEDS');
    sel = K(first[0], first[1], first[2]);
    draw(); showDetail(first);
  }

  // =====================================================================
  // 3. A6 tile-boundary timeline and the SB0 mechanism
  // =====================================================================
  function initTile(host) {
    const svg = $('svg', host), cap = $('.fd-cap', host), readouts = $('.readouts', host);
    const playBtn = $('[data-act="play"]', host), stepBtn = $('[data-act="step"]', host), resetBtn = $('[data-act="reset"]', host);
    const unitSel = $('#tile-unit', host), sb0 = $('#tile-sb0', host);
    const sass = $('.fd-sass', host), warps = $('.fd-warps', host), note = $('.fd-mech-note', host);

    const gt = A6_GT;
    const segsOf = (p, isGt) => {
      const tma = isGt ? p.epi_tma : p.epi_total - p.epi_wait - p.epi_stsm;
      return [
        { k: 'sched', v: p.sched }, { k: 'bscale', v: p.bscale, wait: isGt ? null : p.bscale_wait, arr: isGt ? null : p.bscale_arrive },
        { k: 'kb', v: p.tile - p.sched - p.bscale - p.epi_total }, { k: 'epiw', v: p.epi_wait }, { k: 'stsm', v: p.epi_stsm }, { k: 'tma', v: tma, leaders: p.epi_tma }];
    };
    const ROWS = [
      { key: 'gt', en: 'PLAN §2.4', zh: 'PLAN §2.4', sub: ['source-level, 2026-09-27', '源码级，2026-09-27'], cls: 'muted', mhz: A6_GT_GHZ * 1000, tile: gt.tile, segs: segsOf(gt, true) },
      { key: 'ncu', en: 'no probes', zh: '无探针', sub: ['ncu, 1 launch', 'ncu，1 次启动'], cls: 'ref', mhz: A6_MEANS.ncu.mhz, tile: A6_MEANS.ncu.c.tile, segs: segsOf(A6_MEANS.ncu.c) },
      { key: 'gw', en: 'G-Watch 0.0.35', zh: 'G-Watch 0.0.35', sub: ['5 runs', '5 次运行'], cls: 'gw', mhz: A6_MEANS.GW.mhz, tile: A6_MEANS.GW.c.tile, segs: segsOf(A6_MEANS.GW.c) },
      { key: 'm4', en: 'Olympus M4', zh: 'Olympus M4', sub: ['fenced; earlier run', '带栅栏；更早的运行'], cls: 'oly', mhz: A6_M4.mhz, tile: A6_M4.c.tile, segs: segsOf(A6_M4.c) },
      { key: 'm6', en: 'Olympus M6', zh: 'Olympus M6', sub: ['shipped; 3 runs', '最终交付；3 次运行'], cls: 'oly', mhz: A6_MEANS.M6.mhz, tile: A6_MEANS.M6.c.tile, segs: segsOf(A6_MEANS.M6.c) }
    ];
    const NAME = {
      sched: ['scheduler (get_next_block)', '调度（get_next_block）'], bscale: ['B-scale load + barrier', 'B-scale 加载 + 屏障'],
      kb: ['K blocks (the rest of the tile)', 'K 块（tile 的其余部分）'], epiw: ['epilogue: store wait + barrier', 'epilogue：存储等待 + 屏障'],
      stsm: ['epilogue: STSM + barrier', 'epilogue：STSM + 屏障'], tma: ['epilogue: TMA issue (s18 → s19)', 'epilogue：TMA 发射（s18 → s19）']
    };
    const STEPS = [
      { show: ['gt', 'ncu'], cap: bi('<b>Two references.</b> PLAN §2.4\'s source-level counters, and the kernel with no probes at all, profiled once under ncu. The B-scale phase (red) is 520 cycles in §2.4 and 804 in the kernel itself. Press Play or Step.', '<b>两个参照。</b>PLAN §2.4 的源码级计数，以及完全不插探针、在 ncu 下 profile 一次的 kernel。B-scale 阶段（红色）在 §2.4 中是 520 周期，在 kernel 本身中是 804 周期。点击播放或单步。') },
      { show: ['gt', 'ncu', 'gw'], cap: bi('<b>G-Watch 0.0.35.</b> Its probe at c.tile_done waits on SB0, which the store leaders\' UTMACMDFLUSH still holds. The leaders reach the next B-scale barrier last and all eight math warps wait there: the phase grows to 1,873 cycles, and the tile to 8,834.', '<b>G-Watch 0.0.35。</b>它在 c.tile_done 的探针等待 SB0，而 SB0 仍被存储 leader 的 UTMACMDFLUSH 占着。两个 leader 最后才到达下一个 B-scale 屏障，8 个计算 warp 全都在那里等：这个阶段涨到 1,873 周期，tile 涨到 8,834。') },
      { show: ['gt', 'ncu', 'gw', 'm4'], cap: bi('<b>Olympus M4,</b> the first planner, fences its probes by waiting on every scoreboard, SB0 included. The same hold (2,229 cycles) appears, stamped as the barrier arrival rather than the wait, and the fences cost elsewhere too: the leaders\' TMA issue takes 1,877 cycles.', '<b>Olympus M4</b> 是第一个规划器，它给探针加栅栏，等待所有 scoreboard，SB0 也在其中。同样的等待（2,229 周期）又出现了，只是被记成了到达屏障之前而不是屏障等待；栅栏在别处也有代价：leader 的 TMA 发射要 1,877 周期。') },
      { show: ['gt', 'ncu', 'gw', 'm4', 'm6'], cap: bi('<b>Olympus M6:</b> every probe waits only on its own claim. The hold is gone: B-scale is 815 cycles, 1.4% over the kernel with no probes. The tile is 7,326 cycles, about 40 cycles per probe over the kernel\'s 6,651.', '<b>Olympus M6：</b>每个探针只等自己的占用。那段等待消失了：B-scale 为 815 周期，只比不插探针多 1.4%。tile 为 7,326 周期，比 kernel 自身的 6,651 多出的部分，平均每个探针约 40 周期。') }
    ];
    let step = 0, timer = null, run = 0;

    function draw(fresh) {
      const ns = unitSel.value === 'ns';
      const conv = (row, c) => (ns ? (c / row.mhz) * 1000 : c);
      const shown = new Set(STEPS[step].show);
      const maxT = Math.max(...ROWS.map((r) => conv(r, r.tile)));
      const xmax = Math.ceil((maxT * 1.02) / (ns ? 500 : 1000)) * (ns ? 500 : 1000);
      const X0 = 168, X1 = 800, W = X1 - X0;
      const sx = (v) => X0 + (v / xmax) * W;
      const RH = 38, top = 40;
      svg.innerHTML = '';
      const defs = S('defs', null, svg);
      hatch(defs, 'tile-hatch', 'hatch-r0', 5);
      const H = top + ROWS.length * RH + 30;
      svg.setAttribute('viewBox', `0 0 880 ${H}`);
      // §2.4 tile total ± 15%
      const g0 = ns ? gt.tile / A6_GT_GHZ : gt.tile;
      S('rect', { x: sx(g0 * 0.85), y: top - 6, width: sx(g0 * 1.15) - sx(g0 * 0.85), height: ROWS.length * RH + 4, class: 'gt-band' }, svg);
      S('line', { x1: sx(g0), y1: top - 10, x2: sx(g0), y2: top + ROWS.length * RH, class: 'target' }, svg);
      T2(svg, { x: sx(g0), y: top - 14, class: 't-xs muted', 'text-anchor': 'middle' }, '§2.4 tile ± 15%', '§2.4 tile ± 15%');
      ticksFor(0, xmax, 5).forEach((v) => {
        S('line', { x1: sx(v), y1: top + ROWS.length * RH, x2: sx(v), y2: top + ROWS.length * RH + 5, class: 'grid' }, svg);
        S('text', { x: sx(v), y: top + ROWS.length * RH + 17, class: 't-xs muted', 'text-anchor': 'middle' }, svg, int(v));
      });
      T2(svg, { x: X1, y: top + ROWS.length * RH + 28, class: 't-xs muted', 'text-anchor': 'end' }, ns ? 'ns per tile, mean per warp' : 'cycles per tile (each run\'s clock), mean per warp', ns ? '每个 tile 的 ns，按 warp 平均' : '每个 tile 的周期（各次运行自己的时钟），按 warp 平均');

      const ncuB = conv(ROWS[1], ROWS[1].segs[1].v);
      ROWS.forEach((row, i) => {
        const y = top + i * RH, on = shown.has(row.key);
        T2(svg, { x: 0, y: y + 14, class: `t-sm strong ${row.cls}` }, row.en, row.zh);
        T2(svg, { x: 0, y: y + 27, class: 't-xs muted' }, row.sub[0], row.sub[1]);
        if (!on) {
          S('rect', { x: X0, y: y + 5, width: W * 0.5, height: 20, rx: 2, class: 'row-band' }, svg);
          T2(svg, { x: X0 + 8, y: y + 19, class: 't-xs muted' }, 'press Play or Step', '点击播放或单步');
          return;
        }
        const animateRow = fresh === row.key && !reduceMotion;
        let acc = 0;
        row.segs.forEach((sg, j) => {
          const v = conv(row, sg.v), x = sx(acc), w = Math.max(sx(acc + v) - x, 0.6);
          const r = S('rect', { x, y: y + 5, width: w, height: 20, class: `phs ph-${sg.k}` }, svg);
          const els = [r];
          if (sg.k === 'bscale' && sg.wait != null) {
            const wv = conv(row, sg.wait);
            els.push(S('rect', { x: x + w - Math.min(w, sx(wv) - sx(0)), y: y + 6, width: Math.min(w, sx(wv) - sx(0)), height: 18, class: 'ph-wait' }, svg));
          }
          if (sg.k === 'bscale' && w > 30) els.push(S('text', { x: x + w / 2, y: y + 19, class: 't-xs strong', 'text-anchor': 'middle' }, svg, int(v)));
          if (sg.k === 'kb' && w > 60) els.push(T2(svg, { x: x + w / 2, y: y + 19, class: 't-xs muted', 'text-anchor': 'middle' }, 'K blocks', 'K 块'));
          const hit = S('rect', { x, y: y + 3, width: w, height: 24, class: 'hit' }, svg);
          hover(hit, () => {
            let extra = '';
            if (sg.k === 'bscale' && sg.wait != null) extra = `<br>${bi('arrival', '到达')} ${int(conv(row, sg.arr))} · ${bi('barrier wait', '屏障等待')} ${int(conv(row, sg.wait))}`;
            if (sg.k === 'bscale' && row.key === 'm4') extra += `<br>${bi("M4's fence at s5 waits first, so its hold is stamped as arrival.", 'M4 在 s5 处的栅栏先等待，所以它的这段等待被记成了到达。')}`;
            if (sg.k === 'tma') extra = row.key === 'gt' ? `<br>${bi('§2.4: TMA issue on the store leaders', '§2.4：存储 leader 上的 TMA 发射')}` : `<br>${bi('all eight warps averaged; on the two store leaders alone', '8 个 warp 的平均；仅看两个存储 leader 为')} ${int(conv(row, sg.leaders))}${row.key === 'ncu' ? `–${int(conv(row, A6_MEANS.ncu.tma_max))} (${bi('bounds', '上下界')})` : ''}`;
            if (sg.k === 'kb') extra = `<br>${bi('the tile total minus the other phases', 'tile 总时长减去其余各阶段')}`;
            return `<b>${row.en}</b> · ${bi(NAME[sg.k][0], NAME[sg.k][1])}<br>${int(conv(row, sg.v))} ${ns ? 'ns' : bi('cycles', '周期')}${extra}`;
          });
          if (animateRow) {
            const delay = (acc / (conv(row, row.tile))) * 1500;
            const dur = Math.max(180, (v / conv(row, row.tile)) * 1500);
            els.forEach((e) => {
              if (e.tagName === 'rect') {
                e.style.transformBox = 'fill-box'; e.style.transformOrigin = '0 50%';
                e.animate([{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: dur, delay, easing: 'linear', fill: 'backwards' });
              } else {
                e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: delay + dur, fill: 'backwards' });
              }
            });
          }
          acc += v;
        });
        const tot = conv(row, row.tile);
        const rel = row.key === 'ncu' || row.key === 'gt' ? '' : ` (${sgn((tot / conv(ROWS[1], ROWS[1].tile) - 1) * 100, 1)}%)`;
        const lbl = S('text', { x: sx(tot) + 6, y: y + 19, class: `t-xs ${row.cls}` }, svg, int(tot) + rel);
        if (row.key === 'gw' || row.key === 'm4') {
          const b = conv(row, row.segs[1].v);
          const bx = sx(conv(row, row.segs[0].v));
          T2(svg, { x: bx + (sx(b) - sx(0)) / 2, y: y + 36, class: 't-xs hold-tag', 'text-anchor': 'middle' },
            `hold: ${sgnI(b - ncuB)} vs no probes`, `等待：比无探针 ${sgnI(b - ncuB)}`);
        }
        if (animateRow) {
          lbl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 1500, fill: 'backwards' });
          const cur = S('line', { x1: X0, y1: y + 1, x2: X0, y2: y + 29, class: 'cursor' }, svg);
          cur.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${sx(tot) - X0}px)`, opacity: 1 }, { transform: `translateX(${sx(tot) - X0}px)`, opacity: 0 }],
            { duration: 1800, easing: 'linear', fill: 'forwards' });
        }
      });
      cap.innerHTML = STEPS[step].cap;
      const cn = (key, k) => { const r = ROWS.find((x) => x.key === key); const sg = r.segs.find((s) => s.k === k); return `${int(sg.v)} / ${int((sg.v / r.mhz) * 1000)}`; };
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('B-scale + barrier, mean', 'B-scale + 屏障，均值')}</span><span class="v">${cn('m6', 'bscale')}</span><span class="s">${bi(`M6, cycles / ns; no probes ${cn('ncu', 'bscale')}`, `M6，周期 / ns；无探针 ${cn('ncu', 'bscale')}`)}</span></div>
        <div class="readout"><span class="k">${bi('with SB0 waits', '等待 SB0 时')}</span><span class="v">${cn('gw', 'bscale')}</span><span class="s">${bi(`G-Watch; M4 ${cn('m4', 'bscale')}`, `G-Watch；M4 ${cn('m4', 'bscale')}`)}</span></div>
        <div class="readout key"><span class="k">${bi('A6 verdict, p50 ±15%', 'A6 结论，p50 ±15%')}</span><span class="v">2/8 · 3/8</span><span class="s">${bi('M6, cycles · ns; G-Watch 1/8 · 1/8', 'M6，周期 · ns；G-Watch 1/8 · 1/8')}</span></div>
        <div class="readout"><span class="k">${bi('B-scale p50 (what A6 judges)', 'B-scale 的 p50（A6 判定用）')}</span><span class="v">${int(A6_WARPS.M6.p50.bscale[0])} / ${int(A6_WARPS.M6.p50.bscale[1])}</span><span class="s">${bi(`M6; G-Watch ${int(A6_WARPS.GW.p50.bscale[0])} / ${int(A6_WARPS.GW.p50.bscale[1])}; §2.4 520 / 306`, `M6；G-Watch ${int(A6_WARPS.GW.p50.bscale[0])} / ${int(A6_WARPS.GW.p50.bscale[1])}；§2.4 为 520 / 306`)}</span></div>`;
      playBtn.innerHTML = timer ? bi('Pause', '暂停') : bi(step >= STEPS.length - 1 ? 'Replay' : 'Play', step >= STEPS.length - 1 ? '重放' : '播放');
      stepBtn.disabled = step >= STEPS.length - 1;
    }

    function stop() { if (timer) { clearTimeout(timer); timer = null; } }
    function advance() {
      if (step >= STEPS.length - 1) { stop(); draw(null); return; }
      step++;
      draw(STEPS[step].show[STEPS[step].show.length - 1]);
    }
    function playLoop(token) {
      if (token !== run) return;
      if (step >= STEPS.length - 1) { stop(); draw(null); return; }
      step++;
      timer = setTimeout(() => playLoop(token), reduceMotion ? 1600 : 2900);
      draw(STEPS[step].show[STEPS[step].show.length - 1]);
    }
    playBtn.addEventListener('click', () => {
      if (timer) { stop(); run++; draw(null); return; }
      run++;
      const token = run;
      if (step >= STEPS.length - 1) { step = 0; draw('ncu'); timer = setTimeout(() => playLoop(token), reduceMotion ? 1200 : 2200); }
      else { timer = setTimeout(() => playLoop(token), 50); }
      playBtn.innerHTML = bi('Pause', '暂停');
    });
    stepBtn.addEventListener('click', () => { stop(); run++; advance(); });
    resetBtn.addEventListener('click', () => { stop(); run++; step = 0; draw(null); });
    unitSel.addEventListener('change', () => draw(null));
    const syncOpts = () => {
      const zh = document.documentElement.dataset.lang === 'zh';
      unitSel.options[0].textContent = zh ? '周期' : 'cycles';
      unitSel.options[1].textContent = zh ? '纳秒' : 'ns';
    };
    document.addEventListener('click', (e) => { if (e.target.closest('[data-set-lang]')) setTimeout(syncOpts, 0); });
    syncOpts();

    // ---- mechanism panel ----
    const L = (cls, html) => `<span class="ln ${cls || ''}">${html}</span>`;
    const cm = (en, zh) => `<span class="cm">; ${bi(en, zh)}</span>`;
    function drawSass(on) {
      sass.innerHTML = [
        L('', `<span class="ad">/*4410*/</span> UTMASTG.2D [UR28], [UR32]          ${cm('warps 0 and 4 store the tile', 'warp 0 和 4 存出 tile')}`),
        L('', `<span class="ad">   ⋮    </span>`),
        L('', `<span class="ad">/*4490*/</span> UTMASTG.2D [UR24], [UR32]`),
        L('claim' + (on ? ' hot' : ''), `<span class="ad">/*44a0*/</span> UTMACMDFLUSH                       ${cm('claims SB0 until the tile has left smem', '占用 SB0，直到 tile 离开共享内存')}`),
        L('', `<span class="ad">/*44b0*/</span> BSYNC B0`),
        L('probe ' + (on ? 'on-gw' : 'off'), `<span class="ad">G-Watch </span> UIADD3.64 {UR58,UR59}, …, 0x8      <span class="wm">wait {0,2}</span> ${cm('SB0 is the kernel\'s', 'SB0 属于 kernel')}`),
        L('probe ' + (on ? 'off' : 'on-oly'), `<span class="ad">M6      </span> NOP                                <span class="wm">wait {2}</span>   ${cm('its own STG only', '只等自己的 STG')}`),
        L('', `<span class="ad">/*44c0*/</span> S2UR UR16, SR_CTAID.X              ${cm('c.tile_done; get_next_block', 'c.tile_done；get_next_block')}`),
        L('', `<span class="ad">   ⋮    </span> ${cm('next tile', '下一个 tile')}`),
        L('', `<span class="ad">/*0a90*/</span> BAR.SYNC.DEFER_BLOCKING 0x8, 0x100 ${cm('B-scale barrier, 256 threads', 'B-scale 屏障，256 线程')}`),
        L('', `<span class="ad">   ⋮    </span>`),
        L('claim', `<span class="ad">/*3ad0*/</span> DEPBAR.LE SB0, 0x0                 ${cm("the kernel's own SB0 wait, next epilogue", 'kernel 自己对 SB0 的等待，在下一个 epilogue')}`)
      ].join('');
    }
    const ROLE = ['store leader', 'B-scale loader', '', '', 'store leader', '', '', ''];
    const ROLE_ZH = ['存储 leader', 'B-scale 加载', '', '', '存储 leader', '', '', ''];
    const COLS = [['epi_tma', 'c-tma', 'TMA issue', 'TMA 发射'], ['sched', 'c-sched', 'scheduler', '调度'], ['bscale_arrive', 'c-arr', 'to arrival', '到达'], ['bscale_wait', 'c-wait', 'barrier wait', '屏障等待']];
    const vmax = Math.max(...['M6', 'GW'].flatMap((t) => COLS.flatMap(([k]) => A6_WARPS[t][k])));
    function buildWarps() {
      let h = `<div class="wr hd"><span>warp</span><span>${bi('role', '角色')}</span>${COLS.map((c) => `<span>${bi(c[2], c[3])}</span>`).join('')}</div>`;
      for (let w = 0; w < 8; w++) {
        h += `<div class="wr${ROLE[w] ? ' lead' : ''}"><span>w${w}</span><span class="role">${ROLE[w] ? bi(ROLE[w], ROLE_ZH[w]) : ''}</span>` +
          COLS.map(([k, c]) => `<span class="cell ${c}${k === 'epi_tma' && w !== 0 && w !== 4 ? ' none' : ''}" data-k="${k}" data-w="${w}"><i style="width:0%"></i><b></b></span>`).join('') + '</div>';
      }
      warps.innerHTML = h;
    }
    function drawWarps(on) {
      const d = A6_WARPS[on ? 'GW' : 'M6'];
      $$('.cell', warps).forEach((c) => {
        const v = d[c.dataset.k][+c.dataset.w];
        const has = !(c.dataset.k === 'epi_tma' && v === 0);
        c.querySelector('i').style.width = has ? ((100 * v) / vmax).toFixed(1) + '%' : '0%';
        c.querySelector('b').textContent = has ? int(v) : '—';
      });
      const sh = (o) => Object.entries(o).filter((e) => e[1] >= 0.005).sort((a, b) => b[1] - a[1]).map(([w, s]) => `w${w} ${Math.round(s * 100)}%`).join(', ');
      note.innerHTML = on
        ? bi(`<b>G-Watch: the probe waits on SB0.</b> The two store leaders carry the hold in their scheduler phase (w0 ${int(d.sched[0])}, w4 ${int(d.sched[4])} cycles, against ${int(Math.min(...[1, 2, 3, 5, 6, 7].map((w) => d.sched[w])))}–${int(Math.max(...[1, 2, 3, 5, 6, 7].map((w) => d.sched[w])))} for the others), then arrive last at the B-scale barrier (${sh(d.last)} of tiles after each CTA's first), and the other warps wait up to ${int(Math.max(...d.bscale_wait))} cycles. One NOP that waits on SB0 at this site, spliced into the kernel with no probes, costs +18.38% [+18.25, +18.61] at k512; without the wait −0.32%.`,
            `<b>G-Watch：探针等待 SB0。</b>两个存储 leader 把这段等待带进了调度阶段（w0 ${int(d.sched[0])}、w4 ${int(d.sched[4])} 周期，其他 warp 为 ${int(Math.min(...[1, 2, 3, 5, 6, 7].map((w) => d.sched[w])))}–${int(Math.max(...[1, 2, 3, 5, 6, 7].map((w) => d.sched[w])))}），随后最后到达 B-scale 屏障（每个 CTA 第一个 tile 之后的 tile 中 ${sh(d.last)}），其他 warp 最多要等 ${int(Math.max(...d.bscale_wait))} 周期。在不插探针的 kernel 的这个位置只拼接一条等待 SB0 的 NOP，k512 就慢了 +18.38% [+18.25, +18.61]；去掉等待则是 −0.32%。`)
        : bi(`<b>M6: the probe waits only on its own STG.</b> Every warp's scheduler phase is ${int(Math.min(...d.sched))}–${int(Math.max(...d.sched))} cycles. The last to arrive at the B-scale barrier is now mostly warp 1, the B-scale loader (${sh(d.last)} of tiles after each CTA's first): its two LDGs wait on memory even with no probes. The others wait ${int(Math.min(...d.bscale_wait.filter((x, w) => w !== 1)))}–${int(Math.max(...d.bscale_wait))} cycles for it. Tick the box to switch to G-Watch.`,
            `<b>M6：探针只等自己的 STG。</b>每个 warp 的调度阶段都是 ${int(Math.min(...d.sched))}–${int(Math.max(...d.sched))} 周期。现在最后到达 B-scale 屏障的多半是 warp 1，也就是加载 B-scale 的那个 warp（每个 CTA 第一个 tile 之后的 tile 中 ${sh(d.last)}）：即使不插探针，它的两条 LDG 也要等内存。其他 warp 为它等 ${int(Math.min(...d.bscale_wait.filter((x, w) => w !== 1)))}–${int(Math.max(...d.bscale_wait))} 周期。勾选方框可切换到 G-Watch。`);
    }
    buildWarps();
    function mech() { drawSass(sb0.checked); drawWarps(sb0.checked); }
    sb0.addEventListener('change', mech);
    drawSass(false);
    setTimeout(mech, 80);
    draw(null);
  }

  // =====================================================================
  // 4. FA-3 producer K / V waits
  // =====================================================================
  function initKV(host) {
    const svg = $('svg', host), readouts = $('.readouts', host), sitesEl = $('.fd-kv-sites', host);
    const btns = $$('[data-kv]', host), logBox = $('#kv-log', host);
    let mode = 'both';
    const E = FA3.edges, NB = E.length;
    const KH = FA3['p.k_wait'].hist, VH = FA3['p.v_wait'].hist;
    const binLabel = (i) => (i === NB - 1 ? `${int(E[i])}+` : `${int(E[i])}–${int(E[i + 1])}`);
    const pos = (v, x0, bw) => { let i = NB - 1; for (let j = 0; j < NB - 1; j++) if (v < E[j + 1]) { i = j; break; } const f = i === NB - 1 ? 0.2 : (v - E[i]) / (E[i + 1] - E[i]); return x0 + (i + f) * bw; };

    function draw(animate) {
      const X0 = 56, X1 = 868, W = X1 - X0, bw = W / NB, Y0 = 58, Y1 = 238, HH = Y1 - Y0;
      const log = logBox.checked;
      const series = mode === 'both' ? [['k', KH], ['v', VH]] : mode === 'k' ? [['k', KH]] : [['v', VH]];
      const vmax = Math.max(...series.flatMap((s) => s[1]));
      const f = (c) => (log ? Math.log10(1 + c) / Math.log10(1 + vmax) : c / vmax);
      svg.innerHTML = '';
      svg.setAttribute('viewBox', '0 0 880 282');
      // y grid
      const yt = log ? [1, 10, 100, 1000, 10000].filter((v) => v <= vmax * 1.01) : ticksFor(0, vmax, 4);
      yt.forEach((v) => {
        const y = Y1 - f(v) * HH;
        S('line', { x1: X0, y1: y, x2: X1, y2: y, class: 'grid' }, svg);
        S('text', { x: X0 - 6, y: y + 3, class: 't-xs muted', 'text-anchor': 'end' }, svg, int(v));
      });
      T2(svg, { x: X0 - 6, y: Y0 - 26, class: 't-xs muted', 'text-anchor': 'end' }, 'intervals', '区间数');
      S('line', { x1: X0, y1: Y1, x2: X1, y2: Y1, class: 'zero' }, svg);
      // consumer period
      const ip = pos(FA3['c.iter'].p50, X0, bw);
      S('line', { x1: ip, y1: 18, x2: ip, y2: Y1, class: 'per' }, svg);
      T2(svg, { x: ip - 5, y: 16, class: 't-xs', 'text-anchor': 'end' }, `consumer period per KV block (c.iter p50) ${int(FA3['c.iter'].p50)} ns`, `consumer 每个 KV 块的周期（c.iter p50）${int(FA3['c.iter'].p50)} ns`);
      // bars
      for (let i = 0; i < NB; i++) {
        const x = X0 + i * bw;
        series.forEach(([k, h], j) => {
          const w = (bw - 6) / series.length, bx = x + 3 + j * w, hgt = f(h[i]) * HH;
          const r = S('rect', { x: bx, y: Y1 - hgt, width: Math.max(w - 1, 1), height: Math.max(hgt, h[i] ? 0.8 : 0), class: `b-${k}` }, svg);
          if (animate) grow(r, i * 22, '50% 100%');
        });
        S('text', { x: x + bw / 2, y: Y1 + 13, class: 't-xs muted', 'text-anchor': 'middle' }, svg, i === NB - 1 ? `${int(E[i])}+` : int(E[i]));
        const hit = S('rect', { x, y: Y0 - 8, width: bw, height: HH + 22, class: 'hit' }, svg);
        hover(hit, `<b>${binLabel(i)} ns</b><br>${bi('before K', 'K 之前')}: ${int(KH[i])} · ${bi('before V', 'V 之前')}: ${int(VH[i])}`);
      }
      T2(svg, { x: X1, y: Y1 + 28, class: 't-xs muted', 'text-anchor': 'end' }, 'wait, ns (bins of unequal width)', '等待时长，ns（各箱宽度不等）');
      // p50 markers
      [['k', 'p.k_wait', 'K'], ['v', 'p.v_wait', 'V']].forEach(([k, name, lab]) => {
        if (mode !== 'both' && mode !== k) return;
        const x = pos(FA3[name].p50, X0, bw);
        S('path', { d: `M${x - 5},${Y0 - 16} l5,7 l5,-7 z`, class: `mk-${k}` }, svg);
        S('text', { x: x + (k === 'v' ? 8 : -8), y: Y0 - 10, class: `t-xs strong ${k === 'k' ? 'oly' : 'ref'}`, 'text-anchor': k === 'v' ? 'start' : 'end' }, svg, `${lab} p50 ${int(FA3[name].p50)} ns`);
      });
    }

    const K = FA3['p.k_wait'], V = FA3['p.v_wait'], C = FA3['c.iter'];
    readouts.innerHTML = `
      <div class="readout key"><span class="k">${bi('Before K, p50', 'K 之前，p50')}</span><span class="v">${int(K.p50)} ns</span><span class="s">p95 ${int(K.p95)} · ${int(K.intervals)} ${bi('waits', '次等待')}</span></div>
      <div class="readout key"><span class="k">${bi('Before V, p50', 'V 之前，p50')}</span><span class="v">${int(V.p50)} ns</span><span class="s">p95 ${int(V.p95)} · ${int(V.intervals)} ${bi('waits', '次等待')}</span></div>
      <div class="readout"><span class="k">${bi('K wait / consumer period', 'K 等待 / consumer 周期')}</span><span class="v">${Math.round((100 * K.p50) / C.p50)}%</span><span class="s">${int(K.p50)} / ${int(C.p50)} ns (p50s)</span></div>
      <div class="readout"><span class="k">${bi('EVAL.md, M4 planner', 'EVAL.md，M4 规划器')}</span><span class="v">1,925 / 138</span><span class="s">${bi('K / V p50, ns (DECISIONS 65)', 'K / V 的 p50，ns（DECISIONS 65）')}</span></div>
      <div class="readout"><span class="k">${bi('Paper, H100', '论文，H100')}</span><span class="v">1,298 ns</span><span class="s">${bi('K wait in a 1,435 ns window (§5.2.1)', '1,435 ns 窗口中的 K 等待（§5.2.1）')}</span></div>`;
    const LAB = { 45: 'p.k0_wait', 47: 'p.k1_wait', 49: 'p.k2_wait', 51: 'p.k3_wait', 53: 'p.v0_wait', 55: 'p.v1_wait', 57: 'p.v2_wait', 59: 'p.v3_wait' };
    const TILES = 512;
    const rowsOf = (name) => Object.entries(FA3[name].sites).map(([s, [n, p50, p95]]) => `<tr><td class="mono">${s}</td><td class="mono">${LAB[s] || ''}</td><td class="num">${int(n / TILES)}</td><td class="num">${int(p50)}</td><td class="num">${int(p95)}</td></tr>`).join('');
    sitesEl.innerHTML = `<table><thead><tr><th>${bi('site', '插桩点')}</th><th>${bi('label', '标签')}</th><th class="num">${bi('per tile', '每个 tile')}</th><th class="num">p50 ns</th><th class="num">p95 ns</th></tr></thead><tbody>${rowsOf('p.k_wait')}${rowsOf('p.v_wait')}</tbody></table>`;
    btns.forEach((b) => b.addEventListener('click', () => { mode = b.dataset.kv; press(btns, 'kv', mode); draw(true); }));
    logBox.addEventListener('change', () => draw(true));
    draw(false);
  }

  const ovx = document.getElementById('ovx'); if (ovx) initOverhead(ovx);
  const a5 = document.getElementById('a5w'); if (a5) initA5(a5);
  const tl = document.getElementById('tile'); if (tl) initTile(tl);
  const kv = document.getElementById('kv'); if (kv) initKV(kv);
})();
