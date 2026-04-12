/* ===== config.js: 앱 전역 상수 ===== */

const SUPABASE_URL = "https://xdjgumqdwedgzwqturcx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkamd1bXFkd2VkZ3p3cXR1cmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MDQzNDUsImV4cCI6MjA3NjA4MDM0NX0.pZcnU1xMaaBBdvytSTVrLPsLU9r_3FPzCPSUeBFUsaU";
const BUCKET = "media";
const MEDIA_BASE = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;
const GITHUB_ASSET_BASE = 'https://paulkpark.github.io/5dio-app/assets';

// Toss Payments (클라이언트 키 — 공개 가능)
const TOSS_CLIENT_KEY = 'test_ck_ex6BJGQOVDKmdQmoEnOn3W4w2zNb';

const FAV_KEY = 'fiveDO_favs';
const USER_ID_KEY = 'fiveDO_user_id';
const PL_KEY = 'fiveDO_playlists';
