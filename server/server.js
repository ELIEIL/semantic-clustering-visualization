require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode'); // For generating QR code images
const ngrok = require('ngrok');
const os = require('os');
const CONFIG = require('./config.js');
const ConceptNetClient = require('./api/conceptnet-client.js');
const NewsAPIClient = require('./api/news-api.js');
const { analyzeKeywordsForDebate } = require('./keyword-analysis.js');
const { findBestDebateStatement } = require('./statement-matcher.js');
const { initializeSpellChecker, correctClusterLabels, correctPosts } = require('./spell-checker.js');

const PORT = 8080;
const HTTP_PORT = 3000;
const RATE_LIMIT_WINDOW = 60000;
const MAX_POSTS_PER_WINDOW = 3;
const MAX_POST_LENGTH = 500;

// Store generated QR code
let qrCodeDataURL = null;
let mobileControllerUrl = null;

const profanityList = [
    'fuck', 'shit', 'bitch', 'asshole', 'damn', 'cunt', 'dick', 'pussy',
    'bastard', 'slut', 'whore', 'fag', 'nigger', 'retard', 'kill yourself',
    'kys', 'nazi', 'hitler'
];

const wss = new WebSocket.Server({ port: PORT });
const displayClients = new Set();
const moderatorClients = new Set();
const mobileClients = new Map(); // clientId -> WebSocket connection
const pendingPosts = [];
let approvedPosts = [];
const rateLimitMap = new Map();

// Role assignment
let nextClientId = 1;
const clientRoles = new Map(); // clientId -> 'debater' | 'listener'

// Cluster voting state
const clusterVotes = new Map(); // clusterId -> vote count
const clientClusterVotes = new Map(); // clientId -> clusterId (prevent multiple votes)
let currentClusters = []; // Store current clusters with their data

// Live debate voting state
const debateVotes = {
    red: 0,      // Group 1 (red) total votes
    green: 0     // Group 2 (green) total votes
};
const clientDebateVotes = new Map(); // clientId -> 'red' | 'green' | null (current vote)
const clientHoldState = new Map(); // clientId -> { side: 'red'|'green', startTime: timestamp }

// Ready-up state for debaters
const debaterReadyState = new Map(); // clientId -> boolean (ready or not)

// Voting system data structures
const postVotes = new Map(); // postId -> { upvotes: 0, downvotes: 0, voters: Set() }
const userVotes = new Map(); // userId -> [{ postId, vote, timestamp }]
const userPreferences = new Map(); // userId -> { topics, bias, keywords, sources }

// Synchronized countdown timer (30 seconds for testing)
let countdownTime = 30; // seconds
let countdownInterval = null;

// Initialize ConceptNet client for semantic understanding
const conceptNet = new ConceptNetClient();
console.log('ConceptNet client initialized');

// Initialize NewsAPI client
const NEWSAPI_KEY = process.env.NEWSAPI_KEY || 'YOUR_API_KEY_HERE';
const newsAPI = new NewsAPIClient(NEWSAPI_KEY);
let currentHeadline = { text: 'What are your thoughts on current events?', imageUrl: null };

// Fetch initial headline
(async () => {
    currentHeadline = await newsAPI.getTopHeadline('general', 'us');
    console.log('Current headline:', currentHeadline.text);
    console.log('Article image:', currentHeadline.imageUrl);
})();

// Initialize Sentence Transformer (dynamic import for ES module)
let sentenceTransformer = null;
(async () => {
    const { default: SentenceTransformer } = await import('./sentence-transformer.js');
    sentenceTransformer = new SentenceTransformer();
    await sentenceTransformer.initialize();
    console.log('Sentence Transformer ready');
})().catch(err => {
    console.error('Sentence Transformer initialization failed:', err);
});

function containsProfanity(text) {
    const lowerText = text.toLowerCase();
    return profanityList.some(word => {
        const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(lowerText);
    });
}

function checkRateLimit(clientId) {
    const now = Date.now();
    const userPosts = rateLimitMap.get(clientId) || [];
    
    const recentPosts = userPosts.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
    
    if (recentPosts.length >= MAX_POSTS_PER_WINDOW) {
        return false;
    }
    
    recentPosts.push(now);
    rateLimitMap.set(clientId, recentPosts);
    return true;
}

