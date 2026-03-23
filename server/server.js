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
const approvedPosts = [];
const rateLimitMap = new Map();

// Role assignment
let nextClientId = 1;
const clientRoles = new Map(); // clientId -> 'debater' | 'listener'

// Voting system data structures
const postVotes = new Map(); // postId -> { upvotes: 0, downvotes: 0, voters: Set() }
const userVotes = new Map(); // userId -> [{ postId, vote, timestamp }]
const userPreferences = new Map(); // userId -> { topics, bias, keywords, sources }

// Synchronized countdown timer (2 minutes)
let countdownTime = 120; // seconds
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
    
    countdownTime = 120; // Reset to 2 minutes
    
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
    
    console.log('Countdown timer started (2 minutes)');
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
                // Track cluster votes
                const clusterId = data.clusterId;
                
                // Broadcast vote to all clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'cluster_vote_update',
                            clusterId: clusterId
                        }));
                    }
                });
                
                console.log(`Vote recorded for cluster ${clusterId}`);
                return;
            }
            
            if (data.type === 'debate_vote') {
                // Broadcast debate vote to all clients (including main display)
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'debate_vote',
                            color: data.color
                        }));
                    }
                });
                
                console.log(`🎤 Debate vote: ${data.color}`);
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
                // Randomly select 2 debaters from all connected mobile clients
                const clientIds = Array.from(mobileClients.keys());
                
                if (clientIds.length < 2) {
                    console.log('⚠️ Not enough mobile clients for role assignment (need at least 2)');
                    return;
                }
                
                // Shuffle and pick first 2 as debaters
                const shuffled = clientIds.sort(() => Math.random() - 0.5);
                const debaterIds = shuffled.slice(0, 2);
                
                // Assign roles
                clientRoles.clear();
                clientIds.forEach(id => {
                    const role = debaterIds.includes(id) ? 'debater' : 'listener';
                    clientRoles.set(id, role);
                    
                    // Send role to client
                    const client = mobileClients.get(id);
                    if (client && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'role_assignment',
                            role: role
                        }));
                    }
                });
                
                console.log(`🎭 Roles assigned: ${debaterIds.length} debaters, ${clientIds.length - debaterIds.length} listeners`);
                return;
            }
            
            if (data.type === 'update_clusters') {
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
    let filePath = path.join(__dirname, '..', req.url);
    if (req.url === '/') {
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
