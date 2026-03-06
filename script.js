let ws;
const posts = [];
const nodes = [];
const connections = [];
let clusters = [];
let numClusters = 5; // More clusters = more color variety for different topics
let connectionCache = new Map(); // Cache for similarity calculations

// Visualization mode
let visualizationMode = 'metaball'; // 'metaball', 'metaball2', 'metaball3', or 'outline'
window.visualizationMode = visualizationMode; // Make globally accessible

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
function generateClusterLabels() {
    clusterLabels = [];
    
    for (let c = 0; c < numClusters; c++) {
        const clusterNodes = nodes.filter(n => n.cluster === c);
        if (clusterNodes.length === 0) {
            clusterLabels.push('Empty Cluster');
            continue;
        }
        
        // Collect all keywords from cluster with their scores
        const keywordFreq = new Map();
        clusterNodes.forEach(node => {
            if (node.keywords) {
                node.keywords.forEach(keyword => {
                    keywordFreq.set(keyword, (keywordFreq.get(keyword) || 0) + 1);
                });
            }
        });
        
        // Get top 2-3 keywords
        const topKeywords = Array.from(keywordFreq.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([word]) => word);
        
        // Generate label
        if (topKeywords.length === 0) {
            clusterLabels.push('Cluster ' + c);
        } else {
            const label = topKeywords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' & ');
            clusterLabels.push(label);
        }
    }
    
    console.log('🏷️ Cluster labels generated:', clusterLabels);
    
    // Log cluster labels
    clusterLabels.forEach((label, i) => {
        if (label !== 'Empty Cluster') {
            logActivity(`🏷️ Cluster ${i}: "${label}"`, 'cluster');
        }
    });
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
        
        // Run clustering if enough nodes
        if (nodes.length >= numClusters) {
            logActivity(`🎨 Running K-means clustering (k=${numClusters})`, 'cluster');
            const clusterAssignments = kmeans.cluster(nodes);
            
            // Assign cluster colors to nodes
            nodes.forEach((node, i) => {
                node.cluster = clusterAssignments[i];
                node.clusterColor = kmeans.clusterColors[clusterAssignments[i]];
            });
            
            // Generate cluster labels
            generateClusterLabels();
            
            // Log cluster distribution
            const clusterCounts = {};
            clusterAssignments.forEach(c => clusterCounts[c] = (clusterCounts[c] || 0) + 1);
            logActivity(`📊 Clusters formed: ${Object.entries(clusterCounts).map(([k,v]) => `C${k}:${v}`).join(', ')}`, 'cluster');
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
    const metaballRadius = 80;
    const fieldThreshold = 1.2;
    const resolution = 12;
    
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
            
            textAlign(CENTER, CENTER);
            textSize(14);
            
            const lineHeight = 20;
            const startY = -(node.lines.length - 1) * lineHeight / 2;
            
            node.lines.forEach((line, i) => {
                // Black text
                fill(0, 255);
                noStroke();
                text(line, 0, startY + i * lineHeight);
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
        const lineHeight = 20;
        
        // Split text into lines
        const words = node.content.split(' ');
        const lines = [];
        let currentLine = '';
        
        textSize(14);
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
        textAlign(CENTER, CENTER);
        textSize(14);
        
        const startY = -(lines.length - 1) * lineHeight / 2;
        lines.forEach((line, i) => {
            text(line, 0, startY + i * lineHeight);
        });
        
        pop();
    });
}

