// Onboarding configuration - SET TO false TO DISABLE ONBOARDING
window.ENABLE_ONBOARDING = false;

const textInput = document.getElementById('textInput');
const submitBtn = document.getElementById('submitBtn');
const countdownElement = document.getElementById('countdown');

let ws;
let isConnected = false;
let postHistoryData = [];
let clientId = null; // Unique client ID assigned by server

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
        
        // Register as mobile client and get unique ID
        ws.send(JSON.stringify({ type: 'register_mobile' }));
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
        
        if (data.type === 'countdown_update') {
            // Sync countdown timer with server
            updateCountdownFromServer(data.time);
            
            // Switch to clustering loading view when timer ends
            if (data.time === 0) {
                showClusteringLoadingView();
            }
        }
        
        if (data.type === 'clustering_progress') {
            // Update clustering progress on mobile
            updateClusteringProgress(data.progress, data.phase);
        }
        
        if (data.type === 'clustering_complete') {
            // Clustering animation finished, show cluster results
            showClusterView();
        }
        
        if (data.type === 'clusters') {
            // Display cluster results
            displayClusters(data.clusters || []);
        }
        
        if (data.type === 'clear_all_posts') {
            // Reset mobile view back to input section
            const inputSection = document.getElementById('inputSection');
            const clusterSection = document.getElementById('clusterSection');
            const revealSection = document.getElementById('topicRevealSection');
            
            if (inputSection && clusterSection) {
                inputSection.style.display = 'flex';
                clusterSection.style.display = 'none';
            }
            
            if (revealSection) {
                revealSection.style.display = 'none';
            }
            
            // Reset voting timer
            if (votingTimerInterval) {
                clearInterval(votingTimerInterval);
                votingTimerInterval = null;
            }
            votingTimeRemaining = 60;
            currentClusters = [];
            
            // Reset voting flag for new round
            hasVoted = false;
            
            // Re-enable input
            textInput.disabled = false;
            submitBtn.disabled = false;
            textInput.placeholder = 'Whats your opinion?';
            textInput.value = '';
            
            console.log('🔄 Mobile view reset to input section');
        }
        
        if (data.type === 'cluster_vote_update') {
            // Update vote count for specific cluster
            updateClusterVotes(data.clusterId);
        }
        
        if (data.type === 'skip_to_reveal') {
            // Skip directly to topic reveal with placeholder data
            console.log('⏭️ Skipping to topic reveal');
            showTopicReveal(data.cluster);
        }
        
        if (data.type === 'client_id') {
            // Store assigned client ID
            clientId = data.clientId;
            console.log(`📱 Assigned client ID: ${clientId}`);
        }
        
        if (data.type === 'role_assignment') {
            // Display role screen based on assignment
            console.log(`🎭 Role assigned: ${data.role}, group: ${data.group || 'none'}`);
            showRoleScreen(data.role, data.group);
        }
        
        if (data.type === 'start_debate_voting') {
            // Show debate voting screen
            console.log('🎤 Starting debate voting on mobile');
            showDebateVoting();
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

// Countdown timer functions (synced with server)
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateCountdownFromServer(time) {
    countdownTime = time;
    countdownElement.textContent = formatTime(time);
    
    // Disable input when time is up
    if (time <= 0) {
        textInput.disabled = true;
        submitBtn.disabled = true;
        textInput.placeholder = 'Time is up!';
    }
}

// Show clustering loading screen
function showClusteringLoadingView() {
    const inputSection = document.getElementById('inputSection');
    const loadingSection = document.getElementById('clusteringLoadingSection');
    
    if (inputSection && loadingSection) {
        inputSection.style.display = 'none';
        loadingSection.style.display = 'flex';
        console.log('⏳ Showing clustering loading view');
    }
}

// Update clustering progress bar and phase text
function updateClusteringProgress(progress, phase) {
    const progressBar = document.getElementById('clusteringProgressBar');
    const phaseText = document.getElementById('clusteringPhaseText');
    
    if (progressBar) {
        progressBar.style.width = `${progress * 100}%`;
    }
    
    if (phaseText && phase) {
        phaseText.textContent = phase;
    }
}

// Switch from loading view to cluster results view
function showClusterView() {
    const loadingSection = document.getElementById('clusteringLoadingSection');
    const clusterSection = document.getElementById('clusterSection');
    
    if (loadingSection && clusterSection) {
        loadingSection.style.display = 'none';
        clusterSection.style.display = 'block';
        console.log('📊 Switched to cluster view');
        
        // Start voting timer
        startVotingTimer();
    }
}

// Display clusters with colored circles and vote counts
function displayClusters(clusters) {
    const clusterList = document.getElementById('clusterList');
    if (!clusterList) return;
    
    // Store clusters for winner determination
    currentClusters = clusters;
    console.log('📦 Stored clusters for voting:', clusters.map(c => ({ 
        id: c.id, 
        label: c.label, 
        hasKeywords: !!c.keywords,
        keywords: c.keywords 
    })));
    
    clusterList.innerHTML = '';
    
    clusters.forEach((cluster, index) => {
        const clusterItem = document.createElement('div');
        clusterItem.className = 'cluster-item';
        clusterItem.dataset.clusterId = cluster.id;
        
        // Convert HSB color to RGB for CSS
        const rgb = hsbToRgb(cluster.color.h, cluster.color.s, cluster.color.b);
        
        // Create vote dots
        const voteCount = cluster.votes || 0;
        const voteDots = Array(Math.min(voteCount, 10)).fill(0).map(() => 
            '<div class="vote-dot"></div>'
        ).join('');
        
        clusterItem.innerHTML = `
            <div class="cluster-box" style="border-color: rgb(${rgb.r}, ${rgb.g}, ${rgb.b}); color: rgb(${rgb.r}, ${rgb.g}, ${rgb.b});">
                <span class="cluster-label">${cluster.label || 'Cluster ' + cluster.id}</span>
                <span class="cluster-vote-count">${voteCount}</span>
            </div>
        `;
        
        // Add click handler for voting
        clusterItem.addEventListener('click', () => {
            voteForCluster(cluster.id);
        });
        
        clusterList.appendChild(clusterItem);
    });
    
    console.log(`📊 Displayed ${clusters.length} clusters`);
}

// Track if user has already voted
let hasVoted = false;

// Vote for a cluster
function voteForCluster(clusterId) {
    // Prevent multiple votes
    if (hasVoted) {
        console.log('⚠️ You have already voted');
        return;
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'vote_cluster',
            clusterId: clusterId,
            clientId: clientId // Include client ID for server-side tracking
        }));
        hasVoted = true;
        console.log(`✅ Voted for cluster ${clusterId}`);
        
        // Disable all cluster items after voting
        document.querySelectorAll('.cluster-item').forEach(item => {
            item.style.pointerEvents = 'none';
            item.style.opacity = '0.6';
        });
    }
}

