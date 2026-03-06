# Codebase Guide

## What This Project Does
Visualizes social media posts as a network where similar posts cluster together with organic "metaball" blobs.

## File Structure

### Backend (Server)
- **`server.js`** - Main server
  - WebSocket server (port 8080) - Real-time communication
  - HTTP server (port 3000) - API endpoints
  - Handles post moderation and broadcasting

- **`sentence-transformer.js`** - AI Similarity Engine
  - Uses neural network to understand post meaning
  - Calculates how similar two posts are (0-100%)
  - Caches results for speed

### Frontend (Display)
- **`index.html`** - Main visualization page
  - Shows posts as circles
  - Draws connections between similar posts
  - Shows metaballs around clusters

- **`script.js`** - Visualization Logic (p5.js canvas)
  - `Node` class - Each post is a node
  - `NLPEngine` - Extracts keywords from posts
  - `KMeansClustering` - Groups similar posts
  - `drawClusterMetaballs()` - **THE PROBLEM AREA**

### Mobile Controller
- **`mobile.html`** - Mobile posting interface
- **`mobile.js`** - Sends posts to server

## How Data Flows

```
Mobile Phone                Server                  Display
    |                         |                        |
    | 1. User types post      |                        |
    |------------------------>|                        |
    |                         | 2. Broadcasts post     |
    |                         |----------------------->|
    |                         |                        | 3. Extracts keywords
    |                         |                        | 4. Calculates similarity
    |                         |                        | 5. Groups similar posts
    |                         |                        | 6. Draws metaballs
    |                         |                        |
```

## The Metaball Issue

**Current Implementation:** Just draws overlapping circles
**Problem:** Circles don't blend smoothly - they just overlap

**What Real Metaballs Need:**
1. Each post creates a "field" that gets weaker with distance
2. Where fields overlap strongly, draw a blob
3. The blob should smoothly connect the posts

## Key Algorithms

### 1. Keyword Extraction (NLP)
- Removes common words ("the", "is", "a")
- Finds important words using TF-IDF
- Example: "Climate change is real" → ["climate", "change", "real"]

### 2. Similarity Calculation
- Compares keywords between two posts
- Uses Sentence Transformer AI model
- Returns score 0.0 (different) to 1.0 (identical)

### 3. Clustering (K-Means)
- Groups posts into 3 clusters
- Each cluster gets a color
- Similar posts end up in same cluster

### 4. Metaballs (BROKEN)
- Should draw organic blobs around similar posts
- Currently just draws overlapping circles
- Needs proper implementation

## What Needs Fixing

The `drawClusterMetaballs()` function in `script.js` needs to:
1. Calculate field strength around each post
2. Find where fields overlap above threshold
3. Draw smooth organic shapes around those areas

This is the core visualization problem.
