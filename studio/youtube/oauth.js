// YouTube OAuth helper — handles auth URL, token exchange, and auto-refresh.
// Tokens are persisted to studio/tokens.json (gitignored).

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const TOKENS_PATH = path.join(__dirname, '..', 'tokens.json');
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

function createClient() {
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.OAUTH_REDIRECT_URI
    || 'http://localhost:10001/api/youtube/auth/callback';
  if (!clientId || !clientSecret) {
    const err = new Error('OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET not configured. Copy studio/.env.example → studio/.env and fill it in.');
    err.code = 'NO_OAUTH_CONFIG';
    throw err;
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthUrl() {
  const oauth2 = createClient();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',        // force a refresh token on re-auth
    scope: SCOPES,
  });
}

async function exchangeCodeForTokens(code) {
  const oauth2 = createClient();
  const { tokens } = await oauth2.getToken(code);
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
  return tokens;
}

function loadTokens() {
  if (!fs.existsSync(TOKENS_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8')); }
  catch (_) { return null; }
}

function clearTokens() {
  try { fs.unlinkSync(TOKENS_PATH); } catch (_) {}
}

function getAuthedClient() {
  const tokens = loadTokens();
  if (!tokens) return null;
  const oauth2 = createClient();
  oauth2.setCredentials(tokens);
  // Persist refreshed tokens automatically
  oauth2.on('tokens', (newTokens) => {
    try {
      const prev = loadTokens() || {};
      const merged = { ...prev, ...newTokens };
      fs.writeFileSync(TOKENS_PATH, JSON.stringify(merged, null, 2));
    } catch (_) {}
  });
  return oauth2;
}

async function getChannelInfo() {
  const auth = getAuthedClient();
  if (!auth) return null;
  const yt = google.youtube({ version: 'v3', auth });
  const res = await yt.channels.list({ part: ['snippet'], mine: true });
  const item = res.data.items && res.data.items[0];
  if (!item) return null;
  return {
    id: item.id,
    title: item.snippet.title,
    thumbnail: (item.snippet.thumbnails && item.snippet.thumbnails.default && item.snippet.thumbnails.default.url) || null,
  };
}

module.exports = { getAuthUrl, exchangeCodeForTokens, loadTokens, clearTokens, getAuthedClient, getChannelInfo };
