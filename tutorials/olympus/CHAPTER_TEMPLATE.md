# Olympus tutorial, second edition: the chapter template

This file is not linked from the site. Copy the skeleton below for chapters 03–09, fill the `NN`, titles, ids and
text, and keep the section order. Chapters 00, 01 and 02 (`index.html`, `reading.html`, `running.html`) are the
worked examples; `tutorial.css` carries every class used here. Add a chapter stylesheet (`<name>.css`, loaded after
`tutorial.css`) only for widget styles no other chapter needs.

## The ten chapters

| n | file | EN | 中文 | layer (ARCHITECTURE.md) |
|---|---|---|---|---|
| 00 | `./` (`index.html`) | The promise | 承诺 | the whole system |
| 01 | `binary.html` | The binary | 二进制 | `isa`, `cubin` |
| 02 | `liveness.html` | Knowing where it's safe | 知道哪里安全 | `cfg`, `liveness` |
| 03 | `hazards.html` | Not getting in the way | 不碍事 | `hazards` |
| 04 | `probes.html` | What a probe is | 探针是什么 | `probes`, `trace.record` |
| 05 | `planning.html` | Choosing registers and bits | 选择寄存器与控制位 | `planner` |
| 06 | `splicing.html` | Writing probes into the binary | 把探针写进二进制 | `splice` |
| 07 | `running.html` | Running a traced kernel | 运行被追踪的 kernel | `runtime` |
| 08 | `reading.html` | Reading a trace | 读一份追踪 | `trace`, `report`, `sites.hints` |
| 09 | `verifying.html` | How we know | 我们如何确信 | `verify`, `bench`, `env` |

The order is bottom-up (reviewer, 2026-10-01): each chapter's layer uses only layers the chapters **before** it have
already built, and is used by the chapters after it. So a chapter may rely on any term the earlier chapters defined,
and must not lean on one from a later chapter — if it needs to mention something ahead, it says what it is in a clause
there and points forward. The one exception is chapter 00, which previews the whole pipeline.

## Voice rules

1. **Open with the contract.** The first thing a reader sees after the masthead is the `.contract` block: what this
   layer promises the layer above it, in one or two sentences, in the words of `docs/ARCHITECTURE.md`'s table
   ("promises to the layers above"). Then say who relies on it.
2. **Name the invariant.** The `.invariant` callout names the one of the six invariants (ARCHITECTURE.md §Invariants)
   this layer protects, with its number, and says in one line how it is checked. A chapter whose layer protects none
   directly (01, 08) names the invariant it serves and says so.
3. **Code second.** The "How it works" section walks the mechanism with `a.src` pointers, one per paragraph, pinned to
   commit `21662efe19b4037c0802b1de116428c00ef2fa2f`:
   `https://github.com/Chtholly-Boss/Olympus/blob/21662efe19b4037c0802b1de116428c00ef2fa2f/<path>#L<a>-L<b>`
   (Markdown files take `?plain=1` before the `#`). Take the line numbers from `git show 21662ef:<path>` and check each
   range before publishing. The layout is the refactored one (`olympus/planner/`, `olympus/splice/ir.py`,
   `olympus/runtime/splicecheck.py`, ...); never link a path that existed only before DECISIONS 92.
4. **Paper third.** "Where it came from" says which section of the Xtrace paper the idea is from, as an `a.paper` link
   to the arXiv HTML anchor (`https://arxiv.org/html/2609.28769v1#S4.SS3`, shown as "paper §4.3"), paraphrased, no
   figures copied. Each place Olympus departs is a `.departure` note: what the paper does, what Olympus does, and the
   DECISIONS entry that holds the measurement.
5. **No milestone numbers or Olympian names in prose.** Write "the search planner", not "M6"; "the liveness
   analysis", not "Athena's analysis". Milestone names may appear only inside a quoted command or a path.
6. **A DECISIONS pointer only where it is the evidence for a rule.** Cite `DECISIONS 61` when the sentence states a
   rule that entry justifies; do not cite it as decoration or as a history reference.
7. **Numbers** come from `EVAL.md`, `journal/DECISIONS.md`, or data already embedded in a tutorial widget. An
   inference of ours is in an `aside.note.inferred` and says so.
8. **Short.** About one screen of prose per section, one widget per chapter, a code pointer per section. If a section
   needs more, it is two chapters' worth of material: say less.
