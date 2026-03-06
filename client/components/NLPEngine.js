// NLP Utilities for text processing and keyword extraction
class NLPEngine {
    constructor() {
        this.stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in', 'with', 'to', 'for', 'of', 'as', 'by', 'this', 'that', 'these', 'those', 'am', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'can']);
        this.documentFrequency = new Map();
        this.totalDocuments = 0;
    }
    
    tokenize(text) {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !this.stopWords.has(word));
    }
    
    calculateTFIDF(text, allTexts) {
        const tokens = this.tokenize(text);
        const termFreq = new Map();
        
        tokens.forEach(token => {
            termFreq.set(token, (termFreq.get(token) || 0) + 1);
        });
        
        const tfidf = new Map();
        termFreq.forEach((tf, term) => {
            const df = this.documentFrequency.get(term) || 1;
            const idf = Math.log(this.totalDocuments / df);
            tfidf.set(term, (tf / tokens.length) * idf);
        });
        
        return tfidf;
    }
    
    updateDocumentFrequency(texts) {
        this.totalDocuments = texts.length;
        this.documentFrequency.clear();
        
        texts.forEach(text => {
            const uniqueTokens = new Set(this.tokenize(text));
            uniqueTokens.forEach(token => {
                this.documentFrequency.set(token, (this.documentFrequency.get(token) || 0) + 1);
            });
        });
    }
    
    getTopKeywords(tfidf, count = 5) {
        return Array.from(tfidf.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, count)
            .map(([word, score]) => ({ word, score }));
    }
    
    cosineSimilarity(vec1, vec2) {
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
        
        if (mag1 === 0 || mag2 === 0) return 0;
        
        return dotProduct / (mag1 * mag2);
    }
}

export default NLPEngine;
