// Spell-checking module using nspell
const nspell = require('nspell');
const fs = require('fs');
const path = require('path');

let spellChecker = null;

// Initialize spell checker
async function initializeSpellChecker() {
    try {
        // Load dictionary files directly from node_modules
        const dictPath = path.join(__dirname, '../node_modules/dictionary-en');
        const aff = fs.readFileSync(path.join(dictPath, 'index.aff'), 'utf-8');
        const dic = fs.readFileSync(path.join(dictPath, 'index.dic'), 'utf-8');
        
        spellChecker = nspell({ aff, dic });
        console.log('✅ Spell checker initialized');
    } catch (error) {
        console.error('⚠️ Spell-checker initialization failed:', error.message);
        // Don't throw - allow server to continue without spell-checking
    }
}

/**
 * Correct spelling in a cluster label
 * Example: "Cliamte And Change" → "Climate And Change"
 */
function correctLabel(label) {
    if (!spellChecker || !label) return label;
    
    const words = label.split(/\s+/);
    const correctedWords = words.map(word => {
        // Preserve capitalization pattern
        const isCapitalized = word[0] === word[0].toUpperCase();
        const isAllCaps = word === word.toUpperCase();
        
        // Check lowercase version
        const lowerWord = word.toLowerCase();
        
        // If word is correct, keep it
        if (spellChecker.correct(lowerWord)) {
            return word;
        }
        
        // Get suggestions
        const suggestions = spellChecker.suggest(lowerWord);
        
        if (suggestions && suggestions.length > 0) {
            let corrected = suggestions[0];
            
            // Restore capitalization
            if (isAllCaps) {
                corrected = corrected.toUpperCase();
            } else if (isCapitalized) {
                corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
            }
            
            console.log(`📝 Spell correction: "${word}" → "${corrected}"`);
            return corrected;
        }
        
        // No suggestions, keep original
        return word;
    });
    
    return correctedWords.join(' ');
}

/**
 * Correct spelling in individual posts
 */
function correctPosts(posts) {
    if (!spellChecker || !posts || !Array.isArray(posts)) {
        return posts;
    }
    
    return posts.map(post => {
        const corrected = correctLabel(post.content);
        
        if (post.content !== corrected) {
            console.log(`📝 Spell correction: "${post.content}" → "${corrected}"`);
        }
        
        return {
            id: post.id,
            originalText: post.content,
            correctedText: corrected
        };
    });
}

/**
 * Correct spelling in multiple cluster labels
 */
function correctClusterLabels(clusters) {
    if (!Array.isArray(clusters)) return clusters;
    
    return clusters.map(cluster => {
        if (cluster.label) {
            const originalLabel = cluster.label;
            cluster.label = correctLabel(cluster.label);
            
            if (originalLabel !== cluster.label) {
                console.log(`🔧 Cluster label corrected: "${originalLabel}" → "${cluster.label}"`);
            }
        }
        return cluster;
    });
}

module.exports = {
    initializeSpellChecker,
    correctLabel,
    correctClusterLabels,
    correctPosts
};
