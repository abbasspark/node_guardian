// OPTIMIZED DASHBOARD JAVASCRIPT - Replace in server.ts
// This version fixes the 2-minute slowdown issue

// WebSocket Connection
const ws = new WebSocket('ws://' + window.location.host);
let allEvents = [];
let pendingPromises = [];
let currentFilter = 'all';
let currentTheme = 'dark';
let lastStatus = null;

// PERFORMANCE LIMITS - Critical!
const MAX_EVENTS = 30;  // Reduced from unlimited
const MAX_CHART_POINTS = 20;  // Strict limit
const MAX_DOM_EVENTS = 20;  // DOM elements limit
const MAX_PROMISES = 15;  // Limit promises display
let updateCounter = 0;
let isUpdating = false;

// Charts
let memoryChart, eventLoopChart, memoryDetailChart;

ws.onopen = () => {
    console.log('✅ Connected to Guardian');
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'status') {
        lastStatus = message.data;
        requestUpdate(() => updateStatus(message.data));
    } else if (message.type === 'event') {
        addEvent(message.data);
    }
};

// REQUEST ANIMATION FRAME FOR SMOOTH UPDATES
let updateScheduled = false;
function requestUpdate(callback) {
    if (updateScheduled) return;
    updateScheduled = true;
    requestAnimationFrame(() => {
        callback();
        updateScheduled = false;
    });
}

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        const section = item.dataset.section;
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        document.getElementById(section + '-section').classList.add('active');
        
        if (section === 'promises') refreshPromises();
    });
});

// Initialize Charts with performance optimizations
function initCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,  // NO ANIMATIONS!
        plugins: { legend: { display: false } },
        elements: {
            point: { radius: 0 },  // No points
            line: { borderWidth: 2 }
        },
        scales: {
            x: { 
                grid: { color: '#334155', display: false },
                ticks: { color: '#cbd5e1', maxTicksLimit: 8 }
            },
            y: { 
                grid: { color: '#334155' },
                ticks: { color: '#cbd5e1', maxTicksLimit: 6 }
            }
        }
    };

    memoryChart = new Chart(document.getElementById('memory-chart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true
            }]
        },
        options: chartOptions
    });

    eventLoopChart = new Chart(document.getElementById('eventloop-chart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                fill: true
            }]
        },
        options: chartOptions
    });

    memoryDetailChart = new Chart(document.getElementById('memory-detail-chart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { data: [], borderColor: '#3b82f6', fill: false },
                { data: [], borderColor: '#8b5cf6', fill: false },
                { data: [], borderColor: '#10b981', fill: false }
            ]
        },
        options: {
            ...chartOptions,
            plugins: {
                legend: { 
                    display: true,
                    labels: { color: '#cbd5e1', boxWidth: 20 }
                }
            }
        }
    });
}

// OPTIMIZED UPDATE STATUS
function updateStatus(status) {
    if (isUpdating) return;
    isUpdating = true;
    
    updateCounter++;
    
    // THROTTLE: Skip some updates
    if (updateCounter % 3 !== 0) {
        isUpdating = false;
        return;
    }

    try {
        const monitors = status.monitors;

        if (monitors.eventLoop) {
            const mean = (monitors.eventLoop.mean || 0).toFixed(1);
            updateStat('stat-event-loop', mean + 'ms', 
                mean > 100 ? 'critical' : mean > 50 ? 'warning' : 'good');
            updateText('stat-event-loop-change', monitors.eventLoop.stallCount + ' stalls');
            updateChartData(eventLoopChart, mean);
        }

        if (monitors.promises) {
            const pending = monitors.promises.pending || 0;
            updateStat('stat-promises', pending, 
                pending > 10 ? 'critical' : pending > 5 ? 'warning' : 'good');
            updateText('stat-promises-change', monitors.promises.deadlockCount + ' deadlocks');
        }

        if (monitors.memory) {
            const heap = monitors.memory.current.heapUsed;
            updateStat('stat-memory', heap + 'MB',
                heap > 500 ? 'critical' : heap > 200 ? 'warning' : 'good');
            const growth = monitors.memory.growth || 0;
            updateText('stat-memory-change', (growth > 0 ? '+' : '') + growth + 'MB');
            updateChartData(memoryChart, heap);
            
            if (updateCounter % 6 === 0) {
                updateDetailChart(monitors.memory.current);
            }
        }

        updateText('stat-events', status.events.total || 0);
        
        if (updateCounter % 10 === 0) {
            if (status.uptime) {
                const h = Math.floor(status.uptime / 3600000);
                const m = Math.floor((status.uptime % 3600000) / 60000);
                updateText('uptime', h + 'h ' + m + 'm');
            }
            if (status.nodeVersion) updateText('node-version', status.nodeVersion);
            if (status.pid) updateText('pid', status.pid);
        }
    } finally {
        isUpdating = false;
    }
}

// HELPER FUNCTIONS
function updateStat(id, text, className) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = 'stat-value ' + className;
    }
}

