// ============================================================
// API base
// ============================================================
const API_BASE = window.location.origin; // same-origin, served by FastAPI at /dashboard

// ============================================================
// Formatting helpers
// ============================================================
function formatHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

function formatShort(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return [m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

function weekdayName(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}

async function fetchJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

function setStatus(text, isError = false) {
  const el = document.getElementById('status-text');
  el.textContent = text;
  el.style.color = isError ? '#C97B5E' : '';
}

// ============================================================
// Daily goal (stored locally - no backend setting for this yet)
// ============================================================
const DEFAULT_GOAL_SECONDS = 5 * 3600;

function getDailyGoalSeconds() {
  const stored = localStorage.getItem('focusTracker.dailyGoalSeconds');
  return stored ? parseInt(stored, 10) : DEFAULT_GOAL_SECONDS;
}

function setDailyGoalSeconds(seconds) {
  localStorage.setItem('focusTracker.dailyGoalSeconds', String(seconds));
}

document.getElementById('edit-goal-btn').addEventListener('click', () => {
  const currentHours = (getDailyGoalSeconds() / 3600).toFixed(1);
  const input = prompt('Daily focus goal, in hours:', currentHours);
  if (!input) return;
  const hours = parseFloat(input);
  if (isNaN(hours) || hours <= 0) return;
  setDailyGoalSeconds(Math.round(hours * 3600));
  loadAll();
});

// ============================================================
// App color assignment (stable per session)
// ============================================================
const APP_COLORS = ['#4FAE9D', '#D9A441', '#B36A5E', '#9575B0', '#7C9CBF', '#A6B25E', '#C97B5E', '#5EA6A0'];
const appColorMap = new Map();
function colorForApp(appName) {
  if (!appColorMap.has(appName)) {
    appColorMap.set(appName, appColorMap.size % APP_COLORS.length);
  }
  return APP_COLORS[appColorMap.get(appName)];
}

// ============================================================
// App name humanization (display only - the tracker/DB/CSV export
// always keep the raw executable name; this only affects what's
// rendered on screen, via humanizeAppName below).
// ============================================================
const APP_DISPLAY_NAMES = {
  'chrome.exe': 'Google Chrome',
  'msedge.exe': 'Microsoft Edge',
  'firefox.exe': 'Mozilla Firefox',
  'code.exe': 'Visual Studio Code',
  'devenv.exe': 'Visual Studio',
  'explorer.exe': 'File Explorer',
  'notepad.exe': 'Notepad',
  'notepad++.exe': 'Notepad++',
  'winword.exe': 'Microsoft Word',
  'excel.exe': 'Microsoft Excel',
  'powerpnt.exe': 'Microsoft PowerPoint',
  'outlook.exe': 'Microsoft Outlook',
  'onenote.exe': 'Microsoft OneNote',
  'teams.exe': 'Microsoft Teams',
  'slack.exe': 'Slack',
  'discord.exe': 'Discord',
  'spotify.exe': 'Spotify',
  'notion.exe': 'Notion',
  'figma.exe': 'Figma',
  'postman.exe': 'Postman',
  'windowsterminal.exe': 'Windows Terminal',
  'cmd.exe': 'Command Prompt',
  'powershell.exe': 'Windows PowerShell',
  'pwsh.exe': 'PowerShell',
  'zoom.exe': 'Zoom',
  'steam.exe': 'Steam',
  'acrord32.exe': 'Adobe Acrobat Reader',
  'photoshop.exe': 'Adobe Photoshop',
  'illustrator.exe': 'Adobe Illustrator',
  'idea64.exe': 'IntelliJ IDEA',
  'pycharm64.exe': 'PyCharm',
  'sublime_text.exe': 'Sublime Text',
  'whatsapp.exe': 'WhatsApp',
  'telegram.exe': 'Telegram',
};

// Falls back to stripping ".exe" and title-casing whatever's left, so
// an app that isn't in the map still reads better than a raw filename.
function humanizeAppName(exeName) {
  if (!exeName) return exeName;
  const known = APP_DISPLAY_NAMES[exeName.toLowerCase()];
  if (known) return known;
  const base = exeName.replace(/\.exe$/i, '');
  return base
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

// ============================================================
// Live "Focus time today" clock
// The tracker only writes an event to the DB when you switch apps or
// go idle, so /summary/today lags reality by however long you've sat
// in the current app. /summary/live adds that in-progress stretch and
// reports whether the tracker process is actually alive. We poll it
// every few seconds and tick locally in between, so the readout moves
// second-by-second while you work - visible proof the tracker is on.
// ============================================================
let liveClockSynced = false;
const liveClock = {
  baseSeconds: 0,   // live_active_seconds at the last sync
  baseAt: 0,        // performance.now() at the last sync
  online: false,
  idle: false,
  currentApp: null,
};

function renderLiveClock() {
  const el = document.getElementById('main-elapsed');
  if (!el) return;
  const running = liveClock.online && !liveClock.idle;
  const seconds = running
    ? liveClock.baseSeconds + (performance.now() - liveClock.baseAt) / 1000
    : liveClock.baseSeconds;
  el.textContent = formatHMS(seconds);
  el.classList.toggle('is-stale', liveClockSynced && !running);

  const chip = document.getElementById('track-status');
  const text = document.getElementById('track-status-text');
  if (!chip || !text) return;
  chip.classList.remove('is-live', 'is-idle', 'is-offline');
  if (!liveClockSynced) {
    text.textContent = 'Connecting…';
  } else if (!liveClock.online) {
    chip.classList.add('is-offline');
    text.textContent = 'Tracker offline';
  } else if (liveClock.idle) {
    chip.classList.add('is-idle');
    text.textContent = 'Idle';
  } else {
    chip.classList.add('is-live');
    text.textContent = liveClock.currentApp
      ? `Tracking · ${humanizeAppName(liveClock.currentApp)}`
      : 'Tracking';
  }
}

async function syncLiveClock() {
  try {
    const live = await fetchJSON('/summary/live');
    liveClock.baseSeconds = Number(live.live_active_seconds) || 0;
    liveClock.baseAt = performance.now();
    liveClock.online = !!live.tracker_online;
    liveClock.idle = !!live.is_idle;
    liveClock.currentApp = live.current_app || null;
  } catch (err) {
    // Backend unreachable: keep the last value on screen, flag offline.
    liveClock.online = false;
  }
  liveClockSynced = true;
  renderLiveClock();
}

syncLiveClock();
setInterval(syncLiveClock, 15000);
setInterval(renderLiveClock, 1000);

// ============================================================
// Rendering: top bar
// ============================================================
function renderTopBar(today) {
  // "Focus time today" (#main-elapsed) is driven by the live clock -
  // see the Live clock section below - so it can tick every second and
  // include the stretch the tracker hasn't committed to the DB yet.
  // Seed it here so there's a number before the first live sync lands.
  if (!liveClockSynced) {
    const el = document.getElementById('main-elapsed');
    if (el) el.textContent = formatHMS(today.total_active_seconds);
  }
}

// ============================================================
// Rendering: KPI row
// ============================================================
function renderKPIs(today, week) {
  const totals = week.daily_totals.map(d => d.active_seconds);
  const avgSeconds = totals.reduce((a, b) => a + b, 0) / (totals.length || 1);
  document.getElementById('kpi-weekly-avg').textContent = formatShort(avgSeconds);
  const maxDay = Math.max(...totals, 1);
  document.getElementById('kpi-weekly-avg-bar').style.width = `${Math.min(100, (avgSeconds / maxDay) * 100)}%`;

  const breakPct = Math.round((today.break_ratio || 0) * 100);
  document.getElementById('kpi-break-ratio').textContent = `${breakPct}%`;
  document.getElementById('kpi-break-ratio-bar').style.width = `${breakPct}%`;

  document.getElementById('kpi-switches').firstChild.textContent = `${today.app_switch_count} `;
  const switchRatio = week.avg_app_switch_count > 0
    ? today.app_switch_count / week.avg_app_switch_count
    : (today.app_switch_count > 0 ? 2 : 0);
  let qualifier = 'Typical';
  if (switchRatio >= 1.5) qualifier = 'High';
  else if (switchRatio <= 0.5) qualifier = 'Low';
  document.getElementById('kpi-switches-qualifier').textContent = qualifier;
  const switchPct = week.avg_app_switch_count > 0
    ? Math.min(100, (today.app_switch_count / (week.avg_app_switch_count * 2)) * 100)
    : 0;
  document.getElementById('kpi-switches-bar').style.width = `${switchPct}%`;

  document.getElementById('kpi-idle').textContent = formatShort(today.total_idle_seconds);
  const idleTotal = today.total_active_seconds + today.total_idle_seconds;
  const idlePct = idleTotal > 0 ? (today.total_idle_seconds / idleTotal) * 100 : 0;
  document.getElementById('kpi-idle-bar').style.width = `${idlePct}%`;

  document.getElementById('kpi-active-day').textContent =
    week.most_active_day ? weekdayName(week.most_active_day) : '—';
}

// ============================================================
// Rendering: insights (rule-based, no AI)
// ============================================================
function renderInsights(today, week) {
  const list = document.getElementById('insights-list');
  const insights = [];

  const otherDays = week.daily_totals.filter(d => d.date !== today.date);
  if (otherDays.length > 0) {
    const otherAvg = otherDays.reduce((a, d) => a + d.active_seconds, 0) / otherDays.length;
    if (otherAvg > 0) {
      const pctDiff = ((today.total_active_seconds - otherAvg) / otherAvg) * 100;
      const direction = pctDiff >= 0 ? 'above' : 'below';
      const icon = pctDiff >= 0 ? '↑' : '↓';
      insights.push({
        icon, iconClass: 'positive',
        text: `You're <b>${Math.abs(Math.round(pctDiff))}% ${direction}</b> your recent average today — ${formatShort(today.total_active_seconds)} vs your usual ${formatShort(otherAvg)}.`,
        basis: "Today's active time vs. the other days this week",
      });
    }
  }

  if (week.most_active_day) {
    const entry = week.daily_totals.find(d => d.date === week.most_active_day);
    const dayName = weekdayName(week.most_active_day);
    insights.push({
      icon: '●', iconClass: 'neutral',
      text: `<b>${dayName}</b> was your most focused day this week, with ${formatShort(entry ? entry.active_seconds : 0)} of active time.`,
      basis: 'Highest daily total in the last 7 days',
    });
  }

  if (week.avg_app_switch_count > 0) {
    const pctDiff = ((today.app_switch_count - week.avg_app_switch_count) / week.avg_app_switch_count) * 100;
    const direction = pctDiff >= 0 ? 'higher' : 'lower';
    const icon = pctDiff >= 0 ? '↑' : '↓';
    const roundedAvg = Math.round(week.avg_app_switch_count);
    // Guard against a confusing read like "600% higher than your usual 0" -
    // that happens when the true average is a small fraction (e.g. 0.29)
    // that rounds to display as 0. Fall back to one decimal place whenever
    // rounding would collapse a genuinely non-zero average to zero.
    const avgDisplay = roundedAvg > 0 ? roundedAvg : week.avg_app_switch_count.toFixed(1);
    insights.push({
      icon, iconClass: pctDiff >= 0 ? 'neutral' : 'positive',
      text: `Your app-switching is <b>${Math.abs(Math.round(pctDiff))}% ${direction}</b> than your weekly average today — ${today.app_switch_count} switches vs your usual ${avgDisplay}.`,
      basis: "Today's app switches vs. 7-day average",
    });
  }

  if (insights.length === 0) {
    list.innerHTML = '<div style="font-size:13px;color:var(--text-dim);">Not enough data yet to generate insights - keep tracking for a few days.</div>';
    return;
  }

  list.innerHTML = insights.map(i => `
    <div class="insight-row">
      <div class="insight-icon ${i.iconClass}">${i.icon}</div>
      <div>
        <div class="insight-text">${i.text}</div>
        <div class="insight-basis">${i.basis}</div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// Rendering: daily goal gauge
// ============================================================
function renderGauge(today) {
  const goal = Math.max(1, getDailyGoalSeconds());
  const active = Math.max(0, Number(today.total_active_seconds) || 0);
  const progressRatio = Math.min(1, active / goal);
  const pct = Math.round(progressRatio * 100);
  const remaining = Math.max(0, goal - active);
  const remainingRatio = Math.max(0, Math.min(1, remaining / goal));

  document.getElementById('gauge-pct').textContent = `${pct}%`;
  document.getElementById('gauge-sub').textContent = `of ${formatShort(goal)} daily goal`;
  document.getElementById('gauge-goal-text').textContent =
    remaining > 0
      ? `${formatShort(active)} logged · ${formatShort(remaining)} remaining`
      : `${formatShort(active)} logged · goal reached`;

  // Build a real segmented semicircle. Each active segment represents
  // a portion of the goal that is still remaining, so the arc counts down
  // as focused time is logged instead of filling up like a normal progress bar.
  const segmentGroup = document.getElementById('gauge-segments');
  if (!segmentGroup) return;

  const svg = segmentGroup.closest('svg');
  const segmentCount = 24;
  const remainingSegments = remaining <= 0
    ? 0
    : Math.ceil(remainingRatio * segmentCount);

  const cx = 110;
  const cy = 120;
  const radius = 90;
  const stepAngle = 180 / segmentCount;
  const segmentAngle = stepAngle * 0.68; // leaves a visible gap between segments

  const pointOnArc = (angleDeg) => {
    const angle = angleDeg * Math.PI / 180;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy - radius * Math.sin(angle),
    };
  };

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < segmentCount; i += 1) {
    // Draw from the left edge of the semicircle toward the right edge.
    // As the goal is completed, segments disappear from right to left.
    const startAngle = 180 - (i * stepAngle);
    const endAngle = startAngle - segmentAngle;
    const start = pointOnArc(startAngle);
    const end = pointOnArc(endAngle);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', start.x.toFixed(2));
    line.setAttribute('y1', start.y.toFixed(2));
    line.setAttribute('x2', end.x.toFixed(2));
    line.setAttribute('y2', end.y.toFixed(2));
    line.setAttribute(
      'class',
      `gauge-segment ${i < remainingSegments ? 'is-remaining' : 'is-depleted'}`
    );
    fragment.appendChild(line);
  }

  segmentGroup.replaceChildren(fragment);

  if (svg) {
    const status = remaining > 0
      ? `${pct}% complete, ${formatShort(remaining)} remaining of ${formatShort(goal)} daily goal`
      : `${pct}% complete, daily goal reached`;
    svg.setAttribute('aria-label', status);
  }
}

// ============================================================
// Rendering: top apps with usage bars
// ============================================================
function renderTopApps(today) {
  const container = document.getElementById('top-apps-list');
  const items = today.app_breakdown;

  if (!items || items.length === 0) {
    container.innerHTML = '<div style="font-size:13px;color:var(--text-dim);">No activity recorded yet today.</div>';
    return;
  }

  const maxSeconds = Math.max(...items.map(i => i.total_seconds));
  container.innerHTML = items.slice(0, 5).map((item, idx) => {
    const pct = maxSeconds > 0 ? (item.total_seconds / maxSeconds) * 100 : 0;
    const color = colorForApp(item.app_name);
    return `
      <div class="app-row">
        <span class="app-rank">${idx + 1}</span>
        <div class="app-bar-track"><div class="app-bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="app-name" title="${item.app_name}">${humanizeAppName(item.app_name)}</span>
        <span class="app-time">${formatShort(item.total_seconds)}</span>
      </div>
    `;
  }).join('');
}

// ============================================================
// Rendering: hourly heatmap
// ============================================================
// Map accent names to a representative hex color.
const ACCENT_COLOR_MAP = {
  teal: '#4FAE9D',
  blue: '#5B8DEF',
  purple: '#9575B0',
  rose: '#C9738F',
  green: '#6FBF73',
  orange: '#D9A441',
  indigo: '#6A78D6',
};

let currentAccentName = (localStorage.getItem('focusTracker.accent') || 'teal');

function applyTheme() {
  const theme = localStorage.getItem('focusTracker.theme') || 'dark';
  const accent = localStorage.getItem('focusTracker.accent') || 'teal';
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-accent', accent);
  currentAccentName = accent;
  // Ensure --accent CSS variable is set to the hex for use in canvases and SVG
  const hex = ACCENT_COLOR_MAP[accent] || ACCENT_COLOR_MAP.teal;
  document.documentElement.style.setProperty('--accent', hex);
  // Update quick theme toggle icons (home and settings) to reflect current theme
  try {
    const homeToggle = document.getElementById('theme-switch-home');
    const settingsBtn = document.getElementById('theme-toggle-btn');
    if (homeToggle) {
      const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      homeToggle.textContent = '💡';
      homeToggle.setAttribute('aria-label', label);
      homeToggle.setAttribute('title', label);
    }
    if (settingsBtn) settingsBtn.textContent = theme === 'dark' ? '🌙 Dark' : '☀️ Light';
  } catch (e) { /* ignore */ }
  return { theme, accent };
}
applyTheme();

// Build a 6-step heatmap palette tailored to the accent. First 3 are neutral
// dark background shades, last 2 are accent-derived, final is a highlight.
function getHeatColorsForAccent(accentName) {
  const accent = ACCENT_COLOR_MAP[accentName] || ACCENT_COLOR_MAP.teal;
  // Choose neutral base shades depending on theme
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  let n1, n2, n3;
  if (theme === 'light') {
    // light neutrals for light theme (near-white cells for low activity)
    n1 = '#ffffff';
    n2 = '#f3f3f3';
    n3 = '#e6e6e6';
  } else {
    // dark neutrals for dark theme
    n1 = '#262B32';
    n2 = '#2C3A3D';
    n3 = '#33474A';
  }
  // derive an accent ramp: light tint -> mid tint -> darker shade
  const a_light = tintHex(accent, 0.45);
  const a_mid = tintHex(accent, 0.25);
  const a_dark = shadeHex(accent, 0.18);
  // Return ordered palette: least-intense -> most-intense
  return [n1, n2, n3, a_light, a_mid, a_dark];
}

// Tiny helper: produce a simple tint of a hex color towards white by factor (0..1)
function tintHex(hex, factor) {
  // strip #
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  const nr = Math.round(r + (255 - r) * factor);
  const ng = Math.round(g + (255 - g) * factor);
  const nb = Math.round(b + (255 - b) * factor);
  return `#${nr.toString(16).padStart(2,'0')}${ng.toString(16).padStart(2,'0')}${nb.toString(16).padStart(2,'0')}`;
}

// Shade a hex toward black by `factor` (0..1). factor=0 -> same color, factor=1 -> black
function shadeHex(hex, factor) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  const nr = Math.max(0, Math.round(r * (1 - factor)));
  const ng = Math.max(0, Math.round(g * (1 - factor)));
  const nb = Math.max(0, Math.round(b * (1 - factor)));
  return `#${nr.toString(16).padStart(2,'0')}${ng.toString(16).padStart(2,'0')}${nb.toString(16).padStart(2,'0')}`;
}

function renderHeatmap(heatmap) {
  const daysEl = document.getElementById('heatmap-days');
  const axisEl = document.getElementById('heatmap-hour-axis');
  daysEl.innerHTML = '';
  axisEl.innerHTML = '';

  let maxSeconds = 0;
  for (const day of heatmap.days) {
    for (const secs of day.hours) {
      if (secs > maxSeconds) maxSeconds = secs;
    }
  }

  // Color level mapping: cap each cell to 1 hour when deciding color
  function levelFor(seconds) {
    const capped = Math.min(Math.max(0, seconds || 0), 3600); // cap to 3600s
    if (capped <= 0) return 0;
    const pct = capped / 3600; // 0..1
    // map into 1..5 (0 reserved for empty)
    return Math.min(5, Math.max(1, Math.ceil(pct * 5)));
  }

  // Get palette (ordered least->most intense) and prepare mixing helpers
  const heatColors = getHeatColorsForAccent(currentAccentName);
  const lightest = heatColors[0];
  const darkest = heatColors[heatColors.length - 1];

  function mixHex(h1, h2, t) {
    const p = (hex) => {
      const h = hex.replace('#','');
      return [parseInt(h.substring(0,2),16), parseInt(h.substring(2,4),16), parseInt(h.substring(4,6),16)];
    };
    const a = p(h1), b = p(h2);
    const r = Math.round(a[0] + (b[0]-a[0]) * t);
    const g = Math.round(a[1] + (b[1]-a[1]) * t);
    const bl = Math.round(a[2] + (b[2]-a[2]) * t);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${bl.toString(16).padStart(2,'0')}`;
  }

  // Update legend swatches to show smooth ramp (left=less, right=more)
  try {
    const legend = document.querySelector('.heatmap-legend');
    const swatches = legend ? legend.querySelectorAll('.heat-swatch') : null;
    if (swatches && swatches.length > 0) {
      for (let i = 0; i < swatches.length; i++) {
        const t = (swatches.length === 1) ? 0 : (i / (swatches.length - 1));
        swatches[i].style.background = mixHex(lightest, darkest, t);
      }
      const labels = legend.querySelectorAll('span');
      if (labels && labels.length >= (swatches.length + 2)) {
        // keep label text readable; the swatches now carry the ramp
        labels[0].style.color = getComputedStyle(document.documentElement).getPropertyValue('--text-dim');
        labels[labels.length - 1].style.color = getComputedStyle(document.documentElement).getPropertyValue('--text-dim');
      }
    }
  } catch (e) { /* ignore */ }

  for (const day of heatmap.days) {
    const row = document.createElement('div');
    row.className = 'heat-day-row';

    const label = document.createElement('div');
    label.className = 'heat-day-name';
    label.textContent = new Date(day.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
    row.appendChild(label);

    day.hours.forEach((secs, hour) => {
      const cell = document.createElement('div');
      cell.className = 'heat-cell';
      cell.style.background = heatColors[levelFor(secs)];
      cell.title = `${label.textContent} ${String(hour).padStart(2, '0')}:00 — ${formatShort(secs)}`;
      row.appendChild(cell);
    });

    daysEl.appendChild(row);
  }

  axisEl.appendChild(document.createElement('div'));
  for (let h = 0; h < 24; h++) {
    const tick = document.createElement('div');
    tick.className = 'heat-hour-label';
    tick.textContent = (h % 3 === 0) ? String(h).padStart(2, '0') : '';
    axisEl.appendChild(tick);
  }
}

// ============================================================
// Main load
// ============================================================
// ============================================================
// Streaks & Achievements
//
// Streak = consecutive local calendar days where active_seconds met
// the CURRENT daily goal, walking backward from today. One missed
// day per calendar week (Monday-Sunday) is forgiven and doesn't
// break the streak (but doesn't add to the count either) - a small
// grace mechanic so one bad day doesn't erase real progress. Today
// itself is never counted as a miss while still in progress - it's
// simply skipped until it's either met or the day is over.
//
// Achievements are evaluated client-side against data the backend
// already computed (today/week stats + the streak-data range) - see
// aggregation.get_streak_data's docstring for why the goal itself,
// and therefore streak logic, lives here rather than server-side.
// ============================================================

function _weekMondayKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0) ? 6 : day - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  return monday.toISOString().slice(0, 10);
}

function computeStreak(dailyTotals, goalSeconds) {
  const days = [...dailyTotals].reverse(); // most recent (today) first
  const todayStr = new Date().toISOString().slice(0, 10);
  const graceUsedByWeek = new Set();
  let streak = 0;

  for (const day of days) {
    const met = day.active_seconds >= goalSeconds;

    if (day.date === todayStr && !met) {
      continue; // today isn't over yet - not a miss, just not counted yet
    }

    if (met) {
      streak++;
      continue;
    }

    const weekKey = _weekMondayKey(day.date);
    if (!graceUsedByWeek.has(weekKey)) {
      graceUsedByWeek.add(weekKey);
      continue; // forgiven miss - streak survives, doesn't increment
    }

    break; // second miss in the same week - streak ends here
  }

  return streak;
}

function computePerfectWeek(dailyTotals, goalSeconds) {
  const last7 = dailyTotals.slice(-7);
  if (last7.length < 7) return false;
  return last7.every(d => d.active_seconds >= goalSeconds);
}

const ACHIEVEMENTS = [
  { id: 'streak_3', title: 'Warming Up', desc: '3-day streak', icon: '🔥', check: ctx => ctx.streak >= 3 },
  { id: 'streak_7', title: 'One Week Strong', desc: '7-day streak', icon: '🔥', check: ctx => ctx.streak >= 7 },
  { id: 'streak_30', title: 'Locked In', desc: '30-day streak', icon: '🔥', check: ctx => ctx.streak >= 30 },
  { id: 'streak_100', title: 'Unstoppable', desc: '100-day streak', icon: '🔥', check: ctx => ctx.streak >= 100 },
  { id: 'hours_10', title: 'Getting Started', desc: '10 hours tracked, all-time', icon: '⏱️', check: ctx => ctx.allTimeHours >= 10 },
  { id: 'hours_50', title: 'Building Momentum', desc: '50 hours tracked, all-time', icon: '⏱️', check: ctx => ctx.allTimeHours >= 50 },
  { id: 'hours_100', title: 'Century Club', desc: '100 hours tracked, all-time', icon: '⏱️', check: ctx => ctx.allTimeHours >= 100 },
  { id: 'perfect_week', title: 'Perfect Week', desc: 'Met your goal all 7 days', icon: '🏆', check: ctx => ctx.perfectWeek },
  { id: 'low_switching', title: 'Deep Focus', desc: 'Way fewer app switches than usual, today', icon: '🎯', check: ctx => ctx.lowSwitchingToday },
];

function loadUnlockedAchievements() {
  try {
    return new Set(JSON.parse(localStorage.getItem('chroniq.unlockedAchievements') || '[]'));
  } catch (e) {
    return new Set();
  }
}

function saveUnlockedAchievements(set) {
  localStorage.setItem('chroniq.unlockedAchievements', JSON.stringify([...set]));
}

let lastStreakValue = 0;

function updateStreaksAndAchievements(today, week, streakData) {
  const goalSeconds = getDailyGoalSeconds();
  const streak = computeStreak(streakData.daily_totals, goalSeconds);
  const perfectWeek = computePerfectWeek(streakData.daily_totals, goalSeconds);
  const lowSwitchingToday = week.avg_app_switch_count > 0
    && today.app_switch_count <= week.avg_app_switch_count * 0.5;
  const allTimeHours = streakData.all_time_active_seconds / 3600;

  const ctx = { streak, perfectWeek, lowSwitchingToday, allTimeHours };
  lastStreakValue = streak;

  // Streak badge on the Today page
  const badge = document.getElementById('streak-badge');
  const countEl = document.getElementById('streak-count');
  if (badge && countEl) {
    countEl.textContent = String(streak);
    badge.classList.toggle('has-streak', streak > 0);
  }

  // Streak summary on the Achievements page (harmless to update even
  // when that page isn't currently visible - cheap, keeps it fresh
  // for whenever the user does switch to it)
  const achStreakCount = document.getElementById('achievements-streak-count');
  if (achStreakCount) {
    achStreakCount.textContent = `${streak} day${streak === 1 ? '' : 's'}`;
  }

  // Check for newly-unlocked achievements
  const unlocked = loadUnlockedAchievements();
  const newlyUnlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (!unlocked.has(a.id) && a.check(ctx)) {
      unlocked.add(a.id);
      newlyUnlocked.push(a);
    }
  }
  if (newlyUnlocked.length > 0) {
    saveUnlockedAchievements(unlocked);
    for (const a of newlyUnlocked) {
      showToast(`${a.icon} Achievement unlocked!`, a.title, 'achievement');
    }
  }

  renderAchievementsGrid(unlocked);
}

function renderAchievementsGrid(unlocked) {
  const grid = document.getElementById('achievements-grid');
  if (!grid) return;
  grid.innerHTML = ACHIEVEMENTS.map(a => {
    const isUnlocked = unlocked.has(a.id);
    return `
      <div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'}">
        <div class="achievement-icon">${a.icon}</div>
        <div class="achievement-title">${a.title}</div>
        <div class="achievement-desc">${a.desc}</div>
        ${isUnlocked ? '' : '<div class="achievement-lock">🔒 Locked</div>'}
      </div>
    `;
  }).join('');
}

async function loadAll() {
  setStatus('Loading…');
  let today, week, heatmap, streakData;
  try {
    [today, week, heatmap, streakData] = await Promise.all([
      fetchJSON('/summary/today'),
      fetchJSON('/summary/week'),
      fetchJSON('/summary/heatmap'),
      fetchJSON('/summary/streak-data?days=120'),
    ]);
  } catch (err) {
    console.error(err);
    setStatus('Could not reach the backend. Is scripts/run_backend.py running?', true);
    return;
  }

  try {
    renderTopBar(today);
    renderKPIs(today, week);
    renderInsights(today, week);
    renderGauge(today);
    renderTopApps(today);
    renderHeatmap(heatmap);
    updateStreaksAndAchievements(today, week, streakData);
    setStatus(`Last updated ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error(err);
    setStatus('Data loaded but the dashboard failed to render - check the browser console.', true);
  }
}

document.getElementById('refresh-btn').addEventListener('click', loadAll);
loadAll();
setInterval(loadAll, 60000);

// ============================================================
// Pomodoro session engine (client-side only - see README for why
// this stays independent of the passive tracking backend)
// ============================================================
let settings = {
  focusMin: 25,
  shortBreakMin: 5,
  cyclesBeforeLong: 4,
  longBreakMin: 20,
};

try {
  const stored = JSON.parse(localStorage.getItem('focusTracker.pomodoroSettings') || 'null');
  if (stored) settings = { ...settings, ...stored };
} catch (e) { /* ignore malformed stored settings */ }

function persistSettings() {
  localStorage.setItem('focusTracker.pomodoroSettings', JSON.stringify(settings));
}

// Note: #settings-toggle (the gear icon) is wired further down to
// navigate to the Settings page - see the nav/view-switching section.

['set-focus', 'set-short', 'set-cycles', 'set-long'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    if (sessionState !== 'idle') {
      applySettingsToInputs();
      return;
    }
    settings.focusMin = +document.getElementById('set-focus').value;
    settings.shortBreakMin = +document.getElementById('set-short').value;
    settings.cyclesBeforeLong = +document.getElementById('set-cycles').value;
    settings.longBreakMin = +document.getElementById('set-long').value;
    persistSettings();
    renderCycleDots();
  });
});

