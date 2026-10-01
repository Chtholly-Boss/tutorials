// Olympus tutorial 03, Writing probes into the binary: the splice animator.
// DATA.K holds two real corpus kernels, t0_call (CALL.REL.NOINC / return literal / RET.REL) and t0_switch (BRX and
// its c[0x2] jump table): every 128-bit word, cuobjdump's text, the offset-bearing field of each branch / anchor /
// return literal (slot, bit parts, scale, sign), the .nv.info EIATTRs, the jump table, the symbols, the parameter
// block size, and the islands the search planner put into each set (plan.json of the final static sweep,
// /ws/runs/m7/final-48360e9/m6-static). The relocation core below mirrors olympus/splice/islands.py at 21662ef
// (IndexMap.target_off / instr_off, _return_literals, encode.retarget / moved_anchor, the c[0x2] table, the
// EIATTR pass, _append_param, the symbol edits).
(function (root) {
  'use strict';

  const DATA = { K: {"t0_call":{"kernel":"t0_call","reg":9,"code":37,"blocks":[[0,14],[14,20],[20,24],[24,26],[26,27],[27,35],[35,37]],"ins":[["00000a00ff017b82","000fe20000000800","LDC R1, c[0x0][0x28]","LDC",0,0,"mv"],["0000000000007919","000e2e0000002100","S2R R0, SR_TID.X","S2R",0,0,"v"],["00000000000479c3","000e220000002500","S2UR UR4, SR_CTAID.X","S2UR",0,0,"uv"],["0000820000067ab9","000fce0000000a00","ULDC.64 UR6, c[0x0][0x208]","ULDC",0,0,"mu"],["00000000ff057b82","000e300000000800","LDC R5, c[0x0][RZ]","LDC",0,0,"mv"],["00008400ff027b82","000e620000000a00","LDC.64 R2, c[0x0][0x210]","LDC",0,0,"mv"],["00000003ff067435","000fe200000001ff","HFMA2.MMA R6, -RZ, RZ, 0, 1.78813934326171875e-07","HFMA2.MMA",0,0,""],["0000000405057c24","001fe2000f8e0200","IMAD R5, R5, UR4, R0","IMAD",0,0,""],["0000880000047ab9","000fc60000000800","ULDC UR4, c[0x0][0x220]","ULDC",0,0,"mu"],["0000000405027825","002fe200078e0202","IMAD.WIDE R2, R5, 0x4, R2","IMAD",0,0,""],["0000000400047c02","000fc80008000f00","MOV R4, UR4","MOV",0,0,""],["0000000602007981","000164000c1e9900","LDG.E.CONSTANT R0, desc[UR6][R2.64]","LDG",0,0,"mv"],["000000e000027802","001fce0000000f00","MOV R2, 0xe0","MOV",0,["Sb",[32,32],1,0,224,13],""],["0000000000287944","020fea0003c00000","CALL.REL.NOINC 0x180","CALL",["rel","Sa",[34,48,16,8],4,1],0,"b"],["00008800ff047b82","000e220000000800","LDC R4, c[0x0][0x220]","LDC",0,0,"mv"],["3f00000000007820","000fe20000400000","FMUL R0, R0, 0.5","FMUL",0,0,""],["0000000500067802","000fe40000000f00","MOV R6, 0x5","MOV",0,0,""],["0000014000027802","000fe20000000f00","MOV R2, 0x140","MOV",0,["Sb",[32,32],1,0,320,19],""],["3f80000004047421","001fce0000000000","FADD R4, R4, 1","FADD",0,0,""],["0000000000107944","000fea0003c00000","CALL.REL.NOINC 0x180","CALL",["rel","Sa",[34,48,16,8],4,1],0,"b"],["00008600ff027b82","000e240000000a00","LDC.64 R2, c[0x0][0x218]","LDC",0,0,"mv"],["0000000405027825","001fca00078e0202","IMAD.WIDE R2, R5, 0x4, R2","IMAD",0,0,""],["0000000002007986","000fe2000c101906","STG.E desc[UR6][R2.64], R0","STG",0,0,"m"],["000000000000794d","000fea0003800000","EXIT","EXIT",0,0,"x"],["000000010600780c","000fda0003f06270","ISETP.GE.AND P0, PT, R6, 0x1, PT","ISETP",0,0,""],["0000000000248947","000fea0003800000","@!P0 BRA 0x230","BRA",["rel","sImm",[34,48,16,8],4,1],0,"b"],["0000003f00047c82","000fca0008000000","UMOV UR4, URZ","UMOV",0,0,"u"],["0000000400037c45","000fe20008201400","I2FP.F32.S32 R3, UR4","I2FP",0,0,""],["0000000104047890","000fc8000fffe03f","UIADD3 UR4, UR4, 0x1, URZ","UIADD3",0,0,"u"],["0000000003037221","000fe40000000000","FADD R3, R3, R0","FADD",0,0,""],["0000000406007c0c","000fe4000bf03270","ISETP.LE.AND P0, PT, R6, UR4, PT","ISETP",0,0,""],["3e22f98303037820","000fcc000040c000","FMUL.RZ R3, R3, 0.15915493667125701904","FMUL",0,0,""],["0000000300037308","000e240000000400","MUFU.SIN R3, R3","MUFU",0,0,"v"],["0000000004007223","001fc60000000003","FFMA R0, R4, R0, R3","FFMA",0,0,""],["fffffffc00e08947","000fea000383ffff","@!P0 BRA 0x1b0","BRA",["rel","sImm",[34,48,16,8],4,1],0,"b"],["00000000ff037435","000fcc00000001ff","HFMA2.MMA R3, -RZ, RZ, 0, 0","HFMA2.MMA",0,0,""],["fffffffc026c7950","000fea0003c3ffff","RET.REL.NODEC R2 0x0","RET",["anchor","Ra_offset",[34,48,16,8],4,1],0,"bi"],["fffffffc00fc7947","000fc0000383ffff","BRA 0x250","BRA",["rel","sImm",[34,48,16,8],4,1],0,"b"],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""]],"attrs":[["KPARAM_INFO",[0,1048578,1175552],0],["KPARAM_INFO",[0,524289,2224128],0],["KPARAM_INFO",[0,0,2224128],0],["MAXREG_COUNT",255,0],["EXIT_INSTR_OFFSETS",[368],1],["MAX_THREADS",[256,1,1],0],["CBANK_PARAM_SIZE",20,0],["PARAM_CBANK",[13,1311248],0]],"c2":[],"syms":[["$t0_call$_Z14t0_call_helperffi",384,384],["t0_call",0,768]],"presets":{"trace-sche":[[1,"init",35],[1,"site",8],[23,"site",8],[23,"calib",8]],"trace-pp":[[1,"init",35],[1,"site",8],[13,"site",8],[14,"site",8],[19,"site",8],[20,"site",8],[23,"site",8],[23,"calib",8],[24,"site",8],[36,"site",8]],"trace-mem":[[1,"init",35],[11,"site",9],[22,"site",9],[23,"calib",8]]},"sites":{"trace-sche":[[1,"entry"],[23,"exit@0x0170"]],"trace-pp":[[1,"entry"],[23,"exit@0x0170"],[13,"call0"],[14,"call0.return"],[19,"call1"],[20,"call1.return"],[24,"helper.entry"],[36,"helper.ret"]],"trace-mem":[[11,"LDG.E.CONSTANT@0x00b0"],[22,"STG.E@0x0160"]]},"param":20,"sha":"7d6fafd1353b61e039214962a4f49c7a9d1e83e12f71a28eab1c3f6d3b3f2e75"},"t0_switch":{"kernel":"t0_switch","reg":11,"code":89,"blocks":[[0,17],[17,21],[21,31],[31,39],[39,50],[50,56],[56,61],[61,72],[72,80],[80,83],[83,84],[84,89]],"ins":[["00000a00ff017b82","000fe20000000800","LDC R1, c[0x0][0x28]","LDC",0,0,"mv"],["0000000000007919","000e2e0000002500","S2R R0, SR_CTAID.X","S2R",0,0,"v"],["00008400ff067b82","000e620000000a00","LDC.64 R6, c[0x0][0x210]","LDC",0,0,"mv"],["0000000000047ab9","000fe20000000800","ULDC UR4, c[0x0][0x0]","ULDC",0,0,"mu"],["0000000000037919","000e2c0000002100","S2R R3, SR_TID.X","S2R",0,0,"v"],["00008600ff047b82","000ea20000000a00","LDC.64 R4, c[0x0][0x218]","LDC",0,0,"mv"],["0000000400007c24","001fe2000f8e0203","IMAD R0, R0, UR4, R3","IMAD",0,0,""],["0000820000047ab9","000fc60000000a00","ULDC.64 UR4, c[0x0][0x208]","ULDC",0,0,"mu"],["0000000400067825","002fcc00078e0206","IMAD.WIDE R6, R0, 0x4, R6","IMAD",0,0,""],["0000000406067981","000ee2000c1e9900","LDG.E.CONSTANT R6, desc[UR4][R6.64]","LDG",0,0,"mv"],["0000000400047825","004fca00078e0204","IMAD.WIDE R4, R0, 0x4, R4","IMAD",0,0,""],["0000000404027981","000162000c1e9900","LDG.E.CONSTANT R2, desc[UR4][R4.64]","LDG",0,0,"mv"],["0000047000007945","000fe20003800000","BSSY B0, 0x540","BSSY",["rel","Sa",[34,30],4,1],0,"b"],["0000001fff037819","000fe40000011400","SHF.R.S32.HI R3, RZ, 0x1f, R0","SHF",0,0,""],["0000000706087812","008fc800078ec0ff","LOP3.LUT R8, R6, 0x7, RZ, 0xc0, !PT","LOP3",0,0,""],["000000060800780c","000fda0003f04070","ISETP.GT.U32.AND P0, PT, R8, 0x6, PT","ISETP",0,0,""],["0000000000fc0947","000fea0003800000","@P0 BRA 0x500","BRA",["rel","sImm",[34,48,16,8],4,1],0,"b"],["0000000208087819","000fc800000006ff","SHF.L.U32 R8, R8, 0x2, RZ","SHF",0,0,""],["0080000008047b82","001e240000000800","LDC R4, c[0x2][R8]","LDC",0,0,"mv"],["0000001fff057819","001fc80000011404","SHF.R.S32.HI R5, RZ, 0x1f, R4","SHF",0,0,""],["fffffffc04ac7949","000fea000383ffff","BRX R4 -0x150","BRX",["anchor","Ra_offset",[34,48,16,8],4,1],0,"bi"],["4000000002027421","020fcc0000000200","FADD R2, |R2|, 2","FADD",0,0,""],["0000000200027308","000e240000000c00","MUFU.LG2 R2, R2","MUFU",0,0,"v"],["3f31721802047820","001fc80000400000","FMUL R4, R2, 0.69314718246459960938","FMUL",0,0,""],["3f80000004057423","000fca0000000004","FFMA R5, R4, R4, 1","FFMA",0,0,""],["008000000500780b","000fda0003f0e200","FSETP.GEU.AND P0, PT, |R5|, 1.175494350822287508e-38, PT","FSETP",0,0,""],["4b80000005058820","000fc80000400000","@!P0 FMUL R5, R5, 16777216","FMUL",0,0,""],["0000000500077308","000e240000001400","MUFU.RSQ R7, R5","MUFU",0,0,"v"],["4580000007078820","001fc80000400000","@!P0 FMUL R7, R7, 4096","FMUL",0,0,""],["4060000004077823","000fe20000000007","FFMA R7, R4, 3.5, R7","FFMA",0,0,""],["0000000000d07947","000fec0003800000","BRA 0x530","BRA",["rel","sImm",[34,48,16,8],4,1],0,"b"],["3e22f98302047820","020fe2000040c000","FMUL.RZ R4, R2, 0.15915493667125701904","FMUL",0,0,""],["40400000ff077435","000fca00000001ff","HFMA2.MMA R7, -RZ, RZ, 2.125, 0","HFMA2.MMA",0,0,""],["0000000400047308","000e2a0000000400","MUFU.SIN R4, R4","MUFU",0,0,"v"],["3f80000004077423","001fc80000000007","FFMA R7, R4, R7, 1","FFMA",0,0,""],["3e22f98307057820","000fcc000040c000","FMUL.RZ R5, R7, 0.15915493667125701904","FMUL",0,0,""],["0000000500057308","000e240000000000","MUFU.COS R5, R5","MUFU",0,0,"v"],["0000000702077223","001fe20000000005","FFMA R7, R2, R7, R5","FFMA",0,0,""],["0000000000b07947","000fec0003800000","BRA 0x530","BRA",["rel","sImm",[34,48,16,8],4,1],0,"b"],["3fb8aa3b02047820","020fca0000400000","FMUL R4, R2, 1.4426950216293334961","FMUL",0,0,""],["c2fc00000400780b","000fda0003f0e000","FSETP.GEU.AND P0, PT, R4, -126, PT","FSETP",0,0,""],["3f00000004048820","000fc80000400000","@!P0 FMUL R4, R4, 0.5","FMUL",0,0,""],["0000000400057308","000e240000000800","MUFU.EX2 R5, R4","MUFU",0,0,"v"],["0000000505058220","001fc80000400000","@!P0 FMUL R5, R5, R5","FMUL",0,0,""],["bf00000002027823","000fc80000000005","FFMA R2, R2, -0.5, R5","FFMA",0,0,""],["3f80000002057421","000fcc0000000200","FADD R5, |R2|, 1","FADD",0,0,""],["0000000500057308","000e240000000c00","MUFU.LG2 R5, R5","MUFU",0,0,"v"],["3f31721805077820","001fc80000400000","FMUL R7, R5, 0.69314718246459960938","FMUL",0,0,""],["0000000202077223","000fe20000000007","FFMA R7, R2, R2, R7","FFMA",0,0,""],["0000000000847947","000fec0003800000","BRA 0x530","BRA",["rel","sImm",[34,48,16,8],4,1],0,"b"],["0000000202057220","020fc80000400000","FMUL R5, R2, R2","FMUL",0,0,""],["c000000002057423","000fc80000000005","FFMA R5, R2, R5, -2","FFMA",0,0,""],["3e22f98305027820","000fcc000040c000","FMUL.RZ R2, R5, 0.15915493667125701904","FMUL",0,0,""],["0000000200027308","000e240000000400","MUFU.SIN R2, R2","MUFU",0,0,"v"],["3e00000005077823","001fe20000000002","FFMA R7, R5, 0.125, R2","FFMA",0,0,""],["00000000006c7947","000fec0003800000","BRA 0x530","BRA",["rel","sImm",[34,48,16,8],4,1],0,"b"],["3f80000002047421","020fcc0000000200","FADD R4, |R2|, 1","FADD",0,0,""],["0000000400047308","000e240000001400","MUFU.RSQ R4, R4","MUFU",0,0,"v"],["40e0000004077820","001fc80000400000","FMUL R7, R4, 7","FMUL",0,0,""],["0000000707077223","000fe20000000002","FFMA R7, R7, R7, R2","FFMA",0,0,""],["0000000000587947","000fec0003800000","BRA 0x530","BRA",["rel","sImm",[34,48,16,8],4,1],0,"b"],["0000000202047221","020fc80000000000","FADD R4, R2, R2","FADD",0,0,""],["3e22f98304047820","000fc8000040c000","FMUL.RZ R4, R4, 0.15915493667125701904","FMUL",0,0,""],["0000000400057308","000e240000000000","MUFU.COS R5, R4","MUFU",0,0,"v"],["0000000502057221","001fc80000000000","FADD R5, R2, R5","FADD",0,0,""],["bfb8aa3b05057820","000fca0000400200","FMUL R5, |R5|, -1.4426950216293334961","FMUL",0,0,""],["c2fc00000500780b","000fda0003f0e000","FSETP.GEU.AND P0, PT, R5, -126, PT","FSETP",0,0,""],["3f00000005058820","000fc80000400000","@!P0 FMUL R5, R5, 0.5","FMUL",0,0,""],["0000000500077308","000e240000000800","MUFU.EX2 R7, R5","MUFU",0,0,"v"],["0000000707078220","001fc80000400000","@!P0 FMUL R7, R7, R7","FMUL",0,0,""],["40a0000007077820","000fe20000400000","FMUL R7, R7, 5","FMUL",0,0,""],["00000000002c7947","000fec0003800000","BRA 0x530","BRA",["rel","sImm",[34,48,16,8],4,1],0,"b"],["00000002ff047209","020fe40007800000","FMNMX R4, RZ, R2, !PT","FMNMX",0,0,""],["4040000000077802","000fca0000000f00","MOV R7, 0x40400000","MOV",0,0,""],["3fa0000004077823","000fc80000000807","FFMA R7, R4, 1.25, -R7","FFMA",0,0,""],["0000000702027221","000fc80000000000","FADD R2, R2, R7","FADD",0,0,""],["3e22f98302027820","000fcc000040c000","FMUL.RZ R2, R2, 0.15915493667125701904","FMUL",0,0,""],["0000000200027308","000e240000000400","MUFU.SIN R2, R2","MUFU",0,0,"v"],["0000000207077220","001fe20000400000","FMUL R7, R7, R2","FMUL",0,0,""],["00000000000c7947","000fec0003800000","BRA 0x530","BRA",["rel","sImm",[34,48,16,8],4,1],0,"b"],["be22f98302047820","021fc8000040c000","FMUL.RZ R4, R2, -0.15915493667125701904","FMUL",0,0,""],["0000000400077308","000e240000000000","MUFU.COS R7, R4","MUFU",0,0,"v"],["bf00000002077823","001fce0000000007","FFMA R7, R2, -0.5, R7","FFMA",0,0,""],["0000000000007941","000fea0003800000","BSYNC B0","BSYNC",0,0,"s"],["0000880000067ab9","000fe40000000a00","ULDC.64 UR6, c[0x0][0x220]","ULDC",0,0,"mu"],["0000000600027c11","000fc8000f8010ff","LEA R2, P0, R0, UR6, 0x2","LEA",0,0,""],["0000000700037c11","000fca00080f1403","LEA.HI.X R3, R0, UR7, R3, 0x2, P0","LEA",0,0,""],["0000000702007986","000fe2000c101904","STG.E desc[UR4][R2.64], R7","STG",0,0,"m"],["000000000000794d","000fea0003800000","EXIT","EXIT",0,0,"x"],["fffffffc00fc7947","000fc0000383ffff","BRA 0x590","BRA",["rel","sImm",[34,48,16,8],4,1],0,"b"],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""],["0000000000007918","000fc00000000000","NOP","NOP",0,0,""]],"attrs":[["KPARAM_INFO",[0,1048578,2224128],0],["KPARAM_INFO",[0,524289,2224128],0],["KPARAM_INFO",[0,0,2224128],0],["MAXREG_COUNT",255,0],["EXIT_INSTR_OFFSETS",[1408],1],["INDIRECT_BRANCH_TARGETS",[320,0,7,496,624,800,896,976,1152,336],1],["MAX_THREADS",[256,1,1],0],["CBANK_PARAM_SIZE",24,0],["PARAM_CBANK",[13,1573392],0]],"c2":[496,624,800,896,976,1152,336],"syms":[["t0_switch",0,1664]],"presets":{"trace-sche":[[1,"init",34],[1,"site",8],[88,"site",8],[88,"calib",8]],"trace-pp":[[1,"init",34],[1,"site",8],[20,"site",8],[21,"site",8],[31,"site",8],[39,"site",8],[50,"site",8],[56,"site",8],[61,"site",8],[72,"site",8],[80,"site",8],[83,"site",8],[84,"site",8],[88,"site",8],[88,"calib",8]],"trace-mem":[[1,"init",34],[9,"site",9],[11,"site",9],[87,"site",9],[88,"calib",8]]},"sites":{"trace-sche":[[1,"entry"],[88,"exit@0x0580"]],"trace-pp":[[1,"entry"],[20,"dispatch"],[21,"case@0x0150"],[31,"case@0x01f0"],[39,"case@0x0270"],[50,"case@0x0320"],[56,"case@0x0380"],[61,"case@0x03d0"],[72,"case@0x0480"],[80,"case.default"],[83,"join"],[84,"joined"],[88,"exit@0x0580"]],"trace-mem":[[9,"LDG.E.CONSTANT@0x0090"],[11,"LDG.E.CONSTANT@0x00b0"],[87,"STG.E@0x0570"]]},"param":24,"sha":"b297e710c877fbcb641b98fa3be5d6a928bddea4931ba61704b74646bec528d4"}} };

  // ===================================================================== 128-bit words
  const M64 = (1n << 64n) - 1n;
  const mask = (n) => (1n << BigInt(n)) - 1n;
  const word = (lo, hi) => (BigInt('0x' + hi) << 64n) | BigInt('0x' + lo);
  const hex16 = (x) => x.toString(16).padStart(16, '0');
  const lohi = (w) => [hex16(w & M64), hex16(w >> 64n)];
  const bits = (w, pos, n) => Number((w >> BigInt(pos)) & mask(n));
  const nbitsOf = (parts) => { let s = 0; for (let k = 1; k < parts.length; k += 2) s += parts[k]; return s; };

  // parts = [lo, n, lo, n, ...], most significant part first (olympus/isa/encdb.py extract / place)
  function extract(w, parts) {
    let v = 0n;
    for (let k = 0; k < parts.length; k += 2) v = (v << BigInt(parts[k + 1])) | ((w >> BigInt(parts[k])) & mask(parts[k + 1]));
    return v;
  }
  function place(w, parts, value) {
    let rem = nbitsOf(parts);
    for (let k = 0; k < parts.length; k += 2) {
      const lo = BigInt(parts[k]), n = parts[k + 1];
      rem -= n;
      const sub = (value >> BigInt(rem)) & mask(n);
      w = (w & ~(mask(n) << lo)) | (sub << lo);
    }
    return w;
  }
  function fieldValue(w, parts, scale, signed) {
    let v = extract(w, parts);
    const nb = nbitsOf(parts);
    if (signed && ((v >> BigInt(nb - 1)) & 1n)) v -= 1n << BigInt(nb);
    return Number(v) * scale;
  }
  // encode._write_slot: one immediate field rewritten, every other bit copied
  function writeField(w, parts, scale, signed, value) {
    if (value % scale) throw new Error(`${value} is not a multiple of ${scale}`);
    let enc = BigInt(value / scale);
    const lim = 1n << BigInt(nbitsOf(parts));
    if (signed) {
      if (enc < -(lim >> 1n) || enc >= (lim >> 1n)) throw new Error('out of range');
      enc &= lim - 1n;
    } else if (enc < 0n || enc >= lim) throw new Error('out of range');
    return place(w, parts, enc);
  }

  // ===================================================================== the splice core (olympus/splice/islands.py)
  // islands: Map(original index -> inserted word count)
  function indexMap(islands) {
    const idx = Array.from(islands.keys()).filter((i) => islands.get(i) > 0).sort((a, b) => a - b);
    const cum = [0];
    idx.forEach((i) => cum.push(cum[cum.length - 1] + islands.get(i)));
    const count = (i, incl) => {
      let lo = 0, hi = idx.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (incl ? idx[m] <= i : idx[m] < i) lo = m + 1; else hi = m; }
      return cum[lo];
    };
    return {
      total: cum[cum.length - 1],
      tgt: (o) => { const i = Math.floor(o / 16); return 16 * (i + count(i, false)); },   // target_off: lands on the island
      pos: (o) => { const i = Math.floor(o / 16); return 16 * (i + count(i, true)); },    // instr_off: the instruction itself
      ni: (i) => i + count(i, true)
    };
  }

  function splice(K, islands) {
    const n = K.ins.length, m = indexMap(islands);
    const rows = K.ins.map((r, i) => {
      const w = word(r[0], r[1]);
      return { i, pc: 16 * i, npc: m.pos(16 * i), w, nw: w, mn: r[3], f: r[4], lit: r[5], kind: 'plain', ok: true };
    });
    rows.forEach((r) => {                                   // _return_literals + encode.set_slot
      if (!r.lit) return;
      const [, parts, scale, sg, ret] = r.lit;
      const want = m.tgt(ret);
      r.kind = 'literal';
      r.val = [ret, want];
      r.want = want;
      r.nw = writeField(r.w, parts, scale, sg, want);
    });
    rows.forEach((r) => {
      if (!r.f) return;
      const [kind, , parts, scale, sg] = r.f;
      const v = fieldValue(r.w, parts, scale, sg);
      if (kind === 'rel') {                                 // encode.retarget(d, target_off(target), pc=new_pos)
        const t = r.pc + 16 + v, want = m.tgt(t);
        const nv = want - (r.npc + 16);
        r.kind = 'branch';
        r.val = [v, nv];
        r.tgt = [t, r.npc + 16 + nv];
        r.want = want;
        r.nw = writeField(r.w, parts, scale, sg, nv);
      } else if (kind === 'anchor') {                       // encode.moved_anchor: next_pc + imm stays fixed
        const nv = v + r.pc - r.npc;
        r.kind = 'anchor';
        r.val = [v, nv];
        r.base = [r.pc + 16 + v, r.npc + 16 + nv];
        r.nw = writeField(r.w, parts, scale, sg, nv);
      }
    });
    rows.forEach((r) => { r.changed = r.nw !== r.w; });
    const nNew = Math.ceil((n + m.total) / 8) * 8;          // pad to 128 bytes with the filler
    const ibt = K.attrs.find((a) => a[0] === 'INDIRECT_BRANCH_TARGETS');
    const ibtSet = new Set(ibt ? ibt[1].slice(3, 3 + ibt[1][2]) : []);
    const oldParam = K.param, off = (oldParam + 7) & ~7, newParam = off + 8;
    let ordinal = 0;
    const attrs = K.attrs.map(([name, v]) => {              // eiattr.transform_attr + _append_param
      let nv = v;
      if (name === 'EXIT_INSTR_OFFSETS') nv = v.map(m.pos);
      else if (name === 'INDIRECT_BRANCH_TARGETS') nv = [m.pos(v[0]), v[1], v[2]].concat(v.slice(3, 3 + v[2]).map(m.tgt), v.slice(3 + v[2]));
      else if (name === 'CBANK_PARAM_SIZE') nv = newParam;
      else if (name === 'PARAM_CBANK') nv = [v[0], ((newParam << 16) | (v[1] & 0xFFFF)) >>> 0];
      else if (name === 'KPARAM_INFO') ordinal = Math.max(ordinal, (v[1] & 0xFFFF) + 1);
      return [name, v, nv];
    });
    const kparam = [0, ((off << 16) | ordinal) >>> 0, (((8 << 2) | 1) << 16 | 0xF000) >>> 0];
    const c2 = K.c2.map((v) => [v, ibtSet.has(v) ? m.tgt(v) : v]);     // the jump table: target map
    const oldEnd = n * 16;
    const syms = K.syms.map(([name, value, size]) => {
      if (name === K.kernel) return [name, value, size, value, nNew * 16];
      const nv = m.tgt(value), end = value + size;
      const ne = end >= oldEnd ? nNew * 16 : m.pos(end);
      return [name, value, size, nv, ne - nv];
    });
    const code = rows.filter((r) => r.i < K.code);
    // line tables: every row's address goes through the target map; islands take the line of the instruction they precede
    const lineRows = code.filter((r) => m.tgt(r.pc) !== r.pc).length;
    const stats = {
      unchanged: code.filter((r) => !r.changed).length, code: code.length,
      branch: code.filter((r) => r.kind === 'branch' && r.changed).length,
      anchor: code.filter((r) => r.kind === 'anchor' && r.changed).length,
      literal: code.filter((r) => r.kind === 'literal' && r.changed).length,
      lineRows
    };
    return { rows, m, nNew, attrs, kparam, param: [oldParam, off, newParam], c2, syms, stats };
  }

  const CORE = { word, lohi, extract, place, fieldValue, writeField, indexMap, splice, DATA };
  if (typeof module === 'object' && module.exports) { module.exports = CORE; return; }
  if (typeof document === 'undefined') return;

  // ===================================================================== page helpers (index.js)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hx = (v) => (v < 0 ? '-0x' + (-v).toString(16) : '0x' + v.toString(16));
  const pc4 = (v) => v.toString(16).padStart(4, '0');
  const pct = (x) => (100 * x).toFixed(2) + '%';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function S(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function flipCapture(rootEl) {
    const mp = new Map();
    $$('[data-flip]', rootEl).forEach((el) => mp.set(el.dataset.flip, el.getBoundingClientRect()));
    return mp;
  }
  function flipPlay(rootEl, before) {
    if (reduceMotion) return;
    $$('[data-flip]', rootEl).forEach((el) => {
      const a = before.get(el.dataset.flip), b = el.getBoundingClientRect();
      if (!a) { el.animate([{ opacity: 0, transform: 'scaleY(.4)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'ease-out' }); return; }
      const dy = a.top - b.top;
      if (Math.abs(dy) < 1) return;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.3,.7,.2,1)' });
    });
  }

  // ===================================================================== the splice animator
  const SET_NAMES = { 'trace-sche': 'trace-sche', 'trace-pp': 'trace-pp', 'trace-mem': 'trace-mem' };
  const KIND = {
    init: ['INIT', 'INIT'], site: ['RECORD', 'RECORD'], calib: ['EXIT calibration', 'EXIT 校准'],
    probe: ['probe', '探针'], filler: ['filler', '填充']
  };

  function initSplicer(host) {
    const kSel = $('#sp-kernel', host), pSel = $('#sp-preset', host);
    const list = $('.sp-list', host), side = $('.sp-side', host), status = $('.sp-status', host), readouts = $('.readouts', host);
    const playBtn = $('[data-act="play"]', host), resetBtn = $('[data-act="reset"]', host);
    let K, name = 't0_call', islands = new Map(), labels = new Map(), sel = null, run = 0, lastArcs = null;
    const ROW = 24, W = 76;

    function setKernel(nm) {
      name = nm; K = DATA.K[nm]; islands = new Map(); labels = new Map(); sel = null;
      pSel.value = 'trace-pp';
      applyPreset(false);
    }
    function presetIslands(p) {
      if (p === 'none' || p === 'custom') return [];
      return K.presets[p].map(([b, kind, n]) => [b, kind, n]);
    }
    function add(i, kind, n) {
      islands.set(i, (islands.get(i) || 0) + n);
      const l = labels.get(i) || [];
      l.push([kind, n]);
      labels.set(i, l);
    }
    function applyPreset(animate) {
      islands = new Map(); labels = new Map();
      presetIslands(pSel.value).forEach(([b, kind, n]) => add(b, kind, n));
      sel = defaultSel();
      render(animate, presetMsg());
    }
    function presetMsg() {
      const p = pSel.value;
      if (p === 'none') return bi('No islands: the text is byte-identical and only the parameter block grows. Click <b>+</b> in the gutter to insert an 8-word island before an instruction.', '没有 island：代码逐字节相同，只有参数块变大。点击左侧的 <b>+</b>，在某条指令前插入一个 8 字的 island。');
      if (p === 'custom') return '';
      const sites = K.sites[p].map(([i, l]) => `${l}@${pc4(16 * i)}`).join(', ');
      return bi(`The islands the search planner put into <code>${name}</code> for <code>${SET_NAMES[p]}</code>: one INIT at the entry, one RECORD per site (${esc(sites)}), one EXIT calibration before each exit.`, `搜索规划器为 <code>${name}</code> 的 <code>${SET_NAMES[p]}</code> 插入的 island：入口一个 INIT，每个站点一个 RECORD（${esc(sites)}），每个出口前一个 EXIT 校准。`);
    }
    function defaultSel() {
      const res = splice(K, islands);
      const r = res.rows.find((x) => x.i < K.code && x.changed);
      return r ? r.i : null;
    }

    function arcsFor(res, rowY) {
      // direct branches (and the CALL to the callee), BRX table entries, RET returns via the literal
      const arcs = [];
      const yOfNew = (npcByte) => {
        const hit = res.rows.find((r) => r.npc === npcByte);
        if (hit) return rowY.get('i' + hit.i);
        for (const [i] of islands) { const start = res.m.tgt(16 * i), end = res.m.pos(16 * i); if (npcByte >= start && npcByte < end) return rowY.get('isl' + i); }
        return null;
      };
      res.rows.forEach((r) => {
        if (r.i >= K.code) return;
        if (r.kind === 'branch' && r.tgt) arcs.push({ id: 'b' + r.i, y1: rowY.get('i' + r.i), y2: yOfNew(r.tgt[1]), kind: r.mn === 'CALL' ? 'call' : 'br' });
        if (r.kind === 'anchor' && r.mn === 'BRX') res.c2.forEach(([, nv], k) => arcs.push({ id: 'x' + k, y1: rowY.get('i' + r.i), y2: yOfNew(r.base[1] + nv), kind: 'brx' }));
        if (r.kind === 'anchor' && r.mn === 'RET') res.rows.filter((x) => x.kind === 'literal').forEach((l) => arcs.push({ id: 'r' + l.i, y1: rowY.get('i' + r.i), y2: yOfNew(r.base[1] + l.val[1]), kind: 'ret' }));
      });
      arcs.forEach((a) => { a.lo = Math.min(a.y1, a.y2 == null ? a.y1 : a.y2); a.hi = Math.max(a.y1, a.y2 == null ? a.y1 + 30 : a.y2); });
      arcs.sort((a, b) => (a.hi - a.lo) - (b.hi - b.lo));
      const lanes = [];
      arcs.forEach((a) => {
        let L = 0;
        while (lanes[L] && lanes[L].some((b) => !(a.hi < b.lo - 3 || a.lo > b.hi + 3))) L++;
        (lanes[L] = lanes[L] || []).push(a);
        a.lane = L;
      });
      return arcs;
    }
    function arcPath(a) {
      const x = W - 4, off = Math.min(W - 10, 10 + a.lane * 7), y1 = a.y1 + ROW / 2, y2 = (a.y2 == null ? a.y1 + ROW * 1.4 : a.y2) + ROW / 2;
      const r = Math.min(5, Math.abs(y2 - y1) / 2);
      const dir = y2 > y1 ? 1 : -1;
      return `M${x},${y1} H${x - off + r} Q${x - off},${y1} ${x - off},${y1 + dir * r} V${y2 - dir * r} Q${x - off},${y2} ${x - off + r},${y2} H${x - 2}`;
    }

    function render(animate, msg) {
      const before = animate ? flipCapture(list) : null;
      const res = splice(K, islands);
      const disp = [];
      res.rows.forEach((r) => { if (islands.get(r.i)) disp.push({ isl: r.i }); disp.push({ r }); });
      const rowY = new Map();
      disp.forEach((d, k) => rowY.set(d.isl != null ? 'isl' + d.isl : 'i' + d.r.i, k * ROW));
      const txt = (r) => {
        const s = esc(K.ins[r.i][2]);
        if (r.kind === 'branch' && r.changed) return s.replace(/0x[0-9a-f]+$/, `<span class="rel">${hx(r.tgt[1])}</span>`);
        if (r.kind === 'literal' && r.changed) return s.replace(/0x[0-9a-f]+$/, `<span class="rel">${hx(r.val[1])}</span>`);
        if (r.kind === 'anchor' && r.mn === 'BRX' && r.changed) return s.replace(/-?0x[0-9a-f]+$/, `<span class="rel">${hx(r.val[1])}</span>`);
        return s;
      };
      const chip = (r) => {
        if (r.i >= K.code) return '';
        if (!r.changed) return r.kind !== 'plain' ? `<span class="chip">${bi('same', '不变')}</span>` : '';
        return `<span class="chip rel">${bi(r.kind, { branch: '分支', anchor: '锚点', literal: '字面量' }[r.kind])}</span>`;
      };
      let h = `<div class="sp-rows" style="height:${disp.length * ROW}px"><svg class="sp-arcs" width="${W}" height="${disp.length * ROW}" aria-hidden="true"></svg>`;
      disp.forEach((d, k) => {
        const y = k * ROW;
        if (d.isl != null) {
          const l = labels.get(d.isl) || [['probe', islands.get(d.isl)]];
          h += `<div class="sp-row isl" data-flip="isl${d.isl}" style="top:${y}px"><button type="button" class="sp-x" data-rm="${d.isl}" aria-label="remove island">×</button><span class="pc">${pc4(res.m.tgt(16 * d.isl))}</span><span class="txt">island · ${l.map(([kind, n]) => `${bi(KIND[kind][0], KIND[kind][1])} ${n}`).join(' + ')} ${bi('words', '字')}</span></div>`;
          return;
        }
        const r = d.r, pad = r.i >= K.code;
        h += `<div class="sp-row${pad ? ' pad' : ''}${r.i === sel ? ' sel' : ''}${r.changed ? ' moved' : ''}" data-flip="i${r.i}" data-i="${r.i}" style="top:${y}px">` +
          `<button type="button" class="sp-add" data-add="${r.i}" aria-label="insert island before ${pc4(r.pc)}"${pad ? ' disabled' : ''}>+</button>` +
          `<span class="pc"><span class="old">${pc4(r.pc)}</span>${r.npc !== r.pc ? `<span class="arr">→</span>${pc4(r.npc)}` : ''}</span>` +
          `<span class="txt">${txt(r)}</span>${chip(r)}</div>`;
      });
      h += '</div>';
      list.innerHTML = h;
      if (animate) flipPlay(list, before);
      // arcs
      const svgA = $('.sp-arcs', list);
      const arcs = arcsFor(res, rowY);
      S('defs', null, svgA).innerHTML = '<marker id="sp-ah" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L6,3 L0,6 z" class="fill-ink"/></marker>';
      const prev = lastArcs;
      lastArcs = new Map();
      arcs.forEach((a) => {
        const p = S('path', { d: arcPath(a), class: `arc ${a.kind}`, 'marker-end': 'url(#sp-ah)' }, svgA);
        lastArcs.set(a.id, a);
        if (animate && prev && prev.get(a.id) && !reduceMotion) {
          const o = prev.get(a.id), t0 = performance.now();
          const tick = (now) => {
            const f = Math.min(1, (now - t0) / 480), e = 1 - Math.pow(1 - f, 3);
            p.setAttribute('d', arcPath({ ...a, y1: o.y1 + (a.y1 - o.y1) * e, y2: (o.y2 == null || a.y2 == null) ? a.y2 : o.y2 + (a.y2 - o.y2) * e }));
            if (f < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      });
      $$('[data-add]', list).forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation(); run++;
        const i = +b.dataset.add;
        add(i, 'probe', 8);
        pSel.value = 'custom';
        const rr = splice(K, islands);
        const moved = rr.rows.filter((x) => x.i < K.code && x.changed).length;
        const first = rr.rows.find((x) => x.i < K.code && x.changed);
        sel = first ? first.i : i;
        render(true, bi(`Inserted 8 words before <code>${pc4(16 * i)}</code>. A branch to <code>${pc4(16 * i)}</code> now lands on the island (target map); the instruction itself is at <code>${pc4(rr.m.pos(16 * i))}</code> (position map). ${moved} original word${moved === 1 ? '' : 's'} differ${moved === 1 ? 's' : ''}, each only in an offset field.`,
          `在 <code>${pc4(16 * i)}</code> 之前插入 8 个字。跳到 <code>${pc4(16 * i)}</code> 的分支现在落在 island 上（目标映射）；指令本身在 <code>${pc4(rr.m.pos(16 * i))}</code>（位置映射）。${moved} 个原始字有变化，每个都只改了偏移字段。`));
      }));
      $$('[data-rm]', list).forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation(); run++;
        islands.delete(+b.dataset.rm); labels.delete(+b.dataset.rm);
        pSel.value = 'custom';
        render(true, bi('Island removed; every offset follows back.', '已删除 island；每个偏移都跟着回去了。'));
      }));
      $$('.sp-row[data-i]', list).forEach((el) => el.addEventListener('click', () => { sel = +el.dataset.i; render(false); }));
      if (msg != null) status.innerHTML = msg || '&nbsp;';
      sidePanel(res);
      const s = res.stats;
      readouts.innerHTML = `
        <div class="readout"><span class="k">${bi('islands', 'island')}</span><span class="v">${islands.size} · ${res.m.total} ${bi('words', '字')}</span><span class="s">.text ${hx(K.ins.length * 16)} → ${hx(res.nNew * 16)} ${bi('bytes, padded to 128 with the filler', '字节，用填充字补齐到 128')}</span></div>
        <div class="readout key"><span class="k">${bi('originals copied through unchanged', '原样复制的原始指令')}</span><span class="v">${s.unchanged} / ${s.code}</span><span class="s">${pct(s.unchanged / s.code)} ${bi('preservation of the code (padding excluded)', '代码保留率（不含尾部填充）')}</span></div>
        <div class="readout"><span class="k">${bi('relocated, offset field only', '只改偏移字段的重定位')}</span><span class="v">${s.branch + s.anchor + s.literal}</span><span class="s">${bi(`branch ${s.branch} · anchor ${s.anchor} · return literal ${s.literal}`, `分支 ${s.branch} · 锚点 ${s.anchor} · 返回字面量 ${s.literal}`)}</span></div>
        <div class="readout key"><span class="k">${bi('changed basic blocks', '改变的基本块')}</span><span class="v">0</span><span class="s">${bi(`of ${K.blocks.length}: control bits, operands and successors are the compiler's`, `共 ${K.blocks.length} 个：控制位、操作数和后继都还是编译器的`)}</span></div>`;
    }

    function bitsDiff(w0, w1, parts) {
      const inF = new Set();
      if (parts) for (let k = 0; k < parts.length; k += 2) for (let b = parts[k]; b < parts[k] + parts[k + 1]; b++) inF.add(b);
      let h = '';
      for (let b = 127; b >= 0; b--) {
        const a = bits(w0, b, 1), c = bits(w1, b, 1);
        h += `<i class="${inF.has(b) ? 'f' : ''}${a !== c ? ' x' : ''}" title="bit ${b}"></i>`;
      }
      return h;
    }
    function sidePanel(res) {
      const r = sel != null ? res.rows[sel] : null;
      let h = '';
      if (r) {
        const [lo0, hi0] = lohi(r.w), [lo1, hi1] = lohi(r.nw);
        const parts = r.f ? r.f[2] : r.lit ? r.lit[1] : null;
        let expl = '';
        if (r.kind === 'branch') expl = bi(`A direct branch: the field holds target − (pc + 16). Target ${hx(r.tgt[0])} → ${hx(r.tgt[1])}, the first word of the island in front of the old target (<code>target_off</code>); field ${hx(r.val[0])} → ${hx(r.val[1])}.`,
          `直接分支：字段存的是 target − (pc + 16)。目标 ${hx(r.tgt[0])} → ${hx(r.tgt[1])}，即旧目标前 island 的第一个字（<code>target_off</code>）；字段 ${hx(r.val[0])} → ${hx(r.val[1])}。`);
        else if (r.kind === 'anchor') expl = bi(`An anchor form: it jumps to next_pc + register + imm. The instruction moved, so <code>moved_anchor</code> changes imm ${hx(r.val[0])} → ${hx(r.val[1])} and the base next_pc + imm stays ${hx(r.base[1])}. cuobjdump still prints the same text.`,
          `锚点形式：跳到 next_pc + 寄存器 + imm。指令移动了，所以 <code>moved_anchor</code> 把 imm 从 ${hx(r.val[0])} 改为 ${hx(r.val[1])}，基址 next_pc + imm 保持 ${hx(r.base[1])}。cuobjdump 打印的文本不变。`);
        else if (r.kind === 'literal') expl = bi(`The return address this MOV loads for the <code>CALL.REL.NOINC</code> at ${pc4(16 * r.lit[5])}: ${hx(r.val[0])} → ${hx(r.val[1])}, the island in front of the return point. It is data, not a branch, and a splicer that only retargets branches misses it.`,
          `这条 MOV 为 ${pc4(16 * r.lit[5])} 处的 <code>CALL.REL.NOINC</code> 装入的返回地址：${hx(r.val[0])} → ${hx(r.val[1])}，即返回点前的 island。它是数据而不是分支，只改分支的拼接器会漏掉它。`);
        else expl = bi('No offset field: copied through byte for byte, control bits included.', '没有偏移字段：逐字节原样复制，控制位也不变。');
        h += `<div class="sp-word"><div class="blk-h"><span>${pc4(r.pc)} ${esc(K.ins[r.i][3])}</span><span>${r.changed ? bi('word changed', '字已改变') : bi('word unchanged', '字未变')}</span></div>
          <code class="w">/* 0x${lo0} */ /* 0x${hi0} */</code>${r.changed ? `<code class="w new">/* 0x${lo1} */ /* 0x${hi1} */</code>` : ''}
          <div class="sp-bits" aria-hidden="true">${bitsDiff(r.w, r.nw, parts)}</div>
          <p class="s">${expl}</p></div>`;
      } else {
        h += `<div class="sp-word"><p class="s">${bi('Click an instruction to see its word before and after. The relocatable ones are BRA, BSSY, CALL, the MOV return literal, RET.REL and BRX.', '点击一条指令，查看它拼接前后的字。可重定位的有 BRA、BSSY、CALL、MOV 返回字面量、RET.REL 和 BRX。')}</p></div>`;
      }
      const fmt = (v) => (Array.isArray(v) ? v.map((x) => hx(x)).join(', ') : hx(v));
      const row = (k, a, b) => `<div class="r"><span class="k">${k}</span><span class="v">${a} <i class="arr">→</i> <b${a !== b ? ' class="ch"' : ''}>${b}</b></span></div>`;
      let m = '';
      res.attrs.forEach(([nm, a, b]) => {
        if (nm === 'EXIT_INSTR_OFFSETS') m += row('EXIT_INSTR_OFFSETS', fmt(a), fmt(b));
        if (nm === 'INDIRECT_BRANCH_TARGETS') {
          m += row(bi('IBT · the BRX', 'IBT · BRX 本身'), hx(a[0]), hx(b[0]));
          m += row(bi('IBT · its targets', 'IBT · 它的目标'), a.slice(3).map((x) => hx(x)).join(' '), b.slice(3).map((x) => hx(x)).join(' '));
        }
      });
      if (res.c2.length) m += row('c[0x2] ' + bi('jump table', '跳转表'), res.c2.map(([a]) => hx(a)).join(' '), res.c2.map(([, b]) => hx(b)).join(' '));
      const short = (nm) => { const z = /_Z(\d+)/.exec(nm); return z ? nm.substr(z.index + z[0].length, +z[1]) : nm; };
      res.syms.forEach(([nm, v0, s0, v1, s1]) => { m += row(bi('symbol ', '符号 ') + esc(short(nm)), `${hx(v0)} · ${hx(s0)} B`, `${hx(v1)} · ${hx(s1)} B`); });
      const [p0, off, p1] = res.param;
      m += row('CBANK_PARAM_SIZE', String(p0), String(p1));
      m += row('KPARAM_INFO', bi(`${res.kparam[1] & 0xFFFF} params`, `${res.kparam[1] & 0xFFFF} 个参数`), bi(`+ ordinal ${res.kparam[1] & 0xFFFF} at ${off}, 8 B`, `+ 序号 ${res.kparam[1] & 0xFFFF}，偏移 ${off}，8 B`));
      m += row('.nv.constant0 ' + bi('size', '大小'), hx(0x210 + p0), hx(0x210 + p1));
      const lr = res.stats.lineRows, codeN = res.stats.code;
      m += row('.debug_line ' + bi('rows', '行'), bi(`${codeN} rows`, `${codeN} 行`), bi(`${lr} addresses moved, 0 lines changed; islands take the line of the instruction they precede`, `${lr} 个地址移动，0 行的行号改变；island 取其前方指令的行号`));
      m += row('.debug_frame FDE', `0x0 + ${hx(K.ins.length * 16)}`, `0x0 + ${hx(res.nNew * 16)}`);
      h += `<div class="sp-meta"><div class="blk-h"><span>${bi('every offset-bearing record', '所有带偏移的记录')}</span><span>${bi('old → new', '旧 → 新')}</span></div><div class="sp-recs">${m}</div></div>`;
      side.innerHTML = h;
    }

    async function play() {
      const my = ++run;
      if (pSel.value === 'custom' || pSel.value === 'none') pSel.value = 'trace-pp';
      const seq = presetIslands(pSel.value);
      islands = new Map(); labels = new Map(); sel = null;
      render(false, presetMsg());
      for (const [b, kind, n] of seq) {
        await sleep(reduceMotion ? 120 : 800);
        if (my !== run) return;
        add(b, kind, n);
        sel = defaultSel();
        render(!reduceMotion, bi(`+ ${KIND[kind][0]} island, ${n} words, before <code>${pc4(16 * b)}</code>`, `+ ${KIND[kind][1]} island，${n} 个字，插在 <code>${pc4(16 * b)}</code> 之前`));
      }
      if (my === run) status.innerHTML = presetMsg();
    }

    kSel.addEventListener('change', () => { run++; setKernel(kSel.value); });
    pSel.addEventListener('change', () => { run++; if (pSel.value !== 'custom') applyPreset(true); });
    playBtn.addEventListener('click', play);
    resetBtn.addEventListener('click', () => { run++; pSel.value = 'none'; applyPreset(true); });
    document.addEventListener('click', (e) => { if (e.target.closest('[data-set-lang]')) setTimeout(() => render(false), 0); });
    setKernel('t0_call');
  }

  const sp = document.getElementById('splicer'); if (sp) initSplicer(sp);
})(typeof window !== 'undefined' ? window : globalThis);
