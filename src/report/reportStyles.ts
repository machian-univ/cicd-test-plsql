export const REPORT_STYLES = `
    :root {
      --bg:          #0a0b0d;
      --bg2:         #0e1012;
      --bg3:         #141618;
      --glass:       rgba(20, 25, 30, 0.85);
      --border:      rgba(0, 255, 136, 0.12);
      --border2:     rgba(0, 255, 136, 0.06);
      --text:        #c8d0d8;
      --text-dim:    #607080;
      --accent:      #00ff88;
      --accent-dim:  #00cc66;
      --red:         #ff3366;
      --yellow:      #ffcc00;
      --blue:        #00aaff;
      --font-mono:   'JetBrains Mono', 'Fira Code', Consolas, monospace;
      --font-ui:     'Inter', 'Roboto', system-ui, sans-serif;
      --radius:      8px;
      --radius-lg:   14px;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-ui);
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      font-size: 13px;
      min-height: 100vh;
    }

    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(0,255,136,.025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,255,136,.025) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
      z-index: 0;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    code {
      font-family: var(--font-mono);
      background: rgba(0,255,136,.08);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 0.85em;
      color: var(--accent);
    }

    .header {
      position: relative;
      background: linear-gradient(180deg, #0d1a0f 0%, #0a0b0d 100%);
      border-bottom: 1px solid var(--border);
      padding: 0;
      overflow: hidden;
      z-index: 1;
    }

    .header-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px 24px 0;
    }

    .header-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .logo-block { display: flex; align-items: center; gap: 12px; }

    .logo-text {
      font-family: var(--font-ui);
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #fff;
    }

    .logo-text .logo-red { color: var(--red); }

    .logo-sub {
      font-size: 0.7rem;
      color: var(--text-dim);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-top: 2px;
    }

    .header-badges { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

    .hbadge {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      padding: 3px 10px;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: rgba(0,255,136,.04);
      color: var(--text);
      white-space: nowrap;
      max-width: none;
    }

    .hbadge .hb-label { color: var(--text-dim); margin-right: 4px; }
    .hbadge .hb-val   { color: var(--accent); font-weight: 600; }

    .header-merge-banner {
      font-family: var(--font-mono);
      font-size: 0.78rem;
      color: var(--text-dim);
      margin-top: 8px;
      line-height: 1.5;
      word-break: break-word;
    }

    .header-merge-banner strong { color: var(--accent); font-weight: 600; }

    .file-path-cell {
      word-break: break-all;
      white-space: normal;
      max-width: none;
    }

    .header-commit-msg {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      color: var(--text-dim);
      padding: 4px 0 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .pulse-line { width: 100%; height: 44px; display: block; margin-top: 8px; }
    .pulse-line path.flatline { stroke: rgba(0,255,136,.15); stroke-width: 1; fill: none; }
    .pulse-line path.pulse { stroke: var(--red); stroke-width: 2; fill: none; filter: drop-shadow(0 0 4px var(--red)); }
    .pulse-line path.fade-to-chart { stroke: url(#pulseGrad); stroke-width: 1.5; fill: none; }

    .page-body {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px 16px 40px;
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .glass-card {
      background: var(--glass);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 20px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 4px 24px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.03);
    }

    .overview-grid { display: grid; grid-template-columns: 240px 1fr; gap: 16px; }
    @media (max-width: 700px) { .overview-grid { grid-template-columns: 1fr; } }

    .qscore-panel { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; }
    .qscore-label { font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.2em; color: var(--text-dim); text-transform: uppercase; }
    .qscore-value { font-family: var(--font-ui); font-size: 5rem; font-weight: 800; line-height: 1; text-shadow: 0 0 40px currentColor; transition: color 0.3s; }
    .qscore-max { font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-dim); }

    .gate-badge { margin-top: 4px; padding: 6px 16px; border-radius: 4px; font-family: var(--font-mono); font-size: 0.78rem; font-weight: 700; letter-spacing: 0.05em; }
    .gate-pass { background: rgba(0,255,136,.1); color: var(--accent); border: 1px solid var(--accent); box-shadow: 0 0 12px rgba(0,255,136,.2); }
    .gate-fail { background: rgba(255,51,102,.1); color: var(--red); border: 1px solid var(--red); box-shadow: 0 0 12px rgba(255,51,102,.2); }
    .gate-threshold { font-family: var(--font-mono); font-size: 0.68rem; color: var(--text-dim); margin-top: 2px; }

    .breakdown-panel { display: flex; flex-direction: column; }

    .progress-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    @media (max-width: 600px) { .progress-strip { grid-template-columns: repeat(2, 1fr); } }
    .progress-card { background: var(--glass); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; text-align: center; }
    .progress-label { font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.1em; }
    .progress-val   { font-size: 1.6rem; font-weight: 700; color: var(--text); margin-top: 4px; }

    .panel-title { font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.18em; color: var(--accent); text-transform: uppercase; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }

    .section-subtitle { font-size: 0.78rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.1em; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 1px solid var(--border2); }

    .metric-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--border2); }
    .metric-row:last-child { border-bottom: none; }
    .metric-name { min-width: 130px; font-size: 0.78rem; color: var(--text-dim); }
    .metric-bar-wrap { flex: 1; background: rgba(255,255,255,.05); border-radius: 3px; height: 6px; overflow: hidden; }
    .metric-bar { height: 6px; border-radius: 3px; transition: width 0.4s; }
    .metric-val { min-width: 32px; text-align: right; font-weight: 700; font-size: 0.85rem; font-family: var(--font-mono); }

    .tabs-container { background: var(--glass); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; backdrop-filter: blur(12px); }
    .tabs-nav { display: flex; overflow-x: auto; border-bottom: 1px solid var(--border); background: rgba(0,0,0,.2); scrollbar-width: none; }
    .tabs-nav::-webkit-scrollbar { display: none; }
    .tab-btn { flex-shrink: 0; padding: 12px 16px; background: none; border: none; color: var(--text-dim); font-size: 0.78rem; font-family: var(--font-ui); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; white-space: nowrap; }
    .tab-btn:hover { color: var(--text); background: rgba(0,255,136,.04); }
    .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); background: rgba(0,255,136,.06); }
    .tab-content { display: none; padding: 20px; }
    .tab-content.active { display: block; }

    .stat-cards { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
    .stat-card { flex: 1; min-width: 100px; background: rgba(255,255,255,.03); border: 1px solid var(--border2); border-radius: var(--radius); padding: 14px 12px; text-align: center; }
    .stat-card.stat-ok   { border-color: rgba(0,255,136,.25); background: rgba(0,255,136,.05); }
    .stat-card.stat-crit { border-color: rgba(255,51,102,.35); background: rgba(255,51,102,.06); }
    .stat-card.stat-warn { border-color: rgba(255,204,0,.3); background: rgba(255,204,0,.05); }
    .stat-num   { font-size: 1.7rem; font-weight: 800; font-family: var(--font-mono); color: var(--text); }
    .stat-label { font-size: 0.7rem; color: var(--text-dim); margin-top: 3px; }
    .stat-add   { color: var(--accent); }
    .stat-del   { color: var(--red); }

    .file-list { display: flex; flex-direction: column; gap: 4px; }
    .file-details { border: 1px solid var(--border2); border-radius: var(--radius); overflow: hidden; }
    .file-summary { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; cursor: pointer; background: rgba(255,255,255,.02); gap: 8px; flex-wrap: nowrap; list-style: none; }
    .file-summary:hover { background: rgba(0,255,136,.04); }
    .file-path { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
    .file-badges { display: flex; gap: 5px; flex-shrink: 0; }
    .file-messages { padding: 10px 12px; background: var(--bg2); border-top: 1px solid var(--border2); }

    .msg-row { display: flex; gap: 8px; padding: 3px 0; font-size: 0.75rem; border-bottom: 1px solid var(--border2); flex-wrap: wrap; align-items: baseline; }
    .msg-row:last-child { border-bottom: none; }
    .err-row .msg-line, .err-row .msg-rule { color: var(--red); }
    .warn-row .msg-line, .warn-row .msg-rule { color: var(--yellow); }
    .tsc-row .msg-rule { color: var(--blue); }
    .msg-line { min-width: 40px; font-family: var(--font-mono); color: var(--text-dim); flex-shrink: 0; }
    .msg-rule { min-width: 80px; font-family: var(--font-mono); font-size: 0.7rem; flex-shrink: 0; }
    .msg-text { flex: 1; color: var(--text); min-width: 0; overflow-wrap: break-word; word-break: break-word; }
    .msg-src  { font-size: 0.65rem; color: var(--text-dim); background: rgba(255,255,255,.06); padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }

    .badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; font-family: var(--font-mono); }
    .badge-err  { background: rgba(255,51,102,.2); color: var(--red); border: 1px solid rgba(255,51,102,.4); }
    .badge-warn { background: rgba(255,204,0,.15); color: var(--yellow); border: 1px solid rgba(255,204,0,.3); }

    .sev-badge  { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; }
    .sev-critical { background: rgba(255,51,102,.2); color: var(--red); }
    .sev-high     { background: rgba(255,100,0,.2); color: #ff6600; }
    .sev-moderate { background: rgba(255,204,0,.15); color: var(--yellow); }
    .sev-low      { background: rgba(0,255,136,.1); color: var(--accent); }

    .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    table { width: 100%; border-collapse: collapse; font-size: 0.78rem; margin-bottom: 12px; min-width: 400px; }
    th { text-align: left; padding: 8px 10px; background: rgba(0,255,136,.05); color: var(--accent); font-weight: 700; border-bottom: 1px solid var(--border); font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
    td { padding: 7px 10px; border-bottom: 1px solid var(--border2); vertical-align: top; color: var(--text); }
    tr:hover td { background: rgba(0,255,136,.03); }
    .cell-overflow { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nowrap { white-space: nowrap; }

    .info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin-bottom: 12px; }
    .info-item { background: rgba(255,255,255,.03); border: 1px solid var(--border2); border-radius: var(--radius); padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .info-item-na { opacity: 0.45; }
    .info-label { font-size: 0.68rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; }
    .info-val { font-size: 0.85rem; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .val-ok   { color: var(--accent); }
    .val-crit { color: var(--red); font-weight: 700; }
    .val-warn { color: var(--yellow); }
    .val-na   { color: var(--text-dim); }
    .mono     { font-family: var(--font-mono); }

    .muted { color: var(--text-dim); font-size: 0.8rem; padding: 6px 0; }

    .success-msg { color: var(--accent); background: rgba(0,255,136,.07); border: 1px solid rgba(0,255,136,.2); border-radius: var(--radius); padding: 10px 14px; font-size: 0.82rem; }

    .tool-warning {
      color: var(--yellow);
      background: rgba(255,204,0,.06);
      border: 1px solid rgba(255,204,0,.2);
      border-radius: var(--radius);
      padding: 10px 14px;
      font-size: 0.8rem;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .warn-icon {
      flex-shrink: 0;
      font-size: 1rem;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tool-warning-text { flex: 1; line-height: 1.45; }

    .details-toggle { cursor: pointer; font-size: 0.78rem; font-weight: 600; color: var(--accent); padding: 4px 0; list-style: none; font-family: var(--font-mono); }
    .details-toggle:hover { text-decoration: underline; }

    .changed-files-list { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-dim); padding: 8px 0 8px 16px; max-height: 300px; overflow-y: auto; }
    .changed-files-list li { padding: 2px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .achievements-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .achievement-item { background: rgba(255,204,0,.08); border: 1px solid rgba(255,204,0,.2); border-radius: var(--radius); padding: 8px 12px; display: flex; flex-direction: column; gap: 2px; }
    .achievement-label { font-weight: 700; font-size: 0.82rem; color: var(--yellow); }
    .achievement-desc  { font-size: 0.75rem; color: var(--text-dim); }

    .commit-msg-block { margin-bottom: 16px; }
    .commit-msg-item { font-family: var(--font-mono); font-size: 0.82rem; color: var(--text); background: rgba(0,255,136,.04); border-left: 3px solid var(--accent); padding: 8px 12px; border-radius: 0 var(--radius) var(--radius) 0; margin-bottom: 4px; }

    /* ── AI / Деградация ── */
    .degradation-verdict {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 20px;
      border-radius: var(--radius-lg);
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .degradation-verdict.stable   { background: rgba(0,255,136,.07); border: 1px solid rgba(0,255,136,.25); }
    .degradation-verdict.degrading { background: rgba(255,51,102,.07); border: 1px solid rgba(255,51,102,.25); }
    .degradation-verdict.unknown  { background: rgba(96,112,128,.07); border: 1px solid rgba(96,112,128,.25); }

    .verdict-icon { font-size: 2.5rem; flex-shrink: 0; }
    .verdict-text { flex: 1; min-width: 0; }
    .verdict-title { font-size: 1.1rem; font-weight: 800; margin-bottom: 4px; }
    .verdict-subtitle { font-size: 0.8rem; color: var(--text-dim); }
    .verdict-score { text-align: right; flex-shrink: 0; }
    .verdict-score-num { font-family: var(--font-mono); font-size: 2rem; font-weight: 800; }
    .verdict-score-label { font-size: 0.68rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.1em; }

    .confidence-bar-wrap { margin: 12px 0; }
    .confidence-bar-label { font-size: 0.72rem; color: var(--text-dim); margin-bottom: 4px; display: flex; justify-content: space-between; }
    .confidence-bar-track { height: 6px; background: rgba(255,255,255,.06); border-radius: 3px; overflow: hidden; }
    .confidence-bar-fill  { height: 6px; border-radius: 3px; transition: width 0.5s; }

    .factor-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; margin-top: 12px; }
    .factor-item { background: rgba(255,255,255,.03); border: 1px solid var(--border2); border-radius: var(--radius); padding: 12px 14px; }
    .factor-item.factor-positive { border-color: rgba(0,255,136,.2); }
    .factor-item.factor-negative { border-color: rgba(255,51,102,.2); }
    .factor-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; gap: 8px; }
    .factor-name  { font-size: 0.78rem; font-weight: 700; color: var(--text); }
    .factor-value { font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-dim); background: rgba(255,255,255,.06); padding: 1px 6px; border-radius: 3px; white-space: nowrap; }
    .factor-desc  { font-size: 0.72rem; color: var(--text-dim); line-height: 1.5; }
    .factor-impact-icon { font-size: 0.85rem; flex-shrink: 0; }

    .model-info-block { margin-top: 16px; padding: 12px 14px; background: rgba(0,170,255,.05); border: 1px solid rgba(0,170,255,.15); border-radius: var(--radius); font-size: 0.75rem; color: var(--text-dim); }
    .model-info-block strong { color: var(--blue); }

    .llm-review-card { padding: 16px 18px; margin-top: 8px; }
    .llm-review-p { font-size: 0.82rem; color: var(--text); line-height: 1.7; margin: 0 0 12px; }
    .llm-review-p:last-child { margin-bottom: 0; }
    .llm-review-h { font-size: 0.88rem; font-weight: 700; color: var(--text); margin: 0 0 10px; }
    .llm-review-ul { margin: 8px 0 12px; padding-left: 20px; }
    .llm-review-ul li { font-size: 0.8rem; color: var(--text); line-height: 1.6; margin-bottom: 6px; }
    .md-inline { font-family: var(--font-mono); font-size: 0.78rem; padding: 1px 5px; background: rgba(0,170,255,.1); border-radius: 3px; color: var(--blue); }
    .llm-rec-list { margin: 8px 0 0; padding-left: 20px; }
    .llm-rec-list li { font-size: 0.8rem; color: var(--text); line-height: 1.6; margin-bottom: 6px; }
    .llm-rec-list .md-inline { font-size: 0.75rem; }

    .formula-block { padding: 16px; background: rgba(0,255,136,.04); border-radius: var(--radius); text-align: center; margin-bottom: 12px; }
    .formula-main { font-size: 1rem; font-family: var(--font-mono); color: var(--accent); margin-bottom: 6px; }
    .formula-note { font-size: 0.75rem; color: var(--text-dim); }

    .calc-block { display: flex; flex-direction: column; gap: 0; }
    .calc-section { padding: 12px 0; border-bottom: 1px solid var(--border2); }
    .calc-section:last-child { border-bottom: none; }
    .calc-title { font-weight: 700; font-size: 0.82rem; color: var(--text); margin-bottom: 6px; }
    .calc-desc { font-size: 0.78rem; color: var(--text-dim); line-height: 1.7; }
    .calc-desc code { display: block; margin-top: 4px; }

    .footer { text-align: center; color: var(--text-dim); font-size: 0.7rem; font-family: var(--font-mono); padding: 16px; border-top: 1px solid var(--border2); position: relative; z-index: 1; }
`;
