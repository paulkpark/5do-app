// Karleido Studio — Puppeteer render worker.
// Spawns headless Chrome, loads /render.html with config, waits for MediaRecorder
// capture to finish (audio's entire duration), then returns WebM path.

const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

/**
 * Run a single render job.
 * @param {string} jobId
 * @param {object} job — mutable job state object ({ status, progress, phase, ... })
 * @param {number} port — where the studio server is listening
 * @returns {Promise<string>} resolved path to captured WebM
 */
async function runCapture(jobId, job, port) {
  const cfg = job.config;
  const [w, h] = cfg.resolution.split('x').map(Number);

  job.phase = 'launching-chrome';

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=IsolateOrigins,site-per-process',
      `--window-size=${w},${h}`,
      // Enable high-res canvas in headless
      '--enable-gpu',
      '--use-gl=swiftshader',
    ],
    defaultViewport: { width: w, height: h, deviceScaleFactor: 1 },
  });

  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log(`[render:${jobId}]`, msg.type(), msg.text()));
    page.on('pageerror', err => console.log(`[render:${jobId}] pageerror:`, err.message));

    // Render page URL with config in base64
    const cfgB64 = Buffer.from(JSON.stringify(cfg)).toString('base64');
    const url = `http://localhost:${port}/render.html?job=${jobId}&cfg=${cfgB64}`;

    job.phase = 'opening-page';
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 });

    // Kick off render
    job.phase = 'recording';
    await page.evaluate(() => window.__renderStart && window.__renderStart());

    // Wait for the page to signal completion (audio ended + MediaRecorder flushed).
    // Audio duration + overhead up to 2 hours.
    await page.waitForFunction(() => window.__renderDone === true, {
      timeout: 2 * 60 * 60 * 1000,
      polling: 500,
    });
  } finally {
    await browser.close();
  }

  const webmPath = path.join(job.jobDir, 'capture.webm');
  if (!fs.existsSync(webmPath) || fs.statSync(webmPath).size === 0) {
    throw new Error('WebM capture produced no data. Check render.html console.');
  }
  return webmPath;
}

module.exports = { runCapture };
