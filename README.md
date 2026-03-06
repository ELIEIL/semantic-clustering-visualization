# Semantic Post Clustering Visualization

A real-time visualization system that clusters social media posts using semantic similarity and displays them as organic metaball shapes.

## 🏗️ Project Structure

```
/
├── client/                 # Frontend application
│   ├── components/         # Core visualization components
│   │   ├── NLPEngine.js           # Text processing & TF-IDF
│   │   ├── KMeansClustering.js    # K-means clustering algorithm
│   │   ├── Node.js                # Post node with physics
│   │   └── MetaballRenderer.js    # Metaball visualization
│   ├── utils/              # Utility functions
│   │   ├── websocket.js           # WebSocket connection
│   │   ├── ui-helpers.js          # UI updates & monitoring
│   │   └── similarity.js          # Similarity calculations
│   ├── pages/              # HTML pages
│   │   ├── index.html             # Main visualization display
│   │   ├── mobile.html            # Mobile post input
│   │   └── admin.html             # Admin panel
│   ├── styles/             # CSS stylesheets
│   │   ├── styles.css             # Main display styles
│   │   ├── mobile.css             # Mobile interface styles
│   │   └── admin.css              # Admin panel styles
│   ├── main.js             # Application entry point
│   ├── mobile.js           # Mobile app logic
│   └── admin.js            # Admin panel logic
│
├── server/                 # Backend server
│   ├── api/                # API integrations
│   │   ├── conceptnet-client.js   # ConceptNet API client
│   │   └── sentence-transformer.js # Transformer model
│   ├── config/             # Configuration files
│   ├── routes/             # API routes (future)
│   ├── server.js           # Main WebSocket server
│   └── config.js           # Server configuration
│
├── data/                   # Data files
│   ├── algorithmic-database.json  # Cached similarity data
│   └── test-semantics.json        # Test data
│
├── docs/                   # Documentation
│   ├── README.md                  # This file
│   ├── CODEBASE_GUIDE.md          # Code structure guide
│   ├── NOTES.md                   # Development notes
│   └── twitter-integration-plan.md
│
├── shared/                 # Shared utilities (future)
├── backup/                 # Backup files
├── tests/                  # Test files (future)
│
├── script.js               # Legacy monolithic script (deprecated)
├── package.json            # Node dependencies
└── package-lock.json
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
node server/server.js
```

### 3. Open the Visualization
```bash
open client/pages/index.html
```

### 4. Send Posts (Optional)
```bash
open client/pages/mobile.html
```

---

## 🎯 Features

### Visualization Display
- **Semantic Clustering**: Posts grouped by meaning using Transformer models
- **Metaball Rendering**: Organic blob shapes that merge similar posts
- **Physics Simulation**: Attraction/repulsion forces for natural layout
- **Real-time Monitoring**: Live algorithm activity feed
- **Multiple Databases**: Switch between TF-IDF, Transformer, ConceptNet

### Mobile Interface
- **Simple Post Input**: Clean textarea for composing posts
- **Cluster Feedback**: See which cluster your post joins
- **Recommendations**: View other posts in your cluster
- **WebSocket Connection**: Real-time communication with display

### Admin Panel
- **Post Moderation**: Review and approve posts
- **Profanity Filter**: Automatic content filtering
- **Rate Limiting**: Prevent spam

---

## 🧩 Architecture

### Client-Side (Browser)
- **p5.js**: Canvas rendering and animation
- **ES6 Modules**: Modern JavaScript with imports/exports
- **WebSocket**: Real-time bidirectional communication

### Server-Side (Node.js)
- **WebSocket Server**: Handles connections from display and mobile
- **Sentence Transformers**: Semantic similarity via Python integration
- **ConceptNet API**: Fallback semantic understanding

### Data Flow
```
Mobile App → WebSocket → Server → Display
                ↓
         Transformer Model
                ↓
         Similarity Cache
                ↓
         K-means Clustering
                ↓
         Metaball Rendering
```

---

## 📦 Key Components

### NLPEngine
- Tokenization and stop word removal
- TF-IDF calculation
- Keyword extraction
- Cosine similarity

### KMeansClustering
- Semantic similarity-based clustering
- Dynamic centroid updates
- Cluster color assignment

### Node
- Post representation with physics
- Attraction to similar posts (2.5x force)
- Repulsion from different clusters (4.0x force)
- Minimum distance enforcement (100px)

### MetaballRenderer
- Field strength calculation
- Marching squares algorithm
- Convex hull computation
- Smooth curve generation (3x iterations)

---

## 🎨 Visual Design

### Metaball Effect
Posts with >20% similarity merge into organic blobs:
- Individual posts: Visible text with circular outline
- Clusters (2+ posts): Merged blob with cluster label only
- Text hidden inside clusters to reduce clutter

### Color Coding
- 5 distinct cluster colors (HSB color space)
- Colors assigned based on semantic grouping
- Consistent across display and mobile feedback

### Physics Parameters
- Attraction force: 2.5x for similar posts
- Cluster repulsion: 4.0x within 400px range
- Minimum distance: 100px with 2.5x repulsion
- No center gravity (clusters spread naturally)

---

## 🔧 Configuration

### Database Selection
Switch between similarity algorithms:
- **TF-IDF**: Fast, keyword-based (offline)
- **Transformer**: Semantic, context-aware (recommended)
- **ConceptNet**: Knowledge graph-based (fallback)

### Clustering Parameters
```javascript
numClusters = 5;              // Number of color groups
similarityThreshold = 0.2;    // Metaball merge threshold
```

### Physics Tuning
```javascript
attractionForce = 2.5;        // Pull similar posts together
clusterRepulsion = 4.0;       // Push different clusters apart
minDistance = 100;            // Prevent overlap
```

---

## 🛠️ Development

### File Organization
- **Components**: Reusable classes (NLP, clustering, rendering)
- **Utils**: Helper functions (WebSocket, UI, similarity)
- **Pages**: HTML entry points
- **Styles**: Modular CSS per page

### Code Style
- ES6 modules with explicit imports/exports
- Functional programming where possible
- Clear separation of concerns
- Comprehensive inline documentation

### Adding Features
1. Create new component in `client/components/`
2. Import in `client/main.js`
3. Update documentation

---

## 📊 Performance

### Optimization Strategies
- **Similarity Caching**: Avoid redundant API calls
- **Incremental Clustering**: Only recalculate when needed
- **Efficient Rendering**: Metaball field calculation optimized
- **Connection Pooling**: Reuse WebSocket connections

### Scalability
- Handles 50+ posts smoothly
- Sub-second clustering updates
- 60 FPS rendering on modern hardware

---

## 🐛 Troubleshooting

### Display Not Loading
- Check browser console for errors
- Verify p5.js CDN is accessible
- Ensure WebSocket server is running

### Posts Not Appearing
- Check WebSocket connection status
- Verify server is running on port 8080
- Check for profanity filter blocks

### Metaballs Not Merging
- Increase similarity threshold
- Check if posts are actually similar
- Verify clustering is running

---

## 📝 License

MIT License - See LICENSE file for details

---

## 👥 Contributors

Built for diploma project on semantic post clustering and visualization.

---

## 🔮 Future Enhancements

- [ ] TypeScript migration for type safety
- [ ] Build system (Webpack/Vite)
- [ ] Unit tests for components
- [ ] API documentation
- [ ] Dark mode support
- [ ] Export visualization as image/video
- [ ] Historical post playback
- [ ] Advanced filtering and search
