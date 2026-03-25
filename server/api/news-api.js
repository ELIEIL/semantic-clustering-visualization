const axios = require('axios');

class NewsAPIClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://newsapi.org/v2';
        this.cachedHeadline = null;
        this.cacheTimestamp = null;
        this.cacheDuration = 3600000; // 1 hour in milliseconds
    }

    async getTopHeadline(category = 'general', country = 'us') {
        // Return cached headline if still valid
        if (this.cachedHeadline && this.cacheTimestamp) {
            const now = Date.now();
            if (now - this.cacheTimestamp < this.cacheDuration) {
                console.log('Returning cached headline');
                return this.cachedHeadline;
            }
        }

        try {
            const response = await axios.get(`${this.baseUrl}/top-headlines`, {
                params: {
                    country: country,
                    category: category,
                    apiKey: this.apiKey,
                    pageSize: 10
                }
            });

            if (response.data.articles && response.data.articles.length > 0) {
                // Filter for headlines that are phrased as questions
                // Keep them short to fit on screen (max 80 characters)
                const articles = response.data.articles.filter(article => 
                    article.title && 
                    article.title.length > 20 && 
                    article.title.length < 80 &&
                    article.title.trim().endsWith('?') &&
                    !article.title.includes('[Removed]')
                );

                if (articles.length > 0) {
                    // Pick a random headline from top 10
                    const randomIndex = Math.floor(Math.random() * Math.min(articles.length, 10));
                    const article = articles[randomIndex];
                    const headline = {
                        text: article.title,
                        imageUrl: article.urlToImage || null
                    };
                    
                    // Cache the headline
                    this.cachedHeadline = headline;
                    this.cacheTimestamp = Date.now();
                    
                    console.log('Fetched new headline:', headline.text);
                    console.log('Article image:', headline.imageUrl);
                    return headline;
                }
                
                // If no question headlines found in top headlines, search for questions
                console.log('No question headlines in top news, searching for questions...');
                const questionHeadlines = await this.searchQuestionHeadlines();
                if (questionHeadlines.length > 0) {
                    const headline = questionHeadlines[0];
                    this.cachedHeadline = headline;
                    this.cacheTimestamp = Date.now();
                    console.log('Found question headline:', headline);
                    return headline;
                }
            }

            return { text: 'What are your thoughts on current events?', imageUrl: null };
        } catch (error) {
            console.error('NewsAPI error:', error.message);
            return { text: 'What are your thoughts on current events?', imageUrl: null };
        }
    }

    async searchQuestionHeadlines() {
        try {
            // Search for polarizing/debate-worthy topics that generate discussion
            const polarizingTopics = [
                'should', 'ban', 'controversial', 'debate', 'divided', 'crisis',
                'protest', 'regulation', 'rights', 'policy', 'reform', 'future',
                'climate', 'immigration', 'privacy', 'AI', 'economy', 'healthcare',
                'education', 'technology', 'social media', 'politics', 'inequality'
            ];
            const randomTopic = polarizingTopics[Math.floor(Math.random() * polarizingTopics.length)];
            
            const response = await axios.get(`${this.baseUrl}/everything`, {
                params: {
                    q: randomTopic,
                    sortBy: 'relevancy',
                    apiKey: this.apiKey,
                    pageSize: 50,
                    language: 'en',
                    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Last 7 days
                }
            });

            if (response.data.articles && response.data.articles.length > 0) {
                // Keywords that indicate polarizing/debate-worthy content
                const debateKeywords = [
                    'should', 'ban', 'allow', 'regulate', 'controversial', 'divided',
                    'crisis', 'threat', 'future', 'rights', 'freedom', 'control',
                    'privacy', 'surveillance', 'inequality', 'fair', 'unfair',
                    'ethical', 'moral', 'legal', 'illegal', 'safe', 'dangerous'
                ];
                
                const questions = response.data.articles
                    .filter(article => 
                        article.title && 
                        article.title.trim().endsWith('?') &&
                        article.title.length > 20 &&
                        article.title.length < 80 &&
                        !article.title.includes('[Removed]')
                    )
                    .map(article => {
                        // Score based on debate-worthiness
                        const title = article.title.toLowerCase();
                        let score = 0;
                        debateKeywords.forEach(keyword => {
                            if (title.includes(keyword)) score += 1;
                        });
                        return { 
                            text: article.title, 
                            imageUrl: article.urlToImage || null,
                            score 
                        };
                    })
                    .sort((a, b) => b.score - a.score); // Prioritize high-scoring questions
                
                return questions;
            }

            return [];
        } catch (error) {
            console.error('NewsAPI question search error:', error.message);
            return [];
        }
    }

    async searchHeadlines(query, sortBy = 'relevancy') {
        try {
            const response = await axios.get(`${this.baseUrl}/everything`, {
                params: {
                    q: query,
                    sortBy: sortBy,
                    apiKey: this.apiKey,
                    pageSize: 5,
                    language: 'en'
                }
            });

            if (response.data.articles && response.data.articles.length > 0) {
                return response.data.articles.map(article => article.title);
            }

            return [];
        } catch (error) {
            console.error('NewsAPI search error:', error.message);
            return [];
        }
    }

    clearCache() {
        this.cachedHeadline = null;
        this.cacheTimestamp = null;
        console.log('NewsAPI cache cleared');
    }

    async searchArticlesByKeywords(keywords, maxResults = 20) {
        try {
            const query = Array.isArray(keywords) ? keywords.join(' OR ') : keywords;
            
            console.log(`🔍 Searching NewsAPI for: "${query}"`);
            
            const response = await axios.get(`${this.baseUrl}/everything`, {
                params: {
                    q: query,
                    language: 'en',
                    sortBy: 'relevancy',
                    pageSize: maxResults,
                    apiKey: this.apiKey
                }
            });

            if (response.data.articles && response.data.articles.length > 0) {
                const articles = response.data.articles
                    .filter(article => 
                        article.title && 
                        article.title.length > 20 && 
                        article.title.length < 120 &&
                        !article.title.includes('[Removed]') &&
                        article.description
                    )
                    .map(article => ({
                        title: article.title,
                        description: article.description,
                        source: article.source.name,
                        url: article.url,
                        imageUrl: article.urlToImage || null,
                        publishedAt: article.publishedAt
                    }));

                console.log(`✅ Found ${articles.length} relevant articles`);
                return articles;
            }

            console.log('⚠️ No articles found for keywords');
            return [];
        } catch (error) {
            console.error('NewsAPI search error:', error.message);
            return [];
        }
    }
}

module.exports = NewsAPIClient;