function applySettingsToInputs() {
  document.getElementById('set-focus').value = settings.focusMin;
  document.getElementById('set-short').value = settings.shortBreakMin;
  document.getElementById('set-cycles').value = settings.cyclesBeforeLong;
  document.getElementById('set-long').value = settings.longBreakMin;
  const notifyToggle = document.getElementById('set-notify');
  if (notifyToggle) notifyToggle.checked = notificationsEnabled();
}
applySettingsToInputs();

const notifyToggleEl = document.getElementById('set-notify');
if (notifyToggleEl) {
  notifyToggleEl.addEventListener('change', () => {
    setNotificationsEnabled(notifyToggleEl.checked);
  });
}

let sessionState = 'idle';
let phase = 'idle';
let remainingSeconds = 0;
// Absolute wall-clock time (epoch ms) the current running phase ends.
// The countdown is derived from this, NOT from counting interval ticks -
// setInterval is throttled to a crawl while the window is minimized or
// hidden, so tick-counting would freeze the timer. null when idle/paused.
let phaseEndsAt = null;
let completedCycles = 0;
let timerInterval = null;
let activeTaskName = null;

const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnStop = document.getElementById('btn-stop');
const statusEl = document.getElementById('session-status');
const phaseLabel = document.getElementById('phase-label');
const nowElapsed = document.getElementById('now-elapsed');
const nowElapsedLabel = document.getElementById('now-elapsed-label');
const nowName = document.getElementById('now-name');
const nowSub = document.getElementById('now-sub');
const nowDot = document.getElementById('now-dot');
const cycleDotsEl = document.getElementById('cycle-dots');

