// Onboarding configuration - SET TO false TO DISABLE ONBOARDING
window.ENABLE_ONBOARDING = false;

const textInput = document.getElementById('textInput');
const submitBtn = document.getElementById('submitBtn');
const countdownElement = document.getElementById('countdown');

let ws;
let isConnected = false;
let postHistoryData = [];

// Countdown timer variables
let countdownTime = 180; // 3 minutes in seconds
let countdownInterval = null;

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
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'headline') {
            // Headline received but not displayed on this simplified controller
            console.log('Headline received:', data.headline);
        }
        
        if (data.type === 'clusters') {
            // Update cluster list display
            console.log('📊 Received clusters:', data);
            updateClusterList(data);
        }
        
        if (data.type === 'success') {
            // Show success checkmark
            submitBtn.textContent = '✓';
            submitBtn.style.color = '#4caf50';
            
            setTimeout(() => {
                // Reset button
                submitBtn.textContent = 'Submit';
                submitBtn.style.color = '#666';
                submitBtn.disabled = false;
                
                // Clear input and refocus for next post
                textInput.value = '';
                charCounter.textContent = '0/500';
                charCounter.classList.remove('warning', 'danger');
                textInput.focus();
            }, 800);
        }
        
        if (data.type === 'error') {
            textInput.placeholder = '✗ ' + data.message;
            setTimeout(() => {
                textInput.placeholder = 'Whats your opinion?';
            }, 3000);
            submitBtn.disabled = false;
        }
        
        // Voting system handlers
        if (data.type === 'post') {
            // New post appeared on display - add to voting list
            addPostForVoting(data);
        }
        
        if (data.type === 'vote_recorded') {
            console.log('✅ Vote recorded:', data);
            updateVoteCount(data.totalVotes);
            markPostAsVoted(data.postId);
        }
        
        if (data.type === 'vote_update') {
            // Update vote counts on display
            updatePostVoteDisplay(data.postId, data.upvotes, data.downvotes);
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
    
    console.log('Submit clicked - Connected:', isConnected, 'Value:', value);
    
    if (!value) {
        console.warn('Submit blocked: empty value');
        textInput.placeholder = '✗ Please enter some text';
        setTimeout(() => {
            textInput.placeholder = 'Whats your opinion?';
        }, 2000);
        return;
    }
    
    if (!isConnected) {
        console.warn('Submit blocked: not connected');
        textInput.placeholder = '✗ Not connected to server';
        setTimeout(() => {
            textInput.placeholder = 'Whats your opinion?';
        }, 2000);
        return;
    }
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('Submit blocked: WebSocket not open', ws?.readyState);
        textInput.placeholder = '✗ Connection lost, reconnecting...';
        isConnected = false;
        submitBtn.disabled = true;
        connect();
        return;
    }
    
    // Show loading spinner
    submitBtn.textContent = '⟳';
    submitBtn.disabled = true;
    
    const post = {
        type: 'post',
        content: value,
        timestamp: new Date().toISOString()
    };
    
    try {
        ws.send(JSON.stringify(post));
        console.log('✅ Post sent successfully:', value);
        
        // Track this as user's own post
        userPosts.push({
            content: value,
            timestamp: post.timestamp
        });
        
        // Update display immediately
        renderYourPosts();
    } catch (error) {
        console.error('❌ Failed to send post:', error);
        textInput.placeholder = '✗ Failed to send. Try again.';
        submitBtn.textContent = 'Submit';
        submitBtn.disabled = false;
        setTimeout(() => {
            textInput.placeholder = 'Whats your opinion?';
        }, 2000);
    }
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


// Store all posts and cluster data
let allPosts = [];
let clusterData = [];
let userPosts = []; // Track posts submitted by this user
let uncategorizedPosts = [];

function updateClusterList(data) {
    console.log('🎨 updateClusterList called with:', data);
    
    // Handle both old format (just clusters array) and new format (object with clusters + posts)
    const clusters = data.clusters || data;
    uncategorizedPosts = data.uncategorizedPosts || [];
    
    if (!clusters || clusters.length === 0) {
        console.log('⚠️ No clusters to display');
        return;
    }
    
    clusterData = clusters;
    console.log('✅ Rendering', clusters.length, 'clusters');
    
    // Render all sections
    renderYourPosts();
    renderUncategorizedPosts();
    renderClusterCircles(clusters);
}

