# Codebase Refactoring Guide

## New Project Structure

```
/
├── src/
│   ├── client/                 # Frontend code
│   │   ├── components/         # Reusable classes
│   │   │   ├── NLPEngine.js           # Text processing & TF-IDF
│   │   │   ├── KMeansClustering.js    # Clustering algorithm
│   │   │   ├── Node.js                # Post/node representation
│   │   │   └── MetaballRenderer.js    # Metaball visualization
│   │   ├── pages/              # HTML pages
│   │   │   ├── index.html             # Main visualization
│   │   │   ├── mobile.html            # Mobile input interface
│   │   │   └── admin.html             # Admin panel
│   │   ├── styles/             # CSS files
│   │   │   ├── styles.css             # Main styles
│   │   │   ├── mobile.css             # Mobile styles
│   │   │   └── admin.css              # Admin styles
│   │   ├── utils/              # Utility functions
│   │   │   ├── websocket.js           # WebSocket connection
│   │   │   ├── ui-helpers.js          # UI updates & monitoring
│   │   │   └── similarity.js          # Similarity calculations
│   │   ├── main.js             # Main application (to be created)
│   │   ├── mobile.js           # Mobile app logic
│   │   └── admin.js            # Admin logic
│   │
│   └── server/                 # Backend code
│       ├── api/                # API clients
│       │   ├── conceptnet-client.js   # ConceptNet API
│       │   └── sentence-transformer.js # Transformer model
│       ├── routes/             # API routes (future)
│       ├── server.js           # Main server
│       └── config.js           # Configuration
│
├── data/                       # Data files
│   ├── algorithmic-database.json
│   └── test-semantics.json
│
├── docs/                       # Documentation
│   ├── README.md
│   ├── CODEBASE_GUIDE.md
│   ├── NOTES.md
│   ├── twitter-integration-plan.md
│   └── REFACTORING_GUIDE.md (this file)
│
├── tests/                      # Test files
│   └── (test files)
│
├── backup/                     # Backup files
│   └── script_backup.js
│
├── public/                     # Static assets
│   └── (future assets)
│
├── node_modules/               # Dependencies
├── package.json
└── package-lock.json
```

---

## What Changed

### Before (Flat Structure)
- All files in root directory
- `script.js` was 46KB (1350+ lines)
- Hard to navigate and maintain
- No clear separation of concerns

### After (Modular Structure)
- Organized into logical folders
- Code split into focused modules
- Clear separation: client/server/data/docs
- Each component has single responsibility
- Easy to find and modify code

---

## Module Descriptions

### Client Components

**NLPEngine.js**
- Text tokenization
- TF-IDF calculation
- Keyword extraction
- Cosine similarity

**KMeansClustering.js**
- K-means clustering algorithm
- Semantic similarity-based clustering
- Cluster color assignment
- Centroid management

**Node.js**
- Post representation
- Physics simulation (attraction/repulsion)
- Similarity calculation
- Text rendering

**MetaballRenderer.js**
- Metaball field calculation
- Marching squares algorithm
- Convex hull computation
- Smooth curve generation

### Client Utils

**websocket.js**
- WebSocket connection management
- Message handling
- Auto-reconnection

**ui-helpers.js**
- Activity logging
- Status updates
- Panel management
- Database selector

**similarity.js**
- Batch similarity calculations
- Progress tracking
- Caching

---

## Migration Notes

### Old Import Pattern
```javascript
// Everything in one file
// No imports needed
```

### New Import Pattern
```javascript
// ES6 modules
import NLPEngine from './components/NLPEngine.js';
import KMeansClustering from './components/KMeansClustering.js';
import Node from './components/Node.js';
import MetaballRenderer from './components/MetaballRenderer.js';
import { connectWebSocket } from './utils/websocket.js';
import { logActivity, updateConceptNetPanel } from './utils/ui-helpers.js';
```

---

## Benefits of New Structure

1. **Modularity**: Each file has one clear purpose
2. **Reusability**: Components can be imported anywhere
3. **Testability**: Easy to test individual modules
4. **Maintainability**: Find and fix bugs faster
5. **Scalability**: Add new features without cluttering
6. **Collaboration**: Multiple developers can work simultaneously
7. **Performance**: Load only what you need

---

## Next Steps

1. ✅ Create folder structure
2. ✅ Move files to new locations
3. ✅ Split script.js into components
4. ✅ Create utility modules
5. ⏳ Create main.js to tie everything together
6. ⏳ Update HTML files with new paths
7. ⏳ Update server.js with new paths
8. ⏳ Test the refactored system

---

## Running the Application

### Development
```bash
# Start server
node src/server/server.js

# Open in browser
# Main: http://localhost:8080/src/client/pages/index.html
# Mobile: http://localhost:8080/src/client/pages/mobile.html
```

### Production
(To be configured with build system)

---

## File Size Comparison

**Before:**
- script.js: 46,698 bytes (1 file)

**After:**
- NLPEngine.js: ~2,500 bytes
- KMeansClustering.js: ~4,800 bytes
- Node.js: ~6,200 bytes
- MetaballRenderer.js: ~7,500 bytes
- websocket.js: ~800 bytes
- ui-helpers.js: ~4,200 bytes
- similarity.js: ~1,000 bytes
- main.js: ~5,000 bytes (to be created)

**Total: ~32,000 bytes across 8 focused files**

---

## Troubleshooting

### Module Import Errors
- Ensure you're using ES6 modules (`type: "module"` in package.json or `<script type="module">`)
- Check file paths are correct
- Verify exports match imports

### Path Issues
- All paths should be relative to the file importing them
- Use `./` for same directory, `../` for parent directory

### Server Not Finding Files
- Update server.js to serve from new `src/client/pages` directory
- Check static file middleware configuration

---

## Future Improvements

- Add TypeScript for type safety
- Implement build system (Webpack/Vite)
- Add unit tests for each module
- Create API documentation
- Add linting and formatting (ESLint, Prettier)
- Implement hot module replacement for development
