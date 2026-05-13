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

const wss = new WebSocket.Server({ port: PORT, host: '0.0.0.0' });
const displayClients = new Set();
const moderatorClients = new Set();
const mobileClients = new Map(); // clientId -> WebSocket connection
const pendingPosts = [];
let approvedPosts = [];
const rateLimitMap = new Map();

// Role assignment
let nextClientId = 1;
const clientRoles = new Map(); // sessionId -> {role, group, stance} - persists across reconnects

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
const debaterReadyState = new Map(); // sessionId -> boolean (ready or not) - persists across reconnects

// Voting system data structures
const postVotes = new Map(); // postId -> { upvotes: 0, downvotes: 0, voters: Set() }
const userVotes = new Map(); // userId -> [{ postId, vote, timestamp }]
const userPreferences = new Map(); // userId -> { topics, bias, keywords, sources }

// Synchronized countdown timer (30 seconds for posting phase - TESTING)
let countdownTime = 30; // seconds
let countdownInterval = null;

// Global experience state for mobile sync
let currentExperienceState = {
    phase: 'idle', // idle, posting, clustering, voting, reveal, roles, debate, winner
    data: null // Phase-specific data (clusters, roles, debate info, etc.)
};

// WORLD CLOCK - Tracks timing for all animations and phases
let worldClock = {
    // Animation start times (timestamps)
    clusteringAnimationStart: null,
    roleAssignmentAnimationStart: null,
    topicRevealAnimationStart: null,
    debateOverAnimationStart: null,
    
    // Timer values (seconds remaining)
    votingTimeRemaining: null,
    debateTimeRemaining: null,
    
    // Phase durations (in seconds, for calculating progress)
    clusteringAnimationDuration: 10, // Example: clustering takes 10s
    roleAssignmentAnimationDuration: 6, // Role assignment animation is 6s
    topicRevealAnimationDuration: 8, // Topic reveal animation
    debateOverAnimationDuration: 15, // Post-debate animations
    
    // Get elapsed time since animation started
    getElapsedTime: function(animationName) {
        const startTime = this[animationName + 'Start'];
        if (!startTime) return 0;
        return (Date.now() - startTime) / 1000; // Convert to seconds
    },
    
    // Get animation progress (0 to 1)
    getProgress: function(animationName) {
        const elapsed = this.getElapsedTime(animationName);
        const duration = this[animationName + 'Duration'];
        return Math.min(elapsed / duration, 1);
    }
};

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
    
    console.log('Countdown timer started (30 seconds)');
}

function resetCountdownTimer() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    countdownTime = 30;
    console.log('⏸️  Timer ready - waiting for Start button...');
}

