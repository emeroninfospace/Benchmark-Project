/*
 * Benchmark dashboards: Accounting, Sales and Project.
 *
 * Rendered inside Custom HTML Blocks (which live in a shadow root), so this file
 * ships its own CSS and draws its own SVG charts. Colours follow the desk theme
 * (Frappe's CSS variables pierce the shadow boundary; the chart palette is
 * switched on the html[data-theme] attribute).
 *
 * Usage from a Custom HTML Block script:
 *     benchmark_dashboards.mount(root_element, "accounting" | "sales" | "projects");
 */
(function () {
	"use strict";
	if (window.benchmark_dashboards) return;

	const API = "benchmark_project.api.dashboard.";
	const LIVE_INTERVAL = 5 * 60 * 1000;
	const t = (s) => (typeof window.__ === "function" ? window.__(s) : s);
	const reducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	/* ------------------------------------------------------------------ */
	/* Styles                                                              */
	/* ------------------------------------------------------------------ */

	const STYLES = `
:host { display:block; }
.bmd {
	--surface: var(--card-bg, #ffffff);
	--ink: var(--heading-color, var(--text-color, #191919));
	--ink-2: var(--text-muted, #666666);
	--ink-3: var(--text-light, #8a8a8a);
	--line: var(--border-color, #ececec);
	--grid: #ececec;
	--axis: #c2c2c2;
	--hover: var(--subtle-fg, #f3f3f3);
	--s1:#257de0; --s2:#f47230; --s3:#00b894; --s4:#f2a600; --s5:#ee7fac; --s6:#008a17; --s7:#6a4ce2; --s8:#ec4647;
	--s1-track:#dbeafc;
	--ramp-1:#84b9f3; --ramp-2:#519ced; --ramp-3:#257de0; --ramp-4:#1b64be; --ramp-5:#0f4a96;
	--good:#0aac23; --warning:#fbb315; --serious:#f18a59; --critical:#dc3c3d; --neutral:#a3a3a3;
	--good-ink:#006c10; --bad-ink:#c4302f; --warn-ink:#9a6700;
	--hero-a:#2563eb; --hero-b:#6a4ce2; --hero-c:#0ea5e9;
	--shadow: 0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06);
	--shadow-lg: 0 12px 32px -12px rgba(16,24,40,.22);
	--radius: 14px;
	--ease: cubic-bezier(.2,.8,.2,1);
	position: relative;
	color: var(--ink);
	font: inherit;
	font-size: 13px;
	line-height: 1.45;
	container-type: inline-size;
	-webkit-font-smoothing: antialiased;
}
.bmd[data-theme="dark"] {
	--grid:#2c2c2c; --axis:#474747;
	--s1:#338ced; --s2:#e76624; --s3:#00a888; --s4:#d28e05; --s5:#e24d8b; --s6:#0aac23; --s7:#9887ef; --s8:#eb6263;
	--s1-track:#16304f;
	--ramp-1:#1757ac; --ramp-2:#1b64be; --ramp-3:#2370cd; --ramp-4:#338ced; --ramp-5:#6aabf1;
	--good-ink:#53c556; --bad-ink:#f07373; --warn-ink:#f2c14e;
	--hero-a:#1d4ed8; --hero-b:#5b3fd6; --hero-c:#0369a1;
	--shadow: 0 1px 2px rgba(0,0,0,.3);
	--shadow-lg: 0 12px 32px -12px rgba(0,0,0,.6);
}
.bmd *, .bmd *::before, .bmd *::after { box-sizing: border-box; }
.bmd button, .bmd input { font: inherit; color: inherit; }

/* ---------- header & filters ---------- */
.bmd-head { display:flex; align-items:center; justify-content:space-between; gap:12px 16px; flex-wrap:wrap; margin: 4px 0 14px; position:relative; z-index:5; }
.bmd-title { display:flex; align-items:center; gap:12px; min-width:0; }
.bmd-badge { width:42px; height:42px; border-radius:12px; display:grid; place-items:center; color:#fff; background: linear-gradient(135deg, var(--hero-a), var(--hero-b)); box-shadow: var(--shadow-lg); flex:none; animation: bmd-pop .6s var(--ease) both; }
.bmd-badge svg { width:21px; height:21px; }
.bmd h2 { font-size:20px; font-weight:650; margin:0; letter-spacing:-.01em; color: var(--ink); }
.bmd-sub { color: var(--ink-2); font-size:12.5px; margin-top:2px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.bmd-filters { display:flex; align-items:center; gap:8px; flex-wrap:wrap; max-width:100%; min-width:0; }
.bmd-select { appearance:none; -webkit-appearance:none; background: var(--surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23888' stroke-width='1.6' stroke-linecap='round' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5 6 7.5 9 4.5'/%3E%3C/svg%3E") no-repeat right 10px center; border:1px solid var(--line); border-radius:9px; height:34px; padding:0 30px 0 12px; color: var(--ink); font-size:12.5px; cursor:pointer; max-width: 220px; }
.bmd-btn { height:34px; border-radius:9px; border:1px solid var(--line); background: var(--surface); display:inline-flex; align-items:center; gap:7px; padding:0 12px; cursor:pointer; color: var(--ink); font-size:12.5px; white-space:nowrap; transition: border-color .15s, background .15s, transform .1s; }
.bmd-btn:hover { border-color: color-mix(in srgb, var(--s1) 40%, var(--line)); }
.bmd-btn:active { transform: scale(.97); }
.bmd-btn svg { width:15px; height:15px; color: var(--ink-2); flex:none; }
.bmd-btn[disabled] { opacity:.4; cursor:default; transform:none; }
.bmd-btn.icon { width:34px; padding:0; justify-content:center; }
.bmd-btn.date { font-weight:600; }
.bmd-btn.date .lbl { max-width: 210px; overflow:hidden; text-overflow:ellipsis; }
.bmd-btn.date .caret svg { width:12px; height:12px; }
.bmd-group { display:inline-flex; }
.bmd-group .bmd-btn { border-radius:0; margin-left:-1px; }
.bmd-group .bmd-btn:first-child { border-radius:9px 0 0 9px; margin-left:0; }
.bmd-group .bmd-btn:last-child { border-radius:0 9px 9px 0; }
.bmd-live-dot { width:8px; height:8px; border-radius:999px; background: var(--neutral); flex:none; position:relative; }
.bmd-btn.live-on { border-color: color-mix(in srgb, var(--good) 50%, var(--line)); }
.bmd-btn.live-on .bmd-live-dot { background: var(--good); }
.bmd-btn.live-on .bmd-live-dot::after { content:""; position:absolute; inset:-4px; border-radius:999px; border:2px solid var(--good); animation: bmd-ping 1.6s ease-out infinite; }
@keyframes bmd-ping { from { transform: scale(.4); opacity:.9; } to { transform: scale(1.6); opacity:0; } }
.bmd.is-loading [data-refresh] svg { animation: bmd-spin .9s linear infinite; }
@keyframes bmd-spin { to { transform: rotate(360deg); } }
.bmd-progress { position:absolute; left:0; right:0; top:-6px; height:2px; overflow:hidden; border-radius:2px; opacity:0; transition: opacity .2s; }
.bmd.is-loading .bmd-progress { opacity:1; }
.bmd-progress::before { content:""; position:absolute; inset:0; width:40%; background: linear-gradient(90deg, transparent, var(--s1), var(--s7), transparent); animation: bmd-slide 1.1s ease-in-out infinite; }
@keyframes bmd-slide { from { transform: translateX(-100%); } to { transform: translateX(260%); } }

/* date popover */
.bmd-datewrap { position:static; }
.bmd-filters { position:relative; }
.bmd-pop { position:absolute; right:0; top: calc(100% + 8px); z-index:30; background: var(--surface); border:1px solid var(--line); border-radius:14px; box-shadow: 0 18px 48px -12px rgba(0,0,0,.28); padding:12px; display:grid; grid-template-columns: minmax(230px,1fr) minmax(250px,1fr) 200px; gap:4px 14px; width: 720px; max-width: calc(100cqw - 8px); transform-origin: top right; animation: bmd-pop-in .18s var(--ease); }
.bmd-pop[hidden] { display:none; }
@keyframes bmd-pop-in { from { opacity:0; transform: translateY(-6px) scale(.98); } }
.bmd-pop h4 { margin:4px 8px 4px; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color: var(--ink-3); font-weight:600; }
.bmd-pop .col { display:flex; flex-direction:column; gap:2px; }
.bmd-preset { text-align:left; border:0; background:transparent; border-radius:8px; padding:7px 10px; cursor:pointer; font-size:12.5px; display:flex; justify-content:space-between; gap:8px; color: var(--ink); }
.bmd-preset[hidden] { display:none; }
.bmd-preset:hover { background: var(--hover); }
.bmd-preset[aria-pressed="true"] { background: color-mix(in srgb, var(--s1) 12%, transparent); color: var(--s1); font-weight:600; }
.bmd-preset span { white-space:nowrap; }
.bmd-preset small { color: var(--ink-3); font-weight:400; white-space:nowrap; font-size:11px; }
.bmd-custom { border-left:1px solid var(--line); padding-left:14px; display:flex; flex-direction:column; gap:8px; }
.bmd-custom label { font-size:11.5px; color: var(--ink-2); display:flex; flex-direction:column; gap:4px; }
.bmd-custom input { height:34px; border:1px solid var(--line); border-radius:8px; padding:0 10px; background: var(--surface); color: var(--ink); color-scheme: light dark; }
.bmd-apply { margin-top:auto; height:34px; border:0; border-radius:9px; background: linear-gradient(135deg, var(--hero-a), var(--hero-b)); color:#fff !important; font-weight:600; cursor:pointer; }
.bmd-apply:hover { filter: brightness(1.08); }
@container (max-width: 640px) { .bmd-pop { grid-template-columns: 1fr; width: calc(100cqw - 8px); right:auto; left:0; max-height: 70vh; overflow:auto; } .bmd-custom { border-left:0; border-top:1px solid var(--line); padding:10px 0 0; } }

/* highlights */
.bmd-insights { display:flex; gap:10px; overflow-x:auto; scrollbar-width:none; margin: 0 0 16px; padding:2px; }
.bmd-insight { flex: 1 0 auto; max-width: 360px; display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:12px; background: var(--surface); border:1px solid var(--line); box-shadow: var(--shadow); font-size:12.5px; white-space:nowrap; animation: bmd-in .5s var(--ease) both; animation-delay: calc(var(--i, 0) * 70ms + 120ms); transition: transform .2s var(--ease), border-color .2s; }
.bmd-insight[data-route] { cursor:pointer; }
.bmd-insight[data-route]:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--s1) 40%, var(--line)); }
.bmd-insight .ic { width:26px; height:26px; border-radius:8px; display:grid; place-items:center; flex:none; }
.bmd-insight .ic svg { width:14px; height:14px; }
.bmd-insight b { font-weight:650; }
.bmd-insight > span:last-child { overflow:hidden; text-overflow:ellipsis; }
.tone-good .ic { color: var(--good-ink); background: color-mix(in srgb, var(--good) 14%, transparent); }
.tone-warning .ic { color: var(--warn-ink); background: color-mix(in srgb, var(--warning) 20%, transparent); }
.tone-critical .ic { color: var(--bad-ink); background: color-mix(in srgb, var(--critical) 14%, transparent); }
.tone-info .ic { color: var(--s1); background: color-mix(in srgb, var(--s1) 13%, transparent); }

/* ---------- grid ---------- */
.bmd-grid { display:grid; grid-template-columns: repeat(12, minmax(0,1fr)); gap:16px; }
.bmd-grid.enter > * { animation: bmd-in .55s var(--ease) both; animation-delay: calc(var(--i, 0) * 55ms); }
.bmd-grid.swap > * { animation: bmd-fade .35s ease both; }
@keyframes bmd-in { from { opacity:0; transform: translateY(14px) scale(.985); } }
@keyframes bmd-fade { from { opacity:.25; } }
@keyframes bmd-pop { from { opacity:0; transform: scale(.6) rotate(-8deg); } }
.c3{grid-column:span 3}.c4{grid-column:span 4}.c5{grid-column:span 5}.c6{grid-column:span 6}.c7{grid-column:span 7}.c8{grid-column:span 8}.c12{grid-column:span 12}
@container (max-width: 1080px) { .c3,.c4,.c5{grid-column:span 6} .c7,.c8{grid-column:span 12} }
@container (max-width: 720px) { .c3,.c4,.c5,.c6,.c7,.c8{grid-column:span 12} .bmd-tiles{grid-template-columns: repeat(2, minmax(0,1fr)) !important;} .bmd-tile-spark { display:none; } }

/* ---------- cards ---------- */
.bmd-card { background: var(--surface); border:1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding:16px 18px; min-width:0; display:flex; flex-direction:column; transition: box-shadow .25s, border-color .25s; }
.bmd-card:hover { box-shadow: var(--shadow-lg); }
.bmd-card-h { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
.bmd-card-t { font-size:13.5px; font-weight:600; color: var(--ink); margin:0; }
.bmd-card-s { font-size:12px; color: var(--ink-2); margin-top:1px; }
.bmd-card-a { display:flex; gap:6px; align-items:center; flex:none; flex-wrap:wrap; justify-content:flex-end; }
.bmd-link { font-size:12px; color: var(--ink-2); cursor:pointer; background:none; border:0; padding:3px 6px; border-radius:6px; }
.bmd-link:hover { color: var(--s1); background: var(--hover); }
.bmd-toggle { width:28px; height:28px; border-radius:7px; border:1px solid var(--line); background:transparent; display:grid; place-items:center; color: var(--ink-2); cursor:pointer; }
.bmd-toggle:hover, .bmd-toggle[aria-pressed="true"] { color: var(--ink); background: var(--hover); }
.bmd-toggle svg { width:14px; height:14px; }
.bmd-mini-seg { display:inline-flex; border:1px solid var(--line); border-radius:8px; padding:2px; gap:2px; }
.bmd-mini-seg button { border:0; background:transparent; border-radius:6px; height:22px; padding:0 8px; font-size:11.5px; color: var(--ink-2); cursor:pointer; }
.bmd-mini-seg button:hover { color: var(--ink); }
.bmd-mini-seg button[aria-pressed="true"] { background: var(--hover); color: var(--ink); font-weight:600; }
.bmd-body { flex:1; min-width:0; position:relative; }

/* ---------- hero ---------- */
.bmd-hero { position:relative; overflow:hidden; border:0; color:#fff; justify-content:space-between;
	background: linear-gradient(125deg, var(--hero-a), var(--hero-b) 55%, var(--hero-c)); background-size: 220% 220%; animation: bmd-hue 14s ease-in-out infinite alternate;
	--ink:#fff; --ink-2: rgba(255,255,255,.82); --ink-3: rgba(255,255,255,.6); --hover: rgba(255,255,255,.16); --line: rgba(255,255,255,.22); --s1-track: rgba(255,255,255,.22); --surface: transparent; }
.bmd-grid.enter > .bmd-hero { animation: bmd-in .55s var(--ease) both, bmd-hue 14s ease-in-out infinite alternate; }
@keyframes bmd-hue { from { background-position: 0% 30%; } to { background-position: 100% 70%; } }
.bmd-hero .bmd-body::before, .bmd-hero .bmd-body::after { content:""; position:absolute; border-radius:999px; pointer-events:none; background: radial-gradient(closest-side, rgba(255,255,255,.26), transparent); z-index:0; }
.bmd-hero .bmd-body::before { width:260px; height:260px; right:-110px; top:-120px; animation: bmd-float 9s ease-in-out infinite alternate; }
.bmd-hero .bmd-body::after { width:180px; height:180px; left:-80px; bottom:-100px; animation: bmd-float 11s ease-in-out infinite alternate-reverse; }
@keyframes bmd-float { to { transform: translate(-30px, 24px) scale(1.15); } }
.bmd-hero .bmd-body { display:flex; flex-direction:column; }
.bmd-hero .bmd-body > * { position:relative; z-index:1; }
.bmd-hero-label { font-size:12.5px; color: var(--ink-2); font-weight:500; display:flex; align-items:center; gap:7px; }
.bmd-hero-label svg { width:15px; height:15px; flex:none; }
.bmd-hero-value { font-size:44px; font-weight:700; letter-spacing:-.025em; line-height:1.08; margin:8px 0 8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#fff; }
@container (min-width: 1081px) { .bmd-hero-value { font-size:50px; } }
.bmd-hero-meta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:12px; color: var(--ink-2); }
.bmd-hero-meta b { color:#fff; }
.bmd-hero .bmd-delta { background: rgba(255,255,255,.2) !important; color:#fff !important; }
.bmd-hero .bmd-meter-fill { background:#fff !important; }
.bmd-hero .bmd-meter-top b { color:#fff; }
.bmd-hero-foot { display:flex; align-items:flex-end; justify-content:space-between; gap:14px; margin-top:auto; padding-top:14px; }
.bmd-hero-spark { height:58px; flex:1; min-width:0; }
.bmd-hero .bmd-ring .trk { stroke: rgba(255,255,255,.22); }

/* ---------- tiles ---------- */
.bmd-tiles { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:16px; }
.bmd-tile { padding:14px 16px; position:relative; overflow:hidden; cursor:default; transition: transform .2s var(--ease), border-color .2s, box-shadow .25s; }
.bmd-grid.enter .bmd-tile { animation: bmd-in .55s var(--ease) both; animation-delay: calc(var(--i, 0) * 55ms + 80ms); }
.bmd-tile[data-route] { cursor:pointer; }
.bmd-tile[data-route]:hover { border-color: color-mix(in srgb, var(--accent, var(--s1)) 45%, var(--line)); transform: translateY(-2px); }
.bmd-tile::before { content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background: var(--accent, var(--s1)); opacity:.85; }
.bmd-tile-label { font-size:12px; color: var(--ink-2); display:flex; align-items:center; gap:8px; }
.bmd-tile-ic { width:26px; height:26px; border-radius:8px; display:grid; place-items:center; background: color-mix(in srgb, var(--accent, var(--s1)) 14%, transparent); color: var(--accent, var(--s1)); flex:none; }
.bmd-tile-ic svg { width:14px; height:14px; }
.bmd-tile-row { display:flex; align-items:flex-end; justify-content:space-between; gap:8px; margin-top:8px; }
.bmd-tile-value { font-size:23px; font-weight:700; letter-spacing:-.015em; color: var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.bmd-tile-spark { width:76px; height:28px; flex:none; }
.bmd-tile-foot { font-size:11.5px; color: var(--ink-2); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:5px; }
.bmd-delta { display:inline-flex; align-items:center; gap:2px; font-weight:600; font-size:11.5px; padding:1px 7px; border-radius:999px; background: var(--hover); white-space:nowrap; }
.bmd-delta svg { width:11px; height:11px; }
.bmd-delta.good { color: var(--good-ink); background: color-mix(in srgb, var(--good) 13%, transparent); }
.bmd-delta.bad { color: var(--bad-ink); background: color-mix(in srgb, var(--critical) 12%, transparent); }
.bmd-delta.flat { color: var(--ink-2); }

/* ---------- legend ---------- */
.bmd-legend { display:flex; flex-wrap:wrap; gap:6px 14px; font-size:12px; color: var(--ink-2); margin-bottom:8px; }
.bmd-legend span { display:inline-flex; align-items:center; gap:6px; }
.bmd-key { width:10px; height:10px; border-radius:3px; flex:none; display:inline-block; }
.bmd-key.line { height:3px; border-radius:2px; width:14px; }
.bmd-key.dash { height:0; width:14px; border-top:2px dashed var(--ink-3); border-radius:0; background:none !important; }

/* ---------- svg charts ---------- */
.bmd svg text { font-family: inherit; }
.bmd-axis text { fill: var(--ink-2); font-size:11px; font-variant-numeric: tabular-nums; }
.bmd-gridline { stroke: var(--grid); stroke-width:1; shape-rendering: crispEdges; }
.bmd-baseline { stroke: var(--axis); stroke-width:1; shape-rendering: crispEdges; }
.bmd-hit { fill: transparent; cursor: crosshair; }
.bmd-chart.pickable .bmd-hit { cursor: pointer; }
.bmd-col { transition: opacity .15s; }
.bmd-chart.is-hover .bmd-col:not(.on) { opacity:.32; }
.bmd-guide { stroke: var(--axis); stroke-width:1; opacity:0; pointer-events:none; }
.bmd-guide.on { opacity:1; }
.bmd-dot { opacity:0; transition: opacity .12s; pointer-events:none; }
.bmd-dot.on, .bmd-dot.end { opacity:1; }
.bmd-rise { transform-box: fill-box; transform-origin: 50% 100%; animation: bmd-rise .75s var(--ease) both; animation-delay: var(--d, 0ms); }
.bmd-rise.down { transform-origin: 50% 0%; }
@keyframes bmd-rise { from { transform: scaleY(0); } }
.bmd-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: bmd-draw 1.2s var(--ease) forwards; animation-delay: var(--d, 0ms); }
@keyframes bmd-draw { to { stroke-dashoffset: 0; } }
.bmd-area { animation: bmd-fadein 1s ease .35s both; }
@keyframes bmd-fadein { from { opacity:0; } }
.bmd-chart:not(.static) .bmd-dot.end, .bmd-spark-anim .bmd-dot.end { animation: bmd-dotpop .4s var(--ease) both; animation-delay: 1s; transform-box: fill-box; transform-origin: center; }
@keyframes bmd-dotpop { from { transform: scale(0); } }
.bmd-chart.static *, .bmd-static * { animation: none !important; }
.bmd-chart.static .bmd-draw, .bmd-static .bmd-draw { stroke-dashoffset: 0; }

/* ---------- ranked bars ---------- */
.bmd-bars { display:flex; flex-direction:column; gap:11px; }
.bmd-bar-row { display:block; border-radius:8px; padding:3px 6px; margin:-3px -6px; transition: background .15s; }
.bmd-bar-row[data-route] { cursor:pointer; }
.bmd-bar-row[data-route]:hover { background: var(--hover); }
.bmd-bar-top { display:flex; justify-content:space-between; gap:12px; font-size:12.5px; margin-bottom:5px; }
.bmd-bar-label { color: var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.bmd-bar-val { color: var(--ink); font-weight:600; font-variant-numeric: tabular-nums; white-space:nowrap; }
.bmd-bar-val small { color: var(--ink-2); font-weight:400; margin-left:4px; }
.bmd-track { height:8px; border-radius:999px; background: var(--hover); overflow:hidden; }
.bmd-fill { height:100%; border-radius:999px; background: var(--s1); transform-origin: left; animation: bmd-grow .9s var(--ease) both; }
.bmd-pair .bmd-track { height:6px; }
.bmd-pair .bmd-track + .bmd-track { margin-top:3px; }
@keyframes bmd-grow { from { transform: scaleX(0); } }

/* ---------- funnel ---------- */
.bmd-funnel { display:flex; flex-direction:column; gap:4px; }
.bmd-fstage { display:grid; grid-template-columns: minmax(92px, 34%) 1fr auto; align-items:center; gap:10px; font-size:12.5px; border-radius:8px; }
.bmd-fstage[data-route] { cursor:pointer; }
.bmd-fstage[data-route]:hover .bmd-flabel { color: var(--s1); }
.bmd-flabel { color: var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bmd-fbar { height:26px; border-radius:6px; min-width:3px; animation: bmd-grow .9s var(--ease) both; transform-origin:left; position:relative; overflow:hidden; }
.bmd-fbar::after { content:""; position:absolute; inset:0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent); transform: translateX(-100%); animation: bmd-sheen 2.8s ease-in-out 1.2s infinite; }
@keyframes bmd-sheen { 60%, 100% { transform: translateX(100%); } }
.bmd-fval { font-weight:650; font-variant-numeric: tabular-nums; min-width:36px; text-align:right; }
.bmd-fconv { display:grid; grid-template-columns: minmax(92px, 34%) 1fr; gap:10px; font-size:11px; color: var(--ink-2); min-height:14px; }
.bmd-fconv span:last-child { display:flex; align-items:center; gap:4px; }
.bmd-fconv svg { width:11px; height:11px; }

/* ---------- segmented bar ---------- */
.bmd-segbar { display:flex; gap:2px; height:28px; border-radius:6px; overflow:hidden; }
.bmd-segbar > div { height:100%; display:flex; align-items:center; padding-left:8px; font-size:11.5px; font-weight:600; color:#fff; min-width:0; overflow:hidden; white-space:nowrap; transform-origin:left; animation: bmd-grow .8s var(--ease) both; animation-delay: var(--d, 0ms); }
.bmd-segbar > div.dark-ink { color:#0b0b0b; }
.bmd-segbar > div:first-child { border-radius:4px 0 0 4px; }
.bmd-segbar > div:last-child { border-radius:0 4px 4px 0; }
.bmd-segbar > div:only-child { border-radius:4px; }
.bmd-seglegend { display:grid; grid-template-columns: repeat(auto-fill, minmax(130px,1fr)); gap:8px 16px; margin-top:14px; }
.bmd-seglegend div { display:flex; align-items:center; gap:8px; font-size:12px; color: var(--ink-2); min-width:0; }
.bmd-seglegend div[data-route] { cursor:pointer; }
.bmd-seglegend div[data-route]:hover { color: var(--ink); }
.bmd-seglegend b { color: var(--ink); font-weight:600; margin-left:auto; font-variant-numeric: tabular-nums; }

/* ---------- ring, meters, key-values ---------- */
.bmd-ring { position:relative; width:var(--size, 88px); height:var(--size, 88px); flex:none; }
.bmd-ring svg { width:100%; height:100%; transform: rotate(-90deg); }
.bmd-ring .trk { stroke: var(--s1-track); }
.bmd-ring .val { transition: stroke-dashoffset 1.4s var(--ease); }
.bmd-ring .lbl { position:absolute; inset:0; display:grid; place-items:center; font-weight:700; font-size:15px; }
.bmd-meter { margin-top:6px; }
.bmd-meter-track { height:10px; border-radius:999px; background: var(--s1-track); overflow:hidden; }
.bmd-meter-fill { height:100%; border-radius:999px; background: var(--s1); animation: bmd-grow 1s var(--ease) both; transform-origin:left; }
.bmd-meter-top { display:flex; justify-content:space-between; gap:8px; font-size:12px; color: var(--ink-2); margin-bottom:6px; }
.bmd-meter-top b { color: var(--ink); font-weight:600; font-variant-numeric: tabular-nums; }
.bmd-kv { display:flex; flex-direction:column; gap:12px; }
.bmd-kv-row { display:flex; justify-content:space-between; align-items:baseline; gap:12px; font-size:12.5px; color: var(--ink-2); }
.bmd-kv-row b { color: var(--ink); font-size:15px; font-weight:650; font-variant-numeric: tabular-nums; }
.bmd-kv-row.total { border-top:1px solid var(--line); padding-top:12px; }
.bmd-kv-row.total b { font-size:19px; }
.bmd-divider { height:1px; background: var(--line); margin:16px 0; }
.bmd-mini-h { font-size:12px; font-weight:600; color: var(--ink); margin-bottom:10px; }

/* health tiles */
.bmd-health { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:8px; }
.bmd-health > div { border:1px solid var(--line); border-radius:10px; padding:10px; }
.bmd-health .hl { display:flex; align-items:center; gap:6px; font-size:11.5px; color: var(--ink-2); white-space:nowrap; }
.bmd-health .hv { font-size:24px; font-weight:700; margin-top:4px; }

/* status pill */
.bmd-pill { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:500; color: var(--ink); white-space:nowrap; }
.bmd-pill i { width:8px; height:8px; border-radius:999px; display:inline-block; flex:none; }
.bmd-pill svg { width:13px; height:13px; flex:none; }

/* tables */
.bmd-table-wrap { overflow-x:auto; margin: 0 -18px -16px; }
.bmd-table { width:100%; border-collapse:collapse; font-size:12.5px; }
.bmd-table th { text-align:left; font-weight:500; color: var(--ink-2); font-size:11.5px; padding:8px 18px; border-bottom:1px solid var(--line); white-space:nowrap; background: color-mix(in srgb, var(--hover) 50%, transparent); }
.bmd-table td { padding:10px 18px; border-bottom:1px solid var(--line); color: var(--ink); white-space:nowrap; vertical-align:middle; }
.bmd-table tr:last-child td { border-bottom:0; }
.bmd-table tbody tr { animation: bmd-fade .4s ease both; animation-delay: calc(var(--i, 0) * 35ms); }
.bmd-table .num { text-align:right; font-variant-numeric: tabular-nums; }
.bmd-table tbody tr[data-route] { cursor:pointer; }
.bmd-table tbody tr[data-route]:hover td { background: var(--hover); }
.bmd-table .muted { color: var(--ink-2); }
.bmd-table .strong { font-weight:600; }
.bmd-table .ellipsis { max-width: 240px; overflow:hidden; text-overflow:ellipsis; }
.bmd-prog { display:flex; align-items:center; gap:8px; min-width:120px; }
.bmd-prog .bmd-track { flex:1; height:6px; }
.bmd-prog span { font-variant-numeric: tabular-nums; font-size:12px; min-width:34px; text-align:right; color: var(--ink-2); }

/* visit cards */
.bmd-visits { display:grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap:12px; }
.bmd-visit { border:1px solid var(--line); border-radius:12px; padding:12px; display:flex; gap:12px; cursor:pointer; transition: transform .2s var(--ease), background .15s; animation: bmd-in .5s var(--ease) both; animation-delay: calc(var(--i, 0) * 60ms); }
.bmd-visit:hover { background: var(--hover); transform: translateY(-2px); }
.bmd-cal { width:44px; flex:none; border-radius:9px; overflow:hidden; text-align:center; border:1px solid var(--line); background: var(--surface); }
.bmd-cal .m { background: linear-gradient(135deg, var(--hero-a), var(--hero-b)); color:#fff; font-size:10px; font-weight:600; text-transform:uppercase; padding:2px 0; }
.bmd-cal .d { font-size:17px; font-weight:700; padding:2px 0 3px; }
.bmd-visit .vt { font-weight:600; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bmd-visit .vs { font-size:11.5px; color: var(--ink-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* states */
.bmd-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:8px; color: var(--ink-2); font-size:12.5px; padding:28px 12px; min-height:120px; height:100%; }
.bmd-empty svg { width:28px; height:28px; opacity:.5; }
.bmd-skel { border-radius:8px; background: linear-gradient(90deg, var(--hover) 0%, color-mix(in srgb, var(--hover) 40%, var(--surface)) 50%, var(--hover) 100%); background-size:200% 100%; animation: bmd-shimmer 1.2s infinite linear; }
@keyframes bmd-shimmer { to { background-position: -200% 0; } }
.bmd-error { border:1px solid color-mix(in srgb, var(--critical) 40%, var(--line)); background: color-mix(in srgb, var(--critical) 6%, var(--surface)); color: var(--ink); border-radius: var(--radius); padding:14px 16px; margin-bottom:16px; font-size:12.5px; }

/* tooltip */
.bmd-tip { position:absolute; z-index:40; pointer-events:none; background: var(--card-bg, #fff); color: var(--ink); border:1px solid var(--line); border-radius:10px; box-shadow: 0 10px 28px rgba(0,0,0,.16); padding:10px 12px; font-size:12px; min-width:160px; opacity:0; transform: translateY(4px); transition: opacity .12s, transform .12s; }
.bmd-tip.on { opacity:1; transform:none; }
.bmd-tip .tt { font-weight:600; margin-bottom:6px; }
.bmd-tip .tr { display:flex; align-items:center; gap:8px; margin-top:3px; }
.bmd-tip .tr b { margin-left:auto; padding-left:14px; font-variant-numeric: tabular-nums; font-weight:600; }
.bmd-tip .tr.sep { border-top:1px solid var(--line); margin-top:6px; padding-top:6px; }
.bmd-tip .hint { margin-top:7px; font-size:11px; color: var(--ink-3); }

@media (prefers-reduced-motion: reduce) { .bmd *, .bmd *::before, .bmd *::after { animation:none !important; transition:none !important; } .bmd-draw { stroke-dashoffset:0; } }
@media (forced-colors: active) { .bmd-fill, .bmd-fbar, .bmd-meter-fill, .bmd-segbar > div { forced-color-adjust:none; } }
`;

	/* ------------------------------------------------------------------ */
	/* Icons (24px, stroke)                                                */
	/* ------------------------------------------------------------------ */

	const ICON_PATHS = {
		refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
		up: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
		down: '<path d="M7 7l10 10"/><path d="M17 8v9H8"/>',
		table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
		chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
		wallet: '<path d="M3 7a2 2 0 0 1 2-2h12v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13.5h2"/>',
		bank: '<path d="m3 10 9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
		arrowin: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
		arrowout: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/>',
		clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
		alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
		check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
		x: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
		receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z"/><path d="M9 8h6M9 12h6"/>',
		file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M9 13h6M9 17h4"/>',
		target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
		users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 3.5a4 4 0 0 1 0 9M22 21a7 7 0 0 0-4-6.3"/>',
		cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.5L22 8H6"/>',
		folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
		tasks: '<path d="m4 6 2 2 3-3M4 13l2 2 3-3M4 20l2 2 3-3"/><path d="M13 7h8M13 14h8M13 21h8"/>',
		lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
		inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6Z"/>',
		percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
		chevdown: '<path d="m6 9 6 6 6-6"/>',
		chevleft: '<path d="m15 18-6-6 6-6"/>',
		chevright: '<path d="m9 18 6-6-6-6"/>',
		calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
		spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
		trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
		bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9Z"/>',
	};
	const icon = (name) =>
		`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;

	/* ------------------------------------------------------------------ */
	/* Formatting                                                          */
	/* ------------------------------------------------------------------ */

	const esc = (v) =>
		String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
	const num = (v) => (isFinite(+v) ? +v : 0);

	function symbolFor(cur) {
		try {
			if (typeof window.get_currency_symbol === "function") return window.get_currency_symbol(cur) || cur || "";
		} catch (e) {
			/* ignore */
		}
		return cur ? cur + " " : "";
	}

	function compact(v, digits = 1) {
		const a = Math.abs(v);
		for (const [d, u] of [
			[1e9, "B"],
			[1e6, "M"],
			[1e3, "K"],
		]) {
			if (a >= d) {
				const x = v / d;
				return (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(digits)).replace(/\.0+$/, "") + u;
			}
		}
		return a >= 100 || Number.isInteger(v) ? Math.round(v).toLocaleString() : v.toFixed(digits).replace(/\.0+$/, "");
	}

	function money(v, cur, full) {
		v = num(v);
		if (full) {
			if (typeof window.format_currency === "function") return window.format_currency(v, cur);
			return symbolFor(cur) + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		}
		return (v < 0 ? "-" : "") + symbolFor(cur) + compact(Math.abs(v));
	}

	const count = (v) => Math.round(num(v)).toLocaleString();
	const pct = (v, d = 0) => num(v).toFixed(d) + "%";

	const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	function parseDate(s) {
		if (!s) return null;
		if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
		const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
		return new Date(y, m - 1, d || 1);
	}
	const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	function fmtDate(s, withYear) {
		const d = parseDate(s);
		if (!d) return "";
		return `${d.getDate()} ${t(MONTHS[d.getMonth()])}${withYear ? " " + d.getFullYear() : ""}`;
	}

	function deltaInfo(cur, prev, upIsGood = true) {
		cur = num(cur);
		prev = num(prev);
		if (!prev && !cur) return null;
		if (!prev) return { text: t("new"), cls: "flat", dir: 0, pct: null };
		const ch = ((cur - prev) / Math.abs(prev)) * 100;
		if (Math.abs(ch) < 0.5) return { text: "0%", cls: "flat", dir: 0, pct: 0 };
		const dir = ch > 0 ? 1 : -1;
		const good = upIsGood ? dir > 0 : dir < 0;
		return { text: (Math.abs(ch) >= 1000 ? ">999" : Math.abs(ch).toFixed(0)) + "%", cls: good ? "good" : "bad", dir, pct: ch };
	}
	function deltaHtml(cur, prev, upIsGood) {
		const d = deltaInfo(cur, prev, upIsGood);
		if (!d) return "";
		const ic = d.dir > 0 ? icon("up") : d.dir < 0 ? icon("down") : "";
		const word = d.dir > 0 ? t("up") : d.dir < 0 ? t("down") : t("unchanged");
		return `<span class="bmd-delta ${d.cls}" title="${esc(word + " " + d.text + " " + t("vs previous period"))}">${ic}${esc(d.text)}</span>`;
	}
	const vsPrev = (cur, prev, upGood) => {
		const d = deltaHtml(cur, prev, upGood);
		return d ? `${d}<span>${esc(t("vs prev. period"))}</span>` : `<span>${esc(t("No prior data"))}</span>`;
	};

	/* ------------------------------------------------------------------ */
	/* Date ranges                                                         */
	/* ------------------------------------------------------------------ */

	const DAY = 86400000;
	const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
	const monthStart = (d, n = 0) => new Date(d.getFullYear(), d.getMonth() + n, 1);
	const monthEnd = (d, n = 0) => new Date(d.getFullYear(), d.getMonth() + n + 1, 0);
	const sameDay = (a, b) => !!a && !!b && iso(a) === iso(b);
	const today0 = () => parseDate(new Date());
	const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / DAY);

	const PRESET_GROUPS = [
		{
			label: "Days & weeks",
			items: [
				["today", "Today", (n) => [n, n]],
				["yesterday", "Yesterday", (n) => [addDays(n, -1), addDays(n, -1)]],
				["this_week", "This week", (n) => [addDays(n, -((n.getDay() + 6) % 7)), n]],
				["last_7", "Last 7 days", (n) => [addDays(n, -6), n]],
				["last_30", "Last 30 days", (n) => [addDays(n, -29), n]],
				["last_90", "Last 90 days", (n) => [addDays(n, -89), n]],
			],
		},
		{
			label: "Months & years",
			items: [
				["month", "This month", (n) => [monthStart(n), n]],
				["last_month", "Last month", (n) => [monthStart(n, -1), monthEnd(n, -1)]],
				["quarter", "This quarter", (n) => [new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1), n]],
				[
					"last_quarter",
					"Last quarter",
					(n) => {
						const q = new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3 - 3, 1);
						return [q, monthEnd(q, 2)];
					},
				],
				["year", "This year", (n) => [new Date(n.getFullYear(), 0, 1), n]],
				["last_year", "Last year", (n) => [new Date(n.getFullYear() - 1, 0, 1), new Date(n.getFullYear() - 1, 11, 31)]],
				["12m", "Last 12 months", (n) => [monthStart(n, -11), n]],
			],
		},
	];
	const PRESETS = Object.fromEntries(PRESET_GROUPS.flatMap((g) => g.items.map(([k, l, fn]) => [k, { label: l, fn }])));

	/** Human label for a range: "November 2026", "Q3 2026", "2026", "3 – 26 Nov 2026"... */
	function describeRange(from, to) {
		from = parseDate(from);
		to = parseDate(to);
		const fullMonths = from.getDate() === 1 && sameDay(to, monthEnd(to));
		const months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + 1;
		if (fullMonths && months === 1) return `${t(MONTHS_LONG[from.getMonth()])} ${from.getFullYear()}`;
		if (fullMonths && months === 3 && from.getMonth() % 3 === 0) return `Q${from.getMonth() / 3 + 1} ${from.getFullYear()}`;
		if (fullMonths && months === 12 && from.getMonth() === 0) return String(from.getFullYear());
		if (sameDay(from, to)) return fmtDate(from, true);
		if (from.getFullYear() === to.getFullYear()) {
			if (from.getMonth() === to.getMonth()) return `${from.getDate()} – ${fmtDate(to, true)}`;
			return `${fmtDate(from)} – ${fmtDate(to, true)}`;
		}
		return `${fmtDate(from, true)} – ${fmtDate(to, true)}`;
	}

	/**
	 * Step a range back (-1) or forward (+1). Month-aligned ranges (including
	 * month/quarter/year-to-date) step by whole months; others by their length.
	 */
	function shiftRange(from, to, dir) {
		from = parseDate(from);
		to = parseDate(to);
		const now = today0();
		if (from.getDate() === 1 && (sameDay(to, monthEnd(to)) || sameDay(to, now))) {
			const months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + 1;
			const nf = monthStart(from, dir * months);
			let nt = monthEnd(nf, months - 1);
			if (nt > now) nt = now;
			return [nf, nt];
		}
		const span = daysBetween(from, to) + 1;
		let nf = addDays(from, dir * span);
		let nt = addDays(to, dir * span);
		if (nt > now) {
			nt = now;
			nf = addDays(now, -(span - 1));
		}
		return [nf, nt];
	}

	const store = {
		get(k) {
			try {
				return window.localStorage.getItem("bmd:" + k);
			} catch (e) {
				return null;
			}
		},
		set(k, v) {
			try {
				window.localStorage.setItem("bmd:" + k, v);
			} catch (e) {
				/* ignore */
			}
		},
	};

	/* ------------------------------------------------------------------ */
	/* Motion                                                              */
	/* ------------------------------------------------------------------ */

	function tween(duration, step) {
		if (reducedMotion()) return step(1);
		const t0 = performance.now();
		const frame = (now) => {
			const p = Math.min(1, (now - t0) / duration);
			step(1 - Math.pow(1 - p, 3));
			if (p < 1) requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
	}

	/* ------------------------------------------------------------------ */
	/* Chart primitives                                                    */
	/* ------------------------------------------------------------------ */

	function niceTicks(min, max, n = 4) {
		if (min === max) max = min + 1;
		const raw = (max - min) / n;
		let step = Math.pow(10, Math.floor(Math.log10(raw)));
		const err = raw / step;
		if (err >= 7.5) step *= 10;
		else if (err >= 3.5) step *= 5;
		else if (err >= 1.5) step *= 2;
		const lo = Math.floor(min / step) * step;
		const hi = Math.ceil(max / step) * step;
		const ticks = [];
		for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
		return ticks;
	}

	function barPath(x, base, end, w, r = 4) {
		const h = Math.abs(end - base);
		r = Math.min(r, h, w / 2);
		if (end <= base)
			return `M${x},${base}V${end + r}Q${x},${end} ${x + r},${end}H${x + w - r}Q${x + w},${end} ${x + w},${end + r}V${base}Z`;
		return `M${x},${base}V${end - r}Q${x},${end} ${x + r},${end}H${x + w - r}Q${x + w},${end} ${x + w},${end - r}V${base}Z`;
	}

	/** Smooth path through points; control points are clamped so curves never overshoot the data. */
	function smoothPath(pts) {
		if (pts.length < 3) return pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join("");
		let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
		for (let i = 0; i < pts.length - 1; i++) {
			const [x0, y0] = pts[Math.max(0, i - 1)];
			const [x1, y1] = pts[i];
			const [x2, y2] = pts[i + 1];
			const [x3, y3] = pts[Math.min(pts.length - 1, i + 2)];
			const k = 0.16;
			const lo = Math.min(y1, y2);
			const hi = Math.max(y1, y2);
			const c1y = Math.max(lo, Math.min(hi, y1 + (y2 - y0) * k));
			const c2y = Math.max(lo, Math.min(hi, y2 - (y3 - y1) * k));
			d += `C${(x1 + (x2 - x0) * k).toFixed(1)},${c1y.toFixed(1)} ${(x2 - (x3 - x1) * k).toFixed(1)},${c2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
		}
		return d;
	}

	function tipHtml(title, rows, hint) {
		return (
			`<div class="tt">${esc(title)}</div>` +
			rows
				.map(
					(r) =>
						`<div class="tr${r.sep ? " sep" : ""}">${r.color ? `<span class="bmd-key ${r.dash ? "dash" : ""}" style="background:${r.color}"></span>` : ""}<span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`
				)
				.join("") +
			(hint ? `<div class="hint">${esc(hint)}</div>` : "")
		);
	}

	function legendHtml(series, kind = "box") {
		return `<div class="bmd-legend">${series
			.map((s) => `<span><i class="bmd-key ${s.dash ? "dash" : kind === "line" ? "line" : ""}" style="background:${s.color}"></i>${esc(s.name)}</span>`)
			.join("")}</div>`;
	}

	/** Axis label for a trend bucket. */
	function bucketAxisLabel(b, gran, first) {
		const d = parseDate(b.key);
		if (gran === "month") return t(MONTHS[d.getMonth()]) + (first || d.getMonth() === 0 ? " " + String(d.getFullYear()).slice(2) : "");
		const s = parseDate(b.start);
		return first || s.getDate() <= (gran === "week" ? 7 : 1) ? `${s.getDate()} ${t(MONTHS[s.getMonth()])}` : String(s.getDate());
	}
	/** Tooltip/table title for a trend bucket. */
	function bucketTitle(b, gran) {
		if (gran === "month") {
			const d = parseDate(b.key);
			return `${t(MONTHS_LONG[d.getMonth()])} ${d.getFullYear()}`;
		}
		if (gran === "week") return sameDay(parseDate(b.start), parseDate(b.end)) ? fmtDate(b.start, true) : `${fmtDate(b.start)} – ${fmtDate(b.end, true)}`;
		const d = parseDate(b.key);
		return `${t(WEEKDAYS[d.getDay()])}, ${fmtDate(b.key, true)}`;
	}
	const GRAN_LABEL = { day: "Daily", week: "Weekly", month: "Monthly" };

	/**
	 * Time-series chart.
	 * opts: {uid, buckets, granularity, series:[{name,color,values}], mode: "bars"|"lines"|"cumulative",
	 *        prev: {name, values} (cumulative only), format(v, full), height, extraTip(i), onPick(i), animate}
	 */
	function timeChart(host, opts, ctx) {
		const W = Math.max(280, host.clientWidth || 600);
		const H = opts.height || 260;
		const buckets = opts.buckets;
		const n = buckets.length;
		const mode = opts.mode || "bars";
		const running = (vals) => {
			let s = 0;
			return vals.map((v) => (s += num(v)));
		};
		const series = opts.series.map((s) => ({ ...s, values: mode === "cumulative" ? running(s.values) : s.values.map(num) }));
		const prev = mode === "cumulative" && opts.prev ? { ...opts.prev, values: running(opts.prev.values) } : null;

		const all = series.flatMap((s) => s.values).concat(prev ? prev.values : []);
		const lo = Math.min(0, ...all);
		const hi = Math.max(0, ...all);
		const ticks = niceTicks(lo, hi === lo ? lo + 1 : hi, 4);
		const yMin = ticks[0];
		const yMax = ticks[ticks.length - 1];
		const tickLabels = ticks.map((v) => opts.format(v));
		const ml = Math.max(...tickLabels.map((s) => s.length)) * 6.4 + 14;
		const mr = 10;
		const mt = 10;
		const mb = 26;
		const iw = W - ml - mr;
		const ih = H - mt - mb;
		const y = (v) => mt + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
		const band = iw / n;
		const xc = (i) => ml + band * i + band / 2;
		const base = y(0);
		const anim = opts.animate !== false;

		let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "")}">`;
		svg += `<defs>${series
			.map(
				(s, si) =>
					`<linearGradient id="${opts.uid}-g${si}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${s.color}" stop-opacity=".22"/><stop offset="100%" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`
			)
			.join("")}</defs>`;
		svg += `<g class="bmd-axis">`;
		ticks.forEach((v, i) => {
			const yy = Math.round(y(v)) + 0.5;
			if (v !== 0) svg += `<line class="bmd-gridline" x1="${ml}" x2="${W - mr}" y1="${yy}" y2="${yy}"/>`;
			svg += `<text x="${ml - 8}" y="${yy + 4}" text-anchor="end">${esc(tickLabels[i])}</text>`;
		});
		const every = Math.max(1, Math.ceil((opts.granularity === "month" ? 40 : 38) / band));
		buckets.forEach((b, i) => {
			if ((n - 1 - i) % every) return;
			svg += `<text x="${xc(i)}" y="${H - 8}" text-anchor="middle">${esc(bucketAxisLabel(b, opts.granularity, i < every))}</text>`;
		});
		svg += `</g>`;

		if (mode === "bars") {
			const k = series.length;
			const bw = Math.max(2, Math.min(24, (band * 0.72 - (k - 1) * 2) / k));
			const gw = bw * k + (k - 1) * 2;
			for (let i = 0; i < n; i++) {
				svg += `<g class="bmd-col" data-i="${i}">`;
				series.forEach((s, si) => {
					const v = s.values[i];
					if (!v) return;
					const x = xc(i) - gw / 2 + si * (bw + 2);
					svg += `<path class="${anim ? "bmd-rise" + (v < 0 ? " down" : "") : ""}" style="--d:${Math.round((i / n) * 420 + si * 60)}ms" d="${barPath(x, base, y(v), bw)}" fill="${s.color}"/>`;
				});
				svg += `</g>`;
			}
		} else {
			if (prev) {
				const pts = prev.values.map((v, i) => [xc(i), y(v)]);
				svg += `<path class="${anim ? "bmd-area" : ""}" d="${smoothPath(pts)}" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round"/>`;
			}
			series.forEach((s, si) => {
				const pts = s.values.map((v, i) => [xc(i), y(v)]);
				const d = smoothPath(pts);
				if (si === 0)
					svg += `<path class="${anim ? "bmd-area" : ""}" d="${d}L${pts[n - 1][0].toFixed(1)},${base}L${pts[0][0].toFixed(1)},${base}Z" fill="url(#${opts.uid}-g${si})"/>`;
				svg += `<path class="${anim ? "bmd-draw" : ""}" style="--d:${si * 180}ms" pathLength="1" d="${d}" fill="none" stroke="${s.color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>`;
			});
			svg += `<line class="bmd-guide" x1="0" x2="0" y1="${mt}" y2="${mt + ih}"/>`;
			series.forEach((s) => {
				s.values.forEach((v, i) => {
					svg += `<circle class="bmd-dot${i === n - 1 ? " end" : ""}" data-i="${i}" cx="${xc(i)}" cy="${y(v)}" r="4.5" fill="${s.color}" stroke="var(--card-bg, #fff)" stroke-width="2"/>`;
				});
			});
		}
		svg += `<line class="bmd-baseline" x1="${ml}" x2="${W - mr}" y1="${Math.round(base) + 0.5}" y2="${Math.round(base) + 0.5}"/>`;
		for (let i = 0; i < n; i++) svg += `<rect class="bmd-hit" data-i="${i}" x="${ml + band * i}" y="${mt}" width="${band}" height="${ih}"/>`;
		svg += `</svg>`;

		host.innerHTML = `<div class="bmd-chart${anim ? "" : " static"}${opts.onPick ? " pickable" : ""}">${svg}</div>`;
		const chart = host.firstElementChild;
		const guide = chart.querySelector(".bmd-guide");
		const setOn = (i) => {
			chart.classList.toggle("is-hover", i != null);
			chart.querySelectorAll(".bmd-col, .bmd-dot").forEach((el) => el.classList.toggle("on", i != null && +el.dataset.i === i));
			if (guide) {
				guide.classList.toggle("on", i != null);
				if (i != null) guide.setAttribute("x1", xc(i)), guide.setAttribute("x2", xc(i));
			}
		};
		chart.querySelectorAll(".bmd-hit").forEach((hit) => {
			const i = +hit.dataset.i;
			hit.addEventListener("mouseenter", (e) => {
				setOn(i);
				const rows = series.map((s) => ({ label: s.name, value: opts.format(s.values[i], true), color: s.color }));
				if (prev) rows.push({ label: prev.name, value: opts.format(prev.values[i], true), color: "var(--ink-3)", dash: true });
				if (opts.extraTip && mode !== "cumulative") rows.push(...opts.extraTip(i));
				ctx.tip.show(tipHtml(bucketTitle(buckets[i], opts.granularity), rows, opts.onPick ? t("Click to open the records") : ""), e);
			});
			hit.addEventListener("mousemove", (e) => ctx.tip.move(e));
			hit.addEventListener("mouseleave", () => {
				setOn(null);
				ctx.tip.hide();
			});
			if (opts.onPick)
				hit.addEventListener("click", () => {
					ctx.tip.hide();
					opts.onPick(i);
				});
		});
	}

	/** Column chart over ordinal categories (e.g. aging buckets). */
	function categoryColumns(host, opts, ctx) {
		const W = Math.max(240, host.clientWidth || 400);
		const H = opts.height || 210;
		const vals = opts.items.map((d) => num(d.value));
		const ticks = niceTicks(0, Math.max(1, ...vals), 3);
		const yMax = ticks[ticks.length - 1];
		const labels = ticks.map((v) => opts.format(v));
		const ml = Math.max(...labels.map((s) => s.length)) * 6.4 + 14;
		const mt = 18;
		const mb = 26;
		const iw = W - ml - 6;
		const ih = H - mt - mb;
		const y = (v) => mt + ih - (v / yMax) * ih;
		const band = iw / opts.items.length;
		const bw = Math.min(40, band * 0.62);
		const anim = opts.animate !== false;
		let svg = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(opts.label || "")}"><g class="bmd-axis">`;
		ticks.forEach((v, i) => {
			const yy = Math.round(y(v)) + 0.5;
			if (v) svg += `<line class="bmd-gridline" x1="${ml}" x2="${W - 6}" y1="${yy}" y2="${yy}"/>`;
			svg += `<text x="${ml - 8}" y="${yy + 4}" text-anchor="end">${esc(labels[i])}</text>`;
		});
		opts.items.forEach((d, i) => {
			svg += `<text x="${ml + band * i + band / 2}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>`;
		});
		svg += `</g>`;
		opts.items.forEach((d, i) => {
			const v = num(d.value);
			const x = ml + band * i + (band - bw) / 2;
			svg += `<g class="bmd-col" data-i="${i}">`;
			if (v) {
				svg += `<path class="${anim ? "bmd-rise" : ""}" style="--d:${i * 90}ms" d="${barPath(x, y(0), y(v), bw)}" fill="${opts.colors[i % opts.colors.length]}"/>`;
				svg += `<text class="${anim ? "bmd-area" : ""}" x="${x + bw / 2}" y="${y(v) - 6}" text-anchor="middle" style="fill:var(--ink);font-size:11px;font-weight:600">${esc(opts.format(v))}</text>`;
			}
			svg += `</g>`;
		});
		svg += `<line class="bmd-baseline" x1="${ml}" x2="${W - 6}" y1="${Math.round(y(0)) + 0.5}" y2="${Math.round(y(0)) + 0.5}"/>`;
		opts.items.forEach((d, i) => {
			svg += `<rect class="bmd-hit" data-i="${i}" x="${ml + band * i}" y="${mt}" width="${band}" height="${ih}"/>`;
		});
		svg += `</svg>`;
		host.innerHTML = `<div class="bmd-chart${anim ? "" : " static"}">${svg}</div>`;
		const chart = host.firstElementChild;
		chart.querySelectorAll(".bmd-hit").forEach((hit) => {
			const i = +hit.dataset.i;
			hit.addEventListener("mouseenter", (e) => {
				chart.classList.add("is-hover");
				chart.querySelectorAll(".bmd-col").forEach((g) => g.classList.toggle("on", +g.dataset.i === i));
				const d = opts.items[i];
				ctx.tip.show(tipHtml(d.label, [{ label: opts.valueLabel || t("Amount"), value: opts.format(d.value, true) }]), e);
			});
			hit.addEventListener("mousemove", (e) => ctx.tip.move(e));
			hit.addEventListener("mouseleave", () => {
				chart.classList.remove("is-hover");
				ctx.tip.hide();
			});
		});
	}

	function sparkline(host, values, o = {}) {
		const W = Math.max(60, host.clientWidth || 200);
		const H = host.clientHeight || 40;
		const v = values.map(num);
		if (v.length < 2) return (host.innerHTML = "");
		const lo = Math.min(...v);
		const hi = Math.max(...v);
		const pad = 4;
		const y = (x) => pad + (H - pad * 2) - ((x - lo) / (hi - lo || 1)) * (H - pad * 2);
		const x = (i) => pad + (i * (W - pad * 2)) / Math.max(1, v.length - 1);
		const pts = v.map((p, i) => [x(i), y(p)]);
		const d = smoothPath(pts);
		const last = v.length - 1;
		const stroke = o.stroke || "var(--ink-3)";
		const anim = o.animate !== false;
		host.innerHTML = `<svg width="${W}" height="${H}" aria-hidden="true" class="${anim ? "bmd-spark-anim" : "bmd-static"}">
			<defs><linearGradient id="${o.uid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${o.fill || stroke}" stop-opacity=".28"/><stop offset="100%" stop-color="${o.fill || stroke}" stop-opacity="0"/></linearGradient></defs>
			<path class="bmd-area" d="${d}L${x(last)},${H}L${x(0)},${H}Z" fill="url(#${o.uid})"/>
			<path class="bmd-draw" pathLength="1" d="${d}" fill="none" stroke="${stroke}" stroke-width="${o.width || 2}" stroke-linejoin="round" stroke-linecap="round"/>
			<circle class="bmd-dot end" cx="${x(last)}" cy="${y(v[last])}" r="${o.r || 3.5}" fill="${o.dot || stroke}" stroke="${o.ring || "var(--card-bg, #fff)"}" stroke-width="2"/></svg>`;
	}

	/* ------------------------------------------------------------------ */
	/* HTML components                                                     */
	/* ------------------------------------------------------------------ */

	const routeAttr = (r) => (r ? `data-route='${esc(JSON.stringify(r))}'` : "");

	function bars(items, o) {
		const max = Math.max(1, ...items.map((d) => num(d.value)));
		const total = items.reduce((a, d) => a + num(d.value), 0) || 1;
		return `<div class="bmd-bars">${items
			.map(
				(d, i) => `<div class="bmd-bar-row" ${routeAttr(o.route && o.route(d))}>
				<div class="bmd-bar-top"><span class="bmd-bar-label" title="${esc(d.label)}">${esc(d.label)}</span>
				<span class="bmd-bar-val">${esc(o.format(d.value))}${o.share ? `<small>${pct((num(d.value) / total) * 100)}</small>` : ""}</span></div>
				<div class="bmd-track"><div class="bmd-fill" style="width:${Math.max(0.5, (num(d.value) / max) * 100)}%;background:${o.color || "var(--s1)"};animation-delay:${i * 70}ms"></div></div>
			</div>`
			)
			.join("")}</div>`;
	}

	function pairBars(items, o) {
		const max = Math.max(1, ...items.flatMap((d) => [num(d.a), num(d.b)]));
		return (
			legendHtml([
				{ name: o.aName, color: "var(--s1)" },
				{ name: o.bName, color: "var(--s2)" },
			]) +
			`<div class="bmd-bars bmd-pair" style="margin-top:6px">${items
				.map((d, i) => {
					const over = num(d.b) > num(d.a) && num(d.a) > 0;
					const used = num(d.a) ? (num(d.b) / num(d.a)) * 100 : 0;
					return `<div class="bmd-bar-row" ${routeAttr(d.route)}>
					<div class="bmd-bar-top"><span class="bmd-bar-label" title="${esc(d.label)}">${esc(d.label)}</span>
					<span class="bmd-bar-val">${esc(o.format(d.b))} <small>/ ${esc(o.format(d.a))}</small>
					${num(d.a) ? `<span class="bmd-pill" style="margin-left:8px">${over ? `<span style="color:var(--critical);display:inline-flex">${icon("alert")}</span>` : ""}${pct(used)}</span>` : ""}</span></div>
					<div class="bmd-track"><div class="bmd-fill" style="width:${(num(d.a) / max) * 100}%;background:var(--s1);animation-delay:${i * 70}ms"></div></div>
					<div class="bmd-track"><div class="bmd-fill" style="width:${(num(d.b) / max) * 100}%;background:var(--s2);animation-delay:${i * 70 + 120}ms"></div></div>
				</div>`;
				})
				.join("")}</div>`
		);
	}

	function segbar(items, o) {
		const total = items.reduce((a, d) => a + num(d.value), 0);
		if (!total) return null;
		const segs = items
			.filter((d) => num(d.value) > 0)
			.map((d, i) => {
				const share = (num(d.value) / total) * 100;
				return `<div class="${d.darkInk ? "dark-ink" : ""}" style="flex:${num(d.value)} 1 0;background:${d.color};--d:${i * 90}ms" title="${esc(d.label + ": " + o.format(d.value) + " (" + pct(share) + ")")}">${share >= 12 ? pct(share) : ""}</div>`;
			})
			.join("");
		const legend = items
			.map((d) => `<div ${routeAttr(d.route)}><i class="bmd-key" style="background:${d.color}"></i><span>${esc(d.label)}</span><b>${esc(o.format(d.value))}</b></div>`)
			.join("");
		return `<div class="bmd-segbar" role="img" aria-label="${esc(items.map((d) => d.label + " " + o.format(d.value)).join(", "))}">${segs}</div><div class="bmd-seglegend">${legend}</div>`;
	}

	function funnel(stages, numFn) {
		const max = Math.max(1, ...stages.map((s) => num(s.value)));
		const ramp = ["var(--ramp-1)", "var(--ramp-2)", "var(--ramp-3)", "var(--ramp-4)", "var(--ramp-5)"];
		let html = `<div class="bmd-funnel">`;
		stages.forEach((s, i) => {
			if (i) {
				const prev = num(stages[i - 1].value);
				const conv = prev ? (num(s.value) / prev) * 100 : 0;
				html += `<div class="bmd-fconv"><span></span><span>${prev && conv <= 100 ? icon("chevdown") + pct(conv) + " " + esc(t("of previous stage")) : ""}</span></div>`;
			}
			html += `<div class="bmd-fstage" ${routeAttr(s.route)}>
				<span class="bmd-flabel">${esc(s.label)}</span>
				<div><div class="bmd-fbar" style="width:${(num(s.value) / max) * 100}%;background:${ramp[i % ramp.length]};animation-delay:${i * 110}ms"></div></div>
				<span class="bmd-fval">${numFn("funnel-" + i, s.value, count)}</span></div>`;
		});
		return html + `</div>`;
	}

	function meter(label, value, max, o = {}) {
		const raw = num(max) ? (num(value) / num(max)) * 100 : 0;
		const share = Math.min(100, raw);
		const color = o.color || (raw > 100 ? "var(--critical)" : "var(--s1)");
		return `<div class="bmd-meter"><div class="bmd-meter-top"><span>${esc(label)}</span><b>${esc(o.text || pct(raw))}</b></div>
			<div class="bmd-meter-track"><div class="bmd-meter-fill" style="width:${share}%;background:${color}"></div></div></div>`;
	}

	function ring(value, o = {}) {
		const r = 40;
		const c = 2 * Math.PI * r;
		const share = Math.max(0, Math.min(100, num(value)));
		return `<div class="bmd-ring" style="--size:${o.size || 88}px"><svg viewBox="0 0 100 100" aria-hidden="true">
			<circle class="trk" cx="50" cy="50" r="${r}" fill="none" stroke-width="10"/>
			<circle class="val" cx="50" cy="50" r="${r}" fill="none" stroke="${o.color || "var(--s1)"}" stroke-width="10" stroke-linecap="round"
				stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}" data-dash-to="${(c * (1 - share / 100)).toFixed(2)}"/></svg>
			<div class="lbl">${o.label || ""}</div></div>`;
	}

	function table(cols, rows, routeFn) {
		return `<div class="bmd-table-wrap"><table class="bmd-table"><thead><tr>${cols
			.map((c) => `<th class="${c.num ? "num" : ""}">${esc(c.label)}</th>`)
			.join("")}</tr></thead><tbody>${rows
			.map((r, i) => {
				const route = routeFn && routeFn(r);
				return `<tr style="--i:${Math.min(i, 12)}" ${routeAttr(route)}>${cols
					.map((c) => `<td class="${[c.num ? "num" : "", c.cls || ""].join(" ")}">${c.html ? c.html(r) : esc(c.value(r))}</td>`)
					.join("")}</tr>`;
			})
			.join("")}</tbody></table></div>`;
	}

	const STATUS = {
		good: { color: "var(--good)", icon: "check" },
		warning: { color: "var(--warning)", icon: "alert" },
		serious: { color: "var(--serious)", icon: "clock" },
		critical: { color: "var(--critical)", icon: "alert" },
		neutral: { color: "var(--neutral)", icon: "x" },
	};
	function pill(label, kind) {
		const s = STATUS[kind];
		if (!s) return `<span class="bmd-pill"><i style="background:var(--s1)"></i>${esc(label)}</span>`;
		return `<span class="bmd-pill"><span style="color:${s.color};display:inline-flex">${icon(s.icon)}</span>${esc(label)}</span>`;
	}

	const empty = (msg) => `<div class="bmd-empty">${icon("inbox")}<div>${esc(msg || t("No data for this period"))}</div></div>`;
	const denied = () => `<div class="bmd-empty">${icon("lock")}<div>${esc(t("You don't have access to this data"))}</div></div>`;
	const failed = () => `<div class="bmd-empty">${icon("alert")}<div>${esc(t("Couldn't load this card. The error has been logged."))}</div></div>`;
	const stateHtml = (s, emptyMsg) => (s.state === "denied" ? denied() : s.state === "error" ? failed() : empty(emptyMsg));

	/* ------------------------------------------------------------------ */
	/* Dashboard shell                                                     */
	/* ------------------------------------------------------------------ */

	let UID = 0;

	class Dashboard {
		constructor(root, kind) {
			this.root = root;
			this.kind = kind;
			this.def = DEFS[kind];
			this.uid = "bmd" + ++UID;
			this.charts = [];
			this.nums = new Map();
			this.pendingNums = [];
			this.firstRender = true;
			this.company = store.get("company") || null;
			this.fiscal = null;
			this.live = store.get(kind + ":live") === "1";
			try {
				this.chartModes = JSON.parse(store.get(kind + ":modes") || "{}") || {};
			} catch (e) {
				this.chartModes = {};
			}
			this.range = this.restoreRange();
			this.build();
		}

		/* -- range state -- */

		savedRange() {
			try {
				return JSON.parse(store.get(this.kind + ":range") || "null");
			} catch (e) {
				return null;
			}
		}

		restoreRange() {
			const saved = this.savedRange();
			if (saved && saved.preset && PRESETS[saved.preset]) return this.presetRange(saved.preset);
			if (saved && saved.from && saved.to) return { preset: "custom", from: parseDate(saved.from), to: parseDate(saved.to) };
			return this.presetRange("month"); // fiscal year is restored once the server has sent it
		}

		presetRange(key) {
			if (key === "fiscal") {
				if (!this.fiscal) return null;
				const end = parseDate(this.fiscal.to);
				return { preset: "fiscal", from: parseDate(this.fiscal.from), to: end < today0() ? end : today0() };
			}
			const p = PRESETS[key];
			if (!p) return null;
			const [from, to] = p.fn(today0());
			return { preset: key, from, to };
		}

		setRange(r) {
			this.range = r;
			store.set(this.kind + ":range", JSON.stringify(r.preset === "custom" ? { from: iso(r.from), to: iso(r.to) } : { preset: r.preset }));
			this.syncRangeUi();
			this.load();
		}

		rangeLabel() {
			const r = this.range;
			if (r.preset === "fiscal" && this.fiscal) return `${t("Fiscal year")} ${this.fiscal.name}`;
			if (r.preset !== "custom" && PRESETS[r.preset]) return t(PRESETS[r.preset].label);
			return describeRange(r.from, r.to);
		}

		syncRangeUi() {
			const r = this.range;
			this.el.querySelector("[data-range-label]").textContent = this.rangeLabel();
			this.el.querySelector("[data-next]").disabled = r.to >= today0();
			this.el.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preset === r.preset)));
			const from = this.el.querySelector("[data-from]");
			const to = this.el.querySelector("[data-to]");
			from.value = iso(r.from);
			to.value = iso(r.to);
			from.max = to.max = iso(today0());
		}

		/* -- build -- */

		build() {
			const host = this.root.querySelector(".bm-dashboard-root") || this.root;
			const style = document.createElement("style");
			style.textContent = STYLES;
			this.root.appendChild(style);

			this.el = document.createElement("div");
			this.el.className = "bmd is-loading";
			this.el.innerHTML = `
				<div class="bmd-head">
					<div class="bmd-progress"></div>
					<div class="bmd-title"><div class="bmd-badge">${icon(this.def.icon)}</div>
						<div style="min-width:0"><h2>${esc(t(this.def.title))}</h2><div class="bmd-sub" data-sub>${esc(t(this.def.subtitle))}</div></div></div>
					<div class="bmd-filters">
						<select class="bmd-select" data-company aria-label="${esc(t("Company"))}" style="display:none"></select>
						<div class="bmd-datewrap">
							<div class="bmd-group">
								<button type="button" class="bmd-btn icon" data-prev title="${esc(t("Previous period"))}" aria-label="${esc(t("Previous period"))}">${icon("chevleft")}</button>
								<button type="button" class="bmd-btn date" data-date aria-haspopup="dialog" aria-expanded="false">${icon("calendar")}<span class="lbl" data-range-label></span><span class="caret">${icon("chevdown")}</span></button>
								<button type="button" class="bmd-btn icon" data-next title="${esc(t("Next period"))}" aria-label="${esc(t("Next period"))}">${icon("chevright")}</button>
							</div>
							<div class="bmd-pop" role="dialog" aria-label="${esc(t("Date range"))}" hidden>
								${PRESET_GROUPS.map(
									(g, gi) => `<div class="col"><h4>${esc(t(g.label))}</h4>${g.items
										.map(([k, l, fn]) => {
											const [a, b] = fn(today0());
											return `<button type="button" class="bmd-preset" data-preset="${k}"><span>${esc(t(l))}</span><small>${esc(describeRange(a, b))}</small></button>`;
										})
										.join("")}${gi === 1 ? `<button type="button" class="bmd-preset" data-preset="fiscal" hidden><span>${esc(t("Fiscal year"))}</span><small data-fiscal-label></small></button>` : ""}</div>`
								).join("")}
								<div class="bmd-custom"><h4 style="margin:4px 0">${esc(t("Custom range"))}</h4>
									<label>${esc(t("From"))}<input type="date" data-from></label>
									<label>${esc(t("To"))}<input type="date" data-to></label>
									<button type="button" class="bmd-apply" data-apply>${esc(t("Apply range"))}</button>
								</div>
							</div>
						</div>
						<button type="button" class="bmd-btn ${this.live ? "live-on" : ""}" data-live title="${esc(t("Refresh automatically every 5 minutes"))}" aria-pressed="${this.live}"><span class="bmd-live-dot"></span>${esc(t("Live"))}</button>
						<button type="button" class="bmd-btn icon" data-refresh title="${esc(t("Refresh now"))}" aria-label="${esc(t("Refresh now"))}">${icon("refresh")}</button>
					</div>
				</div>
				<div data-error></div>
				<div class="bmd-insights" data-insights style="display:none"></div>
				<div class="bmd-grid">${this.def.skeleton}</div>
				<div class="bmd-tip" role="tooltip"></div>`;
			host.appendChild(this.el);
			this.grid = this.el.querySelector(".bmd-grid");
			this.tip = this.makeTip(this.el.querySelector(".bmd-tip"));
			this.pop = this.el.querySelector(".bmd-pop");

			this.syncTheme();
			this.themeObserver = new MutationObserver(() => this.syncTheme());
			this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

			this.bindFilters();
			this.syncRangeUi();
			this.el.addEventListener("click", (e) => this.onClick(e));

			let lastW = this.el.clientWidth; // the observer's first callback is not a resize
			let timer = null;
			this.resizeObserver = new ResizeObserver(() => {
				const w = this.el.clientWidth;
				if (Math.abs(w - lastW) < 4) return;
				lastW = w;
				clearTimeout(timer);
				timer = setTimeout(() => this.drawCharts(false), 120);
			});
			this.resizeObserver.observe(this.el);

			this.startLive();
			this.init();
		}

		bindFilters() {
			const $ = (s) => this.el.querySelector(s);
			const dateBtn = $("[data-date]");
			const wrap = $(".bmd-datewrap");
			const togglePop = (open) => {
				const show = open === undefined ? this.pop.hidden : open;
				this.pop.hidden = !show;
				dateBtn.setAttribute("aria-expanded", String(show));
			};
			dateBtn.addEventListener("click", () => togglePop());
			this.docClick = (e) => {
				if (!this.el.isConnected) return document.removeEventListener("click", this.docClick, true);
				if (!this.pop.hidden && !e.composedPath().includes(wrap)) togglePop(false);
			};
			document.addEventListener("click", this.docClick, true);
			this.el.addEventListener("keydown", (e) => {
				if (e.key === "Escape" && !this.pop.hidden) {
					togglePop(false);
					dateBtn.focus();
				}
			});

			this.el.querySelectorAll("[data-preset]").forEach((b) =>
				b.addEventListener("click", () => {
					const r = this.presetRange(b.dataset.preset);
					if (!r) return;
					togglePop(false);
					this.setRange(r);
				})
			);
			$("[data-apply]").addEventListener("click", () => {
				let from = parseDate($("[data-from]").value);
				let to = parseDate($("[data-to]").value);
				if (!from || !to || isNaN(from) || isNaN(to)) return;
				if (from > to) [from, to] = [to, from];
				togglePop(false);
				this.setRange({ preset: "custom", from, to });
			});
			const step = (dir) => {
				const [from, to] = shiftRange(this.range.from, this.range.to, dir);
				this.setRange({ preset: "custom", from, to });
			};
			$("[data-prev]").addEventListener("click", () => step(-1));
			$("[data-next]").addEventListener("click", () => step(1));
			$("[data-refresh]").addEventListener("click", () => this.load(true));
			$("[data-live]").addEventListener("click", (e) => {
				this.live = !this.live;
				store.set(this.kind + ":live", this.live ? "1" : "0");
				e.currentTarget.classList.toggle("live-on", this.live);
				e.currentTarget.setAttribute("aria-pressed", String(this.live));
				this.startLive();
				if (this.live) this.load(true, true);
			});
			$("[data-company]").addEventListener("change", (e) => {
				this.company = e.target.value;
				store.set("company", this.company);
				this.load();
			});
		}

		startLive() {
			clearInterval(this.liveTimer);
			if (!this.live) return;
			this.liveTimer = setInterval(() => {
				if (!this.el.isConnected) return clearInterval(this.liveTimer);
				if (document.hidden) return;
				// rolling presets ("Today", "Last 7 days"...) move with the clock
				if (this.range.preset !== "custom") this.range = this.presetRange(this.range.preset) || this.range;
				this.load(true, true);
			}, LIVE_INTERVAL);
		}

		syncTheme() {
			const theme = document.documentElement.getAttribute("data-theme");
			const dark = theme === "dark" || (!theme && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
			this.el.setAttribute("data-theme", dark ? "dark" : "light");
		}

		makeTip(el) {
			const wrap = this.el;
			const place = (e) => {
				const r = wrap.getBoundingClientRect();
				const w = el.offsetWidth;
				const h = el.offsetHeight;
				let x = e.clientX - r.left + 14;
				let y = e.clientY - r.top - h - 12;
				if (x + w > r.width) x = e.clientX - r.left - w - 14;
				if (y < 0) y = e.clientY - r.top + 16;
				el.style.left = Math.max(0, x) + "px";
				el.style.top = y + "px";
			};
			return {
				show(html, e) {
					el.innerHTML = html;
					el.classList.add("on");
					place(e);
				},
				move: place,
				hide() {
					el.classList.remove("on");
				},
			};
		}

		async init() {
			try {
				const opts = await this.call("get_filter_options");
				const sel = this.el.querySelector("[data-company]");
				const companies = opts.companies || [];
				if (!companies.some((c) => c.name === this.company)) this.company = opts.default_company;
				sel.innerHTML = companies.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("");
				sel.value = this.company || "";
				sel.style.display = companies.length > 1 ? "" : "none";
				if (opts.fiscal_year) {
					this.fiscal = opts.fiscal_year;
					const fb = this.el.querySelector('[data-preset="fiscal"]');
					fb.hidden = false;
					fb.querySelector("[data-fiscal-label]").textContent = describeRange(this.fiscal.from, this.fiscal.to);
					const saved = this.savedRange();
					if (saved && saved.preset === "fiscal") this.range = this.presetRange("fiscal");
				}
			} catch (e) {
				/* optional; the API falls back to the default company */
			}
			this.syncRangeUi();
			this.load();
		}

		call(method, args) {
			if (window.frappe && frappe.xcall) return frappe.xcall(API + method, args || {});
			return Promise.reject(new Error("frappe.xcall unavailable"));
		}

		async load(refresh, silent) {
			const { from, to } = this.range;
			this.el.classList.add("is-loading");
			const token = (this.token = {});
			try {
				const data = await this.call(this.def.method, {
					company: this.company,
					from_date: iso(from),
					to_date: iso(to),
					refresh: refresh ? 1 : 0,
				});
				if (token !== this.token) return;
				this.data = data;
				this.cur = (data.filters && data.filters.currency) || "";
				const f = data.filters || {};
				const at = data.generated_at ? String(data.generated_at).slice(11, 16) : "";
				this.el.querySelector("[data-sub]").textContent = `${f.company || ""} · ${describeRange(f.from_date, f.to_date)}` + (at ? ` · ${t("updated")} ${at}` : "");
				this.el.querySelector("[data-error]").innerHTML = "";
				this.render(silent);
			} catch (e) {
				if (token !== this.token) return;
				this.el.querySelector("[data-error]").innerHTML = `<div class="bmd-error"><b>${esc(t("Couldn't load the dashboard."))}</b> ${esc((e && e.message) || "")}</div>`;
			} finally {
				if (token === this.token) this.el.classList.remove("is-loading");
			}
		}

		render(silent) {
			this.charts = [];
			this.pendingNums = [];
			this.tip.hide();
			this.grid.innerHTML = "";
			this.grid.classList.remove("enter", "swap");
			void this.grid.offsetWidth; // restart entrance animations
			if (!silent) this.grid.classList.add(this.firstRender ? "enter" : "swap");

			this.def.render(this);
			[...this.grid.children].forEach((el, i) => el.style.setProperty("--i", i));
			this.renderInsights(this.def.insights ? this.def.insights(this) : []);

			this.drawCharts(!silent);
			this.runNumbers();
			requestAnimationFrame(() =>
				requestAnimationFrame(() => this.el.querySelectorAll("[data-dash-to]").forEach((c) => c.setAttribute("stroke-dashoffset", c.dataset.dashTo)))
			);
			this.firstRender = false;
		}

		renderInsights(items) {
			const box = this.el.querySelector("[data-insights]");
			const list = items.filter(Boolean).slice(0, 4);
			box.style.display = list.length ? "" : "none";
			box.innerHTML = list
				.map((x, i) => `<div class="bmd-insight tone-${x.tone || "info"}" style="--i:${i}" ${routeAttr(x.route)}><span class="ic">${icon(x.icon || "spark")}</span><span>${x.html}</span></div>`)
				.join("");
		}

		drawCharts(animate = true) {
			this.charts.forEach((c) => {
				if (c.host.isConnected && c.host.offsetParent !== null) c.draw(animate);
			});
		}

		/** Animated number: counts from its previous value (or 0) to the new one. */
		num(key, value, fmt) {
			const from = this.nums.has(key) ? this.nums.get(key) : 0;
			this.pendingNums.push({ key, from, to: num(value), fmt });
			return `<span data-num="${esc(key)}">${esc(fmt(from))}</span>`;
		}

		runNumbers() {
			const jobs = this.pendingNums.map((j) => ({ ...j, el: this.el.querySelector(`[data-num="${CSS.escape(j.key)}"]`) })).filter((j) => j.el);
			jobs.forEach((j) => this.nums.set(j.key, j.to));
			if (!jobs.length) return;
			tween(1100, (p) => jobs.forEach((j) => (j.el.textContent = j.fmt(p >= 1 ? j.to : j.from + (j.to - j.from) * p))));
		}

		onClick(e) {
			const modeBtn = e.target.closest("[data-chart-mode]");
			if (modeBtn) {
				const card = modeBtn.closest("[data-chart-key]");
				const key = card.dataset.chartKey;
				this.chartModes[key] = modeBtn.dataset.chartMode;
				store.set(this.kind + ":modes", JSON.stringify(this.chartModes));
				card.querySelectorAll("[data-chart-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b === modeBtn)));
				const c = this.charts.find((x) => x.key === key);
				if (c) {
					const legend = card.querySelector("[data-legend]");
					if (legend && c.legend) legend.innerHTML = c.legend();
					c.draw(true);
				}
				return;
			}
			const tgl = e.target.closest("[data-view-toggle]");
			if (tgl) {
				const card = tgl.closest(".bmd-card");
				const showTable = tgl.getAttribute("aria-pressed") !== "true";
				tgl.setAttribute("aria-pressed", showTable);
				tgl.innerHTML = icon(showTable ? "chart" : "table");
				tgl.title = showTable ? t("Show chart") : t("Show table");
				card.querySelector("[data-view=chart]").style.display = showTable ? "none" : "";
				card.querySelector("[data-view=table]").style.display = showTable ? "" : "none";
				const modes = card.querySelector(".bmd-mini-seg");
				if (modes) modes.style.visibility = showTable ? "hidden" : "";
				if (!showTable) this.drawCharts(false);
				return;
			}
			const el = e.target.closest("[data-route]");
			if (el) this.go(JSON.parse(el.dataset.route));
		}

		go(route) {
			if (!route || !window.frappe || !frappe.set_route) return;
			try {
				frappe.set_route(...route);
			} catch (err) {
				/* ignore */
			}
		}

		/* -- builders used by the definitions -- */

		card(span, title, o = {}) {
			const card = document.createElement("section");
			card.className = `bmd-card ${span} ${o.cls || ""}`;
			if (o.chartKey) card.dataset.chartKey = o.chartKey;
			const actions = [];
			if (o.modes)
				actions.push(
					`<div class="bmd-mini-seg" role="group" aria-label="${esc(t("Chart style"))}">${o.modes
						.map(([k, l]) => `<button type="button" data-chart-mode="${k}" aria-pressed="${k === o.mode}">${esc(l)}</button>`)
						.join("")}</div>`
				);
			if (o.link) actions.push(`<button type="button" class="bmd-link" ${routeAttr(o.link.route)}>${esc(o.link.label)} →</button>`);
			if (o.table) actions.push(`<button type="button" class="bmd-toggle" data-view-toggle aria-pressed="false" title="${esc(t("Show table"))}">${icon("table")}</button>`);
			card.innerHTML = title
				? `<div class="bmd-card-h"><div><h3 class="bmd-card-t">${esc(title)}</h3>${o.sub ? `<div class="bmd-card-s">${esc(o.sub)}</div>` : ""}</div><div class="bmd-card-a">${actions.join("")}</div></div><div class="bmd-body"></div>`
				: `<div class="bmd-body"></div>`;
			(o.parent || this.grid).appendChild(card);
			const body = card.querySelector(".bmd-body");
			if (o.table) {
				body.innerHTML = `<div data-view="chart"></div><div data-view="table" style="display:none">${o.table}</div>`;
				return { card, body: body.firstElementChild };
			}
			return { card, body };
		}

		section(key) {
			const s = this.data && this.data[key];
			if (!s) return { state: "empty" };
			if (s.denied) return { state: "denied" };
			if (s.error) return { state: "error" };
			return { state: "ok", data: s };
		}

		chart(host, draw, extra = {}) {
			this.charts.push({ host, draw: (animate) => draw(host, animate), ...extra });
		}

		money(v, full) {
			return money(v, this.cur, full);
		}

		moneyNum(key, v) {
			return this.num(key, v, (x) => money(x, this.cur));
		}

		hero(span, o) {
			const { card, body } = this.card(span, null, { cls: "bmd-hero" });
			body.innerHTML = `<div class="bmd-hero-label">${icon(o.icon)}${esc(o.label)}</div>
				<div class="bmd-hero-value" title="${esc(o.title || "")}">${o.value}</div>
				<div class="bmd-hero-meta">${o.meta || ""}</div>
				${o.extra || ""}
				<div class="bmd-hero-foot">${o.spark ? `<div class="bmd-hero-spark"></div>` : "<div></div>"}${o.side || ""}</div>`;
			if (o.spark) {
				const uid = this.uid + "-hs";
				this.chart(body.querySelector(".bmd-hero-spark"), (h, animate) =>
					sparkline(h, o.spark, { uid, stroke: "#fff", fill: "#fff", dot: "#fff", ring: "rgba(255,255,255,.35)", width: 2.5, animate })
				);
			}
			return card;
		}

		tiles(span, list) {
			const wrap = document.createElement("div");
			wrap.className = `bmd-tiles ${span}`;
			wrap.innerHTML = list
				.map(
					(x, i) => `<div class="bmd-card bmd-tile" style="--accent:${x.accent || "var(--s1)"};--i:${i}" ${routeAttr(x.route)}>
					<div class="bmd-tile-label"><span class="bmd-tile-ic">${icon(x.icon)}</span>${esc(x.label)}</div>
					<div class="bmd-tile-row"><div class="bmd-tile-value" title="${esc(x.title || "")}">${x.value}</div>${x.spark ? `<div class="bmd-tile-spark" data-tile-spark="${i}"></div>` : ""}</div>
					<div class="bmd-tile-foot">${x.foot || "&nbsp;"}</div></div>`
				)
				.join("");
			this.grid.appendChild(wrap);
			list.forEach((x, i) => {
				if (!x.spark) return;
				const uid = `${this.uid}-ts${i}`;
				this.chart(wrap.querySelector(`[data-tile-spark="${i}"]`), (h, animate) =>
					sparkline(h, x.spark, { uid, stroke: x.accent || "var(--s1)", r: 2.5, width: 1.75, animate })
				);
			});
		}

		/** Trend card: Bars / Lines / Cumulative, follows the selected period, click a bucket to drill in. */
		trendCard(sectionKey, o) {
			const s = this.section(sectionKey);
			const trend = s.state === "ok" ? s.data : null;
			const modeOf = () => this.chartModes[o.key] || o.defaultMode || "bars";
			const modes = [
				["bars", t("Bars")],
				["lines", t("Lines")],
				["cumulative", t("Cumulative")],
			];
			let tbl;
			if (trend)
				tbl = table(
					[
						{ label: t(GRAN_LABEL[trend.granularity]), value: (r) => bucketTitle(r.b, trend.granularity) },
						...trend.series.map((ser) => ({ label: ser.name, num: 1, value: (r) => o.format(ser.values[r.i], true) })),
					],
					trend.buckets.map((b, i) => ({ b, i })).reverse()
				);
			const sub = trend ? `${t(GRAN_LABEL[trend.granularity])} · ${describeRange(trend.from, trend.to)}${o.sub ? " · " + o.sub : ""}` : o.sub;
			const { body } = this.card(o.span || "c8", o.title, { sub, table: tbl, modes: trend ? modes : null, mode: modeOf(), chartKey: o.key });
			if (!trend) return (body.innerHTML = stateHtml(s));
			if (!trend.series.some((x) => x.values.some((v) => num(v)))) return (body.innerHTML = empty(o.emptyMsg));

			const colored = trend.series.map((x, i) => ({ name: x.name, color: o.colors[i], values: x.values }));
			const prevSeries = trend.prev ? { name: `${colored[0].name} · ${t("previous period")}`, values: trend.prev } : null;
			const legend = () =>
				legendHtml(
					modeOf() === "cumulative" && prevSeries ? [...colored, { ...prevSeries, color: "var(--ink-3)", dash: true }] : colored,
					modeOf() === "bars" ? "box" : "line"
				);
			body.innerHTML = `<div data-legend>${legend()}</div><div data-plot></div>`;
			const uid = `${this.uid}-${o.key}`;
			this.chart(
				body.querySelector("[data-plot]"),
				(h, animate) =>
					timeChart(
						h,
						{
							uid,
							buckets: trend.buckets,
							granularity: trend.granularity,
							series: colored,
							prev: prevSeries,
							mode: modeOf(),
							label: o.title,
							format: o.format,
							height: o.height || 270,
							extraTip: o.extraTip ? (i) => o.extraTip(trend, i) : null,
							onPick: o.pick ? (i) => this.go(o.pick(trend.buckets[i])) : null,
							animate,
						},
						this
					),
				{ key: o.key, legend }
			);
		}
	}

	const skel = (span, h) => `<div class="bmd-card ${span}"><div class="bmd-skel" style="height:${h}px"></div></div>`;
	const SKELETON =
		skel("c4", 200) +
		`<div class="bmd-tiles c8">${Array(6).fill(`<div class="bmd-card"><div class="bmd-skel" style="height:66px"></div></div>`).join("")}</div>` +
		skel("c8", 320) +
		skel("c4", 320) +
		skel("c4", 240) +
		skel("c4", 240) +
		skel("c4", 240);

	/* ------------------------------------------------------------------ */
	/* Dashboard definitions                                               */
	/* ------------------------------------------------------------------ */

	const DEFS = {};

	/* ---------------------------- Accounting --------------------------- */
	DEFS.accounting = {
		title: "Accounting",
		subtitle: "Profitability, cash and receivables",
		icon: "bank",
		method: "get_accounting_dashboard",
		skeleton: SKELETON,
		insights(d) {
			const out = [];
			const k = d.section("kpis");
			const eb = d.section("expense_breakdown");
			const tax = d.section("tax");
			const company = d.data.filters.company;
			if (k.state === "ok") {
				const x = k.data;
				const dl = deltaInfo(x.net_profit, x.prev_net_profit, true);
				if (x.income)
					out.push({
						tone: x.net_profit >= 0 ? "good" : "critical",
						icon: "trend",
						html: `${esc(t("Net margin"))} <b>${pct((x.net_profit / x.income) * 100, 1)}</b>${dl && dl.pct != null && dl.dir ? ` · ${esc(t("profit"))} ${dl.dir > 0 ? "▲" : "▼"} ${esc(dl.text)}` : ""}`,
					});
				if (x.receivable) {
					const share = (x.overdue_receivable / x.receivable) * 100;
					out.push({
						tone: share > 30 ? "critical" : share > 10 ? "warning" : "good",
						icon: "clock",
						html: `<b>${pct(share)}</b> ${esc(t("of receivables overdue"))} (${esc(d.money(x.overdue_receivable))})`,
						route: ["List", "Sales Invoice", { company, status: "Overdue" }],
					});
				}
			}
			if (eb.state === "ok" && eb.data.items.length) {
				const top = eb.data.items[0];
				const total = eb.data.items.reduce((a, i) => a + num(i.value), 0) || 1;
				out.push({ tone: "info", icon: "arrowout", html: `${esc(t("Top expense"))}: <b>${esc(top.label)}</b> (${pct((top.value / total) * 100)})` });
			}
			if (tax.state === "ok" && (tax.data.output_tax || tax.data.input_tax))
				out.push({ tone: "info", icon: "receipt", html: `${esc(tax.data.net >= 0 ? t("Net VAT payable") : t("Net VAT refundable"))} <b>${esc(d.money(Math.abs(tax.data.net)))}</b>` });
			return out;
		},
		render(d) {
			const k = d.section("kpis");
			const tr = d.section("trend");
			const company = d.data.filters.company;
			const trend = tr.state === "ok" ? tr.data : null;

			if (k.state === "ok") {
				const x = k.data;
				const margin = x.income ? (x.net_profit / x.income) * 100 : 0;
				d.hero("c4", {
					icon: "wallet",
					label: t("Net profit"),
					value: d.moneyNum("net_profit", x.net_profit),
					title: d.money(x.net_profit, true),
					meta: vsPrev(x.net_profit, x.prev_net_profit, true),
					extra: `<div class="bmd-hero-meta" style="margin-top:8px"><span>${esc(t("Net margin"))} <b>${d.num("margin", margin, (v) => pct(v, 1))}</b></span></div>`,
					spark: trend ? trend.series[0].values.map((v, i) => num(v) - num(trend.series[1].values[i])) : null,
				});
				d.tiles("c8", [
					{ icon: "arrowin", accent: "var(--s1)", label: t("Income"), value: d.moneyNum("income", x.income), title: d.money(x.income, true), foot: vsPrev(x.income, x.prev_income, true), spark: trend && trend.series[0].values, route: ["query-report", "Profit and Loss Statement", { company }] },
					{ icon: "arrowout", accent: "var(--s2)", label: t("Expenses"), value: d.moneyNum("expense", x.expense), title: d.money(x.expense, true), foot: vsPrev(x.expense, x.prev_expense, false), spark: trend && trend.series[1].values, route: ["query-report", "Profit and Loss Statement", { company }] },
					{ icon: "bank", accent: "var(--s3)", label: t("Cash & bank"), value: d.moneyNum("cash", x.cash), title: d.money(x.cash, true), foot: esc(t("Balance at period end")), route: ["query-report", "General Ledger", { company }] },
					{ icon: "receipt", accent: "var(--s7)", label: t("Receivables"), value: d.moneyNum("receivable", x.receivable), title: d.money(x.receivable, true), foot: esc(t("Outstanding from customers")), route: ["query-report", "Accounts Receivable", { company }] },
					{ icon: "alert", accent: "var(--critical)", label: t("Overdue receivables"), value: d.moneyNum("overdue", x.overdue_receivable), title: d.money(x.overdue_receivable, true), foot: x.receivable ? `${pct((x.overdue_receivable / x.receivable) * 100)} ${esc(t("of receivables"))}` : "", route: ["List", "Sales Invoice", { company, status: "Overdue" }] },
					{ icon: "file", accent: "var(--s4)", label: t("Payables"), value: d.moneyNum("payable", x.payable), title: d.money(x.payable, true), foot: esc(t("Owed to suppliers")), route: ["query-report", "Accounts Payable", { company }] },
				]);
			} else d.card("c12", t("Key figures")).body.innerHTML = stateHtml(k);

			d.trendCard("trend", {
				key: "acc-trend",
				title: t("Income vs expenses"),
				sub: t("from the general ledger"),
				colors: ["var(--s1)", "var(--s2)"],
				format: (v, full) => d.money(v, full),
				emptyMsg: t("No ledger postings in this period"),
				extraTip: (tr, i) => [{ label: t("Net"), value: d.money(num(tr.series[0].values[i]) - num(tr.series[1].values[i]), true), sep: true }],
				pick: (b) => ["query-report", "General Ledger", { company, from_date: b.start, to_date: b.end }],
			});

			// Expense breakdown
			{
				const s = d.section("expense_breakdown");
				const { body } = d.card("c4", t("Where the money went"), { sub: t("Top expense accounts this period") });
				if (s.state !== "ok" || !s.data.items.length) body.innerHTML = stateHtml(s, t("No expenses booked this period"));
				else
					body.innerHTML = bars(s.data.items, {
						format: (v) => d.money(v),
						share: true,
						color: "var(--s2)",
						route: (x) => x.account && ["query-report", "General Ledger", { company, account: [x.account] }],
					});
			}

			// Aging
			{
				const s = d.section("aging");
				const items = s.state === "ok" ? s.data.buckets : [];
				const tbl = items.length ? table([{ label: t("Days past due"), value: (r) => r.label }, { label: t("Outstanding"), num: 1, value: (r) => d.money(r.value, true) }], items) : undefined;
				const { body } = d.card("c4", t("Receivables aging"), { sub: t("Outstanding by days past due"), table: tbl, link: { label: t("Report"), route: ["query-report", "Accounts Receivable", { company }] } });
				if (s.state !== "ok") body.innerHTML = stateHtml(s);
				else if (!items.some((b) => num(b.value))) body.innerHTML = empty(t("Nothing outstanding"));
				else
					d.chart(body, (h, animate) =>
						categoryColumns(h, { items, colors: ["var(--ramp-1)", "var(--ramp-2)", "var(--ramp-3)", "var(--ramp-4)", "var(--ramp-5)"], format: (v, full) => d.money(v, full), valueLabel: t("Outstanding"), label: t("Receivables aging"), animate }, d)
					);
			}

			// Top debtors
			{
				const s = d.section("top_debtors");
				const { body } = d.card("c4", t("Top debtors"), { sub: t("Customers with the most outstanding") });
				if (s.state !== "ok" || !s.data.items.length) body.innerHTML = stateHtml(s, t("No outstanding invoices"));
				else body.innerHTML = bars(s.data.items, { format: (v) => d.money(v), color: "var(--s7)", route: (x) => ["List", "Sales Invoice", { customer: x.customer, docstatus: 1, outstanding_amount: [">", 0] }] });
			}

			// Tax + expense entries
			{
				const tax = d.section("tax");
				const ee = d.section("expense_entries");
				const { body } = d.card("c4", t("VAT position"), { sub: t("This period"), link: { label: t("VAT report"), route: ["query-report", "VAT Tax Report", { company }] } });
				let html = "";
				if (tax.state === "ok") {
					const x = tax.data;
					html += `<div class="bmd-kv">
						<div class="bmd-kv-row"><span>${esc(t("Output VAT (sales)"))}</span><b>${d.moneyNum("vat-out", x.output_tax)}</b></div>
						<div class="bmd-kv-row"><span>${esc(t("Input VAT (purchases)"))}</span><b>${d.moneyNum("vat-in", x.input_tax)}</b></div>
						<div class="bmd-kv-row total"><span>${esc(x.net >= 0 ? t("Net VAT payable") : t("Net VAT refundable"))}</span><b>${d.moneyNum("vat-net", Math.abs(x.net))}</b></div></div>`;
				} else html += stateHtml(tax);
				if (ee.state === "ok") {
					const x = ee.data;
					const total = num(x.paid) + num(x.unpaid);
					html += `<div class="bmd-divider"></div><div class="bmd-mini-h">${esc(t("Expense entries"))}</div>`;
					html += total
						? meter(t("Paid"), x.paid, total, { text: `${d.money(x.paid)} / ${d.money(total)}` }) +
						  `<div class="bmd-card-s" style="margin-top:8px">${x.unpaid_count ? pill(`${count(x.unpaid_count)} ${t("unpaid")} · ${d.money(x.unpaid)}`, "warning") : pill(t("All paid"), "good")}</div>`
						: `<div class="bmd-card-s">${esc(t("No expense entries this period"))}</div>`;
				}
				body.innerHTML = html;
			}

			// Overdue invoices
			{
				const s = d.section("overdue_invoices");
				const { body } = d.card("c7", t("Overdue invoices"), { sub: t("Oldest first"), link: { label: t("View all"), route: ["List", "Sales Invoice", { company, status: "Overdue" }] } });
				if (s.state !== "ok" || !s.data.rows.length) body.innerHTML = stateHtml(s, t("No overdue invoices. Nice."));
				else
					body.innerHTML = table(
						[
							{ label: t("Invoice"), value: (r) => r.name, cls: "strong" },
							{ label: t("Customer"), value: (r) => r.customer_name, cls: "ellipsis" },
							{ label: t("Due"), value: (r) => fmtDate(r.due_date, true), cls: "muted" },
							{ label: t("Overdue"), html: (r) => pill(`${r.days_overdue} ${t("days")}`, r.days_overdue > 60 ? "critical" : r.days_overdue > 30 ? "serious" : "warning") },
							{ label: t("Outstanding"), num: 1, cls: "strong", value: (r) => money(r.outstanding_amount, r.currency || d.cur, true) },
						],
						s.data.rows,
						(r) => ["Form", "Sales Invoice", r.name]
					);
			}

			// Recent payments
			{
				const s = d.section("recent_payments");
				const { body } = d.card("c5", t("Recent payments"), { link: { label: t("View all"), route: ["List", "Payment Entry", { company }] } });
				if (s.state !== "ok" || !s.data.rows.length) body.innerHTML = stateHtml(s, t("No payments yet"));
				else
					body.innerHTML = table(
						[
							{ label: t("Party"), html: (r) => `<div class="strong ellipsis" style="max-width:180px">${esc(r.party_name || r.name)}</div><div class="muted" style="font-size:11.5px">${esc(fmtDate(r.posting_date, true))}${r.mode_of_payment ? " · " + esc(r.mode_of_payment) : ""}</div>` },
							{ label: t("Type"), html: (r) => (r.payment_type === "Receive" ? pill(t("Received"), "good") : r.payment_type === "Pay" ? `<span class="bmd-pill"><i style="background:var(--s2)"></i>${esc(t("Paid out"))}</span>` : `<span class="bmd-pill"><i style="background:var(--neutral)"></i>${esc(t(r.payment_type))}</span>`) },
							{ label: t("Amount"), num: 1, cls: "strong", value: (r) => d.money(r.base_paid_amount || r.paid_amount, true) },
						],
						s.data.rows,
						(r) => ["Form", "Payment Entry", r.name]
					);
			}
		},
	};

	/* ------------------------------ Sales ------------------------------ */
	const QUOTE_STATUS = {
		Open: { color: "var(--s1)" },
		Replied: { color: "var(--s7)" },
		"Partially Ordered": { color: "var(--s3)" },
		Ordered: { color: "var(--good)" },
		Lost: { color: "var(--critical)" },
		Expired: { color: "var(--neutral)", darkInk: true },
		Cancelled: { color: "var(--neutral)", darkInk: true },
	};

	DEFS.sales = {
		title: "Sales",
		subtitle: "Pipeline, revenue and customers",
		icon: "target",
		method: "get_sales_dashboard",
		skeleton: SKELETON,
		insights(d) {
			const out = [];
			const k = d.section("kpis");
			const tc = d.section("top_customers");
			const ls = d.section("lead_source");
			if (k.state === "ok") {
				const x = k.data;
				const dl = deltaInfo(x.sales, x.prev_sales, true);
				if (dl && dl.pct != null)
					out.push({ tone: dl.dir > 0 ? "good" : dl.dir < 0 ? "critical" : "info", icon: "trend", html: `${esc(t("Sales"))} ${esc(dl.dir > 0 ? t("up") : dl.dir < 0 ? t("down") : t("flat"))} <b>${esc(dl.text)}</b> ${esc(t("vs prev. period"))}` });
				if (x.quotations)
					out.push({ tone: x.win_rate >= 30 ? "good" : x.win_rate >= 15 ? "warning" : "critical", icon: "percent", html: `${esc(t("Win rate"))} <b>${pct(x.win_rate)}</b> · ${count(x.won)}/${count(x.quotations)} ${esc(t("quotations"))}` });
			}
			if (tc.state === "ok" && tc.data.items.length) {
				const top = tc.data.items[0];
				const total = tc.data.items.reduce((a, i) => a + num(i.value), 0) || 1;
				out.push({ tone: "info", icon: "users", html: `${esc(t("Best customer"))}: <b>${esc(top.label)}</b> (${pct((top.value / total) * 100)})`, route: top.customer ? ["List", "Sales Invoice", { customer: top.customer, docstatus: 1 }] : null });
			}
			if (ls.state === "ok" && ls.data.items.length && ls.data.items[0].source) out.push({ tone: "info", icon: "bolt", html: `${esc(t("Top lead source"))}: <b>${esc(ls.data.items[0].label)}</b>` });
			return out;
		},
		render(d) {
			const k = d.section("kpis");
			const tr = d.section("trend");
			const company = d.data.filters.company;
			const trend = tr.state === "ok" ? tr.data : null;

			if (k.state === "ok") {
				const x = k.data;
				d.hero("c4", {
					icon: "receipt",
					label: t("Sales invoiced"),
					value: d.moneyNum("sales", x.sales),
					title: d.money(x.sales, true),
					meta: vsPrev(x.sales, x.prev_sales, true),
					extra: `<div class="bmd-hero-meta" style="margin-top:8px"><span>${d.num("inv-count", x.invoices, count)} ${esc(t("invoices"))} · ${esc(t("avg"))} <b>${d.moneyNum("avg-inv", x.avg_invoice)}</b></span></div>`,
					spark: trend ? trend.series[0].values : null,
					side: ring(x.win_rate, {
						size: 78,
						color: "#fff",
						label: `<span style="font-size:14px;line-height:1.05;text-align:center">${d.num("win-ring", x.win_rate, (v) => pct(v))}<br><small style="font-size:9.5px;font-weight:500;opacity:.85">${esc(t("win rate"))}</small></span>`,
					}),
				});
				d.tiles("c8", [
					{ icon: "file", accent: "var(--s2)", label: t("Quoted value"), value: d.moneyNum("quoted", x.quoted), title: d.money(x.quoted, true), foot: vsPrev(x.quoted, x.prev_quoted, true), spark: trend && trend.series[1].values, route: ["List", "Quotation", { company, docstatus: 1 }] },
					{ icon: "inbox", accent: "var(--s7)", label: t("Quotations sent"), value: d.num("quotes", x.quotations, count), foot: `${count(x.won)} ${esc(t("won"))} · ${count(x.lost)} ${esc(t("lost"))}`, route: ["List", "Quotation", { company, docstatus: 1 }] },
					{ icon: "percent", accent: "var(--good)", label: t("Win rate"), value: d.num("win", x.win_rate, (v) => pct(v)), foot: esc(t("Quotations ordered")), route: ["List", "Quotation", { company, status: "Ordered" }] },
					{ icon: "users", accent: "var(--s3)", label: t("New leads"), value: d.num("leads", x.leads, count), foot: vsPrev(x.leads, x.prev_leads, true), route: ["List", "Lead", {}] },
					{ icon: "cart", accent: "var(--s4)", label: t("Average invoice"), value: d.moneyNum("avg", x.avg_invoice), title: d.money(x.avg_invoice, true), foot: esc(t("Net of taxes")) },
					{ icon: "receipt", accent: "var(--s1)", label: t("Invoices"), value: d.num("invoices", x.invoices, count), foot: esc(t("Submitted this period")), spark: trend && trend.series[0].values, route: ["List", "Sales Invoice", { company, docstatus: 1 }] },
				]);
			} else d.card("c12", t("Key figures")).body.innerHTML = stateHtml(k);

			d.trendCard("trend", {
				key: "sales-trend",
				title: t("Sales trend"),
				sub: t("net of taxes"),
				defaultMode: "lines",
				colors: ["var(--s1)", "var(--s2)"],
				format: (v, full) => d.money(v, full),
				emptyMsg: t("No sales in this period"),
				pick: (b) => ["List", "Sales Invoice", { company, docstatus: 1, posting_date: ["Between", [b.start, b.end]] }],
			});

			// Funnel
			{
				const s = d.section("funnel");
				const { body } = d.card("c4", t("Pipeline funnel"), { sub: t("Lead → site visit → BOQ → quotation → won") });
				if (s.state !== "ok" || !s.data.stages.some((x) => num(x.value))) body.innerHTML = stateHtml(s, t("No pipeline activity this period"));
				else {
					const routes = [
						["List", "Lead", {}],
						["List", "Site Visit", { docstatus: 1 }],
						["List", "Bill of Quantity", { docstatus: 1 }],
						["List", "Quotation", { company, docstatus: 1 }],
						["List", "Quotation", { company, status: "Ordered" }],
					];
					body.innerHTML = funnel(
						s.data.stages.map((x, i) => ({ ...x, route: routes[i] })),
						(key, v, fmt) => d.num(key, v, fmt)
					);
				}
			}

			// Quotation status
			{
				const s = d.section("quotation_status");
				const { body } = d.card("c4", t("Quotation status"), { sub: t("Submitted this period") });
				const html =
					s.state === "ok"
						? segbar(
								s.data.items.map((x) => ({ ...x, color: (QUOTE_STATUS[x.status] || { color: "var(--s4)" }).color, darkInk: (QUOTE_STATUS[x.status] || {}).darkInk, route: ["List", "Quotation", { company, status: x.status }] })),
								{ format: count }
						  )
						: null;
				body.innerHTML = html || stateHtml(s, t("No quotations this period"));
			}

			// Lead status
			{
				const s = d.section("lead_status");
				const { body } = d.card("c4", t("Leads by status"), { sub: t("Created this period") });
				if (s.state !== "ok" || !s.data.items.length) body.innerHTML = stateHtml(s, t("No new leads this period"));
				else body.innerHTML = bars(s.data.items, { format: count, share: true, route: (x) => ["List", "Lead", { status: x.status }] });
			}

			// Lead source
			{
				const s = d.section("lead_source");
				const { body } = d.card("c4", t("Lead sources"), { sub: t("Where new leads came from") });
				if (s.state !== "ok" || !s.data.items.length) body.innerHTML = stateHtml(s, t("No new leads this period"));
				else body.innerHTML = bars(s.data.items, { format: count, share: true, color: "var(--s3)", route: (x) => x.source && ["List", "Lead", { source: x.source }] });
			}

			// Top customers
			{
				const s = d.section("top_customers");
				const { body } = d.card("c4", t("Top customers"), { sub: t("By invoiced value this period") });
				if (s.state !== "ok" || !s.data.items.length) body.innerHTML = stateHtml(s, t("No invoices this period"));
				else body.innerHTML = bars(s.data.items, { format: (v) => d.money(v), share: true, route: (x) => ["List", "Sales Invoice", { customer: x.customer, docstatus: 1 }] });
			}

			// Recent quotations
			{
				const s = d.section("recent_quotations");
				const { body } = d.card("c8", t("Latest quotations"), { link: { label: t("View all"), route: ["List", "Quotation", { company }] } });
				if (s.state !== "ok" || !s.data.rows.length) body.innerHTML = stateHtml(s, t("No quotations yet"));
				else
					body.innerHTML = table(
						[
							{ label: t("Quotation"), value: (r) => r.name, cls: "strong" },
							{ label: t("Customer"), value: (r) => r.customer_name || r.party_name, cls: "ellipsis" },
							{ label: t("Date"), value: (r) => fmtDate(r.transaction_date, true), cls: "muted" },
							{
								label: t("Status"),
								html: (r) => {
									const st = r.docstatus === 0 ? "Draft" : r.status;
									if (st === "Ordered") return pill(t(st), "good");
									if (st === "Lost") return pill(t(st), "critical");
									if (st === "Expired") return pill(t(st), "neutral");
									const c = st === "Draft" ? "var(--neutral)" : (QUOTE_STATUS[st] || { color: "var(--s1)" }).color;
									return `<span class="bmd-pill"><i style="background:${c}"></i>${esc(t(st))}</span>`;
								},
							},
							{ label: t("Total"), num: 1, cls: "strong", value: (r) => d.money(r.base_grand_total, true) },
						],
						s.data.rows,
						(r) => ["Form", "Quotation", r.name]
					);
			}

			// Upcoming visits
			{
				const s = d.section("upcoming_visits");
				const { body } = d.card("c12", t("Upcoming site visits"), { link: { label: t("View all"), route: ["List", "Site Visit", {}] } });
				if (s.state !== "ok" || !s.data.rows.length) body.innerHTML = stateHtml(s, t("No site visits scheduled"));
				else
					body.innerHTML = `<div class="bmd-visits">${s.data.rows
						.map((r, i) => {
							const dt = parseDate(r.visit_date);
							return `<div class="bmd-visit" style="--i:${i}" ${routeAttr(["Form", "Site Visit", r.name])}>
							<div class="bmd-cal"><div class="m">${esc(t(MONTHS[dt.getMonth()]))}</div><div class="d">${dt.getDate()}</div></div>
							<div style="min-width:0"><div class="vt">${esc(r.lead_name || r.name)}</div>
							<div class="vs">${r.site_location ? esc(r.site_location) : esc(r.name)}</div>
							<div class="vs">${esc(t(r.status || "Draft"))}</div></div></div>`;
						})
						.join("")}</div>`;
			}
		},
	};

	/* ----------------------------- Projects ---------------------------- */
	const HEALTH = { "On track": "good", "At risk": "warning", Overdue: "critical" };
	const OPEN_TASKS = ["Open", "Working", "Pending Review", "Overdue"];

	DEFS.projects = {
		title: "Projects",
		subtitle: "Delivery, budgets and tasks",
		icon: "folder",
		method: "get_project_dashboard",
		skeleton: SKELETON,
		insights(d) {
			const out = [];
			const k = d.section("kpis");
			const b = d.section("budget");
			const company = d.data.filters.company;
			if (k.state === "ok") {
				const x = k.data;
				out.push(
					x.overdue
						? { tone: "critical", icon: "alert", html: `<b>${count(x.overdue)}</b> ${esc(t(x.overdue === 1 ? "project is past its deadline" : "projects are past their deadline"))}`, route: ["List", "Project", { company, status: "Open", expected_end_date: ["<", iso(today0())] }] }
						: { tone: "good", icon: "check", html: esc(t("No active project is past its deadline")) }
				);
				if (x.open_tasks) out.push({ tone: x.overdue_tasks ? "warning" : "good", icon: "tasks", html: `<b>${count(x.overdue_tasks)}</b> ${esc(t("of"))} ${count(x.open_tasks)} ${esc(t("open tasks are overdue"))}` });
				if (x.estimated) out.push({ tone: "info", icon: "receipt", html: `${esc(t("Billed"))} <b>${pct((x.billed / x.estimated) * 100)}</b> ${esc(t("of estimate"))}` });
			}
			if (b.state === "ok") {
				const over = b.data.items.filter((i) => num(i.estimated) && num(i.actual) > num(i.estimated));
				if (over.length) out.push({ tone: "critical", icon: "alert", html: `<b>${esc(over[0].label)}</b> ${esc(t("is over budget"))} (${pct((over[0].actual / over[0].estimated) * 100)})`, route: ["Form", "Project", over[0].project] });
			}
			return out;
		},
		render(d) {
			const k = d.section("kpis");
			const company = d.data.filters.company;
			const tr = d.section("trend");
			const trend = tr.state === "ok" ? tr.data : null;

			if (k.state === "ok") {
				const x = k.data;
				d.hero("c4", {
					icon: "target",
					label: t("Average completion"),
					value: d.num("avg-progress", x.avg_progress, (v) => pct(v)),
					meta: `<span>${esc(t("Across"))} <b>${d.num("active-hero", x.active, count)}</b> ${esc(t("active projects"))}</span>`,
					extra: meter(t("Billed against estimate"), x.billed, x.estimated, { text: x.estimated ? `${d.money(x.billed)} / ${d.money(x.estimated)}` : t("No estimates set") }),
					spark: trend ? trend.series[0].values : null,
					side: (() => {
						const ps = d.section("projects");
						if (ps.state !== "ok" || !ps.data.total) return "";
						const onTrack = (num(ps.data.health["On track"]) / ps.data.total) * 100;
						return ring(onTrack, {
							size: 78,
							color: "#fff",
							label: `<span style="font-size:14px;line-height:1.05;text-align:center">${d.num("on-track-ring", onTrack, (v) => pct(v))}<br><small style="font-size:9.5px;font-weight:500;opacity:.85">${esc(t("on track"))}</small></span>`,
						});
					})(),
				});
				d.tiles("c8", [
					{ icon: "folder", accent: "var(--s1)", label: t("Active projects"), value: d.num("active", x.active, count), foot: esc(t("Status open")), route: ["List", "Project", { company, status: "Open" }] },
					{ icon: "alert", accent: "var(--critical)", label: t("Past deadline"), value: d.num("overdue", x.overdue, count), foot: x.active ? `${pct((x.overdue / x.active) * 100)} ${esc(t("of active"))}` : "", route: ["List", "Project", { company, status: "Open", expected_end_date: ["<", iso(today0())] }] },
					{ icon: "check", accent: "var(--good)", label: t("Completed"), value: d.num("completed", x.completed, count), foot: esc(t("Closed this period")), route: ["List", "Project", { company, status: "Completed" }] },
					{ icon: "tasks", accent: "var(--s7)", label: t("Open tasks"), value: d.num("open-tasks", x.open_tasks, count), foot: esc(t("Open, working or in review")), spark: trend && trend.series[1].values, route: ["List", "Task", { status: ["in", OPEN_TASKS] }] },
					{ icon: "clock", accent: "var(--s2)", label: t("Overdue tasks"), value: d.num("overdue-tasks", x.overdue_tasks, count), foot: x.open_tasks ? `${pct((x.overdue_tasks / x.open_tasks) * 100)} ${esc(t("of open tasks"))}` : "", route: ["List", "Task", { status: ["in", OPEN_TASKS], exp_end_date: ["<", iso(today0())] }] },
					{ icon: "receipt", accent: "var(--s3)", label: t("Billed (active)"), value: d.moneyNum("billed", x.billed), title: d.money(x.billed, true), foot: x.estimated ? `${pct((x.billed / x.estimated) * 100)} ${esc(t("of estimate"))}` : esc(t("No estimates set")) },
				]);
			} else d.card("c12", t("Key figures")).body.innerHTML = stateHtml(k);

			d.trendCard("trend", {
				key: "proj-trend",
				title: t("Task throughput"),
				sub: t("completed vs falling due"),
				colors: ["var(--good)", "var(--s7)"],
				format: (v) => count(v),
				emptyMsg: t("No tasks completed or due in this period"),
				pick: (b) => ["List", "Task", { status: "Completed", completed_on: ["Between", [b.start, b.end]] }],
			});

			// Health + status
			{
				const s = d.section("projects");
				const st = d.section("status");
				const { body } = d.card("c4", t("Portfolio health"), { sub: t("Active projects, as of today") });
				let html = "";
				if (s.state === "ok") {
					const h = s.data.health;
					html += `<div class="bmd-health">${[
						["On track", "good"],
						["At risk", "warning"],
						["Overdue", "critical"],
					]
						.map(([label, kind]) => `<div><div class="hl">${pill(t(label), kind)}</div><div class="hv">${d.num("health-" + label, h[label], count)}</div></div>`)
						.join("")}</div>`;
					html += `<div class="bmd-card-s" style="margin-top:8px">${esc(t("At risk = progress trails elapsed time by more than 15 points."))}</div>`;
				} else html += stateHtml(s);
				if (st.state === "ok" && st.data.items.length) {
					const colors = { Open: "var(--s1)", Completed: "var(--good)", Cancelled: "var(--neutral)" };
					html +=
						`<div class="bmd-divider"></div><div class="bmd-mini-h">${esc(t("All projects by status"))}</div>` +
						segbar(
							st.data.items.map((x) => ({ ...x, color: colors[x.status] || "var(--s4)", darkInk: x.status === "Cancelled", route: ["List", "Project", { company, status: x.status }] })),
							{ format: count }
						);
				}
				body.innerHTML = html;
			}

			// Project list
			{
				const s = d.section("projects");
				const { body } = d.card("c8", t("Active projects"), {
					sub: s.state === "ok" ? `${t("Most urgent first")} · ${s.data.total} ${t("open")}` : t("Most urgent first"),
					link: { label: t("View all"), route: ["List", "Project", { company, status: "Open" }] },
				});
				if (s.state !== "ok" || !s.data.rows.length) body.innerHTML = stateHtml(s, t("No active projects"));
				else
					body.innerHTML = table(
						[
							{ label: t("Project"), html: (r) => `<div class="strong ellipsis">${esc(r.project_name || r.name)}</div><div class="muted" style="font-size:11.5px">${esc(r.customer || r.name)}</div>` },
							{ label: t("Progress"), html: (r) => `<div class="bmd-prog"><div class="bmd-track"><div class="bmd-fill" style="width:${Math.min(100, num(r.percent_complete))}%"></div></div><span>${pct(r.percent_complete)}</span></div>` },
							{ label: t("Deadline"), value: (r) => (r.expected_end_date ? fmtDate(r.expected_end_date, true) : "—"), cls: "muted" },
							{ label: t("Health"), html: (r) => pill(t(r.health), HEALTH[r.health]) },
						],
						s.data.rows,
						(r) => ["Form", "Project", r.name]
					);
			}

			// Task status
			{
				const s = d.section("task_status");
				const { body } = d.card("c4", t("Tasks by status"), { sub: t("All tasks, as of today") });
				if (s.state !== "ok" || !s.data.items.length) body.innerHTML = stateHtml(s, t("No tasks yet"));
				else body.innerHTML = bars(s.data.items, { format: count, share: true, color: "var(--s7)", route: (x) => ["List", "Task", { status: x.status }] });
			}

			// Budget vs actual
			{
				const s = d.section("budget");
				const items = s.state === "ok" ? s.data.items : [];
				const tbl = items.length
					? table(
							[
								{ label: t("Project"), value: (r) => r.label },
								{ label: t("Estimated"), num: 1, value: (r) => d.money(r.estimated, true) },
								{ label: t("Actual"), num: 1, value: (r) => d.money(r.actual, true) },
								{ label: t("Used"), num: 1, value: (r) => (r.estimated ? pct((r.actual / r.estimated) * 100) : "—") },
							],
							items
					  )
					: undefined;
				const { body } = d.card("c7", t("Budget vs actual"), { sub: t("Submitted project budgets, largest first"), table: tbl, link: { label: t("Budgets"), route: ["List", "Project Budget", { docstatus: 1 }] } });
				if (!items.length) body.innerHTML = stateHtml(s, t("No submitted project budgets"));
				else body.innerHTML = pairBars(items.map((x) => ({ label: x.label, a: x.estimated, b: x.actual, route: ["Form", "Project", x.project] })), { aName: t("Estimated"), bName: t("Actual"), format: (v) => d.money(v) });
			}

			// Subcontracting
			{
				const s = d.section("subcontract");
				const { body } = d.card("c5", t("Subcontracting"), { sub: t("Work orders and invoices this period"), link: { label: t("Work orders"), route: ["List", "Subcontract Work Order", { docstatus: 1 }] } });
				if (s.state !== "ok" || !(num(s.data.ordered) || num(s.data.invoiced))) body.innerHTML = stateHtml(s, t("No subcontract activity this period"));
				else {
					const x = s.data;
					body.innerHTML = `<div class="bmd-kv">
						<div class="bmd-kv-row"><span>${esc(t("Work orders"))} (${count(x.orders)})</span><b>${d.moneyNum("sc-ordered", x.ordered)}</b></div>
						<div class="bmd-kv-row"><span>${esc(t("Invoiced"))}</span><b>${d.moneyNum("sc-invoiced", x.invoiced)}</b></div>
						<div class="bmd-kv-row"><span>${esc(t("Paid"))}</span><b>${d.moneyNum("sc-paid", x.paid)}</b></div></div>
						<div class="bmd-divider"></div>
						${meter(t("Invoiced of ordered"), x.invoiced, x.ordered)}
						<div style="height:12px"></div>
						${meter(t("Paid of invoiced"), x.paid, x.invoiced, { color: "var(--s3)" })}`;
				}
			}

			// Due tasks
			{
				const s = d.section("due_tasks");
				const { body } = d.card("c12", t("Tasks due soon"), { sub: t("Overdue or due in the next 7 days"), link: { label: t("All tasks"), route: ["List", "Task", {}] } });
				if (s.state !== "ok" || !s.data.rows.length) body.innerHTML = stateHtml(s, t("Nothing due this week"));
				else
					body.innerHTML = table(
						[
							{ label: t("Task"), html: (r) => `<div class="strong ellipsis" style="max-width:360px">${esc(r.subject || r.name)}</div><div class="muted" style="font-size:11.5px">${esc(r.project || "—")}</div>` },
							{ label: t("Progress"), html: (r) => `<div class="bmd-prog"><div class="bmd-track"><div class="bmd-fill" style="width:${Math.min(100, num(r.progress))}%"></div></div><span>${pct(r.progress)}</span></div>` },
							{ label: t("Priority"), value: (r) => (r.priority ? t(r.priority) : "—"), cls: "muted" },
							{
								label: t("Due"),
								html: (r) =>
									r.days_left < 0
										? pill(`${-r.days_left} ${t("days late")}`, "critical")
										: r.days_left === 0
										? pill(t("Today"), "warning")
										: `<span class="muted">${esc(fmtDate(r.exp_end_date))} · ${r.days_left}${esc(t("d"))}</span>`,
							},
						],
						s.data.rows,
						(r) => ["Form", "Task", r.name]
					);
			}
		},
	};

	/* ------------------------------------------------------------------ */

	function mount(root, kind) {
		if (!root || !DEFS[kind]) return null;
		if (root.__bmd) return root.__bmd;
		root.__bmd = new Dashboard(root, kind);
		return root.__bmd;
	}

	window.benchmark_dashboards = { mount, _defs: DEFS, _ranges: { describeRange, shiftRange, PRESETS } };
})();
