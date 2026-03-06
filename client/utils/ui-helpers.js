// UI helper functions for monitoring and status updates

const MAX_ACTIVITY_LOG = 50;
let activityLog = [];

export function logActivity(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const colors = {
        'info': '#4CAF50',
        'keyword': '#2196F3',
        'similarity': '#FF9800',
        'cluster': '#9C27B0',
        'metaball': '#00BCD4'
    };
    
    activityLog.unshift({
        timestamp,
        message,
        color: colors[type] || colors.info
    });
    
    if (activityLog.length > MAX_ACTIVITY_LOG) {
        activityLog.pop();
    }
    
    updateActivityPanel();
}

export function updateActivityPanel() {
    const panel = document.getElementById('activityLog');
    if (!panel) return;
    
    panel.innerHTML = activityLog.map(log => 
        `<div style="color: ${log.color}; margin-bottom: 4px;">[${log.timestamp}] ${log.message}</div>`
    ).join('');
}

export function updateAlgorithmStatus(status) {
    const statusEl = document.getElementById('algorithmStatus');
    if (statusEl) {
        statusEl.textContent = status;
    }
}

export function updateConceptNetPanel(apiCallCount, cacheHitCount, apiResponseTimes, nodesLength, currentDatabase) {
    const currentDbDisplay = document.getElementById('currentDbDisplay');
    if (currentDbDisplay) {
        const dbNames = {
            'tfidf': 'TF-IDF',
            'transformer': 'Transformer',
            'conceptnet': 'ConceptNet',
            'wordnet': 'WordNet',
            'word2vec': 'Word2Vec'
        };
        currentDbDisplay.textContent = dbNames[currentDatabase] || 'Unknown';
        currentDbDisplay.style.color = (currentDatabase === 'transformer' || currentDatabase === 'conceptnet') ? '#4CAF50' : '#FF9800';
    }
    
    const apiCallCountEl = document.getElementById('apiCallCount');
    const cacheHitsEl = document.getElementById('cacheHits');
    const avgResponseTimeEl = document.getElementById('avgResponseTime');
    const postCountEl = document.getElementById('postCount');
    
    if (apiCallCountEl) apiCallCountEl.textContent = apiCallCount;
    if (cacheHitsEl) cacheHitsEl.textContent = cacheHitCount;
    if (postCountEl) postCountEl.textContent = nodesLength;
    
    const avgTime = apiResponseTimes.length > 0 
        ? (apiResponseTimes.reduce((a, b) => a + b, 0) / apiResponseTimes.length).toFixed(0)
        : 0;
    if (avgResponseTimeEl) avgResponseTimeEl.textContent = avgTime + 'ms';
}

export function updateAPIStatus(status) {
    const apiStatusEl = document.getElementById('apiStatus');
    if (!apiStatusEl) return;
    
    const statusConfig = {
        'idle': { text: '● Idle', color: '#888' },
        'loading': { text: '● Loading...', color: '#FF9800' },
        'success': { text: '● Success', color: '#4CAF50' },
        'error': { text: '● Error', color: '#F44336' }
    };
    
    const config = statusConfig[status] || statusConfig.idle;
    apiStatusEl.textContent = config.text;
    apiStatusEl.style.color = config.color;
}

export function setupMonitorToggle() {
    const toggleBtn = document.getElementById('toggleMonitor');
    const activityFeed = document.getElementById('activityFeedSection');
    let isExpanded = true;
    
    if (toggleBtn && activityFeed) {
        toggleBtn.addEventListener('click', () => {
            isExpanded = !isExpanded;
            activityFeed.style.display = isExpanded ? 'block' : 'none';
            toggleBtn.textContent = isExpanded ? 'Hide Details' : 'Show Details';
        });
    }
}

export function setupDatabaseSelector(onDatabaseChange) {
    const dbToggleBtn = document.getElementById('dbToggleBtn');
    const dbDropdown = document.getElementById('dbDropdown');
    const dbOptions = document.querySelectorAll('.db-option');
    
    if (!dbToggleBtn || !dbDropdown) return;
    
    dbToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = dbDropdown.style.display === 'block';
        dbDropdown.style.display = isVisible ? 'none' : 'block';
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#databaseSelector')) {
            dbDropdown.style.display = 'none';
        }
    });
    
    dbOptions.forEach(option => {
        option.addEventListener('click', () => {
            const selectedDb = option.dataset.db;
            onDatabaseChange(selectedDb);
            
            dbOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            
            const dbNames = {
                'tfidf': 'TF-IDF',
                'transformer': 'Transformer',
                'conceptnet': 'ConceptNet',
                'wordnet': 'WordNet',
                'word2vec': 'Word2Vec'
            };
            
            dbToggleBtn.textContent = `📊 Database: ${dbNames[selectedDb]} ▼`;
            dbDropdown.style.display = 'none';
            
            showDatabaseNotification(dbNames[selectedDb]);
        });
    });
    
    console.log('Database selector initialized');
}

function showDatabaseNotification(dbName) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 30px 50px;
        border-radius: 12px;
        font-size: 18px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        border: 2px solid #4CAF50;
    `;
    notification.textContent = `Switched to ${dbName}`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.5s';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}
