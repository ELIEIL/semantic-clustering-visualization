// Spell-checking module using LanguageTool API
const LANGUAGETOOL_API = 'https://api.languagetool.org/v2/check';

// Initialize spell checker (no-op for LanguageTool API)
async function initializeSpellChecker() {
    console.log('✅ Spell checker initialized (LanguageTool API)');
}

/**
 * Correct spelling in a cluster label using LanguageTool API
 * Example: "Cliamte And Change" → "Climate And Change"
 */
async function correctLabel(label) {
    if (!label) return label;
    
    try {
        const response = await fetch(LANGUAGETOOL_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                text: label,
                language: 'en-US'
            })
        });
        
        if (!response.ok) {
            console.warn('⚠️ LanguageTool API error, returning original text');
            return label;
        }
        
        const data = await response.json();
        
        // Apply corrections from end to start to preserve offsets
        let correctedText = label;
        const matches = data.matches || [];
        
        // Sort by offset descending
        matches.sort((a, b) => b.offset - a.offset);
        
        matches.forEach(match => {
            if (match.replacements && match.replacements.length > 0) {
                const replacement = match.replacements[0].value;
                const before = correctedText.substring(0, match.offset);
                const after = correctedText.substring(match.offset + match.length);
                correctedText = before + replacement + after;
                
                const original = label.substring(match.offset, match.offset + match.length);
                console.log(`📝 LanguageTool correction: "${original}" → "${replacement}"`);
            }
        });
        
        return correctedText;
        
    } catch (error) {
        console.error('⚠️ LanguageTool API error:', error.message);
        return label;
    }
}

/**
 * Correct spelling in individual posts using LanguageTool API
 */
async function correctPosts(posts) {
    if (!posts || !Array.isArray(posts)) {
        return posts;
    }
    
    const correctedPosts = await Promise.all(posts.map(async post => {
        const corrected = await correctLabel(post.content);
        
        if (post.content !== corrected) {
            console.log(`📝 Post correction: "${post.content}" → "${corrected}"`);
        }
        
        return {
            id: post.id,
            originalText: post.content,
            correctedText: corrected
        };
    }));
    
    return correctedPosts;
}

/**
 * Correct spelling in multiple cluster labels using LanguageTool API
 */
async function correctClusterLabels(clusters) {
    if (!Array.isArray(clusters)) return clusters;
    
    const correctedClusters = await Promise.all(clusters.map(async cluster => {
        if (cluster.label) {
            const originalLabel = cluster.label;
            cluster.label = await correctLabel(cluster.label);
            
            if (originalLabel !== cluster.label) {
                console.log(`🔧 Cluster label corrected: "${originalLabel}" → "${cluster.label}"`);
            }
        }
        return cluster;
    }));
    
    return correctedClusters;
}

module.exports = {
    initializeSpellChecker,
    correctLabel,
    correctClusterLabels,
    correctPosts
};