// Convert HSB to RGB for CSS
function hsbToRgb(h, s, b) {
    s = s / 100;
    b = b / 100;
    const k = (n) => (n + h / 60) % 6;
    const f = (n) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
    return {
        r: Math.round(255 * f(5)),
        g: Math.round(255 * f(3)),
        b: Math.round(255 * f(1))
    };
}

// Update vote display for a cluster
function updateClusterVotes(clusterId) {
    const clusterItem = document.querySelector(`[data-cluster-id="${clusterId}"]`);
    if (!clusterItem) return;
    
    const voteCountEl = clusterItem.querySelector('.vote-count');
    const voteDotsEl = clusterItem.querySelector('.cluster-votes');
    
    if (voteCountEl && voteDotsEl) {
        // Parse current vote count
        const currentVotes = parseInt(voteCountEl.textContent) || 0;
        const newVotes = currentVotes + 1;
        
        // Update count
        voteCountEl.textContent = `${newVotes} ${newVotes === 1 ? 'vote' : 'votes'}`;
        
        // Add new vote dot (max 10 visible)
        if (newVotes <= 10) {
            const newDot = document.createElement('div');
            newDot.className = 'vote-dot';
            voteDotsEl.appendChild(newDot);
        }
        
        // Update stored cluster data
        const cluster = currentClusters.find(c => c.id === clusterId);
        if (cluster) {
            cluster.votes = newVotes;
        }
    }
}

// Voting timer variables
let votingTimeRemaining = 60; // 1 minute in seconds
let votingTimerInterval = null;
let currentClusters = []; // Store clusters for winner determination

// Start voting timer
function startVotingTimer() {
    const votingTimerEl = document.getElementById('votingTimer');
    if (!votingTimerEl) return;
    
    votingTimeRemaining = 60; // Reset to 1 minute
    
    if (votingTimerInterval) {
        clearInterval(votingTimerInterval);
    }
    
    votingTimerInterval = setInterval(() => {
        if (votingTimeRemaining <= 0) {
            clearInterval(votingTimerInterval);
            votingTimerEl.textContent = '00:00';
            onVotingComplete();
            return;
        }
        
        const minutes = Math.floor(votingTimeRemaining / 60);
        const seconds = votingTimeRemaining % 60;
        votingTimerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        votingTimeRemaining--;
    }, 1000);
    
    console.log('⏱️ Voting timer started (1 minute)');
}