9. **Bilingual everywhere.** Every `<p lang="en">` has a `<p lang="zh-CN">` twin right after it; inline twins are
   `<span lang="en">…</span><span lang="zh-CN">…</span>`; inside SVG text they are `<tspan lang>`; widgets build both
   with a `bi(en, zh)` helper. Natural technical Chinese: keep SASS mnemonics, register names, `kernel`, `warp`,
   `scoreboard`, `island`, `cubin` in English.

## Section order

```
masthead
§1 Contract          id="contract"   .contract block, then one or two paragraphs: who relies on it
§2 Invariant         id="invariant"  .invariant callout (number, claim, how it is checked), then one paragraph
§3 How it works      id="how"        the mechanism, with code (a.src), optional figure / table / pre.show
§4 Where it came from id="origin"    paper § (a.paper) and the .departure notes with DECISIONS pointers
§5 Try it            id="try"        the chapter's one widget, with a widget-foot that separates real from modelled
§6 Read next         id="next"       ol.chapters with the previous and the next chapter
```

## The skeleton

Replace `NN`, `FILE.html`, `FILE.js`, the titles and the descriptions. The rail is the same on every page except for
`aria-current="page"`. The crumbs end in the chapter number.

```html
<!doctype html>
<html lang="en" data-lang="en" data-title-en="TITLE · Olympus" data-title-zh="标题 · Olympus">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>TITLE · Olympus</title>
<meta name="description" content="One sentence: the contract this chapter teaches.">
<script>(function(){var r=document.documentElement,l,t;try{l=localStorage.getItem('tut-lang');t=localStorage.getItem('tut-theme')}catch(e){}if(l!=='en'&&l!=='zh')l=/^zh/i.test(navigator.language||'')?'zh':'en';r.dataset.lang=l;r.lang=l==='zh'?'zh-CN':'en';if(t==='light'||t==='dark')r.dataset.theme=t;})();</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=IBM+Plex+Mono:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700&family=Noto+Sans+SC:wght@500;700&family=Noto+Serif+SC:wght@400;600&display=swap">
<link rel="stylesheet" href="../../assets/site.css">
<link rel="stylesheet" href="../../assets/widgets.css">
<link rel="stylesheet" href="tutorial.css">
</head>
<body>

<header class="topbar">
  <div class="topbar-inner">
    <nav class="crumbs" aria-label="Breadcrumb">
      <a class="site-mark" href="../../">
        <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="5" width="4" height="6" fill="currentColor"/><rect x="11" y="5" width="4" height="6" fill="currentColor"/><line x1="5" y1="8" x2="11" y2="8" stroke="var(--nvl)" stroke-width="2"/></svg>
        chtholly-boss
      </a>
      <span class="sep">/</span>
      <a href="../"><span lang="en">tutorials</span><span lang="zh-CN">教程</span></a>
      <span class="sep">/</span>
      <a href="./">olympus</a>
      <span class="sep">/</span>
      <span class="here">NN</span>
    </nav>
    <div class="controls">
      <div class="seg" role="group" aria-label="Language">
        <button type="button" id="lang-en" data-set-lang="en" aria-pressed="true">EN</button>
        <button type="button" id="lang-zh" data-set-lang="zh" aria-pressed="false">中文</button>
      </div>
      <button type="button" id="theme-cycle" class="btn-plain" data-theme-cycle><span lang="en" data-l="en">Theme: auto</span><span lang="zh-CN" data-l="zh">主题：自动</span></button>
    </div>
  </div>
</header>

<div class="frame">

  <aside class="rail">
    <nav aria-label="Chapters">
      <div class="label"><span lang="en">Olympus · chapters</span><span lang="zh-CN">Olympus · 章节</span></div>
      <ol>
        <li class="chap"><a href="./"><span class="n">00</span><span><span lang="en">The promise</span><span lang="zh-CN">承诺</span></span></a></li>
        <li class="chap"><a href="reading.html"><span class="n">01</span><span><span lang="en">Reading a trace</span><span lang="zh-CN">读一份追踪</span></span></a></li>
        <li class="chap"><a href="running.html"><span class="n">02</span><span><span lang="en">Running a traced kernel</span><span lang="zh-CN">运行被追踪的 kernel</span></span></a></li>
        <li class="chap"><a href="splicing.html"><span class="n">03</span><span><span lang="en">Writing probes into the binary</span><span lang="zh-CN">把探针写进二进制</span></span></a></li>
        <li class="chap"><a href="planning.html"><span class="n">04</span><span><span lang="en">Choosing registers and bits</span><span lang="zh-CN">选择寄存器与控制位</span></span></a></li>
        <li class="chap"><a href="probes.html"><span class="n">05</span><span><span lang="en">What a probe is</span><span lang="zh-CN">探针是什么</span></span></a></li>
        <li class="chap"><a href="hazards.html"><span class="n">06</span><span><span lang="en">Not getting in the way</span><span lang="zh-CN">不碍事</span></span></a></li>
        <li class="chap"><a href="liveness.html"><span class="n">07</span><span><span lang="en">Knowing where it's safe</span><span lang="zh-CN">知道哪里安全</span></span></a></li>
        <li class="chap"><a href="binary.html"><span class="n">08</span><span><span lang="en">The binary</span><span lang="zh-CN">二进制</span></span></a></li>
        <li class="chap"><a href="verifying.html"><span class="n">09</span><span><span lang="en">How we know</span><span lang="zh-CN">我们如何确信</span></span></a></li>
      </ol>
    </nav>
    <nav class="toc" aria-label="On this page">
      <div class="label"><span lang="en">On this page</span><span lang="zh-CN">本页</span></div>
      <a href="#contract"><span class="sec">§1</span><span lang="en">Contract</span><span lang="zh-CN">契约</span></a>
      <a href="#invariant"><span class="sec">§2</span><span lang="en">Invariant</span><span lang="zh-CN">不变量</span></a>
      <a href="#how"><span class="sec">§3</span><span lang="en">How it works</span><span lang="zh-CN">如何工作</span></a>
      <a href="#origin"><span class="sec">§4</span><span lang="en">Where it came from</span><span lang="zh-CN">从何而来</span></a>
      <a href="#try"><span class="sec">§5</span><span lang="en">Try it</span><span lang="zh-CN">动手试试</span></a>
      <a href="#next"><span class="sec">§6</span><span lang="en">Read next</span><span lang="zh-CN">接着读</span></a>
    </nav>
  </aside>

  <main class="article" id="top">

    <header class="masthead">
      <div class="label"><span lang="en">Tutorial · Olympus · NN TITLE</span><span lang="zh-CN">教程 · Olympus · NN 标题</span></div>
      <h1><span lang="en">TITLE</span><span lang="zh-CN">标题</span></h1>
      <p class="deck" lang="en">Two or three sentences: what you get from this layer and why you can trust it.</p>
      <p class="deck" lang="zh-CN">两三句话：这一层给你什么，为什么可以信任它。</p>
      <dl class="spec">
        <div><dt><span lang="en">Layer</span><span lang="zh-CN">层</span></dt><dd>olympus/PACKAGE · <span lang="en">row R of ARCHITECTURE.md</span><span lang="zh-CN">ARCHITECTURE.md 第 R 行</span></dd></div>
        <div><dt><span lang="en">Source</span><span lang="zh-CN">源码</span></dt><dd><a href="https://github.com/Chtholly-Boss/Olympus/tree/21662efe19b4037c0802b1de116428c00ef2fa2f">Chtholly-Boss/Olympus</a> @ <a href="https://github.com/Chtholly-Boss/Olympus/commit/21662efe19b4037c0802b1de116428c00ef2fa2f">21662ef</a></dd></div>
        <div><dt><span lang="en">Paper</span><span lang="zh-CN">论文</span></dt><dd><a href="https://arxiv.org/abs/2609.28769">arXiv:2609.28769</a> · <a href="https://arxiv.org/html/2609.28769v1#S4.SS3">§4.3</a></dd></div>
        <div><dt><span lang="en">Hardware</span><span lang="zh-CN">硬件</span></dt><dd>H200 · sm_90a &nbsp;|&nbsp; GB300 · sm_103a</dd></div>
      </dl>
      <p lang="en">Every <a class="src" href="#top">file:line</a> link opens the Olympus source at the pinned commit; every <a class="paper" href="https://arxiv.org/html/2609.28769v1">paper §</a> link opens that section of the arXiv HTML. A rule's evidence is cited by its number in <code>journal/DECISIONS.md</code>.</p>
      <p lang="zh-CN">所有 <a class="src" href="#top">file:line</a> 链接都打开固定提交下的 Olympus 源码；所有 <a class="paper" href="https://arxiv.org/html/2609.28769v1">论文 §</a> 链接都打开 arXiv HTML 中对应的小节。规则的依据按 <code>journal/DECISIONS.md</code> 中的编号引用。</p>
    </header>

    <!-- §1 -->
    <section id="contract">
      <h2><span class="sec">§1</span><span lang="en">Contract</span><span lang="zh-CN">契约</span></h2>
      <div class="contract">
        <div class="label"><span lang="en">What this layer promises</span><span lang="zh-CN">这一层的承诺</span></div>
        <p lang="en">The promise, in one or two sentences, from ARCHITECTURE.md's table.</p>
        <p lang="zh-CN">用一两句话写出承诺，取自 ARCHITECTURE.md 的表格。</p>
        <div class="io"><b>olympus/PACKAGE</b> <span class="arr">→</span> <span lang="en">used by</span><span lang="zh-CN">使用者</span> <b>olympus/ABOVE</b></div>
      </div>
      <p lang="en">Who relies on it and what breaks without it.</p>
      <p lang="zh-CN">谁依赖它，没有它什么会出问题。</p>
    </section>

    <!-- §2 -->
    <section id="invariant">
      <h2><span class="sec">§2</span><span lang="en">Invariant</span><span lang="zh-CN">不变量</span></h2>
      <div class="invariant">
        <div class="badge"><span lang="en">Invariant</span><span lang="zh-CN">不变量</span><b>K</b></div>
        <p class="claim" lang="en">The invariant, as ARCHITECTURE.md states it.</p>
        <p class="claim" lang="zh-CN">不变量，按 ARCHITECTURE.md 的表述。</p>
        <p class="how" lang="en"><b>Checked by</b> which tool, on what, with the result.</p>
        <p class="how" lang="zh-CN"><b>检查方式</b>：哪个工具、在什么上检查、结果如何。</p>
      </div>
      <p lang="en">One paragraph: why this invariant and not a weaker one.</p>
      <p lang="zh-CN">一段话：为什么是这条不变量，而不是更弱的一条。</p>
    </section>

    <!-- §3 -->
    <section id="how">
      <h2><span class="sec">§3</span><span lang="en">How it works</span><span lang="zh-CN">如何工作</span></h2>
      <p lang="en">The mechanism, with a code pointer <a class="src" href="https://github.com/Chtholly-Boss/Olympus/blob/21662efe19b4037c0802b1de116428c00ef2fa2f/olympus/PACKAGE/MODULE.py#L1-L20">MODULE.py:1–20</a>.</p>
      <p lang="zh-CN">机制，附代码指针 <a class="src" href="https://github.com/Chtholly-Boss/Olympus/blob/21662efe19b4037c0802b1de116428c00ef2fa2f/olympus/PACKAGE/MODULE.py#L1-L20">MODULE.py:1–20</a>。</p>
      <!-- optional: <figure class="dg">, <div class="tbl wide">, <pre class="show"> -->
    </section>

    <!-- §4 -->
    <section id="origin">
      <h2><span class="sec">§4</span><span lang="en">Where it came from</span><span lang="zh-CN">从何而来</span></h2>
      <p lang="en">What the paper does here <a class="paper" href="https://arxiv.org/html/2609.28769v1#S4.SS3">paper §4.3</a>, paraphrased.</p>
      <p lang="zh-CN">论文在这里怎么做 <a class="paper" href="https://arxiv.org/html/2609.28769v1#S4.SS3">论文 §4.3</a>，用自己的话转述。</p>
      <aside class="departure">
        <div class="label"><span lang="en">Where Olympus departs</span><span lang="zh-CN">Olympus 的不同之处</span><span class="dec">DECISIONS NN</span></div>
        <p lang="en">What the paper does; what Olympus does instead; the measurement that decided it.</p>
        <p lang="zh-CN">论文怎么做；Olympus 改成怎么做；据以决定的测量。</p>
      </aside>
    </section>

    <!-- §5 -->
    <section id="try">
      <h2><span class="sec">§5</span><span lang="en">Try it</span><span lang="zh-CN">动手试试</span></h2>
      <p lang="en">What the widget shows and what to do with it.</p>
      <p lang="zh-CN">这个组件展示什么，怎么操作。</p>
      <div class="widget wide" id="WIDGET">
        <div class="widget-head">
          <div class="widget-title"><span class="label"><span lang="en">Kind</span><span lang="zh-CN">类型</span></span><span lang="en">Widget title</span><span lang="zh-CN">组件标题</span></div>
          <div class="btn-row"><!-- buttons --></div>
        </div>
        <div class="widget-body"><!-- controls, svg / table, readouts --></div>
        <div class="widget-foot">
          <p lang="en"><strong>Real:</strong> which data, from where. <strong>Modelled:</strong> what is simplified.</p>
          <p lang="zh-CN"><strong>真实部分：</strong>哪些数据、来自哪里。<strong>模型部分：</strong>哪些做了简化。</p>
        </div>
      </div>
    </section>

    <!-- §6 -->
    <section id="next">
      <h2><span class="sec">§6</span><span lang="en">Read next</span><span lang="zh-CN">接着读</span></h2>
      <ol class="chapters">
        <li>
          <span class="n">PP</span>
          <div>
            <h3><a href="PREV.html"><span lang="en">Previous title</span><span lang="zh-CN">上一章标题</span></a></h3>
            <p lang="en">One sentence: what the previous chapter's layer takes from this one.</p>
            <p lang="zh-CN">一句话：上一章的层从这一层得到什么。</p>
          </div>
          <span class="pill"><span lang="en">Previous</span><span lang="zh-CN">上一章</span></span>
        </li>
        <li>
          <span class="n">QQ</span>
          <div>
            <h3><a href="NEXT.html"><span lang="en">Next title</span><span lang="zh-CN">下一章标题</span></a></h3>
            <p lang="en">One sentence: what this layer takes from the next chapter's.</p>
            <p lang="zh-CN">一句话：这一层从下一章的层得到什么。</p>
          </div>
          <span class="pill live"><span lang="en">Next</span><span lang="zh-CN">下一章</span></span>
        </li>
      </ol>
    </section>

  </main>
</div>

<footer class="foot">
  <div class="inner">
    <span lang="en">Written from Chtholly-Boss/Olympus @ 21662ef. The design started from Xtrace (Huang et al., arXiv:2609.28769); every diagram here is drawn for this tutorial.</span>
    <span lang="zh-CN">基于 Chtholly-Boss/Olympus @ 21662ef 撰写。设计源自 Xtrace（Huang 等，arXiv:2609.28769）；本页所有图示均为本教程绘制。</span>
    <a href="../../">chtholly-boss.github.io</a>
  </div>
</footer>

<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="../../assets/site.js"></script>
<script src="FILE.js"></script>
</body>
</html>
```

