let timelineChart = null;
let userDistChart = null;
let activeAttackerFilter = null;

const attackers = [
  { ip: '185.220.101.5', location: 'Germany (Tor Exit)', attempts: 2150, share: 44.7, target: 'invalid / dictionary', users: ['admin', 'oracle', 'root'] },
  { ip: '198.51.100.42', location: 'United States (Hosting)', attempts: 1240, share: 25.8, target: 'root, deploy', users: ['root', 'ubuntu'] },
  { ip: '203.0.113.88', location: 'Singapore (VPS)', attempts: 680, share: 14.1, target: 'svc_backup, postgres', users: ['svc_backup'] },
  { ip: '45.33.32.156', location: 'Netherlands (Proxy)', attempts: 410, share: 8.5, target: 'guest, test, git', users: ['git', 'guest'] },
  { ip: '103.251.167.20', location: 'Hong Kong (Cloud)', attempts: 230, share: 4.8, target: 'temp, user1', users: ['temp'] },
  { ip: '192.0.2.144', location: 'United States (ISP)', attempts: 102, share: 2.1, target: 'admin', users: ['admin'] }
];

const targetedUsers = [
  { user: 'root', count: 1420, type: 'Valid User (Targeted)' },
  { user: 'admin', count: 1180, type: 'Invalid User (Spraying)' },
  { user: 'ubuntu', count: 620, type: 'Valid User (Targeted)' },
  { user: 'deploy', count: 480, type: 'Valid User (Targeted)' },
  { user: 'oracle', count: 390, type: 'Invalid User (Spraying)' },
  { user: 'postgres', count: 280, type: 'Valid User (Targeted)' },
  { user: 'guest', count: 240, type: 'Invalid User (Spraying)' },
  { user: 'test', count: 202, type: 'Invalid User (Spraying)' }
];

const sampleEvents = [
  { time: '18:42:10', ip: '185.220.101.5', user: 'admin', is_invalid: true, sev: 'CRITICAL - ENUMERATION' },
  { time: '18:42:08', ip: '185.220.101.5', user: 'oracle', is_invalid: true, sev: 'CRITICAL - ENUMERATION' },
  { time: '18:42:05', ip: '185.220.101.5', user: 'root', is_invalid: false, sev: 'CRITICAL - PRIVILEGE_ATTACK' },
  { time: '18:42:01', ip: '198.51.100.42', user: 'root', is_invalid: false, sev: 'CRITICAL - PRIVILEGE_ATTACK' },
  { time: '18:41:55', ip: '203.0.113.88', user: 'svc_backup', is_invalid: false, sev: 'HIGH - BRUTE_FORCE' },
  { time: '18:41:50', ip: '45.33.32.156', user: 'guest', is_invalid: true, sev: 'CRITICAL - ENUMERATION' },
  { time: '18:41:44', ip: '198.51.100.42', user: 'deploy', is_invalid: false, sev: 'HIGH - BRUTE_FORCE' },
  { time: '18:41:30', ip: '185.220.101.5', user: 'test', is_invalid: true, sev: 'CRITICAL - ENUMERATION' },
  { time: '18:41:12', ip: '103.251.167.20', user: 'temp', is_invalid: true, sev: 'CRITICAL - ENUMERATION' },
  { time: '18:40:59', ip: '198.51.100.42', user: 'root', is_invalid: false, sev: 'CRITICAL - PRIVILEGE_ATTACK' }
];

function generateTimelineData(sensitivity = 2.5) {
  const labels = [];
  const rawValues = [];
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  for (let i = 0; i < 96; i++) {
    const intervalTime = new Date(start.getTime() + i * 15 * 60 * 1000);
    labels.push(intervalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    
    let val = Math.floor(Math.random() * 14) + 8;
    
    if (i >= 24 && i <= 28) {
      val += Math.floor(Math.sin((i - 24) / 4 * Math.PI) * 260) + 30;
    }
    if (i >= 70 && i <= 74) {
      val += Math.floor(Math.sin((i - 70) / 4 * Math.PI) * 300) + 40;
    }
    rawValues.push(val);
  }
  
  // Rolling 2-hour window (8 x 15-minute intervals)
  const windowSize = 8;
  const baselineMeans = [];
  const thresholds = [];
  const spikeMarkers = [];
  
  for (let i = 0; i < rawValues.length; i++) {
    const startIdx = Math.max(0, i - windowSize + 1);
    const slice = rawValues.slice(startIdx, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / slice.length;
    const stdev = Math.sqrt(variance);
    const thresh = Math.round((mean + (sensitivity * stdev)) * 10) / 10;
    
    baselineMeans.push(Math.round(mean));
    thresholds.push(thresh);
    spikeMarkers.push(rawValues[i] > thresh && rawValues[i] > 35 ? rawValues[i] : null);
  }
  
  return { labels, rawValues, baselineMeans, thresholds, spikeMarkers };
}

function renderTimelineChart(sensitivity = 2.5) {
  const data = generateTimelineData(sensitivity);
  const ctx = document.getElementById('timelineChart').getContext('2d');
  
  if (timelineChart) {
    timelineChart.destroy();
  }
  
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
  gradient.addColorStop(1, 'rgba(56, 189, 248, 0.02)');

  timelineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: 'Failed Logins (Count)',
          data: data.rawValues,
          borderColor: '#38bdf8',
          borderWidth: 2,
          backgroundColor: gradient,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5
        },
        {
          label: 'Dynamic Spike Threshold (μ + k*σ)',
          data: data.thresholds,
          borderColor: '#f59e0b',
          borderWidth: 1.8,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
          tension: 0.2
        },
        {
          label: 'Baseline Mean (μ)',
          data: data.baselineMeans,
          borderColor: '#10b981',
          borderWidth: 1.5,
          borderDash: [2, 2],
          pointRadius: 0,
          fill: false,
          tension: 0.2
        },
        {
          label: 'Detected Anomaly Spikes',
          data: data.spikeMarkers,
          borderColor: '#ef4444',
          backgroundColor: '#ef4444',
          pointRadius: 6,
          pointHoverRadius: 9,
          pointStyle: 'triangle',
          showLine: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111827',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          titleFont: { family: 'Plus Jakarta Sans', weight: '700' },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          padding: 12,
          callbacks: {
            label: function(context) {
              if (context.dataset.label === 'Detected Anomaly Spikes' && context.raw !== null) {
                return `Spike: ${context.raw} failures/15m`;
              }
              return `${context.dataset.label}: ${context.raw}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#64748b', maxTicksLimit: 12, font: { family: 'JetBrains Mono', size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 11 } },
          title: { display: true, text: 'Events / 15-min interval', color: '#94a3b8', font: { size: 11 } }
        }
      }
    }
  });
}

function renderUserDistChart() {
  const ctx = document.getElementById('userDistChart').getContext('2d');
  
  if (userDistChart) {
    userDistChart.destroy();
  }
  
  userDistChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: targetedUsers.map(u => u.user),
      datasets: [{
        label: 'Failed Password Attempts',
        data: targetedUsers.map(u => u.count),
        backgroundColor: targetedUsers.map(u => 
          u.type.includes('Valid') ? 'rgba(56, 189, 248, 0.75)' : 'rgba(168, 85, 247, 0.75)'
        ),
        borderColor: targetedUsers.map(u => 
          u.type.includes('Valid') ? '#38bdf8' : '#c084fc'
        ),
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111827',
          padding: 10,
          callbacks: {
            afterLabel: (ctx) => `Type: ${targetedUsers[ctx.dataIndex].type}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 11 } }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#f1f5f9', font: { family: 'JetBrains Mono', weight: '600' } }
        }
      }
    }
  });
}

