// K-means Clustering for grouping similar posts
class KMeansClustering {
    constructor(k = 3) {
        this.k = k;
        this.centroids = [];
        this.clusterColors = [];
        this.initializeColors();
    }
    
    initializeColors() {
        for (let i = 0; i < this.k; i++) {
            this.clusterColors.push({
                h: (i * 360 / this.k) % 360,
                s: 70,
                b: 80
            });
        }
    }
    
    initializeCentroids(nodes) {
        this.centroids = [];
        const indices = new Set();
        
        while (indices.size < this.k && indices.size < nodes.length) {
            indices.add(Math.floor(Math.random() * nodes.length));
        }
        
        Array.from(indices).forEach(i => {
            const vec = this.getFeatureVector(nodes[i]);
            this.centroids.push(new Map(vec));
        });
    }
    
    getFeatureVector(node) {
        if (!node.tfidf) return new Map();
        return new Map(node.tfidf);
    }
    
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
        return 1 - cosineSim;
    }
    
    assignClusters(nodes, connectionCache) {
        const assignments = [];
        
        nodes.forEach((node, nodeIdx) => {
            let maxSimilarity = -Infinity;
            let cluster = 0;
            
            this.centroids.forEach((centroid, clusterIdx) => {
                let totalSim = 0;
                let count = 0;
                
                nodes.forEach((otherNode, otherIdx) => {
                    if (nodeIdx === otherIdx) return;
                    
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
    
    updateCentroids(nodes, assignments) {
        const newCentroids = [];
        
        for (let c = 0; c < this.k; c++) {
            const clusterNodes = nodes.filter((_, i) => assignments[i] === c);
            
            if (clusterNodes.length === 0) {
                newCentroids.push(this.centroids[c] || new Map());
                continue;
            }
            
            const allTerms = new Set();
            clusterNodes.forEach(node => {
                const vec = this.getFeatureVector(node);
                vec.forEach((_, term) => allTerms.add(term));
            });
            
            const centroid = new Map();
            allTerms.forEach(term => {
                const sum = clusterNodes.reduce((acc, node) => {
                    const vec = this.getFeatureVector(node);
                    return acc + (vec.get(term) || 0);
                }, 0);
                centroid.set(term, sum / clusterNodes.length);
            });
            
            newCentroids.push(centroid);
        }
        
        this.centroids = newCentroids;
    }
    
    cluster(nodes, connectionCache) {
        if (nodes.length < this.k) {
            return nodes.map((_, i) => i % this.k);
        }
        
        this.initializeCentroids(nodes);
        
        for (let iter = 0; iter < 10; iter++) {
            const assignments = this.assignClusters(nodes, connectionCache);
            this.updateCentroids(nodes, assignments);
        }
        
        return this.assignClusters(nodes, connectionCache);
    }
}

export default KMeansClustering;
