/* services/supabase-admin.js — the service-role client, in one place.
 *
 * Exists so the sub-app routers can authenticate a caller too. They are mounted
 * by server.js but do not import from it, so before this they had no way to
 * check who was calling — which is how /akashic-frequency/api/analyze ended up
 * forwarding to Anthropic, on our key, for anyone who found the URL.
 *
 * Service role bypasses RLS. Never let a value derived from a request decide
 * which row this client touches without checking the caller owns it first.
 */
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://xdjgumqdwedgzwqturcx.supabase.co';

export const sbAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

/**
 * Resolve the Supabase user behind a request's bearer token.
 *
 * Returns the user id, or null. Deliberately says nothing about entitlement —
 * callers that need Pro check that themselves, so "who is this" and "may they"
 * stay separate questions.
 */
export async function userIdFromRequest(req) {
  if (!sbAdmin) return null;
  const bearer = String((req && req.headers && req.headers.authorization) || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  if (!bearer) return null;
  try {
    const { data, error } = await sbAdmin.auth.getUser(bearer);
    if (error || !data || !data.user) return null;
    return data.user.id;
  } catch (_) {
    return null;
  }
}
