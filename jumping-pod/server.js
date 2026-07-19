// Minimal static server for Jumping Pod.
// The game itself is fully static (public/) — deploy the folder anywhere
// (Render static site, GitHub Pages, Netlify...). This server is only a
// convenience for local play and Render web-service deploys.
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
}));

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.listen(PORT, () => {
  console.log(`Jumping Pod → http://localhost:${PORT}`);
});
