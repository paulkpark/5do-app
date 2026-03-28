# Akashic Frequency - 5DO PEMF Resonance Generator

## Project Structure
- `server.js` — Express server with Claude API proxy at `/api/analyze`
- `public/index.html` — Full React SPA (CDN-loaded, no build step)
- `render.yaml` — Render.com deployment blueprint

## Deployment to Render.com
1. Push to GitHub repo
2. In Render dashboard, create new Web Service pointing to this directory
3. Set environment variable: `ANTHROPIC_API_KEY`
4. Build command: `npm install`
5. Start command: `node server.js`

## Local Development
```bash
cp .env.example .env
# Edit .env with your API key
npm install
npm start
# Open http://localhost:3000
```

## API Endpoint
POST `/api/analyze` — Proxies to Claude API (key stored server-side)
GET `/api/health` — Health check
