let ws;
const posts = [];
const nodes = [];
const connections = [];
let clusters = [];
let numClusters = 4; // Fewer clusters = broader thematic topics (reduced for pedagogical experience)
let connectionCache = new Map(); // Cache for similarity calculations

// Idle/Welcome screen state
let idleScreenActive = true; // Start with idle screen
let experienceStarted = false; // Track if experience has begun

// Visualization mode
let visualizationMode = 'bubbles'; // 'metaball', 'metaball2', 'metaball3', 'hybrid', 'nodes', 'bubbles', or 'outline'
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

// Clustering animation state
let clusteringAnimationActive = false;
let clusteringAnimationLoading = false; // True during spell-check loading
let clusteringProgress = 0;
let clusteringAnimationStartTime = 0;
let clusteringPhase1Done = false;
let clusteringPhase2Done = false;
let clusteringPhase3Done = false;
let clusteringPhase4Done = false;

// Topic reveal animation state
let revealAnimationActive = false;
let revealBlobSize = 0;
let revealClusterColor = null;
let revealPhase = 'idle'; // 'idle', 'growing', 'full', 'border'
let revealBlobX = 0; // Starting X position of winning cluster
let revealBlobY = 0; // Starting Y position of winning cluster

// Voting phase state
let votingPhaseActive = false;
let votingCountdownTime = 0; // Countdown time in seconds

// Debate voting state (post-reveal interaction)
let debateVotingActive = false;
let redVoteCount = 0;
let greenVoteCount = 0;

// Debate timer state
let debateTimerActive = false;
let currentTurn = 1; // 1 = Group 1, 2 = Group 2
let turnTimeRemaining = 30; // seconds
let totalTurns = 4; // 2 turns per group
let currentTurnNumber = 0; // 0-3 (4 total turns)
let debateTimerInterval = null;

// Post-debate state
let debateOverPhase = 'none'; // 'none', 'debate-over', 'vote-counting', 'winner'
let finalVoteBalance = 0; // Store final balance when debate ends
let voteCountAnimation = 0; // Animation counter for vote tallies
let winnerGroup = null; // 1 or 2

// Role assignment state
let roleAssignmentActive = false;
let roleAssignmentPhase = 'idle'; // 'idle', 'fade-out', 'topic-move', 'circles-fade-in', 'static'
let roleAssignments = new Map(); // Map of clientId -> { role: 'debater', group: 1|2 } or { role: 'listener' }
let topicMoveProgress = 0;
let circlesFadeProgress = 0;
let roleAssignmentAutoTriggered = false; // Flag to prevent multiple auto-triggers
let readyCount = 0;
let totalDebaters = 0;

// Opposing headlines for debate
let opposingHeadlines = null; // Stores { position1, position2 }
let winningCluster = null; // Stores the winning cluster from voting
let headlinesLoading = false; // Loading state

// Generated debate arguments from cluster keywords
let debateQuestion = null; // Generated question string
let debatePositions = null; // { group1: { stance, keywords }, group2: { stance, keywords } }

// Tracking for trending detection
let clusterSizeHistory = new Map(); // Track cluster sizes over time
let lastClusterUpdate = Date.now();

// Database selection for similarity calculation
let currentDatabase = 'transformer'; // Using transformer model for local similarity calculations

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

// Debate topics loaded from JSON
let debateTopics = [];

// Load debate topics from server
async function loadDebateTopics() {
    try {
        const response = await fetch('http://localhost:3000/server/debate-statements.json');
        const data = await response.json();
        debateTopics = data.topics;
        console.log(`📚 Loaded ${debateTopics.length} debate topics`);
    } catch (error) {
        console.error('Failed to load debate topics:', error);
    }
}

// Match cluster keywords to best debate topic
function matchClusterToTopic(clusterKeywords) {
    if (!debateTopics || debateTopics.length === 0) return null;
    
    let bestMatch = null;
    let bestScore = 0;
    
    debateTopics.forEach(topic => {
        // Calculate keyword overlap
        let score = 0;
        clusterKeywords.forEach(clusterKw => {
            topic.keywords.forEach(topicKw => {
                if (clusterKw.toLowerCase().includes(topicKw.toLowerCase()) ||
                    topicKw.toLowerCase().includes(clusterKw.toLowerCase())) {
                    score += 1;
                }
            });
        });
        
        if (score > bestScore) {
            bestScore = score;
            bestMatch = topic;
        }
    });
    
    return bestMatch;
}

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
    },
    
    // Advanced cluster quality evaluation - semantic-first approach
    evaluateClusterQuality(cluster) {
        let score = 0;
        
        // 1. Semantic strength (50% weight) - most important
        const semanticScore = this.evaluateSemanticStrength(cluster) * 0.5;
        score += semanticScore;
        
        // 2. Cluster size bonus (30% weight) - more posts = more confidence
        const sizeScore = Math.min(cluster.nodes.length / 3, 1) * 0.3;
        score += sizeScore;
        
        // 3. Keyword diversity (20% weight) - varied keywords = broader topic
        const diversityScore = this.evaluateKeywordDiversity(cluster.keywords) * 0.2;
        score += diversityScore;
        
        return score;
    },
    
    // Evaluate semantic strength based on embedding quality
    evaluateSemanticStrength(cluster) {
        if (!cluster.centroid || cluster.centroid.length === 0) return 0.3;
        
        // Calculate centroid magnitude (semantic richness)
        let magnitude = 0;
        for (let i = 0; i < cluster.centroid.length; i++) {
            magnitude += cluster.centroid[i] * cluster.centroid[i];
        }
        magnitude = Math.sqrt(magnitude);
        
        // Normalized magnitude indicates semantic strength
        const strengthScore = Math.min(magnitude / 10, 1);
        
        // If multiple posts, also check coherence
        if (cluster.nodes.length >= 2) {
            const coherence = this.evaluateSemanticCoherence(cluster);
            return (strengthScore + coherence) / 2;
        }
        
        return strengthScore;
    },
    
    // Evaluate keyword diversity
    evaluateKeywordDiversity(keywords) {
        if (!keywords || keywords.length === 0) return 0;
        if (keywords.length === 1) return 0.5;
        
        const uniqueWords = new Set(keywords.map(k => k.toLowerCase().trim()));
        const diversityRatio = uniqueWords.size / Math.max(keywords.length, 1);
        return Math.min(diversityRatio * 1.2, 1);
    },
    
    
    // Evaluate semantic coherence of cluster
    evaluateSemanticCoherence(cluster) {
        if (cluster.nodes.length < 2) return 0.7; // Single posts get benefit of doubt
        
        // Calculate average similarity between all pairs of nodes
        let totalSimilarity = 0;
        let pairCount = 0;
        
        for (let i = 0; i < cluster.nodes.length; i++) {
            for (let j = i + 1; j < cluster.nodes.length; j++) {
                const sim = this.calculateSimilarity(
                    cluster.nodes[i].embedding,
                    cluster.nodes[j].embedding
                );
                totalSimilarity += sim;
                pairCount++;
            }
        }
        
        return pairCount > 0 ? totalSimilarity / pairCount : 0.7;
    },
    
    // Merge similar clusters (typos, related topics)
    mergeSimilarClusters(similarityThreshold = 0.7) {
        const beforeCount = this.clusters.length;
        const merged = new Set();
        this.mergePairs = []; // Store merge pairs for visualization
        
        for (let i = 0; i < this.clusters.length; i++) {
            if (merged.has(i)) continue;
            
            for (let j = i + 1; j < this.clusters.length; j++) {
                if (merged.has(j)) continue;
                
                const similarity = this.calculateSimilarity(
                    this.clusters[i].centroid,
                    this.clusters[j].centroid
                );
                
                if (similarity > similarityThreshold) {
                    console.log(`🔗 Merging similar clusters: "${this.clusters[i].keywords.slice(0, 2).join(', ')}" + "${this.clusters[j].keywords.slice(0, 2).join(', ')}" (similarity: ${(similarity * 100).toFixed(0)}%)`);
                    
                    // Store merge pair for visualization
                    this.mergePairs.push({
                        cluster1: this.clusters[i],
                        cluster2: this.clusters[j],
                        similarity: similarity
                    });
                    
                    // Merge j into i
                    this.clusters[i].nodes.push(...this.clusters[j].nodes);
                    this.clusters[i].keywords = [...new Set([...this.clusters[i].keywords, ...this.clusters[j].keywords])];
                    this.clusters[i].strength += this.clusters[j].strength;
                    
                    // Update centroid (weighted average)
                    const weight1 = this.clusters[i].nodes.length;
                    const weight2 = this.clusters[j].nodes.length;
                    const totalWeight = weight1 + weight2;
                    
                    this.clusters[i].centroid = this.clusters[i].centroid.map((val, idx) => 
                        (val * weight1 + this.clusters[j].centroid[idx] * weight2) / totalWeight
                    );
                    
                    // Mark nodes from cluster j to move to cluster i's position
                    this.clusters[j].nodes.forEach(node => {
                        node.mergeTarget = this.clusters[i];
                    });
                    
                    merged.add(j);
                }
            }
        }
        
        // Remove merged clusters
        this.clusters = this.clusters.filter((_, idx) => !merged.has(idx));
        
        const mergedCount = beforeCount - this.clusters.length;
        if (mergedCount > 0) {
            console.log(`🔗 Merged ${mergedCount} similar clusters`);
        }
    },
    
    // Check if cluster label has basic structural validity
    hasBasicValidity(label) {
        if (!label || typeof label !== 'string') return false;
        
        const words = label.toLowerCase().trim().split(/\s+/);
        
        // Must have at least one word
        if (words.length === 0) return false;
        
        // Can't end with conjunction/preposition
        const lastWord = words[words.length - 1];
        if (['and', 'or', 'but', 'with', 'of', 'in', 'at', 'to', 'for'].includes(lastWord)) {
            console.log(`❌ Invalid: "${label}" ends with conjunction/preposition`);
            return false;
        }
        
        // Must have at least one non-stop-word
        const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'with'];
        const contentWords = words.filter(w => !stopWords.includes(w));
        if (contentWords.length === 0) {
            console.log(`❌ Invalid: "${label}" has no content words`);
            return false;
        }
        
        return true;
    },
    
    // Check if words in cluster label are semantically coherent
    async hasSelfCoherence(label) {
        if (!label || typeof label !== 'string') return false;
        
        const words = label.toLowerCase().trim().split(/\s+/);
        
        // Filter out stop words for coherence check
        const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'with', 'of', 'in', 'at'];
        const contentWords = words.filter(w => !stopWords.includes(w));
        
        // Simplified coherence check (client-side, no embeddings needed)
        // Just check if we have meaningful content words
        if (contentWords.length === 0) {
            console.log(`❌ Invalid: "${label}" has no content words`);
            return false;
        }
        
        // Accept all labels with content words
        // Semantic coherence will be validated server-side during statement matching
        return true;
    },
    
    // Filter clusters by quality threshold and semantic validity
    async filterLowQualityClusters(qualityThreshold = 0.35) {
        const beforeCount = this.clusters.length;
        
        // First pass: structural validation (synchronous)
        this.clusters = this.clusters.filter(cluster => {
            const label = cluster.label || cluster.keywords.slice(0, 3).join(' ');
            
            // Check basic structural validity
            if (!this.hasBasicValidity(label)) {
                console.log(`❌ Rejected cluster "${label}" (structural issues)`);
                return false;
            }
            
            return true;
        });
        
        // Second pass: semantic coherence (async)
        const coherenceChecks = await Promise.all(
            this.clusters.map(async cluster => {
                const label = cluster.label || cluster.keywords.slice(0, 3).join(' ');
                const isCoherent = await this.hasSelfCoherence(label);
                return { cluster, isCoherent };
            })
        );
        
        this.clusters = coherenceChecks
            .filter(({ isCoherent }) => isCoherent)
            .map(({ cluster }) => cluster);
        
        // Third pass: quality score filtering
        this.clusters = this.clusters.filter(cluster => {
            const quality = this.evaluateClusterQuality(cluster);
            cluster.qualityScore = quality; // Store for visualization
            
            if (quality < qualityThreshold) {
                console.log(`❌ Rejected weak cluster "${cluster.keywords.slice(0, 2).join(', ')}" (quality: ${(quality * 100).toFixed(0)}%, ${cluster.nodes.length} posts)`);
                return false;
            }
            
            console.log(`✅ Accepted cluster "${cluster.keywords.slice(0, 2).join(', ')}" (quality: ${(quality * 100).toFixed(0)}%, ${cluster.nodes.length} posts)`);
            return true;
        });
        
        const removedCount = beforeCount - this.clusters.length;
        if (removedCount > 0) {
            console.log(`🧹 Filtered out ${removedCount} invalid/weak clusters`);
        }
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
        
        // Get keywords from cluster registry
        const clusterData = clusterRegistry.clusters.find(c => c.id === clusterId);
        const keywords = clusterData?.keywords || label.toLowerCase().split(' ');
        
        clusters.push({
            id: clusterId,
            label: label,
            count: count,
            color: color,
            posts: posts,
            keywords: keywords
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
        
        // Match cluster to predefined JSON topic
        const matchedTopic = matchClusterToTopic(sortedKeywords);
        
        if (matchedTopic) {
            // Use JSON topic name
            clusterLabels[cluster.id] = matchedTopic.name;
            cluster.topicData = matchedTopic; // Store full topic data for debate statements
            console.log(`🎯 Cluster ${cluster.id} matched to topic: "${matchedTopic.name}"`);
        } else if (sortedKeywords.length === 0) {
            clusterLabels[cluster.id] = 'General Discussion';
        } else {
            // Fallback to organic label if no match
            const topKeywords = sortedKeywords.slice(0, 2);
            const label = generateBroaderTopicName(topKeywords);
            clusterLabels[cluster.id] = label;
        }
    });
    
    // Merge clusters with same topicData to eliminate duplicates
    const topicGroups = new Map();
    clusterRegistry.clusters.forEach(cluster => {
        if (!cluster.topicData) return;
        
        const topicName = cluster.topicData.name;
        if (!topicGroups.has(topicName)) {
            topicGroups.set(topicName, []);
        }
        topicGroups.get(topicName).push(cluster);
    });
    
    console.log(`📊 Topic groups found: ${topicGroups.size}`);
    topicGroups.forEach((clusters, topicName) => {
        console.log(`   - "${topicName}": ${clusters.length} clusters`);
    });
    
    // Merge duplicate topic clusters
    const clustersToRemove = [];
    topicGroups.forEach((clusters, topicName) => {
        if (clusters.length > 1) {
            console.log(`🔗 Merging ${clusters.length} clusters for topic "${topicName}"`);
            
            // Keep first cluster, merge others into it
            const mainCluster = clusters[0];
            for (let i = 1; i < clusters.length; i++) {
                const mergeCluster = clusters[i];
                
                // Move all nodes to main cluster
                mergeCluster.nodes.forEach(node => {
                    mainCluster.nodes.push(node);
                    node.cluster = mainCluster.id;
                    node.clusterColor = mainCluster.color;
                });
                
                clustersToRemove.push(mergeCluster.id);
            }
            
            console.log(`✅ Merged into cluster ${mainCluster.id} with ${mainCluster.nodes.length} posts`);
        }
    });
    
    // Remove merged clusters
    if (clustersToRemove.length > 0) {
        clusterRegistry.clusters = clusterRegistry.clusters.filter(c => !clustersToRemove.includes(c.id));
        console.log(`🗑️ Removed ${clustersToRemove.length} duplicate topic clusters`);
        console.log(`📊 Final cluster count: ${clusterRegistry.clusters.length} unique topics`);
    }
    
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

// Position nodes into spatial clusters
function positionNodesInClusters() {
    if (nodes.length === 0) return;
    
    // Group nodes by cluster
    const clusterGroups = new Map();
    nodes.forEach(node => {
        const clusterId = node.cluster !== undefined ? node.cluster : 0;
        if (!clusterGroups.has(clusterId)) {
            clusterGroups.set(clusterId, []);
        }
        clusterGroups.get(clusterId).push(node);
    });
    
    // Calculate cluster positions in a circle around the screen
    const numClusters = clusterGroups.size;
    const centerX = width / 2;
    const centerY = height / 2;
    const clusterRadius = Math.min(width, height) * 0.35; // Distance from center
    
    let clusterIndex = 0;
    clusterGroups.forEach((clusterNodes, clusterId) => {
        // Calculate cluster center position
        const angle = (clusterIndex / numClusters) * TWO_PI;
        const clusterCenterX = centerX + cos(angle) * clusterRadius;
        const clusterCenterY = centerY + sin(angle) * clusterRadius;
        
        // Position nodes in a tight group around cluster center
        const spreadRadius = 80; // How spread out nodes are within cluster
        clusterNodes.forEach((node, i) => {
            const nodeAngle = (i / clusterNodes.length) * TWO_PI;
            const nodeRadius = random(20, spreadRadius);
            
            node.x = clusterCenterX + cos(nodeAngle) * nodeRadius;
            node.y = clusterCenterY + sin(nodeAngle) * nodeRadius;
            
            // Reset velocities
            node.vx = 0;
            node.vy = 0;
        });
        
        clusterIndex++;
    });
    
    console.log(`📍 Positioned ${nodes.length} nodes into ${numClusters} spatial clusters`);
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
            
            // Merge similar clusters (handles typos and related topics automatically)
            clusterRegistry.mergeSimilarClusters(0.7);
            
            // Filter out low-quality clusters - more lenient threshold
            clusterRegistry.filterLowQualityClusters(0.35);
            
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
                    keywords: c.keywords, // Include keywords for headline fetching
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
                
                // Draw white text on top
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
                // Black text for filled mode
                fill(0, 255);
                noStroke();
                text(label, centerX, centerY);
                textStyle(NORMAL);
            }
            pop();
        }
    });
    
    // Update node physics (only if clustering is enabled)
    if (clusteringEnabled) {
        nodes.forEach(node => {
            node.update();
        });
    }
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
    // Update physics for gentle floating animation
    nodes.forEach(node => {
        node.update();
    });
    
    // Draw each post as a rounded rectangle with stroke outline
    nodes.forEach(node => {
        
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
            if (clusteringEnabled) {
                node.update();
            }
            
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
                    
                    const tl = field[i][j] >= fieldThreshold;
                    const tr = field[i + 1][j] >= fieldThreshold;
                    const br = field[i + 1][j + 1] >= fieldThreshold;
                    const bl = field[i][j + 1] >= fieldThreshold;
                    
                    const cellValue = tl * 8 + tr * 4 + br * 2 + bl * 1;
                    
                    if (cellValue !== 0 && cellValue !== 15) {
                        contours.push({ x, y, value: cellValue });
                    }
                }
            }
            
            // Draw metaball outline
            if (contours.length > 0) {
                push();
                
                // Fill with cluster color
                fill(255);
                noStroke();
                
                beginShape();
                const hull = convexHull(contours);
                const smoothed = smoothHull(hull);
                smoothed.forEach(p => vertex(p.x, p.y));
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
        
        // Update physics for all nodes (only if clustering is enabled)
        if (clusteringEnabled) {
            groupNodes.forEach(node => node.update());
        }
        
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
    
    background(0);
    
    // Update physics - gentle floating during countdown, full clustering after timer
    // BUT disable physics during clustering animation (posts should stay at original positions)
    if (!clusteringAnimationActive) {
        nodes.forEach(node => node.update());
    }
    
    // During voting phase, don't draw individual posts - only show cluster circles with centered labels
    if (!votingPhaseActive) {
        // Draw posts as text (static positions during countdown, physics-based after clustering)
        nodes.forEach((node, index) => {
        push();
        
        // Initialize pointer animation properties
        if (!node.pointerAngle) node.pointerAngle = 0;
        if (!node.pointerTargetAngle) node.pointerTargetAngle = 0;
        if (!node.pointerVelocity) node.pointerVelocity = 0;
        if (!node.pointerOffset) node.pointerOffset = 0;
        
        colorMode(RGB, 255);
        const textColor = color(255, 255, 255);
        
        // Use node's physics-based position
        const postX = node.x;
        const postY = node.y;
        
        // Calculate angle to center for pointer direction
        const centerX = width / 2;
        const centerY = height / 2;
        const angleToCenter = atan2(centerY - postY, centerX - postX);
        
        // Spring physics for smooth pointer rotation
        node.pointerTargetAngle = angleToCenter;
        const springStrength = 0.08;
        const damping = 0.85;
        const angleDiff = node.pointerTargetAngle - node.pointerAngle;
        node.pointerVelocity += angleDiff * springStrength;
        node.pointerVelocity *= damping;
        node.pointerAngle += node.pointerVelocity;
        
        // Subtle oscillation for floaty effect
        node.pointerOffset += 0.05;
        const floatyOffset = sin(node.pointerOffset) * 0.03;
        const animatedAngle = node.pointerAngle + floatyOffset;
        
        // Calculate text dimensions
        textSize(24);
        if (customFontSemibold) {
            textFont(customFontSemibold);
        }
        
        const lineHeight = 30;
        const letterSpacing = 24 * 0.25;
        const padding = 12;
        
        // Measure text width with letter spacing
        let maxWidth = 0;
        node.lines.forEach(line => {
            let lineWidth = 0;
            for (let j = 0; j < line.length; j++) {
                lineWidth += textWidth(line.charAt(j)) + letterSpacing;
            }
            if (lineWidth > maxWidth) maxWidth = lineWidth;
        });
        
        const boxWidth = maxWidth + padding * 2;
        const boxHeight = node.lines.length * lineHeight + padding * 2;
        const boxX = postX - padding;
        const boxY = postY - padding;
        
        // Draw text with MD Thermochrome Medium font and 25% letter spacing (no background)
        fill(textColor);
        textAlign(LEFT, TOP);
        const textX = postX;
        const textY = postY;
        
        // Draw each line with letter spacing
        node.lines.forEach((line, i) => {
            let xOffset = 0;
            for (let j = 0; j < line.length; j++) {
                const char = line.charAt(j);
                text(char, textX + xOffset, textY + i * lineHeight);
                xOffset += textWidth(char) + letterSpacing;
            }
        });
        
        pop();
        });
    }
    
    // Draw cluster outlines and labels ONLY during voting phase
    // During clustering animation, the phase-specific code handles all visualization
    if (clusteringEnabled && votingPhaseActive && !clusteringAnimationActive) {
        push();
        // Group nodes by cluster (only clusters with topicData)
        const clusterGroups = new Map();
        nodes.forEach(node => {
            const clusterId = node.cluster !== undefined ? node.cluster : 0;
            
            // Only include nodes from clusters that have topicData (matched to JSON topics)
            const cluster = clusterRegistry.clusters.find(c => c.id === clusterId);
            if (!cluster || !cluster.topicData) return; // Skip rejected clusters
            
            if (!clusterGroups.has(clusterId)) {
                clusterGroups.set(clusterId, []);
            }
            clusterGroups.get(clusterId).push(node);
        });
        
        // Draw cluster labels and dashed outlines
        clusterGroups.forEach((clusterNodes, clusterId) => {
            if (clusterNodes.length === 0) return;
            
            // Calculate cluster center based on current node positions
            const xs = clusterNodes.map(n => n.x);
            const ys = clusterNodes.map(n => n.y);
            const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
            const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
            
            // During voting phase, use fixed radius and centered labels (matching clustering end state)
            // Otherwise, calculate radius based on spread
            const radius = votingPhaseActive ? 150 : Math.max(100, Math.max(...clusterNodes.map(n => {
                const dx = n.x - centerX;
                const dy = n.y - centerY;
                return Math.sqrt(dx * dx + dy * dy);
            })) + 50);
            
            // Get cluster color (needed for both outline and label)
            const clusterColor = clusterNodes[0].clusterColor || { h: 0, s: 70, b: 80 };
            
            // Draw dashed circle outline
            push();
            noFill();
            colorMode(HSB);
            stroke(clusterColor.h, clusterColor.s, clusterColor.b, 255);
            strokeWeight(3);
            drawingContext.setLineDash([10, 10]);
            circle(centerX, centerY, radius * 2);
            drawingContext.setLineDash([]);
            pop();
            
            // Draw cluster label - centered during voting phase, above circle otherwise
            push();
            colorMode(HSB);
            fill(clusterColor.h, clusterColor.s, clusterColor.b, 255);
            textAlign(CENTER, CENTER);
            textSize(votingPhaseActive ? 28 : 32);
            if (customFontSemibold) {
                textFont(customFontSemibold);
            }
            const label = clusterLabels[clusterId] || `Cluster ${clusterId}`;
            // Center label in circle during voting, above circle otherwise
            const labelY = votingPhaseActive ? centerY : centerY - radius - 50;
            text(label, centerX, labelY);
            pop();
        });
        pop();
    }
    
    colorMode(HSB);
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

// Fetch opposing headlines based on cluster keywords
async function fetchOpposingHeadlines(clusterKeywords) {
    try {
        console.log('🔍 Fetching opposing headlines for cluster keywords:', clusterKeywords);
        
        const response = await fetch('http://localhost:3000/api/news/opposing-headlines', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords: clusterKeywords })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Received opposing headlines:', data);
        return data; // { position1, position2 }
    } catch (error) {
        console.error('Error fetching opposing headlines:', error);
        return null;
    }
}

