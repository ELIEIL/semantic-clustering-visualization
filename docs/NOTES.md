# Development Notes

## Session Update (March 3, 2026)

### Changes Made Today

**Visualization Redesign - Floating Text Nodes:**
- Removed particle systems and decorative elements
- Removed background boxes and borders
- **Statements are now the primary visual element** - pure floating text
- Font changed to **MD IO Trial** (user's system font)
- Text size increased to **24px** for better readability
- Text wraps within 300px width boxes
- Full statement content visible (not truncated)

**Multiple Posting Enabled:**
- Removed one-time posting restriction for testing
- Disabled rate limiting (commented out in server.js)
- Users can now post unlimited statements
- Input clears after each post with "✓ Posted!" feedback

**Network Algorithm Maintained:**
- Keyword extraction still active
- Similarity-based connections (>30% match)
- Physics simulation for organic movement
- Repulsion/attraction forces based on content similarity

**Current Visual Style:**
- Clean, minimal design
- Black text on white background
- No styling, boxes, or decorative elements
- Text is the node - statements float and connect
- Network lines show relationships between similar posts

### Technical Notes

**Text Wrapping Implementation:**
```javascript
wrapText(text, maxWidth) {
    // Splits text into lines that fit within maxWidth
    // Uses p5.js textWidth() to measure
    // Returns array of wrapped lines
}
```

**Display Method (Simplified):**
- No background fill
- No stroke/border
- Just text rendered at node position
- Multi-line support with proper line height

**Physics Adjustments:**
- Increased minimum distance to 250px (nodes stay further apart)
- Stronger repulsion force (0.8) for better spacing
- Damping increased to 0.88 for more stable movement
- Bounds checking accounts for text box dimensions

### Design Philosophy

**Focus on Content:**
- Statements are the visualization
- No decorative elements to distract
- Typography as the primary visual language
- Network connections show meaning, not aesthetics

**Algorithm Understanding:**
- User wants to explore algorithmic visualization concepts
- Current implementation: force-directed graph
- Nodes = statements (text)
- Edges = semantic similarity (keyword matching)
- Forces = physics simulation (attraction/repulsion)

### Next Steps / Ideas

**Algorithm Exploration:**
- Experiment with different layout algorithms
- Try clustering algorithms (k-means, hierarchical)
- Implement different force models
- Add gravity wells or attractor points

**Visual Variations:**
- Different text sizes based on importance/length
- Color coding by topic/sentiment
- Opacity based on age or relevance
- Animation effects for new posts

**Interaction:**
- Click to expand full text
- Drag nodes manually
- Filter by keyword
- Search functionality

## Current Status (March 2, 2026)

### ✅ Completed Features
- Mobile controller with QR code access
- Real-time WebSocket communication
- Algorithmic visualization with p5.js
- Network graph showing post relationships
- Generative art with particle systems
- Physics-based node movement
- Keyword extraction and similarity matching
- Profanity filtering
- Rate limiting (3 posts/minute)
- One-time posting restriction
- Admin panel toggle system

### 🎨 Visualization Algorithm

**Node Properties:**
- Position: Random initial, physics-based movement
- Size: 20-80px based on post length
- Color: Generated from text hash (HSB)
- Particles: 20 orbiting particles per node

**Connection Logic:**
- Extract keywords from each post
- Compare keyword overlap between posts
- Draw connection if similarity > 30%
- Line thickness/opacity based on similarity strength

**Physics Forces:**
1. **Repulsion:** Nodes within 200px push apart
2. **Attraction:** Similar nodes pull together
3. **Center Gravity:** Gentle pull to screen center
4. **Damping:** 85% velocity retention for smooth movement

### 🔧 Technical Decisions

**Why p5.js:**
- Easy creative coding
- Built-in physics helpers
- Good for generative art
- Active community

**Why WebSockets:**
- Real-time bidirectional communication
- Low latency for live updates
- Simple protocol

**Color Generation:**
- Hash text content to number
- Convert to HSB hue (0-360)
- Consistent colors for same text
- Visually distinct for different content

### 🐛 Issues Resolved

1. **p5.js not rendering:**
   - Issue: `color()` called before p5.js initialized
   - Fix: Store HSB values as object, apply in display()

2. **Nodes not appearing:**
   - Issue: `random()`, `width`, `height` undefined in constructor
   - Fix: Use Math.random() and pass canvas dimensions

3. **Draw loop not running:**
   - Issue: JavaScript errors stopping execution
   - Fix: Add try-catch and debug logging

### 📝 Code Organization

**Separation of Concerns:**
- `script.js` - Visualization logic only
- `mobile.js` - Controller logic only
- `server.js` - Server and moderation logic
- `config.js` - Configuration settings

**Node Class Structure:**
```javascript
class Node {
    constructor()     // Initialize properties
    generateColor()   // Create unique color
    extractKeywords() // Parse text for keywords
    update()          // Apply physics forces
    calculateSimilarity() // Compare with other nodes
    display()         // Render to canvas
}
```

### 🎯 Design Principles

1. **Minimal UX:** Black and white, no unnecessary elements
2. **One Action:** Users can only post once
3. **Immediate Feedback:** Posts appear instantly on display
4. **Organic Movement:** Physics-based, not rigid
5. **Visual Relationships:** Similar content clusters together

### 💡 Ideas for Next Session

**Visualization Enhancements:**
- Add text labels that appear on hover/click
- Implement zoom/pan controls
- Create different layout algorithms (circular, force-directed, etc.)
- Add animation when new posts arrive
- Implement fade-out for old posts

**Interaction Features:**
- Click nodes to see full post content
- Filter by keyword/topic
- Timeline view of posts
- Export visualization as image

**Analysis Features:**
- Sentiment analysis coloring
- Topic detection and clustering
- Word frequency analysis
- Network metrics (centrality, clustering coefficient)

**Technical Improvements:**
- Add session persistence (save/load state)
- Implement post editing/deletion
- Add user authentication
- Create admin dashboard with analytics
- Optimize performance for 100+ nodes

### 🔐 Security Considerations

**Current Protections:**
- Profanity filter (basic word list)
- Rate limiting (IP-based)
- Character limit (500 chars)
- One-time posting per device

**Future Enhancements:**
- AI-based content moderation
- User reporting system
- IP blocking for abuse
- CAPTCHA for bot prevention
- Content encryption

### 📊 Performance Notes

**Current Performance:**
- Smooth at 60fps with <20 nodes
- Minor slowdown at 50+ nodes
- Connection calculations: O(n²)

**Optimization Opportunities:**
- Spatial hashing for collision detection
- Limit connection calculations to nearby nodes
- Use requestAnimationFrame instead of p5.js draw
- Implement level-of-detail rendering
- Add node pooling/recycling

### 🎨 Visual Design Notes

**Color Palette:**
- Background: White (#FFFFFF)
- Text: Black (#000000)
- Nodes: White with black border
- Particles: HSB-generated unique colors
- Connections: Black with varying opacity

**Typography:**
- Font: System sans-serif
- Display text: 12-20px
- Mobile input: 18-20px
- Emphasis on readability

### 🚀 Deployment Considerations

**For Public Installation:**
1. Use HTTPS for WebSocket security
2. Set up proper CORS headers
3. Implement content moderation queue
4. Add analytics tracking
5. Create backup/restore system
6. Monitor server resources
7. Set up error logging
8. Create admin dashboard

**Hardware Requirements:**
- Server: Node.js capable machine
- Display: Large screen/projector
- Network: Stable WiFi for mobile devices
- Recommended: Dedicated server for stability

### 📚 Resources

**Documentation:**
- p5.js Reference: https://p5js.org/reference/
- WebSocket API: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- Force-directed graphs: https://en.wikipedia.org/wiki/Force-directed_graph_drawing

**Inspiration:**
- Network visualization examples
- Generative art galleries
- Interactive installations
- Social media visualizations
