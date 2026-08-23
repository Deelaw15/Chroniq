const API_BASE = window.location.origin; // same-origin, since FastAPI serves this file

const APP_COLORS = [
  'var(--app-color-1)', 'var(--app-color-2)', 'var(--app-color-3)', 'var(--app-color-4)',
  'var(--app-color-5)', 'var(--app-color-6)', 'var(--app-color-7)', 'var(--app-color-8)',
];

// Resolved hex values matching the CSS custom properties above, needed
// because Chart.js (canvas) can't resolve var(--x) the way DOM CSS can.
const APP_COLORS_HEX = [
  '#D9A441', '#4A9B8E', '#B36A5E', '#7C9CBF',
  '#A6B25E', '#9575B0', '#C97B5E', '#5EA6A0',
];

let weeklyChart = null;
const appColorMap = new Map(); // app_name -> color index, stable across renders

function colorForApp(appName) {
  if (!appColorMap.has(appName)) {
    appColorMap.set(appName, appColorMap.size % APP_COLORS.length);
  }
  return appColorMap.get(appName);
}

/** Formats a seconds count as HH:MM:SS with tabular-num friendly zero padding. */
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

/** Shorter format for chart axis labels, e.g. "2h 15m" */
function formatShort(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function setStatus(text, isError = false) {
  const el = document.getElementById('status-text');
  el.textContent = text;
  el.parentElement.className = 'app-footer ' + (isError ? 'status-error' : 'status-ok');
}

async function fetchJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

/** Renders the today panel: readouts, day timeline strip, app breakdown list. */
function renderToday(summary) {
  document.getElementById('today-date').textContent = summary.date;
  document.getElementById('active-readout').textContent = formatDuration(summary.total_active_seconds);
  document.getElementById('idle-readout').textContent = formatDuration(summary.total_idle_seconds);

  renderBreakdownList('app-breakdown', summary.app_breakdown);
  renderTimeline(summary.app_breakdown, summary.total_active_seconds, summary.total_idle_seconds);
}

/** Renders a ranked list of apps with proportional bars. */
function renderBreakdownList(containerId, items) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="breakdown-empty">No activity recorded yet.</div>';
    return;
  }

  const maxSeconds = Math.max(...items.map(i => i.total_seconds));

  for (const item of items) {
    const colorIdx = colorForApp(item.app_name);
    const pct = maxSeconds > 0 ? (item.total_seconds / maxSeconds) * 100 : 0;

    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.innerHTML = `
      <span class="breakdown-name" title="${item.app_name}">${item.app_name}</span>
      <span class="breakdown-bar-track">
        <span class="breakdown-bar-fill" style="width: ${pct}%; background: ${APP_COLORS[colorIdx]};"></span>
      </span>
      <span class="breakdown-time">${formatShort(item.total_seconds)}</span>
    `;
    container.appendChild(row);
  }
}

/**
 * Renders the signature "day timeline" strip: a proportional horizontal
 * bar showing relative time spent per app today, plus idle time as a
 * hatched segment. This is proportional, not literally clock-aligned,
 * since raw start/end times aren't in the summary payload - it reads
 * as "share of tracked time today" rather than a literal 24h clock.
 */
function renderTimeline(breakdown, activeSeconds, idleSeconds) {
  const track = document.getElementById('day-timeline');
  const emptyMsg = document.getElementById('timeline-empty');
  const legend = document.getElementById('timeline-legend');

  track.querySelectorAll('.timeline-segment').forEach(el => el.remove());
  legend.innerHTML = '';

  const total = (activeSeconds || 0) + (idleSeconds || 0);
  if (total <= 0) {
    emptyMsg.style.display = 'flex';
    return;
  }
  emptyMsg.style.display = 'none';

  for (const item of breakdown) {
    const colorIdx = colorForApp(item.app_name);
    const widthPct = (item.total_seconds / total) * 100;

    const seg = document.createElement('div');
    seg.className = 'timeline-segment';
    seg.style.width = `${widthPct}%`;
    seg.style.background = APP_COLORS[colorIdx];
    seg.title = `${item.app_name} — ${formatShort(item.total_seconds)}`;
    track.appendChild(seg);

    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    legendItem.innerHTML = `
      <span class="legend-swatch" style="background:${APP_COLORS[colorIdx]}"></span>
      ${item.app_name}
    `;
    legend.appendChild(legendItem);
  }

  if (idleSeconds > 0) {
    const idleWidthPct = (idleSeconds / total) * 100;
    const seg = document.createElement('div');
    seg.className = 'timeline-segment idle-segment';
    seg.style.width = `${idleWidthPct}%`;
    seg.title = `Idle — ${formatShort(idleSeconds)}`;
    track.appendChild(seg);

    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    legendItem.innerHTML = `<span class="legend-swatch" style="background:var(--border)"></span> Idle`;
    legend.appendChild(legendItem);
  }
}

/** Renders the weekly panel: trend chart + top apps list. */
function renderWeek(summary) {
  document.getElementById('week-range').textContent = `${summary.start_date} → ${summary.end_date}`;
  renderBreakdownList('week-top-apps', summary.top_apps);
  renderWeeklyChart(summary.daily_totals);
}

function renderWeeklyChart(dailyTotals) {
  const canvas = document.getElementById('weekly-chart');

  if (typeof Chart === 'undefined') {
    // Chart.js failed to load (e.g. no internet, CDN blocked). Don't let
    // this break the rest of the dashboard - just show a plain message
    // in place of the chart.
    canvas.replaceWith(Object.assign(document.createElement('div'), {
      className: 'breakdown-empty',
      textContent: 'Chart library failed to load - check your internet connection.',
    }));
    return;
  }

  const ctx = canvas.getContext('2d');

  const labels = dailyTotals.map(d => {
    const date = new Date(d.date + 'T00:00:00');
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  });
  const hours = dailyTotals.map(d => +(d.active_seconds / 3600).toFixed(2));

  if (weeklyChart) {
    weeklyChart.data.labels = labels;
    weeklyChart.data.datasets[0].data = hours;
    weeklyChart.update();
    return;
  }

  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Active hours',
        data: hours,
        backgroundColor: APP_COLORS_HEX[0],
        borderRadius: 4,
        maxBarThickness: 36,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toFixed(1)}h active`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#8B92A0', font: { family: 'IBM Plex Mono', size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#2C3138' },
          ticks: { color: '#8B92A0', font: { family: 'IBM Plex Mono', size: 11 } },
        },
      },
    },
  });
}

async function loadAll() {
  setStatus('Loading…');
  let today, week;
  try {
    [today, week] = await Promise.all([
      fetchJSON('/summary/today'),
      fetchJSON('/summary/week'),
    ]);
  } catch (err) {
    console.error(err);
    setStatus('Could not reach the backend. Is scripts/run_backend.py running?', true);
    return;
  }

  try {
    renderToday(today);
    renderWeek(week);
    setStatus(`Last updated ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error(err);
    setStatus('Data loaded but the dashboard failed to render - check the browser console.', true);
  }
}

document.getElementById('refresh-btn').addEventListener('click', (e) => {
  e.currentTarget.classList.add('spinning');
  loadAll().finally(() => {
    setTimeout(() => e.currentTarget.classList.remove('spinning'), 600);
  });
});

loadAll();
// Auto-refresh every 60s so the dashboard stays current without manual clicks
setInterval(loadAll, 60000);