// Analyze cluster keywords and generate opposing positions
async function analyzeKeywordsForDebate(keywords, clusterPosts = []) {
    console.log('🔍 Analyzing cluster for debate statement');
    console.log('   Keywords:', keywords);
    console.log('   Posts:', clusterPosts.length);
    
    if (!keywords || keywords.length < 2) {
        // Fallback if not enough keywords
        return {
            question: `What is the best approach to this topic?`,
            group1: { stance: 'Support', keywords: keywords?.slice(0, 2) || [] },
            group2: { stance: 'Question', keywords: keywords?.slice(2, 4) || [] }
        };
    }
    
    try {
        // Use server endpoint with semantic statement matching
        const response = await fetch('http://localhost:3000/api/analyze-keywords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords, clusterPosts })
        });
        
        if (!response.ok) {
            throw new Error('Keyword analysis failed');
        }
        
        const result = await response.json();
        console.log('✅ Generated debate positions:', result);
        return result; // { question, group1, group2 }
        
    } catch (error) {
        console.error('Error analyzing keywords:', error);
        
        // Simple fallback: split keywords in half
        const mid = Math.floor(keywords.length / 2);
        const group1Keywords = keywords.slice(0, mid);
        const group2Keywords = keywords.slice(mid);
        
        return {
            question: `Should we prioritize ${group1Keywords[0]} or ${group2Keywords[0]}?`,
            group1: { 
                stance: `Prioritize ${group1Keywords[0]}`, 
                keywords: group1Keywords 
            },
            group2: { 
                stance: `Prioritize ${group2Keywords[0]}`, 
                keywords: group2Keywords 
            }
        };
    }
}

// Display debate headlines on main screen
function displayDebateHeadlines(position1, position2) {
    background(0);
    
    // Position 1 (Supportive - Blue)
    push();
    fill(100, 200, 255); // Blue
    textAlign(CENTER, CENTER);
    textSize(32);
    if (customFontSemibold) {
        textFont(customFontSemibold);
    }
    text('POSITION A: SUPPORTIVE', width / 2, height / 3 - 100);
    
    textSize(24);
    fill(255);
    // Wrap text if too long
    const maxWidth = width * 0.8;
    const words1 = position1.title.split(' ');
    let line1 = '';
    let y1 = height / 3;
    words1.forEach(word => {
        const testLine = line1 + word + ' ';
        if (textWidth(testLine) > maxWidth && line1.length > 0) {
            text(line1, width / 2, y1);
            line1 = word + ' ';
            y1 += 30;
        } else {
            line1 = testLine;
        }
    });
    text(line1, width / 2, y1);
    
    // Source
    textSize(16);
    fill(150);
    text(`Source: ${position1.source}`, width / 2, y1 + 40);
    pop();
    
    // VS
    push();
    fill(255);
    textSize(48);
    if (customFontSemibold) {
        textFont(customFontSemibold);
    }
    text('VS', width / 2, height / 2);
    pop();
    
    // Position 2 (Critical - Red)
    push();
    fill(255, 100, 100); // Red
    textAlign(CENTER, CENTER);
    textSize(32);
    if (customFontSemibold) {
        textFont(customFontSemibold);
    }
    text('POSITION B: CRITICAL', width / 2, 2 * height / 3 - 100);
    
    textSize(24);
    fill(255);
    // Wrap text if too long
    const words2 = position2.title.split(' ');
    let line2 = '';
    let y2 = 2 * height / 3;
    words2.forEach(word => {
        const testLine = line2 + word + ' ';
        if (textWidth(testLine) > maxWidth && line2.length > 0) {
            text(line2, width / 2, y2);
            line2 = word + ' ';
            y2 += 30;
        } else {
            line2 = testLine;
        }
    });
    text(line2, width / 2, y2);
    
    // Source
    textSize(16);
    fill(150);
    text(`Source: ${position2.source}`, width / 2, y2 + 40);
    pop();
}

// Global function to test opposing headlines (for testing)
window.testOpposingHeadlines = async function(keywords = ['politics', 'government']) {
    console.log('🧪 Testing opposing headlines with keywords:', keywords);
    
    const headlines = await fetchOpposingHeadlines(keywords);
    
    if (headlines) {
        console.log('✅ Headlines fetched successfully');
        console.log('Position 1 (Supportive):', headlines.position1.title);
        console.log('Position 2 (Critical):', headlines.position2.title);
        
        // Display them
        displayDebateHeadlines(headlines.position1, headlines.position2);
    } else {
        console.error('❌ Failed to fetch headlines');
    }
};

// Global function to skip to topic reveal screen (for testing)
window.skipToReveal = function() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Create placeholder cluster data with keywords for testing
        const placeholderCluster = {
            id: 0,
            label: 'Politics and Governance',
            keywords: ['politics', 'government', 'governance', 'policy', 'democracy'],
            color: {
                h: Math.random() * 360, // Random hue
                s: 70,
                b: 80
            },
            votes: 5,
            nodes: []
        };
        
        // Send skip command to mobile clients
        ws.send(JSON.stringify({
            type: 'skip_to_reveal',
            cluster: placeholderCluster
        }));
        
        console.log('⏭️ Skip to reveal requested with placeholder data');
    } else {
        console.error('WebSocket not connected');
    }
};

// Global function to skip to role assignment (for testing)
window.skipToRoles = function() {
    console.log('🎭 Starting role assignment...');
    
    // Ensure we have a winning cluster - if not, winningCluster should already be set from topic reveal
    if (!winningCluster) {
        console.warn('⚠️ No winning cluster set! Using fallback.');
        winningCluster = {
            id: 0,
            label: 'Climate Change and Environment',
            color: { h: 45, s: 70, b: 80 },
            keywords: ['climate', 'environment', 'policy', 'sustainability', 'action']
        };
    }
    
    // Ensure reveal cluster color is set
    if (!revealClusterColor) {
        revealClusterColor = winningCluster.color;
    }
    
    // Stop reveal animation if active
    revealAnimationActive = false;
    revealPhase = 'idle';
    
    // Start role assignment animation
    startRoleAssignment();
};

