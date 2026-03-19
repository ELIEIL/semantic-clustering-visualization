let ws;
const posts = [];
const nodes = [];
const connections = [];
let clusters = [];
let numClusters = 4; // Fewer clusters = broader thematic topics (reduced for pedagogical experience)
let connectionCache = new Map(); // Cache for similarity calculations

// Visualization mode
let visualizationMode = 'nodes'; // 'metaball', 'metaball2', 'metaball3', 'hybrid', 'nodes', 'bubbles', or 'outline'
window.visualizationMode = visualizationMode; // Make globally accessible

// Social Media Algorithm Parameters (toggleable) - enabled by default
let enableVisualProminence = true;
let enableControversy = true;
let enableTrending = true;
let enableBridgeDetection = true;
let enableRealtimeClustering = false; // Keep this off for now

// Clustering control - for pedagogical experience
let clusteringEnabled = false; // Clustering happens only when timer reaches 00:00
let timerCompleted = false;

// Tracking for trending detection
let clusterSizeHistory = new Map(); // Track cluster sizes over time
let lastClusterUpdate = Date.now();

// ConceptNet API monitoring
let currentDatabase = 'transformer';
let apiCallCount = 0;
let cacheHitCount = 0;
let apiResponseTimes = [];
let apiCallLog = [];
let similarityComparisons = [];

// Update ConceptNet API Monitor Panel
function updateConceptNetPanel() {
    // Update current database display
    const currentDbDisplay = document.getElementById('currentDbDisplay');
    if (currentDbDisplay) {
        const dbNames = {
            'tfidf': 'TF-IDF',
            'transformer': 'Transformer',
            'conceptnet': 'ConceptNet',
            'wordnet': 'WordNet',
            'word2vec': 'Word2Vec'
        };
        currentDbDisplay.textContent = dbNames[currentDatabase] || 'Unknown';
        currentDbDisplay.style.color = (currentDatabase === 'transformer' || currentDatabase === 'conceptnet') ? '#4CAF50' : '#FF9800';
    }
    
    // Update API stats
    const apiCallCountEl = document.getElementById('apiCallCount');
    const cacheHitsEl = document.getElementById('cacheHits');
    const avgResponseTimeEl = document.getElementById('avgResponseTime');
    const postCountEl = document.getElementById('postCount');
    
    if (apiCallCountEl) apiCallCountEl.textContent = apiCallCount;
    if (cacheHitsEl) cacheHitsEl.textContent = cacheHitCount;
    if (postCountEl) postCountEl.textContent = nodes.length;
    
    const avgTime = apiResponseTimes.length > 0 
        ? (apiResponseTimes.reduce((a, b) => a + b, 0) / apiResponseTimes.length).toFixed(0)
        : 0;
    if (avgResponseTimeEl) avgResponseTimeEl.textContent = avgTime + 'ms';
}

// Update API status indicator
function updateAPIStatus(status) {
    const apiStatusEl = document.getElementById('apiStatus');
    if (!apiStatusEl) return;
    
    switch(status) {
        case 'fetching':
            apiStatusEl.textContent = '● Fetching...';
            apiStatusEl.style.color = '#FF9800';
            break;
        case 'success':
            apiStatusEl.textContent = '● Active';
            apiStatusEl.style.color = '#4CAF50';
            setTimeout(() => {
                if (apiStatusEl.textContent === '● Active') {
                    apiStatusEl.textContent = '● Idle';
                    apiStatusEl.style.color = '#4CAF50';
                }
            }, 1000);
            break;
        case 'error':
            apiStatusEl.textContent = '● Error';
            apiStatusEl.style.color = '#F44336';
            break;
        default:
            apiStatusEl.textContent = '● Idle';
            apiStatusEl.style.color = '#4CAF50';
    }
}

// NLP Utilities
class NLPEngine {
    constructor() {
        this.stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in', 'with', 'to', 'for', 'of', 'as', 'by', 'this', 'that', 'these', 'those', 'am', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'can']);
        this.documentFrequency = new Map();
        this.totalDocuments = 0;
    }
    
    // Simple stemmer (Porter-like)
    stem(word) {
        // Remove common suffixes
        word = word.replace(/ing$/, '');
        word = word.replace(/ed$/, '');
        word = word.replace(/es$/, '');
        word = word.replace(/s$/, '');
        word = word.replace(/ly$/, '');
        word = word.replace(/tion$/, '');
        word = word.replace(/ness$/, '');
        return word;
    }
    
    // Tokenize and normalize text
    tokenize(text) {
        return text.toLowerCase()
            .replace(/[^a-zæøå\s]/g, ' ') // Keep Norwegian characters
            .split(/\s+/)
            .filter(w => w.length > 2 && !this.stopWords.has(w))
            .map(w => this.stem(w));
    }
    
    // Calculate TF (Term Frequency)
    calculateTF(tokens) {
        const tf = new Map();
        const total = tokens.length;
        
        tokens.forEach(token => {
            tf.set(token, (tf.get(token) || 0) + 1);
        });
        
        // Normalize by document length
        tf.forEach((count, token) => {
            tf.set(token, count / total);
        });
        
        return tf;
    }
    
    // Update document frequency for IDF calculation
    updateDocumentFrequency(tokens) {
        const uniqueTokens = new Set(tokens);
        uniqueTokens.forEach(token => {
            this.documentFrequency.set(token, (this.documentFrequency.get(token) || 0) + 1);
        });
        this.totalDocuments++;
    }
    
    // Calculate IDF (Inverse Document Frequency)
    calculateIDF(token) {
        const df = this.documentFrequency.get(token) || 0;
        if (df === 0) return 0;
        return Math.log(this.totalDocuments / df);
    }
    
    // Calculate TF-IDF vector
    calculateTFIDF(tokens) {
        const tf = this.calculateTF(tokens);
        const tfidf = new Map();
        
        tf.forEach((tfValue, token) => {
            const idf = this.calculateIDF(token);
            tfidf.set(token, tfValue * idf);
        });
        
        return tfidf;
    }
    
    // Get top N keywords by TF-IDF score
    getTopKeywords(tfidf, n = 10) {
        return Array.from(tfidf.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([word, score]) => ({ word, score }));
    }
}

const nlp = new NLPEngine();

// Global Cluster Registry - Persistent clusters that represent opinion echo chambers
const clusterRegistry = {
    clusters: [],
    nextId: 0,
    
    // Create a new cluster with a topic-based identity
    createCluster(keywords, firstNode) {
        const topicHash = this.hashKeywords(keywords);
        const color = this.getColorFromHash(topicHash);
        
        // Copy embedding or create default if not available
        const centroid = firstNode.embedding && Array.isArray(firstNode.embedding) 
            ? [...firstNode.embedding] 
            : [];
        
        const cluster = {
            id: this.nextId++,
            keywords: keywords,
            topicHash: topicHash,
            color: color,
            nodes: [firstNode],
            centroid: centroid,
            strength: 1 // Echo chamber strength
        };
        
        this.clusters.push(cluster);
        logActivity(`🆕 New opinion cluster formed: "${keywords.slice(0, 3).join(', ')}"`, 'cluster');
        return cluster;
    },
    
    // Find best matching cluster for a new post
    findBestCluster(node, similarityThreshold = 0.5) {
        if (this.clusters.length === 0) return null;
        
        let bestCluster = null;
        let bestSimilarity = 0;
        
        this.clusters.forEach(cluster => {
            const similarity = this.calculateSimilarity(node.embedding, cluster.centroid);
            if (similarity > bestSimilarity && similarity > similarityThreshold) {
                bestSimilarity = similarity;
                bestCluster = cluster;
            }
        });
        
        return { cluster: bestCluster, similarity: bestSimilarity };
    },
    
    // Add node to existing cluster (reinforcement)
    addToCluster(cluster, node) {
        cluster.nodes.push(node);
        cluster.strength += 0.5; // Echo chamber gets stronger
        
        // Update centroid (cluster identity shifts slightly)
        const alpha = 0.1; // Small shift to maintain stability
        cluster.centroid = cluster.centroid.map((val, i) => 
            val * (1 - alpha) + node.embedding[i] * alpha
        );
        
        logActivity(`📈 Opinion reinforced in cluster: "${cluster.keywords.slice(0, 2).join(', ')}"`, 'cluster');
    },
    
    // Calculate cosine similarity between embeddings
    calculateSimilarity(emb1, emb2) {
        if (!emb1 || !emb2 || emb1.length !== emb2.length) return 0;
        
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < emb1.length; i++) {
            dotProduct += emb1[i] * emb2[i];
            norm1 += emb1[i] * emb1[i];
            norm2 += emb2[i] * emb2[i];
        }
        
        if (norm1 === 0 || norm2 === 0) return 0;
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    },
    
    // Hash keywords to generate consistent color
    hashKeywords(keywords) {
        const str = keywords.slice(0, 5).join('').toLowerCase();
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash);
    },
    
    // Generate color from topic hash (stable colors for same topics)
    getColorFromHash(hash) {
        const hue = hash % 360;
        return {
            h: hue,
            s: 70,
            b: 80
        };
    },
    
    // Clean up empty clusters
    pruneEmptyClusters() {
        this.clusters = this.clusters.filter(c => c.nodes.length > 0);
    }
};

// K-means Clustering
class KMeansClustering {
    constructor(k = 3) {
        this.k = k;
        this.centroids = [];
        this.clusterColors = [];
    }
    
    // Initialize centroids using k-means++ for stability
    initializeCentroids(nodes) {
        // Only initialize colors once
        if (this.clusterColors.length === 0) {
            for (let i = 0; i < this.k; i++) {
                this.clusterColors.push({
                    h: (i * 360 / this.k) % 360,
                    s: 70,
                    b: 80
                });
            }
        }
        
        // Use k-means++ initialization for stable centroids
        this.centroids = [];
        
        // First centroid: choose based on content hash (deterministic)
        let firstIdx = 0;
        let maxHash = 0;
        nodes.forEach((node, i) => {
            let hash = 0;
            for (let char of node.content) {
                hash = (hash << 5) - hash + char.charCodeAt(0);
            }
            if (Math.abs(hash) > maxHash) {
                maxHash = Math.abs(hash);
                firstIdx = i;
            }
        });
        this.centroids.push(this.getFeatureVector(nodes[firstIdx]));
        
        // Remaining centroids: choose points far from existing centroids
        while (this.centroids.length < this.k && this.centroids.length < nodes.length) {
            let maxDist = -1;
            let farthestIdx = 0;
            
            nodes.forEach((node, i) => {
                const vec = this.getFeatureVector(node);
                let minDistToCentroid = Infinity;
                
                this.centroids.forEach(centroid => {
                    const dist = this.distance(vec, centroid);
                    minDistToCentroid = Math.min(minDistToCentroid, dist);
                });
                
                if (minDistToCentroid > maxDist) {
                    maxDist = minDistToCentroid;
                    farthestIdx = i;
                }
            });
            
            this.centroids.push(this.getFeatureVector(nodes[farthestIdx]));
        }
    }
    
    // Convert node to feature vector (TF-IDF vector)
    getFeatureVector(node) {
        if (!node.tfidf) return new Map();
        return new Map(node.tfidf);
    }
    
    // Calculate distance between two feature vectors (1 - cosine similarity)
    distance(vec1, vec2) {
        const allTerms = new Set([...vec1.keys(), ...vec2.keys()]);
        
        let dotProduct = 0;
        let mag1 = 0;
        let mag2 = 0;
        
        allTerms.forEach(term => {
            const v1 = vec1.get(term) || 0;
            const v2 = vec2.get(term) || 0;
            dotProduct += v1 * v2;
            mag1 += v1 * v1;
            mag2 += v2 * v2;
        });
        
        mag1 = Math.sqrt(mag1);
        mag2 = Math.sqrt(mag2);
        
        if (mag1 === 0 || mag2 === 0) return 1;
        
        const cosineSim = dotProduct / (mag1 * mag2);
        return 1 - cosineSim; // Convert similarity to distance
    }
    
