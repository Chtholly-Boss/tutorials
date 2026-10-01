// Olympus tutorial 04, What a probe is: the record-format explorer.
// DATA is real: three slots read from the final sweep's .olyt files (/ws/runs/m7/final-48360e9/m6-trace, commit
// 48360e9): DeepGEMM 1d2d k512 trace-pp block 0 warps 0 (math) and 10 (tma) at ring depth 256, and Triton axpy
// trace-mem block 0 warp 0 (16-byte value records, ring 64). `hdr` is the 32-byte slot header as eight u32 words,
// `raw` the ring entries as written, `dec` Python's decode_slot for each record: [site, clk - clk_start, ns - gt_start, value].
(function () {
  'use strict';

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const num = (x) => x.toLocaleString('en-US');
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hex32 = (w) => '0x' + (w >>> 0).toString(16).padStart(8, '0');
  const zh = () => document.documentElement.dataset.lang === 'zh';

  const DATA = {"slots":{"k512pp_w0":{"case":"t3_dg_1d2d_k512","set":"trace-pp","slot":0,"block":0,"warp":0,"role":"math","ring":256,"vw":0,"id_bits":6,"slot_bytes":1056,"hdr":[3225184928,416923118,4022182310,2147483776,3225215744,416923118,4022234707,130],"n":130,"raw":[[4016599745],[4016642242],[4016649958],[4016655299],[4016677828],[4016681541],[4016683078],[4016727495],[4016867016],[4016932745],[4016938250],[4017003851],[4017013772],[4017082125],[4017092622],[4017165583],[4017170064],[4017171665],[4017205138],[4017223443],[4017247508],[4017253891],[4017273732],[4017277253],[4017278790],[4017315783],[4017321864],[4017402505],[4017408266],[4017479947],[4017490316],[4017554189],[4017564046],[4017633615],[4017637968],[4017639633],[4017692370],[4017697811],[4017729556],[4017735363],[4017755140],[4017758149],[4017759686],[4017792327],[4017796936],[4017854537],[4017860298],[4017930315],[4017940428],[4018005389],[4018015886],[4018090383],[4018094800],[4018096401],[4018122002],[4018127827],[4018144852],[4018153155],[4018172996],[4018176517],[4018178054],[4018227143],[4018233032],[4018313865],[4018319626],[4018389067],[4018398732],[4018462221],[4018472078],[4018539919],[4018544336],[4018546001],[4018600018],[4018605267],[4018635668],[4018641987],[4018661764],[4018664773],[4018666310],[4018700295],[4018704904],[4018762505],[4018768266],[4018838091],[4018848204],[4018913165],[4018923662],[4018998031],[4019002448],[4019004049],[4019031378],[4019049363],[4019073812],[4019081347],[4019101124],[4019104645],[4019106182],[4019164743],[4019170632],[4019251465],[4019257226],[4019329291],[4019339660],[4019402765],[4019412686],[4019482319],[4019486672],[4019488337],[4019524498],[4019530003],[4019562260],[4019568067],[4019587844],[4019590853],[4019592390],[4019608711],[4019613320],[4019670473],[4019676298],[4019740363],[4019750988],[4019811021],[4019821454],[4019892239],[4019896656],[4019898257],[4019925842],[4019930195],[4019940500],[4019948583]],"dec":[[0,37,22,null],[1,701,412,null],[37,821,483,null],[2,905,532,null],[3,1257,739,null],[4,1315,773,null],[5,1339,787,null],[6,2033,1196,null],[7,4213,2478,null],[8,5240,3082,null],[9,5326,3132,null],[10,6351,3735,null],[11,6506,3826,null],[12,7574,4454,null],[13,7738,4551,null],[14,8878,5221,null],[15,8948,5263,null],[16,8973,5277,null],[17,9496,5585,null],[18,9782,5753,null],[19,10158,5974,null],[2,10258,6033,null],[3,10568,6215,null],[4,10623,6248,null],[5,10647,6262,null],[6,11225,6602,null],[7,11320,6658,null],[8,12580,7399,null],[9,12670,7452,null],[10,13790,8110,null],[11,13952,8206,null],[12,14950,8792,null],[13,15104,8883,null],[14,16191,9522,null],[15,16259,9562,null],[16,16285,9578,null],[17,17109,10062,null],[18,17194,10112,null],[19,17690,10404,null],[2,17781,10457,null],[3,18090,10639,null],[4,18137,10667,null],[5,18161,10681,null],[6,18671,10981,null],[7,18743,11023,null],[8,19643,11553,null],[9,19733,11605,null],[10,20827,12249,null],[11,20985,12342,null],[12,22000,12939,null],[13,22164,13035,null],[14,23328,13720,null],[15,23397,13760,null],[16,23422,13775,null],[17,23822,14010,null],[18,23913,14064,null],[19,24179,14220,null],[2,24309,14297,null],[3,24619,14479,null],[4,24674,14511,null],[5,24698,14526,null],[6,25465,14977,null],[7,25557,15031,null],[8,26820,15774,null],[9,26910,15826,null],[10,27995,16465,null],[11,28146,16553,null],[12,29138,17137,null],[13,29292,17227,null],[14,30352,17851,null],[15,30421,17891,null],[16,30447,17907,null],[17,31291,18403,null],[18,31373,18451,null],[19,31848,18731,null],[2,31947,18789,null],[3,32256,18971,null],[4,32303,18998,null],[5,32327,19012,null],[6,32858,19325,null],[7,32930,19367,null],[8,33830,19896,null],[9,33920,19949,null],[10,35011,20591,null],[11,35169,20684,null],[12,36184,21281,null],[13,36348,21377,null],[14,37510,22061,null],[15,37579,22101,null],[16,37604,22116,null],[17,38031,22367,null],[18,38312,22532,null],[19,38694,22757,null],[2,38812,22826,null],[3,39121,23008,null],[4,39176,23040,null],[5,39200,23055,null],[6,40115,23593,null],[7,40207,23647,null],[8,41470,24390,null],[9,41560,24442,null],[10,42686,25105,null],[11,42848,25200,null],[12,43834,25780,null],[13,43989,25871,null],[14,45077,26511,null],[15,45145,26551,null],[16,45171,26566,null],[17,45736,26898,null],[18,45822,26949,null],[19,46326,27245,null],[2,46417,27299,null],[3,46726,27481,null],[4,46773,27508,null],[5,46797,27522,null],[6,47052,27672,null],[7,47124,27715,null],[8,48017,28240,null],[9,48108,28294,null],[10,49109,28882,null],[11,49275,28980,null],[12,50213,29532,null],[13,50376,29627,null],[14,51482,30278,null],[15,51551,30318,null],[16,51576,30333,null],[17,52007,30587,null],[18,52075,30627,null],[19,52236,30721,null],[38,52362,30795,null]]},"k512pp_w10":{"case":"t3_dg_1d2d_k512","set":"trace-pp","slot":10,"block":0,"warp":10,"role":"tma","ring":256,"vw":0,"id_bits":6,"slot_bytes":1056,"hdr":[3225184928,416923118,4022182282,2147483776,3225215520,416923118,4022234307,100],"n":100,"raw":[[4016597697],[4016642856],[4016647317],[4016650518],[4016670295],[4016676312],[4016685209],[4016699546],[4016702555],[4016707420],[4016716061],[4016717854],[4016722079],[4016731168],[4016741669],[4016743977],[4016962337],[4016978978],[4016981795],[4016985111],[4016999192],[4017031129],[4017051994],[4017057563],[4017106780],[4017121053],[4017125086],[4017175391],[4017186656],[4017404897],[4017418082],[4017421923],[4017425879],[4017437528],[4017484057],[4017508890],[4017512411],[4017557084],[4017572573],[4017575390],[4017628703],[4017642016],[4017873697],[4017887202],[4017890787],[4017894999],[4017906584],[4017953049],[4017977882],[4017981403],[4018026076],[4018041693],[4018044510],[4018097823],[4018110560],[4018316769],[4018330914],[4018334179],[4018338199],[4018350040],[4018393241],[4018418138],[4018422171],[4018467164],[4018482269],[4018486302],[4018535327],[4018546720],[4018781665],[4018795106],[4018798691],[4018802647],[4018814360],[4018860825],[4018885658],[4018889179],[4018933852],[4018949341],[4018952158],[4019005471],[4019018208],[4019254113],[4019267618],[4019271203],[4019275415],[4019287000],[4019333401],[4019359258],[4019362523],[4019405660],[4019421277],[4019424094],[4019477407],[4019490720],[4019699809],[4019715170],[4019718691],[4019720996],[4019913637],[4019919465]],"dec":[[0,33,19,null],[39,738,434,null],[20,808,475,null],[21,858,505,null],[22,1167,686,null],[23,1261,741,null],[24,1400,823,null],[25,1624,955,null],[26,1671,983,null],[27,1747,1027,null],[28,1882,1107,null],[29,1910,1123,null],[30,1976,1162,null],[31,2118,1245,null],[36,2282,1342,null],[40,2318,1363,null],[32,5730,3369,null],[33,5990,3522,null],[34,6034,3548,null],[22,6086,3579,null],[23,6306,3708,null],[24,6805,4002,null],[25,7131,4193,null],[26,7218,4244,null],[27,7987,4697,null],[28,8210,4828,null],[29,8273,4865,null],[30,9059,5327,null],[31,9235,5430,null],[32,12645,7436,null],[33,12851,7557,null],[34,12911,7592,null],[22,12973,7628,null],[23,13155,7735,null],[24,13882,8163,null],[25,14270,8391,null],[26,14325,8423,null],[27,15023,8834,null],[28,15265,8976,null],[29,15309,9002,null],[30,16142,9492,null],[31,16350,9614,null],[32,19970,11743,null],[33,20181,11867,null],[34,20237,11900,null],[22,20303,11939,null],[23,20484,12045,null],[24,21210,12472,null],[25,21598,12700,null],[26,21653,12733,null],[27,22351,13143,null],[28,22595,13286,null],[29,22639,13312,null],[30,23472,13802,null],[31,23671,13919,null],[32,26893,15814,null],[33,27114,15944,null],[34,27165,15974,null],[22,27228,16011,null],[23,27413,16120,null],[24,28088,16516,null],[25,28477,16745,null],[26,28540,16782,null],[27,29243,17196,null],[28,29479,17334,null],[29,29542,17371,null],[30,30308,17822,null],[31,30486,17927,null],[32,34157,20085,null],[33,34367,20209,null],[34,34423,20242,null],[22,34485,20278,null],[23,34668,20386,null],[24,35394,20813,null],[25,35782,21041,null],[26,35837,21073,null],[27,36535,21483,null],[28,36777,21626,null],[29,36821,21652,null],[30,37654,22141,null],[31,37853,22259,null],[32,41539,24426,null],[33,41750,24550,null],[34,41806,24583,null],[22,41872,24622,null],[23,42053,24728,null],[24,42778,25155,null],[25,43182,25392,null],[26,43233,25422,null],[27,43907,25818,null],[28,44151,25962,null],[29,44195,25988,null],[30,45028,26478,null],[31,45236,26600,null],[32,48503,28521,null],[33,48743,28662,null],[34,48798,28694,null],[35,48834,28716,null],[36,51844,30486,null],[40,51935,30539,null]]},"axpy_mem":{"case":"t1_axpy","set":"trace-mem","slot":0,"block":0,"warp":0,"role":"","ring":64,"vw":2,"id_bits":6,"slot_bytes":1056,"hdr":[3525893120,416923017,1502212679,2147483776,3525895904,416923017,1502218123,6],"n":6,"raw":[[1652348481,0,3623878656,32724],[1652353282,0,3556769792,32724],[1652356675,0,3623878656,32724],[1652361860,0,3556769792,32724],[1652555717,0,3489660928,32724],[1652619398,0,3489660928,32724]],"dec":[[0,274,140,"0x7fd4d8000000"],[1,349,178,"0x7fd4d4000000"],[2,402,206,"0x7fd4d8000000"],[3,483,247,"0x7fd4d4000000"],[4,3512,1796,"0x7fd4d0000000"],[5,4507,2305,"0x7fd4d0000000"]]}},"sites":{"k512pp":{"0":[1,"entry"],"1":[66,"c.alloc_done"],"2":[96,"c.tile_head"],"3":[147,"c.bscale_start"],"4":[169,"c.bscale_bar"],"5":[170,"c.bscale_done"],"6":[173,"c.kb0.wait"],"7":[175,"c.kb0.ready"],"8":[306,"c.kb1.wait"],"9":[334,"c.kb1.ready"],"10":[505,"c.kb2.wait"],"11":[551,"c.kb2.ready"],"12":[695,"c.kb3.wait"],"13":[741,"c.kb3.ready"],"14":[940,"c.epi.start"],"15":[943,"c.epi.bar1"],"16":[944,"c.epi.bar1_done"],"17":[1078,"c.epi.bar2"],"18":[1079,"c.epi.bar2_done"],"19":[1100,"c.tile_done"],"20":[1115,"p.warp"],"21":[1119,"p.lane"],"22":[1142,"p.tile_head"],"23":[1158,"p.kb0.wait"],"24":[1173,"p.kb0.ready"],"25":[1245,"p.kb0.issued"],"26":[1249,"p.kb1.wait"],"27":[1251,"p.kb1.ready"],"28":[1300,"p.kb1.issued"],"29":[1302,"p.kb2.wait"],"30":[1304,"p.kb2.ready"],"31":[1351,"p.kb2.issued=p.kb3.wait"],"32":[1353,"p.kb3.ready"],"33":[1401,"p.kb3.issued"],"34":[1403,"p.tile_latch"],"35":[1404,"p.drain"],"36":[1436,"p.join"],"37":[86,"exit@0x0560"],"38":[1110,"exit@0x4560"],"39":[1114,"exit@0x45a0"],"40":[1437,"exit@0x59d0"]},"axpy_mem":{"0":[25,"LDG.E.128@0x0190"],"1":[26,"LDG.E.128@0x01a0"],"2":[27,"LDG.E.128@0x01b0"],"3":[28,"LDG.E.128@0x01c0"],"4":[38,"STG.E.128@0x0260"],"5":[40,"STG.E.128@0x0280"]}}};

  // record.py: the slot header, eight u32 words
  const FIELDS = [
    { w: [0, 1], name: 'gt_start', half: 'init' }, { w: [2], name: 'clk_start', half: 'init' }, { w: [3], name: 'smid | valid', half: 'init' },
    { w: [4, 5], name: 'gt_end', half: 'exit' }, { w: [6], name: 'clk_end', half: 'exit' }, { w: [7], name: 'n_records', half: 'exit' }
  ];
  const fieldOf = (w) => FIELDS.findIndex((f) => f.w.includes(w));
  const slotBytes = (depth, recBytes) => Math.ceil((32 + depth * recBytes) / 32) * 32;      // RecordLayout.slot_bytes

  function decodeHeader(h) {
    const gtS = (BigInt(h[1]) << 32n) | BigInt(h[0]);
    const gtE = (BigInt(h[5]) << 32n) | BigInt(h[4]);
    const clkS = h[2], clkE = h[6];
    const clkEF = clkS + (((clkE - clkS) % 4294967296) + 4294967296) % 4294967296;        // clk_end extended past clk_start
    return { gtS, gtE, clkS, clkE, clkEF, spanClk: clkEF - clkS, spanNs: Number(gtE - gtS), smw: h[3], n: h[7] };
  }

  function initExplorer(host) {
    const sel = $('#rx-slot', host), idb = $('#rx-idb', host), idbOut = $('#rx-idb-out', host);
    const dep = $('#rx-depth', host), depOut = $('#rx-depth-out', host);
    const hdrBox = $('.rx-hdr', host), hdrNote = $('.rx-hdr-note', host), hdrSub = $('.rx-hdr-sub', host);
    const ring = $('.rx-ring', host), ringSub = $('.rx-ring-sub', host), bits = $('.rx-bits', host), stepsEl = $('.rx-steps', host);
    const recSub = $('.rx-rec-sub', host), readouts = $('.readouts', host);
    let s, H, recs, sites, selK = 1, field = 4;

    // decode_slot in the browser: unwrap backwards from clk_end, calibrate with the slot's own anchors
    function load() {
      s = DATA.slots[sel.value];
      H = decodeHeader(s.hdr);
      sites = DATA.sites[sel.value.startsWith('k512pp') ? 'k512pp' : sel.value];
      const idBits = s.id_bits, mod = 2 ** (32 - idBits);
      const trunc = s.raw.map((w) => Math.floor(w[0] / 2 ** idBits));
      const full = new Array(trunc.length);
      let t = H.clkEF;
      for (let k = trunc.length - 1; k >= 0; k--) { t = t - (((t - trunc[k]) % mod) + mod) % mod; full[k] = t; }
      recs = s.raw.map((w, k) => {
        const site = (w[0] & (2 ** idBits - 1)) - 1;
        const ns = Math.floor(((full[k] - H.clkS) * H.spanNs + Math.floor(H.spanClk / 2)) / H.spanClk);
        let value = null;
        if (s.vw === 1) value = BigInt(w[1]);
        if (s.vw === 2) value = (BigInt(w[3]) << 32n) | BigInt(w[2]);
        const d = s.dec[k];
        const ok = d[0] === site && d[1] === full[k] - H.clkS && d[2] === ns && (value == null || d[3] === '0x' + value.toString(16));
        return { k, w, site, trunc: trunc[k], full: full[k], ns, value, ok, info: sites[site] || [null, '?'] };
      });
      idb.value = s.id_bits;
      dep.value = Math.log2(s.ring);
      selK = Math.min(selK, recs.length - 1);
      render();
    }

    function render() {
      const b = +idb.value, D = 2 ** +dep.value;
      idbOut.textContent = b;
      depOut.textContent = D;
      const ghz = H.spanClk / H.spanNs;
      const role = s.role ? ' · ' + s.role : '';
      hdrSub.innerHTML = bi(`${s.case} / ${s.set} · slot ${s.slot} · block ${s.block} warp ${s.warp}${role}`, `${s.case} / ${s.set} · 槽位 ${s.slot} · block ${s.block} warp ${s.warp}${role}`);
      // the header: eight words, two halves
      hdrBox.innerHTML = s.hdr.map((w, i) => {
        const f = fieldOf(i);
        return `<button type="button" class="rx-w${f === field ? ' on' : ''}" data-w="${i}" data-half="${FIELDS[f].half}"><span class="o">+${i * 4}</span><span class="h">${hex32(w)}</span><span class="f">${FIELDS[f].name}</span></button>`;
      }).join('');
      const F = FIELDS[field];
      const notes = {
        'gt_start': bi(`<b>gt_start</b> = ${H.gtS} ns: <code>%globaltimer</code> as INIT read it (<code>CS2R SR_GLOBALTIMERLO</code>, a u64 across words +0 and +4). With clk_start it is this warp's start anchor.`,
          `<b>gt_start</b> = ${H.gtS} ns：INIT 读到的 <code>%globaltimer</code>（<code>CS2R SR_GLOBALTIMERLO</code>，u64，跨 +0 与 +4 两个字）。与 clk_start 一起构成这个 warp 的起始锚点。`),
        'clk_start': bi(`<b>clk_start</b> = ${num(H.clkS)}: the SM clock (<code>SR_CLOCKLO</code>) INIT read next to the timer. Cycles, not time: the SM clock is neither reset at launch nor shared between SMs.`,
          `<b>clk_start</b> = ${num(H.clkS)}：INIT 紧接着计时器读到的 SM 时钟（<code>SR_CLOCKLO</code>）。它数的是周期而不是时间：SM 时钟既不在启动时复位，各 SM 之间也不同步。`),
        'smid | valid': bi(`<b>${hex32(H.smw)}</b>: bit 31 = ${H.smw >>> 31}, set by INIT (<code>LOP3</code> with 0x80000000), so a slot whose warp never ran stays all zero; SM id = ${H.smw & 0xffff} (<code>SR_VIRTUALSMID</code>) in bits [15:0]. Bits [30:16] are never written, and the buffer check requires them to be zero.`,
          `<b>${hex32(H.smw)}</b>：第 31 位 = ${H.smw >>> 31}，由 INIT 置位（与 0x80000000 做 <code>LOP3</code>），所以 warp 从未运行的槽位保持全零；SM 编号 = ${H.smw & 0xffff}（<code>SR_VIRTUALSMID</code>），位于 [15:0]。[30:16] 位从不写入，缓冲区检查要求它们为零。`),
        'gt_end': bi(`<b>gt_end</b> = ${H.gtE} ns, from the last EXIT calibration this warp ran: ${num(H.spanNs)} ns after gt_start. Zero would mean the calibration never ran, and the decoder would unwrap forwards from clk_start instead.`,
          `<b>gt_end</b> = ${H.gtE} ns，来自这个 warp 最后一次执行的 EXIT 校准：比 gt_start 晚 ${num(H.spanNs)} ns。若为零，表示校准从未执行，解码器会改为从 clk_start 向前展开。`),
        'clk_end': bi(`<b>clk_end</b> = ${num(H.clkE)}${H.clkEF !== H.clkE ? `, extended past clk_start to ${num(H.clkEF)}` : ''}: ${num(H.spanClk)} cycles in ${num(H.spanNs)} ns, so this warp's clock ran at <b>${ghz.toFixed(3)} GHz</b>. Nothing else assumes a frequency.`,
          `<b>clk_end</b> = ${num(H.clkE)}${H.clkEF !== H.clkE ? `，延伸到 clk_start 之后为 ${num(H.clkEF)}` : ''}：${num(H.spanNs)} ns 内走了 ${num(H.spanClk)} 个周期，所以这个 warp 的时钟频率是 <b>${ghz.toFixed(3)} GHz</b>。此外没有任何地方假设频率。`),
        'n_records': bi(`<b>n_records</b> = ${num(H.n)}: every record this warp wrote, stored in the same 16-byte store as gt_end and clk_end. The counter never wraps; the ring of this run holds ${s.ring}, so ${H.n > s.ring ? `it wrapped and the oldest ${H.n - s.ring} are gone` : 'nothing was overwritten'}.`,
          `<b>n_records</b> = ${num(H.n)}：这个 warp 写过的全部记录数，与 gt_end、clk_end 在同一条 16 字节 store 中写出。计数器从不回绕；这次运行的环能容纳 ${s.ring} 条，所以${H.n > s.ring ? `环已回绕，最旧的 ${H.n - s.ring} 条丢失` : '没有记录被覆盖'}。`)
      };
      hdrNote.innerHTML = notes[F.name];
      // the ring: entry e holds the latest record k < n with k % D == e
      const nTotal = s.n, kept = Math.min(nTotal, D), lost = nTotal - kept;
      const cells = [];
      for (let e = 0; e < D; e++) {
        let k = -1;
        if (e < nTotal) k = e + Math.floor((nTotal - 1 - e) / D) * D;
        let cls = 'rx-e', title = zh() ? `表项 ${e}：空` : `entry ${e}: empty`;
        if (k >= 0) {
          const r = recs[k], over = k >= D;
          cls += ' kept' + (over ? ' lost' : '');
          title = zh() ? `表项 ${e}：第 ${k} 条记录，s${r.site}@${r.info[0]} ${r.info[1]}${over ? `，覆盖了 ${Math.floor(k / D)} 条更早的记录` : ''}`
            : `entry ${e}: record ${k}, s${r.site}@${r.info[0]} ${r.info[1]}${over ? `, overwrote ${Math.floor(k / D)} older record(s)` : ''}`;
        }
        if (k === selK) cls += ' sel';
        cells.push(`<button type="button" class="${cls}" data-k="${k}" title="${esc(title)}" aria-label="${esc(title)}"></button>`);
      }
      ring.innerHTML = cells.join('');
      ring.style.setProperty('--cols', String(Math.min(D, 64)));
      const what = D !== s.ring ? bi(` · what-if: the run used ${s.ring}`, ` · 假设：实际运行用的是 ${s.ring}`) : '';
      ringSub.innerHTML = bi(`${D} entries × ${[4, 8, 16][s.vw]} B · ${num(nTotal)} records · oldest kept = ${nTotal > D ? `n % D = ${nTotal % D}` : 'entry 0'}`, `${D} 个表项 × ${[4, 8, 16][s.vw]} B · ${num(nTotal)} 条记录 · 最早保留 = ${nTotal > D ? `n % D = ${nTotal % D}` : '表项 0'}`) + what;
      // the selected record
      const r = recs[selK];
      if (!r) return;
      const gone = r.k < nTotal - D;
      recSub.innerHTML = bi(`record ${r.k} of ${num(nTotal)} · entry ${r.k % D} · +${32 + (r.k % D) * [4, 8, 16][s.vw]}${gone ? ` · overwritten in a ring of ${D}` : ''}`, `第 ${r.k} 条，共 ${num(nTotal)} 条 · 表项 ${r.k % D} · +${32 + (r.k % D) * [4, 8, 16][s.vw]}${gone ? ` · 在深度 ${D} 的环中已被覆盖` : ''}`);
      const bitRow = (word, idBits, cls) => {
        let out = '';
        for (let i = 31; i >= 0; i--) {
          const bit = Math.floor(word / 2 ** i) % 2;
          out += `<span class="rx-b ${cls ? cls : i >= idBits ? 'c' : 'i'}" title="bit ${i}">${bit}</span>`;
        }
        return out;
      };
      const fitsId = r.site + 1 < 2 ** b;
      const rep = ((r.full % 2 ** (32 - b)) * 2 ** b + (fitsId ? r.site + 1 : 0)) % 4294967296;
      let html = `<div class="rx-strip"><span>${bi('word 0 as written', '写入的第 0 个字')}<br>${hex32(r.w[0])}</span><div class="rx-bitrow">${bitRow(r.w[0], s.id_bits)}</div><span class="rx-key"><i class="c"></i>${bi(`clock, ${32 - s.id_bits} bits`, `时钟，${32 - s.id_bits} 位`)} <i class="i"></i>${bi(`site_id + 1, ${s.id_bits} bits`, `站点编号 + 1，${s.id_bits} 位`)}</span></div>`;
      if (b !== s.id_bits) {
        html += `<div class="rx-strip"><span>${bi(`repacked with id_bits ${b}`, `按 id_bits ${b} 重新打包`)}<br>${fitsId ? hex32(rep) : bi('id does not fit', '编号放不下')}</span><div class="rx-bitrow">${fitsId ? bitRow(rep, b) : bitRow(0, 0, 'x')}</div><span class="rx-key">${fitsId ? bi(`clock keeps ${32 - b} bits`, `时钟保留 ${32 - b} 位`) : bi(`${2 ** b - 1} sites at most; this one is s${r.site}`, `最多 ${2 ** b - 1} 个站点；这条是 s${r.site}`)}</span></div>`;
      }
      bits.innerHTML = html;
      const tNext = r.k + 1 < recs.length ? recs[r.k + 1].full : H.clkEF;
      const anchorEn = r.k + 1 < recs.length ? 'the next record' : 'the exit anchor clk_end';
      const anchorZh = r.k + 1 < recs.length ? '下一条记录' : '出口锚点 clk_end';
      const mod = 2 ** (32 - s.id_bits);
      const steps = [
        bi(`site = (word &amp; ${2 ** s.id_bits - 1}) − 1 = ${(r.w[0] & (2 ** s.id_bits - 1))} − 1 = <b>${r.site}</b>: <code>s${r.site}@${r.info[0]}</code> ${esc(r.info[1])}`,
          `站点 = (字 &amp; ${2 ** s.id_bits - 1}) − 1 = ${(r.w[0] & (2 ** s.id_bits - 1))} − 1 = <b>${r.site}</b>：<code>s${r.site}@${r.info[0]}</code> ${esc(r.info[1])}`),
        bi(`truncated clock c = word &gt;&gt; ${s.id_bits} = ${num(r.trunc)} (${32 - s.id_bits} bits: wraps every ${num(mod)} cycles, ${(mod / ghz / 1e6).toFixed(1)} ms at this warp's rate)`,
          `截断时钟 c = 字 &gt;&gt; ${s.id_bits} = ${num(r.trunc)}（${32 - s.id_bits} 位：每 ${num(mod)} 个周期回绕一次，按这个 warp 的频率是 ${(mod / ghz / 1e6).toFixed(1)} ms）`),
        bi(`unwrap backwards from ${anchorEn}, t = ${num(tNext)}: clk = t − ((t − c) mod 2<sup>${32 - s.id_bits}</sup>) = <b>${num(r.full)}</b> = clk_start + ${num(r.full - H.clkS)}`,
          `从${anchorZh} t = ${num(tNext)} 向后展开：clk = t − ((t − c) mod 2<sup>${32 - s.id_bits}</sup>) = <b>${num(r.full)}</b> = clk_start + ${num(r.full - H.clkS)}`),
        bi(`ns = ⌊((clk − clk_start) × ${num(H.spanNs)} + ${num(Math.floor(H.spanClk / 2))}) / ${num(H.spanClk)}⌋ = <b>gt_start + ${num(r.ns)} ns</b>, an integer: no float, no assumed frequency`,
          `ns = ⌊((clk − clk_start) × ${num(H.spanNs)} + ${num(Math.floor(H.spanClk / 2))}) / ${num(H.spanClk)}⌋ = <b>gt_start + ${num(r.ns)} ns</b>，整数运算：没有浮点，也不假设频率`)
      ];
      if (r.value != null) {
        steps.push(s.vw === 2
          ? bi(`value at +8: <code>0x${r.value.toString(16)}</code>, a 64-bit <code>STG.E.64</code>${r.w[1] === 0 ? '; the word at +4 is still 0, never written' : ''}`, `+8 处的值：<code>0x${r.value.toString(16)}</code>，一条 64 位 <code>STG.E.64</code>${r.w[1] === 0 ? '；+4 处的字仍为 0，从未写入' : ''}`)
          : bi(`value at +4: <code>0x${r.value.toString(16)}</code>`, `+4 处的值：<code>0x${r.value.toString(16)}</code>`));
      }
      steps.push(r.ok ? bi(`<span class="ok">✓</span> equals Python's <code>decode_slot</code> for this record`, `<span class="ok">✓</span> 与 Python 的 <code>decode_slot</code> 对这条记录的结果一致`)
        : bi(`<span class="no">✗</span> differs from <code>decode_slot</code>`, `<span class="no">✗</span> 与 <code>decode_slot</code> 不一致`));
      stepsEl.innerHTML = steps.map((x) => `<li>${x}</li>`).join('');
      // readouts
      let maxGap = 0;
      for (let k = 1; k < recs.length; k++) maxGap = Math.max(maxGap, recs[k].full - recs[k - 1].full);
      maxGap = Math.max(maxGap, H.clkEF - recs[recs.length - 1].full, recs[0].full - H.clkS);
      const wrapCyc = 2 ** (32 - b);
      const nSites = Object.keys(sites).length;
      const needB = Math.max(6, (nSites + 1).toString(2).length);
      const okAll = recs.every((x) => x.ok);
      const wrapTxt = wrapCyc / ghz >= 1e6 ? (wrapCyc / ghz / 1e6).toFixed(1) + ' ms' : (wrapCyc / ghz / 1e3).toFixed(0) + ' µs';
      readouts.innerHTML = `
        <div class="readout key"><span class="k">${bi('Calibrated clock', '校准后的时钟')}</span><span class="v">${ghz.toFixed(3)} GHz</span><span class="s">${bi(`${num(H.spanClk)} cycles in ${num(H.spanNs)} ns, this warp's own anchors`, `${num(H.spanNs)} ns 内 ${num(H.spanClk)} 个周期，这个 warp 自己的锚点`)}</span></div>
        <div class="readout"><span class="k">id_bits ${b}</span><span class="v">${num(2 ** b - 1)} ${bi('sites', '个站点')}</span><span class="s">${nSites <= 2 ** b - 1 ? bi(`this set has ${nSites}; the planner takes max(6, bits needed) = ${needB}`, `本集合有 ${nSites} 个；规划器取 max(6, 所需位数) = ${needB}`) : bi(`too few for this set's ${nSites} sites`, `装不下本集合的 ${nSites} 个站点`)}</span></div>
        <div class="readout"><span class="k">${bi('Record clock wraps every', '记录时钟回绕周期')}</span><span class="v">${wrapTxt}</span><span class="s">${bi(`${32 - b} bits; the largest gap in this slot is ${num(maxGap)} cycles ${maxGap < wrapCyc ? '&lt;' : '&gt;'} ${num(wrapCyc)}`, `${32 - b} 位；这个槽位最大的间隔是 ${num(maxGap)} 周期 ${maxGap < wrapCyc ? '&lt;' : '&gt;'} ${num(wrapCyc)}`)}</span></div>
        <div class="readout${lost ? ' key' : ''}"><span class="k">${bi(`Ring of ${D}`, `深度 ${D} 的环`)}</span><span class="v">${lost ? bi(`${num(lost)} lost`, `丢失 ${num(lost)} 条`) : bi('all kept', '全部保留')}</span><span class="s">${bi(`slot = ${num(slotBytes(D, [4, 8, 16][s.vw]))} B${lost ? '; n_records &gt; depth, so the run is re-run deeper' : ''}`, `槽位 = ${num(slotBytes(D, [4, 8, 16][s.vw]))} B${lost ? '；n_records &gt; 深度，这次运行会以更深的环重跑' : ''}`)}</span></div>
        <div class="readout"><span class="k">${bi('Browser decode', '浏览器解码')}</span><span class="v">${okAll ? '<span class="ok">✓</span>' : '<span class="no">✗</span>'} ${recs.filter((x) => x.ok).length} / ${recs.length}</span><span class="s">${bi('records equal decode_slot', '条记录与 decode_slot 一致')}</span></div>`;
    }

    hdrBox.addEventListener('click', (e) => { const w = e.target.closest('.rx-w'); if (w) { field = fieldOf(+w.dataset.w); render(); } });
    hdrBox.addEventListener('pointerover', (e) => { const w = e.target.closest('.rx-w'); if (w && e.pointerType === 'mouse') { const f = fieldOf(+w.dataset.w); if (f !== field) { field = f; render(); } } });
    ring.addEventListener('click', (e) => { const c = e.target.closest('.rx-e'); if (!c) return; const k = +c.dataset.k; if (k >= 0 && recs[k]) { selK = k; render(); } });
    sel.addEventListener('change', () => { selK = 1; load(); });
    idb.addEventListener('input', render);
    dep.addEventListener('input', render);
    new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] });
    load();
  }

  const host = document.getElementById('rexp');
  if (host) initExplorer(host);
})();