// Global function to start debate voting (for testing)
window.startDebateVoting = async function() {
    console.log('🎤 Starting debate voting...');
    
    // Ensure we have a winning cluster with keywords
    if (!winningCluster) {
        console.warn('⚠️ No winning cluster set in startDebateVoting! Using fallback.');
        winningCluster = {
            id: 0,
            label: 'Politics and governance',
            color: { h: 45, s: 70, b: 80 },
            keywords: ['politics', 'governance', 'policy', 'reform', 'stability']
        };
    } else if (!winningCluster.keywords || winningCluster.keywords.length === 0) {
        // If cluster exists but has no keywords, extract from cluster's posts
        console.warn('⚠️ Winning cluster has no keywords! Extracting from posts.');
        
        // Collect all keywords from posts in this cluster
        const allKeywords = new Set();
        winningCluster.nodes.forEach(node => {
            if (node.keywords && Array.isArray(node.keywords)) {
                node.keywords.forEach(kw => allKeywords.add(kw));
            }
        });
        
        // Filter out stop words and short words
        const stopWords = ['and', 'or', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
        const validKeywords = Array.from(allKeywords).filter(kw => 
            kw.length > 2 && !stopWords.includes(kw.toLowerCase())
        );
        
        winningCluster.keywords = validKeywords.length > 0 ? validKeywords : ['discussion', 'debate', 'topic'];
        console.log('📝 Extracted keywords from posts:', winningCluster.keywords);
    }
    
    // Debate question should already be generated by generateDebateQuestion() before role assignment
    // If not, generate it now as fallback
    if (!debateQuestion) {
        console.warn('⚠️ Debate question not set! Generating now...');
        await generateDebateQuestion();
    }
    
    // Hide timer and QR code
    const headlineDisplay = document.getElementById('headlineDisplay');
    const controlsContainer = document.getElementById('controlsContainer');
    if (headlineDisplay) {
        headlineDisplay.style.display = 'none';
    }
    if (controlsContainer) {
        controlsContainer.style.display = 'none';
    }
    
    // Activate debate voting
    debateVotingActive = true;
    roleAssignmentActive = false;
    revealAnimationActive = false;
    votingPhaseActive = false; // Hide posts/clusters
    
    // Reset vote counts
    redVoteCount = 0;
    greenVoteCount = 0;
    
    // Start debate timer
    startDebateTimer();
    
    // Ensure debate question is set
    if (!debateQuestion) {
        console.warn('⚠️ debateQuestion is not set! Using cluster label as fallback');
        debateQuestion = winningCluster.label || 'Should we discuss this topic?';
    }
    
    // Broadcast to mobile clients with cluster info AND debate positions
    console.log('📤 Broadcasting debate start to mobile:');
    console.log('   Cluster name:', winningCluster.label);
    console.log('   Cluster color:', winningCluster.color);
    console.log('   Debate question:', debateQuestion);
    console.log('   debateQuestion type:', typeof debateQuestion);
    console.log('   debateQuestion length:', debateQuestion?.length);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        const message = {
            type: 'start_debate_voting',
            clusterName: winningCluster.label,
            clusterColor: winningCluster.color,
            debateQuestion: debateQuestion,
            group1Position: debatePositions?.group1,
            group2Position: debatePositions?.group2
        };
        console.log('📤 Full message:', JSON.stringify(message, null, 2));
        ws.send(JSON.stringify(message));
    }
    
    console.log('🎤 Debate voting started');
};

// Start debate timer with alternating turns
function startDebateTimer() {
    // Reset timer state
    currentTurnNumber = 0;
    currentTurn = 1; // Start with Group 1
    turnTimeRemaining = 30;
    debateTimerActive = true;
    
    // Clear any existing timer
    if (debateTimerInterval) {
        clearInterval(debateTimerInterval);
    }
    
    console.log('⏱️ Starting debate timer - Group 1 turn');
    
    // Broadcast initial timer state
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'debate_timer_update',
            currentTurn: currentTurn,
            turnTimeRemaining: turnTimeRemaining,
            currentTurnNumber: currentTurnNumber,
            totalTurns: totalTurns,
            debateOver: false
        }));
    }
    
    // Start countdown
    debateTimerInterval = setInterval(() => {
        turnTimeRemaining--;
        
        // Broadcast timer update to mobile clients
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'debate_timer_update',
                currentTurn: currentTurn,
                turnTimeRemaining: turnTimeRemaining,
                currentTurnNumber: currentTurnNumber,
                totalTurns: totalTurns,
                debateOver: false
            }));
        }
        
        if (turnTimeRemaining <= 0) {
            // Move to next turn
            currentTurnNumber++;
            
            if (currentTurnNumber >= totalTurns) {
                // Debate over
                debateTimerActive = false;
                clearInterval(debateTimerInterval);
                debateTimerInterval = null;
                console.log('🏁 Debate over!');
                
                // Store final vote balance
                finalVoteBalance = window.listenerVoteBalance || 0;
                
                // Start phase 1: Debate Over screen
                debateOverPhase = 'debate-over';
                console.log('📺 Phase 1: Debate Over');
                
                // After 5 seconds, move to vote counting
                setTimeout(() => {
                    debateOverPhase = 'vote-counting';
                    voteCountAnimation = 0;
                    console.log('📺 Phase 2: Vote Counting');
                    
                    // After 8 seconds, show winner (enough time for slow count)
                    setTimeout(() => {
                        debateOverPhase = 'winner';
                        winnerGroup = finalVoteBalance < 0 ? 1 : 2;
                        console.log(`📺 Phase 3: Winner - Group ${winnerGroup}`);
                    }, 8000);
                }, 5000);
                
                // Broadcast debate over state
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'debate_timer_update',
                        currentTurn: currentTurn,
                        turnTimeRemaining: 0,
                        currentTurnNumber: currentTurnNumber,
                        totalTurns: totalTurns,
                        debateOver: true
                    }));
                }
            } else {
                // Switch turns
                currentTurn = currentTurn === 1 ? 2 : 1;
                turnTimeRemaining = 30;
                console.log(`⏱️ Turn ${currentTurnNumber + 1} - Group ${currentTurn}`);
                
                // Broadcast turn switch
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'debate_timer_update',
                        currentTurn: currentTurn,
                        turnTimeRemaining: turnTimeRemaining,
                        currentTurnNumber: currentTurnNumber,
                        totalTurns: totalTurns,
                        debateOver: false
                    }));
                }
            }
        }
    }, 1000);
}

// Topic reveal animation for main display - with fade transition
function startTopicRevealAnimation(cluster) {
    console.log('🎬 startTopicRevealAnimation called');
    console.log('   Received cluster:', JSON.stringify(cluster, null, 2));
    
    // Prevent multiple simultaneous animations
    if (revealAnimationActive) {
        console.warn('⚠️ Reveal animation already active, ignoring duplicate call');
        return;
    }
    
    // Validate cluster
    if (!cluster) {
        console.error('❌ No cluster provided to startTopicRevealAnimation');
        return;
    }
    
    if (!cluster.keywords || !Array.isArray(cluster.keywords) || cluster.keywords.length === 0) {
        const labelWords = (cluster.label || 'discussion').toLowerCase().split(' ');
        cluster.keywords = labelWords.length > 0 ? labelWords : ['politics', 'government', 'policy'];
    }
    
    // Hide timer and QR code
    const headlineDisplay = document.getElementById('headlineDisplay');
    if (headlineDisplay) {
        headlineDisplay.style.display = 'none';
    }
    
    revealAnimationActive = true;
    revealClusterColor = cluster.color;
    revealPhase = 'fade-out';
    
    // Store winning cluster for later use
    winningCluster = cluster;
    console.log('🏆 Winning cluster stored:', cluster.label);
    console.log('   Keywords:', cluster.keywords);
    
    // Start fade-to-black animation
    animateFadeToBlack();
}

// Animate fade to black, then fade in reveal screen
function animateFadeToBlack() {
    const startTime = Date.now();
    const fadeOutDuration = 800; // 0.8 seconds fade to black
    const fadeInDuration = 800; // 0.8 seconds fade in
    const holdDuration = 200; // Hold black for 0.2 seconds
    
    function animate() {
        const elapsed = Date.now() - startTime;
        
        if (elapsed < fadeOutDuration) {
            // Phase 1: Fade to black
            const progress = elapsed / fadeOutDuration;
            window.revealFadeProgress = progress;
            revealPhase = 'fade-out';
            requestAnimationFrame(animate);
        } else if (elapsed < fadeOutDuration + holdDuration) {
            // Phase 2: Hold black
            window.revealFadeProgress = 1;
            revealPhase = 'fade-out';
            requestAnimationFrame(animate);
        } else if (elapsed < fadeOutDuration + holdDuration + fadeInDuration) {
            // Phase 3: Fade in reveal screen
            const fadeInElapsed = elapsed - fadeOutDuration - holdDuration;
            const progress = fadeInElapsed / fadeInDuration;
            window.revealFadeProgress = 1 - progress; // Reverse for fade in
            revealPhase = 'fade-in';
            requestAnimationFrame(animate);
        } else {
            // Phase 4: Show static reveal
            window.revealFadeProgress = 0;
            revealPhase = 'static';
            console.log('🎬 Fade animation complete - showing reveal');
            
            // Automatically trigger role assignment after 3.5 seconds (only once)
            if (!roleAssignmentAutoTriggered) {
                roleAssignmentAutoTriggered = true;
                setTimeout(() => {
                    console.log('🎭 Auto-triggering role assignment after reveal');
                    startRoleAssignment();
                }, 3500);
            }
        }
    }
    
    animate();
}

// Generate debate question from winning cluster
async function generateDebateQuestion() {
    if (!winningCluster) {
        console.error('❌ No winning cluster found!');
        return;
    }
    
    console.log('📝 Generating debate question for cluster:', winningCluster.label);
    
    // Use cluster's stored topic data to select debate statement
    if (winningCluster.topicData && winningCluster.topicData.statements) {
        console.log('🎯 Using stored topic data:', winningCluster.topicData.name);
        console.log('   Available statements:', winningCluster.topicData.statements.length);
        
        // Pick random statement from this topic
        const randomIndex = Math.floor(Math.random() * winningCluster.topicData.statements.length);
        debateQuestion = winningCluster.topicData.statements[randomIndex];
        
        console.log('✅ Selected statement:', debateQuestion);
        console.log('   From topic:', winningCluster.topicData.name);
        
        // Generate simple opposing positions
        debatePositions = {
            question: debateQuestion,
            topicName: winningCluster.topicData.name,
            group1: { stance: 'Support', keywords: winningCluster.keywords?.slice(0, 3) || [] },
            group2: { stance: 'Question', keywords: winningCluster.keywords?.slice(3, 6) || [] }
        };
    } else if (winningCluster.keywords && winningCluster.keywords.length > 0) {
        console.warn('⚠️ No topicData found, falling back to API matching');
        console.log('   Keywords:', winningCluster.keywords);
        console.log('   Posts in cluster:', winningCluster.nodes?.length || 0);
        
        // Fallback: Pass cluster posts for semantic matching
        const clusterPosts = winningCluster.nodes?.map(node => ({
            content: node.content,
            keywords: node.keywords
        })) || [];
        
        debatePositions = await analyzeKeywordsForDebate(winningCluster.keywords, clusterPosts);
        debateQuestion = debatePositions.question;
        console.log('✅ Matched statement:', debateQuestion);
        if (debatePositions.topicName) {
            console.log('   Topic:', debatePositions.topicName);
            winningCluster.label = debatePositions.topicName;
        }
    } else {
        console.error('❌ No topic data or keywords found! Using cluster label as fallback');
        debateQuestion = `Should we discuss ${winningCluster.label}?`;
    }
}

// Start role assignment with dissolve transition
async function startRoleAssignment() {
    console.log('🎭 startRoleAssignment called');
    
    // Prevent multiple simultaneous role assignments
    if (roleAssignmentActive) {
        return;
    }
    
    // Force stop reveal animation if it's active
    if (revealAnimationActive) {
        console.log('🎭 Stopping reveal animation to start role assignment');
        revealAnimationActive = false;
        revealPhase = 'idle';
    }
    
    // Generate debate question BEFORE role assignment
    await generateDebateQuestion();
    
    // Hide timer and QR code
    const headlineDisplay = document.getElementById('headlineDisplay');
    if (headlineDisplay) {
        headlineDisplay.style.display = 'none';
    }
    
    roleAssignmentActive = true;
    roleAssignmentPhase = 'fade-out';
    
    // Assign roles to connected clients
    assignRolesToClients();
    
    // Start dissolve animation
    animateRoleAssignmentTransition();
}

// Assign roles to all connected clients
function assignRolesToClients() {
    // Get list of connected client IDs from server
    // For now, we'll broadcast the assignment request and let server handle it
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'assign_roles',
            distribution: {
                group1Percent: 30,
                group2Percent: 30,
                listenersPercent: 40
            },
            clusterName: winningCluster?.label,
            clusterColor: winningCluster?.color,
            debateArgument: debateQuestion || winningCluster?.label // Send actual debate question
        }));
        console.log('📤 Role assignment request sent to server with cluster:', winningCluster?.label);
        console.log('📝 Debate argument:', debateQuestion);
    }
}

// Animate role assignment transition: fade out reveal -> move topic up -> fade in circles
function animateRoleAssignmentTransition() {
    const startTime = Date.now();
    const fadeOutDuration = 800; // 0.8s fade to black
    const holdDuration = 200; // 0.2s hold
    const topicMoveDuration = 1000; // 1s topic moves to top
    const circlesFadeDuration = 800; // 0.8s circles fade in
    
    function animate() {
        const elapsed = Date.now() - startTime;
        
        if (elapsed < fadeOutDuration) {
            // Phase 1: Fade reveal screen to black
            const progress = elapsed / fadeOutDuration;
            window.roleAssignmentFadeProgress = progress;
            roleAssignmentPhase = 'fade-out';
            requestAnimationFrame(animate);
        } else if (elapsed < fadeOutDuration + holdDuration) {
            // Phase 2: Hold black
            window.roleAssignmentFadeProgress = 1;
            roleAssignmentPhase = 'fade-out';
            requestAnimationFrame(animate);
        } else if (elapsed < fadeOutDuration + holdDuration + topicMoveDuration) {
            // Phase 3: Topic moves to top
            const moveElapsed = elapsed - fadeOutDuration - holdDuration;
            topicMoveProgress = moveElapsed / topicMoveDuration;
            roleAssignmentPhase = 'topic-move';
            requestAnimationFrame(animate);
        } else if (elapsed < fadeOutDuration + holdDuration + topicMoveDuration + circlesFadeDuration) {
            // Phase 4: Circles fade in
            const circlesElapsed = elapsed - fadeOutDuration - holdDuration - topicMoveDuration;
            circlesFadeProgress = circlesElapsed / circlesFadeDuration;
            topicMoveProgress = 1; // Topic stays at top
            roleAssignmentPhase = 'circles-fade-in';
            requestAnimationFrame(animate);
        } else {
            // Phase 5: Static display
            topicMoveProgress = 1;
            circlesFadeProgress = 1;
            roleAssignmentPhase = 'static';
            console.log('🎭 Role assignment animation complete');
        }
    }
    
    animate();
}

// Animate blob growth to full screen
function animateRevealGrowth() {
    const startTime = Date.now();
    const duration = 2000; // 2 seconds for reveal animation
    const startSize = 80; // Initial metaball size
    const maxSize = Math.sqrt(width * width + height * height) * 1.2; // Diagonal coverage
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease-in-out cubic
        const eased = progress < 0.5 
            ? 4 * progress * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        
        // Interpolate from start size to max size
        revealBlobSize = startSize + (eased * (maxSize - startSize));
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Phase 2: Full coverage reached
            console.log('📺 Phase 2: Full coverage');
            revealPhase = 'full';
            revealBlobSize = maxSize; // Ensure it's at max
            
            // Phase 3: Start border animation immediately
            console.log('📺 Phase 3: Fading to border');
            animateToBorder();
        }
    }
    
    animate();
}

// Animate smooth transition from full color to border
function animateToBorder() {
    const startTime = Date.now();
    const duration = 1000; // 1 second fade
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        if (progress < 1) {
            // Still fading - keep in transition phase
            revealPhase = 'fading';
            window.borderFadeProgress = progress; // Store for draw loop
            requestAnimationFrame(animate);
        } else {
            // Fade complete - reset to idle to resume normal rendering
            console.log('📺 Dissolve complete - resuming normal rendering');
            revealPhase = 'idle';
            window.borderFadeProgress = 1;
            revealAnimationActive = false;
            revealClusterColor = null;
            
            // ========================================
            // 🎯 Start Debate Voting Interaction
            // ========================================
            console.log('🔍 About to start debate voting. Current winningCluster:', winningCluster);
            console.log('   Full cluster object:', JSON.stringify(winningCluster, null, 2));
            console.log('   Has keywords?', winningCluster?.keywords);
            
            if (!winningCluster) {
                console.error('❌ ERROR: winningCluster is null/undefined! This should not happen.');
                console.error('   This means winningCluster was cleared between reveal and debate start.');
            }
            
            startDebateVoting();
            // ========================================
        }
    }
    
    animate();
}

