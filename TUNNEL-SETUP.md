# 🌐 Cloudflare Tunnel Setup for Diploma Presentation

## Why Use Cloudflare Tunnel?

✅ **Unlimited devices** - No device limits  
✅ **Any network** - Participants use their own WiFi/cellular data  
✅ **Free** - No cost, no account required  
✅ **Reliable** - Better uptime than free ngrok  
✅ **HTTPS + WebSocket** - Everything works securely  

---

## 🚀 Quick Start (Presentation Day)

### Option 1: All-in-One Script (Recommended)

```bash
./start-presentation.sh
```

This will:
1. Start the Node.js server
2. Start the Cloudflare tunnel
3. Display the public URL

### Option 2: Manual Steps

**Step 1: Start the server**
```bash
cd server
node server.js
```

**Step 2: Start the tunnel (in a new terminal)**
```bash
./start-tunnel.sh
```

---

## 📱 Getting the Mobile QR Code

Once the tunnel starts, you'll see a URL like:
```
https://random-name.trycloudflare.com
```

### Generate QR Code:

```bash
cd server
node tunnel-qr.js https://your-actual-url.trycloudflare.com
```

This will:
- Display QR code in terminal
- Save `tunnel-qr-code.png` file (for printing/displaying)

---

## 🎯 Presentation Day Workflow

### Before Participants Arrive:

1. **Start everything:**
   ```bash
   ./start-presentation.sh
   ```

2. **Copy the tunnel URL** (e.g., `https://abc123.trycloudflare.com`)

3. **Generate QR code:**
   ```bash
   cd server
   node tunnel-qr.js https://abc123.trycloudflare.com
   ```

4. **Display QR code:**
   - Open `tunnel-qr-code.png` on screen, OR
   - Print the QR code, OR
   - Show the terminal QR code via projector

5. **Open main display:**
   ```
   http://localhost:3000/client/pages/index.html
   ```

### When Participants Arrive:

1. **They scan the QR code** with their phone
2. **Mobile controller opens** automatically
3. **They can submit posts** from any network
4. **All posts appear** on the main display in real-time

---

## 🔧 Troubleshooting

### Tunnel URL Changes Each Time

**Problem:** The URL is different every time you restart the tunnel.

**Solution:** 
- Generate a new QR code each time
- OR create a free Cloudflare account for a permanent URL

### WebSocket Connection Issues

**Problem:** Mobile devices can't connect to WebSocket.

**Solution:**
- Cloudflare Tunnel automatically handles WebSocket
- Make sure you're using the HTTPS URL (not HTTP)
- The mobile controller will auto-detect the correct WebSocket URL

### Port Already in Use

**Problem:** Server won't start because ports are in use.

**Solution:**
```bash
# Kill existing processes
lsof -ti:8080 | xargs kill -9
lsof -ti:3000 | xargs kill -9

# Restart
./start-presentation.sh
```

---

## 📊 Device Capacity

With Cloudflare Tunnel:
- ✅ **Unlimited mobile devices** can connect
- ✅ **Any WiFi network** or cellular data works
- ✅ **No hotspot required**
- ✅ **No network switching** for participants

---

## 🎓 For Your Diploma Defense

### Setup Checklist:

- [ ] Install cloudflared (`brew install cloudflare/cloudflare/cloudflared`)
- [ ] Test `./start-presentation.sh` before presentation day
- [ ] Generate and save QR code PNG
- [ ] Test with multiple devices on different networks
- [ ] Have backup: Print QR code on paper
- [ ] Know the tunnel URL format: `https://xxx.trycloudflare.com/client/pages/mobile.html`

### During Presentation:

1. Start tunnel 5-10 minutes early
2. Display QR code prominently
3. Announce: "Scan this QR code to participate"
4. Monitor main display for incoming posts
5. Keep terminal visible to see connection logs

---

## 🔐 Security Note

- Tunnel URLs are **public** but **temporary**
- URLs change each restart (unless you create an account)
- No sensitive data is exposed
- Perfect for temporary presentations

---

## 💡 Tips

- **Test before presentation day** with friends on different networks
- **Keep the terminal visible** to see the tunnel URL
- **Save the QR code PNG** as backup
- **The URL changes** each time you restart - regenerate QR code
- **Mobile controller auto-connects** to the correct WebSocket

---

## 📞 Quick Reference

**Start everything:**
```bash
./start-presentation.sh
```

**Generate QR code:**
```bash
cd server
node tunnel-qr.js https://YOUR-URL.trycloudflare.com
```

**Main display (local):**
```
http://localhost:3000/client/pages/index.html
```

**Mobile controller (public):**
```
https://YOUR-URL.trycloudflare.com/client/pages/mobile.html
```
