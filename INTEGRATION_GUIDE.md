# Post-Reveal Interaction Integration Guide

This branch (`feature/post-reveal-interaction`) is set up for developing a new interaction phase that happens **after** the topic reveal animation in the pedagogical experience.

## 🎯 Current Experience Flow

1. **Post Submission** (2 min timer)
   - Users submit opinions on mobile
   - Posts appear as nodes on main display

2. **Clustering** (automatic at timer end)
   - Posts are grouped into thematic clusters
   - Clusters sent to mobile devices

3. **Voting Phase** (1 min timer)
   - Users vote on which topic to discuss
   - Votes synced across all devices
   - Each user can only vote once

4. **Topic Reveal Animation**
   - Main display: Colored blob grows and dissolves
   - Mobile: Blob animation with topic name
   - Text changes to "Vote on a topic you'd like to discuss"

5. **→ NEW FEATURE GOES HERE** ⭐

## 🔌 Integration Hooks

### Main Display (`script.js`)

**Location:** Line ~1978-1984

```javascript
// After reveal animation completes
revealPhase = 'idle';
revealAnimationActive = false;

// 🎯 INTEGRATION HOOK: Post-Reveal Interaction
// Call your new feature here:
// startPostRevealInteraction();
```

### Mobile Client (`mobile.js`)

**Location:** Line ~846-852

```javascript
// After role assignment request
ws.send(JSON.stringify({ type: 'assign_roles' }));

// 🎯 INTEGRATION HOOK: Post-Reveal Interaction
// Start your new interaction:
// startProximityMatchmaking();
```

## 📋 UI Scaffolding Already Added

### Mobile UI Elements (ready to use):

1. **Voting Timer** - `#votingTimer`
   - Displays countdown during voting phase
   - Already styled and positioned

2. **Topic Reveal Section** - `#topicRevealSection`
   - Full-screen reveal with animated blob
   - Shows winning topic name
   - Includes fade transitions

3. **Debater Role Screen** - `#debaterSection`
   - Blue background (#0000FE)
   - "You are a debater" message
   - Hidden by default

4. **Listener Role Screen** - `#listenerSection`
   - Red background (#F24822)
   - "You are a listener" message
   - Hidden by default

## 🚀 How to Develop Your Feature

### 1. Create Your Feature Functions

```javascript
// In mobile.js or new file
function startPostRevealInteraction() {
    console.log('🎯 Starting post-reveal interaction');
    
    // Your code here
    // Example: proximity detection, role assignment, etc.
}
```

### 2. Add Server-Side Logic (if needed)

```javascript
// In server/server.js
if (data.type === 'assign_roles') {
    // Your role assignment logic
    // Broadcast to clients
}
```

### 3. Hook Into Integration Points

Uncomment and call your function at the integration hooks marked above.

### 4. Test Independently

```bash
# Start server
cd server
node server.js

# Test your feature in isolation
# Then test full flow: post → vote → reveal → your feature
```

## 🔀 Merging Back to Main Branch

When your feature is ready:

```bash
# Switch to main pedagogical experience
git checkout ux2/pedagogical-experience

# Merge your feature
git merge feature/post-reveal-interaction

# Test the complete flow
# Commit and push
```

## 💡 Feature Ideas (from memories)

Based on previous discussions, potential features for this phase:

- **Proximity Matchmaking**: Users find each other based on opposing viewpoints
- **Role Assignment**: Debaters vs Listeners
- **GPS/WebSocket Proximity Detection**: "Hot/cold" game mechanics
- **Vibration/Audio Feedback**: Guide users to find each other

## 📁 Key Files

- `script.js` - Main display logic
- `client/mobile.js` - Mobile controller logic
- `client/pages/mobile.html` - Mobile UI structure
- `client/styles/mobile.css` - Mobile styling
- `server/server.js` - Server-side WebSocket handling

## ✅ What's Already Working

- ✅ Voting phase with timer sync
- ✅ One-vote-per-user restriction
- ✅ Topic reveal animation (main + mobile)
- ✅ Clean integration hooks
- ✅ UI scaffolding for role screens
- ✅ WebSocket communication infrastructure

## 🎯 Your Task

Build the post-reveal interaction that happens after the topic reveal animation completes. The infrastructure is ready - just add your feature logic!
