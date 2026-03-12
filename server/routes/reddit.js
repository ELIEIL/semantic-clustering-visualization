// Reddit API routes for fetching posts

const RedditClient = require('../api/reddit-client.js');
const redditClient = new RedditClient();

// Store Reddit posts for similarity matching
let storedRedditPosts = [];

/**
 * Fetch Reddit posts and send to display
 * @param {string} topic - Topic to fetch (politics, climate, technology, economy)
 * @param {WebSocket.Server} wss - WebSocket server instance
 */
async function fetchAndBroadcastRedditPosts(topic = 'politics', wss) {
    try {
        console.log(`📡 Fetching Reddit posts for topic: ${topic}`);
        
        // Fetch posts from opposing subreddits
        const posts = await redditClient.fetchOpposingViewpoints(topic, 15);
        
        console.log(`✅ Fetched ${posts.length} Reddit posts`);
        
        // Group posts by cluster (subreddit)
        const clusters = {};
        posts.forEach(post => {
            if (!clusters[post.cluster]) {
                clusters[post.cluster] = {
                    id: post.cluster,
                    label: post.clusterLabel,
                    posts: [],
                    color: getClusterColor(post.cluster)
                };
            }
            const postData = {
                id: `reddit_${post.cluster}_${clusters[post.cluster].posts.length}`,
                content: post.title,
                fullContent: post.content,
                author: post.author,
                score: post.score,
                comments: post.numComments,
                timestamp: post.timestamp,
                url: post.url,
                subreddit: post.subreddit,
                cluster: post.cluster,
                clusterLabel: post.clusterLabel
            };
            clusters[post.cluster].posts.push(postData);
        });
        
        // Store all posts for similarity matching
        storedRedditPosts = [];
        Object.values(clusters).forEach(cluster => {
            storedRedditPosts.push(...cluster.posts);
        });
        console.log(`💾 Stored ${storedRedditPosts.length} Reddit posts for matching`);
        
        // Broadcast to all connected displays
        const clusterArray = Object.values(clusters);
        const message = {
            type: 'reddit_posts',
            clusters: clusterArray,
            topic: topic,
            totalPosts: posts.length
        };
        
        wss.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(JSON.stringify(message));
            }
        });
        
        console.log(`📤 Broadcasted ${clusterArray.length} clusters to displays`);
        
        return posts;
    } catch (error) {
        console.error('❌ Error fetching Reddit posts:', error);
        throw error;
    }
}

/**
 * Get color for cluster based on index
 */
function getClusterColor(index) {
    const colors = [
        { h: 0, s: 70, b: 80 },      // Red
        { h: 180, s: 70, b: 80 },    // Cyan
        { h: 120, s: 70, b: 80 },    // Green
        { h: 280, s: 70, b: 80 },    // Purple
        { h: 40, s: 70, b: 80 },     // Orange
        { h: 220, s: 70, b: 80 },    // Blue
        { h: 300, s: 70, b: 80 }     // Magenta
    ];
    return colors[index % colors.length];
}

/**
 * Find matching Reddit post based on similarity to user's post
 * @param {string} userContent - User's post content
 * @returns {Object|null} Matching Reddit post or null if no good match
 */
function findMatchingRedditPost(userContent) {
    if (storedRedditPosts.length === 0) {
        console.log('⚠️ No Reddit posts stored for matching');
        return null;
    }
    
    console.log(`🔍 Finding match for: "${userContent}"`);
    
    // Calculate similarity with each Reddit post
    let bestMatch = null;
    let bestSimilarity = 0;
    const threshold = 0.05; // Lowered threshold for more matches (was 0.2)
    
    storedRedditPosts.forEach(redditPost => {
        const similarity = calculateSimilarity(userContent, redditPost.content);
        console.log(`  - "${redditPost.content.substring(0, 50)}..." = ${Math.round(similarity * 100)}% similar`);
        
        if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = {
                ...redditPost,
                similarity: similarity
            };
        }
    });
    
    // Only return match if above threshold
    if (bestSimilarity >= threshold) {
        console.log(`✅ Match found: ${Math.round(bestSimilarity * 100)}% similar to "${bestMatch.clusterLabel}"`);
        return bestMatch;
    } else {
        console.log(`❌ No strong match found (best: ${Math.round(bestSimilarity * 100)}%)`);
        return null;
    }
}

/**
 * Calculate improved word-based similarity between two texts
 * Uses stop word filtering and partial word matching
 * @param {string} text1 
 * @param {string} text2 
 * @returns {number} Similarity score 0-1
 */
function calculateSimilarity(text1, text2) {
    // Common stop words to ignore
    const stopWords = new Set([
        'this', 'that', 'with', 'from', 'have', 'been', 'were', 'they', 'their',
        'what', 'when', 'where', 'which', 'while', 'should', 'would', 'could',
        'about', 'because', 'think', 'just', 'really', 'very', 'much', 'more',
        'some', 'many', 'there', 'these', 'those', 'then', 'than', 'them'
    ]);
    
    // Extract meaningful words (length > 3, not stop words)
    const extractWords = (text) => {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopWords.has(w));
    };
    
    const words1 = extractWords(text1);
    const words2 = extractWords(text2);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    // Exact matches
    const exactMatches = words1.filter(w1 => words2.includes(w1)).length;
    
    // Partial matches (word contains another word)
    let partialMatches = 0;
    words1.forEach(w1 => {
        words2.forEach(w2 => {
            if (w1 !== w2 && (w1.includes(w2) || w2.includes(w1))) {
                partialMatches += 0.5; // Half credit for partial match
            }
        });
    });
    
    const totalMatches = exactMatches + partialMatches;
    const totalWords = words1.length + words2.length;
    
    return totalWords > 0 ? (totalMatches * 2) / totalWords : 0;
}

module.exports = {
    fetchAndBroadcastRedditPosts,
    findMatchingRedditPost
};
