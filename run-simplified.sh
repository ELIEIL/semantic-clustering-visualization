#!/bin/bash
# Run simplified-clustering branch on port 4000

echo "🚀 Starting Simplified-Clustering Branch..."
echo "📍 HTTP Server: http://localhost:4000"
echo "📍 WebSocket: ws://localhost:9090"
echo ""

PORT=9090 HTTP_PORT=4000 node server/server.js