function connectWebSocket() {
    ws = new WebSocket('ws://localhost:8080');
    window.ws = ws; // Make accessible to control panel
    
    ws.onopen = () => {
        console.log('Display connected to server');
        ws.send(JSON.stringify({ type: 'register_display' }));
        
        // Notify server that main display loaded/refreshed
        ws.send(JSON.stringify({ type: 'display_loaded' }));
        
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
        
        if (data.type === 'clusters') {
            // Voting phase started - clusters sent to mobile
            votingPhaseActive = true;
            votingCountdownTime = 30; // 30 seconds voting timer (for testing)
            console.log('🗳️ Voting phase started');
        }
        
        if (data.type === 'winning_cluster') {
            // Received winning cluster from server after voting ended
            console.log('🏆 Received winning cluster from server');
            console.log('📦 Cluster data:', JSON.stringify(data.cluster, null, 2));
            console.log('   Votes:', data.votes);
            votingPhaseActive = false; // Hide voting text when animation starts
            
            // Start reveal animation on main display FIRST
            startTopicRevealAnimation(data.cluster);
            
            // Then broadcast to mobile clients (main display won't process this)
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'skip_to_reveal',
                    cluster: data.cluster
                }));
            }
        }
        
        if (data.type === 'skip_to_reveal') {
            // Only process if this is a manual skip (not from winning_cluster flow)
            // Main display already handled reveal in winning_cluster handler
            if (!revealAnimationActive) {
                console.log('🎬 Starting topic reveal animation on main display');
                console.log('📦 Received cluster data:', JSON.stringify(data.cluster, null, 2));
                votingPhaseActive = false; // Hide voting text when animation starts
                startTopicRevealAnimation(data.cluster);
            }
        }
        
        if (data.type === 'assign_roles') {
            // Mobile client requested role assignment, trigger on main display
            console.log('🎭 Received role assignment trigger from server');
            if (!roleAssignmentActive) {
                startRoleAssignment();
            }
        }
        
        if (data.type === 'debater_ready_update') {
            // Update ready count
            readyCount = data.readyCount;
            totalDebaters = data.totalDebaters;
            console.log(`✅ Ready update: ${readyCount}/${totalDebaters}`);
            
            // When all debaters are ready, generate debate question and start debate
            if (readyCount === totalDebaters && totalDebaters > 0 && !debateVotingActive) {
                console.log('🎯 All debaters ready! Generating debate question and starting debate...');
                startDebateVoting();
            }
        }
        
        if (data.type === 'listener_vote_update') {
            // Update listener vote balance for visual sync
            const { clientId, side, balance } = data;
            
            // Store vote balance
            window.listenerVoteBalance = balance;
            
            console.log(`🗳️ Listener vote update - Balance: ${balance} (${balance < 0 ? 'Red' : 'Green'} winning)`);
        }
        
        if (data.type === 'debate_vote_update') {
            // Update vote counts from server
            redVoteCount = data.red;
            greenVoteCount = data.green;
            console.log(`📊 Vote update - Red: ${redVoteCount}, Green: ${greenVoteCount}`);
        }
        
        if (data.type === 'start_debate_voting') {
            // Server triggered debate start - just set flags and start timer
            // Question should already be generated by this point
            debateVotingActive = true;
            roleAssignmentActive = false;
            votingPhaseActive = false;
            
            startDebateTimer();
            console.log('🎤 Starting debate voting on main display (from server)');
        }
        
        if (data.type === 'countdown_update') {
            // Update countdown timer display
            if (window.updateCountdownDisplay) {
                window.updateCountdownDisplay(data.time);
            }
            
            // Trigger clustering when timer reaches 00:00
            if (data.time === 0 && !timerCompleted) {
                timerCompleted = true;
                
                console.log('⏰ Timer completed! Running clustering algorithm...');
                logActivity('⏰ Timer completed - running clustering algorithm!', 'cluster');
                
                // Run clustering algorithm BEFORE animation starts
                (async () => {
                    // Save original post positions before clustering
                    nodes.forEach(node => {
                        node.originalX = node.x;
                        node.originalY = node.y;
                    });
                    
                    // Enable clustering
                    clusteringEnabled = true;
                    
                    // Step 1: Initial clustering
                    console.log('🔍 Step 1: Clustering similar posts...');
                    await recalculateSimilarities();
                    
                    // Step 2: Merge similar clusters
                    console.log('🔗 Step 2: Merging similar clusters...');
                    clusterRegistry.mergeSimilarClusters(0.7);
                    
                    // Step 3: Generate labels
                    console.log('🏷️ Step 3: Generating cluster labels...');
                    generateClusterLabels();
                    
                    // Step 4: Filter weak clusters
                    console.log('🧹 Step 4: Filtering weak clusters...');
                    await clusterRegistry.filterLowQualityClusters(0.35);
                    generateClusterLabels();
                    updateClusterListUI();
                    
                    // Save clustered positions
                    nodes.forEach(node => {
                        node.clusteredX = node.x;
                        node.clusteredY = node.y;
                    });
                    
                    // Reset posts to original positions for animation
                    nodes.forEach(node => {
                        node.x = node.originalX;
                        node.y = node.originalY;
                    });
                    
                    console.log('✅ Clustering complete! Pre-fetching spell corrections...');
                    
                    // Set loading flag to prevent cluster rendering during spell-check
                    clusteringAnimationLoading = true;
                    
                    // Pre-fetch spell corrections BEFORE starting animation
                    const postsToCheck = nodes.map(node => ({
                        id: node.id,
                        content: node.content
                    }));
                    
                    fetch('http://localhost:3000/api/spell-check-posts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ posts: postsToCheck })
                    })
                    .then(res => res.json())
                    .then(data => {
                        console.log('✅ Spell-check results received:', data);
                        
                        let correctionCount = 0;
                        
                        // Store corrected text for each post
                        if (data.posts && Array.isArray(data.posts)) {
                            data.posts.forEach(result => {
                                const node = nodes.find(n => n.id === result.id);
                                if (node) {
                                    if (result.correctedText !== result.originalText) {
                                        node.correctedContent = result.correctedText;
                                        node.hasCorrection = true;
                                        correctionCount++;
                                        console.log(`✏️ Pre-loaded correction: "${result.originalText}" → "${result.correctedText}"`);
                                    }
                                }
                            });
                        }
                        
                        console.log(`📊 Pre-loaded ${correctionCount} corrections out of ${nodes.length} posts`);
                        
                        // NOW start the animation with corrections ready
                        clusteringAnimationLoading = false;
                        clusteringAnimationActive = true;
                        clusteringAnimationStartTime = Date.now();
                        clusteringProgress = 0;
                        
                        // Reset phase flags
                        clusteringPhase1Done = false;
                        clusteringPhase2Done = false;
                        clusteringPhase3Done = false;
                    })
                    .catch(err => {
                        console.error('Spell-check error:', err);
                        // Start animation anyway even if spell-check fails
                        clusteringAnimationLoading = false;
                        clusteringAnimationActive = true;
                        clusteringAnimationStartTime = Date.now();
                        clusteringProgress = 0;
                        clusteringPhase1Done = false;
                        clusteringPhase2Done = false;
                        clusteringPhase3Done = false;
                    });
                })();
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
        this.id = timestamp; // Use timestamp as unique ID
        this.content = content;
        this.timestamp = timestamp;
        
        // Random position
        this.x = random(100, canvasWidth - 100);
        this.y = random(100, canvasHeight - 100);
        
        console.log(`📍 New post spawned at (${Math.round(this.x)}, ${Math.round(this.y)}): "${content.substring(0, 30)}..."`);
        
        // Track initial position to detect movement
        this.initialX = this.x;
        this.initialY = this.y;
        
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
        
        // Calculate embedding asynchronously for semantic analysis
        this.embedding = null;
        if (window.sentenceTransformer) {
            window.sentenceTransformer.getEmbedding(content).then(emb => {
                this.embedding = emb;
            }).catch(err => {
                console.error('Error calculating embedding:', err);
            });
        }
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
        
        // CLUSTERING PHYSICS - Only active after timer completes
        if (clusteringEnabled) {
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
                    // ATTRACTION for similar posts - progressive strength during Phase 2
                    // Calculate clustering strength based on animation progress (0 to 1 during Phase 2)
                    let clusteringStrength = 1.0;
                    if (clusteringAnimationActive && clusteringProgress >= 0.25 && clusteringProgress < 0.5) {
                        // Ramp up from 0 to 1 during Phase 2 (25% to 50%)
                        clusteringStrength = (clusteringProgress - 0.25) / 0.25;
                    } else if (clusteringAnimationActive && clusteringProgress < 0.25) {
                        // No attraction during Phase 1
                        clusteringStrength = 0;
                    }
                    
                    // Much weaker force for gradual, visible clustering
                    const force = (similarity - 0.3) * 0.005 * clusteringStrength;
                    fx += (dx / dist) * force;
                    fy += (dy / dist) * force;
                    
                    // Prevent excessive overlap within cluster
                    if (dist < 100) {
                        const repelForce = (100 - dist) / 100 * 0.05; // VERY slow - was 0.3, now 0.05
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
        }
        
        // GENTLE FLOATING PHYSICS - Always active for natural movement
        // Add gentle random drift to keep posts floating
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
        this.vx *= 0.92; // Higher damping = slower movement (was 0.75)
        this.vy *= 0.92;
        
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
            
            const semanticSim = data.similarity || 0;
            console.log('🔢 TF-IDF Similarity:', tfidfSim);
            console.log('🔢 Semantic Similarity:', semanticSim);
            const combinedSim = (tfidfSim * 0.3) + (semanticSim * 0.7);
            console.log('🔢 Combined Similarity:', combinedSim);
            
            // Log similarity calculation
            const post1 = this.content.substring(0, 20);
            const post2 = otherNode.content.substring(0, 20);
            logActivity(`🔗 Similarity: "${post1}..." ↔ "${post2}..." = ${(combinedSim * 100).toFixed(0)}%`, 'similarity');
            
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

let customFont;
let customFontMedium;
let customFontSemibold;

function preload() {
    customFont = loadFont('/client/fonts/MDThermochrome0.4-Regular-Trial.otf');
    customFontMedium = loadFont('/client/fonts/MDThermochrome0.4-Medium-Trial.otf');
    customFontSemibold = loadFont('/client/fonts/MDThermochrome0.4-Semibold-Trial.otf');
}

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
    
    // Load debate topics for cluster matching
    loadDebateTopics();
}

function draw() {
    try {
        background(0);
        
        // Show idle/welcome screen if active
        if (idleScreenActive) {
            drawIdleScreen();
            return;
        }
        
        // Update typing animations
        if (typeof typingAnimation !== 'undefined') {
            typingAnimation.update();
        }
        
        // Show black screen during spell-check loading
        if (clusteringAnimationLoading) {
            background(0);
            return; // Skip rendering until animation starts
        }
        
        // Handle clustering animation - visualize algorithm "thinking"
        if (clusteringAnimationActive) {
            const elapsed = Date.now() - clusteringAnimationStartTime;
            const duration = 30000; // 30 seconds
            clusteringProgress = min(elapsed / duration, 1);
            
            // NEW ANIMATION FLOW (4 PHASES):
            // Phase 1 (0-25%): Evaluate individual posts with quality circles
            // Phase 2 (25-50%): Live typing grammar correction
            // Phase 3 (50-75%): Pull posts together to form clusters (network nodes)
            // Phase 4 (75-100%): Filter out clusters without JSON topic match (glitch effect)
            
            let phaseText = 'Evaluating posts...';
            
            // PHASE 1 (0-25%): Evaluate individual posts with colored circles and percentages
            if (clusteringProgress < 0.25) {
                phaseText = 'Evaluating posts...';
                
                if (!clusteringPhase1Done) {
                    clusteringPhase1Done = true;
                    console.log('📊 Phase 1: Evaluating posts...');
                }
            }
            // PHASE 2 (25-50%): Grammar correction - handled below in custom Phase 2 code
            else if (clusteringProgress < 0.50) {
                phaseText = 'Correcting grammar...';
            }
            // PHASE 3 (50-75%): Pull posts together - visual clustering effect
            else if (clusteringProgress < 0.75) {
                phaseText = 'Forming clusters...';
                
                if (clusteringPhase2Done && !clusteringPhase3Done) {
                    clusteringPhase3Done = true;
                    console.log('🎨 Phase 3: Forming clusters...');
                }
            }
            // PHASE 4 (75-100%): Filter clusters without topic match
            else {
                phaseText = 'Filtering topics...';
                
                if (clusteringPhase3Done && !clusteringPhase4Done) {
                    clusteringPhase4Done = true;
                    console.log('🔍 Phase 4: Filtering non-matching clusters...');
                }
                
                // End animation when complete
                if (clusteringProgress >= 1) {
                    clusteringAnimationActive = false;
                    votingPhaseActive = true;
                    
                    console.log('✅ Clustering animation complete');
                    
                    // Notify mobile clients
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'clustering_complete'
                        }));
                        
                        // Only send clusters that have topicData AND were not rejected in Phase 4
                        const rejectedClusterIds = window.phase4RejectedClusters || [];
                        console.log(`📤 Sending clusters to mobile: ${clusterRegistry.clusters.length} total, ${rejectedClusterIds.length} rejected`);
                        
                        let clustersToSend = clusterRegistry.clusters
                            .filter(cluster => cluster.topicData && !rejectedClusterIds.includes(cluster.id))
                            .map(cluster => ({
                            id: cluster.id,
                            label: clusterLabels[cluster.id] || `Cluster ${cluster.id}`,
                            color: cluster.color || { h: 0, s: 70, b: 80 },
                            nodeCount: cluster.nodes.length,
                            votes: cluster.votes || 0,
                            topicData: cluster.topicData,
                            keywords: cluster.keywords
                        }));
                        
                        // FINAL SAFETY CHECK: Remove any duplicate topic names
                        const seenTopics = new Set();
                        clustersToSend = clustersToSend.filter(cluster => {
                            if (seenTopics.has(cluster.label)) {
                                console.log(`⚠️ Removing duplicate topic: "${cluster.label}"`);
                                return false;
                            }
                            seenTopics.add(cluster.label);
                            return true;
                        });
                        
                        console.log(`📤 Final filtered to ${clustersToSend.length} unique clusters for voting:`);
                        clustersToSend.forEach(c => {
                            console.log(`   - ${c.label} (${c.nodeCount} posts)`);
                        });
                        
                        ws.send(JSON.stringify({
                            type: 'update_clusters',
                            clusters: clustersToSend,
                            uncategorizedPosts: []
                        }));
                    }
                    
                    // Clean up all phase state variables AFTER sending clusters
                    window.phase2LoggedCorrections = null;
                    window.phase2CorrectionsApplied = null;
                    window.phase3Entered = null;
                    window.phase3Reclustered = null;
                    window.phase4RejectedClusters = null;
                    window.phase4GlitchTimings = null;
                }
            }
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'clustering_progress',
                    progress: clusteringProgress,
                    phase: phaseText
                }));
            }
            
            // Hide timer during clustering
            const headlineDisplay = document.getElementById('headlineDisplay');
            if (headlineDisplay) {
                headlineDisplay.style.display = 'none';
            }
            
            // PHASE 1 (0-25%): Evaluating posts with percentage indicators
            if (clusteringProgress < 0.25) {
                background(0);
                
                // Enable gentle floating physics
                nodes.forEach(node => node.update());
                
                // Large white dashed circle encompassing all posts
                push();
                stroke(255, 150);
                strokeWeight(3);
                noFill();
                drawingContext.setLineDash([15, 15]);
                ellipse(width / 2, height / 2, min(width, height) * 0.85);
                drawingContext.setLineDash([]);
                pop();
                
                // Dotted lines between similar posts
                nodes.forEach((node, i) => {
                    if (!node.cluster) return;
                    const cluster = clusterRegistry.clusters.find(c => c.id === node.cluster);
                    if (!cluster) return;
                    
                    nodes.forEach((otherNode, j) => {
                        if (i >= j || otherNode.cluster !== node.cluster) return;
                        
                        push();
                        colorMode(HSB);
                        stroke(cluster.color.h, cluster.color.s, cluster.color.b, 150);
                        strokeWeight(2);
                        drawingContext.setLineDash([5, 5]);
                        line(node.x, node.y, otherNode.x, otherNode.y);
                        drawingContext.setLineDash([]);
                        colorMode(RGB);
                        pop();
                    });
                });
                
                // Draw posts as white text
                nodes.forEach(node => {
                    push();
                    fill(255);
                    textAlign(LEFT, TOP);
                    textSize(24);
                    if (customFontMedium) textFont(customFontMedium);
                    
                    const lineHeight = 30;
                    node.lines.forEach((line, i) => {
                        text(line, node.x, node.y + i * lineHeight);
                    });
                    pop();
                });
                
                // Small colored percentage circles above each post
                nodes.forEach(node => {
                    if (!node.cluster) return;
                    const cluster = clusterRegistry.clusters.find(c => c.id === node.cluster);
                    if (!cluster) return;
                    
                    const quality = Math.round(cluster.strength * 100);
                    
                    push();
                    colorMode(HSB);
                    fill(cluster.color.h, cluster.color.s, cluster.color.b);
                    noStroke();
                    ellipse(node.x, node.y - 60, 30, 30);
                    
                    fill(255);
                    textAlign(CENTER, CENTER);
                    textSize(14);
                    if (customFontSemibold) textFont(customFontSemibold);
                    text(`${quality}%`, node.x, node.y - 60);
                    colorMode(RGB);
                    pop();
                });
            }
            // PHASE 2 (25-50%): Grammar correction with typing animations on posts
            else if (clusteringProgress < 0.50) {
                background(0);
                
                // Enable gentle floating physics
                nodes.forEach(node => node.update());
                
                // Log phase start (corrections already pre-fetched)
                if (!clusteringPhase2Done) {
                    clusteringPhase2Done = true;
                    console.log('📝 Phase 2: Grammar correction animation (corrections pre-loaded)');
                }
                
                // At end of Phase 2, apply corrections to actual node content
                const phase2Progress = (clusteringProgress - 0.25) / 0.25;
                if (phase2Progress > 0.99 && !window.phase2CorrectionsApplied) {
                    window.phase2CorrectionsApplied = true;
                    
                    let appliedCount = 0;
                    nodes.forEach(node => {
                        if (node.hasCorrection && node.correctedContent) {
                            // Apply correction to actual content
                            node.content = node.correctedContent;
                            
                            // Update text lines for rendering
                            const maxCharsPerLine = 50;
                            const words = node.content.split(' ');
                            node.lines = [];
                            let currentLine = '';
                            
                            words.forEach(word => {
                                if ((currentLine + word).length > maxCharsPerLine && currentLine.length > 0) {
                                    node.lines.push(currentLine.trim());
                                    currentLine = word + ' ';
                                } else {
                                    currentLine += word + ' ';
                                }
                            });
                            if (currentLine.trim().length > 0) {
                                node.lines.push(currentLine.trim());
                            }
                            
                            // Re-extract keywords from corrected content
                            node.keywords = node.extractKeywords(node.content);
                            
                            appliedCount++;
                        }
                    });
                    
                    console.log(`✅ Phase 2 complete: Applied ${appliedCount} corrections to actual content`);
                    console.log('🔄 Ready for Phase 3 re-clustering with corrected text');
                }
                
                // Log correction status once per phase
                if (!window.phase2LoggedCorrections) {
                    window.phase2LoggedCorrections = true;
                    const postsWithCorrections = nodes.filter(n => n.hasCorrection);
                    console.log(`🎬 Phase 2 animation: ${postsWithCorrections.length} posts with corrections`);
                    postsWithCorrections.forEach(n => {
                        console.log(`   - "${n.content}" → "${n.correctedContent}"`);
                    });
                }
                
                // Draw posts with typing animation for corrections
                nodes.forEach(node => {
                    push();
                    fill(255);
                    textAlign(LEFT, TOP);
                    textSize(24);
                    if (customFontMedium) textFont(customFontMedium);
                    
                    const lineHeight = 30;
                    
                    // Show typing animation if post has correction
                    if (node.hasCorrection && node.correctedContent) {
                        const progress = (clusteringProgress - 0.25) / 0.25; // 0-1 within Phase 2
                        const speedMultiplier = 3;
                        const adjustedProgress = Math.min(progress * speedMultiplier, 1);
                        
                        // Two-phase: backspace original (0-0.5), type corrected (0.5-1) - equal speed
                        if (adjustedProgress < 0.5) {
                            // Backspace phase
                            const backspaceProgress = adjustedProgress / 0.5;
                            const originalLength = node.content.length;
                            const remainingLength = Math.floor(originalLength * (1 - backspaceProgress));
                            const displayText = node.content.substring(0, remainingLength);
                            text(displayText, node.x, node.y);
                        } else {
                            // Type corrected text
                            const typeProgress = (adjustedProgress - 0.5) / 0.5;
                            const targetLength = node.correctedContent.length;
                            const currentLength = Math.floor(targetLength * typeProgress);
                            const displayText = node.correctedContent.substring(0, currentLength);
                            text(displayText, node.x, node.y);
                        }
                    } else {
                        // No correction - show original text
                        node.lines.forEach((line, i) => {
                            text(line, node.x, node.y + i * lineHeight);
                        });
                    }
                    pop();
                });
            }
            // PHASE 3 (50-75%): Cluster circles appear, posts move together (NETWORK NODES AESTHETIC)
            else if (clusteringProgress < 0.75) {
                background(0);
                
                const visualProgress = (clusteringProgress - 0.50) / 0.25; // 0-1 within Phase 3
                
                // Log Phase 3 entry once
                if (!window.phase3Entered) {
                    window.phase3Entered = true;
                    console.log(`🎬 PHASE 3 STARTED - visualProgress will range from 0 to 1`);
                }
                
                // Re-cluster with corrected content at start of Phase 3
                if (!window.phase3Reclustered) {
                    console.log(`⏱️ Phase 3 visualProgress: ${visualProgress.toFixed(3)} (waiting for < 0.05)`);
                }
                
                if (visualProgress < 0.05 && !window.phase3Reclustered) {
                    window.phase3Reclustered = true;
                    
                    console.log('🔄🔄🔄 Phase 3: RE-CLUSTERING WITH CORRECTED CONTENT...');
                    console.log(`📊 Clusters before clearing: ${clusterRegistry.clusters.length}`);
                    
                    // Clear old clusters completely
                    clusterRegistry.clusters.length = 0; // Clear array in place
                    clusterRegistry.nextId = 0;
                    
                    console.log(`📊 Clusters after clearing: ${clusterRegistry.clusters.length}`);
                    
                    nodes.forEach(node => {
                        node.cluster = undefined;
                        node.clusterColor = undefined;
                    });
                    
                    // Re-run clustering algorithm with corrected content
                    nodes.forEach(node => {
                        // Keywords already updated from corrected content in Phase 2
                        const match = clusterRegistry.findBestCluster(node, 0.5);
                        
                        if (match && match.cluster) {
                            clusterRegistry.addToCluster(match.cluster, node);
                            node.cluster = match.cluster.id;
                            node.clusterColor = match.cluster.color;
                        } else {
                            const newCluster = clusterRegistry.createCluster(node.keywords, node);
                            node.cluster = newCluster.id;
                            node.clusterColor = newCluster.color;
                        }
                    });
                    
                    // Clean up and optimize clusters
                    clusterRegistry.pruneEmptyClusters();
                    clusterRegistry.mergeSimilarClusters(0.7);
                    clusterRegistry.filterLowQualityClusters(0.35);
                    
                    // Generate labels and match to JSON topics
                    generateClusterLabels();
                    
                    // Match clusters to JSON topics
                    if (clusterRegistry.clusters.length > 0) {
                        clusterRegistry.clusters.forEach(cluster => {
                            const clusterKeywords = cluster.keywords || [];
                            let bestMatch = null;
                            let bestScore = 0;
                            
                            debateTopics.forEach(topic => {
                                const topicKeywords = topic.keywords.map(k => k.toLowerCase());
                                const matchCount = clusterKeywords.filter(ck => 
                                    topicKeywords.some(tk => tk.includes(ck.toLowerCase()) || ck.toLowerCase().includes(tk))
                                ).length;
                                
                                if (matchCount > bestScore) {
                                    bestScore = matchCount;
                                    bestMatch = topic;
                                }
                            });
                            
                            if (bestMatch && bestScore > 0) {
                                cluster.topicData = bestMatch;
                                clusterLabels[cluster.id] = bestMatch.name;
                                console.log(`✅ Re-matched cluster ${cluster.id} to topic: "${bestMatch.name}"`);
                            } else {
                                console.log(`⚠️ Cluster ${cluster.id} has no topic match (will be filtered in Phase 4)`);
                            }
                        });
                        
                        // Merge clusters with same topicData to avoid duplicate topics
                        console.log(`📊 Before merge: ${clusterRegistry.clusters.length} total clusters`);
                        clusterRegistry.clusters.forEach(c => {
                            console.log(`   - Cluster ${c.id}: "${clusterLabels[c.id]}" (${c.nodes.length} posts, topicData: ${c.topicData ? 'YES' : 'NO'})`);
                        });
                        
                        const topicGroups = new Map();
                        clusterRegistry.clusters.forEach(cluster => {
                            if (!cluster.topicData) return;
                            
                            const topicName = cluster.topicData.name;
                            if (!topicGroups.has(topicName)) {
                                topicGroups.set(topicName, []);
                            }
                            topicGroups.get(topicName).push(cluster);
                        });
                        
                        console.log(`📊 Topic groups found: ${topicGroups.size}`);
                        topicGroups.forEach((clusters, topicName) => {
                            console.log(`   - "${topicName}": ${clusters.length} clusters`);
                        });
                        
                        // Merge duplicate topic clusters
                        const clustersToRemove = [];
                        topicGroups.forEach((clusters, topicName) => {
                            if (clusters.length > 1) {
                                console.log(`🔗 Merging ${clusters.length} clusters for topic "${topicName}"`);
                                
                                // Keep first cluster, merge others into it
                                const mainCluster = clusters[0];
                                for (let i = 1; i < clusters.length; i++) {
                                    const mergeCluster = clusters[i];
                                    
                                    // Move all nodes to main cluster
                                    mergeCluster.nodes.forEach(node => {
                                        mainCluster.nodes.push(node);
                                        node.cluster = mainCluster.id;
                                        node.clusterColor = mainCluster.color;
                                    });
                                    
                                    clustersToRemove.push(mergeCluster.id);
                                }
                                
                                console.log(`✅ Merged into cluster ${mainCluster.id} with ${mainCluster.nodes.length} posts`);
                            }
                        });
                        
                        // Remove merged clusters
                        if (clustersToRemove.length > 0) {
                            clusterRegistry.clusters = clusterRegistry.clusters.filter(c => !clustersToRemove.includes(c.id));
                            console.log(`🗑️ Removed ${clustersToRemove.length} duplicate topic clusters`);
                        }
                        
                        console.log(`📊 After merge: ${clusterRegistry.clusters.length} total clusters`);
                        clusterRegistry.clusters.forEach(c => {
                            console.log(`   - Cluster ${c.id}: "${clusterLabels[c.id]}" (${c.nodes.length} posts)`);
                        });
                    }
                    
                    console.log(`✅ Re-clustering complete: ${clusterRegistry.clusters.length} unique topic clusters formed`);
                }
                
                // Smooth fade in at start (0-10%) and fade out at end (90-100%)
                let networkFade = 1;
                if (visualProgress < 0.1) {
                    networkFade = visualProgress / 0.1; // Fade in
                } else if (visualProgress > 0.9) {
                    networkFade = (1 - (visualProgress - 0.9) / 0.1); // Fade out
                }
                
                // Enable physics for smooth clustering movement
                nodes.forEach(node => node.update());
                
                // Apply attraction force to pull posts toward cluster centers
                if (clusterRegistry && clusterRegistry.clusters.length > 0) {
                    clusterRegistry.clusters.forEach(cluster => {
                        if (!cluster.nodes || cluster.nodes.length === 0) return;
                        
                        // Calculate cluster center
                        const xs = cluster.nodes.map(n => n.x);
                        const ys = cluster.nodes.map(n => n.y);
                        const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
                        const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
                        
                        // Pull posts toward center with increasing strength
                        cluster.nodes.forEach(node => {
                            const dx = centerX - node.x;
                            const dy = centerY - node.y;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            
                            if (distance > 10) {
                                const force = 0.05 * visualProgress;
                                node.vx += (dx / distance) * force;
                                node.vy += (dy / distance) * force;
                            }
                        });
                    });
                    
                    // NETWORK AESTHETIC: Draw glowing connection lines between posts in same cluster
                    if (networkFade > 0) {
                        clusterRegistry.clusters.forEach(cluster => {
                            if (!cluster.nodes || cluster.nodes.length < 2) return;
                            
                            push();
                            colorMode(HSB);
                            
                            // Draw lines between all posts in cluster
                            for (let i = 0; i < cluster.nodes.length; i++) {
                                for (let j = i + 1; j < cluster.nodes.length; j++) {
                                    const nodeA = cluster.nodes[i];
                                    const nodeB = cluster.nodes[j];
                                    
                                    // Line opacity increases with clustering, then fades out
                                    const lineAlpha = 100 * visualProgress * networkFade;
                                    stroke(cluster.color.h, cluster.color.s, cluster.color.b, lineAlpha);
                                    strokeWeight(1.5);
                                    line(nodeA.x, nodeA.y, nodeB.x, nodeB.y);
                                }
                            }
                            
                            colorMode(RGB);
                            pop();
                        });
                    }
                }
                
                // Draw posts with glowing node effect
                nodes.forEach(node => {
                    if (!node.cluster) return;
                    const cluster = clusterRegistry.clusters.find(c => c.id === node.cluster);
                    if (!cluster) return;
                    
                    push();
                    
                    // Glowing node circle behind text
                    colorMode(HSB);
                    fill(cluster.color.h, cluster.color.s, cluster.color.b, 50 * visualProgress);
                    noStroke();
                    ellipse(node.x + 50, node.y + 15, 80 * visualProgress, 80 * visualProgress);
                    
                    // Post text
                    colorMode(RGB);
                    fill(255);
                    textAlign(LEFT, TOP);
                    textSize(24);
                    if (customFontMedium) textFont(customFontMedium);
                    
                    const lineHeight = 30;
                    node.lines.forEach((line, i) => {
                        text(line, node.x, node.y + i * lineHeight);
                    });
                    pop();
                });
                
                // Draw dashed cluster circles (fade in)
                if (clusterRegistry && clusterRegistry.clusters.length > 0) {
                    clusterRegistry.clusters.forEach(cluster => {
                        if (!cluster.nodes || cluster.nodes.length === 0) return;
                        
                        const xs = cluster.nodes.map(n => n.x);
                        const ys = cluster.nodes.map(n => n.y);
                        const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
                        const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
                        
                        const radius = Math.max(
                            (Math.max(...xs) - Math.min(...xs)) / 2,
                            (Math.max(...ys) - Math.min(...ys)) / 2
                        ) + 60;
                        
                        // Dashed cluster circle with glow
                        push();
                        noFill();
                        colorMode(HSB);
                        
                        // Outer glow
                        stroke(cluster.color.h, cluster.color.s, cluster.color.b, 50 * visualProgress);
                        strokeWeight(8);
                        drawingContext.setLineDash([10, 10]);
                        ellipse(centerX, centerY, radius * 2, radius * 2);
                        
                        // Main circle
                        stroke(cluster.color.h, cluster.color.s, cluster.color.b, 200 * visualProgress);
                        strokeWeight(3);
                        ellipse(centerX, centerY, radius * 2, radius * 2);
                        drawingContext.setLineDash([]);
                        
                        // Cluster label (JSON topic name)
                        fill(cluster.color.h, cluster.color.s, cluster.color.b, 255 * visualProgress);
                        textAlign(CENTER, CENTER);
                        textSize(28);
                        if (customFontSemibold) textFont(customFontSemibold);
                        
                        const label = clusterLabels[cluster.id] || `Cluster ${cluster.id}`;
                        text(label, centerX, centerY - radius - 50);
                        
                        colorMode(RGB);
                        pop();
                    });
                }
            }
            // PHASE 4 (75-100%): Filter clusters without topic match (glitch effect)
            else {
                background(0);
                
                const phase4Progress = (clusteringProgress - 0.75) / 0.25; // 0-1 within Phase 4
                
                // Enable physics
                nodes.forEach(node => node.update());
                
                // Identify clusters to remove (no topicData)
                if (!window.phase4RejectedClusters) {
                    window.phase4RejectedClusters = [];
                    window.phase4GlitchTimings = new Map();
                    
                    if (clusterRegistry && clusterRegistry.clusters.length > 0) {
                        clusterRegistry.clusters.forEach((cluster, index) => {
                            if (!cluster.topicData) {
                                window.phase4RejectedClusters.push(cluster.id);
                                // Stagger glitch timing: each cluster glitches at different time
                                const glitchStart = index * 0.15; // Stagger by 15% each
                                const glitchDuration = 0.05; // 5% of phase (quick glitch)
                                window.phase4GlitchTimings.set(cluster.id, {
                                    start: glitchStart,
                                    end: glitchStart + glitchDuration
                                });
                            }
                        });
                        console.log(`🗑️ Phase 4: Removing ${window.phase4RejectedClusters.length} clusters without topic match`);
                    }
                }
                
                // Draw all posts
                nodes.forEach(node => {
                    if (!node.cluster) return;
                    
                    const cluster = clusterRegistry.clusters.find(c => c.id === node.cluster);
                    if (!cluster) return;
                    
                    const isRejected = window.phase4RejectedClusters.includes(cluster.id);
                    const timing = window.phase4GlitchTimings.get(cluster.id);
                    
                    let glitchActive = false;
                    let shouldHide = false;
                    
                    if (isRejected && timing) {
                        if (phase4Progress >= timing.start && phase4Progress < timing.end) {
                            glitchActive = true; // Currently glitching
                        } else if (phase4Progress >= timing.end) {
                            shouldHide = true; // Already glitched out
                        }
                    }
                    
                    if (shouldHide) return; // Don't draw removed clusters
                    
                    push();
                    
                    // Apply glitch effect
                    if (glitchActive) {
                        // Random jitter position
                        const jitterX = random(-5, 5);
                        const jitterY = random(-5, 5);
                        translate(jitterX, jitterY);
                        
                        // RGB channel separation effect
                        const offset = 3;
                        
                        // Red channel
                        fill(255, 0, 0, 150);
                        textAlign(LEFT, TOP);
                        textSize(24);
                        if (customFontMedium) textFont(customFontMedium);
                        node.lines.forEach((line, i) => {
                            text(line, node.x - offset, node.y + i * 30);
                        });
                        
                        // Blue channel
                        fill(0, 0, 255, 150);
                        node.lines.forEach((line, i) => {
                            text(line, node.x + offset, node.y + i * 30);
                        });
                        
                        // Green channel (center)
                        fill(0, 255, 0, 150);
                        node.lines.forEach((line, i) => {
                            text(line, node.x, node.y + i * 30);
                        });
                    } else {
                        // Normal rendering
                        fill(255);
                        textAlign(LEFT, TOP);
                        textSize(24);
                        if (customFontMedium) textFont(customFontMedium);
                        node.lines.forEach((line, i) => {
                            text(line, node.x, node.y + i * 30);
                        });
                    }
                    
                    pop();
                });
                
                // Draw cluster circles (only for non-rejected clusters)
                if (clusterRegistry && clusterRegistry.clusters.length > 0) {
                    clusterRegistry.clusters.forEach(cluster => {
                        if (!cluster.nodes || cluster.nodes.length === 0) return;
                        
                        const isRejected = window.phase4RejectedClusters.includes(cluster.id);
                        const timing = window.phase4GlitchTimings.get(cluster.id);
                        
                        let shouldHide = false;
                        if (isRejected && timing && phase4Progress >= timing.end) {
                            shouldHide = true;
                        }
                        
                        if (shouldHide) return; // Don't draw removed cluster circles
                        
                        const xs = cluster.nodes.map(n => n.x);
                        const ys = cluster.nodes.map(n => n.y);
                        const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
                        const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
                        
                        const radius = Math.max(
                            (Math.max(...xs) - Math.min(...xs)) / 2,
                            (Math.max(...ys) - Math.min(...ys)) / 2
                        ) + 60;
                        
                        push();
                        noFill();
                        colorMode(HSB);
                        stroke(cluster.color.h, cluster.color.s, cluster.color.b, 200);
                        strokeWeight(3);
                        drawingContext.setLineDash([10, 10]);
                        ellipse(centerX, centerY, radius * 2, radius * 2);
                        drawingContext.setLineDash([]);
                        
                        // Cluster label
                        fill(cluster.color.h, cluster.color.s, cluster.color.b);
                        textAlign(CENTER, CENTER);
                        textSize(28);
                        if (customFontSemibold) textFont(customFontSemibold);
                        const label = clusterLabels[cluster.id] || `Cluster ${cluster.id}`;
                        text(label, centerX, centerY - radius - 50);
                        
                        colorMode(RGB);
                        pop();
                    });
                }
                
                // Draw network lines between posts in same cluster (fade out at end)
                const lineFade = phase4Progress > 0.8 ? (1 - (phase4Progress - 0.8) / 0.2) : 1;
                
                if (lineFade > 0) {
                    nodes.forEach((node, i) => {
                        if (!node.cluster) return;
                        const isRejected = window.phase4RejectedClusters.includes(node.cluster);
                        if (isRejected) return; // Don't draw lines for rejected clusters
                        
                        nodes.forEach((otherNode, j) => {
                            if (i >= j || otherNode.cluster !== node.cluster) return;
                            
                            const cluster = clusterRegistry.clusters.find(c => c.id === node.cluster);
                            if (!cluster) return;
                            
                            push();
                            colorMode(HSB);
                            stroke(cluster.color.h, cluster.color.s, cluster.color.b, 100 * lineFade);
                            strokeWeight(2);
                            line(node.x, node.y, otherNode.x, otherNode.y);
                            colorMode(RGB);
                            pop();
                        });
                    });
                }
            }
            
            // Draw loading screen with phase indicator (fade out in last 10% of Phase 4)
            const uiFade = clusteringProgress > 0.9 ? (1 - (clusteringProgress - 0.9) / 0.1) : 1;
            
            if (uiFade > 0) {
                push();
                fill(255, 255 * uiFade);
                textAlign(CENTER, CENTER);
                textSize(32);
                if (customFontSemibold) textFont(customFontSemibold);
                text(phaseText, width / 2, height / 2);
                
                // Progress bar
                const barWidth = 400;
                const barHeight = 20;
                const barX = width / 2 - barWidth / 2;
                const barY = height / 2 + 60;
                
                noFill();
                stroke(255, 255 * uiFade);
                strokeWeight(2);
                rect(barX, barY, barWidth, barHeight);
                
                noStroke();
                fill(255, 255 * uiFade);
                rect(barX, barY, barWidth * clusteringProgress, barHeight);
                pop();
            }
            
            return; // Skip normal rendering during clustering animation
        }
        
        // Handle role assignment animation (PRIORITY - check before reveal)
        if (roleAssignmentActive) {
            drawRoleAssignmentScreen();
            return; // Skip normal rendering during role assignment
        }
        
        // Handle topic reveal fade-out (clusters fading to black)
        if (revealPhase === 'fade-out') {
            const fadeProgress = window.revealFadeProgress || 0;
            
            // Draw normal clusters/posts first
            const mode = window.visualizationMode || visualizationMode;
            if (mode === 'outline') {
                drawOutlineMode();
            } else if (mode === 'bubbles') {
                drawSpeechBubbles();
            } else {
                drawClusterMetaballs();
            }
            
            // Overlay black with increasing opacity
            push();
            fill(0, fadeProgress * 255);
            noStroke();
            rect(0, 0, width, height);
            pop();
            
            return; // Skip normal rendering during fade
        }
        
        // Handle topic reveal fade-in (reveal screen fading in from black)
        if (revealPhase === 'fade-in' || revealPhase === 'static') {
            // Black background
            background(0);

            if (revealClusterColor && winningCluster) {
                const fadeProgress = revealPhase === 'fade-in' ? (1 - (window.revealFadeProgress || 0)) : 1;
                
                push();

                // Convert HSB to RGB
                const h = revealClusterColor.h;
                const s = revealClusterColor.s;
                const b = revealClusterColor.b;

                colorMode(HSB, 360, 100, 100);
                const c = color(h, s, b);
                colorMode(RGB, 255);

                // Draw "Chosen topic" title - MD IO font (using Regular as placeholder)
                fill(255, fadeProgress * 255);
                textAlign(CENTER, CENTER);
                textSize(64);
                if (customFont) {
                    textFont(customFont); // TODO: Replace with MD IO font when available
                }
                text('Chosen topic', width / 2, height / 2 - 180);

                // Draw subtitle - MD Primer font (using Medium as placeholder)
                fill(150, fadeProgress * 255);
                textSize(24);
                if (customFontMedium) {
                    textFont(customFontMedium); // TODO: Replace with MD Primer font when available
                }
                text('Get ready for a debate!', width / 2, height / 2 - 120);

                // Draw topic name in dashed outline - MD Thermochrome Semibold
                push();
                noFill();
                stroke(red(c), green(c), blue(c), fadeProgress * 255);
                strokeWeight(4);
                drawingContext.setLineDash([10, 10]);

                // Calculate text width for rounded rectangle
                textSize(36);
                if (customFontSemibold) {
                    textFont(customFontSemibold);
                }
                const topicText = winningCluster.label || 'Discussion';
                const textW = textWidth(topicText);
                const boxW = textW + 120;
                const boxH = 90;
                const boxX = width / 2;
                const boxY = height / 2 + 20;

                // Draw rounded rectangle
                rectMode(CENTER);
                rect(boxX, boxY, boxW, boxH, 45);
                drawingContext.setLineDash([]);

                // Draw topic text
                fill(red(c), green(c), blue(c), fadeProgress * 255);
                noStroke();
                textAlign(CENTER, CENTER);
                text(topicText, boxX, boxY);

                pop();
                pop();
            }
            return; // Skip normal rendering during reveal
        }

        // Draw debate voting screen if active
        if (debateVotingActive) {
            drawDebateVotingScreen();
            return; // Skip normal rendering during debate voting
        }
        
        // Update HTML elements for voting phase
        if (votingPhaseActive && nodes.length > 0) {
            const headlineText = document.getElementById('headlineText');
            const displayCountdown = document.getElementById('displayCountdown');
            
            if (headlineText) {
                headlineText.textContent = "Vote on a topic you'd like to discuss";
            }
            
            if (displayCountdown && votingCountdownTime > 0) {
                const minutes = Math.floor(votingCountdownTime / 60);
                const seconds = votingCountdownTime % 60;
                displayCountdown.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                
                // Decrement timer (runs at 60fps, so decrement every 60 frames)
                if (frameCount % 60 === 0 && votingCountdownTime > 0) {
                    votingCountdownTime--;
                    
                    // When timer reaches 0, request winning cluster from server
                    if (votingCountdownTime === 0) {
                        console.log('⏰ Voting time ended - requesting winning cluster');
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'get_winning_cluster' }));
                        }
                    }
                }
            }
        }
        
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
        if (!votingPhaseActive) {
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
        }
        
        // Update node physics (only if clustering is enabled)
        if (clusteringEnabled) {
            nodes.forEach(node => {
                node.update();
            });
        }
        
        // Update timestamp for trending detection
        lastClusterUpdate = Date.now();
        
    } catch (error) {
        console.error('Error in draw loop:', error);
    }
}