function phaseDurationSeconds(p) {
  if (p === 'focus') return Math.max(1, settings.focusMin * 60);
  if (p === 'short_break') return Math.max(1, settings.shortBreakMin * 60);
  if (p === 'long_break') return Math.max(1, settings.longBreakMin * 60);
  return 0;
}

// ============================================================
// Session pop-up notifications
// Fires on every automatic phase change: when a focus block runs
// down (break starts) and when a break runs down (focus resumes).
// Always shows an in-app toast; also raises a desktop notification
// when the OS has granted permission (works in the packaged Edge
// app window; the toast is the fallback everywhere else).
// ============================================================
const toastStack = document.getElementById('toast-stack');

function notificationsEnabled() {
  return localStorage.getItem('focusTracker.notifyEnabled') !== 'false';
}

function setNotificationsEnabled(on) {
  localStorage.setItem('focusTracker.notifyEnabled', on ? 'true' : 'false');
  if (on) requestNotifyPermission();
}

function requestNotifyPermission() {
  // Must be called from a user gesture (e.g. clicking Start) or the
  // browser silently ignores the request.
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  } catch (e) { /* Notification API absent in this shell */ }
}

function dismissToast(el) {
  if (!el || el.classList.contains('toast-out')) return;
  el.classList.add('toast-out');
  setTimeout(() => el.remove(), 220);
}

