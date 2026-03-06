import { pipeline } from '@xenova/transformers';

class SentenceTransformer {
    constructor() {
        this.embedder = null;
        this.cache = new Map();
        this.isReady = false;
    }
    
    async initialize() {
        if (this.isReady) return;
        
        console.log('Loading Sentence Transformer model...');
        try {
            // Load the model (all-MiniLM-L6-v2 - small and fast)
            this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            this.isReady = true;
            console.log('✅ Sentence Transformer model loaded');
        } catch (error) {
            console.error('Failed to load Sentence Transformer:', error);
            throw error;
        }
    }
    
    // Get embedding vector for text
    async getEmbedding(text) {
        if (!this.isReady) {
            await this.initialize();
        }
        
        const cacheKey = text.toLowerCase().trim();
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        try {
            const output = await this.embedder(text, { pooling: 'mean', normalize: true });
            const embedding = Array.from(output.data);
            this.cache.set(cacheKey, embedding);
            return embedding;
        } catch (error) {
            console.error('Error getting embedding:', error);
            return null;
        }
    }
    
    // Calculate cosine similarity between two vectors
    cosineSimilarity(vec1, vec2) {
        if (!vec1 || !vec2 || vec1.length !== vec2.length) {
            return 0;
        }
        
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }
        
        norm1 = Math.sqrt(norm1);
        norm2 = Math.sqrt(norm2);
        
        if (norm1 === 0 || norm2 === 0) return 0;
        
        return dotProduct / (norm1 * norm2);
    }
    
    // Calculate semantic similarity between two texts
    async getSimilarity(text1, text2) {
        console.log(`🔍 Calculating similarity: "${text1.substring(0, 30)}..." vs "${text2.substring(0, 30)}..."`);
        
        const embedding1 = await this.getEmbedding(text1);
        const embedding2 = await this.getEmbedding(text2);
        
        if (!embedding1 || !embedding2) {
            console.log('⚠️ Failed to get embeddings, returning 0');
            return 0;
        }
        
        const similarity = this.cosineSimilarity(embedding1, embedding2);
        console.log(`✅ Similarity: ${(similarity * 100).toFixed(1)}%`);
        
        return similarity;
    }
    
    // Calculate similarity between keyword arrays (for compatibility)
    async calculateSemanticSimilarity(keywords1, keywords2) {
        // Join keywords into sentences
        const text1 = keywords1.join(' ');
        const text2 = keywords2.join(' ');
        
        return await this.getSimilarity(text1, text2);
    }
    
    // Get cache statistics
    getCacheStats() {
        return {
            size: this.cache.size,
            ready: this.isReady
        };
    }
}

export default SentenceTransformer;