function updateText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// OPTIMIZED CHART UPDATE
function updateChartData(chart, value) {
    if (chart.data.labels.length >= MAX_CHART_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    chart.data.labels.push('');
    chart.data.datasets[0].data.push(value);
    chart.update('none');
}

function updateDetailChart(mem) {
    const chart = memoryDetailChart;
    if (chart.data.labels.length >= MAX_CHART_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets.forEach(ds => ds.data.shift());
    }
    chart.data.labels.push('');
    chart.data.datasets[0].data.push(mem.heapUsed);
    chart.data.datasets[1].data.push(mem.heapTotal);
    chart.data.datasets[2].data.push(mem.rss);
    chart.update('none');
}

// DEBOUNCED PROMISE REFRESH
let promiseTimeout;
function refreshPromises() {
    clearTimeout(promiseTimeout);
    promiseTimeout = setTimeout(() => {
        fetch('/api/promises')
            .then(r => r.json())
            .then(data => {
                pendingPromises = data.slice(0, MAX_PROMISES);
                updatePromisesView();
            })
            .catch(() => {});
    }, 1000);
}

function updatePromisesView() {
    const container = document.getElementById('promises-list');
    if (!container) return;
    
    const html = pendingPromises.length === 0 
        ? '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">✅ No pending promises</div>'
        : pendingPromises.map(p => {
            const age = Math.floor((Date.now() - p.createdAt) / 1000);
            const critical = age > 30;
            return `
                <div class="promise-item ${critical ? 'critical' : ''}">
                    <div class="promise-header">
                        <span class="promise-id">Promise #${p.asyncId}</span>
                        <span class="promise-age ${critical ? 'critical' : 'warning'}">${age}s</span>
                    </div>
                    ${p.file ? `<div class="event-file">📍 ${p.file}:${p.line}</div>` : ''}
                    ${critical ? '<div style="margin-top: 8px; color: var(--accent-red);">⚠️ Possible deadlock!</div>' : ''}
                </div>
            `;
        }).join('');
    
    container.innerHTML = html;
}

// OPTIMIZED EVENT HANDLING
function addEvent(event) {
    allEvents.unshift(event);
    if (allEvents.length > MAX_EVENTS) {
        allEvents = allEvents.slice(0, MAX_EVENTS);
    }
    
    requestUpdate(() => {
        if (currentFilter === 'all' || currentFilter === event.severity) {
            renderEvent(event, 'events-container');
        }
        renderEvent(event, 'all-events-container');
    });
}

function renderEvent(event, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const time = new Date(event.timestamp).toLocaleTimeString();
    const div = document.createElement('div');
    div.className = 'event-row';
    div.innerHTML = `
        <div class="event-main">
            <div class="event-type">
                <span class="event-badge ${event.severity}">${event.severity}</span>
                ${event.type}
            </div>
            <span class="event-time">${time}</span>
        </div>
        ${event.file ? `<div class="event-file">${event.file}:${event.line}</div>` : ''}
    `;
    
    if (container.firstChild) {
        container.insertBefore(div, container.firstChild);
    } else {
        container.appendChild(div);
    }
    
    while (container.children.length > MAX_DOM_EVENTS) {
        container.removeChild(container.lastChild);
    }
}

// FILTER EVENTS
document.querySelectorAll('.filter-tag').forEach(tag => {
    tag.addEventListener('click', () => {
        document.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        currentFilter = tag.dataset.filter;
        
        const container = document.getElementById('events-container');
        container.innerHTML = '';
        allEvents.slice(0, MAX_DOM_EVENTS).forEach(event => {
            if (currentFilter === 'all' || currentFilter === event.severity) {
                renderEvent(event, 'events-container');
            }
        });
    });
});

// DEBOUNCED SEARCH
let searchTimeout;
document.getElementById('search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.event-row').forEach(row => {
            row.style.display = !query || row.textContent.toLowerCase().includes(query) ? '' : 'none';
        });
    }, 300);
});

// EXPORT
function exportData() {
    const data = {
        timestamp: new Date().toISOString(),
        events: allEvents,
        promises: pendingPromises,
        status: lastStatus
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guardian-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
}

// SETTINGS
function openSettings() {
    document.getElementById('settings-modal').classList.add('active');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.remove('active');
}

function saveSettings() {
    const theme = document.getElementById('setting-theme').value;
    if (theme !== currentTheme) toggleTheme();
    closeSettings();
}

// THEME
function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    
    if (currentTheme === 'light') {
        root.style.setProperty('--bg-primary', '#f1f5f9');
        root.style.setProperty('--bg-secondary', '#ffffff');
        root.style.setProperty('--bg-tertiary', '#e2e8f0');
        root.style.setProperty('--text-primary', '#0f172a');
        root.style.setProperty('--text-secondary', '#475569');
        root.style.setProperty('--border-color', '#e2e8f0');
        document.querySelector('.theme-toggle').textContent = '☀️';
    } else {
        root.style.setProperty('--bg-primary', '#0f172a');
        root.style.setProperty('--bg-secondary', '#1e293b');
        root.style.setProperty('--bg-tertiary', '#334155');
        root.style.setProperty('--text-primary', '#f1f5f9');
        root.style.setProperty('--text-secondary', '#cbd5e1');
        root.style.setProperty('--border-color', '#334155');
        document.querySelector('.theme-toggle').textContent = '🌙';
    }
}

function openFilterModal() {
    const filter = prompt('Filter:');
    if (filter) {
        document.getElementById('search').value = filter;
        document.getElementById('search').dispatchEvent(new Event('input'));
    }
}

function refreshMemory() {}

// INITIALIZE
initCharts();

// CLEANUP EVERY 30 SECONDS
setInterval(() => {
    if (allEvents.length > MAX_EVENTS) {
        allEvents = allEvents.slice(0, MAX_EVENTS);
    }
    updateCounter = 0;
    console.log('🧹 Cleanup:', allEvents.length, 'events');
}, 30000);
