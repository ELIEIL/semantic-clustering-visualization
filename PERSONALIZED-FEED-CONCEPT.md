# Personalized Feed Feature - Concept Document

## 🎯 Feature Overview

**Voting-Based Personalized News Feed**

Users vote on posts displayed on the main screen. Based on their voting patterns, the system generates a personalized news feed that mirrors their echo chamber - demonstrating how social media algorithms create filter bubbles.

---

## 📊 User Flow

1. **Display shows diverse posts** - Mix of political, environmental, tech topics
2. **Users vote via mobile controller** - 👍 Agree / 👎 Disagree buttons
3. **System analyzes voting pattern** - After 5+ votes, detect preferences
4. **Generate personalized feed** - Fetch real news articles matching their bias
5. **Display feed on mobile** - Show "Your Echo Chamber" with images
6. **Reveal the bubble** - Explain how their votes created their filter

---

## 🏗️ Technical Architecture

### **1. Voting System**

**Data Structure:**
```javascript
{
  postId: "post_123",
  votes: {
    upvotes: 15,
    downvotes: 3,
    voters: ["user1", "user2"]
  }
}

{
  userId: "user_abc",
  votes: [
    { postId: "post_123", vote: "up", timestamp: "..." },
    { postId: "post_456", vote: "down", timestamp: "..." }
  ]
}
```

### **2. Vote Analysis**

**Extract preferences from voting pattern:**
- Topics (politics, environment, technology, economy)
- Political bias (left, center, right)
- Keywords (climate action, gun rights, healthcare, etc.)
- Preferred news sources (CNN, Fox News, NPR, etc.)

### **3. Content Sources**

**Multi-platform feed with images:**
- ✅ **NewsAPI** - Real news articles with images
- ✅ **Reddit** - Social posts with images
- ✅ **RSS Feeds** - Additional news sources
- ⚠️ **Twitter/X** - Optional (10k/month free tier limit)
- ❌ **Facebook** - Not accessible (API restrictions)

### **4. Feed Generation**

**Fetch personalized content:**
```javascript
async function generatePersonalizedFeed(preferences) {
  const [newsArticles, redditPosts, rssArticles] = await Promise.all([
    fetchNewsWithImages(preferences),
    fetchRedditWithImages(preferences),
    fetchRSSFeeds(preferences)
  ]);
  
  return shuffleAndCombine(newsArticles, redditPosts, rssArticles);
}
```

### **5. Mobile Display**

**Image-rich social media feed:**
- Article/post image (full width)
- Source logo and timestamp
- Match percentage badge
- Title and description
- Link to full article

---

## 🎨 UI Components

### **Mobile Controller**

**Voting Interface:**
- Display post content
- 👍 Agree button
- 👎 Disagree button
- Vote counter

**Personalized Feed:**
- Scrollable feed container
- Image-rich post cards
- Source attribution
- Match score indicators
- "Your Echo Chamber" header

### **Main Display**

**Post Display:**
- Show diverse posts for voting
- Real-time vote counts
- Visual feedback on votes

---

## 📋 Implementation Phases

### **Phase 1: Voting System**
- Add vote buttons to mobile controller
- Implement vote tracking (server-side)
- Store user voting patterns
- Real-time vote count updates

### **Phase 2: Vote Analysis**
- Analyze voting patterns after 5+ votes
- Extract topics, bias, keywords
- Map to news categories and sources

### **Phase 3: Content Fetching**
- Integrate NewsAPI for articles with images
- Fetch Reddit posts with images
- Add RSS feed parsing
- (Optional) Add Twitter/X integration

### **Phase 4: Feed Display**
- Design mobile feed UI
- Display personalized articles with images
- Show match percentages
- Add "Your Echo Chamber" messaging

### **Phase 5: Educational Component**
- Reveal filter bubble mechanism
- Compare different users' feeds
- Show how votes create echo chambers
- Add statistics and insights

---

## 🎯 Demo Scenario

**Diploma Presentation:**

1. Audience members vote on 10 diverse posts
2. System analyzes each person's voting pattern
3. Generate personalized feeds for each user
4. Display on their mobile devices
5. Compare feeds side-by-side on main display
6. Reveal: "This is how algorithms create echo chambers"

**Expected Impact:**
- Visual demonstration of filter bubbles
- Real-time personalization
- Educational revelation
- Engaging interactive experience

---

## 🔧 Technical Requirements

**Dependencies:**
- NewsAPI (already integrated)
- Reddit API (already integrated)
- RSS Parser (need to add: `npm install rss-parser`)
- (Optional) Twitter API v2

**Server Changes:**
- Add voting WebSocket message handlers
- Implement vote storage and analysis
- Add feed generation logic
- Create personalized feed endpoints

**Client Changes:**
- Add voting UI to mobile controller
- Create feed display component
- Implement real-time vote updates
- Add match score visualization

---

## 📊 Success Metrics

**Feature is successful if:**
- Users can vote on posts easily
- System accurately detects political bias
- Generated feeds match voting patterns (>80% relevance)
- Mobile feed is visually engaging
- Educational message is clear

---

## 🚀 Future Enhancements

- Compare feeds between users
- Show "opposite bubble" feed
- Add feed diversity score
- Implement feed customization
- Add sharing functionality

---

**Branch:** `personalized-feed`  
**Status:** Planning phase  
**Next Steps:** Begin Phase 1 implementation
