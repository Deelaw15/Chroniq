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
// Rendering: top bar
// ============================================================
function renderTopBar(today) {
  document.getElementById('main-elapsed').textContent = formatHMS(today.total_active_seconds);
  document.getElementById('idle-inline').textContent = `Idle ${formatHMS(today.total_idle_seconds)}`;
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

  document.getElementById('kpi-switches').textContent = today.app_switch_count;
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
  const goal = getDailyGoalSeconds();
  const active = today.total_active_seconds;
  const pct = Math.min(100, Math.round((active / goal) * 100));

  document.getElementById('gauge-pct').textContent = `${pct}%`;
  document.getElementById('gauge-sub').textContent = `of ${formatShort(goal)} daily goal`;

  const remaining = Math.max(0, goal - active);
  document.getElementById('gauge-goal-text').textContent =
    remaining > 0
      ? `${formatShort(active)} logged · ${formatShort(remaining)} remaining`
      : `${formatShort(active)} logged · goal reached`;

  const cx = 110, cy = 120, r = 90;
  const angle = Math.PI * (1 - pct / 100);
  const x = cx - r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);
  const largeArc = pct > 50 ? 1 : 0;
  document.getElementById('gauge-arc').setAttribute(
    'd', `M 20 120 A ${r} ${r} 0 ${largeArc} 1 ${x.toFixed(1)} ${y.toFixed(1)}`
  );
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
        <span class="app-name" title="${item.app_name}">${item.app_name}</span>
        <span class="app-time">${formatShort(item.total_seconds)}</span>
      </div>
    `;
  }).join('');
}

// ============================================================
// Rendering: hourly heatmap
// ============================================================
const heatColors = ['#262B32', '#2C3A3D', '#33474A', '#4FAE9D', '#7BC4B5', '#D9A441'];

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

  function levelFor(seconds) {
    if (seconds <= 0 || maxSeconds <= 0) return 0;
    return Math.min(5, Math.ceil((seconds / maxSeconds) * 5));
  }

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
async function loadAll() {
  setStatus('Loading…');
  let today, week, heatmap;
  try {
    [today, week, heatmap] = await Promise.all([
      fetchJSON('/summary/today'),
      fetchJSON('/summary/week'),
      fetchJSON('/summary/heatmap'),
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

const settingsToggle = document.getElementById('settings-toggle');
const settingsForm = document.getElementById('settings-form');
settingsToggle.addEventListener('click', () => settingsForm.classList.toggle('open'));

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
}
applySettingsToInputs();

let sessionState = 'idle';
let phase = 'idle';
let remainingSeconds = 0;
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
  if (p === 'focus') return settings.focusMin * 60;
  if (p === 'short_break') return settings.shortBreakMin * 60;
  if (p === 'long_break') return settings.longBreakMin * 60;
  return 0;
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

function tick() {
  remainingSeconds -= 1;
  nowElapsed.textContent = formatMMSS(remainingSeconds);
  if (remainingSeconds <= 0) advancePhase();
}

function advancePhase() {
  if (phase === 'focus') {
    completedCycles += 1;
    phase = (completedCycles >= settings.cyclesBeforeLong) ? 'long_break' : 'short_break';
  } else if (phase === 'short_break') {
    phase = 'focus';
  } else if (phase === 'long_break') {
    completedCycles = 0;
    phase = 'focus';
  }
  remainingSeconds = phaseDurationSeconds(phase);
  updateUI();
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

  if (sessionState === 'running') {
    statusEl.className = 'session-status running';
    statusEl.innerHTML = '<span class="dot"></span>' + phaseDisplayName(phase);
    nowDot.classList.remove('idle-dot');
  } else if (sessionState === 'paused') {
    statusEl.className = 'session-status';
    statusEl.innerHTML = '<span class="dot"></span>' + phaseDisplayName(phase) + ' (paused)';
    nowDot.classList.add('idle-dot');
  } else {
    statusEl.className = 'session-status';
    statusEl.innerHTML = '<span class="dot"></span>Not tracking a session';
    nowDot.classList.add('idle-dot');
    nowName.textContent = 'No active session';
    nowSub.textContent = 'Click Start Focus or start a task';
  }

  document.querySelectorAll('.settings-field input').forEach(inp => {
    inp.disabled = (sessionState !== 'idle');
  });

  renderCycleDots();
}

function startSession(taskName, taskTag) {
  sessionState = 'running';
  phase = 'focus';
  remainingSeconds = phaseDurationSeconds('focus');
  completedCycles = 0;

  if (taskName) {
    activeTaskName = taskName;
    nowName.textContent = taskName;
    nowSub.textContent = taskTag || '';
  } else {
    activeTaskName = null;
    nowName.textContent = 'General Focus';
    nowSub.textContent = 'Manual session';
  }

  timerInterval = setInterval(tick, 1000);
  updateUI();
}

function pauseOrResumeSession() {
  if (sessionState === 'running') {
    sessionState = 'paused';
    clearInterval(timerInterval);
  } else if (sessionState === 'paused') {
    sessionState = 'running';
    timerInterval = setInterval(tick, 1000);
  }
  updateUI();
}

function stopSession() {
  sessionState = 'idle';
  phase = 'idle';
  clearInterval(timerInterval);
  remainingSeconds = 0;
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

// ============================================================
// Task sessions (persisted locally)
// ============================================================
const taskList = document.getElementById('task-list');

const DEFAULT_TASKS = [
  { name: 'Code Feature', tag: 'Code.exe · Pomodoro 24' },
  { name: 'Analyze Feedback', tag: 'Explorer.exe · 20m block' },
  { name: 'Write Documentation', tag: 'Notion.exe · 30m block' },
  { name: 'Review PR', tag: 'chrome.exe · High priority' },
];

function loadTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem('focusTracker.tasks') || 'null');
    return stored || DEFAULT_TASKS;
  } catch (e) {
    return DEFAULT_TASKS;
  }
}

function persistTasks() {
  const tasks = [...taskList.querySelectorAll('.task-row')].map(row => ({
    name: row.dataset.task,
    tag: row.dataset.tag,
  }));
  localStorage.setItem('focusTracker.tasks', JSON.stringify(tasks));
}

function attachTaskRowHandlers(row) {
  const btn = row.querySelector('.task-start-btn');
  btn.addEventListener('click', () => {
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
    btn.textContent = '■ Stop';
    startSession(row.dataset.task, row.dataset.tag);
  });
}

function buildTaskRow(name, tag) {
  const row = document.createElement('div');
  row.className = 'task-row';
  row.dataset.task = name;
  row.dataset.tag = tag || '';
  row.innerHTML = `
    <div class="task-info">
      <div class="task-name">${name}</div>
      <div class="task-tag">${tag || 'No detail added'}</div>
    </div>
    <button class="task-start-btn">▶ Start</button>
  `;
  attachTaskRowHandlers(row);
  return row;
}

taskList.innerHTML = '';
for (const t of loadTasks()) {
  taskList.appendChild(buildTaskRow(t.name, t.tag));
}

document.getElementById('add-task-btn').addEventListener('click', () => {
  const name = prompt('Task name:');
  if (!name || !name.trim()) return;
  const tag = prompt('App / detail (optional):', '');
  taskList.appendChild(buildTaskRow(name.trim(), (tag || '').trim()));
  persistTasks();
});

updateUI();
