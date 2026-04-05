// Helper function for keyword analysis and debate position generation
async function analyzeKeywordsForDebate(keywords, sentenceTransformer) {
    console.log('🔍 Analyzing keywords:', keywords);
    
    // If we have sentence transformer, use it for semantic analysis
    if (sentenceTransformer) {
        try {
            // Step 1: Check keyword coherence
            const coherence = await checkKeywordCoherence(keywords, sentenceTransformer);
            console.log('📊 Keyword coherence:', coherence.toFixed(2));
            
            // Step 2: Cluster keywords into 2 groups
            const { group1, group2 } = await clusterKeywords(keywords, sentenceTransformer);
            console.log('📦 Group 1:', group1);
            console.log('📦 Group 2:', group2);
            
            // Step 3: Check debate-worthiness
            const debateCheck = await checkDebateWorthiness(group1, group2, sentenceTransformer);
            console.log('⚖️ Debate relationship:', debateCheck.relationship, '(similarity:', debateCheck.similarity.toFixed(2) + ')');
            
            // Step 4: Generate question based on analysis
            let question, stances;
            
            if (coherence < 0.3 || !debateCheck.isDebatable) {
                // Low quality - use generic fallback
                console.log('⚠️ Low quality keywords - using generic question');
                question = 'What are your thoughts on this topic?';
                stances = {
                    group1: 'Perspective A',
                    group2: 'Perspective B'
                };
            } else {
                // High quality - generate semantic question
                question = await generateSemanticQuestion(group1, group2, debateCheck.relationship, sentenceTransformer);
                stances = generateSemanticStances(group1, group2);
            }
            
            console.log('✅ Generated question:', question);
            console.log('   Group 1 stance:', stances.group1);
            console.log('   Group 2 stance:', stances.group2);
            
            return {
                question,
                group1: { stance: stances.group1, keywords: group1 },
                group2: { stance: stances.group2, keywords: group2 }
            };
        } catch (error) {
            console.error('Error in semantic analysis:', error);
        }
    }
    
    // Fallback: simple split
    const mid = Math.floor(keywords.length / 2);
    const group1Keywords = keywords.slice(0, mid);
    const group2Keywords = keywords.slice(mid);
    
    return {
        question: `Should we prioritize ${group1Keywords[0]} or ${group2Keywords[0]}?`,
        group1: { stance: `Prioritize ${group1Keywords[0]}`, keywords: group1Keywords },
        group2: { stance: `Prioritize ${group2Keywords[0]}`, keywords: group2Keywords }
    };
}

// Check if keywords are semantically coherent (related to each other)
async function checkKeywordCoherence(keywords, sentenceTransformer) {
    if (keywords.length < 2) return 1.0;
    
    const embeddings = await Promise.all(
        keywords.map(kw => sentenceTransformer.getEmbedding(kw))
    );
    
    // Calculate average pairwise similarity
    let totalSimilarity = 0;
    let pairs = 0;
    
    for (let i = 0; i < embeddings.length; i++) {
        for (let j = i + 1; j < embeddings.length; j++) {
            totalSimilarity += cosineSimilarity(embeddings[i], embeddings[j]);
            pairs++;
        }
    }
    
    return totalSimilarity / pairs;
}

// Cluster keywords into 2 semantic groups
async function clusterKeywords(keywords, sentenceTransformer) {
    const embeddings = await Promise.all(
        keywords.map(kw => sentenceTransformer.getEmbedding(kw))
    );
    
    // 2-means clustering: start with first and last keyword as centroids
    let centroid1 = embeddings[0];
    let centroid2 = embeddings[embeddings.length - 1];
    
    let group1 = [];
    let group2 = [];
    
    // Assign keywords to nearest centroid
    keywords.forEach((kw, i) => {
        const dist1 = cosineSimilarity(embeddings[i], centroid1);
        const dist2 = cosineSimilarity(embeddings[i], centroid2);
        
        if (dist1 > dist2) {
            group1.push(kw);
        } else {
            group2.push(kw);
        }
    });
    
    // Ensure both groups have at least one keyword
    if (group1.length === 0) group1 = [keywords[0]];
    if (group2.length === 0) group2 = [keywords[keywords.length - 1]];
    
    return { group1, group2 };
}

// Check if two keyword groups form a good debate (opposing but related)
async function checkDebateWorthiness(group1, group2, sentenceTransformer) {
    const concept1 = group1.join(' ');
    const concept2 = group2.join(' ');
    
    const embedding1 = await sentenceTransformer.getEmbedding(concept1);
    const embedding2 = await sentenceTransformer.getEmbedding(concept2);
    
    const similarity = cosineSimilarity(embedding1, embedding2);
    
    // Good debate: groups are different but not completely unrelated
    // Sweet spot: 0.2 - 0.7 similarity
    const isDebatable = similarity >= 0.2 && similarity <= 0.7;
    
    let relationship;
    if (similarity < 0.3) {
        relationship = 'opposing';
    } else if (similarity > 0.7) {
        relationship = 'similar';
    } else {
        relationship = 'balanced';
    }
    
    return { isDebatable, similarity, relationship };
}

// Generate semantic question based on keyword relationship
async function generateSemanticQuestion(group1, group2, relationship, sentenceTransformer) {
    // Combine up to 2 keywords from each group for richer concepts
    const concept1 = group1.slice(0, 2).join(' and ');
    const concept2 = group2.slice(0, 2).join(' and ');
    
    let templates;
    
    if (relationship === 'opposing') {
        // Opposing concepts - use "versus" language
        templates = [
            `Should we choose {concept1} or {concept2}?`,
            `What's more important: {concept1} or {concept2}?`,
            `Is {concept1} or {concept2} the better approach?`,
            `Should we support {concept1} or {concept2}?`
        ];
    } else if (relationship === 'similar') {
        // Related concepts - use "balance" language
        templates = [
            `How should we balance {concept1} with {concept2}?`,
            `How do we integrate {concept1} and {concept2}?`,
            `What's the right mix of {concept1} and {concept2}?`,
            `How can we combine {concept1} with {concept2}?`
        ];
    } else {
        // Balanced - use "prioritize" language
        templates = [
            `Should we prioritize {concept1} or {concept2}?`,
            `What matters more: {concept1} or {concept2}?`,
            `How do we approach {concept1} versus {concept2}?`,
            `Is {concept1} or {concept2} more critical?`
        ];
    }
    
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    return template
        .replace('{concept1}', concept1)
        .replace('{concept2}', concept2);
}

// Generate semantic stances for debate groups
function generateSemanticStances(group1, group2) {
    const verbs = [
        'Prioritize', 'Focus on', 'Emphasize', 'Champion',
        'Advance', 'Support', 'Strengthen', 'Promote'
    ];
    
    const verb1 = verbs[Math.floor(Math.random() * verbs.length)];
    const verb2 = verbs[Math.floor(Math.random() * verbs.length)];
    
    // Use up to 2 keywords for clearer stances
    const stance1 = group1.length > 1 ? group1.slice(0, 2).join(' and ') : group1[0];
    const stance2 = group2.length > 1 ? group2.slice(0, 2).join(' and ') : group2[0];
    
    return {
        group1: `${verb1} ${stance1}`,
        group2: `${verb2} ${stance2}`
    };
}

// Helper: cosine similarity for embeddings
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

module.exports = { analyzeKeywordsForDebate };
