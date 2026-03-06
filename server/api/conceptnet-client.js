// ConceptNet API Client
// Provides semantic relationship queries for enhanced word similarity

const axios = require('axios');

class ConceptNetClient {
    constructor() {
        this.baseURL = 'http://api.conceptnet.io';
        this.cache = new Map(); // Cache API responses to avoid rate limits
        this.requestCount = 0;
        this.lastRequestTime = Date.now();
    }
    
    // Rate limiting: ConceptNet allows ~60 requests/minute
    async rateLimit() {
        this.requestCount++;
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        // If more than 50 requests in last minute, wait
        if (this.requestCount > 50 && timeSinceLastRequest < 60000) {
            const waitTime = 60000 - timeSinceLastRequest;
            console.log(`Rate limit: waiting ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            this.requestCount = 0;
        }
        
        this.lastRequestTime = now;
    }
    
    // Get semantic relatedness between two words (0 to 1)
    async getRelatedness(word1, word2) {
        const cacheKey = `rel:${[word1, word2].sort().join(':')}`;
        
        if (this.cache.has(cacheKey)) {
            console.log(`✅ Cache hit for ${word1}-${word2}:`, this.cache.get(cacheKey));
            return this.cache.get(cacheKey);
        }
        
        try {
            await this.rateLimit();
            
            const url = `${this.baseURL}/relatedness?node1=/c/en/${word1}&node2=/c/en/${word2}`;
            console.log(`🌐 Calling ConceptNet API: ${url}`);
            
            const response = await axios.get(`${this.baseURL}/relatedness`, {
                params: {
                    node1: `/c/en/${word1}`,
                    node2: `/c/en/${word2}`
                },
                timeout: 5000
            });
            
            console.log(`📡 ConceptNet response for ${word1}-${word2}:`, response.data);
            
            const relatedness = response.data.value || 0;
            this.cache.set(cacheKey, relatedness);
            
            console.log(`💾 Cached ${word1}-${word2}: ${relatedness}`);
            
            return relatedness;
        } catch (error) {
            console.error(`❌ ConceptNet API ERROR for ${word1}-${word2}:`);
            console.error(`   Error message:`, error.message);
            console.error(`   Error code:`, error.code);
            console.error(`   Full error:`, error);
            return 0; // Return 0 on error, fall back to TF-IDF
        }
    }
    
    // Get related concepts for a word
    async getRelated(word, limit = 10) {
        const cacheKey = `related:${word}:${limit}`;
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        try {
            await this.rateLimit();
            
            const response = await axios.get(`${this.baseURL}/query`, {
                params: {
                    node: `/c/en/${word}`,
                    limit: limit
                },
                timeout: 5000
            });
            
            const edges = response.data.edges.map(edge => ({
                start: this.extractConcept(edge.start.label),
                relation: edge.rel.label,
                end: this.extractConcept(edge.end.label),
                weight: edge.weight
            }));
            
            this.cache.set(cacheKey, edges);
            return edges;
        } catch (error) {
            console.error(`ConceptNet error for ${word}:`, error.message);
            return [];
        }
    }
    
    // Extract clean concept name from ConceptNet label
    extractConcept(label) {
        return label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    }
    
    // Calculate semantic similarity between two keyword arrays
    async calculateSemanticSimilarity(keywords1, keywords2) {
        console.log('🔍 ConceptNet calculating similarity for:', keywords1, 'vs', keywords2);
        if (keywords1.length === 0 || keywords2.length === 0) {
            console.log('⚠️ Empty keywords array detected!');
            return 0;
        }
        
        let totalRelatedness = 0;
        let comparisons = 0;
        
        // Compare each word in keywords1 with each word in keywords2
        for (const word1 of keywords1) {
            for (const word2 of keywords2) {
                if (word1 === word2) {
                    // Same word = perfect match
                    totalRelatedness += 1.0;
                    comparisons++;
                } else {
                    // Different words - check ConceptNet
                    const relatedness = await this.getRelatedness(word1, word2);
                    totalRelatedness += relatedness;
                    comparisons++;
                }
            }
        }
        
        // Return average relatedness
        const avgSimilarity = comparisons > 0 ? totalRelatedness / comparisons : 0;
        console.log('✅ ConceptNet similarity result:', avgSimilarity, 'from', comparisons, 'comparisons');
        return avgSimilarity;
    }
    
    // Get cache statistics
    getCacheStats() {
        return {
            size: this.cache.size,
            requests: this.requestCount
        };
    }
}

module.exports = ConceptNetClient;
