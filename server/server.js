require('dotenv').config();

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode'); // For generating QR code images
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
const pendingPosts = [];
const approvedPosts = [];
const rateLimitMap = new Map();

// Initialize ConceptNet client for semantic understanding
const conceptNet = new ConceptNetClient();
console.log('ConceptNet client initialized');

// Initialize NewsAPI client
const NEWSAPI_KEY = process.env.NEWSAPI_KEY || 'YOUR_API_KEY_HERE';
const newsAPI = new NewsAPIClient(NEWSAPI_KEY);
let currentHeadline = 'What are your thoughts on current events?';

// Fetch initial headline
(async () => {
    currentHeadline = await newsAPI.getTopHeadline('general', 'us');
    console.log('Current headline:', currentHeadline);
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
                    headline: currentHeadline,
                    timestamp: Date.now()
                }));
                
                approvedPosts.forEach(post => {
                    ws.send(JSON.stringify(post));
                });
                return;
            }
            
            if (data.type === 'request_headline') {
                ws.send(JSON.stringify({
                    type: 'headline',
                    headline: currentHeadline,
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
                        headline: currentHeadline,
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
                        headline: currentHeadline,
                        timestamp: Date.now()
                    });
                })();
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
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './mobile.html';
    }
    
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
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
    
    const mobileUrl = `http://${localIP}:${HTTP_PORT}/client/pages/mobile.html`;
    mobileControllerUrl = mobileUrl;
    
    // Generate QR code as data URL
    try {
        qrCodeDataURL = await QRCode.toDataURL(mobileUrl, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            },
            errorCorrectionLevel: 'H'
        });
        console.log('QR code generated successfully');
    } catch (err) {
        console.error('Failed to generate QR code:', err);
    }
    
    console.log('\n=================================');
    console.log('Server running!');
    console.log('=================================');
    console.log(`WebSocket server: ws://localhost:${PORT}`);
    console.log(`HTTP server: http://localhost:${HTTP_PORT}`);
    console.log(`Network IP: ${localIP}`);
    console.log(`\nMobile controller URL: ${mobileUrl}`);
    console.log(`QR code endpoint: http://localhost:${HTTP_PORT}/api/qr-code`);
    console.log('\nScan this QR code with your phone:');
    console.log('=================================\n');
    
    qrcode.generate(mobileUrl, { small: true });
    
    console.log('\n=================================');
    console.log('Open http://localhost:${HTTP_PORT}/client/pages/index.html');
    console.log('=================================\n');
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);