function showToast(title, text, tone) {
  if (!toastStack) return;
  const el = document.createElement('div');
  const toneClass = tone === 'break' ? 'break' : tone === 'achievement' ? 'achievement' : 'focus';
  el.className = 'toast tone-' + toneClass;

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = tone === 'break' ? '☕' : tone === 'achievement' ? '🏆' : '⏱️';

  const body = document.createElement('div');
  body.className = 'toast-body';
  const t = document.createElement('div');
  t.className = 'toast-title';
  t.textContent = title;
  const p = document.createElement('div');
  p.className = 'toast-text';
  p.textContent = text;
  body.append(t, p);

  const close = document.createElement('button');
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '✕';
  close.addEventListener('click', () => dismissToast(el));

  el.append(icon, body, close);
  toastStack.appendChild(el);

  // Never stack more than three at once.
  while (toastStack.children.length > 3) toastStack.firstElementChild.remove();

  setTimeout(() => dismissToast(el), 9000);
}

function notifySession(title, text, tone) {
  if (!notificationsEnabled()) return;
  showToast(title, text, tone);
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, {
        body: text,
        tag: 'chroniq-session',
        renotify: true,
        icon: 'logo.png',
      });
      n.onclick = () => { try { window.focus(); } catch (e) {} n.close(); };
      setTimeout(() => n.close(), 9000);
    }
  } catch (e) { /* Notification API absent (e.g. some WebView hosts) */ }
}