function renderYourPosts() {
    const container = document.getElementById('yourPosts');
    if (!container) return;
    
    if (userPosts.length === 0) {
        container.innerHTML = '<div style="color: #999; font-size: 12px; font-style: italic;">No posts yet</div>';
        return;
    }
    
    let html = '';
    userPosts.forEach(post => {
        html += `
            <div class="post-item your-post">
                ${post.content}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function renderUncategorizedPosts() {
    const container = document.getElementById('uncategorizedPosts');
    if (!container) return;
    
    if (uncategorizedPosts.length === 0) {
        container.innerHTML = '<div style="color: #999; font-size: 12px; font-style: italic;">All posts are categorized</div>';
        return;
    }
    
    let html = '';
    uncategorizedPosts.forEach(post => {
        html += `
            <div class="post-item uncategorized">
                ${post.content}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function renderClusterCircles(clusters) {
    const circlesContainer = document.getElementById('clusterCircles');
    if (!circlesContainer) return;
    
    // Sort clusters by count (most posts first)
    const sortedClusters = [...clusters].sort((a, b) => b.count - a.count);
    
    // Clear container
    circlesContainer.innerHTML = '';
    
    // Create cluster circles with proper event listeners
    sortedClusters.forEach((cluster) => {
        const hsl = `hsl(${cluster.color.h}, ${cluster.color.s}%, ${cluster.color.b}%)`;
        
        const circleDiv = document.createElement('div');
        circleDiv.className = 'cluster-circle';
        circleDiv.style.background = hsl;
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'cluster-circle-label';
        labelDiv.textContent = cluster.label;
        
        circleDiv.appendChild(labelDiv);
        
        // Add click listener with closure to capture correct cluster
        circleDiv.addEventListener('click', () => {
            showClusterDetail(cluster);
        });
        
        circlesContainer.appendChild(circleDiv);
    });
}

function showClusterDetail(cluster) {
    if (!cluster) return;
    
    console.log('Opening cluster:', cluster.label);
    
    // Hide overview, show detail
    document.getElementById('clusterSection').style.display = 'none';
    document.getElementById('clusterDetailView').style.display = 'block';
    
    // Update detail view
    const clusterName = document.getElementById('detailClusterName');
    const hsl = `hsl(${cluster.color.h}, ${cluster.color.s}%, ${cluster.color.b}%)`;
    clusterName.textContent = cluster.label;
    clusterName.style.background = hsl;
    
    // Show posts in this cluster
    const postsContainer = document.getElementById('clusterPosts');
    let html = '';
    
    if (cluster.posts && cluster.posts.length > 0) {
        // Display actual posts from cluster
        cluster.posts.forEach(post => {
            html += `
                <div class="post-item">
                    ${post.content}
                </div>
            `;
        });
    } else {
        // Fallback if no posts data
        for (let i = 0; i < cluster.count; i++) {
            html += `
                <div class="post-item">
                    "Opinion ${i + 1} in ${cluster.label} cluster"
                </div>
            `;
        }
    }
    
    postsContainer.innerHTML = html;
}

// Back button handler
document.addEventListener('DOMContentLoaded', () => {
    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.addEventListener('click', () => {
            document.getElementById('clusterDetailView').style.display = 'none';
            document.getElementById('clusterSection').style.display = 'block';
        });
    }
});

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

// Voting system variables
let userId = 'user_' + Math.random().toString(36).substr(2, 9);
let votedPosts = new Set();
let voteCount = 0;

// Voting helper functions
function addPostForVoting(postData) {
    const votingSection = document.getElementById('votingSection');
    const votingPosts = document.getElementById('votingPosts');
    
    // Show voting section
    votingSection.style.display = 'block';
    
    // Create post card with voting buttons
    const postCard = document.createElement('div');
    postCard.className = 'voting-post-card';
    postCard.id = `vote-post-${postData.timestamp}`;
    postCard.innerHTML = `
        <div class="post-content">${postData.content}</div>
        <div class="vote-buttons">
            <button class="vote-btn vote-up" onclick="castVote('${postData.timestamp}', 'up')">
                👍 Agree
            </button>
            <button class="vote-btn vote-down" onclick="castVote('${postData.timestamp}', 'down')">
                👎 Disagree
            </button>
        </div>
        <div class="vote-stats" id="stats-${postData.timestamp}">
            <span class="upvotes">0 👍</span>
            <span class="downvotes">0 👎</span>
        </div>
    `;
    
    votingPosts.appendChild(postCard);
}

function castVote(postId, vote) {
    if (votedPosts.has(postId)) {
        alert('You already voted on this post');
        return;
    }
    
    if (!isConnected) {
        alert('Not connected to server');
        return;
    }
    
    // Send vote to server
    ws.send(JSON.stringify({
        type: 'vote',
        postId: postId,
        vote: vote,
        userId: userId
    }));
}

function updateVoteCount(count) {
    voteCount = count;
    const voteCountElement = document.getElementById('voteCount');
    if (voteCountElement) {
        voteCountElement.textContent = count;
    }
}

function markPostAsVoted(postId) {
    votedPosts.add(postId);
    const postCard = document.getElementById(`vote-post-${postId}`);
    if (postCard) {
        const buttons = postCard.querySelectorAll('.vote-btn');
        buttons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        });
        postCard.classList.add('voted');
    }
}

function updatePostVoteDisplay(postId, upvotes, downvotes) {
    const statsElement = document.getElementById(`stats-${postId}`);
    if (statsElement) {
        statsElement.innerHTML = `
            <span class="upvotes">${upvotes} 👍</span>
            <span class="downvotes">${downvotes} 👎</span>
        `;
    }
}

// Make castVote globally accessible
window.castVote = castVote;

// Countdown timer functions
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateCountdown() {
    if (countdownTime <= 0) {
        clearInterval(countdownInterval);
        countdownElement.textContent = '00:00';
        textInput.disabled = true;
        submitBtn.disabled = true;
        textInput.placeholder = 'Time is up!';
        return;
    }
    
    countdownElement.textContent = formatTime(countdownTime);
    countdownTime--;
}

function startCountdown() {
    countdownTime = 180; // Reset to 3 minutes
    countdownElement.textContent = formatTime(countdownTime);
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    countdownInterval = setInterval(updateCountdown, 1000);
}

// Start countdown when page loads
startCountdown();

connect();
textInput.focus();