function drawClusterMetaballs() {
    if (nodes.length < 1) return;
    
    // Update physics for gentle floating animation
    nodes.forEach(node => {
        node.update();
    });
    
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
        
        // Update physics for all nodes (only if clustering is enabled)
        if (clusteringEnabled) {
            groupNodes.forEach(node => node.update());
        }
        
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

// ========================================
// Debate Voting System - Post-Reveal Interaction
// ========================================

// Start debate voting interaction
async function startDebateVoting() {
    console.log('🎤 Starting debate voting interaction');
    debateVotingActive = true;
    
    // Hide voting phase text and timer
    const headlineText = document.getElementById('headlineText');
    const displayCountdown = document.getElementById('displayCountdown');
    if (headlineText) headlineText.textContent = '';
    if (displayCountdown) displayCountdown.textContent = '';
    
    // Fetch opposing headlines based on winning cluster
    if (winningCluster && winningCluster.keywords) {
        console.log('📰 Fetching opposing headlines for cluster:', winningCluster.label);
        console.log('   Keywords:', winningCluster.keywords);
        headlinesLoading = true;
        
        try {
            opposingHeadlines = await fetchOpposingHeadlines(winningCluster.keywords);
            headlinesLoading = false;
            
            if (opposingHeadlines) {
                console.log('✅ Opposing headlines loaded successfully!');
                console.log('   Position 1 (Supportive):', opposingHeadlines.position1.title);
                console.log('   Position 2 (Critical):', opposingHeadlines.position2.title);
            } else {
                console.warn('⚠️ Failed to fetch opposing headlines, falling back to metaballs');
            }
        } catch (error) {
            console.error('❌ Error fetching headlines:', error);
            headlinesLoading = false;
        }
    } else {
        console.warn('⚠️ No winning cluster or keywords available');
    }
    
    // Initialize votes (50/50 split)
    blueVotes = 50;
    redVotes = 50;
    
    // Create metaballs
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Blue metaball (left side)
    blueMetaball = {
        x: centerX - 200,
        y: centerY,
        baseSize: 100,
        currentSize: 100,
        targetSize: 100,
        votePercentage: 50,
        morphOffset: 0,
        floatOffset: 0
    };
    
    // Red metaball (right side)
    redMetaball = {
        x: centerX + 200,
        y: centerY,
        baseSize: 100,
        currentSize: 100,
        targetSize: 100,
        votePercentage: 50,
        morphOffset: Math.PI,
        floatOffset: Math.PI / 2
    };
    
    // Notify mobile clients to show voting UI
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'start_debate_voting',
            blueVotes: blueVotes,
            redVotes: redVotes
        }));
    }
}

