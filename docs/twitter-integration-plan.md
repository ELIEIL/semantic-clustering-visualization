# Twitter/X API Integration Plan

## Overview
Instead of building complex NLP levels (6-10) from scratch, leverage Twitter's existing semantic understanding and real-world data.

## Twitter API v2 Capabilities

### What Twitter Provides (Free/Essential Access)
- ✅ **Tweet text** - Raw content
- ✅ **Entities** - Hashtags, mentions, URLs
- ✅ **Context annotations** - Topics and entities (semantic understanding!)
- ✅ **Public metrics** - Engagement data
- ✅ **Conversation threading** - Reply chains
- ✅ **Timestamps** - Temporal data

### What Twitter Provides (Elevated/Academic Access)
- ✅ **Sentiment analysis** (via third-party or custom)
- ✅ **Full conversation trees**
- ✅ **Historical data**
- ✅ **Higher rate limits**

## Integration Architecture

### Option 1: Direct API Integration (Recommended)
```
Twitter API → Node.js Backend → WebSocket → Your Visualization
```

**Flow:**
1. Search Twitter for specific hashtag/topic (e.g., #ClimateChange)
2. Fetch tweets with context_annotations
3. Transform to your node structure
4. Send to visualization via WebSocket
5. Your existing algorithm processes it

**Advantages:**
- Real-world data
- Twitter's semantic understanding
- Live updates possible
- No need to build NLP levels 6-10

### Option 2: Hybrid Approach
```
Twitter API → Cache/Database → Your NLP (Levels 2-5) → Visualization
```

**Flow:**
1. Fetch Twitter data periodically
2. Store in local database
3. Apply your TF-IDF, clustering, etc.
4. Combine Twitter's topics with your similarity
5. Visualize enhanced network

**Advantages:**
- Best of both worlds
- Your algorithm + Twitter's semantics
- Offline testing possible

### Option 3: Simulation Mode (Testing)
```
Twitter API → One-time fetch → JSON file → Manual input
```

**Flow:**
1. Fetch sample tweets once
2. Save to JSON
3. Use as test data (like test-semantics.json)
4. Manual posting via mobile controller

**Advantages:**
- No API rate limits during testing
- Reproducible experiments
- Free tier friendly

## Implementation Steps

### Step 1: Twitter API Setup
```bash
# Install Twitter API client
npm install twitter-api-v2

# Get API credentials from developer.twitter.com
# - API Key
# - API Secret
# - Bearer Token
```

### Step 2: Backend Integration
```javascript
// server.js
const { TwitterApi } = require('twitter-api-v2');

const client = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);

// Search for tweets
async function fetchTweets(query, maxResults = 10) {
  const tweets = await client.v2.search({
    query: query,
    max_results: maxResults,
    'tweet.fields': ['created_at', 'public_metrics', 'context_annotations', 'entities'],
    expansions: ['referenced_tweets.id', 'in_reply_to_user_id']
  });
  
  return tweets.data.data;
}

// Transform to your node format
function transformTweetToNode(tweet) {
  return {
    content: tweet.text,
    timestamp: new Date(tweet.created_at),
    metadata: {
      twitterId: tweet.id,
      topics: tweet.context_annotations?.map(a => a.entity.name) || [],
      entities: tweet.entities?.annotations || [],
      engagement: tweet.public_metrics,
      hashtags: tweet.entities?.hashtags || []
    }
  };
}
```

### Step 3: Enhanced Node Structure
```javascript
// Add Twitter metadata to Node class
class Node {
  constructor(content, timestamp, canvasWidth, canvasHeight, metadata = {}) {
    // ... existing code ...
    
    // Twitter-specific data
    this.twitterTopics = metadata.topics || [];
    this.twitterEntities = metadata.entities || [];
    this.engagement = metadata.engagement || {};
    this.hashtags = metadata.hashtags || [];
  }
  
  // Enhanced similarity using Twitter topics
  calculateEnhancedSimilarity(otherNode) {
    // Your existing TF-IDF similarity
    const tfidfSim = this.calculateSimilarity(otherNode);
    
    // Twitter topic similarity
    const sharedTopics = this.twitterTopics.filter(t => 
      otherNode.twitterTopics.includes(t)
    ).length;
    const topicSim = sharedTopics / Math.max(
      this.twitterTopics.length, 
      otherNode.twitterTopics.length, 
      1
    );
    
    // Weighted combination
    return (tfidfSim * 0.6) + (topicSim * 0.4);
  }
}
```

### Step 4: Visualization Enhancements
```javascript
// Color nodes by Twitter topic
function getTopicColor(topics) {
  const topicColors = {
    'Climate Change': {h: 120, s: 80, b: 100}, // Green
    'Politics': {h: 0, s: 80, b: 100},          // Red
    'Economy': {h: 210, s: 80, b: 100},         // Blue
    'Healthcare': {h: 300, s: 80, b: 100}       // Purple
  };
  
  return topicColors[topics[0]] || {h: 0, s: 0, b: 100}; // White default
}

// Size nodes by engagement
function getNodeSize(engagement) {
  const totalEngagement = 
    engagement.retweet_count + 
    engagement.reply_count + 
    engagement.like_count;
  
  return map(totalEngagement, 0, 1000, 20, 60); // Scale font size
}
```

## Data Mapping

### Twitter → Your System
| Twitter Field | Your System | Purpose |
|--------------|-------------|---------|
| `text` | `node.content` | Post content |
| `created_at` | `node.timestamp` | Temporal analysis |
| `context_annotations` | `node.twitterTopics` | Semantic topics (Level 8) |
| `entities.annotations` | `node.twitterEntities` | Named entities (Level 7) |
| `public_metrics` | `node.engagement` | Influence/quality (Level 10) |
| `conversation_id` | `node.conversationId` | Thread grouping |
| `referenced_tweets` | `node.replyTo` | Discourse structure (Level 7) |

## Example Queries

### Climate Change Discourse
```javascript
const tweets = await fetchTweets(
  '#ClimateChange OR #ClimateAction -is:retweet lang:en',
  100
);
```

### Political Polarization
```javascript
const tweets = await fetchTweets(
  '(#Democrat OR #Republican) politics -is:retweet lang:en',
  100
);
```

### Deliberative Discussion
```javascript
const tweets = await fetchTweets(
  'conversation_id:1234567890', // Specific thread
  100
);
```

## API Costs & Limits

### Free Tier (Essential)
- ✅ 500,000 tweets/month
- ✅ Basic search
- ✅ Context annotations
- ❌ No historical data (7 days only)

### Elevated Tier ($100/month)
- ✅ 2,000,000 tweets/month
- ✅ Full archive search
- ✅ Higher rate limits

### Academic Research (Free, requires approval)
- ✅ 10,000,000 tweets/month
- ✅ Full historical archive
- ✅ All v2 endpoints

## Recommendation

**Start with Option 3 (Simulation Mode):**
1. ✅ Fetch 50-100 tweets on a topic (one-time, free tier)
2. ✅ Save to JSON file
3. ✅ Test your visualization with real semantic data
4. ✅ No ongoing API costs
5. ✅ Reproducible experiments

**Then upgrade to Option 1 (Direct Integration) if needed**

## Next Steps

Would you like me to:
1. **Set up Twitter API integration** (fetch real tweets)
2. **Create sample Twitter data JSON** (for testing without API)
3. **Enhance Node class** with Twitter metadata
4. **Add topic-based coloring** to visualization

Which approach interests you most?