    // Assign each node to nearest centroid using semantic similarity
    assignClusters(nodes) {
        const assignments = [];
        
        nodes.forEach((node, nodeIdx) => {
            let maxSimilarity = -Infinity;
            let cluster = 0;
            
            // For each cluster, calculate average similarity to nodes in that cluster
            this.centroids.forEach((centroid, clusterIdx) => {
                let totalSim = 0;
                let count = 0;
                
                // Find nodes currently in this cluster
                nodes.forEach((otherNode, otherIdx) => {
                    if (nodeIdx === otherIdx) return;
                    
                    // Use cached semantic similarity if available
                    const key1 = `${nodeIdx}-${otherIdx}`;
                    const key2 = `${otherIdx}-${nodeIdx}`;
                    const similarity = connectionCache.get(key1) || connectionCache.get(key2) || 0;
                    
                    if (similarity > 0) {
                        totalSim += similarity;
                        count++;
                    }
                });
                
                const avgSimilarity = count > 0 ? totalSim / count : 0;
                
                if (avgSimilarity > maxSimilarity) {
                    maxSimilarity = avgSimilarity;
                    cluster = clusterIdx;
                }
            });
            
            // If no good cluster found, assign based on hash for distribution
            if (maxSimilarity === 0) {
                let hash = 0;
                for (let char of node.content) {
                    hash = (hash << 5) - hash + char.charCodeAt(0);
                }
                cluster = Math.abs(hash) % this.k;
            }
            
            assignments.push(cluster);
        });
        
        return assignments;
    }
    
    // Update centroids based on cluster assignments
    updateCentroids(nodes, assignments) {
        const newCentroids = [];
        
        for (let i = 0; i < this.k; i++) {
            const clusterNodes = nodes.filter((_, idx) => assignments[idx] === i);
            
            if (clusterNodes.length === 0) {
                newCentroids.push(this.centroids[i]);
                continue;
            }
            
            // Calculate average feature vector (TF-IDF)
            const allTerms = new Set();
            clusterNodes.forEach(node => {
                if (node.tfidf) {
                    node.tfidf.forEach((_, term) => allTerms.add(term));
                }
            });
            
            const avgVector = new Map();
            allTerms.forEach(term => {
                let sum = 0;
                clusterNodes.forEach(node => {
                    sum += node.tfidf?.get(term) || 0;
                });
                avgVector.set(term, sum / clusterNodes.length);
            });
            
            newCentroids.push(avgVector);
        }
        
        this.centroids = newCentroids;
    }
    
    // Main clustering method
    cluster(nodes) {
        if (nodes.length < this.k) return nodes.map((_, i) => i % this.k);
        
        this.initializeCentroids(nodes);
        
        const maxIterations = 10;
        for (let iter = 0; iter < maxIterations; iter++) {
            const assignments = this.assignClusters(nodes);
            this.updateCentroids(nodes, assignments);
        }
        
        return this.assignClusters(nodes);
    }
}

let isRecalculating = false;
let clusterLabels = []; // Store cluster theme labels
let activityLog = []; // Store algorithm activity for display
const MAX_ACTIVITY_LOG = 50;

// Log algorithm activity to UI
function logActivity(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const colors = {
        'info': '#4CAF50',
        'keyword': '#2196F3',
        'similarity': '#FF9800',
        'cluster': '#9C27B0',
        'api': '#E91E63',
        'metaball': '#00BCD4'
    };
    
    activityLog.unshift({
        time: timestamp,
        message: message,
        color: colors[type] || '#4CAF50'
    });
    
    if (activityLog.length > MAX_ACTIVITY_LOG) {
        activityLog.pop();
    }
    
    updateActivityPanel();
}

function updateActivityPanel() {
    const panel = document.getElementById('activityLog');
    if (!panel) return;
    
    panel.innerHTML = activityLog.map(log => 
        `<div style="margin: 4px 0; padding: 4px 8px; background: rgba(255,255,255,0.05); border-left: 3px solid ${log.color}; border-radius: 3px;">
            <span style="color: #666;">${log.time}</span> 
            <span style="color: ${log.color};">${log.message}</span>
        </div>`
    ).join('');
}

function updateAlgorithmStatus(status) {
    const statusEl = document.getElementById('algorithmStatus');
    if (statusEl) {
        statusEl.textContent = status;
        statusEl.style.color = status === 'Processing...' ? '#FF9800' : '#4CAF50';
    }
}

// Generate cluster labels from keywords
function updateClusterListUI() {
    // Group nodes by cluster
    const clusterGroups = new Map();
    const uncategorizedPosts = [];
    
    nodes.forEach(node => {
        if (node.cluster !== undefined && node.cluster >= 0) {
            if (!clusterGroups.has(node.cluster)) {
                clusterGroups.set(node.cluster, []);
            }
            clusterGroups.get(node.cluster).push(node);
        } else {
            // Posts without cluster assignment
            uncategorizedPosts.push({
                content: node.content,
                timestamp: node.timestamp
            });
        }
    });
    
    // Build cluster data array with posts
    const clusters = [];
    clusterGroups.forEach((clusterNodes, clusterId) => {
        const color = clusterNodes[0].clusterColor || { h: 0, s: 70, b: 80 };
        const label = clusterLabels[clusterId] || `Cluster ${clusterId}`;
        const count = clusterNodes.length;
        
        // Extract post content and timestamps
        const posts = clusterNodes.map(node => ({
            content: node.content,
            timestamp: node.timestamp
        }));
        
        clusters.push({
            id: clusterId,
            label: label,
            count: count,
            color: color,
            posts: posts
        });
    });
    
    // Send cluster data and all posts to server
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('📤 Sending clusters to server:', clusters);
        ws.send(JSON.stringify({
            type: 'update_clusters',
            clusters: clusters,
            uncategorizedPosts: uncategorizedPosts,
            allPosts: posts.map(p => ({ content: p.content, timestamp: p.timestamp }))
        }));
    } else {
        console.log('⚠️ WebSocket not connected, cannot send clusters');
    }
}

function generateClusterLabels() {
    clusterLabels = [];
    
    // Use cluster registry for labels
    clusterRegistry.clusters.forEach(cluster => {
        // Collect all keywords from all nodes in cluster for better topic understanding
        const allKeywords = new Map();
        cluster.nodes.forEach(node => {
            if (node.keywords) {
                node.keywords.forEach(keyword => {
                    allKeywords.set(keyword, (allKeywords.get(keyword) || 0) + 1);
                });
            }
        });
        
        // Sort by frequency and get top keywords
        const sortedKeywords = Array.from(allKeywords.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([word]) => word);
        
        // Generate broader topic label
        if (sortedKeywords.length === 0) {
            clusterLabels[cluster.id] = 'General Discussion';
        } else {
            // Use top 2-3 most common keywords to create broader theme
            const topKeywords = sortedKeywords.slice(0, 2);
            const label = generateBroaderTopicName(topKeywords);
            clusterLabels[cluster.id] = label;
        }
    });
    
    console.log('🏷️ Cluster labels generated:', clusterLabels);
    
    // Merge clusters with duplicate labels to prevent overlapping themes
    mergeDuplicateClusters();
    
    // Log cluster labels
    clusterRegistry.clusters.forEach(cluster => {
        const label = clusterLabels[cluster.id];
        if (label) {
            logActivity(`🏷️ Cluster ${cluster.id}: "${label}" (${cluster.nodes.length} posts, strength: ${cluster.strength.toFixed(1)})`, 'cluster');
        }
    });
}

// Merge clusters that have the same label to prevent duplicate topics
function mergeDuplicateClusters() {
    const labelToCluster = new Map();
    const clustersToRemove = new Set();
    
    // Group clusters by their labels
    clusterRegistry.clusters.forEach(cluster => {
        const label = clusterLabels[cluster.id];
        if (!label) return;
        
        if (labelToCluster.has(label)) {
            // Found duplicate - merge into existing cluster
            const existingCluster = labelToCluster.get(label);
            
            // Transfer all nodes to existing cluster
            cluster.nodes.forEach(node => {
                existingCluster.nodes.push(node);
                node.cluster = existingCluster.id;
                node.clusterColor = existingCluster.color;
            });
            
            // Update centroid (average of embeddings)
            if (cluster.centroid && cluster.centroid.length > 0) {
                if (!existingCluster.centroid || existingCluster.centroid.length === 0) {
                    existingCluster.centroid = [...cluster.centroid];
                } else {
                    // Average the centroids
                    existingCluster.centroid = existingCluster.centroid.map((val, i) => 
                        (val + (cluster.centroid[i] || 0)) / 2
                    );
                }
            }
            
            // Increase strength
            existingCluster.strength += cluster.strength;
            
            // Mark for removal
            clustersToRemove.add(cluster.id);
            
            logActivity(`🔀 Merged duplicate cluster "${label}" (${cluster.nodes.length} posts merged)`, 'cluster');
        } else {
            // First cluster with this label
            labelToCluster.set(label, cluster);
        }
    });
    
    // Remove merged clusters
    if (clustersToRemove.size > 0) {
        clusterRegistry.clusters = clusterRegistry.clusters.filter(c => !clustersToRemove.has(c.id));
        console.log(`✅ Removed ${clustersToRemove.size} duplicate clusters`);
    }
}

// Generate broader, more general topic names from keywords
function generateBroaderTopicName(keywords) {
    // Topic abstraction map - maps specific keywords to broader themes
    const topicMap = {
        // Environment & Climate
        'climate': 'Climate Change and Environment',
        'environment': 'Climate Change and Environment',
        'renewable': 'Climate Change and Environment',
        'carbon': 'Climate Change and Environment',
        'pollution': 'Climate Change and Environment',
        'sustainability': 'Climate Change and Environment',
        'energy': 'Energy and Sustainability',
        'green': 'Climate Change and Environment',
        
        // Politics & Governance
        'politics': 'Politics and Governance',
        'government': 'Politics and Governance',
        'policy': 'Politics and Governance',
        'election': 'Politics and Governance',
        'democracy': 'Politics and Governance',
        'law': 'Politics and Governance',
        'rights': 'Politics and Governance',
        
        // Technology & Innovation
        'technology': 'Technology and Innovation',
        'ai': 'Technology and Innovation',
        'artificial': 'Technology and Innovation',
        'digital': 'Technology and Innovation',
        'internet': 'Technology and Innovation',
        'data': 'Technology and Innovation',
        'privacy': 'Technology and Privacy',
        'cyber': 'Technology and Privacy',
        
        // Economy & Business
        'economy': 'Economy and Business',
        'business': 'Economy and Business',
        'trade': 'Economy and Business',
        'market': 'Economy and Business',
        'finance': 'Economy and Business',
        'jobs': 'Economy and Business',
        'work': 'Work and Employment',
        
        // Society & Culture
        'education': 'Education and Learning',
        'health': 'Health and Wellbeing',
        'healthcare': 'Health and Wellbeing',
        'culture': 'Society and Culture',
        'social': 'Society and Culture',
        'community': 'Society and Culture',
        'immigration': 'Immigration and Society',
        'equality': 'Social Justice and Equality',
        'justice': 'Social Justice and Equality',
        
        // International
        'international': 'International Relations',
        'global': 'International Relations',
        'war': 'International Relations',
        'peace': 'International Relations',
        'conflict': 'International Relations'
    };
    
    // Try to find broader topic from keywords
    for (const keyword of keywords) {
        const lowerKeyword = keyword.toLowerCase();
        for (const [key, topic] of Object.entries(topicMap)) {
            if (lowerKeyword.includes(key) || key.includes(lowerKeyword)) {
                return topic;
            }
        }
    }
    
    // Fallback: capitalize and join keywords
    const capitalized = keywords.map(w => 
        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    );
    
    if (capitalized.length === 1) {
        return capitalized[0] + ' Discussion';
    } else {
        return capitalized.join(' and ');
    }
}

