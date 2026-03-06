// Metaball rendering utilities
class MetaballRenderer {
    constructor() {
        this.metaballRadius = 100;
        this.gridResolution = 12;
        this.threshold = 1.0;
    }
    
    drawClusterMetaballs(nodes, connectionCache) {
        if (nodes.length < 1) return;
        
        const similarityThreshold = 0.2;
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
                
                if (similarity > similarityThreshold) {
                    group.push(j);
                    processed.add(j);
                }
            }
            
            groups.push(group);
        });
        
        groups.forEach((group, groupIndex) => {
            const groupNodes = group.map(i => nodes[i]);
            if (groupNodes.length === 0) return;
            
            const color = groupNodes[0].clusterColor || {
                h: (groupIndex * 360 / groups.length) % 360,
                s: 70,
                b: 80
            };
            
            const minX = Math.min(...groupNodes.map(n => n.x)) - this.metaballRadius * 2;
            const maxX = Math.max(...groupNodes.map(n => n.x)) + this.metaballRadius * 2;
            const minY = Math.min(...groupNodes.map(n => n.y)) - this.metaballRadius * 2;
            const maxY = Math.max(...groupNodes.map(n => n.y)) + this.metaballRadius * 2;
            
            const grid = [];
            const cols = Math.ceil((maxX - minX) / this.gridResolution);
            const rows = Math.ceil((maxY - minY) / this.gridResolution);
            
            for (let y = 0; y < rows; y++) {
                grid[y] = [];
                for (let x = 0; x < cols; x++) {
                    const px = minX + x * this.gridResolution;
                    const py = minY + y * this.gridResolution;
                    
                    let fieldStrength = 0;
                    groupNodes.forEach(node => {
                        const dx = px - node.x;
                        const dy = py - node.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance > 0) {
                            fieldStrength += this.metaballRadius / distance;
                        }
                    });
                    
                    grid[y][x] = fieldStrength;
                }
            }
            
            const contourPoints = [];
            for (let y = 0; y < rows - 1; y++) {
                for (let x = 0; x < cols - 1; x++) {
                    const tl = grid[y][x] >= this.threshold;
                    const tr = grid[y][x + 1] >= this.threshold;
                    const bl = grid[y + 1][x] >= this.threshold;
                    const br = grid[y + 1][x + 1] >= this.threshold;
                    
                    if (tl || tr || bl || br) {
                        const px = minX + x * this.gridResolution;
                        const py = minY + y * this.gridResolution;
                        contourPoints.push({ x: px, y: py });
                    }
                }
            }
            
            push();
            noStroke();
            fill(color.h, color.s, color.b, 150);
            
            if (contourPoints.length > 0) {
                beginShape();
                const hull = this.convexHull(contourPoints);
                const smoothed = this.smoothHull(hull);
                smoothed.forEach(p => vertex(p.x, p.y));
                endShape(CLOSE);
            }
            
            const centerX = groupNodes.reduce((sum, n) => sum + n.x, 0) / groupNodes.length;
            const centerY = groupNodes.reduce((sum, n) => sum + n.y, 0) / groupNodes.length;
            
            if (groupNodes.length === 1) {
                const node = groupNodes[0];
                push();
                translate(node.x, node.y);
                
                textAlign(CENTER, CENTER);
                textSize(14);
                
                const lineHeight = 20;
                const startY = -(node.lines.length - 1) * lineHeight / 2;
                
                node.lines.forEach((line, i) => {
                    stroke(0, 255);
                    strokeWeight(4);
                    fill(0, 255);
                    text(line, 0, startY + i * lineHeight);
                    
                    noStroke();
                    fill(255, 255);
                    text(line, 0, startY + i * lineHeight);
                });
                
                pop();
            }
            
            pop();
            
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
    
    convexHull(points) {
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
        
        upper.pop();
        lower.pop();
        return lower.concat(upper);
    }
    
    smoothHull(hull) {
        let smoothed = hull;
        
        for (let iteration = 0; iteration < 3; iteration++) {
            const newSmoothed = [];
            
            for (let i = 0; i < smoothed.length; i++) {
                const p0 = smoothed[(i - 1 + smoothed.length) % smoothed.length];
                const p1 = smoothed[i];
                const p2 = smoothed[(i + 1) % smoothed.length];
                
                newSmoothed.push({
                    x: (p0.x + p1.x * 2 + p2.x) / 4,
                    y: (p0.y + p1.y * 2 + p2.y) / 4
                });
                
                newSmoothed.push({
                    x: (p1.x + p2.x) / 2,
                    y: (p1.y + p2.y) / 2
                });
            }
            
            smoothed = newSmoothed;
        }
        
        return smoothed;
    }
}

export default MetaballRenderer;
