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
	const t = (s) => (typeof window.__ === "function" ? window.__(s) : s);

	/* ------------------------------------------------------------------ */
	/* Styles                                                              */
	/* ------------------------------------------------------------------ */

	const CSS = `
:host { display:block; }
.bmd {
	--surface: var(--card-bg, #ffffff);
	--plane: var(--bg-color, #f7f7f8);
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
	--good-ink:#006c10; --bad-ink:#c4302f;
	--shadow: 0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06);
	--radius: 12px;
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
	--good-ink:#53c556; --bad-ink:#f07373;
	--shadow: 0 1px 2px rgba(0,0,0,.3);
}
.bmd *, .bmd *::before, .bmd *::after { box-sizing: border-box; }
.bmd button { font: inherit; color: inherit; }

/* header & filters */
.bmd-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; margin: 4px 0 16px; }
.bmd-title { display:flex; align-items:center; gap:12px; }
.bmd-badge { width:40px; height:40px; border-radius:10px; display:grid; place-items:center; color:#fff; background: linear-gradient(135deg, var(--s1), var(--s7)); box-shadow: var(--shadow); flex:none; }
.bmd-badge svg { width:20px; height:20px; }
.bmd h2 { font-size:20px; font-weight:650; margin:0; letter-spacing:-.01em; color: var(--ink); }
.bmd-sub { color: var(--ink-2); font-size:12.5px; margin-top:2px; }
.bmd-filters { display:flex; align-items:center; gap:8px; flex-wrap:wrap; max-width:100%; min-width:0; }
.bmd-select { appearance:none; -webkit-appearance:none; background: var(--surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23888' stroke-width='1.6' stroke-linecap='round' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5 6 7.5 9 4.5'/%3E%3C/svg%3E") no-repeat right 10px center; border:1px solid var(--line); border-radius:8px; height:32px; padding:0 30px 0 12px; color: var(--ink); font: inherit; font-size:12.5px; cursor:pointer; max-width: 240px; }
.bmd-seg { display:inline-flex; max-width:100%; overflow-x:auto; scrollbar-width:none; background: var(--surface); border:1px solid var(--line); border-radius:8px; padding:2px; gap:2px; }
.bmd-seg button { border:0; background:transparent; height:26px; padding:0 10px; border-radius:6px; font-size:12px; color: var(--ink-2); cursor:pointer; white-space:nowrap; }
.bmd-seg button:hover { color: var(--ink); background: var(--hover); }
.bmd-seg button[aria-pressed="true"] { background: var(--ink); color: var(--surface); font-weight:600; }
.bmd-icon-btn { width:32px; height:32px; border-radius:8px; border:1px solid var(--line); background: var(--surface); display:grid; place-items:center; cursor:pointer; color: var(--ink-2); }
.bmd-icon-btn:hover { color: var(--ink); }
.bmd-icon-btn svg { width:15px; height:15px; }
.bmd.is-loading .bmd-icon-btn svg { animation: bmd-spin .9s linear infinite; }
@keyframes bmd-spin { to { transform: rotate(360deg); } }

/* grid */
.bmd-grid { display:grid; grid-template-columns: repeat(12, minmax(0,1fr)); gap:16px; transition: opacity .2s; }
.bmd.is-loading .bmd-grid { opacity:.55; pointer-events:none; }
.c3{grid-column:span 3}.c4{grid-column:span 4}.c5{grid-column:span 5}.c6{grid-column:span 6}.c7{grid-column:span 7}.c8{grid-column:span 8}.c12{grid-column:span 12}
@container (max-width: 1080px) { .c3{grid-column:span 6} .c4,.c5{grid-column:span 6} .c7,.c8{grid-column:span 12} }
@container (max-width: 720px) { .c3,.c4,.c5,.c6,.c7,.c8{grid-column:span 12} .bmd-tiles{grid-template-columns: repeat(2, minmax(0,1fr)) !important;} .bmd-head{align-items:flex-start} }

/* cards */
.bmd-card { background: var(--surface); border:1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding:16px 18px; min-width:0; display:flex; flex-direction:column; }
.bmd-card-h { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:12px; }
.bmd-card-t { font-size:13.5px; font-weight:600; color: var(--ink); margin:0; }
.bmd-card-s { font-size:12px; color: var(--ink-2); margin-top:1px; }
.bmd-card-a { display:flex; gap:6px; align-items:center; flex:none; }
.bmd-link { font-size:12px; color: var(--ink-2); cursor:pointer; background:none; border:0; padding:2px 4px; border-radius:6px; }
.bmd-link:hover { color: var(--ink); background: var(--hover); }
.bmd-toggle { width:26px; height:26px; border-radius:6px; border:1px solid var(--line); background:transparent; display:grid; place-items:center; color: var(--ink-2); cursor:pointer; }
.bmd-toggle:hover, .bmd-toggle[aria-pressed="true"] { color: var(--ink); background: var(--hover); }
.bmd-toggle svg { width:14px; height:14px; }
.bmd-body { flex:1; min-width:0; position:relative; }

/* hero + tiles */
.bmd-hero { justify-content:space-between; position:relative; overflow:hidden; }
.bmd-hero::after { content:""; position:absolute; inset:auto -30% -60% auto; width:70%; aspect-ratio:1; background: radial-gradient(closest-side, color-mix(in srgb, var(--s1) 14%, transparent), transparent); pointer-events:none; }
.bmd-hero-label { font-size:12.5px; color: var(--ink-2); font-weight:500; display:flex; align-items:center; gap:7px; }
.bmd-hero-label svg { width:15px; height:15px; flex:none; }
.bmd-hero-value { font-size:44px; font-weight:650; letter-spacing:-.02em; line-height:1.1; margin:8px 0 6px; color: var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
@container (min-width: 1081px) { .bmd-hero-value { font-size:48px; } }
.bmd-hero-meta { display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:12px; color: var(--ink-2); }
.bmd-hero-spark { margin-top:14px; height:56px; }
.bmd-tiles { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:16px; }
.bmd-tile { padding:14px 16px; cursor:default; transition: border-color .15s, transform .15s; }
.bmd-tile[data-route] { cursor:pointer; }
.bmd-tile[data-route]:hover { border-color: color-mix(in srgb, var(--s1) 45%, var(--line)); transform: translateY(-1px); }
.bmd-tile-label { font-size:12px; color: var(--ink-2); display:flex; align-items:center; gap:7px; }
.bmd-tile-ic { width:22px; height:22px; border-radius:6px; display:grid; place-items:center; background: var(--hover); color: var(--ink-2); flex:none; }
.bmd-tile-ic svg { width:13px; height:13px; }
.bmd-tile-value { font-size:22px; font-weight:650; margin-top:8px; letter-spacing:-.01em; color: var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bmd-tile-foot { font-size:11.5px; color: var(--ink-2); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bmd-delta { display:inline-flex; align-items:center; gap:2px; font-weight:600; font-size:11.5px; padding:1px 6px; border-radius:999px; background: var(--hover); }
.bmd-delta svg { width:11px; height:11px; }
.bmd-delta.good { color: var(--good-ink); background: color-mix(in srgb, var(--good) 12%, transparent); }
.bmd-delta.bad { color: var(--bad-ink); background: color-mix(in srgb, var(--critical) 12%, transparent); }
.bmd-delta.flat { color: var(--ink-2); }

/* legend */
.bmd-legend { display:flex; flex-wrap:wrap; gap:6px 14px; font-size:12px; color: var(--ink-2); margin-bottom:8px; }
.bmd-legend span { display:inline-flex; align-items:center; gap:6px; }
.bmd-key { width:10px; height:10px; border-radius:3px; flex:none; display:inline-block; }
.bmd-key.line { height:3px; border-radius:2px; width:14px; }

/* svg charts */
.bmd svg text { font-family: inherit; }
.bmd-axis text { fill: var(--ink-2); font-size:11px; font-variant-numeric: tabular-nums; }
.bmd-gridline { stroke: var(--grid); stroke-width:1; shape-rendering: crispEdges; }
.bmd-baseline { stroke: var(--axis); stroke-width:1; shape-rendering: crispEdges; }
.bmd-hit { fill: transparent; cursor: crosshair; }
.bmd-col { transition: opacity .12s; }
.bmd-chart.is-hover .bmd-col:not(.on) { opacity:.35; }
.bmd-guide { stroke: var(--axis); stroke-width:1; opacity:0; pointer-events:none; }
.bmd-guide.on { opacity:1; }
.bmd-dot { opacity:0; transition: opacity .1s; pointer-events:none; }
.bmd-dot.on, .bmd-dot.end { opacity:1; }

/* ranked bars */
.bmd-bars { display:flex; flex-direction:column; gap:11px; }
.bmd-bar-row { display:block; border-radius:8px; padding:3px 6px; margin:-3px -6px; }
.bmd-bar-row[data-route] { cursor:pointer; }
.bmd-bar-row[data-route]:hover { background: var(--hover); }
.bmd-bar-top { display:flex; justify-content:space-between; gap:12px; font-size:12.5px; margin-bottom:5px; }
.bmd-bar-label { color: var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.bmd-bar-val { color: var(--ink); font-weight:600; font-variant-numeric: tabular-nums; white-space:nowrap; }
.bmd-bar-val small { color: var(--ink-2); font-weight:400; margin-left:4px; }
.bmd-track { height:8px; border-radius:999px; background: var(--hover); overflow:hidden; }
.bmd-fill { height:100%; border-radius:999px; background: var(--s1); transform-origin: left; animation: bmd-grow .6s cubic-bezier(.2,.7,.2,1) both; }
.bmd-pair .bmd-track { height:6px; }
.bmd-pair .bmd-track + .bmd-track { margin-top:3px; }
@keyframes bmd-grow { from { transform: scaleX(0); } }

/* funnel */
.bmd-funnel { display:flex; flex-direction:column; gap:4px; }
.bmd-fstage { display:grid; grid-template-columns: minmax(92px, 34%) 1fr auto; align-items:center; gap:10px; font-size:12.5px; }
.bmd-fstage[data-route] { cursor:pointer; }
.bmd-fstage[data-route]:hover .bmd-flabel { color: var(--s1); }
.bmd-flabel { color: var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bmd-fbar { height:24px; border-radius:4px; min-width:3px; animation: bmd-grow .6s cubic-bezier(.2,.7,.2,1) both; }
.bmd-fval { font-weight:600; font-variant-numeric: tabular-nums; min-width:36px; text-align:right; }
.bmd-fconv { display:grid; grid-template-columns: minmax(92px, 34%) 1fr; gap:10px; font-size:11px; color: var(--ink-2); }
.bmd-fconv span:last-child { display:flex; align-items:center; gap:4px; }
.bmd-fconv svg { width:11px; height:11px; }

/* segmented bar */
.bmd-segbar { display:flex; gap:2px; height:28px; border-radius:6px; overflow:hidden; }
.bmd-segbar > div { height:100%; display:flex; align-items:center; padding-left:8px; font-size:11.5px; font-weight:600; color:#fff; min-width:0; overflow:hidden; white-space:nowrap; }
.bmd-segbar > div.dark-ink { color:#0b0b0b; }
.bmd-segbar > div:first-child { border-radius:4px 0 0 4px; }
.bmd-segbar > div:last-child { border-radius:0 4px 4px 0; }
.bmd-segbar > div:only-child { border-radius:4px; }
.bmd-seglegend { display:grid; grid-template-columns: repeat(auto-fill, minmax(130px,1fr)); gap:8px 16px; margin-top:14px; }
.bmd-seglegend div { display:flex; align-items:center; gap:8px; font-size:12px; color: var(--ink-2); min-width:0; }
.bmd-seglegend div[data-route] { cursor:pointer; }
.bmd-seglegend div[data-route]:hover { color: var(--ink); }
.bmd-seglegend b { color: var(--ink); font-weight:600; margin-left:auto; font-variant-numeric: tabular-nums; }

/* meters & stat pairs */
.bmd-meter { margin-top:6px; }
.bmd-meter-track { height:10px; border-radius:999px; background: var(--s1-track); overflow:hidden; }
.bmd-meter-fill { height:100%; border-radius:999px; background: var(--s1); animation: bmd-grow .7s cubic-bezier(.2,.7,.2,1) both; transform-origin:left; }
.bmd-meter-top { display:flex; justify-content:space-between; font-size:12px; color: var(--ink-2); margin-bottom:6px; }
.bmd-meter-top b { color: var(--ink); font-weight:600; font-variant-numeric: tabular-nums; }
.bmd-kv { display:flex; flex-direction:column; gap:12px; }
.bmd-kv-row { display:flex; justify-content:space-between; align-items:baseline; gap:12px; font-size:12.5px; color: var(--ink-2); }
.bmd-kv-row b { color: var(--ink); font-size:15px; font-weight:650; font-variant-numeric: tabular-nums; }
.bmd-kv-row.total { border-top:1px solid var(--line); padding-top:12px; }
.bmd-kv-row.total b { font-size:18px; }
.bmd-divider { height:1px; background: var(--line); margin:16px 0; }
.bmd-mini-h { font-size:12px; font-weight:600; color: var(--ink); margin-bottom:10px; }

/* health tiles */
.bmd-health { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:8px; }
.bmd-health > div { border:1px solid var(--line); border-radius:10px; padding:10px; }
.bmd-health .hl { display:flex; align-items:center; gap:6px; font-size:11.5px; color: var(--ink-2); white-space:nowrap; }
.bmd-health .hv { font-size:22px; font-weight:650; margin-top:4px; }

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
.bmd-visit { border:1px solid var(--line); border-radius:10px; padding:12px; display:flex; gap:12px; cursor:pointer; }
.bmd-visit:hover { background: var(--hover); }
.bmd-cal { width:44px; flex:none; border-radius:8px; overflow:hidden; text-align:center; border:1px solid var(--line); background: var(--surface); }
.bmd-cal .m { background: var(--s1); color:#fff; font-size:10px; font-weight:600; text-transform:uppercase; padding:2px 0; }
.bmd-cal .d { font-size:17px; font-weight:650; padding:2px 0 3px; }
.bmd-visit .vt { font-weight:600; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bmd-visit .vs { font-size:11.5px; color: var(--ink-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* states */
.bmd-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:8px; color: var(--ink-2); font-size:12.5px; padding:28px 12px; min-height:120px; height:100%; }
.bmd-empty svg { width:28px; height:28px; opacity:.5; }
.bmd-skel { border-radius:8px; background: linear-gradient(90deg, var(--hover) 0%, color-mix(in srgb, var(--hover) 40%, var(--surface)) 50%, var(--hover) 100%); background-size:200% 100%; animation: bmd-shimmer 1.2s infinite linear; }
@keyframes bmd-shimmer { to { background-position: -200% 0; } }
.bmd-error { border:1px solid color-mix(in srgb, var(--critical) 40%, var(--line)); background: color-mix(in srgb, var(--critical) 6%, var(--surface)); color: var(--ink); border-radius: var(--radius); padding:14px 16px; margin-bottom:16px; font-size:12.5px; }

/* tooltip */
.bmd-tip { position:absolute; z-index:20; pointer-events:none; background: var(--surface); color: var(--ink); border:1px solid var(--line); border-radius:10px; box-shadow: 0 8px 24px rgba(0,0,0,.14); padding:10px 12px; font-size:12px; min-width:150px; opacity:0; transform: translateY(4px); transition: opacity .1s, transform .1s; }
.bmd-tip.on { opacity:1; transform:none; }
.bmd-tip .tt { font-weight:600; margin-bottom:6px; }
.bmd-tip .tr { display:flex; align-items:center; gap:8px; margin-top:3px; }
.bmd-tip .tr b { margin-left:auto; padding-left:14px; font-variant-numeric: tabular-nums; font-weight:600; }
.bmd-tip .tr.sep { border-top:1px solid var(--line); margin-top:6px; padding-top:6px; }

@media (prefers-reduced-motion: reduce) { .bmd * { animation:none !important; transition:none !important; } }
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
		flag: '<path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/>',
		lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
		inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6Z"/>',
		percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
		map: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
		chevdown: '<path d="m6 9 6 6 6-6"/>',
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
		const units = [
			[1e9, "B"],
			[1e6, "M"],
			[1e3, "K"],
		];
		for (const [d, u] of units) {
			if (a >= d) {
				const x = v / d;
				const fixed = Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(digits);
				return fixed.replace(/\.0+$/, "") + u;
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
		const sign = v < 0 ? "-" : "";
		return sign + symbolFor(cur) + compact(Math.abs(v));
	}

	const count = (v) => Math.round(num(v)).toLocaleString();
	const pct = (v, d = 0) => num(v).toFixed(d) + "%";

	const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	function parseDate(s) {
		if (!s) return null;
		const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
		return new Date(y, m - 1, d || 1);
	}
	function fmtDate(s, withYear) {
		const d = parseDate(s);
		if (!d) return "";
		return `${d.getDate()} ${t(MONTHS[d.getMonth()])}${withYear ? " " + d.getFullYear() : ""}`;
	}
	function monthLabel(key, withYear) {
		const [y, m] = key.split("-").map(Number);
		return t(MONTHS[m - 1]) + (withYear ? " " + String(y).slice(2) : "");
	}
	function monthLong(key) {
		const [y, m] = key.split("-").map(Number);
		return `${t(MONTHS[m - 1])} ${y}`;
	}
	const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

	function deltaInfo(cur, prev, upIsGood = true) {
		cur = num(cur);
		prev = num(prev);
		if (!prev && !cur) return null;
		if (!prev) return { text: t("new"), cls: "flat", dir: 0 };
		const ch = ((cur - prev) / Math.abs(prev)) * 100;
		if (Math.abs(ch) < 0.5) return { text: "0%", cls: "flat", dir: 0 };
		const dir = ch > 0 ? 1 : -1;
		const good = upIsGood ? dir > 0 : dir < 0;
		return { text: (Math.abs(ch) >= 1000 ? ">999" : Math.abs(ch).toFixed(0)) + "%", cls: good ? "good" : "bad", dir };
	}
	function deltaHtml(cur, prev, upIsGood) {
		const d = deltaInfo(cur, prev, upIsGood);
		if (!d) return "";
		const ic = d.dir > 0 ? icon("up") : d.dir < 0 ? icon("down") : "";
		const word = d.dir > 0 ? t("up") : d.dir < 0 ? t("down") : t("unchanged");
		return `<span class="bmd-delta ${d.cls}" title="${esc(word + " " + d.text + " " + t("vs previous period"))}">${ic}${esc(d.text)}</span>`;
	}

	/* ------------------------------------------------------------------ */
	/* Periods                                                             */
	/* ------------------------------------------------------------------ */

	const PERIODS = [
		{ key: "month", label: "This month" },
		{ key: "last_month", label: "Last month" },
		{ key: "quarter", label: "This quarter" },
		{ key: "year", label: "This year" },
		{ key: "12m", label: "Last 12 months" },
	];
	function periodRange(key) {
		const now = new Date();
		const y = now.getFullYear();
		const m = now.getMonth();
		switch (key) {
			case "last_month":
				return [new Date(y, m - 1, 1), new Date(y, m, 0)];
			case "quarter":
				return [new Date(y, Math.floor(m / 3) * 3, 1), now];
			case "year":
				return [new Date(y, 0, 1), now];
			case "12m":
				return [new Date(y, m - 11, 1), now];
			default:
				return [new Date(y, m, 1), now];
		}
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

	function tipHtml(title, rows) {
		return (
			`<div class="tt">${esc(title)}</div>` +
			rows
				.map(
					(r) =>
						`<div class="tr${r.sep ? " sep" : ""}">${r.color ? `<span class="bmd-key" style="background:${r.color}"></span>` : ""}<span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`
				)
				.join("")
		);
	}

	function legendHtml(series, kind = "box") {
		return `<div class="bmd-legend">${series
			.map((s) => `<span><i class="bmd-key ${kind === "line" ? "line" : ""}" style="background:${s.color}"></i>${esc(s.name)}</span>`)
			.join("")}</div>`;
	}

	/**
	 * Time-series chart: grouped columns ("column") or lines with a soft area wash ("line").
	 * opts: {months, series:[{name,color,values}], format, height, mode, extraTip(i)}
	 */
	function timeChart(host, opts, ctx) {
		const W = Math.max(280, host.clientWidth || 600);
		const H = opts.height || 250;
		const months = opts.months;
		const n = months.length;
		const all = opts.series.flatMap((s) => s.values.map(num));
		const lo = Math.min(0, ...all);
		const hi = Math.max(0, ...all);
		const ticks = niceTicks(lo, hi === lo ? lo + 1 : hi, 4);
		const yMin = ticks[0];
		const yMax = ticks[ticks.length - 1];
		const tickLabels = ticks.map((v) => opts.format(v, true));
		const ml = Math.max(...tickLabels.map((s) => s.length)) * 6.4 + 14;
		const mr = 8;
		const mt = 10;
		const mb = 26;
		const iw = W - ml - mr;
		const ih = H - mt - mb;
		const y = (v) => mt + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
		const band = iw / n;
		const xc = (i) => ml + band * i + band / 2;
		const base = y(0);
		let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "")}">`;
		svg += `<g class="bmd-axis">`;
		ticks.forEach((v, i) => {
			const yy = Math.round(y(v)) + 0.5;
			if (v !== 0) svg += `<line class="bmd-gridline" x1="${ml}" x2="${W - mr}" y1="${yy}" y2="${yy}"/>`;
			svg += `<text x="${ml - 8}" y="${yy + 4}" text-anchor="end">${esc(tickLabels[i])}</text>`;
		});
		const every = band < 34 ? (band < 20 ? 3 : 2) : 1;
		months.forEach((m, i) => {
			if ((n - 1 - i) % every) return;
			const first = i === 0 || m.endsWith("-01");
			svg += `<text x="${xc(i)}" y="${H - 8}" text-anchor="middle">${esc(monthLabel(m, first))}</text>`;
		});
		svg += `</g>`;

		if (opts.mode === "line") {
			opts.series.forEach((s, si) => {
				const pts = s.values.map((v, i) => [xc(i), y(num(v))]);
				const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join("");
				if (si === 0) svg += `<path d="${d}L${pts[n - 1][0].toFixed(1)},${base}L${pts[0][0].toFixed(1)},${base}Z" fill="${s.color}" opacity=".1"/>`;
				svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
			});
			svg += `<line class="bmd-guide" x1="0" x2="0" y1="${mt}" y2="${mt + ih}"/>`;
			opts.series.forEach((s, si) => {
				s.values.forEach((v, i) => {
					svg += `<circle class="bmd-dot${i === n - 1 ? " end" : ""}" data-i="${i}" cx="${xc(i)}" cy="${y(num(v))}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`;
				});
			});
		} else {
			const k = opts.series.length;
			const bw = Math.max(3, Math.min(24, (band * 0.72 - (k - 1) * 2) / k));
			const gw = bw * k + (k - 1) * 2;
			for (let i = 0; i < n; i++) {
				svg += `<g class="bmd-col" data-i="${i}">`;
				opts.series.forEach((s, si) => {
					const v = num(s.values[i]);
					if (!v) return;
					const x = xc(i) - gw / 2 + si * (bw + 2);
					svg += `<path d="${barPath(x, base, y(v), bw)}" fill="${s.color}"/>`;
				});
				svg += `</g>`;
			}
		}
		svg += `<line class="bmd-baseline" x1="${ml}" x2="${W - mr}" y1="${Math.round(base) + 0.5}" y2="${Math.round(base) + 0.5}"/>`;
		for (let i = 0; i < n; i++)
			svg += `<rect class="bmd-hit" data-i="${i}" x="${ml + band * i}" y="${mt}" width="${band}" height="${ih}"/>`;
		svg += `</svg>`;

		host.innerHTML = `<div class="bmd-chart">${svg}</div>`;
		const chart = host.firstElementChild;
		const guide = chart.querySelector(".bmd-guide");
		const setOn = (i) => {
			chart.classList.toggle("is-hover", i != null);
			chart.querySelectorAll("[data-i]").forEach((el) => {
				if (!el.classList.contains("bmd-hit")) el.classList.toggle("on", i != null && +el.dataset.i === i);
			});
			if (guide) {
				guide.classList.toggle("on", i != null);
				if (i != null) guide.setAttribute("x1", xc(i)), guide.setAttribute("x2", xc(i));
			}
		};
		chart.querySelectorAll(".bmd-hit").forEach((hit) => {
			const i = +hit.dataset.i;
			hit.addEventListener("mouseenter", (e) => {
				setOn(i);
				const rows = opts.series.map((s) => ({ label: s.name, value: opts.format(s.values[i]), color: s.color }));
				if (opts.extraTip) rows.push(...opts.extraTip(i));
				ctx.tip.show(tipHtml(monthLong(months[i]), rows), e);
			});
			hit.addEventListener("mousemove", (e) => ctx.tip.move(e));
			hit.addEventListener("mouseleave", () => {
				setOn(null);
				ctx.tip.hide();
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
		const labels = ticks.map((v) => opts.format(v, true));
		const ml = Math.max(...labels.map((s) => s.length)) * 6.4 + 14;
		const mt = 18;
		const mb = 26;
		const iw = W - ml - 6;
		const ih = H - mt - mb;
		const y = (v) => mt + ih - (v / yMax) * ih;
		const band = iw / opts.items.length;
		const bw = Math.min(40, band * 0.62);
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
			if (v) svg += `<path d="${barPath(x, y(0), y(v), bw)}" fill="${opts.colors[i % opts.colors.length]}"/>`;
			if (v)
				svg += `<text x="${x + bw / 2}" y="${y(v) - 6}" text-anchor="middle" style="fill:var(--ink);font-size:11px;font-weight:600">${esc(opts.format(v, true))}</text>`;
			svg += `</g>`;
		});
		svg += `<line class="bmd-baseline" x1="${ml}" x2="${W - 6}" y1="${Math.round(y(0)) + 0.5}" y2="${Math.round(y(0)) + 0.5}"/>`;
		opts.items.forEach((d, i) => {
			svg += `<rect class="bmd-hit" data-i="${i}" x="${ml + band * i}" y="${mt}" width="${band}" height="${ih}"/>`;
		});
		svg += `</svg>`;
		host.innerHTML = `<div class="bmd-chart">${svg}</div>`;
		const chart = host.firstElementChild;
		chart.querySelectorAll(".bmd-hit").forEach((hit) => {
			const i = +hit.dataset.i;
			hit.addEventListener("mouseenter", (e) => {
				chart.classList.add("is-hover");
				chart.querySelectorAll(".bmd-col").forEach((g) => g.classList.toggle("on", +g.dataset.i === i));
				const d = opts.items[i];
				ctx.tip.show(tipHtml(d.label, [{ label: opts.valueLabel || t("Amount"), value: opts.format(d.value) }]), e);
			});
			hit.addEventListener("mousemove", (e) => ctx.tip.move(e));
			hit.addEventListener("mouseleave", () => {
				chart.classList.remove("is-hover");
				ctx.tip.hide();
			});
		});
	}

	function sparkline(host, values, color) {
		const W = Math.max(120, host.clientWidth || 240);
		const H = host.clientHeight || 56;
		const v = values.map(num);
		const lo = Math.min(...v);
		const hi = Math.max(...v);
		const y = (x) => 4 + (H - 8) - ((x - lo) / (hi - lo || 1)) * (H - 8);
		const x = (i) => 4 + (i * (W - 8)) / Math.max(1, v.length - 1);
		const d = v.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(p).toFixed(1)).join("");
		const last = v.length - 1;
		host.innerHTML = `<svg width="${W}" height="${H}" aria-hidden="true">
			<path d="${d}L${x(last)},${H}L${x(0)},${H}Z" fill="${color}" opacity=".08"/>
			<path d="${d}" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
			<circle cx="${x(last)}" cy="${y(v[last])}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="2"/></svg>`;
	}

	/* ------------------------------------------------------------------ */
	/* HTML components                                                     */
	/* ------------------------------------------------------------------ */

	function bars(items, o) {
		const max = Math.max(1, ...items.map((d) => num(d.value)));
		const total = items.reduce((a, d) => a + num(d.value), 0) || 1;
		return `<div class="bmd-bars">${items
			.map(
				(d, i) => `<div class="bmd-bar-row" ${o.route && o.route(d) ? `data-route='${esc(JSON.stringify(o.route(d)))}'` : ""}>
				<div class="bmd-bar-top"><span class="bmd-bar-label" title="${esc(d.label)}">${esc(d.label)}</span>
				<span class="bmd-bar-val">${esc(o.format(d.value))}${o.share ? `<small>${pct((num(d.value) / total) * 100)}</small>` : ""}</span></div>
				<div class="bmd-track"><div class="bmd-fill" style="width:${Math.max(0.5, (num(d.value) / max) * 100)}%;background:${o.color || "var(--s1)"};animation-delay:${i * 40}ms"></div></div>
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
				.map((d) => {
					const over = num(d.b) > num(d.a) && num(d.a) > 0;
					const used = num(d.a) ? (num(d.b) / num(d.a)) * 100 : 0;
					return `<div class="bmd-bar-row" ${d.route ? `data-route='${esc(JSON.stringify(d.route))}'` : ""}>
					<div class="bmd-bar-top"><span class="bmd-bar-label" title="${esc(d.label)}">${esc(d.label)}</span>
					<span class="bmd-bar-val">${esc(o.format(d.b))} <small>/ ${esc(o.format(d.a))}</small>
					${num(d.a) ? `<span class="bmd-pill" style="margin-left:8px">${over ? `<span style="color:var(--critical)">${icon("alert")}</span>` : ""}${pct(used)}</span>` : ""}</span></div>
					<div class="bmd-track"><div class="bmd-fill" style="width:${(num(d.a) / max) * 100}%;background:var(--s1)"></div></div>
					<div class="bmd-track"><div class="bmd-fill" style="width:${(num(d.b) / max) * 100}%;background:var(--s2)"></div></div>
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
			.map((d) => {
				const share = (num(d.value) / total) * 100;
				const label = share >= 12 ? pct(share) : "";
				return `<div class="${d.darkInk ? "dark-ink" : ""}" style="flex:${num(d.value)} 1 0;background:${d.color}" title="${esc(d.label + ": " + o.format(d.value) + " (" + pct(share) + ")")}">${label}</div>`;
			})
			.join("");
		const legend = items
			.map(
				(d) =>
					`<div ${d.route ? `data-route='${esc(JSON.stringify(d.route))}'` : ""}><i class="bmd-key" style="background:${d.color}"></i><span>${esc(d.label)}</span><b>${esc(o.format(d.value))}</b></div>`
			)
			.join("");
		return `<div class="bmd-segbar" role="img" aria-label="${esc(items.map((d) => d.label + " " + o.format(d.value)).join(", "))}">${segs}</div><div class="bmd-seglegend">${legend}</div>`;
	}

	function funnel(stages) {
		const max = Math.max(1, ...stages.map((s) => num(s.value)));
		const ramp = ["var(--ramp-1)", "var(--ramp-2)", "var(--ramp-3)", "var(--ramp-4)", "var(--ramp-5)"];
		let html = `<div class="bmd-funnel">`;
		stages.forEach((s, i) => {
			if (i) {
				const prev = num(stages[i - 1].value);
				const conv = prev ? (num(s.value) / prev) * 100 : 0;
				html += `<div class="bmd-fconv"><span></span><span>${prev && conv <= 100 ? icon("chevdown") + pct(conv) + " " + t("of previous stage") : ""}</span></div>`;
			}
			html += `<div class="bmd-fstage" ${s.route ? `data-route='${esc(JSON.stringify(s.route))}'` : ""}>
				<span class="bmd-flabel">${esc(s.label)}</span>
				<div><div class="bmd-fbar" style="width:${(num(s.value) / max) * 100}%;background:${ramp[i % ramp.length]};animation-delay:${i * 60}ms"></div></div>
				<span class="bmd-fval">${count(s.value)}</span></div>`;
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

	function table(cols, rows, routeFn) {
		return `<div class="bmd-table-wrap"><table class="bmd-table"><thead><tr>${cols
			.map((c) => `<th class="${c.num ? "num" : ""}">${esc(c.label)}</th>`)
			.join("")}</tr></thead><tbody>${rows
			.map((r) => {
				const route = routeFn && routeFn(r);
				return `<tr ${route ? `data-route='${esc(JSON.stringify(route))}'` : ""}>${cols
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

	/* ------------------------------------------------------------------ */
	/* Dashboard shell                                                     */
	/* ------------------------------------------------------------------ */

	class Dashboard {
		constructor(root, kind) {
			this.root = root;
			this.kind = kind;
			this.def = DEFS[kind];
			this.charts = [];
			this.period = store.get(kind + ":period") || "month";
			this.company = store.get("company") || null;
			this.build();
		}

		build() {
			const host = this.root.querySelector(".bm-dashboard-root") || this.root;
			const style = document.createElement("style");
			style.textContent = CSS;
			this.root.appendChild(style);

			this.el = document.createElement("div");
			this.el.className = "bmd is-loading";
			this.el.innerHTML = `
				<div class="bmd-head">
					<div class="bmd-title"><div class="bmd-badge">${icon(this.def.icon)}</div>
						<div><h2>${esc(t(this.def.title))}</h2><div class="bmd-sub" data-sub>${esc(t(this.def.subtitle))}</div></div></div>
					<div class="bmd-filters">
						<select class="bmd-select" data-company aria-label="${esc(t("Company"))}"></select>
						<div class="bmd-seg" role="group" aria-label="${esc(t("Period"))}">${PERIODS.map(
							(p) => `<button type="button" data-period="${p.key}" aria-pressed="${p.key === this.period}">${esc(t(p.label))}</button>`
						).join("")}</div>
						<button type="button" class="bmd-icon-btn" data-refresh title="${esc(t("Refresh"))}" aria-label="${esc(t("Refresh"))}">${icon("refresh")}</button>
					</div>
				</div>
				<div data-error></div>
				<div class="bmd-grid">${this.def.skeleton}</div>
				<div class="bmd-tip" role="tooltip"></div>`;
			host.appendChild(this.el);
			this.grid = this.el.querySelector(".bmd-grid");
			this.tipEl = this.el.querySelector(".bmd-tip");
			this.tip = this.makeTip();

			this.syncTheme();
			this.themeObserver = new MutationObserver(() => this.syncTheme());
			this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

			this.el.querySelectorAll("[data-period]").forEach((b) =>
				b.addEventListener("click", () => {
					this.period = b.dataset.period;
					store.set(this.kind + ":period", this.period);
					this.el.querySelectorAll("[data-period]").forEach((x) => x.setAttribute("aria-pressed", x === b));
					this.load();
				})
			);
			this.el.querySelector("[data-refresh]").addEventListener("click", () => this.load());
			this.el.querySelector("[data-company]").addEventListener("change", (e) => {
				this.company = e.target.value;
				store.set("company", this.company);
				this.load();
			});
			this.el.addEventListener("click", (e) => this.onClick(e));

			let lastW = 0;
			let timer = null;
			this.resizeObserver = new ResizeObserver(() => {
				const w = this.el.clientWidth;
				if (Math.abs(w - lastW) < 4) return;
				lastW = w;
				clearTimeout(timer);
				timer = setTimeout(() => this.drawCharts(), 120);
			});
			this.resizeObserver.observe(this.el);

			this.init();
		}

		syncTheme() {
			const theme = document.documentElement.getAttribute("data-theme");
			const dark =
				theme === "dark" || (!theme && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
			this.el.setAttribute("data-theme", dark ? "dark" : "light");
		}

		makeTip() {
			const el = this.tipEl;
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
			} catch (e) {
				/* company list is optional; the API falls back to the default company */
			}
			this.load();
		}

		call(method, args) {
			if (window.frappe && frappe.xcall) return frappe.xcall(API + method, args || {});
			return Promise.reject(new Error("frappe.xcall unavailable"));
		}

		async load() {
			const [from, to] = periodRange(this.period);
			this.el.classList.add("is-loading");
			const token = (this.token = {});
			try {
				const data = await this.call(this.def.method, { company: this.company, from_date: iso(from), to_date: iso(to) });
				if (token !== this.token) return;
				this.data = data;
				this.cur = (data.filters && data.filters.currency) || "";
				const f = data.filters || {};
				this.el.querySelector("[data-sub]").textContent = `${f.company || ""} · ${fmtDate(f.from_date, true)} – ${fmtDate(f.to_date, true)}`;
				this.el.querySelector("[data-error]").innerHTML = "";
				this.render();
			} catch (e) {
				if (token !== this.token) return;
				this.el.querySelector("[data-error]").innerHTML = `<div class="bmd-error"><b>${esc(t("Couldn't load the dashboard."))}</b> ${esc(
					(e && e.message) || ""
				)}</div>`;
			} finally {
				if (token === this.token) this.el.classList.remove("is-loading");
			}
		}

		render() {
			this.charts = [];
			this.grid.innerHTML = "";
			this.def.render(this);
			this.drawCharts();
		}

		drawCharts() {
			this.charts.forEach((c) => {
				if (c.host.isConnected && c.host.offsetParent !== null) c.draw();
			});
		}

		onClick(e) {
			const tgl = e.target.closest("[data-view-toggle]");
			if (tgl) {
				const card = tgl.closest(".bmd-card");
				const showTable = tgl.getAttribute("aria-pressed") !== "true";
				tgl.setAttribute("aria-pressed", showTable);
				tgl.innerHTML = icon(showTable ? "chart" : "table");
				tgl.title = showTable ? t("Show chart") : t("Show table");
				card.querySelector("[data-view=chart]").style.display = showTable ? "none" : "";
				card.querySelector("[data-view=table]").style.display = showTable ? "" : "none";
				if (!showTable) this.drawCharts();
				return;
			}
			const el = e.target.closest("[data-route]");
			if (!el || !window.frappe || !frappe.set_route) return;
			try {
				const route = JSON.parse(el.dataset.route);
				frappe.set_route(...route);
			} catch (err) {
				/* ignore */
			}
		}

		/* -- builders used by the definitions -- */

		card(span, title, o = {}) {
			const card = document.createElement("section");
			card.className = `bmd-card ${span} ${o.cls || ""}`;
			const actions = [];
			if (o.link) actions.push(`<button type="button" class="bmd-link" data-route='${esc(JSON.stringify(o.link.route))}'>${esc(o.link.label)} →</button>`);
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
			return { state: "ok", data: s };
		}

		chart(host, draw) {
			this.charts.push({ host, draw: () => draw(host) });
		}

		money(v, full) {
			return money(v, this.cur, full);
		}

		hero(span, o) {
			const { card, body } = this.card(span, null, { cls: "bmd-hero" });
			body.innerHTML = `<div class="bmd-hero-label">${icon(o.icon)}${esc(o.label)}</div>
				<div class="bmd-hero-value" title="${esc(o.title || o.value)}">${esc(o.value)}</div>
				<div class="bmd-hero-meta">${o.meta || ""}</div>
				${o.extra || ""}
				${o.spark ? `<div class="bmd-hero-spark"></div>` : ""}`;
			if (o.spark) {
				const sp = body.querySelector(".bmd-hero-spark");
				this.chart(sp, (h) => sparkline(h, o.spark, o.sparkColor || "var(--s1)"));
			}
			return card;
		}

		tiles(span, list) {
			const wrap = document.createElement("div");
			wrap.className = `bmd-tiles ${span}`;
			wrap.innerHTML = list
				.map(
					(x) => `<div class="bmd-card bmd-tile" ${x.route ? `data-route='${esc(JSON.stringify(x.route))}'` : ""}>
					<div class="bmd-tile-label"><span class="bmd-tile-ic">${icon(x.icon)}</span>${esc(x.label)}</div>
					<div class="bmd-tile-value" title="${esc(x.title || x.value)}">${esc(x.value)}</div>
					<div class="bmd-tile-foot">${x.foot || "&nbsp;"}</div></div>`
				)
				.join("");
			this.grid.appendChild(wrap);
		}
	}

	const skel = (span, h) => `<div class="bmd-card ${span}"><div class="bmd-skel" style="height:${h}px"></div></div>`;
	const SKELETON =
		skel("c4", 190) +
		`<div class="bmd-tiles c8">${Array(6).fill(`<div class="bmd-card"><div class="bmd-skel" style="height:62px"></div></div>`).join("")}</div>` +
		skel("c8", 300) +
		skel("c4", 300) +
		skel("c4", 240) +
		skel("c4", 240) +
		skel("c4", 240);

	/* ------------------------------------------------------------------ */
	/* Dashboard definitions                                               */
	/* ------------------------------------------------------------------ */

	const vsPrev = (cur, prev, upGood) => {
		const d = deltaHtml(cur, prev, upGood);
		return d ? `${d} <span>${esc(t("vs previous period"))}</span>` : `<span>${esc(t("No prior data"))}</span>`;
	};

	const DEFS = {};

	/* ---------------------------- Accounting --------------------------- */
	DEFS.accounting = {
		title: "Accounting",
		subtitle: "Profitability, cash and receivables",
		icon: "bank",
		method: "get_accounting_dashboard",
		skeleton: SKELETON,
		render(d) {
			const k = d.section("kpis");
			const tr = d.section("trend");
			const company = d.data.filters.company;

			if (k.state === "ok") {
				const x = k.data;
				const margin = x.income ? (x.net_profit / x.income) * 100 : 0;
				let spark = null;
				if (tr.state === "ok") spark = tr.data.series[0].values.map((v, i) => num(v) - num(tr.data.series[1].values[i]));
				d.hero("c4", {
					icon: "wallet",
					label: t("Net profit"),
					value: d.money(x.net_profit),
					title: d.money(x.net_profit, true),
					meta: `${vsPrev(x.net_profit, x.prev_net_profit, true)}`,
					extra: `<div class="bmd-hero-meta" style="margin-top:6px"><span>${esc(t("Net margin"))} <b style="color:var(--ink)">${pct(margin, 1)}</b></span></div>`,
					spark,
				});
				d.tiles("c8", [
					{ icon: "arrowin", label: t("Income"), value: d.money(x.income), title: d.money(x.income, true), foot: vsPrev(x.income, x.prev_income, true), route: ["query-report", "Profit and Loss Statement", { company }] },
					{ icon: "arrowout", label: t("Expenses"), value: d.money(x.expense), title: d.money(x.expense, true), foot: vsPrev(x.expense, x.prev_expense, false), route: ["query-report", "Profit and Loss Statement", { company }] },
					{ icon: "bank", label: t("Cash & bank"), value: d.money(x.cash), title: d.money(x.cash, true), foot: esc(t("Balance at period end")), route: ["query-report", "General Ledger", { company }] },
					{ icon: "receipt", label: t("Receivables"), value: d.money(x.receivable), title: d.money(x.receivable, true), foot: esc(t("Outstanding from customers")), route: ["query-report", "Accounts Receivable", { company }] },
					{ icon: "alert", label: t("Overdue receivables"), value: d.money(x.overdue_receivable), title: d.money(x.overdue_receivable, true), foot: x.receivable ? `${pct((x.overdue_receivable / x.receivable) * 100)} ${esc(t("of receivables"))}` : "", route: ["List", "Sales Invoice", { company, status: "Overdue" }] },
					{ icon: "file", label: t("Payables"), value: d.money(x.payable), title: d.money(x.payable, true), foot: esc(t("Owed to suppliers")), route: ["query-report", "Accounts Payable", { company }] },
				]);
			} else {
				d.card("c12", t("Key figures")).body.innerHTML = k.state === "denied" ? denied() : empty();
			}

			// Income vs expense trend
			{
				const series = tr.state === "ok" ? tr.data.series : [];
				const months = tr.state === "ok" ? tr.data.months : [];
				const tbl =
					tr.state === "ok"
						? table(
								[
									{ label: t("Month"), value: (r) => monthLong(r.m) },
									{ label: t("Income"), num: 1, value: (r) => d.money(r.a, true) },
									{ label: t("Expense"), num: 1, value: (r) => d.money(r.b, true) },
									{ label: t("Net"), num: 1, cls: "strong", value: (r) => d.money(r.a - r.b, true) },
								],
								months.map((m, i) => ({ m, a: num(series[0].values[i]), b: num(series[1].values[i]) })).reverse()
						  )
						: "";
				const { body } = d.card("c8", t("Income vs expenses"), { sub: t("Last 12 months, from the general ledger"), table: tbl || undefined });
				if (tr.state !== "ok") body.innerHTML = tr.state === "denied" ? denied() : empty();
				else if (!series.some((s) => s.values.some((v) => num(v)))) body.innerHTML = empty(t("No ledger postings in the last 12 months"));
				else {
					const colored = [
						{ name: series[0].name, color: "var(--s1)", values: series[0].values },
						{ name: series[1].name, color: "var(--s2)", values: series[1].values },
					];
					body.innerHTML = legendHtml(colored) + `<div data-plot></div>`;
					d.chart(body.querySelector("[data-plot]"), (h) =>
						timeChart(
							h,
							{
								months,
								series: colored,
								label: t("Income vs expenses"),
								format: (v) => d.money(v),
								height: 260,
								extraTip: (i) => [{ label: t("Net"), value: d.money(num(series[0].values[i]) - num(series[1].values[i])), sep: true }],
							},
							d
						)
					);
				}
			}

			// Expense breakdown
			{
				const s = d.section("expense_breakdown");
				const { body } = d.card("c4", t("Where the money went"), { sub: t("Top expense accounts this period") });
				if (s.state === "denied") body.innerHTML = denied();
				else if (s.state !== "ok" || !s.data.items.length) body.innerHTML = empty(t("No expenses booked this period"));
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
				const tbl = items.length ? table([{ label: t("Age"), value: (r) => r.label }, { label: t("Outstanding"), num: 1, value: (r) => d.money(r.value, true) }], items) : "";
				const { body } = d.card("c4", t("Receivables aging"), { sub: t("Outstanding by days past due"), table: tbl || undefined, link: { label: t("Report"), route: ["query-report", "Accounts Receivable", { company }] } });
				if (s.state === "denied") body.innerHTML = denied();
				else if (!items.some((b) => num(b.value))) body.innerHTML = empty(t("Nothing outstanding"));
				else
					d.chart(body, (h) =>
						categoryColumns(
							h,
							{
								items,
								colors: ["var(--ramp-1)", "var(--ramp-2)", "var(--ramp-3)", "var(--ramp-4)", "var(--ramp-5)"],
								format: (v) => d.money(v),
								valueLabel: t("Outstanding"),
								label: t("Receivables aging"),
							},
							d
						)
					);
			}

			// Top debtors
			{
				const s = d.section("top_debtors");
				const { body } = d.card("c4", t("Top debtors"), { sub: t("Customers with the most outstanding") });
				if (s.state === "denied") body.innerHTML = denied();
				else if (s.state !== "ok" || !s.data.items.length) body.innerHTML = empty(t("No outstanding invoices"));
				else
					body.innerHTML = bars(s.data.items, {
						format: (v) => d.money(v),
						route: (x) => ["List", "Sales Invoice", { customer: x.customer, docstatus: 1, outstanding_amount: [">", 0] }],
					});
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
						<div class="bmd-kv-row"><span>${esc(t("Output VAT (sales)"))}</span><b>${esc(d.money(x.output_tax))}</b></div>
						<div class="bmd-kv-row"><span>${esc(t("Input VAT (purchases)"))}</span><b>${esc(d.money(x.input_tax))}</b></div>
						<div class="bmd-kv-row total"><span>${esc(x.net >= 0 ? t("Net VAT payable") : t("Net VAT refundable"))}</span><b>${esc(d.money(Math.abs(x.net)))}</b></div></div>`;
				} else html += tax.state === "denied" ? denied() : "";
				if (ee.state === "ok") {
					const x = ee.data;
					const total = num(x.paid) + num(x.unpaid);
					html += `<div class="bmd-divider"></div><div class="bmd-mini-h">${esc(t("Expense entries"))}</div>`;
					html += total
						? meter(t("Paid"), x.paid, total, { text: `${d.money(x.paid)} / ${d.money(total)}` }) +
						  `<div class="bmd-card-s" style="margin-top:8px">${x.unpaid_count ? `${pill(`${count(x.unpaid_count)} ${t("unpaid")} · ${d.money(x.unpaid)}`, "warning")}` : pill(t("All paid"), "good")}</div>`
						: `<div class="bmd-card-s">${esc(t("No expense entries this period"))}</div>`;
				}
				body.innerHTML = html || empty();
			}

			// Overdue invoices
			{
				const s = d.section("overdue_invoices");
				const { body } = d.card("c7", t("Overdue invoices"), { sub: t("Oldest first"), link: { label: t("View all"), route: ["List", "Sales Invoice", { company, status: "Overdue" }] } });
				if (s.state === "denied") body.innerHTML = denied();
				else if (s.state !== "ok" || !s.data.rows.length) body.innerHTML = empty(t("No overdue invoices. Nice."));
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
				if (s.state === "denied") body.innerHTML = denied();
				else if (s.state !== "ok" || !s.data.rows.length) body.innerHTML = empty(t("No payments yet"));
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
		render(d) {
			const k = d.section("kpis");
			const tr = d.section("trend");
			const company = d.data.filters.company;
			const f = d.data.filters;

			if (k.state === "ok") {
				const x = k.data;
				d.hero("c4", {
					icon: "receipt",
					label: t("Sales invoiced"),
					value: d.money(x.sales),
					title: d.money(x.sales, true),
					meta: vsPrev(x.sales, x.prev_sales, true),
					extra: `<div class="bmd-hero-meta" style="margin-top:6px"><span>${count(x.invoices)} ${esc(t("invoices"))} · ${esc(t("avg"))} <b style="color:var(--ink)">${esc(d.money(x.avg_invoice))}</b></span></div>`,
					spark: tr.state === "ok" ? tr.data.series[0].values : null,
				});
				d.tiles("c8", [
					{ icon: "file", label: t("Quoted value"), value: d.money(x.quoted), title: d.money(x.quoted, true), foot: vsPrev(x.quoted, x.prev_quoted, true), route: ["List", "Quotation", { company, docstatus: 1 }] },
					{ icon: "inbox", label: t("Quotations sent"), value: count(x.quotations), foot: `${count(x.won)} ${esc(t("won"))} · ${count(x.lost)} ${esc(t("lost"))}`, route: ["List", "Quotation", { company, docstatus: 1 }] },
					{ icon: "percent", label: t("Win rate"), value: pct(x.win_rate), foot: esc(t("Quotations ordered")), route: ["List", "Quotation", { company, status: "Ordered" }] },
					{ icon: "users", label: t("New leads"), value: count(x.leads), foot: vsPrev(x.leads, x.prev_leads, true), route: ["List", "Lead", {}] },
					{ icon: "cart", label: t("Average invoice"), value: d.money(x.avg_invoice), title: d.money(x.avg_invoice, true), foot: esc(t("Net of taxes")) },
					{ icon: "receipt", label: t("Invoices"), value: count(x.invoices), foot: esc(t("Submitted this period")), route: ["List", "Sales Invoice", { company, docstatus: 1 }] },
				]);
			} else d.card("c12", t("Key figures")).body.innerHTML = k.state === "denied" ? denied() : empty();

			// Trend
			{
				const series = tr.state === "ok" ? tr.data.series : [];
				const months = tr.state === "ok" ? tr.data.months : [];
				const tbl =
					tr.state === "ok"
						? table(
								[
									{ label: t("Month"), value: (r) => monthLong(r.m) },
									{ label: series[0].name, num: 1, value: (r) => d.money(r.a, true) },
									{ label: series[1].name, num: 1, value: (r) => d.money(r.b, true) },
								],
								months.map((m, i) => ({ m, a: num(series[0].values[i]), b: num(series[1].values[i]) })).reverse()
						  )
						: "";
				const { body } = d.card("c8", t("Sales trend"), { sub: t("Invoiced vs quoted, last 12 months (net of taxes)"), table: tbl || undefined });
				if (tr.state !== "ok") body.innerHTML = tr.state === "denied" ? denied() : empty();
				else if (!series.some((s) => s.values.some((v) => num(v)))) body.innerHTML = empty(t("No sales in the last 12 months"));
				else {
					const colored = [
						{ name: series[0].name, color: "var(--s1)", values: series[0].values },
						{ name: series[1].name, color: "var(--s2)", values: series[1].values },
					];
					body.innerHTML = legendHtml(colored, "line") + `<div data-plot></div>`;
					d.chart(body.querySelector("[data-plot]"), (h) =>
						timeChart(h, { months, series: colored, mode: "line", label: t("Sales trend"), format: (v) => d.money(v), height: 260 }, d)
					);
				}
			}

			// Funnel
			{
				const s = d.section("funnel");
				const { body } = d.card("c4", t("Pipeline funnel"), { sub: t("Lead → site visit → BOQ → quotation → won") });
				if (s.state === "denied") body.innerHTML = denied();
				else if (s.state !== "ok" || !s.data.stages.some((x) => num(x.value))) body.innerHTML = empty(t("No pipeline activity this period"));
				else {
					const routes = [
						["List", "Lead", {}],
						["List", "Site Visit", { docstatus: 1 }],
						["List", "Bill of Quantity", { docstatus: 1 }],
						["List", "Quotation", { company, docstatus: 1 }],
						["List", "Quotation", { company, status: "Ordered" }],
					];
					body.innerHTML = funnel(s.data.stages.map((x, i) => ({ ...x, route: routes[i] })));
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
				body.innerHTML = s.state === "denied" ? denied() : html || empty(t("No quotations this period"));
			}

			// Lead status
			{
				const s = d.section("lead_status");
				const { body } = d.card("c4", t("Leads by status"), { sub: t("Created this period") });
				if (s.state === "denied") body.innerHTML = denied();
				else if (s.state !== "ok" || !s.data.items.length) body.innerHTML = empty(t("No new leads this period"));
				else body.innerHTML = bars(s.data.items, { format: count, share: true, route: (x) => ["List", "Lead", { status: x.status }] });
			}

			// Lead source
			{
				const s = d.section("lead_source");
				const { body } = d.card("c4", t("Lead sources"), { sub: t("Where new leads came from") });
				if (s.state === "denied") body.innerHTML = denied();
				else if (s.state !== "ok" || !s.data.items.length) body.innerHTML = empty(t("No new leads this period"));
				else body.innerHTML = bars(s.data.items, { format: count, share: true, color: "var(--s3)", route: (x) => x.source && ["List", "Lead", { source: x.source }] });
			}

			// Top customers
			{
				const s = d.section("top_customers");
				const { body } = d.card("c4", t("Top customers"), { sub: t("By invoiced value this period") });
				if (s.state === "denied") body.innerHTML = denied();
				else if (s.state !== "ok" || !s.data.items.length) body.innerHTML = empty(t("No invoices this period"));
				else body.innerHTML = bars(s.data.items, { format: (v) => d.money(v), share: true, route: (x) => ["List", "Sales Invoice", { customer: x.customer, docstatus: 1 }] });
			}

			// Recent quotations
			{
				const s = d.section("recent_quotations");
				const { body } = d.card("c8", t("Latest quotations"), { link: { label: t("View all"), route: ["List", "Quotation", { company }] } });
				if (s.state === "denied") body.innerHTML = denied();
				else if (s.state !== "ok" || !s.data.rows.length) body.innerHTML = empty(t("No quotations yet"));
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
				if (s.state === "denied") body.innerHTML = denied();
				else if (s.state !== "ok" || !s.data.rows.length) body.innerHTML = empty(t("No site visits scheduled"));
				else
					body.innerHTML = `<div class="bmd-visits">${s.data.rows
						.map((r) => {
							const dt = parseDate(r.visit_date);
							return `<div class="bmd-visit" data-route='${esc(JSON.stringify(["Form", "Site Visit", r.name]))}'>
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

	DEFS.projects = {
		title: "Projects",
		subtitle: "Delivery, budgets and tasks",
		icon: "folder",
		method: "get_project_dashboard",
		skeleton: SKELETON,
		render(d) {
			const k = d.section("kpis");
			const company = d.data.filters.company;

			if (k.state === "ok") {
				const x = k.data;
				d.hero("c4", {
					icon: "target",
					label: t("Average completion"),
					value: pct(x.avg_progress),
					meta: `<span>${esc(t("Across"))} <b style="color:var(--ink)">${count(x.active)}</b> ${esc(t("active projects"))}</span>`,
					extra: meter(t("Billed against estimate"), x.billed, x.estimated, {
						text: x.estimated ? `${d.money(x.billed)} / ${d.money(x.estimated)}` : t("No estimates set"),
					}),
				});
				d.tiles("c8", [
					{ icon: "folder", label: t("Active projects"), value: count(x.active), foot: esc(t("Status open")), route: ["List", "Project", { company, status: "Open" }] },
					{ icon: "alert", label: t("Past deadline"), value: count(x.overdue), foot: x.active ? `${pct((x.overdue / x.active) * 100)} ${esc(t("of active"))}` : "", route: ["List", "Project", { company, status: "Open", expected_end_date: ["<", iso(new Date())] }] },
					{ icon: "check", label: t("Completed"), value: count(x.completed), foot: esc(t("Closed this period")), route: ["List", "Project", { company, status: "Completed" }] },
					{ icon: "tasks", label: t("Open tasks"), value: count(x.open_tasks), foot: esc(t("Open, working or in review")), route: ["List", "Task", { status: ["in", ["Open", "Working", "Pending Review", "Overdue"]] }] },
					{ icon: "clock", label: t("Overdue tasks"), value: count(x.overdue_tasks), foot: x.open_tasks ? `${pct((x.overdue_tasks / x.open_tasks) * 100)} ${esc(t("of open tasks"))}` : "", route: ["List", "Task", { status: ["in", ["Open", "Working", "Pending Review", "Overdue"]], exp_end_date: ["<", iso(new Date())] }] },
					{ icon: "receipt", label: t("Billed (active)"), value: d.money(x.billed), title: d.money(x.billed, true), foot: x.estimated ? `${pct((x.billed / x.estimated) * 100)} ${esc(t("of estimate"))}` : esc(t("No estimates set")) },
				]);
			} else d.card("c12", t("Key figures")).body.innerHTML = k.state === "denied" ? denied() : empty();

			// Project list
			{
				const s = d.section("projects");
				const { body } = d.card("c8", t("Active projects"), {
					sub: s.state === "ok" ? `${t("Most urgent first")} · ${s.data.total} ${t("open")}` : t("Most urgent first"),
					link: { label: t("View all"), route: ["List", "Project", { company, status: "Open" }] },
				});
				if (s.state === "denied") body.innerHTML = denied();
				else if (s.state !== "ok" || !s.data.rows.length) body.innerHTML = empty(t("No active projects"));
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
						.map(([label, kind]) => `<div><div class="hl">${pill(t(label), kind)}</div><div class="hv">${count(h[label])}</div></div>`)
						.join("")}</div>`;
					html += `<div class="bmd-card-s" style="margin-top:8px">${esc(t("At risk = progress trails elapsed time by more than 15 points."))}</div>`;
				} else if (s.state === "denied") html += denied();
				if (st.state === "ok" && st.data.items.length) {
					const colors = { Open: "var(--s1)", Completed: "var(--good)", Cancelled: "var(--neutral)" };
					html +=
						`<div class="bmd-divider"></div><div class="bmd-mini-h">${esc(t("All projects by status"))}</div>` +
						segbar(
							st.data.items.map((x) => ({ ...x, color: colors[x.status] || "var(--s4)", darkInk: x.status === "Cancelled", route: ["List", "Project", { company, status: x.status }] })),
							{ format: count }
						);
				}
				body.innerHTML = html || empty();
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
					: "";
				const { body } = d.card("c7", t("Budget vs actual"), { sub: t("Submitted project budgets, largest first"), table: tbl || undefined, link: { label: t("Budgets"), route: ["List", "Project Budget", { docstatus: 1 }] } });
				if (s.state === "denied") body.innerHTML = denied();
				else if (!items.length) body.innerHTML = empty(t("No submitted project budgets"));
				else
					body.innerHTML = pairBars(
						items.map((x) => ({ label: x.label, a: x.estimated, b: x.actual, route: ["Form", "Project", x.project] })),
						{ aName: t("Estimated"), bName: t("Actual"), format: (v) => d.money(v) }
					);
			}

			// Task status
			{
				const s = d.section("task_status");
				const { body } = d.card("c5", t("Tasks by status"), { sub: t("All tasks, as of today") });
				if (s.state === "denied") body.innerHTML = denied();
				else if (s.state !== "ok" || !s.data.items.length) body.innerHTML = empty(t("No tasks yet"));
				else
					body.innerHTML = bars(s.data.items, {
						format: count,
						share: true,
						route: (x) => ["List", "Task", { status: x.status }],
					});
			}

			// Due tasks
			{
				const s = d.section("due_tasks");
				const { body } = d.card("c7", t("Tasks due soon"), { sub: t("Overdue or due in the next 7 days") });
				if (s.state === "denied") body.innerHTML = denied();
				else if (s.state !== "ok" || !s.data.rows.length) body.innerHTML = empty(t("Nothing due this week"));
				else
					body.innerHTML = table(
						[
							{ label: t("Task"), html: (r) => `<div class="strong ellipsis">${esc(r.subject || r.name)}</div><div class="muted" style="font-size:11.5px">${esc(r.project || "—")}</div>` },
							{ label: t("Progress"), html: (r) => `<div class="bmd-prog"><div class="bmd-track"><div class="bmd-fill" style="width:${Math.min(100, num(r.progress))}%"></div></div><span>${pct(r.progress)}</span></div>` },
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

			// Subcontracting
			{
				const s = d.section("subcontract");
				const { body } = d.card("c5", t("Subcontracting"), { sub: t("Work orders and invoices this period"), link: { label: t("Work orders"), route: ["List", "Subcontract Work Order", { docstatus: 1 }] } });
				if (s.state === "denied") body.innerHTML = denied();
				else if (s.state !== "ok" || !(num(s.data.ordered) || num(s.data.invoiced))) body.innerHTML = empty(t("No subcontract activity this period"));
				else {
					const x = s.data;
					body.innerHTML = `<div class="bmd-kv">
						<div class="bmd-kv-row"><span>${esc(t("Work orders"))} (${count(x.orders)})</span><b>${esc(d.money(x.ordered))}</b></div>
						<div class="bmd-kv-row"><span>${esc(t("Invoiced"))}</span><b>${esc(d.money(x.invoiced))}</b></div>
						<div class="bmd-kv-row"><span>${esc(t("Paid"))}</span><b>${esc(d.money(x.paid))}</b></div></div>
						<div class="bmd-divider"></div>
						${meter(t("Invoiced of ordered"), x.invoiced, x.ordered)}
						<div style="height:12px"></div>
						${meter(t("Paid of invoiced"), x.paid, x.invoiced, { color: "var(--s3)" })}`;
				}
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

	window.benchmark_dashboards = { mount, _defs: DEFS };
})();