// Recalculate similarities using selected database
async function recalculateSimilarities() {
    if (isRecalculating || nodes.length === 0) {
        console.log('⏭️ Skipping recalculation:', { isRecalculating, nodeCount: nodes.length });
        return;
    }
    isRecalculating = true;
    updateAlgorithmStatus('Processing...');
    
    console.log('🔄 Recalculating similarities with database:', currentDatabase);
    console.log('📊 Node count:', nodes.length);
    
    logActivity(`🔄 Starting similarity calculation for ${nodes.length} posts`, 'info');
    
    try {
        // Clear and rebuild connection cache
        connectionCache.clear();
        
        // Calculate all similarities
        for (let i = 0; i < nodes.length; i++) {
            let totalSim = 0;
            let connCount = 0;
            
            for (let j = i + 1; j < nodes.length; j++) {
                console.log(`Comparing node ${i} with node ${j} using ${currentDatabase}`);
                
                // Use enhanced similarity if ConceptNet is selected
                const similarity = currentDatabase === 'conceptnet' 
                    ? await nodes[i].calculateEnhancedSimilarity(nodes[j], currentDatabase)
                    : nodes[i].calculateSimilarity(nodes[j]);
                
                console.log(`Similarity: ${(similarity * 100).toFixed(1)}%`);
                
                if (similarity > 0.15) { // Lower threshold to show more connections
                    // Store connection in cache
                    const key = `${i}-${j}`;
                    connectionCache.set(key, similarity);
                    
                    totalSim += similarity;
                    connCount++;
                }
            }
            
            // Store average similarity on node
            nodes[i].avgSimilarity = connCount > 0 ? totalSim / connCount : 0;
        }
        
        // INCREMENTAL OPINION CLUSTERING - Only runs when timer completes
        // New posts either join existing echo chambers or create new ones
        
        if (clusteringEnabled && nodes.length >= 1) {
            logActivity(`🎨 Running incremental opinion clustering`, 'cluster');
            
            // First, sync cluster registry with current nodes
            clusterRegistry.clusters.forEach(cluster => {
                cluster.nodes = [];
            });
            
            // Process each node - assign to cluster or create new one
            nodes.forEach((node, i) => {
                // Extract keywords for this post
                const keywords = node.keywords || nlp.extractKeywords(node.content, 5);
                node.keywords = keywords;
                
                // Try to find existing cluster (echo chamber) for this opinion
                const match = clusterRegistry.findBestCluster(node, 0.5);
                
                if (match && match.cluster) {
                    // Join existing echo chamber (reinforcement)
                    clusterRegistry.addToCluster(match.cluster, node);
                    node.cluster = match.cluster.id;
                    node.clusterColor = match.cluster.color;
                } else {
                    // Create new opinion cluster
                    const newCluster = clusterRegistry.createCluster(keywords, node);
                    node.cluster = newCluster.id;
                    node.clusterColor = newCluster.color;
                }
            });
            
            // Clean up empty clusters
            clusterRegistry.pruneEmptyClusters();
            
            // Generate cluster labels based on keywords
            generateClusterLabels();
            
            // Update cluster list UI
            updateClusterListUI();
            
            // Log cluster distribution
            const clusterCounts = {};
            clusterRegistry.clusters.forEach(c => {
                clusterCounts[c.id] = c.nodes.length;
            });
            logActivity(`📊 Opinion clusters: ${Object.entries(clusterCounts).map(([k,v]) => `C${k}:${v}`).join(', ')}`, 'cluster');
            logActivity(`💪 Echo chamber strengths: ${clusterRegistry.clusters.map(c => c.strength.toFixed(1)).join(', ')}`, 'cluster');
            
            // Broadcast cluster data to mobile clients
            if (ws && ws.readyState === WebSocket.OPEN) {
                const clusterData = clusterRegistry.clusters.map(c => ({
                    id: c.id,
                    label: clusterLabels[c.id] || c.keywords.slice(0, 3).join(', '),
                    color: c.color,
                    nodes: c.nodes.map(n => n.content),
                    count: c.nodes.length
                }));
                
                ws.send(JSON.stringify({
                    type: 'clusters',
                    clusters: clusterData
                }));
                
                console.log('📱 Sent cluster data to mobile clients:', clusterData);
            }
        } else if (!clusteringEnabled && nodes.length >= 1) {
            logActivity(`⏳ Clustering delayed - waiting for timer completion`, 'info');
        }
    } catch (error) {
        console.error('Error recalculating similarities:', error);
    } finally {
        isRecalculating = false;
        updateAlgorithmStatus('Ready');
        console.log('✅ Recalculation complete. isRecalculating =', isRecalculating);
        logActivity(`✅ Algorithm processing complete`, 'info');
    }
}

function setupMonitorToggle() {
    const toggleBtn = document.getElementById('toggleMonitor');
    const activityFeed = document.getElementById('activityFeedSection');
    let isExpanded = true;
    
    if (toggleBtn && activityFeed) {
        toggleBtn.addEventListener('click', () => {
            isExpanded = !isExpanded;
            activityFeed.style.display = isExpanded ? 'block' : 'none';
            toggleBtn.textContent = isExpanded ? 'Hide Details' : 'Show Details';
        });
    }
}

function setupDatabaseSelector() {
    const dbToggleBtn = document.getElementById('dbToggleBtn');
    const dbDropdown = document.getElementById('dbDropdown');
    const dbOptions = document.querySelectorAll('.db-option');
    
    if (!dbToggleBtn || !dbDropdown) return;
    
    // Toggle dropdown
    dbToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = dbDropdown.style.display === 'block';
        dbDropdown.style.display = isVisible ? 'none' : 'block';
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        dbDropdown.style.display = 'none';
    });
    
    // Handle database selection
    dbOptions.forEach(option => {
        option.addEventListener('click', async (e) => {
            e.stopPropagation();
            const selectedDb = option.dataset.db;
            
            // Update active state
            dbOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            
            // Update button text
            const dbNames = {
                'tfidf': 'TF-IDF',
                'transformer': 'Transformer',
                'conceptnet': 'ConceptNet',
                'wordnet': 'WordNet',
                'word2vec': 'Word2Vec'
            };
            const dbName = dbNames[selectedDb] || 'Unknown';
            dbToggleBtn.textContent = `📊 Database: ${dbName} ▼`;
            
            // Store selection
            currentDatabase = selectedDb;
            
            // Log selection
            console.log(`Database switched to: ${selectedDb}`);
            if (selectedDb === 'conceptnet') {
                console.log('ConceptNet integration active - recalculating similarities...');
                // Trigger immediate recalculation with new database
                recalculateSimilarities();
            } else {
                console.log('Using TF-IDF only');
                // Recalculate with TF-IDF
                recalculateSimilarities();
            }
            
            // Show notification
            showDatabaseNotification(dbNames[selectedDb]);
            
            // Close dropdown
            dbDropdown.style.display = 'none';
        });
    });
    
    console.log('Database selector initialized (placeholder mode)');
}

