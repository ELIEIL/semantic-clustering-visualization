#!/bin/bash

# Start Cloudflare Tunnel for Diploma Project
# This creates a public URL that works across any network

echo "🚀 Starting Cloudflare Tunnel..."
echo "================================"
echo ""
echo "This will create a public URL that anyone can access"
echo "from any WiFi network or cellular data."
echo ""

# Start the tunnel
cloudflared tunnel --url http://localhost:3000

# The tunnel will display a URL like: https://random-name.trycloudflare.com
# Share this URL via QR code for mobile access