function broadcastToDisplays(message) {
    displayClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

function broadcastToModerators(message) {
    moderatorClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

function broadcastToAll(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Countdown timer functions
function startCountdownTimer() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    countdownTime = 30; // Reset to 30 seconds
    
    countdownInterval = setInterval(() => {
        if (countdownTime <= 0) {
            clearInterval(countdownInterval);
            countdownTime = 0;
        }
        
        // Broadcast current time to all clients
        broadcastToAll({
            type: 'countdown_update',
            time: countdownTime
        });
        
        if (countdownTime > 0) {
            countdownTime--;
        }
    }, 1000);
    
    console.log('Countdown timer started (1 minute)');
}

function resetCountdownTimer() {
    startCountdownTimer();
    console.log('Countdown timer reset');
}

wss.on('connection', (ws) => {
    console.log('New client connected');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'register_moderator') {
                if (!CONFIG.ADMIN_PANEL_ENABLED) {
                    console.log('Admin panel is disabled');
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Admin panel is currently disabled'
                    }));
                    return;
                }
                
                moderatorClients.add(ws);
                ws.clientType = 'moderator';
                console.log('Moderator registered');
                
                ws.send(JSON.stringify({
                    type: 'init',
                    pending: pendingPosts,
                    approved: approvedPosts
                }));
                return;
            }
            
            if (data.type === 'register_display') {
                displayClients.add(ws);
                console.log('Display registered');
                
                // Send current headline to display
                ws.send(JSON.stringify({
                    type: 'headline',
                    headline: currentHeadline.text,
                    imageUrl: currentHeadline.imageUrl,
                    timestamp: Date.now()
                }));
                
                // Send current countdown time
                ws.send(JSON.stringify({
                    type: 'countdown_update',
                    time: countdownTime
                }));
                
                approvedPosts.forEach(post => {
                    ws.send(JSON.stringify(post));
                });
                return;
            }
            
            if (data.type === 'register_mobile') {
                // Assign unique client ID to mobile device
                const clientId = nextClientId++;
                ws.clientId = clientId;
                mobileClients.set(clientId, ws);
                
                // Send client ID back to mobile
                ws.send(JSON.stringify({
                    type: 'client_id',
                    clientId: clientId
                }));
                
                console.log(`Mobile client registered with ID: ${clientId}`);
                return;
            }
            
            if (data.type === 'request_headline') {
                ws.send(JSON.stringify({
                    type: 'headline',
                    headline: currentHeadline.text,
                    imageUrl: currentHeadline.imageUrl,
                    timestamp: Date.now()
                }));
                return;
            }
            
            if (data.type === 'refresh_headline') {
                newsAPI.clearCache();
                (async () => {
                    currentHeadline = await newsAPI.getTopHeadline('general', 'us');
                    broadcastToDisplays({
                        type: 'headline',
                        headline: currentHeadline.text,
                        imageUrl: currentHeadline.imageUrl,
                        timestamp: Date.now()
                    });
                })();
                return;
            }
            
            if (data.type === 'clear_cache') {
                newsAPI.clearCache();
                console.log('Cache cleared manually');
                return;
            }
            
            if (data.type === 'update_news_settings') {
                // Update settings and fetch new headline
                newsAPI.clearCache();
                (async () => {
                    currentHeadline = await newsAPI.getTopHeadline(data.category || 'general', data.country || 'us');
                    broadcastToDisplays({
                        type: 'headline',
                        headline: currentHeadline.text,
                        imageUrl: currentHeadline.imageUrl,
                        timestamp: Date.now()
                    });
                })();
                return;
            }
            
            if (data.type === 'reset_timer') {
                // Reset countdown timer to 3 minutes
                resetCountdownTimer();
                console.log('Timer reset manually');
                return;
            }
            
            if (data.type === 'clear_all_posts') {
                // Clear all posts from server
                approvedPosts = [];
                console.log('All posts cleared');
                
                // Broadcast clear command to all clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'clear_all_posts' }));
                    }
                });
                return;
            }
            
            if (data.type === 'vote_cluster') {
                const clusterId = data.clusterId;
                const votingClientId = data.clientId;
                
                // Prevent duplicate votes from same client
                if (clientClusterVotes.has(votingClientId)) {
                    console.log(`⚠️ Client ${votingClientId} already voted`);
                    return;
                }
                
                // Find cluster label for logging
                const cluster = currentClusters.find(c => c.id === clusterId);
                const clusterLabel = cluster ? cluster.label : 'Unknown';
                
                // Record vote
                clientClusterVotes.set(votingClientId, clusterId);
                const currentVotes = clusterVotes.get(clusterId) || 0;
                clusterVotes.set(clusterId, currentVotes + 1);
                
                console.log(`✅ Vote recorded for cluster ${clusterId} "${clusterLabel}" (now has ${currentVotes + 1} votes)`);
                
                // Broadcast updated vote count to all clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'cluster_vote_update',
                            clusterId: clusterId,
                            voteCount: currentVotes + 1
                        }));
                    }
                });
                
                return;
            }
            
            if (data.type === 'start_debate_voting') {
                // Broadcast start debate voting to all mobile clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'start_debate_voting',
                            blueVotes: data.blueVotes,
                            redVotes: data.redVotes
                        }));
                    }
                });
                
                console.log('🎤 Broadcasting start debate voting');
                return;
            }
            
            if (data.type === 'debate_timer_update') {
                // Broadcast timer updates to all mobile clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'debate_timer_update',
                            currentTurn: data.currentTurn,
                            turnTimeRemaining: data.turnTimeRemaining,
                            currentTurnNumber: data.currentTurnNumber,
                            totalTurns: data.totalTurns,
                            debateOver: data.debateOver
                        }));
                    }
                });
                return;
            }
            
            if (data.type === 'skip_to_reveal') {
                // Broadcast skip command to mobile clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'skip_to_reveal',
                            cluster: data.cluster
                        }));
                    }
                });
                
                console.log('📺 Broadcasting skip to reveal');
                return;
            }
            
            if (data.type === 'assign_roles') {
                // Assign roles with distribution: 30% Group 1, 30% Group 2, 40% Listeners
                const clientIds = Array.from(mobileClients.keys());
                
                if (clientIds.length < 1) {
                    console.log('⚠️ No mobile clients connected for role assignment');
                    return;
                }
                
                // Store cluster data for role assignment
                const clusterName = data.clusterName;
                const clusterColor = data.clusterColor;
                const debateArgument = data.debateArgument || clusterName; // Use debate argument if provided
                console.log('📦 Role assignment with cluster:', clusterName);
                console.log('📝 Debate argument:', debateArgument);
                
                // TESTING MODE: Always assign as listener for testing listener path
                // TODO: Revert to random distribution for actual testing
                clientRoles.clear();
                debaterReadyState.clear();
                
                for (let i = 0; i < clientIds.length; i++) {
                    const id = clientIds[i];
                    
                    clientRoles.set(id, { role: 'listener' });
                    
                    const client = mobileClients.get(id);
                    if (client && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'role_assignment',
                            role: 'listener',
                            clusterName: clusterName,
                            clusterColor: clusterColor,
                            debateArgument: debateArgument
                        }));
                    }
                }
                
                // Broadcast to display clients to trigger role assignment animation
                displayClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'assign_roles'
                        }));
                    }
                });
                
                console.log(`🎭 TESTING MODE - All ${clientIds.length} users assigned as listeners`);
                return;
            }
            
            if (data.type === 'listener_vote') {
                const clientId = ws.clientId;
                const { side, balance } = data;
                
                if (!clientId) return;
                
                console.log(`🗳️ Listener ${clientId} voted ${side}: balance = ${balance}`);
                
                // Broadcast vote balance to all display clients for visual sync
                displayClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'listener_vote_update',
                            clientId: clientId,
                            side: side,
                            balance: balance
                        }));
                    }
                });
                
                return;
            }
            
            if (data.type === 'user_ready' || data.type === 'debater_ready') {
                const clientId = ws.clientId;
                if (!clientId) return;
                
                // Mark user as ready (works for both debaters and listeners)
                debaterReadyState.set(clientId, true);
                
                // Count ready users
                let readyCount = 0;
                let totalUsers = 0;
                clientRoles.forEach((roleInfo, id) => {
                    totalUsers++;
                    if (debaterReadyState.get(id)) {
                        readyCount++;
                    }
                });
                
                console.log(`✅ User ready: ${readyCount}/${totalUsers}`);
                
                // Broadcast ready count to all displays
                displayClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'debater_ready_update',
                            readyCount: readyCount,
                            totalDebaters: totalUsers
                        }));
                    }
                });
                
                // If all users are ready, start debate voting
                if (readyCount === totalUsers && totalUsers > 0) {
                    console.log('🎤 All users ready! Starting debate voting...');
                    
                    // Broadcast start debate voting to all clients
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'start_debate_voting'
                            }));
                        }
                    });
                }
                return;
            }
            
            if (data.type === 'debate_vote') {
                const clientId = ws.clientId;
                const { side, action } = data; // side: 'red' | 'green', action: 'press' | 'release'
                
                if (!clientId) return;
                
                if (action === 'press') {
                    // Remove vote from previous side if switching
                    const previousSide = clientDebateVotes.get(clientId);
                    if (previousSide && previousSide !== side) {
                        debateVotes[previousSide] = Math.max(0, debateVotes[previousSide] - 1);
                    }
                    
                    // Add vote to new side if not already voting
                    if (previousSide !== side) {
                        debateVotes[side]++;
                        clientDebateVotes.set(clientId, side);
                    }
                    
                    // Track hold state
                    clientHoldState.set(clientId, {
                        side: side,
                        startTime: Date.now()
                    });
                    
                } else if (action === 'release') {
                    // Remove hold state
                    clientHoldState.delete(clientId);
                }
                
                // Count active holds per side
                let redActiveHolds = 0;
                let greenActiveHolds = 0;
                clientHoldState.forEach((holdInfo) => {
                    if (holdInfo.side === 'red') {
                        redActiveHolds++;
                    } else if (holdInfo.side === 'green') {
                        greenActiveHolds++;
                    }
                });
                
                // Broadcast active hold counts to all displays
                displayClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'debate_vote_update',
                            red: redActiveHolds,
                            green: greenActiveHolds
                        }));
                    }
                });
                
                console.log(`📊 Active holds - Red: ${redActiveHolds}, Green: ${greenActiveHolds}`);
                return;
            }
            
            if (data.type === 'clustering_progress') {
                // Broadcast clustering progress to all clients (especially mobile)
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'clustering_progress',
                            progress: data.progress,
                            phase: data.phase
                        }));
                    }
                });
                return;
            }
            
            if (data.type === 'clustering_complete') {
                // Broadcast clustering complete to all clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'clustering_complete'
                        }));
                    }
                });
                return;
            }
            
            if (data.type === 'update_clusters') {
                // Store cluster data for later winner determination
                currentClusters = data.clusters || [];
                
                // Initialize vote counts for new clusters
                currentClusters.forEach(cluster => {
                    if (!clusterVotes.has(cluster.id)) {
                        clusterVotes.set(cluster.id, 0);
                    }
                });
                
                // Broadcast cluster data to all clients (especially mobile)
                const clusterMessage = {
                    type: 'clusters',
                    clusters: data.clusters,
                    uncategorizedPosts: data.uncategorizedPosts || []
                };
                
                // Send to all connected clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(clusterMessage));
                    }
                });
                
                console.log('Broadcasted cluster update:', data.clusters.length, 'clusters,', data.uncategorizedPosts?.length || 0, 'uncategorized');
                return;
            }
            
            if (data.type === 'get_winning_cluster') {
                // Determine winning cluster based on votes
                console.log('🗳️ Determining winning cluster...');
                console.log('   Current clusters:', currentClusters.map(c => `${c.id}:"${c.label}"`).join(', '));
                console.log('   Vote counts:');
                currentClusters.forEach(cluster => {
                    const votes = clusterVotes.get(cluster.id) || 0;
                    console.log(`      Cluster ${cluster.id} "${cluster.label}": ${votes} votes`);
                });
                
                let winningCluster = null;
                let maxVotes = 0;
                
                currentClusters.forEach(cluster => {
                    const votes = clusterVotes.get(cluster.id) || 0;
                    if (votes > maxVotes) {
                        maxVotes = votes;
                        winningCluster = cluster;
                    }
                });
                
                // If no votes, pick first cluster
                if (!winningCluster && currentClusters.length > 0) {
                    winningCluster = currentClusters[0];
                    console.log('⚠️ No votes recorded, picking first cluster');
                }
                
                console.log(`🏆 Winning cluster: ${winningCluster?.label} (ID: ${winningCluster?.id}) with ${maxVotes} votes`);
                
                // Send winning cluster to requesting client
                if (winningCluster) {
                    ws.send(JSON.stringify({
                        type: 'winning_cluster',
                        cluster: winningCluster,
                        votes: maxVotes
                    }));
                }
                return;
            }
            
            if (data.type === 'post') {
                const clientId = ws._socket.remoteAddress;
                
                if (data.content.length > MAX_POST_LENGTH) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: `Post too long. Max ${MAX_POST_LENGTH} characters.`
                    }));
                    return;
                }
                
                // Rate limiting disabled for testing
                // if (!checkRateLimit(clientId)) {
                //     ws.send(JSON.stringify({
                //         type: 'error',
                //         message: 'Rate limit exceeded. Please wait before posting again.'
                //     }));
                //     return;
                // }
                
                if (containsProfanity(data.content)) {
                    console.log('Blocked post with profanity:', data.content);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Post contains inappropriate content.'
                    }));
                    return;
                }
                
                const post = {
                    id: Date.now() + Math.random(),
                    content: data.content,
                    timestamp: Date.now(),
                    status: 'approved'
                };
                
                approvedPosts.push(post);
                console.log('Post approved and sent to display:', data.content);
                
                broadcastToDisplays({
                    type: 'post',
                    content: post.content,
                    timestamp: post.timestamp
                });
                
                ws.send(JSON.stringify({ 
                    type: 'success',
                    content: data.content,
                    message: 'Post sent to display!'
                }));
                return;
            }
            
            if (data.type === 'approve_post' && ws.clientType === 'moderator') {
                const postIndex = pendingPosts.findIndex(p => p.id === data.postId);
                if (postIndex !== -1) {
                    const post = pendingPosts.splice(postIndex, 1)[0];
                    post.status = 'approved';
                    approvedPosts.push(post);
                    
                    console.log('Post approved:', post.content);
                    
                    broadcastToDisplays({
                        type: 'post',
                        content: post.content,
                        timestamp: post.timestamp
                    });
                    
                    broadcastToModerators({
                        type: 'post_approved',
                        postId: post.id
                    });
                }
                return;
            }
            
            if (data.type === 'reject_post' && ws.clientType === 'moderator') {
                const postIndex = pendingPosts.findIndex(p => p.id === data.postId);
                if (postIndex !== -1) {
                    const post = pendingPosts.splice(postIndex, 1)[0];
                    console.log('Post rejected:', post.content);
                    
                    broadcastToModerators({
                        type: 'post_rejected',
                        postId: post.id
                    });
                }
                return;
            }
            
            if (data.type === 'delete_post' && ws.clientType === 'moderator') {
                const postIndex = approvedPosts.findIndex(p => p.id === data.postId);
                if (postIndex !== -1) {
                    approvedPosts.splice(postIndex, 1);
                    console.log('Post deleted from display');
                    
                    broadcastToDisplays({
                        type: 'delete_post',
                        postId: data.postId
                    });
                }
                return;
            }
            
            if (data.type === 'clear_all' && ws.clientType === 'moderator') {
                approvedPosts.length = 0;
                pendingPosts.length = 0;
                console.log('All posts cleared');
                
                broadcastToDisplays({
                    type: 'clear_all'
                });
                
                broadcastToModerators({
                    type: 'all_cleared'
                });
                return;
            }
            
            // Vote handling
            if (data.type === 'vote') {
                const { postId, vote, userId } = data;
                
                if (!postId || !vote || !userId) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Missing vote data'
                    }));
                    return;
                }
                
                // Initialize vote tracking for this post if needed
                if (!postVotes.has(postId)) {
                    postVotes.set(postId, {
                        upvotes: 0,
                        downvotes: 0,
                        voters: new Set()
                    });
                }
                
                const voteData = postVotes.get(postId);
                
                // Check if user already voted on this post
                if (voteData.voters.has(userId)) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'You already voted on this post'
                    }));
                    return;
                }
                
                // Record the vote
                if (vote === 'up') {
                    voteData.upvotes++;
                } else if (vote === 'down') {
                    voteData.downvotes++;
                }
                voteData.voters.add(userId);
                
                // Track user's voting history
                if (!userVotes.has(userId)) {
                    userVotes.set(userId, []);
                }
                userVotes.get(userId).push({
                    postId,
                    vote,
                    timestamp: Date.now()
                });
                
                console.log(`📊 Vote recorded: User ${userId} voted ${vote} on post ${postId}`);
                console.log(`   Post votes: ${voteData.upvotes} up, ${voteData.downvotes} down`);
                
                // Send vote confirmation
                ws.send(JSON.stringify({
                    type: 'vote_recorded',
                    postId,
                    vote,
                    totalVotes: userVotes.get(userId).length
                }));
                
                // Broadcast updated vote count to displays
                broadcastToDisplays({
                    type: 'vote_update',
                    postId,
                    upvotes: voteData.upvotes,
                    downvotes: voteData.downvotes
                });
                
                // Check if user has voted enough times to generate personalized feed
                const userVoteCount = userVotes.get(userId).length;
                if (userVoteCount >= 5) {
                    console.log(`🎯 User ${userId} has ${userVoteCount} votes - ready for personalized feed`);
                    // TODO: Trigger feed generation in Phase 2
                }
                
                return;
            }
            
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected');
        displayClients.delete(ws);
        moderatorClients.delete(ws);
        
        // Clean up debate vote if client was voting
        if (ws.clientId) {
            const votingSide = clientDebateVotes.get(ws.clientId);
            if (votingSide) {
                debateVotes[votingSide] = Math.max(0, debateVotes[votingSide] - 1);
                clientDebateVotes.delete(ws.clientId);
            }
            
            // Remove from hold state
            const wasHolding = clientHoldState.has(ws.clientId);
            clientHoldState.delete(ws.clientId);
            
            // If client was holding, broadcast updated active hold counts
            if (wasHolding) {
                let redActiveHolds = 0;
                let greenActiveHolds = 0;
                clientHoldState.forEach((holdInfo) => {
                    if (holdInfo.side === 'red') {
                        redActiveHolds++;
                    } else if (holdInfo.side === 'green') {
                        greenActiveHolds++;
                    }
                });
                
                displayClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'debate_vote_update',
                            red: redActiveHolds,
                            green: greenActiveHolds
                        }));
                    }
                });
            }
            
            mobileClients.delete(ws.clientId);
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