function showDatabaseNotification(dbName) {
    // Create temporary notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 30px;
        background: #333;
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 3000;
        font-family: 'Open Sans', sans-serif;
        font-size: 14px;
        animation: slideIn 0.3s ease;
    `;
    const isActive = dbName === 'ConceptNet' || dbName === 'TF-IDF';
    notification.textContent = isActive 
        ? `Database: ${dbName} (Active)`
        : `Database: ${dbName} (Not yet integrated)`;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function drawMetaballFilled() {
    if (nodes.length < 1) return;
    
    // FILLED METABALL RENDERING - Same as original but with fill instead of stroke
    const similarityThreshold = 0.2;
    const metaballRadius = 80; // Original value - good organic blending
    const fieldThreshold = 1.2; // Original threshold
    const resolution = 12; // Original resolution
    
    // Group ALL posts by similarity (including single posts)
    const groups = [];
    const processed = new Set();
    
    nodes.forEach((node, i) => {
        if (processed.has(i)) return;
        
        const group = [i];
        processed.add(i);
        
        for (let j = i + 1; j < nodes.length; j++) {
            if (processed.has(j)) continue;
            
            const key = `${i}-${j}`;
            const similarity = connectionCache.get(key) || 0;
            
            // ONLY group if similarity is above threshold
            if (similarity > similarityThreshold) {
                group.push(j);
                processed.add(j);
            }
        }
        
        // Add ALL groups (even single posts)
        groups.push(group);
    });
    
    // Draw each group as metaballs (posts themselves, not background)
    groups.forEach((group, groupIndex) => {
        const groupNodes = group.map(i => nodes[i]);
        if (groupNodes.length === 0) return;
        
        // Use the cluster color from the first node, or generate unique color per group
        const color = groupNodes[0].clusterColor || {
            h: (groupIndex * 360 / groups.length) % 360,
            s: 70,
            b: 80
        };
        
        // Calculate bounding box
        const minX = Math.min(...groupNodes.map(n => n.x)) - metaballRadius * 2;
        const maxX = Math.max(...groupNodes.map(n => n.x)) + metaballRadius * 2;
        const minY = Math.min(...groupNodes.map(n => n.y)) - metaballRadius * 2;
        const maxY = Math.max(...groupNodes.map(n => n.y)) + metaballRadius * 2;
        
        // Create field strength grid using metaball equation: f = a/r
        const cols = Math.ceil((maxX - minX) / resolution);
        const rows = Math.ceil((maxY - minY) / resolution);
        const field = [];
        
        for (let i = 0; i <= cols; i++) {
            field[i] = [];
            for (let j = 0; j <= rows; j++) {
                const x = minX + i * resolution;
                const y = minY + j * resolution;
                
                // Calculate metaball field from THIS group's nodes
                let strength = 0;
                groupNodes.forEach(node => {
                    const dx = x - node.x;
                    const dy = y - node.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance > 0) {
                        // Metaball equation: f = a / r
                        strength += metaballRadius / distance;
                    } else {
                        strength += 999; // At center
                    }
                });
                
                // BUBBLE PHYSICS: Add influence from ALL other nodes (creates deformation)
                nodes.forEach(otherNode => {
                    if (groupNodes.includes(otherNode)) return;
                    
                    const dx = x - otherNode.x;
                    const dy = y - otherNode.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance > 0 && distance < metaballRadius * 5) {
                        // Other nodes create VERY STRONG negative field (dramatic indentation)
                        const influence = (metaballRadius * 2.5) / distance;
                        strength -= influence * 1.5; // Extremely strong deformation
                    }
                });
                
                field[i][j] = strength;
            }
        }
        
        // Draw metaball shape with FILL instead of stroke
        push();
        fill(255); // White fill
        noStroke(); // No stroke
        
        // Trace contour where field >= threshold
        const contourPoints = [];
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const x = minX + i * resolution;
                const y = minY + j * resolution;
                
                // Check if this cell crosses the threshold
                const tl = field[i][j] >= fieldThreshold;
                const tr = field[i + 1][j] >= fieldThreshold;
                const br = field[i + 1][j + 1] >= fieldThreshold;
                const bl = field[i][j + 1] >= fieldThreshold;
                
                // If any corner is inside, add to contour
                if (tl || tr || br || bl) {
                    contourPoints.push({x: x + resolution/2, y: y + resolution/2});
                }
            }
        }
        
        // Draw smooth metaball shape from contour points
        if (contourPoints.length > 0) {
            beginShape();
            const hull = convexHull(contourPoints);
            const smoothed = smoothHull(hull);
            smoothed.forEach(p => vertex(p.x, p.y));
            endShape(CLOSE);
        }
        
        // Calculate cluster center
        const centerX = groupNodes.reduce((sum, n) => sum + n.x, 0) / groupNodes.length;
        const centerY = groupNodes.reduce((sum, n) => sum + n.y, 0) / groupNodes.length;
        
        // Only draw individual post text for single posts (not in a cluster)
        // For multi-post clusters, only show the cluster label
        if (groupNodes.length === 1) {
            // Single post - show its text
            const node = groupNodes[0];
            push();
            translate(node.x, node.y);
            
            textAlign(LEFT, CENTER);
            textSize(18);
            textFont('MD Primer Trial');
            
            const lineHeight = 24;
            const startY = -(node.lines.length - 1) * lineHeight / 2;
            const startX = -110; // Left align from center
            
            node.lines.forEach((line, i) => {
                // Black text
                fill(0, 255);
                noStroke();
                text(line, startX, startY + i * lineHeight);
            });
            
            pop();
        }
        // For clusters with 2+ posts, don't draw individual post text
        // Only the cluster label will be drawn below
        
        pop();
        
        // Draw cluster label if multiple posts
        if (groupNodes.length >= 2) {
            push();
            const centerX = groupNodes.reduce((sum, n) => sum + n.x, 0) / groupNodes.length;
            const centerY = groupNodes.reduce((sum, n) => sum + n.y, 0) / groupNodes.length;
        
            const keywordFreq = new Map();
            groupNodes.forEach(node => {
                if (node.keywords) {
                    node.keywords.forEach(kw => {
                        keywordFreq.set(kw, (keywordFreq.get(kw) || 0) + 1);
                    });
                }
            });
            
            const topKeywords = Array.from(keywordFreq.entries())
                .filter(([_, count]) => count >= 2)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2)
                .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
            
            if (topKeywords.length > 0) {
                const label = topKeywords.join(' & ');
                textAlign(CENTER, CENTER);
                textSize(18);
                textStyle(BOLD);
                // Black text for filled mode
                fill(0, 255);
                noStroke();
                text(label, centerX, centerY);
                textStyle(NORMAL);
            }
            pop();
        }
    });
    
    // Update node physics
    nodes.forEach(node => {
        node.update();
    });
}

function drawMetaball3() {
    if (nodes.length < 1) return;
    
    // SYMMETRICAL GRID-BASED COLORED STROKE RENDERING
    // No physics - algorithmic placement in grid pattern
    
    // Calculate grid layout
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const rows = Math.ceil(nodes.length / cols);
    
    const cellWidth = width / cols;
    const cellHeight = height / rows;
    const padding = 40;
    
    // Draw each node in grid position with colored stroke
    nodes.forEach((node, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        
        // Calculate centered position in grid cell
        const x = col * cellWidth + cellWidth / 2;
        const y = row * cellHeight + cellHeight / 2;
        
        // Use cluster color for stroke
        const color = node.clusterColor || {
            h: (i * 360 / nodes.length) % 360,
            s: 70,
            b: 80
        };
        
        // Calculate text dimensions
        const maxWidth = cellWidth - padding * 2;
        const lineHeight = 24;
        
        // Truncate long text
        let displayContent = node.content;
        if (displayContent.length > 150) {
            displayContent = displayContent.substring(0, 150) + '...';
        }
        
        // Split text into lines
        const words = displayContent.split(' ');
        const lines = [];
        let currentLine = '';
        
        textSize(18);
        words.forEach(word => {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            if (textWidth(testLine) > maxWidth) {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        });
        if (currentLine) lines.push(currentLine);
        
        const textHeight = lines.length * lineHeight;
        const boxWidth = Math.min(maxWidth + padding * 2, cellWidth - 20);
        const boxHeight = textHeight + padding * 2;
        const cornerRadius = 30;
        
        // Draw rounded rectangle with colored stroke
        push();
        translate(x, y);
        
        noFill();
        stroke(color.h, color.s, color.b, 255);
        strokeWeight(4);
        
        rectMode(CENTER);
        rect(0, 0, boxWidth, boxHeight, cornerRadius);
        
        // Draw text inside
        fill(255);
        noStroke();
        textAlign(LEFT, CENTER);
        textSize(18);
        textFont('MD Primer Trial');
        
        const startY = -(lines.length - 1) * lineHeight / 2;
        const startX = -maxWidth / 2 + padding / 2; // Left align with padding
        lines.forEach((line, i) => {
            text(line, startX, startY + i * lineHeight);
        });
        
        pop();
    });
}

function drawOutlineMode() {
    // Draw each post as a rounded rectangle with stroke outline
    nodes.forEach(node => {
        node.update();
        
        // Calculate text dimensions for rounded rectangle
        const maxWidth = 320;
        const padding = 20;
        const lineHeight = 24;
        
        // Truncate long text
        let displayContent = node.content;
        if (displayContent.length > 150) {
            displayContent = displayContent.substring(0, 150) + '...';
        }
        
        // Split text into lines
        const words = displayContent.split(' ');
        const lines = [];
        let currentLine = '';
        
        textSize(18);
        words.forEach(word => {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            if (textWidth(testLine) > maxWidth - padding * 2) {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        });
        if (currentLine) lines.push(currentLine);
        
        const boxWidth = maxWidth;
        const boxHeight = lines.length * lineHeight + padding * 2;
        const cornerRadius = 20;
        
        // Draw rounded rectangle with stroke outline
        push();
        translate(node.x, node.y);
        
        // No fill, only stroke
        noFill();
        stroke(255); // White stroke
        strokeWeight(2);
        
        // Draw rounded rectangle
        rectMode(CENTER);
        rect(0, 0, boxWidth, boxHeight, cornerRadius);
        
        // Draw text inside
        fill(255);
        noStroke();
        textAlign(LEFT, CENTER);
        textSize(18);
        textFont('MD Primer Trial');
        
        const startY = -(lines.length - 1) * lineHeight / 2;
        const startX = -maxWidth / 2 + padding; // Left align with padding
        lines.forEach((line, i) => {
            text(line, startX, startY + i * lineHeight);
        });
        
        pop();
    });
}

function drawHybridMode() {
    // HYBRID MODE: Rounded rectangles for single posts, metaball blending for clusters
    if (nodes.length < 1) return;
    
    const similarityThreshold = 0.3;
    const blendDistance = 150; // Distance at which posts start blending
    
    // Group posts by similarity
    const groups = [];
    const processed = new Set();
    
    nodes.forEach((node, i) => {
        if (processed.has(i)) return;
        
        const group = [i];
        processed.add(i);
        
        nodes.forEach((other, j) => {
            if (i === j || processed.has(j)) return;
            
            const key = `${i}-${j}`;
            const similarity = connectionCache.get(key) || 0;
            if (similarity > similarityThreshold) {
                group.push(j);
                processed.add(j);
            }
        });
        
        groups.push(group);
    });
    
    // Draw each group
    groups.forEach(group => {
        const groupNodes = group.map(i => nodes[i]);
        
        if (groupNodes.length === 1) {
            // SINGLE POST: Draw tight rounded rectangle
            const node = groupNodes[0];
            node.update();
            
            push();
            translate(node.x, node.y);
            
            // Rounded rectangle outline
            noFill();
            stroke(255);
            strokeWeight(2);
            rectMode(CENTER);
            const padding = 20;
            rect(0, 0, node.boxWidth + padding, node.boxHeight + padding, 15);
            
            // Text
            fill(255);
            noStroke();
            textAlign(LEFT, CENTER);
            textSize(18);
            textFont('MD Primer Trial');
            
            const lineHeight = 24;
            const startY = -(node.lines.length - 1) * lineHeight / 2;
            const startX = -110;
            
            node.lines.forEach((line, i) => {
                text(line, startX, startY + i * lineHeight);
            });
            
            pop();
        } else {
            // CLUSTER: Use metaball blending
            const metaballRadius = 80;
            const fieldThreshold = 1.2;
            const resolution = 12;
            
            const minX = Math.min(...groupNodes.map(n => n.x)) - metaballRadius * 2;
            const maxX = Math.max(...groupNodes.map(n => n.x)) + metaballRadius * 2;
            const minY = Math.min(...groupNodes.map(n => n.y)) - metaballRadius * 2;
            const maxY = Math.max(...groupNodes.map(n => n.y)) + metaballRadius * 2;
            
            const cols = Math.ceil((maxX - minX) / resolution);
            const rows = Math.ceil((maxY - minY) / resolution);
            const field = [];
            
            for (let i = 0; i <= cols; i++) {
                field[i] = [];
                for (let j = 0; j <= rows; j++) {
                    const x = minX + i * resolution;
                    const y = minY + j * resolution;
                    
                    let strength = 0;
                    groupNodes.forEach(node => {
                        const dx = x - node.x;
                        const dy = y - node.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        if (distance > 0) {
                            strength += metaballRadius / distance;
                        } else {
                            strength += 999;
                        }
                    });
                    
                    field[i][j] = strength;
                }
            }
            
            // Marching squares
            const contours = [];
            for (let i = 0; i < cols; i++) {
                for (let j = 0; j < rows; j++) {
                    const x = minX + i * resolution;
                    const y = minY + j * resolution;
                    
                    const tl = field[i][j] >= fieldThreshold ? 1 : 0;
                    const tr = field[i + 1][j] >= fieldThreshold ? 1 : 0;
                    const br = field[i + 1][j + 1] >= fieldThreshold ? 1 : 0;
                    const bl = field[i][j + 1] >= fieldThreshold ? 1 : 0;
                    
                    const cellValue = tl * 8 + tr * 4 + br * 2 + bl * 1;
                    
                    if (cellValue !== 0 && cellValue !== 15) {
                        contours.push({ x, y, value: cellValue });
                    }
                }
            }
            
            // Draw metaball outline
            if (contours.length > 0) {
                push();
                noFill();
                stroke(255);
                strokeWeight(2);
                
                beginShape();
                contours.forEach(c => {
                    vertex(c.x + resolution / 2, c.y + resolution / 2);
                });
                endShape(CLOSE);
                pop();
            }
            
            // Bridge Detection: Mark nodes that connect different clusters
            const bridgeEnabled = window.enableBridgeDetection || enableBridgeDetection;
            if (bridgeEnabled) {
                groupNodes.forEach(node => {
                    // Count connections to other clusters
                    let crossClusterConnections = 0;
                    connectionCache.forEach((similarity, key) => {
                        const [i, j] = key.split('-').map(Number);
                        if ((nodes[i] === node || nodes[j] === node) && similarity > 0.3) {
                            const otherNode = nodes[i] === node ? nodes[j] : nodes[i];
                            if (otherNode && otherNode.cluster !== node.cluster) {
                                crossClusterConnections++;
                            }
                        }
                    });
                    
                    node.isBridge = crossClusterConnections > 0;
                    node.bridgeScore = crossClusterConnections;
                });
            }
            
            // Draw text for each post in cluster
            groupNodes.forEach(node => {
                push();
                translate(node.x, node.y);
                
                // Highlight bridge posts with special indicator
                if (bridgeEnabled && node.isBridge) {
                    // Draw bridge indicator (glowing ring)
                    push();
                    noFill();
                    stroke(255, 165, 0); // Orange
                    strokeWeight(3);
                    const ringSize = 15 + sin(frameCount * 0.1 + node.bridgeScore) * 5;
                    circle(0, 0, ringSize);
                    pop();
                }
                
                fill(255);
                noStroke();
                textAlign(LEFT, CENTER);
                textSize(18);
                textFont('MD Primer Trial');
                
                const lineHeight = 24;
                const startY = -(node.lines.length - 1) * lineHeight / 2;
                const startX = -110;
                
                node.lines.forEach((line, i) => {
                    text(line, startX, startY + i * lineHeight);
                });
                
                pop();
            });
        }
    });
}

function drawMetaballNodes() {
    // PURE METABALL NODES - No text, just organic blobs representing posts
    if (nodes.length < 1) return;
    
    const similarityThreshold = 0.2;
    const metaballRadius = 80;
    const fieldThreshold = 1.2;
    const resolution = 12;
    
    // Group posts by similarity
    const groups = [];
    const processed = new Set();
    
    nodes.forEach((node, i) => {
        if (processed.has(i)) return;
        
        const group = [i];
        processed.add(i);
        
        nodes.forEach((other, j) => {
            if (i === j || processed.has(j)) return;
            
            const key = `${i}-${j}`;
            const similarity = connectionCache.get(key) || 0;
            
            if (similarity > similarityThreshold) {
                group.push(j);
                processed.add(j);
            }
        });
        
        groups.push(group);
    });
    
    // Draw each group as pure metaballs
    groups.forEach((group, groupIndex) => {
        const groupNodes = group.map(i => nodes[i]);
        if (groupNodes.length === 0) return;
        
        // Update physics for all nodes
        groupNodes.forEach(node => node.update());
        
        // Visual Prominence: Calculate cluster size for this group
        const visualProminenceEnabled = window.enableVisualProminence || enableVisualProminence;
        const clusterSize = groupNodes.length;
        const sizeMultiplier = visualProminenceEnabled ? 
            map(clusterSize, 1, Math.max(10, nodes.length / 2), 0.8, 1.5) : 1.0;
        
        // Apply size multiplier for visual prominence
        const effectiveRadius = metaballRadius * sizeMultiplier;
        
        // Use cluster color
        const color = groupNodes[0].clusterColor || {
            h: (groupIndex * 360 / groups.length) % 360,
            s: 70,
            b: 80
        };
        
        // Calculate bounding box
        const minX = Math.min(...groupNodes.map(n => n.x)) - effectiveRadius * 2;
        const maxX = Math.max(...groupNodes.map(n => n.x)) + effectiveRadius * 2;
        const minY = Math.min(...groupNodes.map(n => n.y)) - effectiveRadius * 2;
        const maxY = Math.max(...groupNodes.map(n => n.y)) + effectiveRadius * 2;
        
        // Create field strength grid
        const cols = Math.ceil((maxX - minX) / resolution);
        const rows = Math.ceil((maxY - minY) / resolution);
        const field = [];
        
        for (let i = 0; i <= cols; i++) {
            field[i] = [];
            for (let j = 0; j <= rows; j++) {
                const x = minX + i * resolution;
                const y = minY + j * resolution;
                
                let strength = 0;
                groupNodes.forEach(node => {
                    const dx = x - node.x;
                    const dy = y - node.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance > 0) {
                        strength += effectiveRadius / distance;
                    } else {
                        strength += 999;
                    }
                });
                
                field[i][j] = strength;
            }
        }
        
        // Trace contour where field >= threshold (proper smooth metaballs)
        const contourPoints = [];
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const x = minX + i * resolution;
                const y = minY + j * resolution;
                
                // Check if this cell crosses the threshold
                const tl = field[i][j] >= fieldThreshold;
                const tr = field[i + 1][j] >= fieldThreshold;
                const br = field[i + 1][j + 1] >= fieldThreshold;
                const bl = field[i][j + 1] >= fieldThreshold;
                
                // If any corner is inside, add to contour
                if (tl || tr || br || bl) {
                    contourPoints.push({x: x + resolution/2, y: y + resolution/2});
                }
            }
        }
        
        // Draw smooth metaball shape from contour points
        if (contourPoints.length > 0) {
            push();
            
            // Fill with cluster color
            fill(color.h, color.s, color.b, 200);
            noStroke();
            
            beginShape();
            const hull = convexHull(contourPoints);
            const smoothed = smoothHull(hull);
            smoothed.forEach(p => vertex(p.x, p.y));
            endShape(CLOSE);
            
            pop();
        }
        
        // Draw small circles at node centers to show individual posts
        groupNodes.forEach(node => {
            push();
            fill(color.h, color.s, color.b + 20, 255);
            noStroke();
            circle(node.x, node.y, 12);
            pop();
        });
    });
}

function drawSpeechBubbles() {
    if (nodes.length < 1) return;
    
    // Keep black background
    background(0);
    
    // Draw all nodes as iOS-style speech bubbles
    nodes.forEach((node, index) => {
        push();
        
        // All white bubbles with black text (iOS style)
        const bgColor = color(0, 0, 100); // White
        const textColor = color(0, 0, 0); // Black
        
        // Speech bubble dimensions based on node's text box
        const padding = 12;
        const bubbleWidth = node.boxWidth || 200;
        const bubbleHeight = node.boxHeight || 100;
        const cornerRadius = 18; // iOS uses 18px radius
        
        // Draw main bubble body (rounded rectangle)
        fill(bgColor);
        noStroke();
        rect(node.x - bubbleWidth/2, node.y - bubbleHeight/2, 
             bubbleWidth, bubbleHeight, cornerRadius);
        
        // iOS-style tail (curved tail on bottom-left or bottom-right)
        // Alternate tail position left/right
        const tailOnRight = index % 2 === 0;
        const tailX = tailOnRight ? 
            node.x + bubbleWidth/2 - 20 : 
            node.x - bubbleWidth/2 + 20;
        const tailY = node.y + bubbleHeight/2;
        
        // Draw iOS-style curved tail using bezier curves
        fill(bgColor);
        noStroke();
        
        if (tailOnRight) {
            // Tail pointing bottom-right
            beginShape();
            vertex(tailX, tailY);
            bezierVertex(
                tailX + 5, tailY + 5,
                tailX + 10, tailY + 8,
                tailX + 15, tailY + 10
            );
            bezierVertex(
                tailX + 8, tailY + 5,
                tailX + 3, tailY + 2,
                tailX - 5, tailY
            );
            endShape(CLOSE);
        } else {
            // Tail pointing bottom-left
            beginShape();
            vertex(tailX, tailY);
            bezierVertex(
                tailX - 5, tailY + 5,
                tailX - 10, tailY + 8,
                tailX - 15, tailY + 10
            );
            bezierVertex(
                tailX - 8, tailY + 5,
                tailX - 3, tailY + 2,
                tailX + 5, tailY
            );
            endShape(CLOSE);
        }
        
        // Draw text
        fill(textColor);
        textAlign(CENTER, CENTER);
        textSize(14);
        textFont('Arial');
        
        // Draw each line of text
        const lineHeight = 18;
        const startY = node.y - (node.lines.length - 1) * lineHeight / 2;
        
        node.lines.forEach((line, i) => {
            text(line, node.x, startY + i * lineHeight);
        });
        
        pop();
    });
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

// WebSocket is declared at top of file (line 1)
window.ws = null; // Expose WebSocket globally for control panel

// Global function to reset timer (call from console: resetTimer())
window.resetTimer = function() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'reset_timer' }));
        console.log('🔄 Timer reset requested');
        
        // Reset local clustering flags
        clusteringEnabled = false;
        timerCompleted = false;
        
        // Clear existing clusters
        clusterRegistry.clusters = [];
        clusterRegistry.nextId = 0;
        nodes.forEach(node => {
            node.cluster = undefined;
            node.clusterColor = null;
        });
        
        logActivity('🔄 Timer and clustering reset', 'info');
    } else {
        console.error('WebSocket not connected');
    }
};

// Global function to reset entire experience (timer + all posts)
window.resetExperience = function() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Send reset commands to server
        ws.send(JSON.stringify({ type: 'reset_timer' }));
        ws.send(JSON.stringify({ type: 'clear_all_posts' }));
        
        console.log('🔄 Full experience reset requested');
        
        // Reset local state
        clusteringEnabled = false;
        timerCompleted = false;
        
        // Clear all posts and nodes
        posts.length = 0;
        nodes.length = 0;
        connectionCache.clear();
        
        // Clear clusters
        clusterRegistry.clusters = [];
        clusterRegistry.nextId = 0;
        clusterLabels = [];
        
        // Clear visualization
        if (window.metaballRenderer) {
            window.metaballRenderer = null;
        }
        
        logActivity('🔄 Full experience reset - all posts and timer cleared', 'info');
    } else {
        console.error('WebSocket not connected');
    }
};

function connectWebSocket() {
    ws = new WebSocket('ws://localhost:8080');
    window.ws = ws; // Make accessible to control panel
    
    ws.onopen = () => {
        console.log('Display connected to server');
        ws.send(JSON.stringify({ type: 'register_display' }));
        
        // Request current headline
        ws.send(JSON.stringify({ type: 'request_headline' }));
        
        // Send current cluster state after a short delay (let other clients connect)
        setTimeout(() => {
            if (nodes.length > 0) {
                console.log('📤 Sending initial cluster state to server');
                updateClusterListUI();
            }
        }, 1000);
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'post') {
            addPost(data.content, data.timestamp);
        }
        
        if (data.type === 'clear') {
            clearAllPosts();
        }
        
        if (data.type === 'clear_all_posts') {
            // Clear everything when reset button is pressed
            posts.length = 0;
            nodes.length = 0;
            connectionCache.clear();
            clusterRegistry.clusters = [];
            clusterRegistry.nextId = 0;
            clusterLabels = [];
            clusteringEnabled = false;
            timerCompleted = false;
            console.log('🔄 All posts cleared from display');
        }
        
        if (data.type === 'headline') {
            // Headline display disabled for pedagogical experience branch
            console.log('Headline received (not displayed):', data.headline);
        }
        
        if (data.type === 'countdown_update') {
            // Update countdown timer display
            if (window.updateCountdownDisplay) {
                window.updateCountdownDisplay(data.time);
            }
            
            // Trigger clustering when timer reaches 00:00
            if (data.time === 0 && !timerCompleted) {
                timerCompleted = true;
                clusteringEnabled = true;
                
                console.log('⏰ Timer completed! Triggering clustering...');
                logActivity('⏰ Timer completed - clustering all posts now!', 'cluster');
                
                // Run clustering on all existing posts
                recalculateSimilarities().then(() => {
                    logActivity('✅ All posts clustered successfully!', 'cluster');
                });
            }
        }
    };
    
    ws.onclose = () => {
        console.log('Display disconnected from server');
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function addPost(content, timestamp) {
    console.log('Adding post:', content);
    const node = new Node(content, timestamp, width, height);
    nodes.push(node);
    posts.push({ content, timestamp });
    console.log('Total nodes:', nodes.length);
    
    // Calculate similarities to show connection lines, but don't cluster yet
    recalculateSimilarities().then(() => {
        // Only send cluster info if clustering is enabled (timer completed)
        if (clusteringEnabled && ws && ws.readyState === WebSocket.OPEN && node.cluster !== undefined) {
            const clusterInfo = {
                type: 'cluster_info',
                content: content,
                cluster: node.cluster,
                clusterLabel: clusterLabels[node.cluster] || 'Cluster ' + node.cluster,
                clusterSize: nodes.filter(n => n.cluster === node.cluster).length,
                otherPosts: nodes
                    .filter(n => n.cluster === node.cluster && n !== node)
                    .slice(0, 3)
                    .map(n => n.content.substring(0, 50))
            };
            
            // Broadcast cluster info to all mobile clients
            ws.send(JSON.stringify(clusterInfo));
        }
    });
}

function clearAllPosts() {
    nodes.length = 0;
    posts.length = 0;
}
// Node class - represents a post in the network
class Node {
    constructor(content, timestamp, canvasWidth, canvasHeight) {
        this.content = content;
        this.timestamp = timestamp;
        
        // Random position
        this.x = random(100, canvasWidth - 100);
        this.y = random(100, canvasHeight - 100);
        
        this.vx = 0;
        this.vy = 0;
        this.keywords = this.extractKeywords(content);
        this.color = this.generateColor(content);
        
        // Social media parameters
        this.isBridge = false; // Connects different clusters
        this.bridgeScore = 0; // How many cross-cluster connections
        this.createdAt = Date.now(); // For trending detection
        
        // Truncate long text with ellipsis
        let displayContent = content;
        if (content.length > 150) {
            displayContent = content.substring(0, 150) + '...';
        }
        
        // Calculate text dimensions for wrapping
        const maxWidth = 220;
        const words = displayContent.split(' ');
        let lines = [];
        let currentLine = '';
        
        textSize(18);
        for (let word of words) {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            if (textWidth(testLine) > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
        
        this.lines = lines.slice(0, 4);
        if (lines.length > 4) {
            this.lines[3] = this.lines[3].substring(0, 25) + '...';
        }
        
        this.boxWidth = maxWidth + 40;
        this.boxHeight = Math.max(80, this.lines.length * 24 + 40);
        
        this.cluster = 0;
        this.clusterColor = { h: 0, s: 0, b: 100 };
        this.avgSimilarity = 0;
        this.isMerged = false;
    }
    
    extractKeywords(text) {
        const tokens = nlp.tokenize(text);
        nlp.updateDocumentFrequency(tokens);
        this.tfidf = nlp.calculateTFIDF(tokens);
        const topKeywords = nlp.getTopKeywords(this.tfidf, 10);
        this.keywordScores = new Map(topKeywords.map(k => [k.word, k.score]));
        
        // Log keyword extraction
        const keywordList = topKeywords.map(k => k.word).slice(0, 5).join(', ');
        logActivity(`📝 Extracted keywords: ${keywordList}`, 'keyword');
        
        return topKeywords.map(k => k.word);
    }
    
    // Removed: isInObstacle - no longer needed
    
    update() {
        let fx = 0;
        let fy = 0;
        
        // HEADLINE REPULSION ZONE - prevent posts from overlapping with centered headline
        const headlineX = width / 2;
        const headlineY = height / 2;
        const headlineWidth = 700;
        const headlineHeight = 200;
        const repelDistance = 350; // Distance at which repulsion starts
        
        // Calculate distance to headline center
        const dxHeadline = this.x - headlineX;
        const dyHeadline = this.y - headlineY;
        const distToHeadline = sqrt(dxHeadline * dxHeadline + dyHeadline * dyHeadline);
        
        // Strong repulsion from headline area
        if (distToHeadline < repelDistance) {
            const repelForce = (repelDistance - distToHeadline) / repelDistance * 3.0;
            fx += (dxHeadline / distToHeadline) * repelForce;
            fy += (dyHeadline / distToHeadline) * repelForce;
        }
        
        // Attraction to similar nodes, strong repulsion between different clusters
        nodes.forEach(other => {
            if (other === this) return;
            
            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const dist = sqrt(dx * dx + dy * dy);
            
            if (dist < 1) return;
            
            const key = nodes.indexOf(this) < nodes.indexOf(other) 
                ? `${nodes.indexOf(this)}-${nodes.indexOf(other)}`
                : `${nodes.indexOf(other)}-${nodes.indexOf(this)}`;
            
            const similarity = connectionCache.get(key) || 0;
            
            // Check if nodes are in different clusters
            const differentCluster = this.cluster !== undefined && 
                                    other.cluster !== undefined && 
                                    this.cluster !== other.cluster;
            
            if (similarity > 0.3) {
                // ATTRACTION for similar posts - they cluster together
                const force = (similarity - 0.3) * 2.5;
                fx += (dx / dist) * force;
                fy += (dy / dist) * force;
                
                // Prevent excessive overlap within cluster
                if (dist < 100) {
                    const repelForce = (100 - dist) / 100 * 2.5;
                    fx -= (dx / dist) * repelForce;
                    fy -= (dy / dist) * repelForce;
                }
            } else {
                // BOUNCING PHYSICS for dissimilar posts
                // Calculate collision radius to match visual metaball outline
                const collisionRadius = 80; // Match metaballRadius from rendering
                const minDistance = collisionRadius * 1.8; // Slightly larger for smoother collision
                
                if (dist < minDistance) {
                    // COLLISION DETECTED - gentle bounce away
                    const overlap = minDistance - dist;
                    const bounceForce = (overlap / minDistance) * 1.5; // Gentler bounce
                    
                    // Push away from collision
                    fx -= (dx / dist) * bounceForce;
                    fy -= (dy / dist) * bounceForce;
                    
                    // Add velocity-based bounce (more subtle)
                    const relativeVx = (other.vx || 0) - (this.vx || 0);
                    const relativeVy = (other.vy || 0) - (this.vy || 0);
                    const bounceTransfer = 0.1; // Reduced from 0.3
                    fx -= relativeVx * bounceTransfer;
                    fy -= relativeVy * bounceTransfer;
                }
                
                // Additional repulsion for different clusters (reduced)
                if (differentCluster && dist < 350) {
                    const repelForce = (350 - dist) / 350 * 1.5; // Reduced from 3.0
                    fx -= (dx / dist) * repelForce;
                    fy -= (dy / dist) * repelForce;
                }
            }
        });
        
        // Removed: center gravity - allows clusters to spread out naturally
        
        // Add gentle random drift to keep clusters floating and prevent static glitching
        const driftStrength = 0.05;
        const driftAngle = noise(this.x * 0.01, this.y * 0.01, frameCount * 0.01) * TWO_PI * 2;
        fx += cos(driftAngle) * driftStrength;
        fy += sin(driftAngle) * driftStrength;
        
        // Add very subtle constant circular motion to prevent complete stillness
        const circularForce = 0.01;
        fx += cos(frameCount * 0.005 + this.x * 0.1) * circularForce;
        fy += sin(frameCount * 0.005 + this.y * 0.1) * circularForce;
        
        this.vx += fx;
        this.vy += fy;
        this.vx *= 0.75;
        this.vy *= 0.75;
        
        this.x += this.vx;
        this.y += this.vy;
        
        const margin = this.boxWidth / 2 + 20;
        this.x = constrain(this.x, margin, width - margin);
        this.y = constrain(this.y, this.boxHeight / 2 + 20, height - this.boxHeight / 2 - 20);
    }
    
    calculateSimilarity(otherNode) {
        if (!this.tfidf || !otherNode.tfidf) return 0;
        
        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;
        
        const allWords = new Set([...this.tfidf.keys(), ...otherNode.tfidf.keys()]);
        
        for (const word of allWords) {
            const scoreA = this.tfidf.get(word) || 0;
            const scoreB = otherNode.tfidf.get(word) || 0;
            
            dotProduct += scoreA * scoreB;
            magnitudeA += scoreA * scoreA;
            magnitudeB += scoreB * scoreB;
        }
        
        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);
        
        if (magnitudeA === 0 || magnitudeB === 0) return 0;
        
        return dotProduct / (magnitudeA * magnitudeB);
    }
    
    async calculateEnhancedSimilarity(otherNode, database = 'tfidf') {
        const tfidfSim = this.calculateSimilarity(otherNode);
        
        if (database !== 'conceptnet' && database !== 'transformer') {
            return tfidfSim;
        }
        
        console.log('🔬 Semantic API call starting...');
        console.log('   Keywords1:', this.keywords);
        console.log('   Keywords2:', otherNode.keywords);
        
        const apiEndpoint = database === 'conceptnet' 
            ? 'http://localhost:3000/api/conceptnet/similarity'
            : 'http://localhost:3000/api/transformer/similarity';
        
        console.log('📡 Using API:', apiEndpoint);
        
        try {
            const startTime = performance.now();
            apiCallCount++;
            
            updateAPIStatus('fetching');
            console.log('📡 Fetching from API...');
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keywords1: this.keywords,
                    keywords2: otherNode.keywords
                })
            });
            
            updateAPIStatus('success');
            console.log('✅ API response received:', response.status);
            
            const data = await response.json();
            const endTime = performance.now();
            const responseTime = endTime - startTime;
            
            console.log('📦 Full API Response:', JSON.stringify(data, null, 2));
            
            apiResponseTimes.push(responseTime);
            if (data.cacheStats) {
                cacheHitCount = data.cacheStats.size;
            }
            
            const semanticSim = data.similarity || 0;
            console.log('🔢 TF-IDF Similarity:', tfidfSim);
            console.log('🔢 Semantic Similarity:', semanticSim);
            const combinedSim = (tfidfSim * 0.3) + (semanticSim * 0.7);
            console.log('🔢 Combined Similarity:', combinedSim);
            
            // Log similarity calculation
            const post1 = this.content.substring(0, 20);
            const post2 = otherNode.content.substring(0, 20);
            logActivity(`🔗 Similarity: "${post1}..." ↔ "${post2}..." = ${(combinedSim * 100).toFixed(0)}%`, 'similarity');
            
            apiCallLog.unshift({
                time: new Date().toLocaleTimeString(),
                keywords1: this.keywords.slice(0, 3).join(', '),
                keywords2: otherNode.keywords.slice(0, 3).join(', '),
                responseTime: responseTime.toFixed(0),
                cached: data.cached || false
            });
            if (apiCallLog.length > 10) apiCallLog.pop();
            
            similarityComparisons.unshift({
                post1: this.content.substring(0, 30),
                post2: otherNode.content.substring(0, 30),
                tfidf: (tfidfSim * 100).toFixed(0),
                conceptnet: (semanticSim * 100).toFixed(0),
                combined: (combinedSim * 100).toFixed(0)
            });
            if (similarityComparisons.length > 5) similarityComparisons.pop();
            
            updateConceptNetPanel();
            
            return combinedSim;
        } catch (error) {
            updateAPIStatus('error');
            console.error('ConceptNet error, falling back to TF-IDF:', error);
            return tfidfSim;
        }
    }
    
    display() {
        push();
        translate(this.x, this.y);
        
        const alpha = 255;
        
        // Draw circular outline (original style)
        const radius = max(this.boxWidth, this.boxHeight) / 2 + 10;
        noFill();
        stroke(255, alpha);
        strokeWeight(2);
        circle(0, 0, radius * 2);
        
        // Draw text inside circle with stroke for visibility
        textAlign(LEFT, CENTER);
        textSize(18);
        textFont('MD Primer Trial');
        
        const lineHeight = 24;
        const startY = -(this.lines.length - 1) * lineHeight / 2;
        const startX = -110; // Left align from center
        
        this.lines.forEach((line, i) => {
            // Draw black stroke
            stroke(0, alpha);
            strokeWeight(4);
            fill(0, alpha);
            text(line, startX, startY + i * lineHeight);
            
            // Draw white text on top
            noStroke();
            fill(255, alpha);
            text(line, startX, startY + i * lineHeight);
        });
        
        pop();
    }
    
    generateColor(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = text.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = abs(hash) % 360;
        return { h: hue, s: 70, b: 90 };
    }
}
// p5.js setup and draw functions
const kmeans = new KMeansClustering(numClusters);

function setup() {
    console.log('p5.js setup starting...');
    console.log('Window size:', windowWidth, 'x', windowHeight);
    
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
    }
    
    const canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent(document.body);
    colorMode(HSB);
    
    console.log('Canvas created:', width, 'x', height);
    console.log('p5.js setup complete');
    
    setupMonitorToggle();
    connectWebSocket();
}

function draw() {
    try {
        background(0);
        
        if (nodes.length === 0) {
            return;
        }
        
        // Render based on visualization mode
        const mode = window.visualizationMode || visualizationMode;
        if (mode === 'outline') {
            drawOutlineMode();
        } else if (mode === 'metaball2') {
            drawMetaballFilled();
        } else if (mode === 'metaball3') {
            drawMetaball3();
        } else if (mode === 'hybrid') {
            drawHybridMode();
        } else if (mode === 'nodes') {
            drawMetaballNodes();
        } else if (mode === 'bubbles') {
            drawSpeechBubbles();
        } else if (mode === 'text') {
            drawTextMode();
        } else if (mode === 'code') {
            drawCodeMode();
        } else if (mode === 'ascii') {
            drawASCIIMode();
        } else {
            drawClusterMetaballs();
        }
        
        // Draw animated dashed connection circles (uplink effect)
        connectionCache.forEach((similarity, key) => {
            const [i, j] = key.split('-').map(Number);
            
            if (!nodes[i] || !nodes[j]) return;
            
            const alpha = map(similarity, 0.3, 1, 50, 200);
            
            // Check if controversy highlighting is enabled
            const controversyEnabled = window.enableControversy || enableControversy;
            const isOpposingClusters = nodes[i].cluster !== nodes[j].cluster;
            
            // Color based on similarity strength OR controversy
            let linkColor;
            if (controversyEnabled && isOpposingClusters) {
                // Controversy: different clusters = orange/yellow
                linkColor = '#FF9800'; // Orange for bridge/controversy
            } else if (similarity > 0.6) {
                // Strong links: Red
                linkColor = '#D62828';
            } else {
                // Normal links: Blue
                linkColor = '#0000FE';
            }
            
            // Calculate distance and angle between nodes
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const distance = sqrt(dx * dx + dy * dy);
            const angle = atan2(dy, dx);
            
            // Animation offset (creates moving effect) - slowed down
            const animOffset1 = (frameCount * 0.5) % 40;
            const animOffset2 = ((frameCount * 0.5) + 20) % 40; // Second line offset
            
            push();
            
            // Draw first animated dashed line (moving towards cluster 2)
            stroke(linkColor);
            strokeWeight(2);
            drawingContext.setLineDash([10, 10]);
            drawingContext.lineDashOffset = -animOffset1;
            line(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
            
            // Draw second animated dashed line (moving towards cluster 1)
            drawingContext.lineDashOffset = -animOffset2;
            line(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
            
            // Reset line dash
            drawingContext.setLineDash([]);
            
            pop();
            
            // Draw connection circles at endpoints
            push();
            noFill();
            stroke(linkColor);
            strokeWeight(2);
            
            // Pulsing circle at node i
            const pulse1 = sin(frameCount * 0.05 + i) * 3 + 8;
            circle(nodes[i].x, nodes[i].y, pulse1);
            
            // Pulsing circle at node j
            const pulse2 = sin(frameCount * 0.05 + j) * 3 + 8;
            circle(nodes[j].x, nodes[j].y, pulse2);
            
            pop();
        });
        
        // Update node physics
        nodes.forEach(node => {
            node.update();
        });
        
        // Update timestamp for trending detection
        lastClusterUpdate = Date.now();
        
    } catch (error) {
        console.error('Error in draw loop:', error);
    }
}

function drawClusterMetaballs() {
    if (nodes.length < 1) return;
    
    // METABALL RENDERING OF POSTS THEMSELVES
    // Posts act as metaballs - blend when similar, separate when not
    const similarityThreshold = 0.2;
    const metaballRadius = 80; // Original value - good organic blending
    const fieldThreshold = 1.2; // Original threshold
    const resolution = 12; // Original resolution
    
    // Group ALL posts by similarity (including single posts)
    const groups = [];
    const processed = new Set();
    
    nodes.forEach((node, i) => {
        if (processed.has(i)) return;
        
        const group = [i];
        processed.add(i);
        
        for (let j = i + 1; j < nodes.length; j++) {
            if (processed.has(j)) continue;
            
            const key = `${i}-${j}`;
            const similarity = connectionCache.get(key) || 0;
            
            // ONLY group if similarity is above threshold
            if (similarity > similarityThreshold) {
                group.push(j);
                processed.add(j);
            }
        }
        
        // Add ALL groups (even single posts)
        groups.push(group);
    });
    
    // Draw each group as metaballs (posts themselves, not background)
    groups.forEach((group, groupIndex) => {
        const groupNodes = group.map(i => nodes[i]);
        if (groupNodes.length === 0) return;
        
        // Use the cluster color from the first node, or generate unique color per group
        // This ensures different topics get different colors
        const color = groupNodes[0].clusterColor || {
            h: (groupIndex * 360 / groups.length) % 360,
            s: 70,
            b: 80
        };
        
        // Calculate bounding box
        const minX = Math.min(...groupNodes.map(n => n.x)) - metaballRadius * 2;
        const maxX = Math.max(...groupNodes.map(n => n.x)) + metaballRadius * 2;
        const minY = Math.min(...groupNodes.map(n => n.y)) - metaballRadius * 2;
        const maxY = Math.max(...groupNodes.map(n => n.y)) + metaballRadius * 2;
        
        // Create field strength grid using metaball equation: f = a/r
        const cols = Math.ceil((maxX - minX) / resolution);
        const rows = Math.ceil((maxY - minY) / resolution);
        const field = [];
        
        for (let i = 0; i <= cols; i++) {
            field[i] = [];
            for (let j = 0; j <= rows; j++) {
                const x = minX + i * resolution;
                const y = minY + j * resolution;
                
                // Calculate metaball field from THIS group's nodes
                let strength = 0;
                groupNodes.forEach(node => {
                    const dx = x - node.x;
                    const dy = y - node.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance > 0) {
                        // Metaball equation: f = a / r
                        strength += metaballRadius / distance;
                    } else {
                        strength += 999; // At center
                    }
                });
                
                // BUBBLE PHYSICS: Add influence from ALL other nodes (creates deformation)
                nodes.forEach(otherNode => {
                    if (groupNodes.includes(otherNode)) return;
                    
                    const dx = x - otherNode.x;
                    const dy = y - otherNode.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance > 0 && distance < metaballRadius * 5) {
                        // Other nodes create VERY STRONG negative field (dramatic indentation)
                        const influence = (metaballRadius * 2.5) / distance;
                        strength -= influence * 1.5; // Extremely strong deformation
                    }
                });
                
                field[i][j] = strength;
            }
        }
        
        // Draw metaball shape (this IS the post, not background)
        push();
        noFill(); // No fill - stroke only
        stroke(255); // White stroke
        strokeWeight(2);
        
        // Trace contour where field >= threshold
        const contourPoints = [];
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const x = minX + i * resolution;
                const y = minY + j * resolution;
                
                // Check if this cell crosses the threshold
                const tl = field[i][j] >= fieldThreshold;
                const tr = field[i + 1][j] >= fieldThreshold;
                const br = field[i + 1][j + 1] >= fieldThreshold;
                const bl = field[i][j + 1] >= fieldThreshold;
                
                // If any corner is inside, add to contour
                if (tl || tr || br || bl) {
                    contourPoints.push({x: x + resolution/2, y: y + resolution/2});
                }
            }
        }
        
        // Draw smooth metaball shape from contour points
        if (contourPoints.length > 0) {
            beginShape();
            const hull = convexHull(contourPoints);
            const smoothed = smoothHull(hull);
            smoothed.forEach(p => vertex(p.x, p.y));
            endShape(CLOSE);
        }
        
        // Calculate cluster center
        const centerX = groupNodes.reduce((sum, n) => sum + n.x, 0) / groupNodes.length;
        const centerY = groupNodes.reduce((sum, n) => sum + n.y, 0) / groupNodes.length;
        
        // Only draw individual post text for single posts (not in a cluster)
        // For multi-post clusters, only show the cluster label
        if (groupNodes.length === 1) {
            // Single post - show its text
            const node = groupNodes[0];
            push();
            translate(node.x, node.y);
            
            textAlign(LEFT, CENTER);
            textSize(18);
            textFont('MD Primer Trial');
            
            const lineHeight = 24;
            const startY = -(node.lines.length - 1) * lineHeight / 2;
            const startX = -110; // Left align from center
            
            node.lines.forEach((line, i) => {
                // Black stroke
                stroke(0, 255);
                strokeWeight(4);
                fill(0, 255);
                text(line, startX, startY + i * lineHeight);
                
                // White text on top
                noStroke();
                fill(255, 255);
                text(line, startX, startY + i * lineHeight);
            });
            
            pop();
        }
        // For clusters with 2+ posts, don't draw individual post text
        // Only the cluster label will be drawn below
        
        pop();
        
        // Draw cluster label if multiple posts
        if (groupNodes.length >= 2) {
            push();
            const centerX = groupNodes.reduce((sum, n) => sum + n.x, 0) / groupNodes.length;
            const centerY = groupNodes.reduce((sum, n) => sum + n.y, 0) / groupNodes.length;
        
        const keywordFreq = new Map();
        groupNodes.forEach(node => {
            if (node.keywords) {
                node.keywords.forEach(kw => {
                    keywordFreq.set(kw, (keywordFreq.get(kw) || 0) + 1);
                });
            }
        });
        
        const topKeywords = Array.from(keywordFreq.entries())
            .filter(([_, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
        
        if (topKeywords.length > 0) {
            const label = topKeywords.join(' & ');
            textAlign(CENTER, CENTER);
            textSize(18);
            textStyle(BOLD);
            stroke(0, 200);
            strokeWeight(3);
            fill(color.h, color.s, color.b, 180);
            text(label, centerX, centerY);
            noStroke();
            fill(255, 255);
            text(label, centerX, centerY);
            textStyle(NORMAL);
        }
        pop();
        }
    });
}

function convexHull(points) {
    if (points.length < 3) return points;
    
    points.sort((a, b) => a.x - b.x || a.y - b.y);
    
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    
    const lower = [];
    for (let p of points) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }
    
    const upper = [];
    for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }
    
    lower.pop();
    upper.pop();
    return lower.concat(upper);
}

function expandHull(hull, distance) {
    const center = {
        x: hull.reduce((sum, p) => sum + p.x, 0) / hull.length,
        y: hull.reduce((sum, p) => sum + p.y, 0) / hull.length
    };
    
    return hull.map(p => {
        const dx = p.x - center.x;
        const dy = p.y - center.y;
        const len = sqrt(dx * dx + dy * dy);
        if (len === 0) return p;
        return {
            x: p.x + (dx / len) * distance,
            y: p.y + (dy / len) * distance
        };
    });
}

function smoothHull(hull) {
    // Apply smoothing multiple times for extra smooth curves
    let smoothed = hull;
    
    // Perform 4 iterations of smoothing for smooth metaballs without glitching
    for (let iteration = 0; iteration < 4; iteration++) {
        const newSmoothed = [];
        
        for (let i = 0; i < smoothed.length; i++) {
            const p0 = smoothed[(i - 1 + smoothed.length) % smoothed.length];
            const p1 = smoothed[i];
            const p2 = smoothed[(i + 1) % smoothed.length];
            
            // Add interpolated point between vertices
            newSmoothed.push({
                x: (p0.x + p1.x * 2 + p2.x) / 4,
                y: (p0.y + p1.y * 2 + p2.y) / 4
            });
            
            // Add midpoint for extra smoothness
            newSmoothed.push({
                x: (p1.x + p2.x) / 2,
                y: (p1.y + p2.y) / 2
            });
        }
        
        smoothed = newSmoothed;
    }
    
    return smoothed;
}

function drawTextMode() {
    // TEXT-ONLY MODE - Simple text list of all posts
    if (nodes.length < 1) return;
    
    background(0);
    
    // Group nodes by cluster
    const clusterGroups = new Map();
    const uncategorized = [];
    
    nodes.forEach(node => {
        if (node.cluster !== undefined && node.cluster >= 0) {
            if (!clusterGroups.has(node.cluster)) {
                clusterGroups.set(node.cluster, []);
            }
            clusterGroups.get(node.cluster).push(node);
        } else {
            uncategorized.push(node);
        }
    });
    
    // Text layout settings
    const leftMargin = 40;
    const topMargin = 40;
    const lineHeight = 24;
    const clusterSpacing = 40;
    let currentY = topMargin;
    
    textAlign(LEFT, TOP);
    textFont('Courier New');
    
    // Draw each cluster
    clusterGroups.forEach((clusterNodes, clusterId) => {
        const clusterLabel = clusterLabels[clusterId] || `Cluster ${clusterId}`;
        const color = clusterNodes[0].clusterColor || { h: 0, s: 70, b: 80 };
        
        // Cluster header
        push();
        fill(color.h, color.s, color.b);
        textSize(16);
        textStyle(BOLD);
        text(`${clusterLabel} (${clusterNodes.length})`, leftMargin, currentY);
        pop();
        
        currentY += lineHeight + 10;
        
        // Draw posts in this cluster
        clusterNodes.forEach((node, index) => {
            push();
            fill(255);
            textSize(14);
            textStyle(NORMAL);
            
            // Truncate long text
            let displayText = node.content;
            if (displayText.length > 100) {
                displayText = displayText.substring(0, 100) + '...';
            }
            
            text(`  ${index + 1}. ${displayText}`, leftMargin, currentY);
            pop();
            
            currentY += lineHeight;
            
            // Wrap to next column if needed
            if (currentY > height - 100) {
                currentY = topMargin;
                // Could add column logic here if needed
            }
        });
        
        currentY += clusterSpacing;
    });
    
    // Draw uncategorized posts if any
    if (uncategorized.length > 0) {
        push();
        fill(150);
        textSize(16);
        textStyle(BOLD);
        text(`Uncategorized (${uncategorized.length})`, leftMargin, currentY);
        pop();
        
        currentY += lineHeight + 10;
        
        uncategorized.forEach((node, index) => {
            push();
            fill(200);
            textSize(14);
            textStyle(NORMAL);
            
            let displayText = node.content;
            if (displayText.length > 100) {
                displayText = displayText.substring(0, 100) + '...';
            }
            
            text(`  ${index + 1}. ${displayText}`, leftMargin, currentY);
            pop();
            
            currentY += lineHeight;
            
            if (currentY > height - 100) {
                currentY = topMargin;
            }
        });
    }
}
function drawCodeMode() {
    // CODE MODE - Text nodes with algorithmic code pattern outlines
    if (nodes.length < 1) return;
    
    background(0);
    
    // Group nodes by cluster
    const clusterGroups = new Map();
    
    nodes.forEach(node => {
        if (node.cluster !== undefined && node.cluster >= 0) {
            if (!clusterGroups.has(node.cluster)) {
                clusterGroups.set(node.cluster, []);
            }
            clusterGroups.get(node.cluster).push(node);
        }
    });
    
    // Draw each cluster with code pattern outline
    clusterGroups.forEach((clusterNodes, clusterId) => {
        if (clusterNodes.length === 0) return;
        
        const color = clusterNodes[0].clusterColor || { h: 0, s: 70, b: 80 };
        
        // Calculate bounding box for cluster
        const padding = 60;
        const minX = Math.min(...clusterNodes.map(n => n.x)) - padding;
        const maxX = Math.max(...clusterNodes.map(n => n.x)) + padding;
        const minY = Math.min(...clusterNodes.map(n => n.y)) - padding;
        const maxY = Math.max(...clusterNodes.map(n => n.y)) + padding;
        
        // Draw code pattern outline
        drawCodePatternOutline(minX, minY, maxX, maxY, color, clusterId);
        
        // Draw text nodes
        clusterNodes.forEach(node => {
            drawTextNode(node, color);
        });
    });
}

function drawCodePatternOutline(minX, minY, maxX, maxY, color, clusterId) {
    const width = maxX - minX;
    const height = maxY - minY;
    
    push();
    stroke(color.h, color.s, color.b);
    strokeWeight(2);
    noFill();
    
    textFont('Courier New');
    textSize(12);
    fill(color.h, color.s, color.b);
    
    // Top code pattern: function declaration
    const funcName = clusterLabels[clusterId] || `cluster_${clusterId}`;
    const sanitizedName = funcName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    
    // Draw opening brace and function signature
    text(`function ${sanitizedName}() {`, minX, minY - 10);
    
    // Left side: code indentation markers
    const lineCount = Math.floor(height / 30);
    for (let i = 0; i < lineCount; i++) {
        const y = minY + (i * 30);
        text('  //', minX - 40, y);
    }
    
    // Right side: semicolons and comments
    for (let i = 0; i < lineCount; i++) {
        const y = minY + (i * 30);
        text(';', maxX + 10, y);
    }
    
    // Bottom: closing brace
    text(`}`, minX, maxY + 20);
    
    // Draw connecting lines (like code blocks)
    stroke(color.h, color.s, color.b, 100);
    strokeWeight(1);
    
    // Vertical guides
    line(minX + 20, minY, minX + 20, maxY);
    line(maxX - 20, minY, maxX - 20, maxY);
    
    // Horizontal separators (like code sections)
    const sectionCount = 3;
    for (let i = 1; i < sectionCount; i++) {
        const y = minY + (height / sectionCount) * i;
        drawDashedLine(minX + 20, y, maxX - 20, y, 10);
    }
    
    // Corner brackets (code block markers)
    strokeWeight(3);
    stroke(color.h, color.s, color.b);
    
    // Top-left bracket
    line(minX, minY + 20, minX, minY);
    line(minX, minY, minX + 20, minY);
    
    // Top-right bracket
    line(maxX - 20, minY, maxX, minY);
    line(maxX, minY, maxX, minY + 20);
    
    // Bottom-left bracket
    line(minX, maxY - 20, minX, maxY);
    line(minX, maxY, minX + 20, maxY);
    
    // Bottom-right bracket
    line(maxX - 20, maxY, maxX, maxY);
    line(maxX, maxY, maxX, maxY - 20);
    
    pop();
}

function drawTextNode(node, clusterColor) {
    push();
    
    // Node background (like a code comment block)
    fill(20);
    stroke(clusterColor.h, clusterColor.s, clusterColor.b);
    strokeWeight(1);
    rect(node.x - node.boxWidth/2, node.y - node.boxHeight/2, node.boxWidth, node.boxHeight, 4);
    
    // Code-style prefix
    fill(100, 100, 100);
    textFont('Courier New');
    textSize(10);
    textAlign(LEFT, TOP);
    text('/*', node.x - node.boxWidth/2 + 10, node.y - node.boxHeight/2 + 5);
    text('*/', node.x - node.boxWidth/2 + 10, node.y + node.boxHeight/2 - 15);
    
    // Draw text content
    fill(clusterColor.h, clusterColor.s, clusterColor.b);
    textSize(12);
    textAlign(LEFT, CENTER);
    
    const lineHeight = 16;
    const startY = node.y - (node.lines.length - 1) * lineHeight / 2;
    const startX = node.x - node.boxWidth/2 + 30;
    
    node.lines.forEach((line, i) => {
        text(line, startX, startY + i * lineHeight);
    });
    
    pop();
}

function drawDashedLine(x1, y1, x2, y2, dashLength) {
    const distance = dist(x1, y1, x2, y2);
    const dashes = distance / (dashLength * 2);
    
    for (let i = 0; i < dashes; i++) {
        const startRatio = (i * 2 * dashLength) / distance;
        const endRatio = ((i * 2 + 1) * dashLength) / distance;
        
        const startX = lerp(x1, x2, startRatio);
        const startY = lerp(y1, y2, startRatio);
        const endX = lerp(x1, x2, endRatio);
        const endY = lerp(y1, y2, endRatio);
        
        line(startX, startY, endX, endY);
    }
}

function drawASCIIMode() {
    // ASCII MODE - Metaball outlines drawn with code characters and numbers
    if (nodes.length < 1) return;
    
    background(0);
    
    const similarityThreshold = 0.2;
    const metaballRadius = 80;
    const fieldThreshold = 1.2;
    const resolution = 12;
    
    // Group posts by similarity
    const groups = [];
    const processed = new Set();
    
    nodes.forEach((node, i) => {
        if (processed.has(i)) return;
        
        const group = [i];
        processed.add(i);
        
        nodes.forEach((other, j) => {
            if (i === j || processed.has(j)) return;
            
            const key = `${i}-${j}`;
            const similarity = connectionCache.get(key) || 0;
            
            if (similarity > similarityThreshold) {
                group.push(j);
                processed.add(j);
            }
        });
        
        groups.push(group);
    });
    
    // Draw each group with ASCII outline
    groups.forEach((group, groupIndex) => {
        const groupNodes = group.map(i => nodes[i]);
        if (groupNodes.length === 0) return;
        
        groupNodes.forEach(node => node.update());
        
        const color = groupNodes[0].clusterColor || {
            h: (groupIndex * 360 / groups.length) % 360,
            s: 70,
            b: 80
        };
        
        // Calculate bounding box
        const minX = Math.min(...groupNodes.map(n => n.x)) - metaballRadius * 2;
        const maxX = Math.max(...groupNodes.map(n => n.x)) + metaballRadius * 2;
        const minY = Math.min(...groupNodes.map(n => n.y)) - metaballRadius * 2;
        const maxY = Math.max(...groupNodes.map(n => n.y)) + metaballRadius * 2;
        
        // Create field strength grid
        const cols = Math.ceil((maxX - minX) / resolution);
        const rows = Math.ceil((maxY - minY) / resolution);
        const field = [];
        
        for (let i = 0; i <= cols; i++) {
            field[i] = [];
            for (let j = 0; j <= rows; j++) {
                const x = minX + i * resolution;
                const y = minY + j * resolution;
                
                let strength = 0;
                groupNodes.forEach(node => {
                    const dx = x - node.x;
                    const dy = y - node.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance > 0) {
                        strength += metaballRadius / distance;
                    } else {
                        strength += 999;
                    }
                });
                
                field[i][j] = strength;
            }
        }
        
        // Draw ASCII outline
        drawASCIIOutline(field, cols, rows, minX, minY, resolution, fieldThreshold, color);
        
        // Fill interior with random code text
        fillASCIIInterior(field, cols, rows, minX, minY, resolution, fieldThreshold, color);
        
        // Draw readable post text on top
        groupNodes.forEach(node => {
            push();
            fill(255);
            textFont('Courier New');
            textSize(14);
            textAlign(CENTER, CENTER);
            
            // Draw text with line wrapping
            const lineHeight = 18;
            const startY = node.y - (node.lines.length - 1) * lineHeight / 2;
            
            node.lines.forEach((line, i) => {
                text(line, node.x, startY + i * lineHeight);
            });
            
            pop();
        });
    });
}

function drawASCIIOutline(field, cols, rows, minX, minY, resolution, threshold, color) {
    push();
    fill(color.h, color.s, color.b);
    textFont('Courier New');
    textSize(10);
    textAlign(CENTER, CENTER);
    
    // Trace outline and draw ASCII characters
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            const x = minX + i * resolution;
            const y = minY + j * resolution;
            
            const current = field[i][j] >= threshold;
            if (!current) continue;
            
            // Check neighbors to determine if this is an edge
            const left = i > 0 ? field[i-1][j] >= threshold : false;
            const right = i < cols ? field[i+1][j] >= threshold : false;
            const top = j > 0 ? field[i][j-1] >= threshold : false;
            const bottom = j < rows ? field[i][j+1] >= threshold : false;
            const topLeft = (i > 0 && j > 0) ? field[i-1][j-1] >= threshold : false;
            const topRight = (i < cols && j > 0) ? field[i+1][j-1] >= threshold : false;
            const bottomLeft = (i > 0 && j < rows) ? field[i-1][j+1] >= threshold : false;
            const bottomRight = (i < cols && j < rows) ? field[i+1][j+1] >= threshold : false;
            
            // Determine if this is an edge point
            const isEdge = !left || !right || !top || !bottom;
            
            if (isEdge) {
                let char = getASCIIChar(left, right, top, bottom, topLeft, topRight, bottomLeft, bottomRight);
                text(char, x, y);
            }
        }
    }
    
    pop();
}

function getASCIIChar(left, right, top, bottom, topLeft, topRight, bottomLeft, bottomRight) {
    // Determine which ASCII character to use based on neighbors
    
    // Vertical edges
    if (!left && right) return '|';
    if (left && !right) return '|';
    
    // Horizontal edges
    if (!top && bottom) return '-';
    if (top && !bottom) return '-';
    
    // Diagonal edges
    if (!topLeft && bottomRight) return '\\';
    if (topLeft && !bottomRight) return '\\';
    if (!topRight && bottomLeft) return '/';
    if (topRight && !bottomLeft) return '/';
    
    // Corners
    if (!left && !top) return '+';
    if (!right && !top) return '+';
    if (!left && !bottom) return '+';
    if (!right && !bottom) return '+';
    
    // Random code characters for variety
    const codeChars = ['|', '-', '/', '\\', '^', '~', '=', '<', '>', '.', '\'', '`'];
    return random(codeChars);
}

