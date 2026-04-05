// Semantic matching system for debate statements
const fs = require('fs');
const path = require('path');

// Load debate statements
const debateStatements = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'debate-statements.json'), 'utf8')
);

/**
 * Find the best matching debate topic and select a random statement
 * Uses semantic similarity between cluster content and topic keywords/names
 */
async function findBestDebateStatement(clusterPosts, sentenceTransformer) {
    if (!clusterPosts || clusterPosts.length === 0) {
        return getRandomFallbackStatement();
    }

    try {
        // Combine all cluster posts into one text
        const clusterText = clusterPosts
            .map(post => post.content || '')
            .filter(text => text.length > 0)
            .join(' ');

        if (!clusterText || !sentenceTransformer) {
            return getRandomFallbackStatement();
        }

        // Get embedding of cluster content
        const clusterEmbedding = await sentenceTransformer.getEmbedding(clusterText);

        // Calculate similarity with each topic
        const topicScores = await Promise.all(
            debateStatements.topics.map(async (topic) => {
                // Combine topic name and keywords for richer semantic matching
                const topicText = `${topic.name} ${topic.keywords.join(' ')}`;
                const topicEmbedding = await sentenceTransformer.getEmbedding(topicText);
                
                const similarity = cosineSimilarity(clusterEmbedding, topicEmbedding);
                
                return {
                    topic,
                    similarity
                };
            })
        );

        // Find best match
        topicScores.sort((a, b) => b.similarity - a.similarity);
        const bestMatch = topicScores[0];

        console.log(`\n🎯 Best topic match: "${bestMatch.topic.name}" (similarity: ${bestMatch.similarity.toFixed(3)})`);
        console.log(`   Category: ${bestMatch.topic.category}`);
        console.log(`   Keywords: ${bestMatch.topic.keywords.join(', ')}`);

        // Randomly select one of the 5 statements for this topic
        const randomStatement = bestMatch.topic.statements[
            Math.floor(Math.random() * bestMatch.topic.statements.length)
        ];

        console.log(`   Selected statement: "${randomStatement}"\n`);

        return {
            question: randomStatement,
            topicName: bestMatch.topic.name,
            category: bestMatch.topic.category,
            similarity: bestMatch.similarity,
            group1: { stance: 'Support', keywords: bestMatch.topic.keywords },
            group2: { stance: 'Oppose', keywords: bestMatch.topic.keywords }
        };

    } catch (error) {
        console.error('Error in semantic matching:', error);
        return getRandomFallbackStatement();
    }
}

/**
 * Fallback: return a random statement from the library
 */
function getRandomFallbackStatement() {
    const randomTopic = debateStatements.topics[
        Math.floor(Math.random() * debateStatements.topics.length)
    ];
    
    const randomStatement = randomTopic.statements[
        Math.floor(Math.random() * randomTopic.statements.length)
    ];

    console.log(`⚠️ Using fallback statement: "${randomStatement}"`);

    return {
        question: randomStatement,
        topicName: randomTopic.name,
        category: randomTopic.category,
        similarity: 0,
        group1: { stance: 'Support', keywords: randomTopic.keywords },
        group2: { stance: 'Oppose', keywords: randomTopic.keywords }
    };
}

/**
 * Cosine similarity calculation
 */
function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = { findBestDebateStatement };
