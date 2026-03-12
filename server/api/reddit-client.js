const axios = require('axios');

class RedditClient {
    constructor() {
        this.baseUrl = 'https://www.reddit.com';
        this.userAgent = 'semantic-clustering-visualization/1.0';
    }

    /**
     * Fetch posts from multiple subreddits representing different viewpoints
     * @param {string} topic - Topic to fetch posts about
     * @param {number} limit - Number of posts per subreddit
     * @returns {Promise<Array>} Array of posts with cluster assignments
     */
    async fetchOpposingViewpoints(topic = 'politics', limit = 5) {
        const subredditPairs = {
            politics: [
                { name: 'conservative', label: 'Conservative' },
                { name: 'liberal', label: 'Liberal' }
            ],
            climate: [
                { name: 'climate', label: 'Climate Action' },
                { name: 'climateskeptics', label: 'Climate Skeptics' }
            ],
            technology: [
                { name: 'technology', label: 'Tech Enthusiasts' },
                { name: 'privacy', label: 'Privacy Advocates' }
            ],
            economy: [
                { name: 'Economics', label: 'Economics' },
                { name: 'LateStageCapitalism', label: 'Anti-Capitalism' }
            ]
        };

        const subreddits = subredditPairs[topic] || subredditPairs.politics;
        const allPosts = [];

        for (let i = 0; i < subreddits.length; i++) {
            const subreddit = subreddits[i];
            try {
                const posts = await this.fetchSubredditPosts(subreddit.name, limit);
                
                // Assign cluster based on subreddit (echo chamber)
                const clusteredPosts = posts.map(post => ({
                    ...post,
                    cluster: i,
                    clusterLabel: subreddit.label,
                    subreddit: subreddit.name
                }));
                
                allPosts.push(...clusteredPosts);
            } catch (error) {
                console.error(`Failed to fetch from r/${subreddit.name}:`, error.message);
            }
        }

        return allPosts;
    }

    /**
     * Fetch hot posts from a specific subreddit
     * @param {string} subreddit - Subreddit name
     * @param {number} limit - Number of posts to fetch
     * @returns {Promise<Array>} Array of posts
     */
    async fetchSubredditPosts(subreddit, limit = 10) {
        try {
            const response = await axios.get(`${this.baseUrl}/r/${subreddit}/hot.json`, {
                params: { limit },
                headers: {
                    'User-Agent': this.userAgent
                }
            });

            const posts = response.data.data.children.map(child => {
                const post = child.data;
                return {
                    id: post.id,
                    content: post.title + (post.selftext ? '\n' + post.selftext.substring(0, 200) : ''),
                    title: post.title,
                    author: post.author,
                    score: post.score,
                    numComments: post.num_comments,
                    timestamp: post.created_utc * 1000,
                    url: `https://reddit.com${post.permalink}`,
                    subreddit: post.subreddit
                };
            });

            console.log(`✅ Fetched ${posts.length} posts from r/${subreddit}`);
            return posts;
        } catch (error) {
            console.error(`❌ Error fetching from r/${subreddit}:`, error.message);
            throw error;
        }
    }

    /**
     * Search Reddit for posts about a specific query
     * @param {string} query - Search query
     * @param {number} limit - Number of results
     * @returns {Promise<Array>} Array of posts
     */
    async searchPosts(query, limit = 20) {
        try {
            const response = await axios.get(`${this.baseUrl}/search.json`, {
                params: {
                    q: query,
                    limit,
                    sort: 'relevance',
                    t: 'week'
                },
                headers: {
                    'User-Agent': this.userAgent
                }
            });

            const posts = response.data.data.children.map(child => {
                const post = child.data;
                return {
                    id: post.id,
                    content: post.title + (post.selftext ? '\n' + post.selftext.substring(0, 200) : ''),
                    title: post.title,
                    author: post.author,
                    score: post.score,
                    numComments: post.num_comments,
                    timestamp: post.created_utc * 1000,
                    url: `https://reddit.com${post.permalink}`,
                    subreddit: post.subreddit
                };
            });

            console.log(`✅ Found ${posts.length} posts for query: "${query}"`);
            return posts;
        } catch (error) {
            console.error(`❌ Error searching Reddit:`, error.message);
            throw error;
        }
    }
}

module.exports = RedditClient;