function fillASCIIInterior(field, cols, rows, minX, minY, resolution, threshold, color) {
    push();
    fill(color.h, color.s, color.b, 100);
    textFont('Courier New');
    textSize(6);
    textAlign(CENTER, CENTER);
    
    // Code-like characters and numbers
    const codeElements = [
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
        'A', 'B', 'C', 'D', 'E', 'F', 'X', 'N', 'Z', 'R',
        '$', '@', '#', '&', '~', '^', '=', '<', '>',
        'u', 'v', 'w', 'i', 'o', 'n', 's', 'c', 'q', 'r'
    ];
    
    // Fill interior with random code text
    for (let i = 1; i < cols - 1; i++) {
        for (let j = 1; j < rows - 1; j++) {
            const x = minX + i * resolution;
            const y = minY + j * resolution;
            
            const current = field[i][j] >= threshold;
            const left = field[i-1][j] >= threshold;
            const right = field[i+1][j] >= threshold;
            const top = field[i][j-1] >= threshold;
            const bottom = field[i][j+1] >= threshold;
            
            // Only fill interior points (surrounded by other points)
            if (current && left && right && top && bottom) {
                // Randomly place code characters - reduced density
                if (random() > 0.92) { // 8% chance to place a character
                    const char = random(codeElements);
                    text(char, x, y);
                }
            }
        }
    }
    
    pop();
}
