// Mini-SGLang ch02 widgets: radix lab (RadixPrefixCache + CacheManager), page-table views,
// and the cache_req region explorer. Models follow radix_cache.py and scheduler/cache.py.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const bi = (en, zh) => `<span lang="en">${en}</span><span lang="zh-CN">${zh}</span>`;
  const alignDown = (a, b) => Math.floor(a / b) * b;
  const divCeil = (a, b) => Math.ceil(a / b);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function S(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  // =====================================================================
  // 1. Radix lab
  // =====================================================================
  function makeSystem(ps, poolTokens, maxRunning, outputLen) {
    let uid = 0, tic = 0;
    const keyOf = (toks) => (ps === 1 ? (toks.length ? toks[0] : '∅') : (toks.length >= ps ? toks.slice(0, ps).join('|') : '#' + toks.join('|')));
    const newNode = (key, val, parent, ref, ts) => ({ id: ++uid, key, val, parent, children: new Map(), ref, ts });
    const root = newNode([], [], null, 1, 0);
    const st = {
      ps, poolTokens, root, evictable: 0, protected: 0,
      free: Array.from({ length: poolTokens / ps }, (_, i) => i * ps),
      tableFree: Array.from({ length: maxRunning }, (_, i) => i),
      running: [], reqUid: 0, outputLen
    };

    const commonLen = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

    function splitAt(node, pos) {
      const nn = newNode(node.key.slice(0, pos), node.val.slice(0, pos), node.parent, node.ref, node.ts);
      node.parent.children.set(keyOf(nn.key), nn);
      node.key = node.key.slice(pos); node.val = node.val.slice(pos);
      node.parent = nn; nn.children.set(keyOf(node.key), node);
      return nn;
    }

    function walk(tokens) {
      tic++;
      let prefix = 0, node = root, split = null;
      const path = [];
      while (prefix < tokens.length) {
        const child = node.children.get(keyOf(tokens.slice(prefix)));
        if (!child) break;
        node = child;
        let ml = alignDown(commonLen(node.key, tokens.slice(prefix)), ps);
        prefix += ml;
        if (ml !== node.key.length) {
          node = splitAt(node, ml);
          node.ts = tic; split = node; path.push(node);
          break;
        }
        node.ts = tic; path.push(node);
      }
      return { node, prefix, path, split };
    }

    function insert(tokens, vals) {
      const L = alignDown(tokens.length, ps);
      const w = walk(tokens.slice(0, L));
      let node = w.node, created = null;
      if (w.prefix !== L) {
        created = newNode(tokens.slice(w.prefix, L), vals.slice(w.prefix, L), node, 0, ++tic);
        node.children.set(keyOf(created.key), created);
        st.evictable += created.key.length;
        node = created;
      }
      return { cachedLen: w.prefix, handle: { node, cachedLen: L }, walk: w, created };
    }

    function lock(h) {
      for (let n = h.node; n.parent; n = n.parent) {
        if (n.ref === 0) { st.evictable -= n.key.length; st.protected += n.key.length; }
        n.ref++;
      }
    }
    function unlock(h) {
      for (let n = h.node; n.parent; n = n.parent) {
        n.ref--;
        if (n.ref === 0) { st.evictable += n.key.length; st.protected -= n.key.length; }
      }
    }
    function matched(h) {
      const parts = [];
      for (let n = h.node; n.parent; n = n.parent) parts.unshift(n.val);
      return parts.flat();
    }
    function collectLeaves() {
      const out = [], stack = [root];
      while (stack.length) {
        const n = stack.pop();
        if (n.children.size === 0) { if (n.ref === 0) out.push(n); }
        else n.children.forEach((c) => stack.push(c));
      }
      return out;
    }
    function evict(size) {
      if (size === 0) return { indices: [], nodes: [] };
      if (size > st.evictable) throw new Error('evict beyond evictable');
      const leaves = collectLeaves();
      const indices = [], nodes = [];
      let got = 0;
      while (got < size) {
        let bi_ = 0;
        for (let i = 1; i < leaves.length; i++) if (leaves[i].ts < leaves[bi_].ts) bi_ = i;
        const n = leaves.splice(bi_, 1)[0];
        got += n.key.length; indices.push(...n.val); nodes.push(n.key.join(''));
        st.evictable -= n.key.length;
        const p = n.parent;
        p.children.delete(keyOf(n.key));
        if (p.children.size === 0 && p.ref === 0) leaves.push(p);
      }
      return { indices, nodes };
    }

    const available = () => st.evictable + st.free.length * ps;
    function allocatePages(n) {
      let ev = null;
      if (n > st.free.length) {
        ev = evict((n - st.free.length) * ps);
        st.free = st.free.concat(ev.indices.filter((_, i) => i % ps === 0));
      }
      const pages = st.free.slice(0, n);
      st.free = st.free.slice(n);
      return { pages, ev };
    }
    const pageToToken = (pages) => pages.flatMap((p) => Array.from({ length: ps }, (_, i) => p + i));
    function freeIdx(idx) { if (idx.length) st.free = st.free.concat(idx.filter((_, i) => i % ps === 0)); }

    function allocatePaged(reqs) {
      const info = [];
      let need = 0;
      reqs.forEach((r) => {
        const first = divCeil(r.cachedLen, ps), last = divCeil(r.deviceLen, ps);
        if (last > first) { need += last - first; info.push([r, first, last]); }
      });
      if (!need) return { tokens: [], ev: null };
      const { pages, ev } = allocatePages(need);
      const toks = pageToToken(pages);
      let off = 0;
      info.forEach(([r, first, last]) => {
        for (let pos = first * ps; pos < last * ps; pos++) r.row[pos] = toks[off++];
      });
      return { tokens: toks, ev };
    }

    function cacheReq(r, finished) {
      const ids = r.tokens.slice(0, r.cachedLen), idx = r.row.slice(0, r.cachedLen);
      const old = r.handle;
      const ins = insert(ids, idx);
      unlock(old);
      const dup = idx.slice(old.cachedLen, ins.cachedLen);
      freeIdx(dup);
      let tail = [];
      if (finished) { tail = idx.slice(ins.handle.cachedLen); freeIdx(tail); }
      else { r.handle = ins.handle; lock(ins.handle); }
      return { ins, dup, tail };
    }

    const inflight = () => st.running.reduce((s, r) => s + (r.maxDeviceLen - r.deviceLen), 0) + (ps - 1) * st.running.length;

    return { st, walk, insert, lock, unlock, matched, allocatePaged, cacheReq, available, inflight, keyOf };
  }

  function initLab(host) {
    const POOL = 24, MAXRUN = 4, OUT = 2;
    const treeBox = $('.rx-tree', host), poolBox = $('.rx-pool', host), reqBox = $('.rx-reqs', host);
    const statusEl = $('.rx-status', host), logEl = $('.rx-log', host), readouts = $('.readouts', host);
    const psSel = $('#rx-ps', host), input = $('#rx-prompt', host);
    let sys, frames = [], playing = null, lastHit = null, busy = false;
    const logLines = [];

    const genTokens = (prompt) => {
      const s = prompt.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      return [String.fromCharCode(97 + (s * 7) % 26), String.fromCharCode(97 + (s * 13 + 5) % 26)];
    };

    // ---------- snapshots ----------
    function snap(hl, logHTML) {
      const { st } = sys;
      const tree = (function cp(n) {
        return { id: n.id, key: n.key.slice(), val: n.val.slice(), ref: n.ref, ts: n.ts, root: !n.parent,
          children: [...n.children.values()].sort((a, b) => (a.key.join('') < b.key.join('') ? -1 : 1)).map(cp) };
      })(st.root);
      const owner = Array(POOL).fill(null);
      (function mark(n) {
        if (n.parent) n.val.forEach((s, i) => { owner[s] = { kind: n.ref > 0 ? 'prot' : 'evict', tok: n.key[i] }; });
        n.children.forEach(mark);
      })(st.root);
      const freeSet = new Set(st.free.flatMap((p) => Array.from({ length: st.ps }, (_, i) => p + i)));
      const stale = new Set();
      st.running.forEach((r) => {
        r.row.forEach((s, pos) => {
          if (s == null) return;
          if (freeSet.has(s)) { stale.add(s); return; }
          if (!owner[s]) owner[s] = { kind: 'priv', tok: pos < r.tokens.length && pos < r.written ? r.tokens[pos] : '·', table: r.table };
        });
      });
      for (let s = 0; s < POOL; s++) if (!owner[s]) owner[s] = { kind: 'free', tok: '' };
      const reqs = st.running.map((r) => ({ uid: r.uid, table: r.table, tokens: r.tokens.slice(), P: r.P, hit: r.hit, cachedLen: r.cachedLen, row: r.row.slice(), written: r.written }));
      return {
        tree, owner, stale, reqs, hl: hl || {}, log: logHTML,
        ro: { free: st.free.length * st.ps, evictable: st.evictable, protected: st.protected, available: sys.available() }
      };
    }
    function frame(hl, en, zh) { frames.push(snap(hl, bi(en, zh))); }

    // ---------- rendering ----------
    function renderTree(t, hl) {
      treeBox.innerHTML = '';
      const W = (n) => Math.max(48, 16 + 7.4 * labelOf(n).length, 16 + 6.2 * (n.root ? 5 : `ref ${n.ref} · t${n.ts}`.length));
      const GAP = 10, LV = 64, H = 38;
      const lay = (n) => {
        n._bw = W(n);
        if (!n.children.length) { n._w = n._bw; return n._w; }
        const cw = n.children.reduce((s, c) => s + lay(c), 0) + GAP * (n.children.length - 1);
        n._cw = cw; n._w = Math.max(n._bw, cw); return n._w;
      };
      const place = (n, x0, d) => {
        n._x = x0 + n._w / 2; n._y = 6 + d * LV;
        let x = x0 + (n._w - (n._cw || 0)) / 2;
        n.children.forEach((c) => { place(c, x, d + 1); x += c._w + GAP; });
      };
      let depth = 0;
      (function dd(n, d) { depth = Math.max(depth, d); n.children.forEach((c) => dd(c, d + 1)); })(t, 0);
      lay(t); place(t, 8, 0);
      const width = Math.max(t._w + 16, 300), height = depth * LV + H + 14;
      const svg = S('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': 'Radix tree of cached token prefixes' }, treeBox);
      (function edges(n) {
        n.children.forEach((c) => {
          S('path', { class: 'edge', d: `M${n._x},${n._y + H} C${n._x},${n._y + H + 14} ${c._x},${c._y - 14} ${c._x},${c._y}` }, svg);
          edges(c);
        });
      })(t);
      (function nodes(n) {
        let cls = 'nd' + (n.root ? ' root' : n.ref > 0 ? ' prot' : '');
        if (hl.path && hl.path.has(n.id)) cls += ' hit';
        if (hl.fresh && hl.fresh.has(n.id)) cls += ' fresh';
        if (hl.cut && hl.cut.has(n.id)) cls += ' cut';
        const g = S('g', null, svg);
        S('title', null, g, n.root ? 'root (ref_count 1, never evicted)' : `key ${n.key.join('')} · slots [${n.val.join(', ')}] · ref_count ${n.ref} · timestamp ${n.ts}`);
        S('rect', { class: cls, x: n._x - n._bw / 2, y: n._y, width: n._bw, height: H, rx: 4 }, g);
        S('text', { x: n._x, y: n._y + 16, 'text-anchor': 'middle' }, g, labelOf(n));
        S('text', { class: 'sm', x: n._x, y: n._y + 30, 'text-anchor': 'middle' }, g, n.root ? 'ref 1' : `ref ${n.ref} · t${n.ts}`);
        n.children.forEach(nodes);
      })(t);
    }
    function labelOf(n) {
      if (n.root) return 'root';
      const ps = sys.st.ps;
      if (ps === 1) return n.key.join('');
      const parts = [];
      for (let i = 0; i < n.key.length; i += ps) parts.push(n.key.slice(i, i + ps).join(''));
      return parts.join('·');
    }

    function renderPool(f) {
      const ps = sys.st.ps;
      poolBox.className = 'rx-pool' + (ps === 2 ? ' ps2' : '');
      poolBox.innerHTML = '';
      const hs = f.hl.slots || new Set(), hg = f.hl.gone || new Set();
      const cell = (s) => {
        const o = f.owner[s];
        const d = document.createElement('div');
        d.className = 'rx-slot ' + (o.kind === 'free' ? '' : o.kind) + (o.kind === 'priv' ? ' r' + o.table : '') +
          (f.stale.has(s) ? ' stale' : '') + (!reduceMotion && hs.has(s) ? ' flash' : '') + (!reduceMotion && hg.has(s) ? ' gone' : '');
        d.innerHTML = `${o.tok || '&nbsp;'}<small>${s}</small>`;
        d.title = `slot ${s}: ${o.kind}${f.stale.has(s) ? ' (still referenced by a running request\'s page-table row)' : ''}`;
        return d;
      };
      if (ps === 1) for (let s = 0; s < POOL; s++) poolBox.appendChild(cell(s));
      else for (let p = 0; p < POOL; p += ps) {
        const pg = document.createElement('div'); pg.className = 'rx-page';
        for (let i = 0; i < ps; i++) pg.appendChild(cell(p + i));
        poolBox.appendChild(pg);
      }
    }

    function renderReqs(f) {
      if (!f.reqs.length) { reqBox.innerHTML = `<div class="rx-empty">${bi('No running requests. Admit one above.', '没有运行中的请求，请在上方提交一个。')}</div>`; return; }
      reqBox.innerHTML = f.reqs.map((r) => {
        const toks = r.tokens.map((t, i) => `<span class="tok r${r.table}${i < r.hit ? ' cached' : ''}${i >= r.P ? ' gen' : ''}">${t}</span>`).join('');
        const row = r.row.map((s, i) => (i < r.written ? `<b>${s}</b>` : s == null ? '·' : s)).join(' ');
        return `<div class="rx-req">
          <div class="rx-req-h"><b>req ${r.uid} · table ${r.table}</b><button type="button" class="btn ghost" data-finish="${r.uid}">${bi('Finish', '结束')}</button></div>
          <div class="rx-toks">${toks}</div>
          <div class="rx-row">${bi('prefix hit', '前缀命中')} <b>${r.hit}</b>/${r.P} · cached_len <b>${r.cachedLen}</b></div>
          <div class="rx-row">page_table[${r.table}] = ${row}</div>
        </div>`;
      }).join('');
    }

    function renderRO(f) {
      const hit = lastHit;
      readouts.innerHTML = `
        <div class="readout"><span class="k">${bi('Free slots', '空闲槽')}</span><span class="v">${f.ro.free}</span><span class="s">free_slots × page_size</span></div>
        <div class="readout"><span class="k">evictable_size</span><span class="v">${f.ro.evictable}</span><span class="s">${bi('cached, ref_count 0', '已缓存，ref_count 为 0')}</span></div>
        <div class="readout"><span class="k">protected_size</span><span class="v">${f.ro.protected}</span><span class="s">${bi('cached, locked by a request', '已缓存，被请求锁定')}</span></div>
        <div class="readout key"><span class="k">available_size</span><span class="v">${f.ro.available}</span><span class="s">${bi('evictable + free', 'evictable + 空闲')}</span></div>
        <div class="readout key"><span class="k">${bi('Last prefill', '上次 prefill')}</span><span class="v">${hit ? `${hit.extend} / ${hit.P}` : '—'}</span><span class="s">${hit ? bi(`tokens computed; ${hit.hit} reused from the tree`, `个 token 被计算；${hit.hit} 个复用自树`) : bi('tokens computed / prompt', '计算的 token / prompt')}</span></div>`;
    }

    function show(f) {
      renderTree(f.tree, f.hl);
      renderPool(f);
      renderReqs(f);
      renderRO(f);
      statusEl.innerHTML = f.log;
    }

    async function play() {
      busy = true; setButtons();
      const my = playing = Symbol();
      for (let i = 0; i < frames.length; i++) {
        if (playing !== my) return;
        show(frames[i]);
        logLines.push(frames[i].log);
        if (logLines.length > 40) logLines.shift();
        logEl.innerHTML = logLines.map((l, j) => `<li class="${j === logLines.length - 1 ? 'now' : ''}">${l}</li>`).join('');
        logEl.scrollTop = logEl.scrollHeight;
        if (!reduceMotion && i < frames.length - 1) await sleep(700);
      }
      frames = [];
      busy = false; setButtons();
    }
    function setButtons() { $$('.rx-chip, #rx-admit, [data-finish], #rx-finish-all', host).forEach((b) => { b.disabled = busy; }); }

    // ---------- operations (mirror PrefillAdder + Scheduler + CacheManager) ----------
    function admit(prompts) {
      const { st } = sys;
      const batch = [];
      let reserved = sys.inflight();
      for (const text of prompts) {
        const prompt = text.split('');
        const P = prompt.length;
        if (!st.tableFree.length) { frame({}, `No free page-table row (max ${MAXRUN} running). "${text}" stays pending.`, `没有空闲的 page-table 行（最多 ${MAXRUN} 个运行中请求），"${text}" 继续等待。`); continue; }
        const w = sys.walk(prompt.slice(0, P - 1));
        const handle = { node: w.node, cachedLen: w.prefix };
        const extend = P - w.prefix, est = extend + OUT;
        frame({ path: new Set(w.path.map((n) => n.id)), cut: w.split ? new Set([w.split.id]) : undefined },
          `match_req("${text.slice(0, P - 1)}"): walked ${w.path.length} node(s), cached_len = ${w.prefix}${w.split ? '. The last node was split at the match point.' : '.'} Only input[:len-1] is matched, so at least one token is always prefilled.`,
          `match_req("${text.slice(0, P - 1)}")：走过 ${w.path.length} 个节点，cached_len = ${w.prefix}${w.split ? '；最后一个节点在匹配处被 split。' : '。'}只匹配 input[:len-1]，因此至少有一个 token 需要 prefill。`);
        if (est + reserved > sys.available()) {
          frame({}, `Admission check fails: ${extend} new + ${OUT} output + ${reserved} reserved > available ${sys.available()}. "${text}" waits.`, `准入检查失败：${extend} 个新 token + ${OUT} 个输出 + ${reserved} 个预留 > 可用 ${sys.available()}，"${text}" 等待。`);
          continue;
        }
        sys.lock(handle);
        const path = []; for (let n = handle.node; n.parent; n = n.parent) path.push(n.id);
        frame({ path: new Set(path) }, `lock(handle): ref_count++ from the matched node up to the root; those tokens move from evictable to protected.`, `lock(handle)：从匹配节点到根逐个 ref_count++，这些 token 从 evictable 转为 protected。`);
        const table = st.tableFree.pop();
        const r = { uid: ++st.reqUid, table, P, tokens: prompt.slice(), outputs: genTokens(text), handle, hit: w.prefix, cachedLen: w.prefix, deviceLen: P, maxDeviceLen: P + OUT, row: [], written: w.prefix };
        sys.matched(handle).forEach((s, i) => { r.row[i] = s; });
        reserved += extend + OUT;
        batch.push(r);
        st.running.push(r);
      }
      if (!batch.length) return;
      // _prepare_batch -> allocate_paged
      const a = sys.allocatePaged(batch);
      frame({ slots: new Set(a.tokens), gone: a.ev ? new Set(a.ev.indices) : undefined },
        `allocate_paged: ${a.tokens.length / sys.st.ps} page(s) for positions [cached_len, device_len)${a.ev ? `, evicting LRU leaf ${a.ev.nodes.map((k) => `"${k}"`).join(', ')} first` : ''}. The page table now holds a slot for every position.`,
        `allocate_paged：为位置 [cached_len, device_len) 分配 ${a.tokens.length / sys.st.ps} 个 page${a.ev ? `，先驱逐 LRU 叶子 ${a.ev.nodes.map((k) => `"${k}"`).join('、')}` : ''}。page table 中每个位置都有了槽位。`);
      // forward: store_kv writes K/V for [cached_len, device_len)
      const wrote = [];
      batch.forEach((r) => { for (let p = r.cachedLen; p < r.deviceLen; p++) wrote.push(r.row[p]); r.written = r.deviceLen; });
      batch.forEach((r) => { r.tokens.push(r.outputs[0]); r.cachedLen = r.deviceLen; r.deviceLen += 1; });
      frame({ slots: new Set(wrote) },
        `Prefill forward: store_kv writes K and V for ${wrote.length} position(s) into those slots, then the first output token is sampled (dashed chip).`,
        `Prefill 前向：store_kv 把 ${wrote.length} 个位置的 K、V 写入这些槽位，随后采样出第一个输出 token（虚线框）。`);
      batch.forEach((r) => {
        const res = sys.cacheReq(r, false);
        const fresh = res.ins.created ? new Set([res.ins.created.id]) : undefined;
        const dupNote = res.dup.length ? ` Positions [${r.hit}, ${res.ins.cachedLen}) were already inserted by another request in this batch, so slots ${res.dup.join(', ')} go back to the free list, while this request's page-table row still points at them (outlined).` : '';
        const dupNoteZh = res.dup.length ? ` 位置 [${r.hit}, ${res.ins.cachedLen}) 已被同一 batch 中另一个请求插入，因此槽位 ${res.dup.join('、')} 被放回空闲列表，而本请求的 page-table 行仍指向它们（描边标出）。` : '';
        frame({ fresh, gone: res.dup.length ? new Set(res.dup) : undefined },
          `cache_req(req ${r.uid}, finished=False): insert the prompt${res.ins.created ? ` as new node "${res.ins.created.key.join('')}"` : ' (already fully cached)'}; unlock the old handle, lock the new one.${dupNote}`,
          `cache_req(req ${r.uid}, finished=False)：插入 prompt${res.ins.created ? `，生成新节点 "${res.ins.created.key.join('')}"` : '（已全部在缓存中）'}；解锁旧 handle，锁定新 handle。${dupNoteZh}`);
        lastHit = { hit: r.hit, P: r.P, extend: r.P - r.hit };
      });
    }

    function finish(uid) {
      const { st } = sys;
      const r = st.running.find((x) => x.uid === uid);
      if (!r) return;
      const a = sys.allocatePaged([r]);
      const pos = r.cachedLen;
      r.written = r.deviceLen;
      frame({ slots: new Set([r.row[pos]]), gone: a.ev ? new Set(a.ev.indices) : undefined },
        `Decode step: ${a.tokens.length ? `allocate one page, then ` : 'the current page still has room, so '}store_kv writes K/V of "${r.tokens[pos]}" at position ${pos} (slot ${r.row[pos]}). The second output token is sampled and the request reaches max_tokens.`,
        `Decode 一步：${a.tokens.length ? '先分配一个 page，' : '当前 page 仍有空位，'}store_kv 把 "${r.tokens[pos]}" 的 K/V 写到位置 ${pos}（槽位 ${r.row[pos]}）。采样出第二个输出 token，请求达到 max_tokens。`);
      r.tokens.push(r.outputs[1]); r.cachedLen = r.deviceLen; r.deviceLen += 1;
      const res = sys.cacheReq(r, true);
      st.running = st.running.filter((x) => x !== r);
      st.tableFree.push(r.table);
      const freed = res.dup.concat(res.tail);
      frame({ fresh: res.ins.created ? new Set([res.ins.created.id]) : undefined, gone: freed.length ? new Set(freed) : undefined },
        `cache_req(req ${r.uid}, finished=True): insert prompt + first output (${r.cachedLen} tokens, aligned down to ${alignDown(r.cachedLen, st.ps)})${res.ins.created ? ` as "${res.ins.created.key.join('')}"` : ''}, unlock, free ${res.tail.length ? `the unaligned tail (slot ${res.tail.join(', ')})` : 'nothing extra'}, and return page-table row ${r.table}. The last sampled token never got a KV slot.`,
        `cache_req(req ${r.uid}, finished=True)：插入 prompt 与第一个输出（${r.cachedLen} 个 token，向下对齐到 ${alignDown(r.cachedLen, st.ps)}）${res.ins.created ? `，形成 "${res.ins.created.key.join('')}"` : ''}，解锁，${res.tail.length ? `释放未对齐的尾部（槽位 ${res.tail.join('、')}）` : '无需额外释放'}，并归还 page-table 行 ${r.table}。最后采样的 token 从未获得 KV 槽位。`);
    }

    function reset(runOpening) {
      playing = null; frames = []; logLines.length = 0; lastHit = null; busy = false;
      sys = makeSystem(+psSel.value, POOL, MAXRUN, OUT);
      if (runOpening) {
        admit(['ABCDE']); finish(1); admit(['ABCFG']);
        const f = frames[frames.length - 1];
        frames = [];
        logLines.push(bi('Opening state: "ABCDE" ran to completion, then "ABCFG" was admitted and is still running. It reused the shared prefix "ABC" (with page_size 2, only the aligned "AB").',
                         '初始状态："ABCDE" 已运行完成，随后提交的 "ABCFG" 仍在运行，它复用了共享前缀 "ABC"（page_size 为 2 时只复用对齐的 "AB"）。'));
        logEl.innerHTML = logLines.map((l) => `<li class="now">${l}</li>`).join('');
        f.hl = {}; f.log = logLines[0];
        show(f);
      } else {
        const f = snap({}, bi('Empty cache. Admit a request.', '缓存为空，请提交一个请求。'));
        show(f); logEl.innerHTML = '';
      }
      setButtons();
    }

    host.addEventListener('click', (e) => {
      if (busy) return;
      const chip = e.target.closest('[data-prompt]');
      const fin = e.target.closest('[data-finish]');
      if (chip) {
        let ps = chip.dataset.prompt;
        if (ps === 'followup') {
          ps = 'ABCDE' + genTokens('ABCDE').join('') + 'H';
        }
        admit(ps.split(','));
        play();
      } else if (fin) { finish(+fin.dataset.finish); play(); }
      else if (e.target.closest('#rx-admit')) {
        const t = (input.value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 12);
        if (t.length < 2) { statusEl.innerHTML = bi('Type at least two letters (A–Z); each letter is one token.', '请至少输入两个字母（A–Z），每个字母是一个 token。'); return; }
        admit([t]); play();
      } else if (e.target.closest('#rx-finish-all')) {
        sys.st.running.slice().forEach((r) => finish(r.uid)); play();
      } else if (e.target.closest('#rx-reset')) reset(false);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#rx-admit', host).click(); } });
    psSel.addEventListener('change', () => reset(true));
    reset(true);
  }

  // =====================================================================
  // 2. Page-table views
  // =====================================================================
  function initPT(host) {
    const psSel = $('#pt-ps', host), nIn = $('#pt-n', host), nOut = $('#pt-n-out', host), cIn = $('#pt-c', host), cOut = $('#pt-c-out', host);
    const rows = $('.pt-rows', host), pool = $('.pt-pool', host);
    const POOL = 32;
    // A free list after some churn: page starts in the order the allocator would hand them out
    const orders = {
      1: [9, 3, 14, 27, 5, 20, 11, 30, 2, 17, 24, 8, 13, 29, 0, 22, 6, 19, 26, 12, 4, 31, 15, 25, 1, 18, 7, 23, 10, 28, 16, 21],
      2: [5, 12, 1, 9, 14, 3, 7, 11, 0, 15, 6, 10, 2, 13, 4, 8],
      4: [5, 2, 7, 0, 3, 6, 1, 4]
    };
    const prefixPages = { 1: [21, 16, 28, 10, 23, 7, 18, 1], 2: [8, 4, 13, 2], 4: [4, 1] };

    function update() {
      const ps = +psSel.value;
      const N = +nIn.value;
      const maxC = alignDown(N - 1, ps);
      cIn.step = ps; cIn.max = 8;
      let C = Math.min(alignDown(+cIn.value, ps), maxC, 8);
      nOut.textContent = N; cOut.textContent = C;
      // cached prefix comes from the tree's pages; the rest is allocated from the free list front
      const cachedSlots = prefixPages[ps].flatMap((p) => Array.from({ length: ps }, (_, i) => p * ps + i)).slice(0, C);
      const needPages = divCeil(N, ps) - divCeil(C, ps);
      const freshSlots = orders[ps].slice(0, needPages).flatMap((p) => Array.from({ length: ps }, (_, i) => p * ps + i));
      const row = cachedSlots.concat(freshSlots);
      const cell = (v, cls, sub) => `<span class="pt-cell ${cls}">${v}${sub != null ? `<sub>${sub}</sub>` : ''}</span>`;
      const rowCells = row.map((s, pos) => cell(s, pos < C ? 'cached' : pos < N ? 'fresh' : 'spare', pos)).join('');
      const fa = []; for (let pos = 0; pos < row.length; pos += ps) fa.push(Math.floor(row[pos] / ps));
      const faCells = fa.map((p, i) => cell(p, (i + 1) * ps <= C ? 'cached page' : 'fresh page', null)).join('');
      const fiCells = row.slice(0, N).map((s, pos) => cell(s, pos < C ? 'cached' : 'fresh', null)).join('');
      const outCells = row.slice(C, N).map((s, i) => cell(s, 'fresh', C + i)).join('');
      rows.innerHTML = `
        <div class="pt-row"><span>page_table row</span><div class="pt-cells">${rowCells}</div></div>
        <div class="pt-row"><span>out_loc (${bi('prefill writes', 'prefill 写入')})</span><div class="pt-cells">${outCells || '<span class="pt-cell spare">—</span>'}</div></div>
        <div class="pt-row"><span>FA / TRT-LLM ${bi('pages', 'page')}</span><div class="pt-cells">${faCells}</div></div>
        <div class="pt-row"><span>FlashInfer ${bi('indices', '索引')}</span><div class="pt-cells">${fiCells}</div></div>`;
      const pos = new Map(row.map((s, p) => [s, p]));
      pool.innerHTML = Array.from({ length: POOL }, (_, s) => {
        const p = pos.get(s);
        const cls = p == null ? '' : p < C ? 'cached' : p < N ? 'fresh' : 'spare';
        return `<div class="pt-slot ${cls}${ps > 1 && s % ps === 0 && s > 0 ? ' pagestart' : ''}" title="slot ${s}${p != null ? ' · position ' + p : ''}">${p != null && p < N ? p : ''}</div>`;
      }).join('');
    }
    [psSel, nIn, cIn].forEach((el) => el.addEventListener('input', update));
    update();
  }

  // =====================================================================
  // 3. cache_req region explorer
  // =====================================================================
  function initCR(host) {
    const psSel = $('#cr-ps', host), nIn = $('#cr-n', host), mIn = $('#cr-m', host), dIn = $('#cr-d', host), fin = $('#cr-fin', host);
    const bar = $('.cr-bar', host), axis = $('.cr-axis', host), tbody = $('tbody', host);
    const outs = { n: $('#cr-n-out', host), m: $('#cr-m-out', host), d: $('#cr-d-out', host) };
    function update() {
      const ps = +psSel.value, N = +nIn.value, L = alignDown(N, ps);
      mIn.step = ps; dIn.step = ps; mIn.max = L; dIn.max = L;
      let m = Math.min(alignDown(+mIn.value, ps), L);
      let d = Math.min(Math.max(alignDown(+dIn.value, ps), m), L);
      mIn.value = m; dIn.value = d;
      outs.n.textContent = N; outs.m.textContent = m; outs.d.textContent = d;
      const finished = fin.checked;
      const segs = [
        { cls: 'tree', a: 0, b: m, en: 'in tree at admission', zh: '准入时已在树中' },
        { cls: 'dup', a: m, b: d, en: 'freed: duplicate', zh: '释放：重复' },
        { cls: 'ins', a: d, b: L, en: 'inserted', zh: '新插入' },
        { cls: finished ? 'tailf' : 'tailk', a: L, b: N, en: finished ? 'freed: tail' : 'kept: tail', zh: finished ? '释放：尾部' : '保留：尾部' }
      ];
      bar.innerHTML = segs.map((s) => `<div class="cr-seg ${s.cls}" style="flex-grow:${s.b - s.a};${s.b === s.a ? 'display:none' : ''}" title="[${s.a}, ${s.b})">${s.b - s.a >= 3 ? bi(s.en, s.zh) : ''}</div>`).join('');
      axis.innerHTML = `<span>0</span><span>req.cached_len = ${N}</span>`;
      const rowsData = [
        ['tree', `[0, ${m})`, bi('Matched at admission and locked. Stays in the tree; the request\'s row already points at the tree\'s slots.', '准入时匹配并锁定，留在树中；请求的行本就指向树的槽位。')],
        ['dup', `[${m}, ${d})`, bi('Inserted meanwhile by another request, so <code>insert_prefix</code> reports it as already cached. This request\'s own slots are freed.', '期间被另一个请求插入，<code>insert_prefix</code> 报告其已在缓存中；本请求自己的槽位被释放。')],
        ['ins', `[${d}, ${L})`, bi('New node in the tree. The request\'s slots become the tree\'s slots.', '成为树中的新节点，请求的槽位转归树所有。')],
        [finished ? 'tailf' : 'tailk', `[${L}, ${N})`, finished ? bi('Shorter than a page, so it can\'t be inserted. Freed because the request finished.', '不足一个 page，无法插入；请求已结束，因此释放。') : bi('Shorter than a page. Kept as the request\'s private tail; the next <code>cache_req</code> handles it.', '不足一个 page，作为请求的私有尾部保留，由下一次 <code>cache_req</code> 处理。')]
      ];
      tbody.innerHTML = rowsData.map(([c, r, t]) => `<tr><td class="mono"><span class="cr-swatch cr-seg ${c}"></span>${r}</td><td>${t}</td></tr>`).join('');
    }
    [psSel, nIn, mIn, dIn, fin].forEach((el) => el.addEventListener('input', update));
    update();
  }

  const lab = document.getElementById('rxlab'); if (lab) initLab(lab);
  const pt = document.getElementById('ptview'); if (pt) initPT(pt);
  const cr = document.getElementById('crreg'); if (cr) initCR(cr);
})();
