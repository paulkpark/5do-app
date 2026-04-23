// Karleido Studio — ffmpeg mux. Converts captured WebM into a YouTube-ready MP4.
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

/**
 * Convert WebM → MP4 with libx264 + AAC.
 * The WebM already contains audio (muxed by MediaRecorder), so we re-encode
 * both streams to YouTube-preferred codecs/containers.
 */
function muxToMp4(webmPath, outPath, { crf = 18, preset = 'medium', audioBitrate = '320k' } = {}, onProgress) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', webmPath,
      '-c:v', 'libx264',
      '-preset', preset,
      '-crf', String(crf),
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', audioBitrate,
      '-ar', '48000',
      '-progress', 'pipe:2',
      outPath,
    ];
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', d => {
      const s = d.toString();
      stderr += s;
      // ffmpeg with -progress pipe:2 emits key=value lines
      if (onProgress) {
        const m = s.match(/out_time_ms=(\d+)/);
        if (m) onProgress(parseInt(m[1], 10) / 1000); // ms → ms
      }
    });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve(outPath);
      else reject(new Error(`ffmpeg exit ${code}\n${stderr.slice(-800)}`));
    });
  });
}

module.exports = { muxToMp4 };
