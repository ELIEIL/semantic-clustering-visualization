# NewsAPI Setup Guide

## Quick Start

### 1. Get Your API Key

1. Go to https://newsapi.org/register
2. Sign up for a free account (no credit card required)
3. Copy your API key from the dashboard

### 2. Configure the Application

Create a `.env` file in the root directory:

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` and add your API key:

```env
NEWSAPI_KEY=your_actual_api_key_here
NEWS_CATEGORY=general
NEWS_COUNTRY=us
```

### 3. Install dotenv Package

```bash
npm install dotenv
```

### 4. Update server.js

Add this line at the very top of `server/server.js`:

```javascript
require('dotenv').config();
```

### 5. Restart the Server

```bash
node server/server.js
```

---

## How It Works

### Headline Fetching

- **Automatic**: Fetches a headline when server starts
- **Cached**: Headlines are cached for 1 hour to save API calls
- **Random**: Picks a random headline from top 10 results
- **Fallback**: Uses default text if API fails

### Categories Available

- `general` - General news (default)
- `business` - Business news
- `entertainment` - Entertainment
- `health` - Health news
- `science` - Science news
- `sports` - Sports news
- `technology` - Technology news

### Countries Supported

- `us` - United States (default)
- `gb` - United Kingdom
- `ca` - Canada
- `au` - Australia
- And 50+ more...

---

## Features

### Main Display
- Headline appears in the top bar inside hamburger menu
- Updates automatically when server fetches new headline

### Mobile Interface
- Headline displayed prominently at top
- "What do you think about:" prompt
- Encourages responses to the headline

### Refresh Headline
You can manually refresh the headline by sending a WebSocket message:

```javascript
ws.send(JSON.stringify({ type: 'refresh_headline' }));
```

---

## API Limits

**Free Tier:**
- 100 requests per day
- 1,000 total results per request
- Perfect for development and testing

**Caching:**
- Headlines cached for 1 hour
- Reduces API calls significantly
- Can manually clear cache if needed

---

## Troubleshooting

### "Invalid API key"
- Check your `.env` file has the correct key
- Make sure you copied it correctly from NewsAPI dashboard
- Verify the file is named `.env` (not `.env.txt`)

### No headline appears
- Check server console for errors
- Verify internet connection
- Check if you've exceeded daily limit (100 requests)

### Default headline shows
- API key might be invalid
- Network error occurred
- Falls back to: "What are your thoughts on current events?"

---

## Example Headlines

The system will fetch real headlines like:
- "Biden announces new climate initiative"
- "Tech companies face new privacy regulations"
- "Scientists discover breakthrough in cancer research"
- "Major city implements new transportation plan"

These headlines naturally invite discussion and diverse opinions, perfect for your semantic clustering visualization!