wss.on('connection', (ws) => {
    console.log('New client connected');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            // Debug: Log all display messages
            if (data.type && data.type.includes('display')) {
                console.log(`📨 Received from display: ${data.type}`);
            }
            
            // Handle display_loaded FIRST, before any registration
            if (data.type === 'display_loaded') {
                // Main display has loaded/refreshed - reset global state and sync all mobiles
                console.log('🔄 Main display loaded/refreshed - resetting global state');
                
                // Reset to idle state
                currentExperienceState.phase = 'idle';
                currentExperienceState.data = null;
                
                // Clear any ongoing timers/state
                if (countdownInterval) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                }
                
                // Reset vote counts
                debateVotes.red = 0;
                debateVotes.green = 0;
                clientDebateVotes.clear();
                clientHoldState.clear();
                
                // Clear role assignments
                clientRoles.clear();
                debaterReadyState.clear();
                
                console.log('📱 Broadcasting state reset to all mobile controllers');
                
                // Broadcast reset state to all mobile clients
                mobileClients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'state_sync',
                            phase: 'idle',
                            data: null
                        }));
                    }
                });
                
                return;
            }
            
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
                
                // Send current experience state for sync on refresh
                console.log(`📤 Sending state sync to display: phase=${currentExperienceState.phase}`);
                
                // Build timing data based on current phase
                const timingData = {
                    votingTimeRemaining: worldClock.votingTimeRemaining,
                    debateTimeRemaining: worldClock.debateTimeRemaining,
                    clusteringProgress: worldClock.getProgress('clusteringAnimation'),
                    roleAssignmentProgress: worldClock.getProgress('roleAssignmentAnimation'),
                    topicRevealProgress: worldClock.getProgress('topicRevealAnimation'),
                    debateOverProgress: worldClock.getProgress('debateOverAnimation')
                };
                
                ws.send(JSON.stringify({
                    type: 'state_sync',
                    phase: currentExperienceState.phase,
                    data: currentExperienceState.data,
                    timing: timingData
                }));
                
                approvedPosts.forEach(post => {
                    ws.send(JSON.stringify(post));
                });
                return;
            }
            
            if (data.type === 'register_mobile') {
                let clientId;
                let sessionId = data.sessionId;
                let isReconnect = false;
                
                // Check if this is a reconnect (has existing session ID)
                if (sessionId) {
                    // Check if this sessionId has a role assignment (means it's a reconnect)
                    const hasRole = clientRoles.has(sessionId);
                    
                    if (hasRole) {
                        // This is a reconnect - assign new client ID but keep session ID
                        clientId = nextClientId++;
                        isReconnect = true;
                        console.log(`🔄 Client reconnected with session ${sessionId}, assigned new ID ${clientId}`);
                    } else {
                        // Session ID provided but no role found - treat as new client
                        clientId = nextClientId++;
                        console.log(`⚠️ Session ${sessionId} has no role, treating as new client ID ${clientId}`);
                    }
                } else {
                    // New client, assign new ID and session ID
                    clientId = nextClientId++;
                    sessionId = `session_${clientId}_${Date.now()}`;
                    console.log(`✨ New client, assigned ID ${clientId} and session ${sessionId}`);
                }
                
                ws.clientId = clientId;
                ws.sessionId = sessionId;
                mobileClients.set(clientId, ws);
                
                // Send client ID and session ID back to mobile
                ws.send(JSON.stringify({
                    type: 'client_id',
                    clientId: clientId,
                    sessionId: sessionId
                }));
                
                // Get user's role if they have one (using sessionId so it persists across reconnects)
                const roleInfo = clientRoles.get(sessionId);
                let stateData = { ...currentExperienceState.data };
                
                // If in roles or debate phase and user has a role, include it in state sync
                if (roleInfo && (currentExperienceState.phase === 'roles' || currentExperienceState.phase === 'debate')) {
                    stateData.role = roleInfo.role;
                    stateData.group = roleInfo.group;
                    stateData.stance = roleInfo.stance;
                    console.log(`📱 Sending role info to client ${clientId} (session ${sessionId}): ${roleInfo.role}${roleInfo.group ? ` (Group ${roleInfo.group})` : ''}`);
                    console.log(`   📝 Topic: ${stateData.clusterName || 'N/A'}, Argument: ${stateData.debateArgument || 'N/A'}`);
                }
                
                // Send current experience state for sync
                const timingData = {
                    votingTimeRemaining: worldClock.votingTimeRemaining,
                    debateTimeRemaining: worldClock.debateTimeRemaining,
                    clusteringProgress: worldClock.getProgress('clusteringAnimation'),
                    roleAssignmentProgress: worldClock.getProgress('roleAssignmentAnimation'),
                    topicRevealProgress: worldClock.getProgress('topicRevealAnimation'),
                    debateOverProgress: worldClock.getProgress('debateOverAnimation')
                };
                
                ws.send(JSON.stringify({
                    type: 'state_sync',
                    phase: currentExperienceState.phase,
                    data: stateData,
                    timing: timingData
                }));
                
                console.log(`Mobile client registered with ID: ${clientId}`);
                console.log(`📱 Sent current state: ${currentExperienceState.phase}`);
                
                // Broadcast updated participant count to everyone
                broadcastToAll({ type: 'participant_count', count: mobileClients.size, max: CONFIG.MAX_PARTICIPANTS });
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
            
            if (data.type === 'experience_start') {
                // Start experience - start the countdown timer
                startCountdownTimer();
                console.log('🎬 Experience started - countdown timer started');
                
                // Update global state
                currentExperienceState.phase = 'posting';
                currentExperienceState.data = { countdownTime };
                
                // Broadcast to all clients (mobile and display)
                broadcastToAll({
                    type: 'experience_start'
                });
                return;
            }
            
            if (data.type === 'end_experience') {
                // Experience ended — full reset, return to idle
                if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
                resetCountdownTimer();
                
                // Clear posts and votes for next run
                approvedPosts = [];
                clusterVotes.clear();
                clientClusterVotes.clear();
                
                console.log('🏁 Experience ended — full reset, returning to idle');
                
                // Update global state
                currentExperienceState.phase = 'idle';
                currentExperienceState.data = null;
                
                // Broadcast end + clear to all clients
                broadcastToAll({ type: 'end_experience' });
                broadcastToAll({ type: 'clear_all_posts' });
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
                const previousVote = data.previousVote;
                
                console.log(`📊 Vote request: Client ${votingClientId}, New: ${clusterId}, Previous: ${previousVote}`);
                
                // Handle vote switching - remove from previous cluster
                if (previousVote && String(previousVote) !== String(clusterId)) {
                    const prevVotes = clusterVotes.get(String(previousVote)) || 0;
                    if (prevVotes > 0) {
                        clusterVotes.set(String(previousVote), prevVotes - 1);
                        console.log(`🔄 Removed vote from cluster ${previousVote} (now has ${prevVotes - 1} votes)`);
                    }
                }
                
                // Handle toggle off (clusterId is null)
                if (clusterId === null || clusterId === 'null') {
                    clientClusterVotes.delete(votingClientId);
                    console.log(`❌ Client ${votingClientId} removed their vote`);
                } else {
                    // Find cluster label for logging
                    const cluster = currentClusters.find(c => String(c.id) === String(clusterId));
                    const clusterLabel = cluster ? cluster.label : 'Unknown';
                    
                    // Record new vote
                    clientClusterVotes.set(votingClientId, String(clusterId));
                    const currentVotes = clusterVotes.get(String(clusterId)) || 0;
                    clusterVotes.set(String(clusterId), currentVotes + 1);
                    
                    console.log(`✅ Vote recorded for cluster ${clusterId} "${clusterLabel}" (now has ${currentVotes + 1} votes)`);
                }
                
                // Log all current votes
                console.log('📊 Current vote totals:');
                currentClusters.forEach(cluster => {
                    const votes = clusterVotes.get(String(cluster.id)) || 0;
                    console.log(`   ${cluster.label}: ${votes} votes`);
                });
                
                // Broadcast all vote counts to all clients
                const allVotes = {};
                currentClusters.forEach(cluster => {
                    allVotes[String(cluster.id)] = clusterVotes.get(String(cluster.id)) || 0;
                });
                
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'cluster_vote_update',
                            votes: allVotes
                        }));
                    }
                });
                
                return;
            }
            
            if (data.type === 'start_debate_voting') {
                // Update global state
                currentExperienceState.phase = 'debate';
                currentExperienceState.data = {};
                
                // Set world clock for debate timer (30 seconds)
                worldClock.debateTimeRemaining = 30;
                console.log('⏱️ World clock: Debate timer started at 30s');
                
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
                // Update world clock with current debate time
                if (data.turnTimeRemaining !== undefined) {
                    worldClock.debateTimeRemaining = data.turnTimeRemaining;
                }
                
                // Check if debate is over and update phase
                if (data.debateOver && currentExperienceState.phase !== 'debate-over') {
                    currentExperienceState.phase = 'debate-over';
                    worldClock.debateOverAnimationStart = Date.now();
                    console.log('🏁 Debate over! Phase updated to debate-over');
                    console.log('⏱️ World clock: Debate over animation started');
                }
                
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
            
            if (data.type === 'winner_announcement') {
                currentExperienceState.phase = 'winner';
                currentExperienceState.data = { winnerGroup: data.winnerGroup };
                console.log(`🏆 Winner announcement: Group ${data.winnerGroup} — broadcasting to mobiles`);
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'winner_announcement',
                            winnerGroup: data.winnerGroup
                        }));
                    }
                });
                return;
            }

            if (data.type === 'skip_to_reveal') {
                // Set world clock animation start time
                worldClock.topicRevealAnimationStart = Date.now();
                console.log('⏱️ World clock: Topic reveal animation started');
                
                // Update global state
                currentExperienceState.phase = 'reveal';
                currentExperienceState.data = { cluster: data.cluster };
                
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
            
            if (data.type === 'start_role_assignment_animation') {
                // Set world clock animation start time
                worldClock.roleAssignmentAnimationStart = Date.now();
                console.log('⏱️ World clock: Role assignment animation started');
                
                // Broadcast to all mobile clients to start loading animation
                console.log('🎬 Broadcasting start role assignment animation to mobile clients');
                mobileClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'start_role_assignment_animation'
                        }));
                    }
                });
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
                
                // Random role assignment: 25% Group 1, 25% Group 2, 50% Listeners
                clientRoles.clear();
                debaterReadyState.clear();
                
                const totalClients = clientIds.length;
                const group1Count = Math.round(totalClients * 0.25);
                const group2Count = Math.round(totalClients * 0.25);
                const listenerCount = totalClients - group1Count - group2Count;
                
                // Build shuffled role pool
                const rolePool = [
                    ...Array(group1Count).fill({ role: 'debater', group: 1, stance: 'Against' }),
                    ...Array(group2Count).fill({ role: 'debater', group: 2, stance: 'For' }),
                    ...Array(listenerCount).fill({ role: 'listener', group: null, stance: null })
                ];
                // Fisher-Yates shuffle
                for (let i = rolePool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]];
                }
                
                let group1Assigned = 0, group2Assigned = 0, listenersAssigned = 0;
                
                console.log(`🎭 Assigning roles to ${totalClients} clients: ${group1Count} G1, ${group2Count} G2, ${listenerCount} Listeners`);
                
                for (let i = 0; i < clientIds.length; i++) {
                    const id = clientIds[i];
                    const { role, group, stance } = rolePool[i];
                    
                    if (role === 'debater' && group === 1) group1Assigned++;
                    else if (role === 'debater' && group === 2) group2Assigned++;
                    else listenersAssigned++;
                    
                    const client = mobileClients.get(id);
                    
                    // Store role and ready state by sessionId so it persists across reconnects
                    if (client && client.sessionId) {
                        clientRoles.set(client.sessionId, { role, group, stance });
                        if (role === 'debater') {
                            debaterReadyState.set(client.sessionId, false);
                        }
                    }
                    
                    if (client && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'role_assignment',
                            role: role,
                            group: group,
                            stance: stance,
                            clusterName: clusterName,
                            clusterColor: clusterColor,
                            debateArgument: debateArgument
                        }));
                        console.log(`   ✅ Client ${id}: ${role}${group ? ` (Group ${group} - ${stance})` : ''}`);
                    }
                }
                
                // Update global state
                currentExperienceState.phase = 'roles';
                currentExperienceState.data = {
                    clusterName: clusterName,
                    debateArgument: debateArgument
                };
                
                // Broadcast to display clients to trigger role assignment animation
                displayClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'assign_roles'
                        }));
                    }
                });
                
                console.log(`🎭 Role assignment complete: ${group1Assigned} Group 1, ${group2Assigned} Group 2`);
                
                // Broadcast initial debater counts to display (all debaters start as not ready)
                displayClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'debater_ready_update',
                            readyCount: 0,
                            totalDebaters: group1Assigned + group2Assigned,
                            group1Ready: 0,
                            group1Total: group1Assigned,
                            group2Ready: 0,
                            group2Total: group2Assigned
                        }));
                    }
                });
                
                console.log(`📊 Initial debater counts sent: Group 1: 0/${group1Assigned}, Group 2: 0/${group2Assigned}`);
                return;
            }
            
            if (data.type === 'listener_vote') {
                const clientId = ws.clientId;
                const { side, balance } = data;
                
                if (!clientId) return;
                
                console.log(`🗳️ Listener ${clientId} voted ${side}: balance = ${balance}`);
                
                // Track vote counts for final tally
                // Remove previous vote if switching sides
                const previousSide = clientDebateVotes.get(clientId);
                console.log(`   Previous side: ${previousSide}, New side: ${side}`);
                
                if (previousSide && previousSide !== side) {
                    debateVotes[previousSide] = Math.max(0, debateVotes[previousSide] - 1);
                    console.log(`   Removed vote from ${previousSide}`);
                }
                
                // Add vote to new side if not already voting for it
                if (previousSide !== side) {
                    debateVotes[side]++;
                    clientDebateVotes.set(clientId, side);
                    console.log(`   Added vote to ${side}`);
                }
                
                console.log(`📊 Vote totals - Red: ${debateVotes.red}, Green: ${debateVotes.green}`);
                
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
                
                // Also broadcast total vote counts
                displayClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'debate_vote_update',
                            red: debateVotes.red,
                            green: debateVotes.green,
                            redHolds: 0,
                            greenHolds: 0
                        }));
                    }
                });
                
                return;
            }
            
            if (data.type === 'force_role_override') {
                const sessionId = ws.sessionId;
                if (!sessionId) return;
                clientRoles.set(sessionId, { role: data.role, group: data.group });
                console.log(`🛠️ Server force_role_override: session ${sessionId} → ${data.role} group ${data.group}`);
                return;
            }
            
            if (data.type === 'user_ready' || data.type === 'debater_ready') {
                const sessionId = ws.sessionId;
                if (!sessionId) return;
                
                // Mark user as ready (using sessionId so it persists across reconnects)
                debaterReadyState.set(sessionId, true);
                
                // Count ready users per group (only debaters, not listeners)
                let readyCount = 0;
                let totalDebaters = 0;
                let group1Ready = 0;
                let group1Total = 0;
                let group2Ready = 0;
                let group2Total = 0;
                
                // clientRoles now uses sessionId as key
                clientRoles.forEach((roleInfo, sessionId) => {
                    // Only count debaters
                    if (roleInfo.role === 'debater') {
                        totalDebaters++;
                        const isReady = debaterReadyState.get(sessionId);
                        if (isReady) {
                            readyCount++;
                        }
                        
                        // Count per group
                        if (roleInfo.group === 1) {
                            group1Total++;
                            if (isReady) group1Ready++;
                        } else if (roleInfo.group === 2) {
                            group2Total++;
                            if (isReady) group2Ready++;
                        }
                    }
                });
                
                console.log(`✅ User ready: ${readyCount}/${totalDebaters} (Group 1: ${group1Ready}/${group1Total}, Group 2: ${group2Ready}/${group2Total})`);
                
                // Broadcast ready count to all displays
                displayClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'debater_ready_update',
                            readyCount: readyCount,
                            totalDebaters: totalDebaters,
                            group1Ready: group1Ready,
                            group1Total: group1Total,
                            group2Ready: group2Ready,
                            group2Total: group2Total
                        }));
                    }
                });
                
                // Also broadcast to mobile clients (for listener UI counters)
                mobileClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'debater_ready_update',
                            readyCount: readyCount,
                            totalDebaters: totalDebaters,
                            group1Ready: group1Ready,
                            group1Total: group1Total,
                            group2Ready: group2Ready,
                            group2Total: group2Total
                        }));
                    }
                });
                
                // If all debaters are ready, start debate voting
                if (readyCount === totalDebaters && totalDebaters > 0) {
                    console.log('🎤 All users ready! Starting debate voting...');
                    
                    // Reset debate vote counts for new debate
                    debateVotes.red = 0;
                    debateVotes.green = 0;
                    clientDebateVotes.clear();
                    clientHoldState.clear();
                    console.log('🔄 Debate votes reset');
                    
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
                
                // Broadcast actual vote counts AND active holds to all displays
                displayClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'debate_vote_update',
                            red: debateVotes.red,           // Total votes for Group 1
                            green: debateVotes.green,       // Total votes for Group 2
                            redHolds: redActiveHolds,       // Currently holding Group 1 button
                            greenHolds: greenActiveHolds    // Currently holding Group 2 button
                        }));
                    }
                });
                
                console.log(`📊 Debate votes - Red: ${debateVotes.red}, Green: ${debateVotes.green} (Active holds - Red: ${redActiveHolds}, Green: ${greenActiveHolds})`);
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
                
                // Clear all previous votes when new clusters are set
                clusterVotes.clear();
                clientClusterVotes.clear();
                
                // Initialize vote counts for new clusters
                currentClusters.forEach(cluster => {
                    clusterVotes.set(String(cluster.id), 0);
                });
                
                console.log('🔄 Clusters updated, votes cleared. New clusters:', currentClusters.map(c => `${c.id}:"${c.label}"`).join(', '));
                
                // Update global state
                currentExperienceState.phase = 'voting';
                currentExperienceState.data = { clusters: data.clusters };
                
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
                    const votes = clusterVotes.get(String(cluster.id)) || 0;
                    console.log(`      Cluster ${cluster.id} "${cluster.label}": ${votes} votes`);
                });
                
                let winningCluster = null;
                let maxVotes = 0;
                
                currentClusters.forEach(cluster => {
                    const votes = clusterVotes.get(String(cluster.id)) || 0;
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
            // Broadcast updated participant count to all remaining clients
            broadcastToAll({ type: 'participant_count', count: mobileClients.size, max: CONFIG.MAX_PARTICIPANTS });
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
    
    // Participant count endpoint - for ELO GUI live counter
    if (req.url === '/api/participants' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ count: mobileClients.size }));
        return;
    }
    
    // Start experience endpoint - allows ELO GUI button to start experience directly
    if (req.url === '/api/start-experience' && req.method === 'POST') {
        startCountdownTimer();
        currentExperienceState.phase = 'posting';
        currentExperienceState.data = { countdownTime };
        broadcastToAll({ type: 'experience_start' });
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ ok: true }));
        console.log('🎬 ELO GUI triggered start — countdown started, broadcasting experience_start');
        return;
    }

    // End experience endpoint - allows ELO GUI button to trigger end on main display
    if (req.url === '/api/end-experience' && req.method === 'POST') {
        broadcastToDisplays({ type: 'end_experience' });
        currentExperienceState = { phase: 'idle', data: null };
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ ok: true }));
        console.log('🔚 ELO GUI triggered end experience');
        return;
    }

    // State endpoint - for ELO GUI phase polling
    if (req.url === '/api/state' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ state: currentExperienceState.phase }));
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

server.listen(HTTP_PORT, '0.0.0.0', async () => {
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
    
    // Don't auto-start timer - wait for Start button press
    console.log('⏸️  Timer ready - waiting for Start button...\n');
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);