function announcePhaseChange(fromPhase, toPhase) {
  const mins = Math.max(1, Math.round(phaseDurationSeconds(toPhase) / 60));
  const taskSuffix = activeTaskName ? ` (${activeTaskName})` : '';
  if (fromPhase === 'focus') {
    const label = toPhase === 'long_break' ? 'Long break' : 'Break';
    notifySession(
      `Focus block complete${taskSuffix}`,
      `${label} started — ${mins} min. Step away from the screen.`,
      'break',
    );
  } else {
    const label = fromPhase === 'long_break' ? 'Long break' : 'Break';
    notifySession(
      `${label} over`,
      `Focus block started — ${mins} min. Back to it${taskSuffix}.`,
      'focus',
    );
  }
}

function phaseDisplayName(p) {
  if (p === 'focus') return 'Focus';
  if (p === 'short_break') return 'Short Break';
  if (p === 'long_break') return 'Long Break';
  return 'Idle';
}

function renderCycleDots() {
  cycleDotsEl.innerHTML = '';
  for (let i = 0; i < settings.cyclesBeforeLong; i++) {
    const dot = document.createElement('div');
    dot.className = 'cycle-dot';
    if (i < completedCycles) dot.classList.add('filled');
    if (i === completedCycles && phase === 'focus') dot.classList.add('current');
    cycleDotsEl.appendChild(dot);
  }
}

// Anchor the running phase to end `seconds` from now.
function armPhase(seconds) {
  remainingSeconds = Math.max(0, Math.round(seconds));
  phaseEndsAt = Date.now() + remainingSeconds * 1000;
}

// Move to the next phase. Chains phaseEndsAt off the *previous* end
// rather than "now" so that catching up through several boundaries
// missed while minimized stays aligned to real elapsed time.
function advancePhase(announce) {
  const fromPhase = phase;
  if (phase === 'focus') {
    completedCycles += 1;
    phase = (completedCycles >= settings.cyclesBeforeLong) ? 'long_break' : 'short_break';
  } else if (phase === 'short_break') {
    phase = 'focus';
  } else if (phase === 'long_break') {
    completedCycles = 0;
    phase = 'focus';
  }
  const dur = phaseDurationSeconds(phase);
  remainingSeconds = dur;
  phaseEndsAt = (phaseEndsAt == null ? Date.now() : phaseEndsAt) + dur * 1000;
  if (announce) announcePhaseChange(fromPhase, phase);
}

// Recompute the countdown from the wall clock and roll past any phase
// boundaries that have already elapsed. Runs every second while the
// window is visible, and immediately when it regains focus.
function syncTimer() {
  if (sessionState !== 'running' || phaseEndsAt == null) return;

  let advanced = false;
  let guard = 0;
  while (Date.now() >= phaseEndsAt && guard++ < 1000) {
    // Only play the phase-change notification for a boundary that just
    // happened - not for ones we're replaying after a long minimize.
    advancePhase(Date.now() - phaseEndsAt < 2000);
    advanced = true;
  }

  remainingSeconds = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
  if (advanced) {
    updateUI();
  } else {
    nowElapsed.textContent = formatMMSS(remainingSeconds);
  }
}