function drawOutlineMode() {
    // Draw each post as a rounded rectangle with stroke outline
    nodes.forEach(node => {
        node.update();
        
        // Calculate text dimensions for rounded rectangle
        const maxWidth = 300;
        const padding = 20;
        const lineHeight = 20;
        
        // Split text into lines
        const words = node.content.split(' ');
        const lines = [];
        let currentLine = '';
        
        textSize(14);
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
        textAlign(CENTER, CENTER);
        textSize(14);
        
        const startY = -(lines.length - 1) * lineHeight / 2;
        lines.forEach((line, i) => {
            text(line, 0, startY + i * lineHeight);
        });
        
        pop();
    });
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

// WebSocket is declared at top of file (line 1)
window.ws = null; // Expose WebSocket globally for control panel

function connectWebSocket() {
    ws = new WebSocket('ws://localhost:8080');
    window.ws = ws; // Make accessible to control panel
    
    ws.onopen = () => {
        console.log('Display connected to server');
        ws.send(JSON.stringify({ type: 'register_display' }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'post') {
            addPost(data.content, data.timestamp);
        }
        
        if (data.type === 'clear') {
            clearAllPosts();
        }
        
        if (data.type === 'headline') {
            // Update centered headline display
            const headlineText = document.getElementById('headlineText');
            const headlineTimestamp = document.getElementById('headlineTimestamp');
            
            if (headlineText) {
                headlineText.textContent = data.headline;
            }
            
            if (headlineTimestamp && data.timestamp) {
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
                headlineTimestamp.textContent = `Updated ${formattedDate}`;
            }
            
            // Update API control panel
            const apiCurrentHeadline = document.getElementById('apiCurrentHeadline');
            const apiHeadlineTime = document.getElementById('apiHeadlineTime');
            
            if (apiCurrentHeadline) {
                apiCurrentHeadline.textContent = data.headline;
            }
            
            if (apiHeadlineTime && data.timestamp) {
                const date = new Date(data.timestamp);
                const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                apiHeadlineTime.textContent = `Fetched: ${timeStr}`;
                window.headlineFetchTime = data.timestamp;
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
    
    // Trigger recalculation with new post
    recalculateSimilarities().then(() => {
        // After clustering, send cluster info back to mobile
        if (ws && ws.readyState === WebSocket.OPEN && node.cluster !== undefined) {
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
            // (Server will handle routing to correct client)
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
        
        // Calculate text dimensions for wrapping
        const maxWidth = 180;
        const words = content.split(' ');
        let lines = [];
        let currentLine = '';
        
        textSize(14);
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
            this.lines[3] = this.lines[3].substring(0, 20) + '...';
        }
        
        this.boxWidth = maxWidth + 40;
        this.boxHeight = Math.max(80, this.lines.length * 20 + 40);
        
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
        textAlign(CENTER, CENTER);
        textSize(14);
        
        const lineHeight = 20;
        const startY = -(this.lines.length - 1) * lineHeight / 2;
        
        this.lines.forEach((line, i) => {
            // Draw black stroke
            stroke(0, alpha);
            strokeWeight(4);
            fill(0, alpha);
            text(line, 0, startY + i * lineHeight);
            
            // Draw white text on top
            noStroke();
            fill(255, alpha);
            text(line, 0, startY + i * lineHeight);
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
        } else {
            drawClusterMetaballs();
        }
        
        connectionCache.forEach((similarity, key) => {
            const [i, j] = key.split('-').map(Number);
            
            const alpha = map(similarity, 0.3, 1, 30, 150);
            
            let lineColor, labelColor;
            if (similarity > 0.6) {
                lineColor = {h: 0, s: 80, b: 100};
                labelColor = {h: 0, s: 80, b: 100};
            } else {
                lineColor = {h: 210, s: 80, b: 100};
                labelColor = {h: 210, s: 80, b: 100};
            }
            
            stroke(lineColor.h, lineColor.s, lineColor.b, alpha);
            strokeWeight(map(similarity, 0.3, 1, 1, 3));
            line(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
            
            const midX = (nodes[i].x + nodes[j].x) / 2;
            const midY = (nodes[i].y + nodes[j].y) / 2;
            
            fill(labelColor.h, labelColor.s, labelColor.b, alpha);
            noStroke();
            textAlign(CENTER, CENTER);
            textSize(10);
            text(`${(similarity * 100).toFixed(0)}%`, midX, midY);
        });
        
        // Update node physics
        nodes.forEach(node => {
            node.update();
        });
        
    } catch (error) {
        console.error('Error in draw loop:', error);
    }
}

function drawClusterMetaballs() {
    if (nodes.length < 1) return;
    
    // METABALL RENDERING OF POSTS THEMSELVES
    // Posts act as metaballs - blend when similar, separate when not
    const similarityThreshold = 0.2;
    const metaballRadius = 80; // 'a' in the equation f = a/r
    const fieldThreshold = 1.2; // Threshold for metaball field strength
    const resolution = 12; // Grid resolution for marching squares
    
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
            
            textAlign(CENTER, CENTER);
            textSize(14);
            
            const lineHeight = 20;
            const startY = -(node.lines.length - 1) * lineHeight / 2;
            
            node.lines.forEach((line, i) => {
                // Black stroke
                stroke(0, 255);
                strokeWeight(4);
                fill(0, 255);
                text(line, 0, startY + i * lineHeight);
                
                // White text on top
                noStroke();
                fill(255, 255);
                text(line, 0, startY + i * lineHeight);
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

// Removed: drawThemedGroupMetaball - no longer needed with new metaball system
