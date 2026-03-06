const textInput = document.getElementById('textInput');
const submitBtn = document.getElementById('submitBtn');
const mobileHeadline = document.getElementById('mobileHeadline');
const mobileTimestamp = document.getElementById('mobileTimestamp');

let ws;
let isConnected = false;
let postHistoryData = [];

function connect() {
    // Use the actual hostname from the browser, not localhost
    const hostname = window.location.hostname || '127.0.0.1';
    const serverUrl = `ws://${hostname}:8080`;
    console.log('Connecting to:', serverUrl);
    ws = new WebSocket(serverUrl);
    
    ws.onopen = () => {
        console.log('Connected to server');
        isConnected = true;
        submitBtn.disabled = false;
        
        // Request current headline
        ws.send(JSON.stringify({ type: 'request_headline' }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'headline') {
            // Update headline display
            if (mobileHeadline) {
                mobileHeadline.textContent = data.headline;
            }
            
            if (mobileTimestamp && data.timestamp) {
                const date = new Date(data.timestamp);
                const options = { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true,
                    timeZoneName: 'short',
                    weekday: 'short',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                };
                const formattedDate = date.toLocaleString('en-US', options);
                mobileTimestamp.textContent = `Updated ${formattedDate}`;
            }
        }
        
        if (data.type === 'success') {
            // Clear input immediately
            textInput.value = '';
            
            // Reset button state
            submitBtn.disabled = false;
        }
        
        if (data.type === 'error') {
            textInput.placeholder = '✗ ' + data.message;
            setTimeout(() => {
                textInput.placeholder = 'Whats your opinion?';
            }, 3000);
            submitBtn.disabled = false;
        }
    };
    
    ws.onclose = () => {
        console.log('Disconnected from server');
        isConnected = false;
        submitBtn.disabled = true;
        
        setTimeout(connect, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        isConnected = false;
    };
}

function handleSubmit() {
    const value = textInput.value.trim();
    
    if (!value || !isConnected) {
        return;
    }
    
    // Show loading state
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    const message = JSON.stringify({
        type: 'post',
        content: value,
        timestamp: Date.now()
    });
    
    ws.send(message);
    console.log('Sent post:', value);
}

function updateConnectionStatus(connected) {
    if (connected) {
        connectionStatus.classList.remove('disconnected');
        connectionStatus.classList.add('connected');
        statusText.textContent = 'Connected';
    } else {
        connectionStatus.classList.remove('connected');
        connectionStatus.classList.add('disconnected');
        statusText.textContent = 'Disconnected';
    }
}

// Character count removed - no longer needed

function showSuccessAnimation() {
    successAnimation.style.display = 'block';
    
    setTimeout(() => {
        successAnimation.style.display = 'none';
    }, 1500);
}

function addToHistory(content) {
    postHistoryData.unshift({
        content: content,
        timestamp: new Date().toLocaleTimeString()
    });
    
    // Keep only last 5 posts
    if (postHistoryData.length > 5) {
        postHistoryData.pop();
    }
    
    updateHistoryDisplay();
}

function updateHistoryDisplay() {
    if (postHistoryData.length === 0) {
        postHistory.style.display = 'none';
        return;
    }
    
    postHistory.style.display = 'block';
    historyList.innerHTML = postHistoryData.map(post => 
        `<div class="history-item">
            <div style="font-size: 12px; color: #999; margin-bottom: 4px;">${post.timestamp}</div>
            ${post.content}
        </div>`
    ).join('');
}


submitBtn.addEventListener('click', handleSubmit);

textInput.addEventListener('keydown', (e) => {
    // Enter/Return key to submit
    if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
    }
});

// Character counter
// No character counter in new design

connect();
textInput.focus();
