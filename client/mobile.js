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
        
        // Check if we have a stored session ID (for reconnects/refreshes)
        const storedSessionId = localStorage.getItem('sessionId');
        
        // Register as mobile client and get unique ID
        ws.send(JSON.stringify({ 
            type: 'register_mobile',
            sessionId: storedSessionId // Send existing session ID if we have one
        }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Handle state sync on connect/reconnect
        if (data.type === 'state_sync') {
            console.log(`🔄 State sync received - phase: ${data.phase}`);
            handleStateSync(data.phase, data.data, data.timing);
            return;
        }
        
        if (data.type === 'headline') {
            // Headline received but not displayed on this simplified controller
            console.log('Headline received:', data.headline);
        }
        
        if (data.type === 'clusters') {
            // Update cluster list display
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
            updateVoteCount(data.totalVotes);
            markPostAsVoted(data.postId);
        }
        
        if (data.type === 'vote_update') {
            // Update vote counts on display
            updatePostVoteDisplay(data.postId, data.upvotes, data.downvotes);
        }
        
        if (data.type === 'refresh_page') {
            // Main display refreshed - reload mobile page
            console.log('🔄 Main display refreshed - reloading page');
            window.location.reload();
        }
        
        if (data.type === 'experience_start') {
            // Hide idle screen and show input section
            console.log('🎬 Experience started - showing input section');
            const idleSection = document.getElementById('idleSection');
            const inputSection = document.getElementById('inputSection');
            
            if (idleSection) idleSection.style.display = 'none';
            if (inputSection) inputSection.style.display = 'flex';
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
            console.log('📦 Received clusters from server:', data.clusters);
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
            votingTimeRemaining = 30;
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
            // Update all cluster votes to show other users' votes
            updateAllClusterVotes(data.votes);
        }
        
        if (data.type === 'skip_to_reveal') {
            // Skip directly to topic reveal with placeholder data
            console.log('⏭️ Skipping to topic reveal');
            showTopicReveal(data.cluster);
        }
        
        if (data.type === 'client_id') {
            // Store assigned client ID
            clientId = data.clientId;
            
            // Store session ID in localStorage for reconnects/refreshes
            if (data.sessionId) {
                localStorage.setItem('sessionId', data.sessionId);
                console.log(`📱 Assigned client ID: ${clientId}, session ID: ${data.sessionId}`);
            } else {
                console.log(`📱 Assigned client ID: ${clientId}`);
            }
        }
        
        if (data.type === 'start_role_assignment_animation') {
            // Show loading animation synced with main display
            console.log('🎬 Starting role assignment animation');
            showAssigningRolesLoading();
        }
        
        if (data.type === 'role_assignment') {
            // Store role data but don't show yet - wait for animation to complete
            const roleData = {
                role: data.role,
                group: data.group,
                stance: data.stance,
                clusterName: data.clusterName,
                clusterColor: data.clusterColor,
                debateArgument: data.debateArgument
            };
            
            // CRITICAL: Store debate question IMMEDIATELY so it's available when UI renders
            if (data.debateArgument) {
                window.debateQuestion = data.debateArgument;
                console.log(`📝 Stored debate question: ${data.debateArgument}`);
            }
            if (data.clusterName) {
                window.clusterName = data.clusterName;
                console.log(`📝 Stored cluster name: ${data.clusterName}`);
            }
            
            console.log(`🎭 Role assigned: ${data.role}, group: ${data.group || 'none'}`);
            
            // Wait for loading animation to complete before showing role screen
            setTimeout(() => {
                // Remove loading screen
                const loadingScreen = document.getElementById('assigningRolesLoading');
                if (loadingScreen) {
                    loadingScreen.classList.add('fade-out-view');
                    setTimeout(() => {
                        loadingScreen.remove();
                    }, 500);
                }
                
                // Now show role assignment screen
                displayRoleAssignment(roleData);
            }, 6000); // 4.5s animation + 1.5s fade
            
            return; // Don't execute the rest of the role assignment code yet
        }
        
        // This code below will be called by displayRoleAssignment after delay
        function displayRoleAssignment(data) {
            
            // DEV OVERRIDE: if window.forceRole is set, ignore server assignment
            if (window.forceRole) {
                data = Object.assign({}, data, { role: window.forceRole.role, group: window.forceRole.group });
                console.log(`🛠️ forceRole override: ${data.role} group ${data.group}`);
            }

            // Store user's role and group
            userRole = data.role;
            if (data.role === 'debater') {
                userGroup = data.group;
            }
            
            // First show role reveal screen (colored background with icon)
            showRoleRevealScreen(data.role, data.group);
            
            // Then after 5s (matching main display icon duration), show detailed role screen
            setTimeout(() => {
                removeRoleRevealScreen();
                
                // Update debate argument text for both listeners and debaters
                if (data.debateArgument) {
                    const listenerArgumentText = document.getElementById('listenerArgumentText');
                    const debateArgumentText = document.getElementById('debateArgumentText');
                    
                    if (listenerArgumentText) {
                        listenerArgumentText.textContent = data.debateArgument;
                    }
                    if (debateArgumentText) {
                        debateArgumentText.textContent = data.debateArgument;
                        console.log('📝 Set debater argument text to:', data.debateArgument);
                    }
                }
                
                // Update debate topic box with cluster name
                if (data.clusterName) {
                    const debateStatement = document.getElementById('debateStatement');
                    if (debateStatement) {
                        debateStatement.textContent = data.clusterName;
                        console.log('📝 Set debate topic to:', data.clusterName);
                    }
                }
                
                // Update topic box color
                if (data.clusterColor) {
                    const topicBox = document.getElementById('debateTopicBox');
                    if (topicBox) {
                        const rgb = hsbToRgb(data.clusterColor.h, data.clusterColor.s, data.clusterColor.b);
                        topicBox.style.borderColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
                    }
                }
                
                showRoleScreen(data.role, data.group);
            }, 5000); // 5s to match main display icon duration
        }
        
        if (data.type === 'start_debate_voting') {
            // Show debate voting screen
            console.log('🎤 Starting debate voting on mobile');
            
            // Store cluster information
            if (data.clusterName) {
                const debateStatement = document.getElementById('debateStatement');
                if (debateStatement) {
                    debateStatement.textContent = data.clusterName;
                }
            }
            
            // Store debate question and positions
            if (data.debateQuestion) {
                console.log('📝 Debate question:', data.debateQuestion);
                console.log('   Group 1:', data.group1Position?.stance);
                console.log('   Group 2:', data.group2Position?.stance);
                
                // Store for later display based on user's group
                window.debateQuestion = data.debateQuestion;
                window.group1Position = data.group1Position;
                window.group2Position = data.group2Position;
                
                // Update argument text for both listeners and debaters
                const listenerArgumentText = document.getElementById('listenerArgumentText');
                const debateArgumentText = document.getElementById('debateArgumentText');
                
                if (listenerArgumentText) {
                    listenerArgumentText.textContent = data.debateQuestion;
                    console.log('📝 Updated listener argument text:', data.debateQuestion);
                }
                
                if (debateArgumentText) {
                    debateArgumentText.textContent = data.debateQuestion;
                    console.log('📝 Updated debater argument text:', data.debateQuestion);
                }
            }
            
            // Store and apply original cluster color to topic box
            if (data.clusterColor) {
                originalTopicColor = data.clusterColor;
                const topicBox = document.getElementById('debateTopicBox');
                if (topicBox) {
                    // Convert HSB to RGB for CSS
                    const rgb = hsbToRgb(data.clusterColor.h, data.clusterColor.s, data.clusterColor.b);
                    topicBox.style.borderColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
                }
            }
            
            showDebateVoting();
        }
        
        if (data.type === 'debate_timer_update') {
            // Update timer display on mobile
            updateDebateTimer(data);
            
            // Check if debate is over
            if (data.debateOver) {
                showDebateOverScreen();
            }
        }
        
        if (data.type === 'debater_ready_update') {
            // Update listener ready counters
            console.log(`📊 Debater ready update received: Group 1: ${data.group1Ready}/${data.group1Total}, Group 2: ${data.group2Ready}/${data.group2Total}`);
            updateListenerReadyCounters(data.group1Ready, data.group1Total, data.group2Ready, data.group2Total);
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
    // Handle both old format (just clusters array) and new format (object with clusters + posts)
    const clusters = data.clusters || data;
    uncategorizedPosts = data.uncategorizedPosts || [];
    
    if (!clusters || clusters.length === 0) {
        return;
    }
    
    clusterData = clusters;
    
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
        
        // Initialize progress blocks
        initializeProgressBlocks(12); // 12 blocks for wider appearance
    }
}

// Initialize progress blocks (call once when showing loader)
function initializeProgressBlocks(numBlocks = 20) {
    const container = document.getElementById('clusteringProgressContainer');
    if (!container) return;
    
    container.innerHTML = ''; // Clear existing blocks
    
    for (let i = 0; i < numBlocks; i++) {
        const block = document.createElement('div');
        block.className = 'progress-block';
        block.dataset.index = i;
        container.appendChild(block);
    }
}

// Update clustering progress bar - fill blocks one by one
function updateClusteringProgress(progress, phase) {
    const container = document.getElementById('clusteringProgressContainer');
    const phaseText = document.getElementById('clusteringPhaseText');
    
    if (container) {
        const blocks = container.querySelectorAll('.progress-block');
        const numBlocks = blocks.length;
        const filledBlocks = Math.floor(progress * numBlocks);
        
        blocks.forEach((block, index) => {
            if (index < filledBlocks) {
                block.classList.add('filled');
            } else {
                block.classList.remove('filled');
            }
        });
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
        
        // Start voting timer
        startVotingTimer();
    }
}

// Display clusters with colored circles and vote counts
function displayClusters(clusters) {
    const clusterList = document.getElementById('clusterList');
    if (!clusterList) return;
    
    // Check if clusters are already rendered (prevent duplicate rendering)
    const existingClusters = clusterList.querySelectorAll('.cluster-item');
    if (existingClusters.length > 0 && existingClusters.length === clusters.length) {
        console.log('⏭️ Clusters already rendered, skipping duplicate render');
        return;
    }
    
    // Store clusters for winner determination
    currentClusters = clusters;
    
    clusterList.innerHTML = '';
    
    clusters.forEach((cluster, index) => {
        console.log(`📋 Rendering cluster ${index}: ID=${cluster.id}, Label="${cluster.label}"`);
        
        const clusterItem = document.createElement('div');
        clusterItem.className = 'cluster-item';
        clusterItem.dataset.clusterId = cluster.id;
        
        // Convert HSB color to RGB for CSS
        const rgb = hsbToRgb(cluster.color.h, cluster.color.s, cluster.color.b);
        
        // Darker shadow color (~60% of cluster color)
        const shadowR = Math.round(rgb.r * 0.6);
        const shadowG = Math.round(rgb.g * 0.6);
        const shadowB = Math.round(rgb.b * 0.6);

        clusterItem.innerHTML = `
            <div class="cluster-box" style="color: rgb(${rgb.r}, ${rgb.g}, ${rgb.b});">
                <div class="cluster-label">${cluster.label || 'Cluster ' + cluster.id}</div>
            </div>
            <div class="vote-bar" style="background-color: rgb(${rgb.r}, ${rgb.g}, ${rgb.b});">
                <span class="vote-bar-label">VOTES</span>
                <div class="vote-circles"></div>
            </div>
            <div class="cluster-shadow" style="background-color: rgb(${shadowR}, ${shadowG}, ${shadowB});"></div>
        `;
        
        // Add click handler for voting
        clusterItem.addEventListener('click', function() {
            const clusterId = this.dataset.clusterId;
            console.log(`🖱️ Button clicked for cluster: ${clusterId}`);
            voteForCluster(clusterId);
        });
        
        clusterList.appendChild(clusterItem);
    });
}

// Track current vote
let currentVote = null;

// Vote for a cluster
function voteForCluster(clusterId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Convert to string for consistent comparison
        const clusterIdStr = String(clusterId);
        const currentVoteStr = currentVote ? String(currentVote) : null;
        
        console.log(`🗳️ Voting for cluster: ${clusterIdStr}`);
        
        // Toggle behavior: if clicking same cluster, remove vote
        const isTogglingOff = currentVoteStr === clusterIdStr;
        const newVote = isTogglingOff ? null : clusterIdStr;
        
        console.log(`   Previous vote: ${currentVote}, New vote: ${newVote}`);
        
        ws.send(JSON.stringify({
            type: 'vote_cluster',
            clusterId: newVote,
            clientId: clientId,
            previousVote: currentVote
        }));
        
        const previousVote = currentVote;
        currentVote = newVote;
        
        // Update UI for all cluster boxes
        document.querySelectorAll('.cluster-item').forEach(item => {
            const box = item.querySelector('.cluster-box');
            const label = item.querySelector('.cluster-label');
            const voteCirclesContainer = item.querySelector('.vote-circles');
            const itemClusterId = String(item.dataset.clusterId || item.getAttribute('data-cluster-id'));
            
            console.log(`   Checking item with clusterId: ${itemClusterId}, matches newVote: ${itemClusterId === newVote}`);
            
            // Clear all circles and voted states first
            box.classList.remove('voted');
            if (label) {
                label.style.backgroundColor = ''; // Reset background
            }
            if (voteCirclesContainer) {
                voteCirclesContainer.innerHTML = '';
            }
            
            // Add circle only to the currently selected cluster
            if (newVote && itemClusterId === newVote) {
                console.log(`   ✅ Adding voted state to cluster ${itemClusterId}`);
                box.classList.add('voted');
                
                // Set label background to cluster color
                if (label) {
                    const clusterColor = box.style.color; // Get the cluster color from the box
                    label.style.backgroundColor = clusterColor;
                }
                
                if (voteCirclesContainer) {
                    const newCircle = document.createElement('div');
                    newCircle.className = 'vote-circle user-vote';
                    voteCirclesContainer.appendChild(newCircle);
                }
            }
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

// Update all cluster votes from server (shows other users' votes)
function updateAllClusterVotes(votesData) {
    if (!votesData) return;
    
    console.log('📊 Updating votes from server (raw):', votesData);
    
    // Deduplicate vote data (server sometimes sends duplicates)
    const deduplicatedVotes = {};
    for (const [clusterId, voteCount] of Object.entries(votesData)) {
        // Keep the highest vote count if there are duplicates
        if (!deduplicatedVotes[clusterId] || voteCount > deduplicatedVotes[clusterId]) {
            deduplicatedVotes[clusterId] = voteCount;
        }
    }
    
    console.log('📊 Deduplicated votes:', deduplicatedVotes);
    console.log('👤 Current user vote:', currentVote);
    
    // votesData format: { clusterId: voteCount, ... }
    document.querySelectorAll('.cluster-item').forEach(item => {
        const itemClusterId = String(item.dataset.clusterId || item.getAttribute('data-cluster-id'));
        const voteCirclesContainer = item.querySelector('.vote-circles');
        const box = item.querySelector('.cluster-box');
        
        if (!voteCirclesContainer) return;
        
        // Get vote count for this cluster from deduplicated data
        let serverVoteCount = deduplicatedVotes[itemClusterId] || 0;
        
        // WORKAROUND: If this cluster has an unreasonably high vote count compared to others,
        // it's likely a server bug. Cap it at a reasonable number.
        const maxVotes = Math.max(...Object.values(deduplicatedVotes));
        const avgVotes = Object.values(deduplicatedVotes).reduce((a, b) => a + b, 0) / Object.keys(deduplicatedVotes).length;
        if (serverVoteCount > avgVotes * 3 && serverVoteCount > 3) {
            console.warn(`⚠️ Cluster ${itemClusterId} has suspicious vote count: ${serverVoteCount}, capping to 1`);
            serverVoteCount = 1;
        }
        
        // Check if this is the user's current vote
        const isUserVote = currentVote && String(currentVote) === itemClusterId;
        
        // Clear existing circles
        voteCirclesContainer.innerHTML = '';
        
        // Total circles to show
        const totalCircles = serverVoteCount;
        
        console.log(`  Cluster ${itemClusterId}: ${totalCircles} circles, user voted: ${isUserVote}`);
        
        // Add circles
        for (let i = 0; i < totalCircles; i++) {
            const circle = document.createElement('div');
            circle.className = 'vote-circle';
            
            // If this is user's vote, make first circle white, rest colored
            if (isUserVote && i === 0) {
                circle.classList.add('user-vote');
            } else {
                circle.classList.add('other-vote');
            }
            
            voteCirclesContainer.appendChild(circle);
        }
        
        // Keep voted state if user voted for this
        if (isUserVote) {
            box.classList.add('voted');
        } else {
            box.classList.remove('voted');
        }
    });
}

// Voting timer variables
let votingTimeRemaining = 30; // 30 seconds to match server
let votingTimerInterval = null;
let currentClusters = []; // Store clusters for winner determination

// Start voting timer
function startVotingTimer() {
    const votingTimerEl = document.getElementById('votingTimer');
    if (!votingTimerEl) return;
    
    votingTimeRemaining = 30; // Reset to 30 seconds
    
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

// Role reveal screen — full-screen flash shown before the detailed role screen
function showRoleRevealScreen(role, group) {
    // Remove any existing reveal screen
    const existing = document.getElementById('roleRevealScreen');
    if (existing) existing.remove();

    // Colors per role/group
    let bgColor, iconColor, roleLabel, groupLabel;
    if (role === 'listener') {
        bgColor   = '#3f985b';
        iconColor = '#bcdbc6';
        roleLabel = 'LISTENER';
        groupLabel = 'AUDIENCE';
    } else if (group === 2) {
        bgColor   = '#0000FE';
        iconColor = '#8080ff';
        roleLabel = 'DEBATER';
        groupLabel = 'GROUP 2';
    } else {
        bgColor   = '#D62828';
        iconColor = '#eb9393';
        roleLabel = 'DEBATER';
        groupLabel = 'GROUP 1';
    }

    const screen = document.createElement('div');
    screen.id = 'roleRevealScreen';
    screen.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        background: ${bgColor};
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        padding: 25px;
        z-index: 20000;
        box-sizing: border-box;
        overflow: hidden;
    `;

    // Icon — MD Thermochrome emoji glyph, large
    const iconWrap = document.createElement('div');
    iconWrap.style.cssText = `
        width: 100%;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: ${role === 'listener' ? 'center' : role === 'debater' && group === 2 ? 'flex-end' : 'flex-start'};
        padding: 10px;
        overflow: hidden;
    `;

    const iconEl = document.createElement('div');
    // \uFE0E = Text Variation Selector-15: forces font text glyph over system colour emoji
    const iconChar = role === 'listener' ? '\uD83D\uDC64\uFE0E' : '\uD83D\uDCAC\uFE0E';
    iconEl.textContent = iconChar;
    iconEl.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: min(65vw, 65vh);
        line-height: 1;
        color: ${iconColor};
        display: block;
        font-variant-emoji: text;
        -webkit-font-variant-emoji: text;
        ${role === 'debater' && group === 2 ? 'transform: scaleX(-1);' : ''}
    `;
    iconWrap.appendChild(iconEl);

    // Text block
    const textBlock = document.createElement('div');
    textBlock.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px;
        align-items: ${role === 'listener' ? 'center' : 'flex-start'};
        flex-shrink: 0;
        width: 100%;
    `;

    const roleLabelEl = document.createElement('p');
    roleLabelEl.textContent = roleLabel;
    roleLabelEl.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 40px;
        font-weight: 600;
        color: #fff;
        margin: 0;
        letter-spacing: 0;
    `;

    const groupLabelEl = document.createElement('p');
    groupLabelEl.textContent = groupLabel;
    groupLabelEl.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 32px;
        font-weight: 600;
        color: ${iconColor};
        margin: 0;
        letter-spacing: 4.8px;
    `;

    textBlock.appendChild(roleLabelEl);
    textBlock.appendChild(groupLabelEl);

    screen.appendChild(iconWrap);
    screen.appendChild(textBlock);
    document.body.appendChild(screen);
}

function removeRoleRevealScreen() {
    const screen = document.getElementById('roleRevealScreen');
    if (screen) {
        screen.classList.add('fade-out-view');
        setTimeout(() => screen.remove(), 500);
    }
}

// Test helper: window.testDebaterActive()
window.testDebaterActive = function() {
    showDebaterActiveScreen();
    let t = 30;
    const iv = setInterval(() => {
        updateDebaterActiveTimer(--t);
        if (t <= 0) clearInterval(iv);
    }, 1000);
    console.log('⏱️ Testing debater active screen');
};

// Test helper: window.testDebaterWait()
window.testDebaterWait = function() {
    showDebaterWaitScreen();
    console.log('🕐 Testing debater wait screen');
};

// Test helper: window.testRoleReveal('debater', 1) / ('debater', 2) / ('listener')
window.testRoleReveal = function(role, group) {
    showRoleRevealScreen(role || 'debater', group || 1);
    console.log(`🎭 Testing role reveal: ${role} group ${group}`);
};

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
    
    // For debaters, show new full-screen colored UI
    if (role === 'debater') {
        showDebaterReadyScreen(group);
    } else {
        // For listeners, show new waiting screen with ready counters
        showListenerWaitingScreen();
    }
}

// Update listener ready counters
function updateListenerReadyCounters(group1Ready, group1Total, group2Ready, group2Total) {
    console.log(`🔄 Updating listener counters: Group 1: ${group1Ready}/${group1Total}, Group 2: ${group2Ready}/${group2Total}`);
    
    const group1Counter = document.getElementById('listenerGroup1Counter');
    const group2Counter = document.getElementById('listenerGroup2Counter');
    
    console.log(`   Group 1 counter element:`, group1Counter);
    console.log(`   Group 2 counter element:`, group2Counter);
    
    if (group1Counter) {
        group1Counter.textContent = `${group1Ready}/${group1Total}`;
        console.log(`   ✅ Updated Group 1 counter to: ${group1Ready}/${group1Total}`);
    } else {
        console.warn(`   ⚠️ Group 1 counter element not found!`);
    }
    
    if (group2Counter) {
        group2Counter.textContent = `${group2Ready}/${group2Total}`;
        console.log(`   ✅ Updated Group 2 counter to: ${group2Ready}/${group2Total}`);
    } else {
        console.warn(`   ⚠️ Group 2 counter element not found!`);
    }
}

// Show listener waiting screen with ready counters
function showListenerWaitingScreen() {
    // Remove existing listener screen if any
    const existing = document.getElementById('listenerWaitingScreen');
    if (existing) existing.remove();

    // Inject keyframe animation once
    if (!document.getElementById('listenerCircleAnimation')) {
        const style = document.createElement('style');
        style.id = 'listenerCircleAnimation';
        style.textContent = `
            @keyframes spinCW  { from { transform: rotate(0deg);   } to { transform: rotate(360deg);  } }
            @keyframes spinCCW { from { transform: rotate(0deg);   } to { transform: rotate(-360deg); } }
        `;
        document.head.appendChild(style);
    }

    const listenerScreen = document.createElement('div');
    listenerScreen.id = 'listenerWaitingScreen';
    listenerScreen.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: #3f985b;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 25px;
        z-index: 10000;
        box-sizing: border-box;
        overflow: hidden;
    `;

    // ── Header ──────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = `
        width: 100%; max-width: 340px;
        display: flex; flex-direction: column;
        gap: 5px; padding: 10px 10px 25px 10px;
        flex-shrink: 0;
    `;

    const title = document.createElement('p');
    title.textContent = 'LISTENER';
    title.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 40px; font-weight: 600;
        letter-spacing: 6px; color: #fff; margin: 0;
    `;

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Decide the winner of the debate by voting for the group you agree with. Use the buttons on the mobile controller to cast your vote.';
    subtitle.style.cssText = `
        font-family: 'MD Primer Trial', Georgia, serif;
        font-size: 20px; color: #fff; margin: 0; line-height: 1.4;
    `;

    header.appendChild(title);
    header.appendChild(subtitle);

    // ── Ellipses Container ───────────────────────────────────
    const ellipsesContainer = document.createElement('div');
    ellipsesContainer.style.cssText = `
        flex: 1;
        width: 100%;
        position: relative;
        border-top: 1px solid #fff;
        border-bottom: 1px solid #fff;
        overflow: hidden;
        min-height: 300px;
    `;

    // Helper: create a dashed circle SVG
    function makeDashedCircle(diameter, color, animDir, animDuration, left, top) {
        const r = diameter / 2;
        const circumference = 2 * Math.PI * r;
        const dashLen = circumference / 12; // ~12 dashes
        const gapLen = dashLen * 0.6;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: absolute;
            left: ${left};
            top: ${top};
            width: ${diameter}px;
            height: ${diameter}px;
            animation: ${animDir} ${animDuration}s linear infinite;
        `;

        wrapper.innerHTML = `<svg width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="${r}" cy="${r}" r="${r - 5}" stroke="${color}" stroke-width="5" stroke-dasharray="${dashLen.toFixed(1)} ${gapLen.toFixed(1)}" stroke-linecap="round"/>
        </svg>`;

        return wrapper;
    }

    // 4 circles matching Figma positions/sizes/colors
    ellipsesContainer.appendChild(makeDashedCircle(160, '#ffffff', 'spinCCW', 9,  '0px',   '16px'));
    ellipsesContainer.appendChild(makeDashedCircle(154, '#D62828', 'spinCW',  7,  '33%',   '30%'));
    ellipsesContainer.appendChild(makeDashedCircle(97,  '#0000FE', 'spinCW',  11, '6%',    '63%'));
    ellipsesContainer.appendChild(makeDashedCircle(86,  '#FDED6B', 'spinCCW', 5,  '52%',   '75%'));

    // ── Footer ───────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.style.cssText = `
        width: 100%; flex-shrink: 0;
        display: flex; flex-direction: column;
        gap: 5px; align-items: center;
        padding-top: 25px;
    `;

    const waitingText = document.createElement('p');
    waitingText.textContent = 'Waiting for debaters to be ready...';
    waitingText.style.cssText = `
        font-family: 'MD Primer Trial', Georgia, serif;
        font-size: 20px; font-style: italic;
        color: #d2d2d2; margin: 0; text-align: center;
        width: 100%;
    `;

    // Vote status row
    const voteRow = document.createElement('div');
    voteRow.style.cssText = `
        display: flex; align-items: center;
        justify-content: space-between;
        width: 100%; height: 57px;
    `;

    const group1Counter = document.createElement('p');
    group1Counter.id = 'listenerGroup1Counter';
    group1Counter.textContent = '0/5';
    group1Counter.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 48px; font-weight: 600;
        letter-spacing: 7.2px;
        color: #D62828; margin: 0;
    `;

    const divider = document.createElement('div');
    divider.style.cssText = `
        flex: 1; display: flex;
        align-items: center; justify-content: center;
    `;
    divider.innerHTML = `<svg width="2" height="56" viewBox="0 0 2 56" fill="none"><rect width="2" height="56" fill="white"/></svg>`;

    const group2Counter = document.createElement('p');
    group2Counter.id = 'listenerGroup2Counter';
    group2Counter.textContent = '0/5';
    group2Counter.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 48px; font-weight: 600;
        letter-spacing: 7.2px;
        color: #0000FE; margin: 0;
    `;

    voteRow.appendChild(group1Counter);
    voteRow.appendChild(divider);
    voteRow.appendChild(group2Counter);

    // Group labels
    const groupLabels = document.createElement('div');
    groupLabels.style.cssText = `
        display: flex; justify-content: space-between;
        width: 100%;
    `;

    const label1 = document.createElement('p');
    label1.textContent = 'Group 1';
    label1.style.cssText = `
        font-family: 'MD Primer Trial', Georgia, serif;
        font-size: 20px; color: #D62828; margin: 0;
    `;

    const label2 = document.createElement('p');
    label2.textContent = 'Group 2';
    label2.style.cssText = `
        font-family: 'MD Primer Trial', Georgia, serif;
        font-size: 20px; color: #0000FE; margin: 0;
    `;

    groupLabels.appendChild(label1);
    groupLabels.appendChild(label2);

    footer.appendChild(waitingText);
    footer.appendChild(voteRow);
    footer.appendChild(groupLabels);

    listenerScreen.appendChild(header);
    listenerScreen.appendChild(ellipsesContainer);
    listenerScreen.appendChild(footer);
    document.body.appendChild(listenerScreen);
}

// Debate Argumentation overlay (Logos / Etos / Patos)
function showArgumentationOverlay() {
    const existing = document.getElementById('argumentationOverlay');
    if (existing) existing.remove();

    // Ensure spin keyframe exists
    if (!document.getElementById('listenerCircleAnimation')) {
        const style = document.createElement('style');
        style.id = 'listenerCircleAnimation';
        style.textContent = `
            @keyframes spinCW  { from { transform: rotate(0deg);   } to { transform: rotate(360deg);  } }
            @keyframes spinCCW { from { transform: rotate(0deg);   } to { transform: rotate(-360deg); } }
        `;
        document.head.appendChild(style);
    }

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'argumentationOverlay';
    backdrop.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 20000;
        display: flex; align-items: center; justify-content: center;
    `;

    // Panel
    const panel = document.createElement('div');
    panel.style.cssText = `
        background: #fff;
        border-top: 1px solid #0b0701;
        border-bottom: 1px solid #0b0701;
        width: 100%; max-width: 390px;
        max-height: 90vh;
        overflow-y: auto;
        display: flex; flex-direction: column;
        gap: 10px;
        align-items: center;
        padding-top: 10px;
        position: relative;
        box-sizing: border-box;
    `;

    // ── Rotating dashed circle (top-right) ──────────────────
    const circleWrapper = document.createElement('div');
    circleWrapper.style.cssText = `
        position: absolute; top: 49px; right: 8px;
        width: 125px; height: 125px;
        animation: spinCW 14s linear infinite;
        pointer-events: none;
    `;
    const r = 57, circ = 2 * Math.PI * r;
    const dash = (circ / 12).toFixed(1), gap = (circ / 12 * 0.6).toFixed(1);
    circleWrapper.innerHTML = `<svg width="125" height="125" viewBox="0 0 125 125" fill="none">
        <circle cx="62.5" cy="62.5" r="${r}" stroke="#3f985b" stroke-width="4" stroke-dasharray="${dash} ${gap}" stroke-linecap="round"/>
    </svg>`;

    // ── X CLOSE button ───────────────────────────────────────
    const closeWrapper = document.createElement('div');
    closeWrapper.style.cssText = `
        position: absolute; top: 9px; right: 5px;
        display: flex; flex-direction: column; align-items: flex-start;
        cursor: pointer;
    `;

    const closeBtn = document.createElement('div');
    closeBtn.style.cssText = `
        background: #fff;
        border: 1px solid #0b0701;
        border-radius: 0.5px 0.5px 0 0;
        display: flex; align-items: center; justify-content: space-between;
        padding: 5px;
        width: 66px; height: 18px;
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 10px; font-weight: 600;
        letter-spacing: 1.5px; text-transform: uppercase;
        color: #3f985b;
        white-space: nowrap;
        box-sizing: border-box;
    `;
    closeBtn.innerHTML = `<span>X</span><span>CLOSE</span>`;

    const closeBorder = document.createElement('div');
    closeBorder.style.cssText = `
        background: #c4c4c4;
        border: 1px solid #0b0701;
        border-top: none;
        border-radius: 0 0 0.5px 0.5px;
        height: 3px; width: 100%;
    `;

    closeWrapper.appendChild(closeBtn);
    closeWrapper.appendChild(closeBorder);
    closeWrapper.addEventListener('click', () => backdrop.remove());

    // ── Header text ──────────────────────────────────────────
    const headerText = document.createElement('div');
    headerText.style.cssText = `
        width: 100%; padding: 0 25px;
        display: flex; flex-direction: column; gap: 5px;
    `;

    const headerTitle = document.createElement('p');
    headerTitle.textContent = 'DEBATE ARGUMENTATION';
    headerTitle.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 32px; font-weight: 600;
        letter-spacing: 4.8px; text-transform: uppercase;
        color: #0b0701; margin: 0; line-height: 1.2;
    `;

    const headerDesc = document.createElement('p');
    headerDesc.textContent = 'Use these frameworks to structure your arguments and strengthen your position in the debate';
    headerDesc.style.cssText = `
        font-family: 'MD Primer Trial', Georgia, serif;
        font-size: 16px; color: #0b0701;
        margin: 0; width: 208px; line-height: 1.4;
    `;

    headerText.appendChild(headerTitle);
    headerText.appendChild(headerDesc);

    // ── Green 3-column section ───────────────────────────────
    const greenSection = document.createElement('div');
    greenSection.style.cssText = `
        background: #3f985b;
        width: 100%;
        display: flex;
        align-items: stretch;
        justify-content: space-between;
        padding: 10px;
        box-sizing: border-box;
    `;

    // Column helper
    function makeColumn(iconSvg, label, description, bullets) {
        const col = document.createElement('div');
        col.style.cssText = `
            display: flex; flex-direction: column;
            gap: 10px; align-items: center;
            width: 117px; padding: 0 5px;
            box-sizing: border-box;
        `;

        // Icon
        const iconArea = document.createElement('div');
        iconArea.style.cssText = `height: 45px; display: flex; align-items: center; justify-content: center;`;
        iconArea.innerHTML = iconSvg;

        // Label badge
        const labelBadge = document.createElement('div');
        labelBadge.style.cssText = `
            border: 1px solid #fff;
            border-radius: 0.5px;
            width: 77px; height: 29px;
            display: flex; align-items: center; justify-content: center;
            padding: 0 5px;
        `;
        const labelText = document.createElement('p');
        labelText.textContent = label;
        labelText.style.cssText = `
            font-family: 'MD Thermochrome 0.4 Trial', monospace;
            font-size: 13px; font-weight: 600;
            letter-spacing: 1.95px; text-transform: uppercase;
            color: #fff; margin: 0; white-space: nowrap;
        `;
        labelBadge.appendChild(labelText);

        // Description
        const descBox = document.createElement('div');
        descBox.style.cssText = `
            border-bottom: 2px dashed rgba(255,255,255,0.25);
            padding-bottom: 10px;
            width: 100%;
        `;
        const descText = document.createElement('p');
        descText.textContent = description;
        descText.style.cssText = `
            font-family: 'MD Primer Trial', Georgia, serif;
            font-size: 10px; color: #fff;
            margin: 0; line-height: 1.4;
        `;
        descBox.appendChild(descText);

        // Common use + bullets
        const useSection = document.createElement('div');
        useSection.style.cssText = `display: flex; flex-direction: column; gap: 10px; width: 100%;`;

        const useLabel = document.createElement('p');
        useLabel.textContent = 'COMMON USE';
        useLabel.style.cssText = `
            font-family: 'MD Thermochrome 0.4 Trial', monospace;
            font-size: 10px; font-weight: 600;
            letter-spacing: 1.5px; text-transform: uppercase;
            color: #fff; margin: 0;
        `;

        const ul = document.createElement('ul');
        ul.style.cssText = `
            margin: 0; padding-left: 15px;
            display: flex; flex-direction: column; gap: 8px;
        `;
        bullets.forEach(b => {
            const li = document.createElement('li');
            li.textContent = b;
            li.style.cssText = `
                font-family: 'MD Primer Trial', Georgia, serif;
                font-size: 10px; font-weight: 600;
                color: #fff; line-height: 1.3;
            `;
            ul.appendChild(li);
        });

        useSection.appendChild(useLabel);
        useSection.appendChild(ul);

        col.appendChild(iconArea);
        col.appendChild(labelBadge);
        col.appendChild(descBox);
        col.appendChild(useSection);
        return col;
    }

    // Divider
    function makeDivider() {
        const d = document.createElement('div');
        d.style.cssText = `width: 1px; background: rgba(255,255,255,0.4); align-self: stretch; flex-shrink: 0;`;
        return d;
    }

    // LOGOS icon: two overlapping circles
    const logosIcon = `<svg width="55" height="33" viewBox="0 0 55 33" fill="none">
        <circle cx="18" cy="16" r="14.5" stroke="white" stroke-width="1.5"/>
        <circle cx="37" cy="16" r="14.5" stroke="white" stroke-width="1.5"/>
    </svg>`;

    // ETOS icon: heart
    const etosIcon = `<svg width="38" height="34" viewBox="0 0 38 34" fill="none">
        <path d="M19 31 C19 31 2 20 2 10 C2 5.5 5.5 2 10 2 C13.5 2 16.5 4 19 7 C21.5 4 24.5 2 28 2 C32.5 2 36 5.5 36 10 C36 20 19 31 19 31Z" stroke="white" stroke-width="1.5" fill="none"/>
    </svg>`;

    // PATOS icon: 8-point starburst
    const patosIcon = `<svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <line x1="20" y1="2" x2="20" y2="38" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="2" y1="20" x2="38" y2="20" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="6.1" y1="6.1" x2="33.9" y2="33.9" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="33.9" y1="6.1" x2="6.1" y2="33.9" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="20" y1="2" x2="20" y2="38" stroke="white" stroke-width="1.5" stroke-linecap="round" transform="rotate(22.5 20 20)"/>
        <line x1="2" y1="20" x2="38" y2="20" stroke="white" stroke-width="1.5" stroke-linecap="round" transform="rotate(22.5 20 20)"/>
    </svg>`;

    greenSection.appendChild(makeColumn(
        logosIcon, 'LOGOS',
        'Appeal to logic and reason. Use facts, data, and evidence to support your position.',
        ['Present statistics and research', 'Cite credible sources', 'Build a logical rational case']
    ));
    greenSection.appendChild(makeDivider());
    greenSection.appendChild(makeColumn(
        etosIcon, 'ETOS',
        'Appeal to credibility and ethics. Establish trust and demonstrate your reliability',
        ['Show expertise or experience', 'Demonstrate fairness and respect', 'Build trust with your audience']
    ));
    greenSection.appendChild(makeDivider());
    greenSection.appendChild(makeColumn(
        patosIcon, 'PATOS',
        'Appeal to emotions and values. Connect with the audience on a personal level',
        ['Share stories and real-life examples', 'Highlight impact and consequences', 'Inspire empathy and values']
    ));

    panel.appendChild(circleWrapper);
    panel.appendChild(closeWrapper);
    panel.appendChild(headerText);
    panel.appendChild(greenSection);

    backdrop.appendChild(panel);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    document.body.appendChild(backdrop);
}

// Show new debater ready screen with colored background
function showDebaterReadyScreen(group) {
    // Remove existing debater screen if any
    const existing = document.getElementById('debaterReadyScreen');
    if (existing) existing.remove();

    const groupColor = group === 1 ? '#D62828' : '#0000FE';
    const groupColorFaded = group === 1 ? 'rgba(214,40,40,0.65)' : 'rgba(0,0,254,0.65)';
    const groupLabel = group === 1 ? 'GROUP 1' : 'GROUP 2';
    const question = (window.debateQuestion || 'Should fossil fuels be banned entirely?').toUpperCase();

    const debaterScreen = document.createElement('div');
    debaterScreen.id = 'debaterReadyScreen';
    debaterScreen.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: #fff;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 25px 25px 14px 25px;
        z-index: 10000;
        box-sizing: border-box;
        overflow-y: auto;
    `;

    // ── Header ──────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = `width:100%; display:flex; flex-direction:column; gap:5px; padding:10px;`;

    const title = document.createElement('p');
    title.textContent = 'THE DEBATE';
    title.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 40px;
        font-weight: 600;
        letter-spacing: 6px;
        color: #0b0701;
        margin: 0;
    `;

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Read your instructions and press "ready up" when you\'re ready to start the debate!';
    subtitle.style.cssText = `
        font-family: 'MD Primer Trial', Georgia, serif;
        font-size: 20px;
        color: #0b0701;
        margin: 0;
        line-height: 1.4;
    `;

    header.appendChild(title);
    header.appendChild(subtitle);

    // ── Content ─────────────────────────────────────────────
    const content = document.createElement('div');
    content.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 15px;
        align-items: center;
        width: 100%;
        max-width: 360px;
        padding: 10px;
    `;

    // Group info row
    const groupInfo = document.createElement('div');
    groupInfo.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 0 10px 10px 10px;
    `;

    const chatIcon = document.createElement('div');
    chatIcon.innerHTML = `<svg width="117" height="114" viewBox="0 0 117 114" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Top edge -->
        <rect x="24" y="6" width="69" height="6" fill="${groupColor}"/>
        <!-- Second row -->
        <rect x="12" y="12" width="6" height="6" fill="${groupColor}"/>
        <rect x="99" y="12" width="6" height="6" fill="${groupColor}"/>
        <!-- Left/right walls -->
        <rect x="6" y="18" width="6" height="42" fill="${groupColor}"/>
        <rect x="105" y="18" width="6" height="42" fill="${groupColor}"/>
        <!-- Three dot indicators -->
        <rect x="24" y="30" width="12" height="12" fill="${groupColor}"/>
        <rect x="52" y="30" width="12" height="12" fill="${groupColor}"/>
        <rect x="80" y="30" width="12" height="12" fill="${groupColor}"/>
        <!-- Bottom row of bubble -->
        <rect x="12" y="60" width="6" height="6" fill="${groupColor}"/>
        <rect x="99" y="60" width="6" height="6" fill="${groupColor}"/>
        <!-- Bottom edge -->
        <rect x="24" y="66" width="69" height="6" fill="${groupColor}"/>
        <!-- Tail (bottom-left) -->
        <rect x="18" y="72" width="18" height="6" fill="${groupColor}"/>
        <rect x="18" y="78" width="12" height="6" fill="${groupColor}"/>
        <rect x="18" y="84" width="6" height="6" fill="${groupColor}"/>
    </svg>`;

    const groupDetails = document.createElement('div');
    groupDetails.style.cssText = `display:flex; flex-direction:column; gap:10px; align-items:flex-start;`;

    const groupName = document.createElement('p');
    groupName.textContent = groupLabel;
    groupName.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 40px;
        font-weight: 600;
        color: ${groupColor};
        margin: 0;
        white-space: nowrap;
    `;

    const roleLabel = document.createElement('p');
    roleLabel.textContent = 'DEBATER';
    roleLabel.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 24px;
        font-weight: 600;
        color: ${groupColorFaded};
        margin: 0;
        white-space: nowrap;
    `;

    groupDetails.appendChild(groupName);
    groupDetails.appendChild(roleLabel);
    groupInfo.appendChild(chatIcon);
    groupInfo.appendChild(groupDetails);

    // Yellow question box
    const questionContainer = document.createElement('div');
    questionContainer.style.cssText = `
        background: #FDED6B;
        border-top: 1px solid #0b0701;
        border-bottom: 1px solid #0b0701;
        width: 100%;
        padding: 10px;
    `;

    const questionText = document.createElement('p');
    questionText.textContent = question;
    questionText.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 24px;
        font-weight: 600;
        letter-spacing: 3.6px;
        text-transform: uppercase;
        color: #0b0701;
        margin: 0;
        line-height: 1.3;
    `;
    questionContainer.appendChild(questionText);

    // Argumentation section
    const argContainer = document.createElement('div');
    argContainer.style.cssText = `display:flex; flex-direction:column; gap:10px; width:100%; padding:10px;`;

    const argHeader = document.createElement('div');
    argHeader.style.cssText = `display:flex; flex-direction:column; width:100%; max-width:320px;`;

    const argBtn = document.createElement('div');
    argBtn.style.cssText = `
        background: #fff;
        border: 1px solid #0b0701;
        border-radius: 0.5px 0.5px 0 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 15px;
    `;

    const argLabel = document.createElement('p');
    argLabel.textContent = 'DEBATE ARGUMENTATION';
    argLabel.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 18px;
        font-weight: 600;
        letter-spacing: 2.7px;
        text-transform: uppercase;
        color: #3f985b;
        margin: 0;
        white-space: nowrap;
    `;

    const argArrow = document.createElement('span');
    argArrow.textContent = '→';
    argArrow.style.cssText = `font-size:18px; color:#3f985b;`;

    argBtn.appendChild(argLabel);
    argBtn.appendChild(argArrow);
    argBtn.style.cursor = 'pointer';
    argBtn.addEventListener('click', () => showArgumentationOverlay());

    const argBorder = document.createElement('div');
    argBorder.style.cssText = `
        background: #9a9a9a;
        border: 1px solid #0b0701;
        border-top: none;
        border-radius: 0 0 0.5px 0.5px;
        height: 3px;
        width: 100%;
    `;

    argHeader.appendChild(argBtn);
    argHeader.appendChild(argBorder);

    const argInfo = document.createElement('div');
    argInfo.style.cssText = `
        background: #fff;
        border: 1px solid #3f985b;
        border-radius: 0.5px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 5px;
    `;

    const infoIcon = document.createElement('div');
    infoIcon.style.cssText = `flex-shrink:0; width:22px; height:24px;`;
    infoIcon.innerHTML = `<svg width="22" height="24" viewBox="0 0 22 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Circle border -->
        <rect x="6" y="0" width="10" height="2" fill="#3f985b"/>
        <rect x="2" y="2" width="4" height="2" fill="#3f985b"/>
        <rect x="16" y="2" width="4" height="2" fill="#3f985b"/>
        <rect x="0" y="4" width="2" height="16" fill="#3f985b"/>
        <rect x="20" y="4" width="2" height="16" fill="#3f985b"/>
        <rect x="2" y="20" width="4" height="2" fill="#3f985b"/>
        <rect x="16" y="20" width="4" height="2" fill="#3f985b"/>
        <rect x="6" y="22" width="10" height="2" fill="#3f985b"/>
        <!-- i dot -->
        <rect x="9" y="4" width="4" height="4" fill="#3f985b"/>
        <!-- i stem -->
        <rect x="9" y="10" width="4" height="10" fill="#3f985b"/>
    </svg>`;

    const infoText = document.createElement('p');
    infoText.textContent = 'Good arguments dont just win debates - they help everyone understand better';
    infoText.style.cssText = `
        font-family: 'MD Primer Trial', Georgia, serif;
        font-size: 12px;
        color: #3f985b;
        margin: 0;
        width: 208px;
        line-height: 1.4;
    `;

    argInfo.appendChild(infoIcon);
    argInfo.appendChild(infoText);
    argContainer.appendChild(argHeader);
    argContainer.appendChild(argInfo);

    content.appendChild(groupInfo);
    content.appendChild(questionContainer);
    content.appendChild(argContainer);

    // ── Ready Button ─────────────────────────────────────────
    const btnWrapper = document.createElement('div');
    btnWrapper.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        max-width: 265px;
        padding: 22px 17px;
    `;

    const readyButton = document.createElement('button');
    readyButton.id = 'debaterReadyButton';
    readyButton.textContent = 'PRESS WHEN READY';
    readyButton.style.cssText = `
        background: #EBEDF0;
        border: 1px solid #0b0701;
        border-radius: 0.5px 0.5px 0 0;
        width: 100%;
        padding: 15px 25px;
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 20px;
        font-weight: 600;
        letter-spacing: 3px;
        color: #0b0701;
        cursor: pointer;
        white-space: nowrap;
        transition: transform 0.1s ease;
    `;

    const btnBase = document.createElement('div');
    btnBase.style.cssText = `
        background: #C4C4C4;
        border: 1px solid #0b0701;
        border-top: none;
        border-radius: 0 0 0.5px 0.5px;
        height: 5px;
        width: 100%;
    `;

    readyButton.addEventListener('mousedown', () => { readyButton.style.transform = 'translateY(3px)'; btnBase.style.height = '2px'; });
    readyButton.addEventListener('mouseup', () => { readyButton.style.transform = 'translateY(0)'; btnBase.style.height = '5px'; });
    readyButton.addEventListener('mouseleave', () => { readyButton.style.transform = 'translateY(0)'; btnBase.style.height = '5px'; });
    readyButton.addEventListener('touchstart', () => { readyButton.style.transform = 'translateY(3px)'; btnBase.style.height = '2px'; });
    readyButton.addEventListener('touchend', () => { readyButton.style.transform = 'translateY(0)'; btnBase.style.height = '5px'; });

    readyButton.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'user_ready' }));
            readyButton.textContent = 'READY ✓';
            readyButton.style.background = '#4CAF50';
            readyButton.style.color = '#fff';
            btnBase.style.background = '#2E7D32';
            readyButton.disabled = true;
            readyButton.style.cursor = 'not-allowed';
            console.log('✅ Marked as ready');
        }
    });

    btnWrapper.appendChild(readyButton);
    btnWrapper.appendChild(btnBase);

    debaterScreen.appendChild(header);
    debaterScreen.appendChild(content);
    debaterScreen.appendChild(btnWrapper);
    document.body.appendChild(debaterScreen);
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
    const revealTopicShadow = document.getElementById('revealTopicShadow');
    
    if (!revealSection || !revealTopicBox || !revealTopicName) return;
    
    // Convert cluster color to RGB
    const rgb = hsbToRgb(cluster.color.h, cluster.color.s, cluster.color.b);
    const colorString = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    const shadowString = `rgb(${Math.round(rgb.r * 0.6)}, ${Math.round(rgb.g * 0.6)}, ${Math.round(rgb.b * 0.6)})`;
    
    // Style the button header
    revealTopicBox.style.backgroundColor = colorString;
    if (revealTopicShadow) revealTopicShadow.style.backgroundColor = shadowString;
    
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
        
        // Wait for server to trigger role assignment (synced with main display)
        // The main display will send assign_roles message when ready
        
    }, 800); // Wait for fade-out animation
}


// Show "Assigning Roles" loading screen with emoji animation
function showAssigningRolesLoading() {
    const revealSection = document.getElementById('topicRevealSection');
    
    if (!revealSection) return;
    
    // Fade out topic reveal
    revealSection.classList.add('fade-out-view');
    
    setTimeout(() => {
        revealSection.style.display = 'none';
        revealSection.classList.remove('fade-out-view');
        
        // Create loading screen
        const loadingScreen = document.createElement('div');
        loadingScreen.id = 'assigningRolesLoading';
        loadingScreen.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #fff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;
        
        // Add text
        const text = document.createElement('div');
        text.textContent = 'ASSIGNING ROLES';
        text.style.cssText = `
            font-family: 'MD Thermochrome 0.4 Trial', 'Courier New', monospace;
            font-size: 32px;
            font-weight: normal;
            letter-spacing: 0.15em;
            color: #000;
            margin-bottom: 40px;
        `;
        loadingScreen.appendChild(text);
        
        // Add emoji with block animation
        const emojiContainer = document.createElement('div');
        emojiContainer.style.cssText = `
            font-size: 120px;
            position: relative;
            width: 120px;
            height: 120px;
            overflow: hidden;
        `;
        
        const emoji = document.createElement('div');
        emoji.textContent = '👥';
        emoji.style.cssText = `
            font-family: 'MD Thermochrome 0.4 Trial', 'Courier New', monospace;
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            clip-path: inset(100% 0 0 0);
        `;
        
        emojiContainer.appendChild(emoji);
        loadingScreen.appendChild(emojiContainer);
        
        document.body.appendChild(loadingScreen);
        
        // Animate emoji reveal (block by block from bottom to top)
        const duration = 4500;
        const numBlocks = 15;
        const startTime = Date.now();
        
        function animateEmoji() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const visibleBlocks = Math.floor(progress * numBlocks);
            const clipPercent = Math.max(0, 100 - (visibleBlocks / numBlocks) * 100);
            
            emoji.style.clipPath = `inset(${clipPercent}% 0 0 0)`;
            
            if (progress < 1) {
                requestAnimationFrame(animateEmoji);
            }
        }
        
        animateEmoji();
        
    }, 800);
}

// ========================================
// Ready-up button handler (works for both debaters and listeners)
const readyUpButton = document.getElementById('readyUpButton');
if (readyUpButton) {
    readyUpButton.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            console.log('📤 Sending user_ready to server');
            ws.send(JSON.stringify({
                type: 'user_ready' // Changed to generic type that works for all roles
            }));
            
            // Visual feedback
            readyUpButton.classList.add('ready');
            readyUpButton.textContent = '✓ Ready';
            readyUpButton.disabled = true;
            
            console.log('✅ Marked as ready');
        } else {
            console.error('❌ Cannot send ready - WebSocket not connected');
        }
    });
}

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

// Debate voting handlers
let currentVoteSide = null;
let isVoting = false;

function initDebateVoting() {
    const redCircle = document.getElementById('voteRedCircle');
    const greenCircle = document.getElementById('voteGreenCircle');
    
    if (!redCircle || !greenCircle) return;
    
    // Red circle handlers
    redCircle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        votePress('red');
    });
    redCircle.addEventListener('mousedown', () => votePress('red'));
    
    redCircle.addEventListener('touchend', (e) => {
        e.preventDefault();
        voteRelease();
    });
    redCircle.addEventListener('mouseup', () => voteRelease());
    redCircle.addEventListener('mouseleave', () => {
        if (isVoting && currentVoteSide === 'red') voteRelease();
    });
    
    // Green circle handlers
    greenCircle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        votePress('green');
    });
    greenCircle.addEventListener('mousedown', () => votePress('green'));
    
    greenCircle.addEventListener('touchend', (e) => {
        e.preventDefault();
        voteRelease();
    });
    greenCircle.addEventListener('mouseup', () => voteRelease());
    greenCircle.addEventListener('mouseleave', () => {
        if (isVoting && currentVoteSide === 'green') voteRelease();
    });
    
    console.log('🎤 Debate voting handlers initialized');
}

function votePress(side) {
    const redCircle = document.getElementById('voteRedCircle');
    const greenCircle = document.getElementById('voteGreenCircle');
    
    if (!redCircle || !greenCircle) return;
    
    // Remove voting class from both
    redCircle.classList.remove('voting');
    greenCircle.classList.remove('voting');
    
    // Add to pressed circle
    if (side === 'red') {
        redCircle.classList.add('voting');
    } else {
        greenCircle.classList.add('voting');
    }
    
    currentVoteSide = side;
    isVoting = true;
    
    // Send vote to server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'debate_vote',
            side: side,
            action: 'press'
        }));
    }
    
    console.log(`🗳️ Voting for ${side}`);
}

function voteRelease() {
    const redCircle = document.getElementById('voteRedCircle');
    const greenCircle = document.getElementById('voteGreenCircle');
    
    if (!redCircle || !greenCircle) return;
    
    redCircle.classList.remove('voting');
    greenCircle.classList.remove('voting');
    
    if (currentVoteSide && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'debate_vote',
            side: currentVoteSide,
            action: 'release'
        }));
    }
    
    currentVoteSide = null;
    isVoting = false;
}

function showDebateVoting() {
    const debateSection = document.getElementById('debateVotingSection');
    const listenerSection = document.getElementById('listenerVotingSection');
    const roleSection = document.getElementById('roleAssignmentSection');
    const revealSection = document.getElementById('topicRevealSection');
    const debaterReadyScreen = document.getElementById('debaterReadyScreen');
    const listenerWaitingScreen = document.getElementById('listenerWaitingScreen');
    
    // Hide all other sections
    if (roleSection) roleSection.style.display = 'none';
    if (revealSection) revealSection.style.display = 'none';
    if (debaterReadyScreen) debaterReadyScreen.style.display = 'none';
    if (listenerWaitingScreen) listenerWaitingScreen.style.display = 'none';
    
    // Check if user is a listener
    if (userRole === 'listener') {
        // Show listener voting interface
        if (debateSection) debateSection.style.display = 'none';
        if (listenerSection) {
            listenerSection.style.display = 'flex';
            initListenerVoting();
        }
        console.log('🎤 Listener voting screen displayed');
    } else {
        // Show debater voting interface
        if (listenerSection) listenerSection.style.display = 'none';
        if (debateSection) {
            debateSection.style.display = 'flex';
            // No need to init - timer updates will be sent via WebSocket
        }
        console.log('🎤 Debater voting screen displayed');
    }
}

// Store user's group assignment and original topic color
let userGroup = 1;         // DEFAULT for testing — set to null in production
let userRole = 'debater';  // DEFAULT for testing — set to null in production
window.forceRole = { role: 'debater', group: 1 }; // DEV: override server role — set to null in production
let originalTopicColor = null; // Store the original cluster color

// Track vote balance (starts at 0, negative = red winning, positive = green winning)
let voteBalance = 0; // Range: -20 to +20

// Initialize listener voting interface
function initListenerVoting() {
    const group1Circle = document.getElementById('listenerVoteGroup1');
    const group2Circle = document.getElementById('listenerVoteGroup2');
    
    if (!group1Circle || !group2Circle) return;
    
    // Reset vote balance
    voteBalance = 0;
    
    // Group 1 (Red) voting - shifts balance toward red
    const voteGroup1 = () => {
        voteBalance = Math.max(voteBalance - 1, -20); // Decrease (more red), min -20
        updateListenerVoteVisuals();
        
        // Send vote to server
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'listener_vote',
                side: 'red',
                balance: voteBalance
            }));
            console.log(`🔴 Group 1 vote: balance = ${voteBalance}`);
        }
        
        // Add voting class for pulse animation
        group1Circle.classList.add('voting');
        setTimeout(() => group1Circle.classList.remove('voting'), 500);
    };
    
    // Group 2 (Blue) voting - shifts balance toward blue
    const voteGroup2 = () => {
        voteBalance = Math.min(voteBalance + 1, 20); // Increase (more blue), max +20
        updateListenerVoteVisuals();
        
        // Send vote to server
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'listener_vote',
                side: 'green',
                balance: voteBalance
            }));
            console.log(`� Group 2 vote: balance = ${voteBalance}`);
        }
        
        // Add voting class for pulse animation
        group2Circle.classList.add('voting');
        setTimeout(() => group2Circle.classList.remove('voting'), 500);
    };
    
    // Add click/tap listeners
    group1Circle.addEventListener('click', voteGroup1);
    group1Circle.addEventListener('touchend', (e) => {
        e.preventDefault();
        voteGroup1();
    });
    
    group2Circle.addEventListener('click', voteGroup2);
    group2Circle.addEventListener('touchend', (e) => {
        e.preventDefault();
        voteGroup2();
    });
    
    console.log('✅ Listener voting initialized');
}

// Update visual feedback based on vote balance
function updateListenerVoteVisuals() {
    // Visual feedback is now handled by CSS animations (breathe, votePulse)
    // No need to manually scale circles - they have subtle breathing animation
    // Vote balance is tracked and sent to server
}

// Convert HSB to RGB
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

// Debater wait screen — shown when it's the OTHER group's turn
function showDebaterWaitScreen() {
    if (document.getElementById('debaterWaitScreen')) return; // already showing
    const groupColor = userGroup === 2 ? '#0000FE' : '#D62828';

    // Inject spin keyframe once
    if (!document.getElementById('debaterWaitSpinStyle')) {
        const style = document.createElement('style');
        style.id = 'debaterWaitSpinStyle';
        style.textContent = `@keyframes debaterWaitSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
        document.head.appendChild(style);
    }

    const screen = document.createElement('div');
    screen.id = 'debaterWaitScreen';
    screen.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        background: #fff;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 25px 25px 14px 25px;
        z-index: 15000;
        box-sizing: border-box;
        overflow-y: auto;
    `;

    // ── Header ────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = `width:100%; display:flex; flex-direction:column; gap:5px; padding:10px;`;

    const title = document.createElement('p');
    title.textContent = 'WAIT...';
    title.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 40px; font-weight: 600; letter-spacing: 6px;
        color: #0b0701; margin: 0;
    `;

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Prepare your argument while the other group makes theirs.';
    subtitle.style.cssText = `
        font-family: 'MD Primer Trial', Georgia, serif;
        font-size: 20px; color: #0b0701; margin: 0; line-height: 1.4;
    `;

    header.appendChild(title);
    header.appendChild(subtitle);

    // ── Content: rotating circle ──────────────────────────────
    const content = document.createElement('div');
    content.style.cssText = `
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 50px; flex: 1;
        padding: 100px 10px 10px 10px; width: 100%;
    `;

    const circle = document.createElement('div');
    circle.style.cssText = `
        width: 318px; height: 318px;
        border: 5px dashed ${groupColor};
        border-radius: 50%;
        animation: debaterWaitSpin 24s linear infinite;
        flex-shrink: 0;
    `;

    // ── Argumentation button + info (same as debaterReadyScreen) ─
    const argContainer = document.createElement('div');
    argContainer.style.cssText = `display:flex; flex-direction:column; gap:10px; width:100%; padding:10px;`;

    const argHeader = document.createElement('div');
    argHeader.style.cssText = `display:flex; flex-direction:column; width:100%; max-width:320px;`;

    const argBtn = document.createElement('div');
    argBtn.style.cssText = `
        background: #fff; border: 1px solid #0b0701;
        border-radius: 0.5px 0.5px 0 0;
        display: flex; align-items: center; justify-content: space-between;
        padding: 5px 15px; cursor: pointer;
    `;

    const argLabel = document.createElement('p');
    argLabel.textContent = 'DEBATE ARGUMENTATION';
    argLabel.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 18px; font-weight: 600; letter-spacing: 2.7px;
        text-transform: uppercase; color: #3f985b; margin: 0; white-space: nowrap;
    `;

    const argArrow = document.createElement('span');
    argArrow.textContent = '→';
    argArrow.style.cssText = `font-size:18px; color:#3f985b;`;

    argBtn.appendChild(argLabel);
    argBtn.appendChild(argArrow);
    argBtn.addEventListener('click', () => showArgumentationOverlay());

    const argBorder = document.createElement('div');
    argBorder.style.cssText = `
        background: #9a9a9a; border: 1px solid #0b0701; border-top: none;
        border-radius: 0 0 0.5px 0.5px; height: 3px; width: 100%;
    `;

    argHeader.appendChild(argBtn);
    argHeader.appendChild(argBorder);

    const argInfo = document.createElement('div');
    argInfo.style.cssText = `
        background: #fff; border: 1px solid #3f985b; border-radius: 0.5px;
        display: flex; align-items: center; gap: 10px; padding: 5px;
    `;

    const infoIcon = document.createElement('div');
    infoIcon.style.cssText = `flex-shrink:0; width:22px; height:24px;`;
    infoIcon.innerHTML = `<svg width="22" height="24" viewBox="0 0 22 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="0" width="10" height="2" fill="#3f985b"/>
        <rect x="2" y="2" width="4" height="2" fill="#3f985b"/>
        <rect x="16" y="2" width="4" height="2" fill="#3f985b"/>
        <rect x="0" y="4" width="2" height="16" fill="#3f985b"/>
        <rect x="20" y="4" width="2" height="16" fill="#3f985b"/>
        <rect x="2" y="20" width="4" height="2" fill="#3f985b"/>
        <rect x="16" y="20" width="4" height="2" fill="#3f985b"/>
        <rect x="6" y="22" width="10" height="2" fill="#3f985b"/>
        <rect x="9" y="4" width="4" height="4" fill="#3f985b"/>
        <rect x="9" y="10" width="4" height="10" fill="#3f985b"/>
    </svg>`;

    const infoText = document.createElement('p');
    infoText.textContent = 'Good arguments dont just win debates - they help everyone understand better';
    infoText.style.cssText = `
        font-family: 'MD Primer Trial', Georgia, serif;
        font-size: 12px; color: #3f985b; margin: 0; width: 208px; line-height: 1.4;
    `;

    argInfo.appendChild(infoIcon);
    argInfo.appendChild(infoText);
    argContainer.appendChild(argHeader);
    argContainer.appendChild(argInfo);

    content.appendChild(circle);
    content.appendChild(argContainer);

    screen.appendChild(header);
    screen.appendChild(content);
    document.body.appendChild(screen);
}

function removeDebaterWaitScreen() {
    const screen = document.getElementById('debaterWaitScreen');
    if (screen) screen.remove();
}

// Builds the segmented square ring SVG for the active timer
function buildActiveTimerRing(timeRemaining, totalTime, groupColor) {
    const total = 32;
    const filled = Math.round((timeRemaining / totalTime) * total);
    const size = 318, cx = 159, cy = 159, r = 130, sq = 20;
    const fadeColor = groupColor + '55';
    let inner = '';
    for (let i = 0; i < total; i++) {
        const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        const deg = (i / total) * 360;
        const fill = i < filled ? groupColor : fadeColor;
        inner += `<rect x="${(x-sq/2).toFixed(1)}" y="${(y-sq/2).toFixed(1)}" width="${sq}" height="${sq}" fill="${fill}" transform="rotate(${deg.toFixed(1)},${x.toFixed(1)},${y.toFixed(1)})"/>`;
    }
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

let debaterTurnTotalTime = 30;

// Debater active screen — shown when it IS the user's turn
function showDebaterActiveScreen() {
    const groupColor = userGroup === 2 ? '#0000FE' : '#D62828';

    let screen = document.getElementById('debaterActiveScreen');
    if (!screen) {
        screen = document.createElement('div');
        screen.id = 'debaterActiveScreen';
        screen.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #fff; display: flex; flex-direction: column;
            align-items: center; justify-content: space-between;
            padding: 25px 25px 14px 25px; z-index: 15000;
            box-sizing: border-box; overflow-y: auto;
        `;

        // ── Header ────────────────────────────────────────────
        const header = document.createElement('div');
        header.style.cssText = `width:100%; display:flex; flex-direction:column; gap:5px; padding:10px;`;

        const title = document.createElement('p');
        title.textContent = 'YOUR TURN!';
        title.style.cssText = `
            font-family: 'MD Thermochrome 0.4 Trial', monospace;
            font-size: 40px; font-weight: 600; letter-spacing: 6px;
            color: #0b0701; margin: 0;
        `;
        const subtitle = document.createElement('p');
        subtitle.innerHTML = 'Make your argument<br>before the time is over.';
        subtitle.style.cssText = `
            font-family: 'MD Primer Trial', Georgia, serif;
            font-size: 20px; color: #0b0701; margin: 0; line-height: 1.4;
        `;
        header.appendChild(title);
        header.appendChild(subtitle);

        // ── Content: segmented ring + digital timer ───────────
        const content = document.createElement('div');
        content.style.cssText = `
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            flex: 1; padding: 30px 10px 0 10px; width: 100%; gap: 16px;
        `;

        const ringWrap = document.createElement('div');
        ringWrap.style.cssText = `position: relative; width: 318px; height: 318px; flex-shrink: 0;`;

        const ringEl = document.createElement('div');
        ringEl.id = 'debaterActiveRing';
        ringEl.style.cssText = `position: absolute; inset: 0;`;
        ringEl.innerHTML = buildActiveTimerRing(debaterTurnTotalTime, debaterTurnTotalTime, groupColor);

        const timerOverlay = document.createElement('div');
        timerOverlay.style.cssText = `
            position: absolute; inset: 0;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 6px;
        `;
        const timerText = document.createElement('p');
        timerText.id = 'debaterActiveTimer';
        timerText.textContent = '0:30';
        timerText.style.cssText = `
            font-family: 'DS-Digital', 'Courier New', monospace;
            font-size: 40px; color: #0b0701; margin: 0; letter-spacing: 2px;
        `;
        const timerLabel = document.createElement('p');
        timerLabel.textContent = 'Time left';
        timerLabel.style.cssText = `
            font-family: 'MD Primer Trial', Georgia, serif;
            font-size: 20px; color: #0b0701; margin: 0;
        `;
        timerOverlay.appendChild(timerText);
        timerOverlay.appendChild(timerLabel);
        ringWrap.appendChild(ringEl);
        ringWrap.appendChild(timerOverlay);
        content.appendChild(ringWrap);

        // ── Argumentation button + info ────────────────────────
        const argContainer = document.createElement('div');
        argContainer.style.cssText = `display:flex; flex-direction:column; gap:10px; width:100%; padding:10px;`;
        const argHeader = document.createElement('div');
        argHeader.style.cssText = `display:flex; flex-direction:column; width:100%; max-width:320px;`;
        const argBtn = document.createElement('div');
        argBtn.style.cssText = `
            background: #fff; border: 1px solid #0b0701;
            border-radius: 0.5px 0.5px 0 0;
            display: flex; align-items: center; justify-content: space-between;
            padding: 5px 15px; cursor: pointer;
        `;
        const argLabel = document.createElement('p');
        argLabel.textContent = 'DEBATE ARGUMENTATION';
        argLabel.style.cssText = `
            font-family: 'MD Thermochrome 0.4 Trial', monospace;
            font-size: 18px; font-weight: 600; letter-spacing: 2.7px;
            text-transform: uppercase; color: #3f985b; margin: 0; white-space: nowrap;
        `;
        const argArrow = document.createElement('span');
        argArrow.textContent = '→';
        argArrow.style.cssText = `font-size:18px; color:#3f985b;`;
        argBtn.appendChild(argLabel);
        argBtn.appendChild(argArrow);
        argBtn.addEventListener('click', () => showArgumentationOverlay());
        const argBorder = document.createElement('div');
        argBorder.style.cssText = `
            background: #9a9a9a; border: 1px solid #0b0701; border-top: none;
            border-radius: 0 0 0.5px 0.5px; height: 3px; width: 100%;
        `;
        argHeader.appendChild(argBtn);
        argHeader.appendChild(argBorder);
        const argInfo = document.createElement('div');
        argInfo.style.cssText = `
            background: #fff; border: 1px solid #3f985b; border-radius: 0.5px;
            display: flex; align-items: center; gap: 10px; padding: 5px;
        `;
        const infoIcon = document.createElement('div');
        infoIcon.style.cssText = `flex-shrink:0; width:22px; height:24px;`;
        infoIcon.innerHTML = `<svg width="22" height="24" viewBox="0 0 22 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="0" width="10" height="2" fill="#3f985b"/><rect x="2" y="2" width="4" height="2" fill="#3f985b"/><rect x="16" y="2" width="4" height="2" fill="#3f985b"/><rect x="0" y="4" width="2" height="16" fill="#3f985b"/><rect x="20" y="4" width="2" height="16" fill="#3f985b"/><rect x="2" y="20" width="4" height="2" fill="#3f985b"/><rect x="16" y="20" width="4" height="2" fill="#3f985b"/><rect x="6" y="22" width="10" height="2" fill="#3f985b"/><rect x="9" y="4" width="4" height="4" fill="#3f985b"/><rect x="9" y="10" width="4" height="10" fill="#3f985b"/></svg>`;
        const infoText = document.createElement('p');
        infoText.textContent = 'Good arguments dont just win debates - they help everyone understand better';
        infoText.style.cssText = `
            font-family: 'MD Primer Trial', Georgia, serif;
            font-size: 12px; color: #3f985b; margin: 0; width: 208px; line-height: 1.4;
        `;
        argInfo.appendChild(infoIcon);
        argInfo.appendChild(infoText);
        argContainer.appendChild(argHeader);
        argContainer.appendChild(argInfo);
        content.appendChild(argContainer);

        screen.appendChild(header);
        screen.appendChild(content);
        document.body.appendChild(screen);
    }
}

function updateDebaterActiveTimer(timeRemaining) {
    const timerEl = document.getElementById('debaterActiveTimer');
    const ringEl = document.getElementById('debaterActiveRing');
    if (!timerEl) return;
    if (timeRemaining > debaterTurnTotalTime) debaterTurnTotalTime = timeRemaining;
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    if (ringEl) {
        const groupColor = userGroup === 2 ? '#0000FE' : '#D62828';
        ringEl.innerHTML = buildActiveTimerRing(timeRemaining, debaterTurnTotalTime, groupColor);
    }
}

function removeDebaterActiveScreen() {
    const screen = document.getElementById('debaterActiveScreen');
    if (screen) screen.remove();
}

// Debate over screen for debaters — Figma 2411-1642
function showDebaterOverScreen() {
    if (document.getElementById('debaterOverScreen')) return;
    const groupColor = userGroup === 2 ? '#0000FE' : '#D62828';
    const groupLabel = userGroup === 2 ? 'GROUP 2' : 'GROUP 1';

    const screen = document.createElement('div');
    screen.id = 'debaterOverScreen';
    screen.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: #fff; display: flex; flex-direction: column;
        align-items: flex-start; justify-content: space-between;
        padding: 25px 25px 14px 25px; z-index: 15000;
        box-sizing: border-box;
    `;

    // ── Group label + underline ─────────────────────────────
    const labelWrap = document.createElement('div');
    labelWrap.style.cssText = `display:flex; flex-direction:column; gap:6px; padding:10px;`;

    const groupText = document.createElement('p');
    groupText.textContent = groupLabel;
    groupText.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 24px; font-weight: 600; letter-spacing: 3.6px;
        color: #0b0701; margin: 0; white-space: nowrap;
    `;

    const underline = document.createElement('div');
    underline.style.cssText = `width: 66px; height: 2px; background: #0b0701;`;

    labelWrap.appendChild(groupText);
    labelWrap.appendChild(underline);

    // ── Center: dashed circle with DEBATE OVER text ─────────
    const centerWrap = document.createElement('div');
    centerWrap.style.cssText = `
        flex: 1; display: flex; align-items: center; justify-content: center;
        width: 100%;
    `;

    const circle = document.createElement('div');
    circle.style.cssText = `
        width: 318px; height: 318px;
        border: 5px dashed ${groupColor};
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
    `;

    const debateOverText = document.createElement('p');
    debateOverText.textContent = 'DEBATE OVER';
    debateOverText.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', monospace;
        font-size: 36px; font-weight: 600; letter-spacing: 5.4px;
        color: ${groupColor}; margin: 0; text-align: center;
    `;

    circle.appendChild(debateOverText);
    centerWrap.appendChild(circle);

    screen.appendChild(labelWrap);
    screen.appendChild(centerWrap);
    document.body.appendChild(screen);
}

function removeDebaterOverScreen() {
    const screen = document.getElementById('debaterOverScreen');
    if (screen) screen.remove();
}

// Update debate timer display on mobile
function updateDebateTimer(data) {
    const debateSection = document.getElementById('debateVotingSection');
    const headerText = document.getElementById('debateHeaderText');
    const instructionText = document.getElementById('debateInstructionText');
    const timerText = document.getElementById('debateTimerText');
    const timerSegmentsContainer = document.getElementById('debateTimerSegments');
    
    if (!debateSection || !headerText || !instructionText || !timerText) return;
    
    const isMyTurn = userGroup === data.currentTurn;
    const myGroupColor = userGroup === 1 ? '#DC3545' : '#0000FE'; // Red or Blue
    
    console.log(`🔍 Debug - userGroup: ${userGroup}, currentTurn: ${data.currentTurn}, isMyTurn: ${isMyTurn}`);
    
    // Set background color to user's group color
    debateSection.style.background = myGroupColor;
    
    // Update header and instruction text based on whose turn it is
    if (data.debateOver) {
        headerText.textContent = 'DEBATE OVER';
        instructionText.textContent = 'WAITING FOR RESULTS';
        timerText.textContent = '0:00';
        if (timerSegmentsContainer) timerSegmentsContainer.innerHTML = '';
    } else if (isMyTurn) {
        // YOUR TURN — show new Figma-styled active screen
        removeDebaterWaitScreen();
        showDebaterActiveScreen();
        updateDebaterActiveTimer(data.turnTimeRemaining ?? 30);

        // Keep legacy elements in sync (hidden behind overlay)
        headerText.textContent = 'YOUR TURN!';
        instructionText.textContent = 'MAKE YOUR ARGUMENT BEFORE THE TIME IS OVER';
        const minutes = Math.floor(data.turnTimeRemaining / 60);
        const seconds = data.turnTimeRemaining % 60;
        timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
        // WAIT... — show Figma wait screen overlay
        removeDebaterActiveScreen();
        showDebaterWaitScreen();
        headerText.textContent = 'WAIT...';
        instructionText.textContent = 'PREPARE YOUR ARGUMENT WHILE THE OTHER GROUP MAKES THEIRS';
        timerText.textContent = '';
        if (timerSegmentsContainer) timerSegmentsContainer.innerHTML = '';
    }

    if (data.debateOver) {
        removeDebaterWaitScreen();
        removeDebaterActiveScreen();
        if (userRole === 'debater') showDebaterOverScreen();
    }
    
    console.log(`⏱️ Timer updated - My turn: ${isMyTurn}`);
}

// Draw segmented circular timer for debate mobile UI
function drawDebateTimerSegments(container, timeRemaining, groupNumber) {
    const progress = timeRemaining / 30; // 1 to 0 as time goes down (30 seconds)
    const totalSegments = 40;
    const remainingSegments = Math.ceil(progress * totalSegments);
    
    // Clear existing segments
    container.innerHTML = '';
    
    const segmentAngle = (Math.PI * 2) / totalSegments;
    const segmentLength = segmentAngle * 0.6; // 60% solid, 40% gap
    const radius = 85; // Match circle radius
    const centerX = 100;
    const centerY = 100;
    
    // Draw segments
    for (let i = 0; i < remainingSegments; i++) {
        const startAngle = -Math.PI / 2 + (i * segmentAngle); // Start at top
        const endAngle = startAngle + segmentLength;
        
        // Create path for segment
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        const x1 = centerX + radius * Math.cos(startAngle);
        const y1 = centerY + radius * Math.sin(startAngle);
        const x2 = centerX + radius * Math.cos(endAngle);
        const y2 = centerY + radius * Math.sin(endAngle);
        
        const largeArcFlag = (endAngle - startAngle) > Math.PI ? 1 : 0;
        
        const pathData = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
        
        path.setAttribute('d', pathData);
        path.setAttribute('fill', '#FFFFFF');
        path.setAttribute('stroke', 'none');
        
        container.appendChild(path);
    }
}

// Draw segmented circular timer (old function for listeners)
function drawTimerSegments(container, timeRemaining, currentTurn) {
    const progress = timeRemaining / 30; // 1 to 0 as time goes down (30 seconds)
    const totalSegments = 40;
    const remainingSegments = Math.ceil(progress * totalSegments);
    const segmentAngle = (2 * Math.PI) / totalSegments;
    const segmentLength = segmentAngle * 0.6; // 60% solid, 40% gap
    const outerRadius = 95; // Outside the dashed circle (base is 85)
    const centerX = 100;
    const centerY = 100;
    
    // Clear existing segments
    container.innerHTML = '';
    
    // Create SVG path elements for each segment
    for (let i = 0; i < remainingSegments; i++) {
        const startAngle = -Math.PI / 2 + (i * segmentAngle); // Start at top
        const endAngle = startAngle + segmentLength;
        
        // Calculate arc path
        const startX = centerX + outerRadius * Math.cos(startAngle);
        const startY = centerY + outerRadius * Math.sin(startAngle);
        const endX = centerX + outerRadius * Math.cos(endAngle);
        const endY = centerY + outerRadius * Math.sin(endAngle);
        
        // Create path element
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const pathData = `M ${startX} ${startY} A ${outerRadius} ${outerRadius} 0 0 1 ${endX} ${endY}`;
        path.setAttribute('d', pathData);
        path.setAttribute('class', `timer-segment group-${currentTurn}`);
        
        container.appendChild(path);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Debate voting UI is initialized via WebSocket messages
});

// Handle keyboard appearance - prevent overflow by adjusting layout
textInput.addEventListener('focus', () => {
    // Add a class to adjust layout when keyboard is visible
    document.body.classList.add('keyboard-visible');
});

textInput.addEventListener('blur', () => {
    // Remove class when keyboard is hidden
    document.body.classList.remove('keyboard-visible');
});

// Show role reveal screen (colored background with icon and role name)
function showRoleRevealScreen(role, group) {
    // Remove existing reveal screen if any
    const existing = document.getElementById('roleRevealScreen');
    if (existing) existing.remove();
    
    // Create reveal screen
    const revealScreen = document.createElement('div');
    revealScreen.id = 'roleRevealScreen';
    
    // Set background color based on role
    let bgColor, icon, roleText, textColor;
    if (role === 'listener') {
        bgColor = '#FFFFFF';
        textColor = '#000';
        icon = '👤';
        roleText = 'LISTENER';
    } else if (role === 'debater' && group === 1) {
        bgColor = '#DC3545'; // Red
        textColor = '#FFF';
        icon = '💬';
        roleText = 'DEBATER<br>GROUP 1';
    } else if (role === 'debater' && group === 2) {
        bgColor = '#0000FE'; // Blue
        textColor = '#FFF';
        icon = '💬';
        roleText = 'DEBATER<br>GROUP 2';
    }
    
    revealScreen.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: ${bgColor};
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.5s ease;
    `;
    
    // Add icon (emoji with MD Thermochrome font to match main display)
    const iconEl = document.createElement('div');
    iconEl.textContent = icon;
    iconEl.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', 'Courier New', monospace;
        font-size: 100px;
        margin-bottom: 15px;
        ${role === 'debater' ? 'filter: brightness(0) invert(1);' : ''}
    `;
    revealScreen.appendChild(iconEl);
    
    // Add role text
    const textEl = document.createElement('div');
    textEl.innerHTML = roleText;
    textEl.style.cssText = `
        font-family: 'MD Thermochrome 0.4 Trial', 'Courier New', monospace;
        font-size: 36px;
        font-weight: 900;
        letter-spacing: 0.15em;
        text-align: center;
        color: ${textColor};
        line-height: 1.3;
    `;
    revealScreen.appendChild(textEl);
    
    document.body.appendChild(revealScreen);
}

// Remove role reveal screen with fade out
function removeRoleRevealScreen() {
    const revealScreen = document.getElementById('roleRevealScreen');
    if (revealScreen) {
        revealScreen.style.animation = 'fadeOut 0.5s ease';
        setTimeout(() => revealScreen.remove(), 500);
    }
}

// TEST FUNCTIONS - Remove these in production
window.testGroup1 = function() {
    window.debateQuestion = 'Should fossil fuels be banned entirely?';
    userRole = 'debater';
    userGroup = 1;
    showDebaterReadyScreen(1);
};

window.testGroup2 = function() {
    window.debateQuestion = 'Should fossil fuels be banned entirely?';
    userRole = 'debater';
    userGroup = 2;
    showDebaterReadyScreen(2);
};

window.testListener = function() {
    window.debateQuestion = 'Should fossil fuels be banned entirely?';
    window.clusterName = 'CLIMATE CHANGE';
    userRole = 'listener';
    showListenerWaitingScreen();
    // Simulate some ready counts
    setTimeout(() => updateListenerReadyCounters(2, 5, 1, 3), 1000);
};

// Handle state synchronization on connect/reconnect
function handleStateSync(phase, data, timing) {
    console.log(`📱 Syncing to phase: ${phase}`, data);
    if (timing) {
        console.log(`⏱️ World clock timing:`, timing);
    }
    
    // Get all sections
    const idleSection = document.getElementById('idleSection');
    const inputSection = document.getElementById('inputSection');
    const clusterSection = document.getElementById('clusterSection');
    const votingSection = document.getElementById('votingSection');
    const topicRevealSection = document.getElementById('topicRevealSection');
    const roleAssignmentSection = document.getElementById('roleAssignmentSection');
    const debaterReadyScreen = document.getElementById('debaterReadyScreen');
    const listenerWaitingScreen = document.getElementById('listenerWaitingScreen');
    const debateVotingSection = document.getElementById('debateVotingSection');
    const listenerVotingSection = document.getElementById('listenerVotingSection');
    
    // Hide ALL sections first
    if (idleSection) idleSection.style.display = 'none';
    if (inputSection) inputSection.style.display = 'none';
    if (clusterSection) clusterSection.style.display = 'none';
    if (votingSection) votingSection.style.display = 'none';
    if (topicRevealSection) topicRevealSection.style.display = 'none';
    if (roleAssignmentSection) roleAssignmentSection.style.display = 'none';
    if (debaterReadyScreen) debaterReadyScreen.style.display = 'none';
    if (listenerWaitingScreen) listenerWaitingScreen.style.display = 'none';
    if (debateVotingSection) debateVotingSection.style.display = 'none';
    if (listenerVotingSection) listenerVotingSection.style.display = 'none';
    
    // Route to correct screen based on phase
    switch(phase) {
        case 'idle':
            // Show idle screen
            if (idleSection) idleSection.style.display = 'flex';
            if (inputSection) inputSection.style.display = 'none';
            console.log('📱 Synced to: Idle screen');
            break;
            
        case 'posting':
            // Show input section
            if (idleSection) idleSection.style.display = 'none';
            if (inputSection) inputSection.style.display = 'flex';
            console.log('📱 Synced to: Input section');
            break;
            
        case 'clustering':
            // Show clustering animation
            if (inputSection) inputSection.style.display = 'none';
            showClusteringAnimation();
            console.log('📱 Synced to: Clustering animation');
            break;
            
        case 'voting':
            // Show cluster voting
            if (clusterSection) clusterSection.style.display = 'block';
            if (votingSection) votingSection.style.display = 'block';
            if (data && data.clusters) {
                displayClusters(data.clusters);
            }
            console.log('📱 Synced to: Cluster voting');
            break;
            
        case 'reveal':
            // Show topic reveal
            if (data && data.cluster) {
                showTopicReveal(data.cluster);
            }
            console.log('📱 Synced to: Topic reveal');
            break;
            
        case 'roles':
            // Store debate question if provided (for reconnects)
            if (data && data.debateArgument) {
                window.debateQuestion = data.debateArgument;
                console.log('📝 Stored debate question from sync:', data.debateArgument);
            }
            
            // Store cluster name if provided
            if (data && data.clusterName) {
                window.clusterName = data.clusterName;
                console.log('📝 Stored cluster name from sync:', data.clusterName);
            }
            
            // If user has role assigned, show appropriate ready screen
            if (data && data.role) {
                userRole = data.role;
                if (data.group) userGroup = data.group;
                
                // Show appropriate ready screen
                if (data.role === 'debater') {
                    showDebaterReadyScreen(data.group);
                } else {
                    showListenerWaitingScreen();
                }
            } else {
                // No role assigned yet - show idle/waiting screen
                if (idleSection) idleSection.style.display = 'flex';
            }
            console.log('📱 Synced to: Role assignment');
            break;
            
        case 'debate':
            // CRITICAL: Restore user role FIRST before showing UI
            if (data && data.role) {
                userRole = data.role;
                if (data.group) userGroup = data.group;
                console.log(`🎭 Restored role: ${userRole}, group: ${userGroup || 'none'}`);
            }
            
            // Store debate question if provided (for reconnects)
            if (data && data.debateArgument) {
                window.debateQuestion = data.debateArgument;
                console.log('📝 Stored debate question from sync:', data.debateArgument);
            }
            
            // Store cluster name if provided
            if (data && data.clusterName) {
                window.clusterName = data.clusterName;
                console.log('📝 Stored cluster name from sync:', data.clusterName);
            }
            
            // Log world clock timing data
            if (timing) {
                console.log(`⏱️ World clock timing:`, timing);
                if (timing.debateTimeRemaining !== null) {
                    console.log(`⏱️ Debate timer synced to ${timing.debateTimeRemaining}s`);
                    // Store for timer display sync
                    window.syncedDebateTime = timing.debateTimeRemaining;
                }
            }
            
            // Show debate screen (debater or listener)
            if (userRole === 'listener') {
                if (listenerVotingSection) {
                    listenerVotingSection.style.display = 'flex';
                    initListenerVoting();
                }
                console.log('📱 Synced to: Listener debate voting');
            } else if (userRole === 'debater') {
                if (debateVotingSection) {
                    debateVotingSection.style.display = 'flex';
                }
                console.log('📱 Synced to: Debater debate screen');
            }
            break;
            
        case 'debate-over':
            // Show debate over screen
            showDebateOverScreen();
            console.log('📱 Synced to: Debate over');
            break;
            
        case 'winner':
            // Show winner screen (if implemented)
            console.log('📱 Synced to: Winner announcement');
            break;
            
        default:
            console.log(`⚠️ Unknown phase: ${phase}`);
    }
}

// Show debate over / counting votes screen
function showDebateOverScreen() {
    const debateOverSection = document.getElementById('debateOverSection');
    const debateVotingSection = document.getElementById('debateVotingSection');
    const listenerVotingSection = document.getElementById('listenerVotingSection');
    
    if (!debateOverSection) return;
    
    // Hide debate screens
    if (debateVotingSection) debateVotingSection.style.display = 'none';
    if (listenerVotingSection) listenerVotingSection.style.display = 'none';
    
    // Show debate over screen
    debateOverSection.style.display = 'flex';
    
    // Set background color based on user's role
    debateOverSection.classList.remove('group-1', 'group-2', 'listener');
    
    if (userRole === 'debater' && userGroup === 1) {
        debateOverSection.classList.add('group-1');
        console.log('📱 Showing debate over screen - Group 1 (Red)');
    } else if (userRole === 'debater' && userGroup === 2) {
        debateOverSection.classList.add('group-2');
        console.log('📱 Showing debate over screen - Group 2 (Blue)');
    } else {
        debateOverSection.classList.add('listener');
        console.log('📱 Showing debate over screen - Listener (White)');
    }
}

connect();
textInput.focus();
