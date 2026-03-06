// Main entry point for the visualization application
// This file orchestrates all components and manages the application lifecycle

import NLPEngine from './components/NLPEngine.js';
import KMeansClustering from './components/KMeansClustering.js';
import Node from './components/Node.js';
import MetaballRenderer from './components/MetaballRenderer.js';
import { connectWebSocket } from './utils/websocket.js';
import { 
    logActivity, 
    updateConceptNetPanel, 
    updateAPIStatus,
    setupMonitorToggle,
    setupDatabaseSelector 
} from './utils/ui-helpers.js';
import { recalculateSimilarities } from './utils/similarity.js';

// Global state
const posts = [];
const nodes = [];
const connections = [];
let clusters = [];
let numClusters = 5;
let connectionCache = new Map();
let clusterLabels = [];

// API monitoring
let currentDatabase = 'transformer';
let apiCallCount = 0;
let cacheHitCount = 0;
let apiResponseTimes = [];

// Initialize components
const nlp = new NLPEngine();
const kmeans = new KMeansClustering(numClusters);
const metaballRenderer = new MetaballRenderer();

// WebSocket connection
let ws;

// p5.js setup
function setup() {
    console.log('p5.js setup starting...');
    createCanvas(windowWidth, windowHeight);
    colorMode(HSB, 360, 100, 100, 255);
    
    setupMonitorToggle();
    setupDatabaseSelector((db) => {
        currentDatabase = db;
        connectionCache.clear();
        recalculateSimilarities(nodes, connectionCache, currentDatabase, updateAPIStatus, logActivity);
    });
    
    ws = connectWebSocket(addPost, clearAllPosts);
    
    console.log('Setup complete');
}

// p5.js draw loop
function draw() {
    try {
        background(0);
        
        // Update physics
        nodes.forEach(node => node.update(nodes, connectionCache));
        
        // Draw metaballs
        metaballRenderer.drawClusterMetaballs(nodes, connectionCache);
        
        // Update UI
        updateConceptNetPanel(apiCallCount, cacheHitCount, apiResponseTimes, nodes.length, currentDatabase);
    } catch (error) {
        console.error('Draw error:', error);
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function addPost(content, timestamp) {
    console.log('Adding post:', content);
    const node = new Node(content, timestamp, width, height, nlp);
    nodes.push(node);
    posts.push({ content, timestamp });
    
    nlp.updateDocumentFrequency(posts.map(p => p.content));
    
    recalculateSimilarities(nodes, connectionCache, currentDatabase, updateAPIStatus, logActivity).then(() => {
        const assignments = kmeans.cluster(nodes, connectionCache);
        
        nodes.forEach((node, i) => {
            node.cluster = assignments[i];
            node.clusterColor = kmeans.clusterColors[assignments[i]];
        });
        
        generateClusterLabels();
        
        if (ws && ws.readyState === WebSocket.OPEN && node.cluster !== undefined) {
            ws.send(JSON.stringify({
                type: 'cluster_info',
                content: content,
                cluster: node.cluster,
                clusterLabel: clusterLabels[node.cluster] || 'Cluster ' + node.cluster,
                clusterSize: nodes.filter(n => n.cluster === node.cluster).length,
                otherPosts: nodes.filter(n => n.cluster === node.cluster && n !== node)
                    .slice(0, 3)
                    .map(n => n.content.substring(0, 50))
            }));
        }
    });
}

function clearAllPosts() {
    nodes.length = 0;
    posts.length = 0;
}

function generateClusterLabels() {
    clusterLabels = [];
    
    for (let c = 0; c < numClusters; c++) {
        const clusterNodes = nodes.filter(n => n.cluster === c);
        
        if (clusterNodes.length === 0) {
            clusterLabels.push(`Cluster ${c}`);
            continue;
        }
        
        const keywordFreq = new Map();
        clusterNodes.forEach(node => {
            if (node.keywords) {
                node.keywords.forEach(keyword => {
                    keywordFreq.set(keyword, (keywordFreq.get(keyword) || 0) + 1);
                });
            }
        });
        
        const topKeywords = Array.from(keywordFreq.entries())
            .filter(([_, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
        
        if (topKeywords.length > 0) {
            clusterLabels.push(topKeywords.join(' & '));
        } else {
            clusterLabels.push(`Cluster ${c}`);
        }
    }
    
    logActivity(`📊 Generated ${numClusters} cluster labels`, 'cluster');
}

// Export for p5.js global mode
window.setup = setup;
window.draw = draw;
window.windowResized = windowResized;

// Export state for debugging
window.appState = {
    nodes,
    posts,
    connectionCache,
    clusterLabels
};
