let ws;
const posts = [];
const nodes = [];
const connections = [];
const particles = [];
let obstacleBox = null;
let clusters = [];
let numClusters = 3;
let connectionCache = new Map(); // Cache for similarity calculations
let themedGroups = []; // Stores themed groups when Generate is clicked
let showThemedMetaballs = false; // Toggle for themed metaballs overlay
let isAnimatingMerge = false; // Animation state
let mergeProgress = 0; // 0 to 1, animation progress

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
    
    if (apiCallCountEl) apiCallCountEl.textContent = apiCallCount;
    if (cacheHitsEl) cacheHitsEl.textContent = cacheHitCount;
    
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

// K-means Clustering
const nlp = new NLPEngine();

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
    
    // Assign each node to nearest centroid
    assignClusters(nodes) {
        const assignments = [];
        
        nodes.forEach(node => {
            const vec = this.getFeatureVector(node);
            let minDist = Infinity;
            let cluster = 0;
            
            this.centroids.forEach((centroid, i) => {
                const dist = this.distance(vec, centroid);
                if (dist < minDist) {
                    minDist = dist;
                    cluster = i;
                }
            });
            
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
            
            const avgX = clusterNodes.reduce((sum, n) => sum + n.x, 0) / clusterNodes.length;
            const avgY = clusterNodes.reduce((sum, n) => sum + n.y, 0) / clusterNodes.length;
            newCentroids.push({ x: avgX, y: avgY });
        }
        
        this.centroids = newCentroids;
    }
}

let isRecalculating = false;

// Recalculate similarities using selected database
async function recalculateSimilarities() {
    if (isRecalculating || nodes.length === 0) {
        console.log('⏭️ Skipping recalculation:', { isRecalculating, nodeCount: nodes.length });
        return;
    }
    isRecalculating = true;
    
    console.log('🔄 Recalculating similarities with database:', currentDatabase);
    console.log('📊 Node count:', nodes.length);
    
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
                
                if (similarity > 0.2) {
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
        
        // Run clustering if enough nodes
        if (nodes.length >= numClusters) {
            const clusterAssignments = kmeans.cluster(nodes);
            
            // Assign cluster colors to nodes
            nodes.forEach((node, i) => {
                node.cluster = clusterAssignments[i];
                node.clusterColor = kmeans.clusterColors[clusterAssignments[i]];
            });
        }
    } catch (error) {
        console.error('Error recalculating similarities:', error);
    } finally {
        isRecalculating = false;
        console.log('✅ Recalculation complete. isRecalculating =', isRecalculating);
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

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function connectWebSocket() {
    ws = new WebSocket('ws://localhost:8080');
    
    ws.onopen = () => {
        console.log('Display connected to server');
        ws.send(JSON.stringify({ type: 'register_display' }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'post') {
            addPost(data.content, data.timestamp);
        }
        
        if (data.type === 'clear_all') {
            clearAllPosts();
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
    
    // Trigger recalculation with new post
    recalculateSimilarities();
}

function clearAllPosts() {
    nodes.length = 0;
    posts.length = 0;
}
