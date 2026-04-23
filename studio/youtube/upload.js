// Resumable YouTube video upload.
// Uses googleapis `youtube.videos.insert` with a read-stream body so progress
// can be reported as bytes flow.

const fs = require('fs');
const { google } = require('googleapis');
const { getAuthedClient } = require('./oauth');

async function uploadVideo(opts, onProgress) {
  const auth = getAuthedClient();
  if (!auth) {
    const err = new Error('YouTube 인증이 필요합니다. 먼저 /api/youtube/auth/start 로 연결하세요.');
    err.code = 'NOT_AUTHED';
    throw err;
  }
  const {
    filePath,
    title,
    description = '',
    tags = [],
    privacyStatus = 'private',   // 'private' | 'unlisted' | 'public'
    categoryId = '10',            // 10 = Music
    madeForKids = false,
  } = opts;

  if (!fs.existsSync(filePath)) throw new Error('File not found: ' + filePath);
  const fileSize = fs.statSync(filePath).size;

  const yt = google.youtube({ version: 'v3', auth });

  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: String(title || 'Untitled').slice(0, 100),
        description: String(description || '').slice(0, 5000),
        tags: Array.isArray(tags) ? tags.slice(0, 500) : [],
        categoryId: String(categoryId),
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: !!madeForKids,
      },
    },
    media: { body: fs.createReadStream(filePath) },
  }, {
    onUploadProgress: (evt) => {
      if (onProgress && evt && typeof evt.bytesRead === 'number') {
        onProgress(evt.bytesRead, fileSize);
      }
    },
  });

  return res.data;
}

module.exports = { uploadVideo };
