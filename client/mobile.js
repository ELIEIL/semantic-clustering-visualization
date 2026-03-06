const textInput = document.getElementById('textInput');
const submitBtn = document.getElementById('submitBtn');
const composeArea = document.getElementById('composeArea');
const charCount = document.getElementById('charCount');
const charCounter = document.querySelector('.character-counter');
const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.querySelector('.status-text');
const successAnimation = document.getElementById('successAnimation');
const postHistory = document.getElementById('postHistory');
const historyList = document.getElementById('historyList');

let ws;
let isConnected = false;
let postHistoryData = [];

function connect() {
    const serverUrl = `ws://${window.location.hostname}:8080`;
    ws = new WebSocket(serverUrl);
    
    ws.onopen = () => {
        console.log('Connected to server');
        isConnected = true;
        submitBtn.disabled = false;
        updateConnectionStatus(true);
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'success') {
            // Show success animation
            showSuccessAnimation();
            
            // Add to history
            addToHistory(textInput.value);
            
            // Clear input
            textInput.value = '';
            updateCharacterCount();
            
            // Reset button state
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
        
        if (data.type === 'cluster_info') {
            // Show cluster feedback
            const feedbackDiv = document.getElementById('clusterFeedback');
            const clusterInfoDiv = document.getElementById('clusterInfo');
            const recommendedDiv = document.getElementById('recommendedPosts');
            
            if (feedbackDiv && clusterInfoDiv) {
                feedbackDiv.style.display = 'block';
                
                clusterInfoDiv.innerHTML = `
                    <div style="margin-bottom: 10px;">
                        <strong>Your post:</strong><br>
                        "${data.content.substring(0, 60)}${data.content.length > 60 ? '...' : ''}"
                    </div>
                    <div style="padding: 10px; background: rgba(156, 39, 176, 0.1); border-radius: 5px;">
                        <strong style="color: #9C27B0;">Cluster: ${data.clusterLabel}</strong><br>
                        <span style="color: #666; font-size: 13px;">You're connected to ${data.clusterSize - 1} other post${data.clusterSize - 1 !== 1 ? 's' : ''}</span>
                    </div>
                `;
                
                if (data.otherPosts && data.otherPosts.length > 0 && recommendedDiv) {
                    recommendedDiv.innerHTML = data.otherPosts.map(post => 
                        `<div style="padding: 8px; margin: 5px 0; background: white; border-left: 3px solid #9C27B0; border-radius: 3px;">
                            "${post}${post.length >= 50 ? '...' : ''}"
                        </div>`
                    ).join('');
                } else if (recommendedDiv) {
                    recommendedDiv.innerHTML = '<em style="color: #999;">No other posts in this cluster yet</em>';
                }
                
                // Auto-hide after 10 seconds
                setTimeout(() => {
                    feedbackDiv.style.display = 'none';
                }, 10000);
            }
        }
        
        if (data.type === 'error') {
            textInput.placeholder = '✗ ' + data.message;
            setTimeout(() => {
                textInput.placeholder = "What's on your mind?";
            }, 3000);
        }
    };
    
    ws.onclose = () => {
        console.log('Disconnected from server');
        isConnected = false;
        submitBtn.disabled = true;
        updateConnectionStatus(false);
        
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

function updateCharacterCount() {
    const count = textInput.value.length;
    charCount.textContent = count;
    
    // Update color based on character count
    charCounter.classList.remove('warning', 'danger');
    if (count > 450) {
        charCounter.classList.add('danger');
    } else if (count > 400) {
        charCounter.classList.add('warning');
    }
}

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
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
    }
});

// Character counter
textInput.addEventListener('input', updateCharacterCount);

connect();
textInput.focus();
updateCharacterCount();