function updateUI() {
  btnStart.disabled = (sessionState !== 'idle');
  btnPause.disabled = (sessionState === 'idle');
  btnStop.disabled = (sessionState === 'idle');
  btnPause.textContent = (sessionState === 'paused') ? '▶ Resume' : '⏸ Pause';

  phaseLabel.className = 'phase-label phase-' + phase;
  phaseLabel.textContent = phaseDisplayName(phase) + (sessionState === 'paused' ? ' · Paused' : '');

  nowElapsed.textContent = formatMMSS(remainingSeconds);
  nowElapsedLabel.textContent =
    phase === 'focus' ? 'Focus block remaining' :
    phase === 'short_break' ? 'Short break remaining' :
    phase === 'long_break' ? 'Long break remaining' :
    'Focus block remaining';

  // The session-status chip is optional in the markup - guard for it.
  const setSessionChip = (cls, html) => {
    if (!statusEl) return;
    statusEl.className = cls;
    statusEl.innerHTML = html;
  };
  if (sessionState === 'running') {
    setSessionChip('session-status running', '<span class="dot"></span>' + phaseDisplayName(phase));
    nowDot.classList.remove('idle-dot');
  } else if (sessionState === 'paused') {
    setSessionChip('session-status', '<span class="dot"></span>' + phaseDisplayName(phase) + ' (paused)');
    nowDot.classList.add('idle-dot');
  } else {
    setSessionChip('session-status', '<span class="dot"></span>Not tracking a session');
    nowDot.classList.add('idle-dot');
    nowName.textContent = 'No active session';
    nowSub.textContent = 'Click Start Focus or start a task';
  }

  document.querySelectorAll('.settings-field input:not([type="checkbox"])').forEach(inp => {
    inp.disabled = (sessionState !== 'idle');
  });

  renderCycleDots();
}

function startSession(taskName, taskTag, designatedDurationMin) {
  // Starting a session is a user gesture - the only point where the
  // browser will honour a notification permission prompt.
  requestNotifyPermission();

  sessionState = 'running';
  phase = 'focus';
  completedCycles = 0;

  // If the task provides a designated duration (minutes), use that for this
  // session's initial focus block. Otherwise fall back to the configured
  // pomodoro focus length.
  const firstBlockSeconds = (designatedDurationMin && !isNaN(designatedDurationMin) && designatedDurationMin > 0)
    ? Math.floor(designatedDurationMin * 60)
    : phaseDurationSeconds('focus');
  armPhase(firstBlockSeconds);

  if (taskName) {
    activeTaskName = taskName;
    nowName.textContent = taskName;
    nowSub.textContent = taskTag || '';
  } else {
    activeTaskName = null;
    nowName.textContent = 'General Focus';
    nowSub.textContent = 'Manual session';
  }

  timerInterval = setInterval(syncTimer, 1000);
  updateUI();
}

function pauseOrResumeSession() {
  if (sessionState === 'running') {
    syncTimer();  // settle any boundary that just passed before freezing
    sessionState = 'paused';
    clearInterval(timerInterval);
    timerInterval = null;
    // Freeze the remaining time and drop the wall-clock anchor.
    remainingSeconds = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
    phaseEndsAt = null;
  } else if (sessionState === 'paused') {
    sessionState = 'running';
    armPhase(remainingSeconds);
    timerInterval = setInterval(syncTimer, 1000);
  }
  updateUI();
}

function stopSession() {
  sessionState = 'idle';
  phase = 'idle';
  clearInterval(timerInterval);
  timerInterval = null;
  remainingSeconds = 0;
  phaseEndsAt = null;
  completedCycles = 0;
  activeTaskName = null;
  document.querySelectorAll('.task-row.active-task').forEach(row => {
    row.classList.remove('active-task');
    row.querySelector('.task-start-btn').textContent = '▶ Start';
  });
  updateUI();
  nowElapsed.textContent = formatMMSS(phaseDurationSeconds('focus'));
}

btnStart.addEventListener('click', () => startSession(null, null));
btnPause.addEventListener('click', pauseOrResumeSession);
btnStop.addEventListener('click', stopSession);

// The 1s interval is throttled hard (or paused outright) while the app
// is minimized / hidden, so also catch the timer up the instant the
// window comes back - don't wait for the next lazy tick.
['visibilitychange', 'focus', 'pageshow'].forEach((evt) => {
  const target = evt === 'visibilitychange' ? document : window;
  target.addEventListener(evt, () => {
    if (sessionState === 'running') syncTimer();
  });
});

// ============================================================
// Task sessions (persisted locally)
// ============================================================
const taskList = document.getElementById('task-list');

const DEFAULT_TASKS = [
  { name: 'Code Feature', tag: 'Code.exe', durationMin: 24 },
  { name: 'Analyze Feedback', tag: 'Explorer.exe', durationMin: 20 },
  { name: 'Write Documentation', tag: 'Notion.exe', durationMin: 30 },
  { name: 'Review PR', tag: 'chrome.exe', durationMin: null },
];

function loadTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem('focusTracker.tasks') || 'null');
    // Backwards compatibility: tasks may be an array of {name, tag} or {name, tag, durationMin}
    if (stored && Array.isArray(stored)) return stored.map(t => ({ name: t.name, tag: t.tag || '', durationMin: (t.durationMin != null) ? t.durationMin : (t.duration ? t.duration : null) }));
    return DEFAULT_TASKS;
  } catch (e) {
    return DEFAULT_TASKS;
  }
}

function persistTasks() {
  const tasks = [...taskList.querySelectorAll('.task-row')].map(row => ({
    name: row.dataset.task,
    tag: row.dataset.tag,
    durationMin: row.dataset.durationMin ? parseInt(row.dataset.durationMin, 10) : null,
  }));
  localStorage.setItem('focusTracker.tasks', JSON.stringify(tasks));
}

function attachTaskRowHandlers(row) {
  const startBtn = row.querySelector('.task-start-btn');
  const editBtn = row.querySelector('.task-edit-btn');
  const deleteBtn = row.querySelector('.task-delete-btn');

  startBtn.addEventListener('click', () => {
    const isThisTaskActive = row.classList.contains('active-task');
    if (isThisTaskActive) {
      stopSession();
      return;
    }
    document.querySelectorAll('.task-row.active-task').forEach(r => {
      r.classList.remove('active-task');
      r.querySelector('.task-start-btn').textContent = '▶ Start';
    });
    if (sessionState !== 'idle') clearInterval(timerInterval);
    row.classList.add('active-task');
    startBtn.textContent = '■ Stop';
    // If task has a designated duration, use it; otherwise fall back to pomodoro focus length
    const dur = row.dataset.durationMin ? parseInt(row.dataset.durationMin, 10) : null;
    startSession(row.dataset.task, row.dataset.tag, dur);
  });

  editBtn.addEventListener('click', () => {
    const newName = prompt('Task name:', row.dataset.task);
    if (!newName || !newName.trim()) return;
    const newTag = prompt('App / detail (optional):', row.dataset.tag || '');

    // Ask for an optional duration in minutes (leave blank to keep pomodoro defaults)
    const durInput = prompt('Designated time for this task (minutes) — leave blank to use Pomodoro focus length:', row.dataset.durationMin || '');
    const durVal = durInput && durInput.trim() !== '' ? parseInt(durInput, 10) : null;

    row.dataset.task = newName.trim();
    row.dataset.tag = (newTag || '').trim();
    if (durVal && !isNaN(durVal) && durVal > 0) row.dataset.durationMin = String(durVal);
    else row.dataset.durationMin = '';
    row.querySelector('.task-name').textContent = row.dataset.task;
    // Display tag with duration if present
    const displayTag = row.dataset.tag || 'No detail added';
    const displayWithDur = row.dataset.durationMin ? `${displayTag} · ${row.dataset.durationMin}m` : displayTag;
    row.querySelector('.task-tag').textContent = displayWithDur;

    // If this task is the one currently running, keep the live session
    // display in sync with the rename instead of showing stale text.
    if (row.classList.contains('active-task')) {
      nowName.textContent = row.dataset.task;
      nowSub.textContent = row.dataset.tag;
    }
    persistTasks();
  });

  deleteBtn.addEventListener('click', () => {
    const wasActive = row.classList.contains('active-task');
    if (!confirm(`Delete task "${row.dataset.task}"?`)) return;
    row.remove();
    if (wasActive) stopSession();
    persistTasks();
  });
}

