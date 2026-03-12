// Onboarding configuration - SET TO false TO DISABLE ONBOARDING
window.ENABLE_ONBOARDING = false;

// UI elements
const mobileHeadline = document.getElementById('mobileHeadline');
const mobileTimestamp = document.getElementById('mobileTimestamp');
const statusDot = document.getElementById('statusDot');
const textInput = document.getElementById('textInput');
const submitBtn = document.getElementById('submitBtn');
const charCounter = document.getElementById('charCounter');
const matchResult = document.getElementById('matchResult');
const matchText = document.getElementById('matchText');
const matchSimilarity = document.getElementById('matchSimilarity');

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
        
        // Update connection status
        statusDot.classList.remove('disconnected');
        statusDot.classList.add('connected');
        
        // Request current headline
        ws.send(JSON.stringify({ type: 'request_headline' }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'reddit_posts') {
            // Handle Reddit posts - show connections
            console.log('📡 Received Reddit posts:', data);
            if (mobileHeadline) {
                mobileHeadline.textContent = `Reddit: ${data.topic.charAt(0).toUpperCase() + data.topic.slice(1)}`;
            }
            if (mobileTimestamp) {
                mobileTimestamp.textContent = `${data.totalPosts} posts from ${data.clusters.length} opposing subreddits`;
            }
        }
        
        if (data.type === 'echo_chamber_match') {
            // Handle echo chamber match result
            console.log('🎯 Echo chamber match:', data);
            
            // Reset submit button
            submitBtn.textContent = 'Submit';
            submitBtn.disabled = false;
            
            // Clear input
            textInput.value = '';
            charCounter.textContent = '0/500';
            
            // Show match result
            if (data.match) {
                matchResult.style.display = 'block';
                matchText.textContent = `Your opinion matches the "${data.match.clusterLabel}" community!`;
                matchSimilarity.textContent = `${Math.round(data.match.similarity * 100)}% similar to: "${data.match.content.substring(0, 100)}..."`;
            } else {
                matchResult.style.display = 'block';
                matchText.textContent = 'No strong match found - your opinion is unique!';
                matchSimilarity.textContent = 'Try a different topic or viewpoint.';
            }
            
            // Hide match result after 5 seconds
            setTimeout(() => {
                matchResult.style.display = 'none';
            }, 5000);
        }
        
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
        
        // Removed: clusters handler - only using reddit_posts now
        // Removed: error handler - no longer needed
    };
    
    ws.onclose = () => {
        console.log('Disconnected from server');
        isConnected = false;
        
        // Update connection status
        statusDot.classList.remove('connected');
        statusDot.classList.add('disconnected');
        
        setTimeout(connect, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        isConnected = false;
    };
}

function handleSubmit() {
    const value = textInput.value.trim();
    
    if (!value) {
        textInput.placeholder = '✗ Please enter some text';
        setTimeout(() => {
            textInput.placeholder = "What's your opinion?";
        }, 2000);
        return;
    }
    
    if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
        textInput.placeholder = '✗ Not connected to server';
        setTimeout(() => {
            textInput.placeholder = "What's your opinion?";
        }, 2000);
        return;
    }
    
    // Show loading
    submitBtn.textContent = '⟳';
    submitBtn.disabled = true;
    
    const post = {
        type: 'user_post',
        content: value,
        timestamp: new Date().toISOString()
    };
    
    try {
        ws.send(JSON.stringify(post));
        console.log('✅ Post sent for echo chamber matching:', value);
    } catch (error) {
        console.error('❌ Failed to send post:', error);
        submitBtn.textContent = 'Submit';
        submitBtn.disabled = false;
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
// Removed: DOMContentLoaded event listener for back button
// Cluster detail view no longer exists in simplified Reddit connections view

// Character counter
if (textInput && charCounter) {
    textInput.addEventListener('input', () => {
        const count = textInput.value.length;
        charCounter.textContent = `${count}/500`;
    });
}

// Submit button
if (submitBtn) {
    submitBtn.addEventListener('click', handleSubmit);
}

// Enter key to submit
if (textInput) {
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    });
}

// Function to display connections in mobile controller
function displayConnections(data) {
    const connectionsList = document.getElementById('connectionsList');
    if (!connectionsList) return;
    
    // Extract all posts from clusters
    const allPosts = [];
    data.clusters.forEach(cluster => {
        cluster.posts.forEach(post => {
            allPosts.push({
                ...post,
                clusterLabel: cluster.label,
                clusterId: cluster.id
            });
        });
    });
    
    // Calculate connections between posts (simplified - just show some examples)
    const connections = [];
    
    // For demo: show connections between posts from different clusters
    for (let i = 0; i < Math.min(allPosts.length, 20); i++) {
        for (let j = i + 1; j < Math.min(allPosts.length, 20); j++) {
            const post1 = allPosts[i];
            const post2 = allPosts[j];
            
            // Calculate simple similarity based on shared words
            const words1 = new Set(post1.content.toLowerCase().split(/\s+/));
            const words2 = new Set(post2.content.toLowerCase().split(/\s+/));
            const intersection = new Set([...words1].filter(x => words2.has(x)));
            const similarity = intersection.size / Math.max(words1.size, words2.size);
            
            if (similarity > 0.15) {
                const isControversy = post1.clusterId !== post2.clusterId;
                connections.push({
                    post1,
                    post2,
                    similarity,
                    isControversy
                });
            }
        }
    }
    
    // Sort by similarity (highest first)
    connections.sort((a, b) => b.similarity - a.similarity);
    
    // Display connections
    if (connections.length === 0) {
        connectionsList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No connections found</div>';
        return;
    }
    
    let html = '';
    connections.slice(0, 30).forEach(conn => {
        const similarityPercent = Math.round(conn.similarity * 100);
        let typeClass = 'normal';
        let typeLabel = 'Similar';
        
        if (conn.isControversy) {
            typeClass = 'controversy';
            typeLabel = 'Bridge';
        } else if (conn.similarity > 0.6) {
            typeClass = 'strong';
            typeLabel = 'Strong';
        }
        
        html += `
            <div class="connection-item">
                <div class="connection-header">
                    <span class="connection-type ${typeClass}">${typeLabel}</span>
                    <span class="connection-similarity">${similarityPercent}% similar</span>
                </div>
                <div class="connection-posts">
                    <div class="connection-post">
                        <div class="connection-post-label">${conn.post1.clusterLabel}</div>
                        ${conn.post1.content.substring(0, 100)}${conn.post1.content.length > 100 ? '...' : ''}
                    </div>
                    <div class="connection-arrow">↕</div>
                    <div class="connection-post">
                        <div class="connection-post-label">${conn.post2.clusterLabel}</div>
                        ${conn.post2.content.substring(0, 100)}${conn.post2.content.length > 100 ? '...' : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    connectionsList.innerHTML = html;
}

connect();
