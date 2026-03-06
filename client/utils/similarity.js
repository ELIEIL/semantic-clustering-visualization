// Similarity calculation utilities

export async function recalculateSimilarities(nodes, connectionCache, currentDatabase, updateAPIStatus, logActivity) {
    if (nodes.length < 2) return;
    
    logActivity(`🔄 Starting similarity calculation for ${nodes.length} posts`, 'similarity');
    
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const key = `${i}-${j}`;
            
            if (!connectionCache.has(key)) {
                try {
                    await nodes[i].calculateSimilarity(nodes[j], currentDatabase, null);
                    const similarity = connectionCache.get(key);
                    
                    if (similarity > 0.3) {
                        logActivity(
                            `🔗 High similarity (${(similarity * 100).toFixed(0)}%): "${nodes[i].content.substring(0, 20)}..." ↔ "${nodes[j].content.substring(0, 20)}..."`,
                            'similarity'
                        );
                    }
                } catch (error) {
                    console.error('Error calculating similarity:', error);
                }
            }
        }
    }
    
    logActivity(`✅ Similarity calculation complete`, 'info');
}