function buildTaskRow(name, tag) {
  const row = document.createElement('div');
  row.className = 'task-row';
  row.dataset.task = name;
  row.dataset.tag = tag || '';
  // durationMin may come from the tag in legacy data; leave blank by default
  row.dataset.durationMin = '';
  row.innerHTML = `
    <div class="task-info">
      <div class="task-name">${name}</div>
      <div class="task-tag">${tag || 'No detail added'}</div>
    </div>
    <div class="task-actions">
      <button class="task-icon-btn task-edit-btn" title="Edit task">✎</button>
      <button class="task-icon-btn task-delete-btn" title="Delete task">✕</button>
      <button class="task-start-btn">▶ Start</button>
    </div>
  `;
  attachTaskRowHandlers(row);
  return row;
}

taskList.innerHTML = '';
for (const t of loadTasks()) {
  const row = buildTaskRow(t.name, t.tag);
  if (t.durationMin) row.dataset.durationMin = String(t.durationMin);
  // update visible tag to show minutes when present
  const tagEl = row.querySelector('.task-tag');
  tagEl.textContent = row.dataset.durationMin ? `${row.dataset.tag} · ${row.dataset.durationMin}m` : row.dataset.tag || 'No detail added';
  taskList.appendChild(row);
}

document.getElementById('add-task-btn').addEventListener('click', () => {
  const name = prompt('Task name:');
  if (!name || !name.trim()) return;
  const tag = prompt('App / detail (optional):', '');
  const dur = prompt('Designated time for this task (minutes) — leave blank to use Pomodoro focus length:', '');
  const row = buildTaskRow(name.trim(), (tag || '').trim());
  if (dur && dur.trim() !== '') row.dataset.durationMin = String(parseInt(dur, 10));
  const tagEl = row.querySelector('.task-tag');
  tagEl.textContent = row.dataset.durationMin ? `${row.dataset.tag} · ${row.dataset.durationMin}m` : row.dataset.tag || 'No detail added';
  taskList.appendChild(row);
  persistTasks();
});

updateUI();

// ============================================================
// Nav / view switching
// ============================================================
const viewToday = document.getElementById('view-today');
const viewWeekly = document.getElementById('view-weekly');
const viewAchievements = document.getElementById('view-achievements');
const viewSettings = document.getElementById('view-settings');
const navToday = document.getElementById('nav-today');
const navWeekly = document.getElementById('nav-weekly');
const navAchievements = document.getElementById('nav-achievements');
const navSettings = document.getElementById('nav-settings');

function showView(view) {
  viewToday.style.display = (view === 'today') ? '' : 'none';
  viewWeekly.style.display = (view === 'weekly') ? '' : 'none';
  viewAchievements.style.display = (view === 'achievements') ? '' : 'none';
  viewSettings.style.display = (view === 'settings') ? '' : 'none';
  navToday.classList.toggle('active', view === 'today');
  navWeekly.classList.toggle('active', view === 'weekly');
  navAchievements.classList.toggle('active', view === 'achievements');
  navSettings.classList.toggle('active', view === 'settings');
  if (view === 'weekly') loadWeeklyPage();
  if (view === 'settings') loadSettingsPage();
  if (view === 'achievements') {
    renderAchievementsGrid(loadUnlockedAchievements());
    const statusEl = document.getElementById('achievements-status-text');
    if (statusEl) statusEl.textContent = `${ACHIEVEMENTS.filter(a => loadUnlockedAchievements().has(a.id)).length} of ${ACHIEVEMENTS.length} unlocked`;
  }
}

navToday.addEventListener('click', () => showView('today'));
navWeekly.addEventListener('click', () => showView('weekly'));
navAchievements.addEventListener('click', () => showView('achievements'));
navSettings.addEventListener('click', () => showView('settings'));
// Quick timer popover (opens from gear in the now-card)
document.getElementById('settings-toggle').addEventListener('click', (e) => {
  e.stopPropagation();
  const pop = document.getElementById('quick-timer-popover');
  if (pop.style.display === 'none' || !pop.style.display) {
    openQuickTimerPopover();
  } else {
    closeQuickTimerPopover();
  }
});

function openQuickTimerPopover() {
  const pop = document.getElementById('quick-timer-popover');
  pop.style.display = 'block';
  // populate with current settings
  document.getElementById('quick-focus').value = settings.focusMin;
  document.getElementById('quick-short').value = settings.shortBreakMin;
  document.getElementById('quick-long').value = settings.longBreakMin;
  // wire buttons
  document.getElementById('quick-apply').onclick = () => {
    const f = parseInt(document.getElementById('quick-focus').value, 10);
    const s = parseInt(document.getElementById('quick-short').value, 10);
    const l = parseInt(document.getElementById('quick-long').value, 10);
    if (!isNaN(f) && f > 0) settings.focusMin = f;
    if (!isNaN(s) && s > 0) settings.shortBreakMin = s;
    if (!isNaN(l) && l > 0) settings.longBreakMin = l;
    persistSettings();
    applySettingsToInputs();
    renderCycleDots();
    closeQuickTimerPopover();
  };
  document.getElementById('quick-start-now').onclick = () => {
    const f = parseInt(document.getElementById('quick-focus').value, 10);
    if (!isNaN(f) && f > 0) {
      // start an immediate manual session with this duration
      startSession(null, null, f);
      closeQuickTimerPopover();
    }
  };
  document.getElementById('quick-timer-close').onclick = closeQuickTimerPopover;

  // close on outside click or Escape
  setTimeout(() => {
    window.addEventListener('click', outsideClickListener);
    window.addEventListener('keydown', escapeListener);
  }, 0);
}

function closeQuickTimerPopover() {
  const pop = document.getElementById('quick-timer-popover');
  if (!pop) return;
  pop.style.display = 'none';
  window.removeEventListener('click', outsideClickListener);
  window.removeEventListener('keydown', escapeListener);
}

function outsideClickListener(e) {
  const pop = document.getElementById('quick-timer-popover');
  const toggle = document.getElementById('settings-toggle');
  if (!pop.contains(e.target) && e.target !== toggle) closeQuickTimerPopover();
}

function escapeListener(e) {
  if (e.key === 'Escape') closeQuickTimerPopover();
}

// ============================================================
// Settings page
// ============================================================
function loadSettingsPage() {
  // Theme toggle button state
  const theme = localStorage.getItem('focusTracker.theme') || 'dark';
  const themeBtn = document.getElementById('theme-toggle-btn');
  themeBtn.textContent = theme === 'dark' ? '🌙 Dark' : '☀️ Light';

  // Accent swatch selected state
  const accent = localStorage.getItem('focusTracker.accent') || 'teal';
  document.querySelectorAll('.accent-swatch').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.accent === accent);
  });

  // Daily goal input, pre-filled with the current value
  document.getElementById('settings-goal-hours').value = (getDailyGoalSeconds() / 3600).toFixed(1);

  // Pomodoro inputs already reflect `settings` via applySettingsToInputs()
  applySettingsToInputs();
}