// Determine winning cluster and show topic reveal
function onVotingComplete() {
    console.log('🏁 Voting time completed!');
    
    // Disable voting
    document.querySelectorAll('.cluster-item').forEach(item => {
        item.style.pointerEvents = 'none';
        item.style.opacity = '0.6';
    });
    
    // Find cluster with most votes
    const winningCluster = findWinningCluster();
    
    if (winningCluster) {
        console.log('🏆 Winning cluster:', winningCluster.label, 'with', winningCluster.votes, 'votes');
        console.log('   Has keywords?', !!winningCluster.keywords);
        console.log('   Keywords:', winningCluster.keywords);
        
        // Send winning cluster to server to trigger main display animation
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'skip_to_reveal',
                cluster: winningCluster
            }));
            console.log('📤 Sent winning cluster to server:', JSON.stringify(winningCluster, null, 2));
        }
        
        // Show topic reveal transition on mobile
        setTimeout(() => {
            showTopicReveal(winningCluster);
        }, 1000);
    }
}

// Find cluster with most votes
function findWinningCluster() {
    if (currentClusters.length === 0) return null;
    
    let maxVotes = -1;
    let winner = null;
    
    currentClusters.forEach(cluster => {
        const votes = cluster.votes || 0;
        if (votes > maxVotes) {
            maxVotes = votes;
            winner = cluster;
        }
    });
    
    return winner;
}

// Show role assignment screen
function showRoleScreen(role, group) {
    console.log(`🎭 Showing role screen: ${role}, group: ${group}`);
    
    // Hide all other sections
    const inputSection = document.getElementById('inputSection');
    const clusterSection = document.getElementById('clusterSection');
    const revealSection = document.getElementById('topicRevealSection');
    const roleSection = document.getElementById('roleAssignmentSection');
    
    if (inputSection) inputSection.style.display = 'none';
    if (clusterSection) clusterSection.style.display = 'none';
    if (revealSection) revealSection.style.display = 'none';
    
    // Show role section
    if (roleSection) {
        roleSection.style.display = 'flex';
        
        const roleBox = document.getElementById('roleBox');
        const roleName = document.getElementById('roleName');
        const roleIcon = document.getElementById('roleIcon');
        const groupInfo = document.getElementById('groupInfo');
        const groupName = document.getElementById('groupName');
        const groupInstruction = document.getElementById('groupInstruction');
        
        // Set role name
        if (roleName) {
            roleName.textContent = role === 'debater' ? 'Debater' : 'Listener';
        }
        
        // Set box color based on role
        if (roleBox) {
            if (role === 'listener') {
                roleBox.classList.add('listener');
            } else {
                roleBox.classList.remove('listener');
            }
        }
        
        // Generate role icon (simplified circles/rows)
        if (roleIcon) {
            roleIcon.innerHTML = generateRoleIcon(role, group);
        }
        
        // Set group info
        if (role === 'debater' && group) {
            if (groupInfo) groupInfo.style.display = 'block';
            if (groupName) {
                groupName.textContent = `Group ${group}`;
                groupName.className = 'group-name';
                groupName.classList.add(`group-${group}`);
            }
            if (groupInstruction) {
                groupInstruction.textContent = 'Place yourselves in the circle in your circle and get ready';
            }
        } else {
            // Listener
            if (groupInfo) groupInfo.style.display = 'block';
            if (groupName) {
                groupName.textContent = '';
                groupName.style.display = 'none';
            }
            if (groupInstruction) {
                groupInstruction.textContent = 'Stay seated, or place yourselves in the stair seats';
                groupInstruction.style.color = '#666';
            }
        }
    }
}

