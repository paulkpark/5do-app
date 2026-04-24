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

  // Chrome 146 + macOS + headless has broken WebGL even with
  // `--enable-unsafe-swiftshader`. Pin to Chrome 131 (kept in the puppeteer
  // cache) which supports SwiftShader WebGL out of the box.
  // If the 131 binary isn't present, fall back to the default bundled Chrome
  // and hope the flags are enough.
  const CHROME_131 = '/Users/paulpark/.cache/puppeteer/chrome/mac_arm-131.0.6778.204/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  const execOverride = fs.existsSync(CHROME_131) ? { executablePath: CHROME_131 } : {};

  const browser = await puppeteer.launch({
    headless: 'new',
    ...execOverride,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=IsolateOrigins,site-per-process',
      `--window-size=${w},${h}`,
      // WebGL in headless: force SwiftShader and ignore the GPU blocklist.
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--use-gl=angle',
      '--enable-webgl',
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
