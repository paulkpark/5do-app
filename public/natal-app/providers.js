/* 5DOracle — what the natal module asks its host for.
 *
 * The module is framework-free and takes a provider object (see the contract at
 * the top of natal/ui/app.js). Everything here is host-specific plumbing; the
 * reading logic, the chart, the PDF and the streaming client all live in
 * natal/, shared with the 5DO tab rather than copied.
 */

const SUPABASE_URL = 'https://xdjgumqdwedgzwqturcx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkamd1bXFkd2VkZ3p3cXR1cmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MDQzNDUsImV4cCI6MjA3NjA4MDM0NX0.pZcnU1xMaaBBdvytSTVrLPsLU9r_3FPzCPSUeBFUsaU';

// The same vendored bundle 5DO loads, so the service worker and the HTTP cache
// already hold it. Fetched only when something actually needs a session — the
// chart and the data tables are computed in the browser and need no account.
const SUPABASE_BUNDLE = '/js/vendor/supabase-js-2.116.0.js';

let sbPromise = null;
export function supabase() {
  if (sbPromise) return sbPromise;
  sbPromise = new Promise((resolve, reject) => {
    if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
    const s = document.createElement('script');
    s.src = SUPABASE_BUNDLE;
    s.async = true;
    s.onload = () => (window.supabase && window.supabase.createClient
      ? resolve(window.supabase)
      : reject(new Error('supabase bundle loaded but createClient is missing')));
    s.onerror = () => reject(new Error('could not load the auth bundle'));
    document.head.appendChild(s);
  }).then((lib) => lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }));
  // A failed load must not leave sign-in permanently broken for the session.
  sbPromise.catch(() => { sbPromise = null; });
  return sbPromise;
}

/**
 * Headers for a call the server gates.
 *
 * Asked for per request rather than held: a JWT expires, and a stale one would
 * start failing partway through a sitting. Not signed in throws with a code the
 * UI branches on rather than returning empty headers and letting the server
 * answer 401 — the distinction matters for what the user is shown.
 */
export async function authHeaders() {
  let token = null;
  try {
    const sb = await supabase();
    const { data } = await sb.auth.getSession();
    token = data && data.session ? data.session.access_token : null;
  } catch (_) {
    token = null;
  }
  if (!token) {
    const e = new Error('sign in required');
    e.code = 'not_granted';
    throw e;
  }
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
}

/* ── sign-in ──────────────────────────────────────────────────────────────
   Google and Kakao are already configured on the shared Supabase project, so
   nothing new is provisioned here. What IS needed once, in the Supabase
   dashboard, is 5doracle.com on the redirect allow-list — without it the
   provider bounces the user back to an error page and the cause is invisible
   from this side. */
export const AUTH_PROVIDERS = ['google', 'kakao'];

export async function signIn(provider) {
  const sb = await supabase();
  const { error } = await sb.auth.signInWithOAuth({
    provider,
    // Back to wherever they were, on the canonical host. location.origin rather
    // than a literal: the non-canonical hosts 301 to it, and a redirect target
    // that moves is one the provider will reject.
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
}

export async function signOut() {
  const sb = await supabase();
  await sb.auth.signOut();
}

/** Fires on sign-in, sign-out and token refresh. Returns an unsubscribe. */
export async function onAuthChange(fn) {
  const sb = await supabase();
  const { data } = sb.auth.onAuthStateChange((_event, session) => fn(session ? session.user : null));
  return () => { try { data.subscription.unsubscribe(); } catch (_) {} };
}

/* ── what this user has bought ────────────────────────────────────────────
   The reading UI asks "is the chart on screen paid for?" while it renders, so
   the answer has to be in memory already. The owned set is fetched once per
   sign-in and refreshed after a purchase. */
let owned = new Set();

export function owns(chartKey, lang) {
  return owned.has(chartKey + '|' + lang);
}

/** Reload the owned set. Returns it. Empty and non-throwing when signed out. */
export async function refreshOwned() {
  try {
    const res = await fetch('/api/natal/entitlements', { headers: await authHeaders() });
    if (!res.ok) { owned = new Set(); return owned; }
    const data = await res.json();
    owned = new Set(Array.isArray(data.owned) ? data.owned : []);
  } catch (_) {
    // Signed out, or the network is down. Either way: nothing is unlocked, and
    // the server is the real gate — this set only decides what the UI offers.
    owned = new Set();
  }
  return owned;
}

/** The signed-in user, or null. Never throws; the free tier works signed out. */
export async function currentUser() {
  try {
    const sb = await supabase();
    const { data } = await sb.auth.getUser();
    return (data && data.user) || null;
  } catch (_) {
    return null;
  }
}

/** Save a reading as a PDF. `brand` is what goes in the page footer. */
export async function exportPdf(doc) {
  const NatalPdf = await import('/lib/natal/pdf.js');
  return NatalPdf.exportReadingPdf(doc, { brand: '5DOracle' });
}

/** Offer arbitrary text as a file — the module's plain-text fallback export. */
export function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next frame: doing it synchronously can cancel the download
  // in some browsers before it has read the blob.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/**
 * The whole provider object.
 *
 * `geocode` is deliberately absent. 5DO resolves place names through the public
 * OpenStreetMap Nominatim instance, whose usage policy rules out a paid product
 * leaning on it, so until a licensed geocoder is chosen the module falls back to
 * its built-in place list plus manual coordinates — which is accurate, just not
 * a search box.
 */
export function createProvider({ lang, entitlement, onLangChange }) {
  return {
    lang,
    entitlement,
    onLangChange,
    sample: (prompt, opts) => readingClient().then((c) => c.sample(prompt, opts)),
    loadCached: (chartKey, l) => readingClient().then((c) => c.loadCached(chartKey, l)),
    exportPdf,
    download,
  };
}

// Imported on first use, so a sitting that only looks at the chart never fetches
// it. A failed import clears the promise rather than leaving every later attempt
// rejecting against a module that was merely unreachable once.
let clientPromise = null;
function readingClient() {
  if (!clientPromise) {
    clientPromise = import('/lib/natal/http.js').then((m) => m.createReadingClient({ authHeaders }));
    clientPromise.catch(() => { clientPromise = null; });
  }
  return clientPromise;
}