function renderAttackerTable() {
  const tbody = document.getElementById('attackerTableBody');
  tbody.innerHTML = '';
  
  attackers.forEach(att => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${att.ip}</code></td>
      <td>${att.location}</td>
      <td><strong>${att.attempts.toLocaleString()}</strong></td>
      <td>
        <div class="attack-bar-container">
          <div class="attack-bar">
            <div class="attack-bar-fill" style="width: ${att.share}%"></div>
          </div>
          <span style="font-size: 11px; color: #94a3b8; width: 42px;">${att.share}%</span>
        </div>
      </td>
      <td><span class="badge ${att.target.includes('invalid') ? 'badge-orange' : 'badge-danger'}">${att.target}</span></td>
      <td>
        <button class="btn btn-secondary btn-isolate" style="padding: 4px 8px; font-size: 11px;" data-ip="${att.ip}">
          Isolate
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderLogDrilldown(filteredIp = null) {
  const tbody = document.getElementById('logDrilldownBody');
  const indicator = document.getElementById('drilldownFilterStatus');
  
  if (filteredIp) {
    indicator.innerHTML = `Filtered by IP: <strong>${filteredIp}</strong> <button id="btnClearFilter" style="background:none; border:none; color:#f87171; cursor:pointer; margin-left:8px; text-decoration:underline;">Clear Filter</button>`;
  } else {
    indicator.innerHTML = `Showing all logs (Click an IP above to isolate)`;
  }
  
  tbody.innerHTML = '';
  const filtered = filteredIp ? sampleEvents.filter(e => e.ip === filteredIp) : sampleEvents;
  
  filtered.forEach(item => {
    const tr = document.createElement('tr');
    const badgeClass = item.sev.includes('PRIVILEGE') ? 'badge-danger' : (item.sev.includes('ENUMERATION') ? 'badge-orange' : 'badge-warning');
    
    const pid = Math.floor(Math.random() * 50000) + 1000;
    const rawMsg = item.is_invalid 
      ? `sshd[${pid}]: Failed password for invalid user ${item.user} from ${item.ip} port 51234 ssh2`
      : `sshd[${pid}]: pam_unix(sshd:auth): authentication failure; rhost=${item.ip} user=${item.user}`;

    tr.innerHTML = `
      <td style="color: #94a3b8;">${item.time}</td>
      <td><span class="badge ${badgeClass}">${item.sev}</span></td>
      <td><code>${item.ip}</code></td>
      <td><strong>${item.user}</strong></td>
      <td style="color: #cbd5e1; font-size: 11px;">${rawMsg}</td>
    `;
    tbody.appendChild(tr);
  });
}

function setupEventListeners() {
  const sensitivityEl = document.getElementById('spikeSensitivity');
  
  sensitivityEl.addEventListener('change', (e) => {
    renderTimelineChart(parseFloat(e.target.value));
  });

  document.getElementById('btnApplyFilter').addEventListener('click', () => {
    renderTimelineChart(parseFloat(sensitivityEl.value));
  });

  document.getElementById('btnRefresh').addEventListener('click', () => {
    renderTimelineChart(parseFloat(sensitivityEl.value));
  });

  document.getElementById('attackerTableBody').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-isolate');
    if (btn) {
      const ip = btn.getAttribute('data-ip');
      activeAttackerFilter = ip;
      renderLogDrilldown(ip);
    }
  });

  document.getElementById('drilldownFilterStatus').addEventListener('click', (e) => {
    if (e.target.id === 'btnClearFilter') {
      activeAttackerFilter = null;
      renderLogDrilldown(null);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderTimelineChart(2.5);
  renderUserDistChart();
  renderAttackerTable();
  renderLogDrilldown();
  setupEventListeners();
});
