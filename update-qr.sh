#!/bin/bash

# Update QR Code with Cloudflare Tunnel URL
# Usage: ./update-qr.sh https://your-url.trycloudflare.com

if [ -z "$1" ]; then
    echo "❌ Error: Please provide the tunnel URL"
    echo ""
    echo "Usage: ./update-qr.sh https://your-url.trycloudflare.com"
    echo ""
    echo "Example:"
    echo "  ./update-qr.sh https://abc123.trycloudflare.com"
    exit 1
fi

TUNNEL_URL=$1

echo "🔄 Updating QR code with tunnel URL..."
echo "URL: $TUNNEL_URL"
echo ""

# Update the server's QR code
RESPONSE=$(curl -s -X POST http://localhost:3000/api/update-tunnel-url \
    -H 'Content-Type: application/json' \
    -d "{\"tunnelUrl\":\"$TUNNEL_URL\"}")

# Check if successful
if echo "$RESPONSE" | grep -q "success"; then
    echo "✅ QR code updated successfully!"
    echo ""
    echo "📱 Mobile URL: $TUNNEL_URL/client/pages/mobile.html"
    echo ""
    echo "🎯 The QR code in the hamburger menu now points to the tunnel URL"
    echo "   Participants can scan it from any network!"
    echo ""
else
    echo "❌ Failed to update QR code"
    echo "Response: $RESPONSE"
    exit 1
fi