// Update metaball sizes based on votes
function updateDebateMetaballs() {
    if (!debateVotingActive || !blueMetaball || !redMetaball) return;
    
    // Calculate total votes
    const totalVotes = blueVotes + redVotes;
    if (totalVotes === 0) return;
    
    // Calculate percentages
    const bluePercentage = (blueVotes / totalVotes) * 100;
    const redPercentage = (redVotes / totalVotes) * 100;
    
    // Update target sizes (min 30px, max 500px for dramatic impact)
    const minSize = 30;
    const maxSize = 500;
    const sizeRange = maxSize - minSize;
    
    blueMetaball.votePercentage = bluePercentage;
    blueMetaball.targetSize = minSize + (bluePercentage / 100) * sizeRange;
    
    redMetaball.votePercentage = redPercentage;
    redMetaball.targetSize = minSize + (redPercentage / 100) * sizeRange;
    
    // Smooth size transition
    blueMetaball.currentSize += (blueMetaball.targetSize - blueMetaball.currentSize) * 0.1;
    redMetaball.currentSize += (redMetaball.targetSize - redMetaball.currentSize) * 0.1;
}

// Draw role assignment screen with animation phases
function drawRoleAssignmentScreen() {
    background(0);
    
    if (!winningCluster) return;
    
    const fadeProgress = window.roleAssignmentFadeProgress || 0;
    
    // Phase 1: Fade out reveal screen
    if (roleAssignmentPhase === 'fade-out') {
        // Draw reveal screen fading to black
        if (revealClusterColor) {
            push();
            
            const h = revealClusterColor.h;
            const s = revealClusterColor.s;
            const b = revealClusterColor.b;
            
            colorMode(HSB, 360, 100, 100);
            const c = color(h, s, b);
            colorMode(RGB, 255);
            
            const alpha = (1 - fadeProgress) * 255;
            
            // Draw fading reveal content
            fill(255, alpha);
            textAlign(CENTER, CENTER);
            textSize(64);
            if (customFont) textFont(customFont);
            text('Chosen topic', width / 2, height / 2 - 180);
            
            fill(150, alpha);
            textSize(24);
            if (customFontMedium) textFont(customFontMedium);
            text('Get ready for a debate!', width / 2, height / 2 - 120);
            
            // Topic box
            push();
            noFill();
            stroke(red(c), green(c), blue(c), alpha);
            strokeWeight(4);
            drawingContext.setLineDash([10, 10]);
            
            textSize(36);
            if (customFontSemibold) textFont(customFontSemibold);
            const topicText = winningCluster.label || 'Discussion';
            const textW = textWidth(topicText);
            const boxW = textW + 120;
            const boxH = 90;
            
            rectMode(CENTER);
            rect(width / 2, height / 2 + 20, boxW, boxH, 45);
            drawingContext.setLineDash([]);
            
            fill(red(c), green(c), blue(c), alpha);
            noStroke();
            text(topicText, width / 2, height / 2 + 20);
            
            pop();
            pop();
        }
        return;
    }
    
    // Phase 2 & 3: Topic moves to top
    if (roleAssignmentPhase === 'topic-move' || roleAssignmentPhase === 'circles-fade-in' || roleAssignmentPhase === 'static') {
        if (revealClusterColor) {
            push();
            
            const h = revealClusterColor.h;
            const s = revealClusterColor.s;
            const b = revealClusterColor.b;
            
            colorMode(HSB, 360, 100, 100);
            const c = color(h, s, b);
            colorMode(RGB, 255);
            
            // Interpolate topic position from center to top
            const startY = height / 2 + 20;
            const endY = 100;
            const currentY = startY + (endY - startY) * topicMoveProgress;
            
            // Draw topic at moving position
            textSize(36);
            if (customFontSemibold) textFont(customFontSemibold);
            const topicText = winningCluster.label || 'Discussion';
            const textW = textWidth(topicText);
            const boxW = textW + 120;
            const boxH = 90;
            
            // Topic box
            push();
            noFill();
            stroke(red(c), green(c), blue(c));
            strokeWeight(4);
            drawingContext.setLineDash([10, 10]);
            rectMode(CENTER);
            rect(width / 2, currentY, boxW, boxH, 45);
            drawingContext.setLineDash([]);
            
            fill(red(c), green(c), blue(c));
            noStroke();
            textAlign(CENTER, CENTER);
            text(topicText, width / 2, currentY);
            pop();
            
            pop();
        }
    }
    
    // Phase 3 & 4: Circles fade in
    if (roleAssignmentPhase === 'circles-fade-in' || roleAssignmentPhase === 'static') {
        const alpha = circlesFadeProgress * 255;
        
        // Calculate circle positions with equal horizontal spacing
        const circleRadius = Math.min(width, height) * 0.3; // 30% of screen
        const spacing = width * 0.1; // 10% spacing in middle
        const leftCircleX = width / 2 - spacing / 2 - circleRadius;
        const rightCircleX = width / 2 + spacing / 2 + circleRadius;
        const circleY = height / 2 + 100;
        
        push();
        
        // Group 1 circle (red)
        noFill();
        stroke(220, 50, 50, alpha); // Red
        strokeWeight(6);
        drawingContext.setLineDash([15, 15]);
        circle(leftCircleX, circleY, circleRadius * 2);
        drawingContext.setLineDash([]);
        
        fill(220, 50, 50, alpha);
        textAlign(CENTER, CENTER);
        textSize(48);
        if (customFont) textFont(customFont);
        text('Group 1', leftCircleX, circleY - 40);
        textSize(32);
        if (customFontMedium) textFont(customFontMedium);
        text('Stand here', leftCircleX, circleY + 20);
        
        // Ready count in Group 1 circle
        if (totalDebaters > 0) {
            textSize(64);
            fill(220, 50, 50, alpha);
            text(`${readyCount}/${totalDebaters}`, leftCircleX, circleY);
        }
        
        // Group 2 circle (green)
        noFill();
        stroke(50, 200, 100, alpha); // Green
        strokeWeight(6);
        drawingContext.setLineDash([15, 15]);
        circle(rightCircleX, circleY, circleRadius * 2);
        drawingContext.setLineDash([]);
        
        fill(50, 200, 100, alpha);
        textAlign(CENTER, CENTER);
        textSize(48);
        if (customFont) textFont(customFont);
        text('Group 2', rightCircleX, circleY - 40);
        textSize(32);
        if (customFontMedium) textFont(customFontMedium);
        text('Stand here', rightCircleX, circleY + 20);
        
        // Ready count in Group 2 circle
        if (totalDebaters > 0) {
            textSize(64);
            fill(50, 200, 100, alpha);
            text(`${readyCount}/${totalDebaters}`, rightCircleX, circleY);
        }
        
        pop();
    }
}