## The widget script

`FILE.js` is one IIFE with `'use strict'`. Copy the helpers from `index.js` (`$`, `$$`, `bi`, `tbi`, `num`, `esc`,
`S`, `ST`, `showTip` / `hideTip`, `SHA`, `src`, `sec`) rather than sharing a module: the pages are static files.
Embed real data as a `const DATA = {...}` with a comment naming the run it came from (`/ws/runs/...`, commit). Every
string a widget renders goes through `bi(en, zh)` or `tbi`. Respect `prefers-reduced-motion`: a Play button jumps to
the final state. Pass `node --check FILE.js` before publishing.

## Checks before handing a chapter to Zeus

- `node --check FILE.js`.
- An `html.parser` pass: balanced tags; every `[lang="en"]` element has a `[lang="zh-CN"]` sibling.
- Every `a.src` range re-read with `git show 21662ef:<path> | sed -n 'a,bp'`.
- Screenshots at 1280 px in EN and 中文, light and dark, and at 400 px (headless Edge stops at about 500 px: load the
  page in a 400 px-wide `<iframe>` and screenshot that).
- At 400 px, an inline `<code>` wider than about 40 monospace characters forces horizontal overflow (site.css sets
  `:not(pre) > code { white-space: nowrap }`): split long formulas into token-wise `<code>`s or put them in a `pre`.
- Headless Edge caps one render at about 10,400 px of height; to screenshot a widget far down a long page at 400 px,
  hide the earlier sections in the harness page rather than scrolling.
- Headless Edge follows the OS colour scheme, so "auto" may render dark; set `localStorage['tut-theme']` explicitly
  for the light and dark shots.
- Nothing in `assets/*` edited; no commit (Zeus commits the edition).
