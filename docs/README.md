# Kahoot-Style Interactive Visualization System

Real-time collaborative visualization system where users submit text posts from mobile devices and see them visualized as an animated network graph on a centralized display.

## Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Start the server:**
```bash
npm start
```

3. **Open the main display** at `index.html` in your browser (for projection/main screen)

4. **Scan the QR code** with your phone to access the mobile controller

5. **Submit posts** and watch them appear as animated nodes in the visualization

## System Architecture

### **Main Display** (`index.html`)
- Algorithmic visualization using p5.js
- Network graph showing post relationships
- Generative art with colored particles
- Physics-based organic movement

### **Mobile Controller** (`mobile.html`)
- Accessed via QR code
- One-time posting (users can only submit once)
- Social media-style text input
- Real-time WebSocket connection

### **WebSocket Server** (`server.js`)
- Handles real-time communication
- Content filtering and rate limiting
- Broadcasts posts to all connected displays

## Visualization Features

### **Floating Text Network**
- **Statements as Nodes:** Text is the primary visual element (no boxes or decorations)
- **Keyword Extraction:** Analyzes posts for meaningful words
- **Similarity Algorithm:** Compares posts based on shared keywords
- **Dynamic Connections:** Lines appear between similar posts (>30% similarity)
- **Typography:** MD IO Trial font at 24px for readability
- **Text Wrapping:** Statements wrap within 300px width
- **Physics Simulation:** Nodes attract/repel organically based on content similarity

### **How the Algorithm Works**
1. Post arrives → Extract keywords (removes common words like "the", "is", "and")
2. Create text node with wrapped lines (300px max width)
3. Calculate similarity with existing posts (keyword overlap)
4. Draw connections to similar posts (>30% match)
5. Apply physics forces:
   - **Repulsion:** Nodes push apart (minimum 250px distance)
   - **Attraction:** Similar nodes pull together
   - **Center Gravity:** Gentle pull toward screen center
6. Update positions with velocity damping (0.88) for smooth movement
7. Render text at node positions at 60fps

## Content Safety Features

### **Profanity Filter**
- Automatically blocks offensive language
- Configurable word list in `server.js`

### **Rate Limiting**
- Max 3 posts per user per minute
- Prevents spam and flooding

### **Character Limit**
- 500 character maximum per post
- Ensures manageable content

### **One-Time Posting**
- Each user can only submit one post
- Mobile controller locks after submission

## Configuration

Edit `config.js` to enable/disable features:

```javascript
const CONFIG = {
    ADMIN_PANEL_ENABLED: false,      // Enable admin moderation panel
    PROFANITY_FILTER_ENABLED: true,  // Enable profanity filtering
    RATE_LIMITING_ENABLED: true      // Enable rate limiting
};
```

**Note:** Rate limiting is currently **disabled** in `server.js` (commented out) for testing purposes. Multiple posts can be submitted without restriction.

## File Structure

```
Controller Display and UX/
├── index.html              # Main visualization display
├── mobile.html             # Mobile controller interface
├── admin.html              # Admin moderation panel (optional)
├── script.js               # Visualization logic (p5.js)
├── mobile.js               # Mobile controller logic
├── admin.js                # Admin panel logic
├── server.js               # WebSocket server
├── config.js               # Configuration settings
├── styles.css              # Display styling
├── mobile.css              # Mobile styling
├── admin.css               # Admin styling
├── package.json            # Dependencies
└── README.md               # This file
```

## Technical Details

### **Libraries Used**
- **p5.js** (v1.7.0) - Creative coding and visualization
- **ws** - WebSocket server for real-time communication
- **qrcode-terminal** - QR code generation for mobile access

### **Physics Simulation**
- Repulsion force: Nodes push away to avoid overlap
- Attraction force: Similar posts pull toward each other
- Center gravity: Gentle pull toward screen center
- Velocity damping: Smooth, organic movement

### **Color Generation**
- Hash algorithm converts text to unique hue value
- HSB color mode for vibrant, distinct colors
- Consistent colors for same text content

## Next Steps / Future Enhancements

- [ ] Add sentiment analysis visualization
- [ ] Implement topic clustering
- [ ] Add 3D visualization mode
- [ ] Create word cloud overlay
- [ ] Add animation transitions for new posts
- [ ] Implement post deletion from display
- [ ] Add session persistence
- [ ] Create analytics dashboard

## Testing

- **Test Visualization:** Open `test-visualization.html` for debugging
- **Console Logging:** Check browser console for connection status and errors
- **Frame Counter:** Visible in top-left when nodes exist

## Troubleshooting

**Posts not appearing:**
- Check browser console for WebSocket connection
- Verify server is running (`npm start`)
- Hard refresh browser (Cmd+Shift+R)

**Visualization not rendering:**
- Ensure p5.js CDN is accessible
- Check for JavaScript errors in console
- Verify canvas element is created

**Mobile controller not connecting:**
- Ensure phone and computer on same network
- Check firewall settings
- Verify WebSocket port 8080 is open