// Generate role icon SVG
function generateRoleIcon(role, group) {
    if (role === 'debater') {
        // Semicircle formation icon
        const color = group === 1 ? '#0000FE' : '#0000FE'; // Blue for both debater groups
        return `
            <svg width="120" height="80" viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
                <!-- Semicircle formation -->
                <circle cx="60" cy="70" r="8" fill="${color}"/>
                <circle cx="40" cy="60" r="8" fill="${color}"/>
                <circle cx="80" cy="60" r="8" fill="${color}"/>
                <circle cx="30" cy="45" r="8" fill="${color}"/>
                <circle cx="90" cy="45" r="8" fill="${color}"/>
                <circle cx="25" cy="30" r="8" fill="${color}"/>
                <circle cx="95" cy="30" r="8" fill="${color}"/>
                <!-- Top line -->
                <rect x="20" y="10" width="80" height="6" rx="3" fill="${color}"/>
                <!-- Bottom sections -->
                <rect x="45" y="75" width="30" height="5" rx="2.5" fill="${color}"/>
                <rect x="35" y="75" width="8" height="5" rx="2.5" fill="${color}"/>
                <rect x="77" y="75" width="8" height="5" rx="2.5" fill="${color}"/>
            </svg>
        `;
    } else {
        // Rows of seats icon for listeners
        const color = '#FF6B35'; // Orange for listeners
        return `
            <svg width="120" height="80" viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
                <!-- Row 1 -->
                <rect x="20" y="10" width="20" height="8" rx="4" fill="${color}"/>
                <rect x="50" y="10" width="20" height="8" rx="4" fill="${color}"/>
                <rect x="80" y="10" width="20" height="8" rx="4" fill="${color}"/>
                <!-- Row 2 -->
                <rect x="20" y="28" width="20" height="8" rx="4" fill="${color}"/>
                <rect x="50" y="28" width="20" height="8" rx="4" fill="${color}"/>
                <rect x="80" y="28" width="20" height="8" rx="4" fill="${color}"/>
                <!-- Row 3 -->
                <rect x="20" y="46" width="20" height="8" rx="4" fill="${color}"/>
                <rect x="50" y="46" width="20" height="8" rx="4" fill="${color}"/>
                <rect x="80" y="46" width="20" height="8" rx="4" fill="${color}"/>
                <!-- Row 4 -->
                <rect x="20" y="64" width="20" height="8" rx="4" fill="${color}"/>
                <rect x="50" y="64" width="20" height="8" rx="4" fill="${color}"/>
                <rect x="80" y="64" width="20" height="8" rx="4" fill="${color}"/>
            </svg>
        `;
    }
}

// Show topic reveal - simple static display
function showTopicReveal(cluster) {
    const clusterSection = document.getElementById('clusterSection');
    const revealSection = document.getElementById('topicRevealSection');
    const revealTopicBox = document.getElementById('revealTopicBox');
    const revealTopicName = document.getElementById('revealTopicName');
    
    if (!revealSection || !revealTopicBox || !revealTopicName) return;
    
    // Convert cluster color to RGB
    const rgb = hsbToRgb(cluster.color.h, cluster.color.s, cluster.color.b);
    const colorString = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    
    // Set box border and text color
    revealTopicBox.style.borderColor = colorString;
    revealTopicBox.style.color = colorString;
    
    // Set topic name
    revealTopicName.textContent = cluster.label || 'Cluster ' + cluster.id;
    
    // Add fade-out to cluster section
    clusterSection.classList.add('fade-out-view');
    
    // Wait for fade out, then switch views
    setTimeout(() => {
        clusterSection.style.display = 'none';
        clusterSection.classList.remove('fade-out-view');
        
        revealSection.style.display = 'flex';
        revealSection.classList.add('fade-in');
        
        console.log('📺 Topic reveal displayed');
        
        // Trigger role assignment after a delay
        setTimeout(() => {
            console.log('🎯 Requesting role assignment');
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'assign_roles' }));
            }
            
        }, 3500);
        
    }, 800); // Wait for fade-out animation
}


// ========================================
// Debate Voting Handlers
// ========================================

// Get debate voting buttons
const voteBlueBtn = document.getElementById('voteBlueBtn');
const voteRedBtn = document.getElementById('voteRedBtn');
const debateVotingSection = document.getElementById('debateVotingSection');

// Handle blue vote
if (voteBlueBtn) {
    voteBlueBtn.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
                type: 'debate_vote', 
                color: 'blue' 
            }));
            console.log('🔵 Voted blue');
        }
    });
}

// Handle red vote
if (voteRedBtn) {
    voteRedBtn.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
                type: 'debate_vote', 
                color: 'red' 
            }));
            console.log('🔴 Voted red');
        }
    });
}

// Show debate voting screen
function showDebateVoting() {
    console.log('🎤 Showing debate voting screen');
    
    // Hide all other sections
    const inputSection = document.getElementById('inputSection');
    const clusterSection = document.getElementById('clusterSection');
    const revealSection = document.getElementById('topicRevealSection');
    const debaterSection = document.getElementById('debaterSection');
    const listenerSection = document.getElementById('listenerSection');
    
    if (inputSection) inputSection.style.display = 'none';
    if (clusterSection) clusterSection.style.display = 'none';
    if (revealSection) revealSection.style.display = 'none';
    if (debaterSection) debaterSection.style.display = 'none';
    if (listenerSection) listenerSection.style.display = 'none';
    
    // Show debate voting section
    if (debateVotingSection) {
        debateVotingSection.style.display = 'flex';
    }
}

connect();
textInput.focus();
