// Node class - represents a post in the network
class Node {
    constructor(content, timestamp, canvasWidth, canvasHeight, nlp) {
        this.content = content;
        this.timestamp = timestamp;
        
        // Random position
        this.x = random(100, canvasWidth - 100);
        this.y = random(100, canvasHeight - 100);
        
        this.vx = 0;
        this.vy = 0;
        this.keywords = this.extractKeywords(content, nlp);
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
        
        this.lines = lines;
        this.boxWidth = maxWidth + 40;
        this.boxHeight = lines.length * 20 + 20;
        
        this.tfidf = null;
        this.cluster = undefined;
        this.clusterColor = null;
    }
    
    generateColor(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = text.charCodeAt(i) + ((hash << 5) - hash);
        }
        return {
            h: abs(hash) % 360,
            s: 70,
            b: 80
        };
    }
    
    extractKeywords(content, nlp) {
        const tfidf = nlp.calculateTFIDF(content, [content]);
        this.tfidf = tfidf;
        
        const topKeywords = nlp.getTopKeywords(this.tfidf, 10);
        this.keywordScores = new Map(topKeywords.map(k => [k.word, k.score]));
        
        return topKeywords.map(k => k.word);
    }
    
    update(nodes, connectionCache) {
        let fx = 0;
        let fy = 0;
        
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
                // MUCH STRONGER attraction - pulls posts together FAST
                const force = (similarity - 0.3) * 2.5;
                fx += (dx / dist) * force;
                fy += (dy / dist) * force;
            }
            
            // Prevent excessive overlap - even for similar posts
            if (dist < 100) {
                // Strong repulsion when too close to prevent overlap
                const repelForce = (100 - dist) / 100 * 2.5;
                fx -= (dx / dist) * repelForce;
                fy -= (dy / dist) * repelForce;
            } else if (differentCluster && dist < 400) {
                // EXTREMELY STRONG repulsion between different clusters
                const repelForce = (400 - dist) / 400 * 4.0;
                fx -= (dx / dist) * repelForce;
                fy -= (dy / dist) * repelForce;
            } else if (dist < 200) {
                // Normal repulsion for same cluster or no cluster
                const repelForce = (200 - dist) / 200 * 0.5;
                fx -= (dx / dist) * repelForce;
                fy -= (dy / dist) * repelForce;
            }
        });
        
        // Removed: center gravity - allows clusters to spread out naturally
        
        this.vx += fx;
        this.vy += fy;
        this.vx *= 0.70;
        this.vy *= 0.70;
        
        this.x += this.vx;
        this.y += this.vy;
        
        const margin = this.boxWidth / 2 + 20;
        this.x = constrain(this.x, margin, width - margin);
        this.y = constrain(this.y, this.boxHeight / 2 + 20, height - this.boxHeight / 2 - 20);
    }
    
    async calculateSimilarity(other, currentDatabase, ws) {
        const key1 = `${nodes.indexOf(this)}-${nodes.indexOf(other)}`;
        const key2 = `${nodes.indexOf(other)}-${nodes.indexOf(this)}`;
        
        if (connectionCache.has(key1) || connectionCache.has(key2)) {
            return connectionCache.get(key1) || connectionCache.get(key2);
        }
        
        const tfidfSim = nlp.cosineSimilarity(this.tfidf, other.tfidf);
        
        if (currentDatabase === 'tfidf') {
            const key = nodes.indexOf(this) < nodes.indexOf(other) ? key1 : key2;
            connectionCache.set(key, tfidfSim);
            return tfidfSim;
        }
        
        try {
            updateAPIStatus('loading');
            
            const startTime = Date.now();
            
            const response = await fetch('http://localhost:8080/api/similarity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text1: this.content,
                    text2: other.content,
                    database: currentDatabase
                })
            });
            
            const responseTime = Date.now() - startTime;
            apiResponseTimes.push(responseTime);
            if (apiResponseTimes.length > 100) apiResponseTimes.shift();
            
            const data = await response.json();
            
            apiCallCount++;
            updateConceptNetPanel();
            updateAPIStatus('success');
            
            const combinedSim = (data.similarity * 0.7) + (tfidfSim * 0.3);
            
            const key = nodes.indexOf(this) < nodes.indexOf(other) ? key1 : key2;
            connectionCache.set(key, combinedSim);
            
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
            stroke(0, 200);
            strokeWeight(3);
            fill(255, alpha);
            text(line, 0, startY + i * lineHeight);
        });
        
        pop();
    }
}

export default Node;