document.getElementById('theme-toggle-btn').addEventListener('click', () => {
  const current = localStorage.getItem('focusTracker.theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('focusTracker.theme', next);
  applyTheme();
  loadSettingsPage();
});

// Quick theme toggle on the top bar
const homeThemeBtn = document.getElementById('theme-switch-home');
if (homeThemeBtn) {
  homeThemeBtn.addEventListener('click', () => {
    const current = localStorage.getItem('focusTracker.theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('focusTracker.theme', next);
    applyTheme();
    loadSettingsPage();
  });
}

document.querySelectorAll('.accent-swatch').forEach(btn => {
  btn.addEventListener('click', () => {
    localStorage.setItem('focusTracker.accent', btn.dataset.accent);
    applyTheme();
    loadSettingsPage();
    // Accent affects the gauge stroke and weekly chart bar color, both
    // set inline rather than via CSS - refresh whichever page is visible
    // so the change is reflected immediately instead of on next reload.
    if (viewToday.style.display !== 'none') loadAll();
    if (weeklyChart) { weeklyChart.destroy(); weeklyChart = null; loadWeeklyPage(); }
  });
});

document.getElementById('settings-goal-save').addEventListener('click', () => {
  const hours = parseFloat(document.getElementById('settings-goal-hours').value);
  if (isNaN(hours) || hours <= 0) return;
  setDailyGoalSeconds(Math.round(hours * 3600));
  if (viewToday.style.display !== 'none') renderGauge({ total_active_seconds: 0 }); // will be corrected by next loadAll tick
  loadAll();
});

document.getElementById('settings-reset-btn').addEventListener('click', () => {
  if (!confirm('Reset theme, accent, daily goal, timer settings, and tasks to defaults? Your tracked activity data is not affected.')) return;
  ['focusTracker.theme', 'focusTracker.accent', 'focusTracker.dailyGoalSeconds', 'focusTracker.pomodoroSettings', 'focusTracker.tasks']
    .forEach(key => localStorage.removeItem(key));
  location.reload();
});

// ============================================================
// Weekly page
// ============================================================
let weeklyChart = null;

function mostRecentMonday() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0) ? 6 : day - 1; // days since Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() - diff);
  return monday.toISOString().slice(0, 10);
}

async function loadWeeklyPage() {
  const statusEl = document.getElementById('weekly-status-text');
  statusEl.textContent = 'Loading…';

  const thisMonday = mostRecentMonday();
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);
  const lastMondayStr = lastMonday.toISOString().slice(0, 10);

  let thisWeek, lastWeek, dayDetails;
  try {
    [thisWeek, lastWeek] = await Promise.all([
      fetchJSON(`/summary/week?start_date=${thisMonday}`),
      fetchJSON(`/summary/week?start_date=${lastMondayStr}`),
    ]);
    // Per-day detail (idle time, top app) isn't in the weekly summary,
    // so fetch each day individually - reuses the existing /summary/day
    // endpoint rather than adding a new one just for this table.
    dayDetails = await Promise.all(
      thisWeek.daily_totals.map(d => fetchJSON(`/summary/day?target_date=${d.date}`))
    );
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Could not load weekly data.';
    statusEl.style.color = '#C97B5E';
    return;
  }

  const thisTotal = thisWeek.daily_totals.reduce((a, d) => a + d.active_seconds, 0);
  const lastTotal = lastWeek.daily_totals.reduce((a, d) => a + d.active_seconds, 0);

  document.getElementById('weekly-total').textContent = formatHMS(thisTotal);
  document.getElementById('weekly-range').textContent = `${thisWeek.start_date} → ${thisWeek.end_date}`;
  document.getElementById('weekly-this-total').textContent = formatShort(thisTotal);
  document.getElementById('weekly-last-total').textContent = formatShort(lastTotal);

  const maxTotal = Math.max(thisTotal, lastTotal, 1);
  document.getElementById('weekly-this-bar').style.width = `${(thisTotal / maxTotal) * 100}%`;
  document.getElementById('weekly-last-bar').style.width = `${(lastTotal / maxTotal) * 100}%`;

  const deltaEl = document.getElementById('weekly-delta');
  const deltaBar = document.getElementById('weekly-delta-bar');
  if (lastTotal > 0) {
    const pctDelta = ((thisTotal - lastTotal) / lastTotal) * 100;
    const sign = pctDelta >= 0 ? '+' : '';
    deltaEl.textContent = `${sign}${Math.round(pctDelta)}%`;
    deltaEl.className = 'kpi-value ' + (pctDelta >= 0 ? 'good' : 'warn');
    deltaBar.style.width = `${Math.min(100, Math.abs(pctDelta))}%`;
    deltaBar.style.background = pctDelta >= 0 ? 'var(--accent)' : 'var(--danger)';
  } else {
    deltaEl.textContent = '—';
    deltaBar.style.width = '0%';
  }

  // Top apps this week
  const topAppsEl = document.getElementById('weekly-top-apps');
  if (thisWeek.top_apps.length === 0) {
    topAppsEl.innerHTML = '<div style="font-size:13px;color:var(--text-dim);">No activity recorded this week.</div>';
  } else {
    const maxApp = Math.max(...thisWeek.top_apps.map(a => a.total_seconds));
    topAppsEl.innerHTML = thisWeek.top_apps.slice(0, 5).map((item, idx) => {
      const pct = maxApp > 0 ? (item.total_seconds / maxApp) * 100 : 0;
      const color = colorForApp(item.app_name);
      return `
        <div class="app-row">
          <span class="app-rank">${idx + 1}</span>
          <div class="app-bar-track"><div class="app-bar-fill" style="width:${pct}%;background:${color}"></div></div>
          <span class="app-name" title="${item.app_name}">${humanizeAppName(item.app_name)}</span>
          <span class="app-time">${formatShort(item.total_seconds)}</span>
        </div>
      `;
    }).join('');
  }

  // Day-by-day table
  const dayTableEl = document.getElementById('weekly-day-table');
  dayTableEl.innerHTML = dayDetails.map(day => {
    const dayName = weekdayName(day.date);
    const topApp = day.app_breakdown.length > 0 ? humanizeAppName(day.app_breakdown[0].app_name) : '—';
    return `
      <div class="day-table-row">
        <div>
          <span class="day-table-name">${dayName}</span>
          <span class="day-table-date">${day.date}</span>
        </div>
        <div class="day-table-value">${formatShort(day.total_active_seconds)} · ${topApp}</div>
      </div>
    `;
  }).join('');

  renderWeeklyChart(thisWeek.daily_totals);
  statusEl.textContent = `Last updated ${new Date().toLocaleTimeString()}`;
  statusEl.style.color = '';
}

function renderWeeklyChart(dailyTotals) {
  const canvas = document.getElementById('weekly-chart');
  if (typeof Chart === 'undefined') {
    canvas.replaceWith(Object.assign(document.createElement('div'), {
      style: 'font-size:13px;color:var(--text-dim);',
      textContent: 'Chart library failed to load - check your internet connection.',
    }));
    return;
  }

  const labels = dailyTotals.map(d => weekdayName(d.date).slice(0, 3));
  const hours = dailyTotals.map(d => +(d.active_seconds / 3600).toFixed(2));
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

  if (weeklyChart) {
    weeklyChart.data.labels = labels;
    weeklyChart.data.datasets[0].data = hours;
    weeklyChart.data.datasets[0].backgroundColor = accentColor;
    weeklyChart.update();
    return;
  }

  weeklyChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Active hours',
        data: hours,
        backgroundColor: accentColor,
        borderRadius: 4,
        maxBarThickness: 40,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y.toFixed(1)}h active` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8B92A0', font: { family: 'IBM Plex Mono', size: 11 } } },
        y: { beginAtZero: true, grid: { color: '#2C3138' }, ticks: { color: '#8B92A0', font: { family: 'IBM Plex Mono', size: 11 } } },
      },
    },
  });
}

document.getElementById('weekly-refresh-btn').addEventListener('click', loadWeeklyPage);
