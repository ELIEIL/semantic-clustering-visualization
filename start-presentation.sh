#!/bin/bash

# Diploma Presentation Startup Script
# Starts both the Node.js server and Cloudflare Tunnel

echo "🎓 Starting Diploma Presentation Setup"
echo "======================================="
echo ""

# Kill any existing processes on ports 3000 and 8080
echo "🧹 Cleaning up existing processes..."
lsof -ti:8080 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 1

# Start the Node.js server in the background
echo "🚀 Starting Node.js server..."
cd server
node server.js &
SERVER_PID=$!
cd ..

# Wait for server to start
echo "⏳ Waiting for server to initialize..."
sleep 3

# Start Cloudflare Tunnel
echo ""
echo "🌐 Starting Cloudflare Tunnel..."
echo "================================"
echo ""
echo "📱 The tunnel will generate a public URL like:"
echo "   https://random-name.trycloudflare.com"
echo ""
echo "⚠️  IMPORTANT: After the tunnel starts:"
echo "   1. Copy the tunnel URL (e.g., https://abc123.trycloudflare.com)"
echo "   2. Update the QR code with this command:"
echo "      curl -X POST http://localhost:3000/api/update-tunnel-url \\"
echo "           -H 'Content-Type: application/json' \\"
echo "           -d '{\"tunnelUrl\":\"https://YOUR-URL.trycloudflare.com\"}'"
echo ""
echo "   3. The QR code in the hamburger menu will automatically update!"
echo ""
echo "💻 Main display (local):"
echo "   http://localhost:3000/client/pages/index.html"
echo ""
echo "================================"
echo ""

# Start the tunnel (this will block and show the URL)
cloudflared tunnel --url http://localhost:3000

# Cleanup when tunnel is stopped (Ctrl+C)
echo ""
echo "🛑 Shutting down..."
kill $SERVER_PID 2>/dev/null
echo "✅ Cleanup complete"