// Draw listener voting circles synced with mobile controller
// Red votes = Group 1, Green votes = Group 2
function drawListenerVotingCircles() {
    // Check for post-debate phases
    if (debateOverPhase === 'debate-over') {
        drawDebateOverScreen();
        return;
    }
    if (debateOverPhase === 'vote-counting') {
        drawVoteCountingScreen();
        return;
    }
    if (debateOverPhase === 'winner') {
        drawWinnerScreen();
        return;
    }
    
    const balance = window.listenerVoteBalance || 0; // -20 to +20
    
    // Base circle size
    const baseSize = 400;
    
    // Convert balance to scales (same as mobile)
    // Balance = 0: both at 1.0x
    // Balance = -20: Group 1 at 1.5x, Group 2 at 0.5x
    // Balance = +20: Group 1 at 0.5x, Group 2 at 1.5x
    const maxBalance = 20;
    const normalizedBalance = balance / maxBalance; // -1 to +1
    
    const group1Scale = 1.0 - (normalizedBalance * 0.5);
    const group2Scale = 1.0 + (normalizedBalance * 0.5);
    
    // Circle positions
    const leftX = width * 0.3;
    const rightX = width * 0.7;
    const circleY = height / 2 - 20;
    
    // Switch to RGB color mode
    colorMode(RGB, 255);
    
    // Draw Group 1 (Red) circle with timer segments
    push();
    const group1Size = baseSize * group1Scale;
    
    // Dashed circle outline
    noFill();
    stroke(220, 53, 69);
    strokeWeight(4);
    drawingContext.setLineDash([15, 15]);
    circle(leftX, circleY, group1Size);
    drawingContext.setLineDash([]);
    
    // Timer segments (if it's Group 1's turn)
    if (debateTimerActive && currentTurn === 1) {
        const progress = turnTimeRemaining / 30;
        const totalSegments = 40;
        const remainingSegments = Math.ceil(progress * totalSegments);
        const segmentAngle = TWO_PI / totalSegments;
        const segmentLength = segmentAngle * 0.6;
        const outerRadius = group1Size / 2 + 15;
        
        noFill();
        stroke(220, 53, 69);
        strokeWeight(6);
        strokeCap(SQUARE);
        
        for (let i = 0; i < remainingSegments; i++) {
            const startAngle = -HALF_PI + (i * segmentAngle);
            const endAngle = startAngle + segmentLength;
            arc(leftX, circleY, outerRadius * 2, outerRadius * 2, startAngle, endAngle);
        }
    }
    
    // Group 1 label
    fill(220, 53, 69);
    textAlign(CENTER, CENTER);
    textSize(32);
    if (customFont) textFont(customFont);
    text('Group 1', leftX, circleY - 50);
    
    // Status text
    textSize(20);
    fill(255);
    if (debateTimerActive && currentTurn === 1) {
        text('Your turn', leftX, circleY - 15);
        
        // Timer display
        textSize(48);
        const minutes = Math.floor(turnTimeRemaining / 60);
        const seconds = Math.floor(turnTimeRemaining % 60);
        text(`${minutes}:${seconds.toString().padStart(2, '0')}`, leftX, circleY + 30);
    } else {
        text('Listen...', leftX, circleY - 15);
        text('- - : - -', leftX, circleY + 30);
    }
    pop();
    
    // Draw Group 2 (Green) circle with timer segments
    push();
    const group2Size = baseSize * group2Scale;
    
    // Dashed circle outline
    noFill();
    stroke(40, 167, 69);
    strokeWeight(4);
    drawingContext.setLineDash([15, 15]);
    circle(rightX, circleY, group2Size);
    drawingContext.setLineDash([]);
    
    // Timer segments (if it's Group 2's turn)
    if (debateTimerActive && currentTurn === 2) {
        const progress = turnTimeRemaining / 30;
        const totalSegments = 40;
        const remainingSegments = Math.ceil(progress * totalSegments);
        const segmentAngle = TWO_PI / totalSegments;
        const segmentLength = segmentAngle * 0.6;
        const outerRadius = group2Size / 2 + 15;
        
        noFill();
        stroke(40, 167, 69);
        strokeWeight(6);
        strokeCap(SQUARE);
        
        for (let i = 0; i < remainingSegments; i++) {
            const startAngle = -HALF_PI + (i * segmentAngle);
            const endAngle = startAngle + segmentLength;
            arc(rightX, circleY, outerRadius * 2, outerRadius * 2, startAngle, endAngle);
        }
    }
    
    // Group 2 label
    fill(40, 167, 69);
    textAlign(CENTER, CENTER);
    textSize(32);
    if (customFont) textFont(customFont);
    text('Group 2', rightX, circleY - 50);
    
    // Status text
    textSize(20);
    fill(255);
    if (debateTimerActive && currentTurn === 2) {
        text('Your turn', rightX, circleY - 15);
        
        // Timer display
        textSize(48);
        const minutes = Math.floor(turnTimeRemaining / 60);
        const seconds = Math.floor(turnTimeRemaining % 60);
        text(`${minutes}:${seconds.toString().padStart(2, '0')}`, rightX, circleY + 30);
    } else {
        text('Listen...', rightX, circleY - 15);
        text('- - : - -', rightX, circleY + 30);
    }
    pop();
    
    // Draw topic at bottom
    push();
    fill(255, 215, 0); // Yellow for topic name
    textAlign(CENTER, CENTER);
    textSize(28);
    if (customFont) textFont(customFont);
    text(winningCluster?.label || 'Climate Change', width / 2, height - 120);
    
    // Debate question
    fill(255);
    textSize(24);
    textAlign(CENTER, CENTER);
    const questionText = debateQuestion || 'Should fossil fuels be banned entirely?';
    console.log('📝 Drawing debate question:', questionText);
    console.log('   Position:', width / 2, height - 60);
    console.log('   Canvas height:', height);
    
    // Draw with text wrapping
    const maxWidth = width * 0.7;
    text(questionText, width / 2 - maxWidth/2, height - 60, maxWidth);
    pop();
    
    // Reset color mode
    colorMode(HSB, 360, 100, 100);
}

// Phase 1: Debate Over Screen
function drawDebateOverScreen() {
    const baseSize = 400;
    const maxBalance = 20;
    const normalizedBalance = finalVoteBalance / maxBalance;
    
    const group1Scale = 1.0 - (normalizedBalance * 0.5);
    const group2Scale = 1.0 + (normalizedBalance * 0.5);
    
    const leftX = width * 0.3;
    const rightX = width * 0.7;
    const circleY = height / 2 - 20;
    
    colorMode(RGB, 255);
    
    // Draw Group 1 (Red) circle - frozen at final size
    push();
    const group1Size = baseSize * group1Scale;
    
    noFill();
    stroke(220, 53, 69);
    strokeWeight(4);
    drawingContext.setLineDash([15, 15]);
    circle(leftX, circleY, group1Size);
    drawingContext.setLineDash([]);
    
    fill(220, 53, 69);
    textAlign(CENTER, CENTER);
    textSize(32);
    if (customFont) textFont(customFont);
    text('Group 1', leftX, circleY - 50);
    
    textSize(20);
    fill(255);
    text('Debate over', leftX, circleY);
    pop();
    
    // Draw Group 2 (Green) circle - frozen at final size
    push();
    const group2Size = baseSize * group2Scale;
    
    noFill();
    stroke(40, 167, 69);
    strokeWeight(4);
    drawingContext.setLineDash([15, 15]);
    circle(rightX, circleY, group2Size);
    drawingContext.setLineDash([]);
    
    fill(40, 167, 69);
    textAlign(CENTER, CENTER);
    textSize(32);
    if (customFont) textFont(customFont);
    text('Group 2', rightX, circleY - 50);
    
    textSize(20);
    fill(255);
    text('Debate over', rightX, circleY);
    pop();
    
    // Draw topic at bottom
    push();
    fill(255, 215, 0);
    textAlign(CENTER, CENTER);
    textSize(28);
    if (customFont) textFont(customFont);
    text(winningCluster?.label || 'Climate Change', width / 2, height - 120);
    
    fill(255);
    textSize(22);
    const maxWidth = width * 0.8;
    text(debateQuestion || 'Should fossil fuels be banned entirely?', width / 2 - maxWidth/2, height - 70, maxWidth);
    pop();
    
    colorMode(HSB, 360, 100, 100);
}

// Phase 2: Vote Counting Animation
function drawVoteCountingScreen() {
    // Calculate actual vote counts from balance
    const group1Votes = Math.round(20 + Math.abs(Math.min(finalVoteBalance, 0)));
    const group2Votes = Math.round(20 + Math.max(finalVoteBalance, 0));
    
    // Animate vote count slowly (increment by 0.3 per frame for ~60fps = ~5 votes/second)
    voteCountAnimation += 0.3;
    const displayGroup1Votes = Math.min(Math.floor(voteCountAnimation), group1Votes);
    const displayGroup2Votes = Math.min(Math.floor(voteCountAnimation), group2Votes);
    
    const baseSize = 400;
    const maxBalance = 20;
    const normalizedBalance = finalVoteBalance / maxBalance;
    
    const group1Scale = 1.0 - (normalizedBalance * 0.5);
    const group2Scale = 1.0 + (normalizedBalance * 0.5);
    
    const leftX = width * 0.3;
    const rightX = width * 0.7;
    const circleY = height / 2 - 20;
    
    colorMode(RGB, 255);
    
    // Draw Group 1 (Red) circle with vote count
    push();
    const group1Size = baseSize * group1Scale;
    
    noFill();
    stroke(220, 53, 69);
    strokeWeight(4);
    drawingContext.setLineDash([15, 15]);
    circle(leftX, circleY, group1Size);
    drawingContext.setLineDash([]);
    
    fill(220, 53, 69);
    textAlign(CENTER, CENTER);
    textSize(24);
    if (customFont) textFont(customFont);
    text('Votes', leftX, circleY - 30);
    
    textSize(64);
    fill(220, 53, 69);
    text(displayGroup1Votes, leftX, circleY + 20);
    pop();
    
    // Draw Group 2 (Green) circle with vote count
    push();
    const group2Size = baseSize * group2Scale;
    
    noFill();
    stroke(40, 167, 69);
    strokeWeight(4);
    drawingContext.setLineDash([15, 15]);
    circle(rightX, circleY, group2Size);
    drawingContext.setLineDash([]);
    
    fill(40, 167, 69);
    textAlign(CENTER, CENTER);
    textSize(24);
    if (customFont) textFont(customFont);
    text('Votes', rightX, circleY - 30);
    
    textSize(64);
    fill(40, 167, 69);
    text(displayGroup2Votes, rightX, circleY + 20);
    pop();
    
    // Draw topic at bottom
    push();
    fill(255, 215, 0);
    textAlign(CENTER, CENTER);
    textSize(28);
    if (customFont) textFont(customFont);
    text(winningCluster?.label || 'Climate Change', width / 2, height - 120);
    
    fill(255);
    textSize(22);
    const maxWidth = width * 0.8;
    text(debateQuestion || 'Should fossil fuels be banned entirely?', width / 2 - maxWidth/2, height - 70, maxWidth);
    pop();
    
    colorMode(HSB, 360, 100, 100);
}