const server = http.createServer(async (req, res) => {
    // Add CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // QR Code endpoint - serves the generated QR code image
    if (req.url === '/api/qr-code') {
        if (qrCodeDataURL) {
            // Extract base64 data from data URL
            const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, '');
            const imgBuffer = Buffer.from(base64Data, 'base64');
            
            res.writeHead(200, { 
                'Content-Type': 'image/png',
                'Content-Length': imgBuffer.length
            });
            res.end(imgBuffer);
        } else {
            res.writeHead(503, { 'Content-Type': 'text/plain' });
            res.end('QR code not yet generated');
        }
        return;
    }
    
    // Mobile URL endpoint - serves the mobile controller URL as JSON
    if (req.url === '/api/mobile-url') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ url: mobileControllerUrl || 'Not yet available' }));
        return;
    }
    
    // Update tunnel URL endpoint - allows updating QR code with tunnel URL
    if (req.url === '/api/update-tunnel-url' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { tunnelUrl } = JSON.parse(body);
                if (!tunnelUrl) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'tunnelUrl is required' }));
                    return;
                }
                
                // Update mobile controller URL to tunnel URL
                const newMobileUrl = `${tunnelUrl}/client/pages/mobile.html`;
                mobileControllerUrl = newMobileUrl;
                
                // Regenerate QR code with tunnel URL (inverted colors)
                qrCodeDataURL = await QRCode.toDataURL(newMobileUrl, {
                    width: 400,
                    margin: 2,
                    color: {
                        dark: '#FFFFFF',  // White QR code
                        light: '#00000000'  // Transparent background
                    },
                    errorCorrectionLevel: 'H'
                });
                
                console.log('✅ QR code updated with tunnel URL:', newMobileUrl);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: true, 
                    url: newMobileUrl,
                    message: 'QR code updated successfully'
                }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }
    
    // ConceptNet API endpoint
    if (req.url.startsWith('/api/conceptnet/relatedness')) {
        const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
        const word1 = url.searchParams.get('word1');
        const word2 = url.searchParams.get('word2');
        
        if (!word1 || !word2) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing word1 or word2 parameter' }));
            return;
        }
        
        try {
            const relatedness = await conceptNet.getRelatedness(word1, word2);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                word1, 
                word2, 
                relatedness,
                cached: conceptNet.cache.has(`rel:${[word1, word2].sort().join(':')}`)
            }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
        return;
    }
    
    // Sentence Transformer similarity endpoint
    if (req.url.startsWith('/api/transformer/similarity')) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                if (!sentenceTransformer) {
                    res.writeHead(503, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Sentence Transformer not ready yet' }));
                    return;
                }
                
                const { keywords1, keywords2 } = JSON.parse(body);
                console.log('📥 Transformer received keywords1:', keywords1);
                console.log('📥 Transformer received keywords2:', keywords2);
                
                const similarity = await sentenceTransformer.calculateSemanticSimilarity(keywords1, keywords2);
                console.log('📊 Transformer calculated similarity:', similarity);
                
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ 
                    keywords1, 
                    keywords2, 
                    similarity,
                    cacheStats: sentenceTransformer.getCacheStats()
                }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }
    
    // Sentiment analysis endpoint
    if (req.url.startsWith('/api/sentiment/analyze')) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                if (!sentenceTransformer) {
                    res.writeHead(503, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Sentence Transformer not ready yet' }));
                    return;
                }
                
                const { text } = JSON.parse(body);
                console.log('📊 Analyzing sentiment for:', text.substring(0, 50) + '...');
                
                // Use transformer to analyze sentiment
                // Returns score: -1 (very negative) to +1 (very positive)
                const sentiment = await sentenceTransformer.analyzeSentiment(text);
                console.log('📈 Sentiment score:', sentiment);
                
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ sentiment }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }
    
    // Get opposing headlines based on cluster keywords
    if (req.url.startsWith('/api/news/opposing-headlines')) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { keywords } = JSON.parse(body);
                console.log('🔍 Fetching opposing headlines for keywords:', keywords);
                
                // 1. Search articles by keywords
                const articles = await newsAPI.searchArticlesByKeywords(keywords, 30);
                
                if (articles.length < 2) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Not enough articles found' }));
                    return;
                }
                
                // 2. Analyze sentiment for each article (using title + description)
                console.log('📊 Analyzing sentiment for', articles.length, 'articles...');
                const articlesWithSentiment = [];
                
                for (const article of articles) {
                    try {
                        if (!sentenceTransformer) {
                            // Fallback: simple keyword-based sentiment
                            const text = (article.title + ' ' + article.description).toLowerCase();
                            const positiveWords = ['support', 'benefit', 'positive', 'success', 'growth', 'improve', 'help', 'good', 'better'];
                            const negativeWords = ['oppose', 'harm', 'negative', 'crisis', 'threat', 'danger', 'risk', 'bad', 'worse', 'fail'];
                            
                            let sentiment = 0;
                            positiveWords.forEach(word => {
                                if (text.includes(word)) sentiment += 0.2;
                            });
                            negativeWords.forEach(word => {
                                if (text.includes(word)) sentiment -= 0.2;
                            });
                            
                            articlesWithSentiment.push({ ...article, sentiment });
                        } else {
                            const sentiment = await sentenceTransformer.analyzeSentiment(
                                article.title + ' ' + article.description
                            );
                            articlesWithSentiment.push({ ...article, sentiment });
                        }
                    } catch (error) {
                        console.error('Error analyzing article sentiment:', error.message);
                    }
                }
                
                // 3. Sort by sentiment
                articlesWithSentiment.sort((a, b) => a.sentiment - b.sentiment);
                
                // 4. Select most negative and most positive
                const negative = articlesWithSentiment[0]; // Most negative
                const positive = articlesWithSentiment[articlesWithSentiment.length - 1]; // Most positive
                
                console.log('✅ Selected opposing headlines:');
                console.log('   Negative:', negative.title, '(sentiment:', negative.sentiment, ')');
                console.log('   Positive:', positive.title, '(sentiment:', positive.sentiment, ')');
                
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({
                    position1: {
                        title: positive.title,
                        description: positive.description,
                        stance: 'Supportive',
                        sentiment: positive.sentiment,
                        source: positive.source,
                        url: positive.url,
                        imageUrl: positive.imageUrl
                    },
                    position2: {
                        title: negative.title,
                        description: negative.description,
                        stance: 'Critical',
                        sentiment: negative.sentiment,
                        source: negative.source,
                        url: negative.url,
                        imageUrl: negative.imageUrl
                    }
                }));
            } catch (error) {
                console.error('Error fetching opposing headlines:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }
    
    // Analyze keywords for debate positions (NEW: uses semantic statement matching)
    if (req.url.startsWith('/api/analyze-keywords')) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { keywords, clusterPosts } = JSON.parse(body);
                console.log('🔍 Analyzing cluster for debate statement:', keywords);
                
                // Use semantic statement matcher with manual topic library
                const result = await findBestDebateStatement(clusterPosts || [], sentenceTransformer);
                
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(result));
            } catch (error) {
                console.error('Error finding debate statement:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }
    
    // Spell-check individual posts endpoint
    if (req.url.startsWith('/api/spell-check-posts')) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { posts } = JSON.parse(body);
                const correctedPosts = await correctPosts(posts);
                
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ posts: correctedPosts }));
            } catch (error) {
                console.error('Error in spell-checking posts:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }
    
    // Spell-check cluster labels endpoint
    if (req.url.startsWith('/api/spell-check')) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { clusters } = JSON.parse(body);
                const correctedClusters = await correctClusterLabels(clusters);
                
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ clusters: correctedClusters }));
            } catch (error) {
                console.error('Error in spell-checking:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }
    
    // ConceptNet semantic similarity endpoint
    if (req.url.startsWith('/api/conceptnet/similarity')) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { keywords1, keywords2 } = JSON.parse(body);
                console.log('📥 Server received keywords1:', keywords1);
                console.log('📥 Server received keywords2:', keywords2);
                const similarity = await conceptNet.calculateSemanticSimilarity(keywords1, keywords2);
                console.log('📊 Server calculated similarity:', similarity);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    keywords1, 
                    keywords2, 
                    similarity,
                    cacheStats: conceptNet.getCacheStats()
                }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }
    
    // Regular file serving
    // Resolve file path relative to project root (one level up from server directory)
    // Strip query parameters (e.g., ?v=3 for cache busting)
    const urlWithoutQuery = req.url.split('?')[0];
    let filePath = path.join(__dirname, '..', urlWithoutQuery);
    if (urlWithoutQuery === '/') {
        filePath = path.join(__dirname, '..', 'client', 'pages', 'mobile.html');
    }
    
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.otf': 'font/otf',
        '.ttf': 'font/ttf',
    };
    
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(HTTP_PORT, async () => {
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';
    
    for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localIP = net.address;
                break;
            }
        }
    }
    
    // Initialize spell-checker
    try {
        await initializeSpellChecker();
    } catch (error) {
        console.error('⚠️ Spell-checker initialization failed:', error);
    }
    
    console.log('\n=================================');
    console.log('Server running!');
    console.log('=================================');
    console.log(`WebSocket server: ws://localhost:${PORT}`);
    console.log(`HTTP server: http://localhost:${HTTP_PORT}`);
    console.log(`Network IP: ${localIP}`);
    
    // ngrok disabled - use local network IP or mobile hotspot
    // For multi-device access: Use mobile hotspot on your phone
    const mobileUrl = `http://${localIP}:${HTTP_PORT}/client/pages/mobile.html`;
    mobileControllerUrl = mobileUrl;
    
    // Generate QR code as data URL with inverted colors (white on transparent)
    try {
        qrCodeDataURL = await QRCode.toDataURL(mobileUrl, {
            width: 400,
            margin: 2,
            color: {
                dark: '#FFFFFF',  // White QR code
                light: '#00000000'  // Transparent background
            },
            errorCorrectionLevel: 'H'
        });
        console.log('✅ QR code generated successfully (inverted colors)');
    } catch (err) {
        console.error('❌ Failed to generate QR code:', err);
    }
    
    console.log('\n=================================');
    console.log('📱 MOBILE CONTROLLER ACCESS');
    console.log('=================================');
    console.log(`📍 Mobile URL: ${mobileUrl}`);
    console.log(`� QR code endpoint: http://localhost:${HTTP_PORT}/api/qr-code`);
    console.log('\n� For multi-device access:');
    console.log('   Use mobile hotspot on your phone');
    console.log('   Connect all devices to the same hotspot');
    console.log('\n=================================');
    console.log('Scan this QR code with your phone:');
    console.log('=================================\n');
    
    qrcode.generate(mobileUrl, { small: false });
    
    console.log('\n=================================');
    console.log(`💻 Main display: http://localhost:${HTTP_PORT}/client/pages/index.html`);
    console.log('=================================\n');
    
    // Start synchronized countdown timer
    startCountdownTimer();
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);