// Phase 3: Winner Screen
function drawWinnerScreen() {
    // Calculate final vote counts
    const group1Votes = Math.round(20 + Math.abs(Math.min(finalVoteBalance, 0)));
    const group2Votes = Math.round(20 + Math.max(finalVoteBalance, 0));
    const winnerVotes = winnerGroup === 1 ? group1Votes : group2Votes;
    
    const baseSize = 400;
    const maxBalance = 20;
    const normalizedBalance = finalVoteBalance / maxBalance;
    
    // Winner circle scale
    const winnerScale = winnerGroup === 1 ? (1.0 - (normalizedBalance * 0.5)) : (1.0 + (normalizedBalance * 0.5));
    
    const circleX = width * 0.25;
    const circleY = height / 2;
    
    colorMode(RGB, 255);
    
    // Draw winner circle on left
    push();
    const winnerSize = baseSize * winnerScale;
    const winnerColor = winnerGroup === 1 ? [220, 53, 69] : [40, 167, 69];
    
    noFill();
    stroke(...winnerColor);
    strokeWeight(4);
    drawingContext.setLineDash([15, 15]);
    circle(circleX, circleY, winnerSize);
    drawingContext.setLineDash([]);
    
    fill(...winnerColor);
    textAlign(CENTER, CENTER);
    textSize(24);
    if (customFont) textFont(customFont);
    text('Votes', circleX, circleY - 30);
    
    textSize(64);
    text(winnerVotes, circleX, circleY + 20);
    pop();
    
    // Draw summary on right
    const rightX = width * 0.65;
    const startY = height * 0.25;
    
    push();
    textAlign(LEFT, TOP);
    
    // Debate winner
    fill(winnerGroup === 1 ? 220 : 40, winnerGroup === 1 ? 53 : 167, winnerGroup === 1 ? 69 : 69);
    textSize(32);
    if (customFont) textFont(customFont);
    text('Debate winner', rightX, startY);
    
    fill(255);
    textSize(28);
    text(`Group ${winnerGroup}`, rightX, startY + 45);
    
    // Stance
    fill(winnerGroup === 1 ? 220 : 40, winnerGroup === 1 ? 53 : 167, winnerGroup === 1 ? 69 : 69);
    textSize(32);
    text('Stance', rightX, startY + 110);
    
    fill(255);
    textSize(28);
    if (customFontMedium) textFont(customFontMedium);
    text(winnerGroup === 1 ? 'Against' : 'For', rightX, startY + 155);
    
    // Debate topic
    fill(winnerGroup === 1 ? 220 : 40, winnerGroup === 1 ? 53 : 167, winnerGroup === 1 ? 69 : 69);
    textSize(32);
    if (customFont) textFont(customFont);
    text('Debate topic', rightX, startY + 220);
    
    fill(255);
    textSize(24);
    text(winningCluster?.label || 'Climate change', rightX, startY + 265);
    
    // Argument
    fill(winnerGroup === 1 ? 220 : 40, winnerGroup === 1 ? 53 : 167, winnerGroup === 1 ? 69 : 69);
    textSize(32);
    if (customFont) textFont(customFont);
    text('Argument', rightX, startY + 330);
    
    fill(255);
    textSize(22);
    const maxWidth = width * 0.3;
    text(debateQuestion || 'Should fossil fuels be banned entirely?', rightX, startY + 375, maxWidth);
    pop();
    
    colorMode(HSB, 360, 100, 100);
}

// Draw idle/welcome screen
function drawIdleScreen() {
    background(0);
    
    // Hide countdown timer display
    const displayCountdown = document.getElementById('displayCountdown');
    if (displayCountdown) displayCountdown.style.display = 'none';
    
    // Title
    push();
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(64);
    if (customFont) textFont(customFont);
    text('Split Signals', width / 2, height / 2 - 100);
    pop();
    
    // Start button
    push();
    const buttonW = 200;
    const buttonH = 80;
    const buttonX = width / 2 - buttonW / 2;
    const buttonY = height / 2;
    
    // Button background
    fill(220, 53, 69); // Red
    noStroke();
    rect(buttonX, buttonY, buttonW, buttonH);
    
    // Button text
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(32);
    if (customFont) textFont(customFont);
    text('Start', width / 2, buttonY + buttonH / 2);
    pop();
}

// Start the experience
function startExperience() {
    idleScreenActive = false;
    experienceStarted = true;
    
    // Show countdown timer display
    const displayCountdown = document.getElementById('displayCountdown');
    if (displayCountdown) displayCountdown.style.display = 'block';
    
    // Broadcast start to all mobile clients and server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'experience_start'
        }));
    }
    
    console.log('🎬 Experience started!');
}

// Mouse click handler for Start button
function mousePressed() {
    if (idleScreenActive) {
        // Check if Start button clicked
        const buttonW = 200;
        const buttonH = 80;
        const buttonX = width / 2 - buttonW / 2;
        const buttonY = height / 2;
        
        if (mouseX >= buttonX && mouseX <= buttonX + buttonW &&
            mouseY >= buttonY && mouseY <= buttonY + buttonH) {
            // Start experience
            startExperience();
        }
    }
}

// Draw debate voting screen with live vote visualization
function drawDebateVotingScreen() {
    background(0);
    
    // Draw listener voting circles if listener balance exists
    if (window.listenerVoteBalance !== undefined) {
        drawListenerVotingCircles();
        return; // Show only listener circles when listener is voting
    }
    
    // Calculate circle sizes based on active holds (each person adds 50px)
    const baseSize = 300;
    const sizePerPerson = 50;
    const redSize = baseSize + (redVoteCount * sizePerPerson);
    const greenSize = baseSize + (greenVoteCount * sizePerPerson);
    
    // Calculate pulse effect (only when votes > 0)
    const pulseSpeed = 0.05;
    const redPulse = redVoteCount > 0 ? sin(frameCount * pulseSpeed) * 10 : 0;
    const greenPulse = greenVoteCount > 0 ? sin(frameCount * pulseSpeed) * 10 : 0;
    
    // Circle positions
    const leftX = width * 0.3;
    const rightX = width * 0.7;
    const circleY = height / 2 + 50;
    
    // Switch to RGB color mode for correct colors
    colorMode(RGB, 255);
    
    // Draw Group 1 (Red) circle
    push();
    
    // Glow effect when votes > 0
    if (redVoteCount > 0) {
        drawingContext.shadowBlur = 30 + redPulse;
        drawingContext.shadowColor = 'rgba(220, 53, 69, 0.6)';
    }
    
    noFill();
    stroke(220, 53, 69);
    strokeWeight(6);
    drawingContext.setLineDash([15, 15]);
    circle(leftX, circleY, redSize + redPulse);
    drawingContext.setLineDash([]);
    drawingContext.shadowBlur = 0;
    
    // Draw animated segmented progress for Group 1 (countdown from full)
    if (debateTimerActive && currentTurn === 1) {
        const progress = turnTimeRemaining / 30; // 1 to 0 as time goes down
        const totalSegments = 40; // Number of segments around circle
        const remainingSegments = Math.ceil(progress * totalSegments);
        const segmentAngle = TWO_PI / totalSegments;
        const segmentLength = segmentAngle * 0.6; // 60% solid, 40% gap to match dashed circle
        const outerRadius = (redSize + redPulse) / 2 + 15; // Outside the main circle
        
        noFill();
        stroke(220, 53, 69);
        strokeWeight(6); // Match main circle stroke weight
        strokeCap(SQUARE);
        
        for (let i = 0; i < remainingSegments; i++) {
            const startAngle = -HALF_PI + (i * segmentAngle);
            const endAngle = startAngle + segmentLength;
            arc(leftX, circleY, outerRadius * 2, outerRadius * 2, startAngle, endAngle);
        }
    }
    
    // Group 1 label and content
    fill(220, 53, 69);
    textAlign(CENTER, CENTER);
    textSize(36);
    if (customFont) textFont(customFont);
    text('Group 1', leftX, circleY - 40);
    
    // Show position stance if available
    if (debatePositions && debatePositions.group1) {
        textSize(16);
        fill(180);
        text(debatePositions.group1.stance, leftX, circleY - 70);
    }
    
    // Status text or timer
    if (!debateTimerActive) {
        textSize(28);
        if (customFontMedium) textFont(customFontMedium);
        text('Debate', leftX, circleY);
        text('Over', leftX, circleY + 35);
    } else if (currentTurn === 1) {
        textSize(20);
        if (customFontMedium) textFont(customFontMedium);
        text('Opening statement', leftX, circleY - 10);
        textSize(56);
        const minutes = Math.floor(turnTimeRemaining / 60);
        const seconds = turnTimeRemaining % 60;
        text(`${minutes}:${seconds.toString().padStart(2, '0')}`, leftX, circleY + 35);
    } else {
        textSize(24);
        if (customFontMedium) textFont(customFontMedium);
        text('Listen...', leftX, circleY);
    }
    
    pop();
    
    // Draw Group 2 (Green) circle
    push();
    
    // Glow effect when votes > 0
    if (greenVoteCount > 0) {
        drawingContext.shadowBlur = 30 + greenPulse;
        drawingContext.shadowColor = 'rgba(50, 200, 100, 0.6)';
    }
    
    noFill();
    stroke(50, 200, 100);
    strokeWeight(6);
    drawingContext.setLineDash([15, 15]);
    circle(rightX, circleY, greenSize + greenPulse);
    drawingContext.setLineDash([]);
    drawingContext.shadowBlur = 0;
    
    // Draw animated segmented progress for Group 2 (countdown from full)
    if (debateTimerActive && currentTurn === 2) {
        const progress = turnTimeRemaining / 30; // 1 to 0 as time goes down
        const totalSegments = 40; // Number of segments around circle
        const remainingSegments = Math.ceil(progress * totalSegments);
        const segmentAngle = TWO_PI / totalSegments;
        const segmentLength = segmentAngle * 0.6; // 60% solid, 40% gap to match dashed circle
        const outerRadius = (greenSize + greenPulse) / 2 + 15; // Outside the main circle
        
        noFill();
        stroke(50, 200, 100);
        strokeWeight(6); // Match main circle stroke weight
        strokeCap(SQUARE);
        
        for (let i = 0; i < remainingSegments; i++) {
            const startAngle = -HALF_PI + (i * segmentAngle);
            const endAngle = startAngle + segmentLength;
            arc(rightX, circleY, outerRadius * 2, outerRadius * 2, startAngle, endAngle);
        }
    }
    
    // Group 2 label and content
    fill(50, 200, 100);
    textAlign(CENTER, CENTER);
    textSize(36);
    if (customFont) textFont(customFont);
    text('Group 2', rightX, circleY - 40);
    
    // Show position stance if available
    if (debatePositions && debatePositions.group2) {
        textSize(16);
        fill(180);
        text(debatePositions.group2.stance, rightX, circleY - 70);
    }
    
    // Status text or timer
    if (!debateTimerActive) {
        textSize(28);
        if (customFontMedium) textFont(customFontMedium);
        text('Debate', rightX, circleY);
        text('Over', rightX, circleY + 35);
    } else if (currentTurn === 2) {
        textSize(20);
        if (customFontMedium) textFont(customFontMedium);
        text('Listen...', rightX, circleY - 10);
        textSize(56);
        const minutes = Math.floor(turnTimeRemaining / 60);
        const seconds = turnTimeRemaining % 60;
        text(`${minutes}:${seconds.toString().padStart(2, '0')}`, rightX, circleY + 35);
    } else {
        textSize(24);
        if (customFontMedium) textFont(customFontMedium);
        text('Listen...', rightX, circleY);
    }
    
    pop();
    
    // Draw topic and debate question at bottom
    push();
    colorMode(RGB, 255);
    fill(255, 215, 0); // Yellow for topic name
    textAlign(CENTER, CENTER);
    textSize(28);
    if (customFont) textFont(customFont);
    text(winningCluster?.label || 'Climate Change', width / 2, height - 120);
    
    // Debate question
    fill(255);
    textSize(24);
    textAlign(CENTER, CENTER);
    const questionText = debateQuestion || 'Should fossil fuels be banned entirely?';
    console.log('📝 Drawing debate question:', questionText);
    
    // Draw with text wrapping
    const maxWidth = width * 0.7;
    text(questionText, width / 2 - maxWidth/2, height - 60, maxWidth);
    pop();
    
    // Switch back to HSB for rest of sketch
    colorMode(HSB, 360, 100, 100);
}

// Draw debate voting metaballs
function drawDebateVotingMetaballs() {
    // Show loading state while fetching headlines
    if (headlinesLoading) {
        background(0);
        fill(255);
        textAlign(CENTER, CENTER);
        textSize(32);
        if (customFontSemibold) {
            textFont(customFontSemibold);
        }
        text('Loading opposing headlines...', width / 2, height / 2);
        return;
    }
    
    // If we have opposing headlines, display them instead of metaballs
    if (opposingHeadlines) {
        displayDebateHeadlines(opposingHeadlines.position1, opposingHeadlines.position2);
        return;
    }
    
    if (!debateVotingActive || !blueMetaball || !redMetaball) return;
    
    // Update sizes
    updateDebateMetaballs();
    
    // Update animation offsets
    blueMetaball.morphOffset += 0.01;
    blueMetaball.floatOffset += 0.02;
    redMetaball.morphOffset += 0.012;
    redMetaball.floatOffset += 0.018;
    
    // Switch to RGB color mode for correct colors
    colorMode(RGB, 255);
    
    // Draw blue metaball
    drawAnimatedMetaball(blueMetaball, color(0, 0, 254));
    
    // Draw green metaball
    drawAnimatedMetaball(redMetaball, color(60, 179, 113));
    
    // Switch back to HSB for rest of sketch
    colorMode(HSB);
}

// Draw a single animated metaball
function drawAnimatedMetaball(ball, ballColor) {
    push();
    
    // Floating animation
    const floatY = sin(ball.floatOffset) * 20;
    
    // Set color
    fill(ballColor);
    noStroke();
    
    // Draw organic blob shape
    translate(ball.x, ball.y + floatY);
    
    beginShape();
    const points = 8;
    for (let i = 0; i < points; i++) {
        const angle = (i / points) * TWO_PI;
        
        // Create organic morphing effect
        const morphAmount = sin(ball.morphOffset + i) * 0.2;
        const radius = ball.currentSize * (1 + morphAmount);
        
        const x = cos(angle) * radius;
        const y = sin(angle) * radius;
        
        if (i === 0) {
            vertex(x, y);
        } else {
            // Use quadratic curves for smooth organic shape
            const prevAngle = ((i - 1) / points) * TWO_PI;
            const prevMorph = sin(ball.morphOffset + (i - 1)) * 0.2;
            const prevRadius = ball.currentSize * (1 + prevMorph);
            
            const cpAngle = (prevAngle + angle) / 2;
            const cpMorph = sin(ball.morphOffset + i - 0.5) * 0.2;
            const cpRadius = ball.currentSize * (1 + cpMorph) * 1.1;
            
            const cpX = cos(cpAngle) * cpRadius;
            const cpY = sin(cpAngle) * cpRadius;
            
            quadraticVertex(cpX, cpY, x, y);
        }
    }
    endShape(CLOSE);
    
    // Draw vote percentage text
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(32);
    text(Math.round(ball.votePercentage) + '%', 0, 0);
    
    pop();
}

// Handle vote from mobile client
function handleDebateVote(voteColor) {
    if (!debateVotingActive) return;
    
    if (voteColor === 'blue') {
        blueVotes++;
        console.log('🔵 Blue vote received. Total:', blueVotes);
    } else if (voteColor === 'red') {
        redVotes++;
        console.log('🔴 Red vote received. Total:', redVotes);
    }
    
    // Broadcast updated votes to all clients
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'debate_vote_update',
            blueVotes: blueVotes,
            redVotes: redVotes
        }));
    }
}
