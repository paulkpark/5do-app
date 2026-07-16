import express from 'express';
import akashicFrequency from "./akashic-frequency/api.js";
import ce5Protocol from "./ce5-protocol/api.js";
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { Resend } from 'resend';
import { getCosmicState, getKstDateString } from './services/cosmic.js';
import { getCosmicLive } from './services/cosmic-live.js';
import { computeProPrice, customerKeyFor } from './services/pricing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Supabase admin client (service role — server-side only)
const SUPABASE_URL = 'https://xdjgumqdwedgzwqturcx.supabase.co';
const sbAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// ─── Stripe Webhook (raw body — must be before express.json()) ───
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(501).json({ error: 'not configured' });
  try {
    const stripe = (await import('stripe')).default(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

    const sub = event.data.object;
    if (['checkout.session.completed', 'invoice.paid', 'customer.subscription.updated'].includes(event.type)) {
      const customerId = sub.customer;
      if (sbAdmin && customerId) {
        const tier = (sub.status === 'active' || sub.status === 'trialing') ? 'pro' : 'free';

        // Try to find user by stripe_customer_id first
        let { data: profiles } = await sbAdmin.from('profiles').select('id').eq('stripe_customer_id', customerId);

        // On first checkout — link via metadata user_id or customer email
        if ((!profiles || profiles.length === 0) && event.type === 'checkout.session.completed') {
          const userId = sub.metadata?.user_id;
          const email = sub.customer_details?.email || sub.customer_email;
          if (userId) {
            // Link stripe_customer_id to existing profile
            await sbAdmin.from('profiles').update({ stripe_customer_id: customerId, tier_source: 'stripe' }).eq('id', userId);
            profiles = [{ id: userId }];
          } else if (email) {
            const { data: emailProfiles } = await sbAdmin.from('profiles').select('id').eq('email', email);
            if (emailProfiles?.[0]) {
              await sbAdmin.from('profiles').update({ stripe_customer_id: customerId, tier_source: 'stripe' }).eq('id', emailProfiles[0].id);
              profiles = emailProfiles;
            }
          }
        }

        if (profiles?.[0]) {
          // Don't downgrade lifetime users via webhook
          const { data: current } = await sbAdmin.from('profiles').select('subscription_status').eq('id', profiles[0].id).single();
          if (current?.subscription_status === 'lifetime') {
            // Lifetime user — don't modify tier
          } else {
            await sbAdmin.from('profiles').update({
              tier, subscription_status: sub.status || 'active',
              subscription_id: sub.id || sub.subscription,
              current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
            }).eq('id', profiles[0].id);
          }
          await sbAdmin.from('subscription_events').insert({
            user_id: profiles[0].id, event_type: event.type, provider: 'stripe', payload: sub,
          });
        }
      }
    }
    if (event.type === 'customer.subscription.deleted') {
      const customerId = sub.customer;
      if (sbAdmin && customerId) {
        const { data: profiles } = await sbAdmin.from('profiles').select('id').eq('stripe_customer_id', customerId);
        if (profiles?.[0]) {
          await sbAdmin.from('profiles').update({ tier: 'free', subscription_status: 'canceled' }).eq('id', profiles[0].id);
          await sbAdmin.from('subscription_events').insert({
            user_id: profiles[0].id, event_type: event.type, provider: 'stripe', payload: sub,
          });
        }
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error('[Stripe webhook]', e.message);
    res.status(400).json({ error: e.message });
  }
});

app.use(compression());
app.use(express.json());
app.use("/akashic-frequency", akashicFrequency);
app.use("/ce5-protocol", ce5Protocol);

// ─── Subscription API Routes ───

// Create Stripe Checkout Session
app.post('/api/subscription/checkout', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) return res.status(501).json({ error: 'Stripe not configured' });
  try {
    const stripe = (await import('stripe')).default(process.env.STRIPE_SECRET_KEY);
    const { interval, email, user_id } = req.body; // interval: 'monthly' | 'yearly'
    const priceId = interval === 'yearly' ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;
    if (!priceId) return res.status(400).json({ error: 'Price not configured' });

    const sessionParams = {
      mode: 'subscription',
      // Let Stripe surface every method enabled in the dashboard (Card,
      // Apple Pay, Google Pay, PayPal) for the buyer's region instead of
      // hard-coding card-only.
      automatic_payment_methods: { enabled: true },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.headers.origin || 'https://5do.app'}/5do.html?sub=success`,
      cancel_url: `${req.headers.origin || 'https://5do.app'}/5do.html?sub=cancel`,
      metadata: { user_id: user_id || '' },
    };
    // Pre-fill email and link to existing Stripe customer if possible
    if (email) sessionParams.customer_email = email;
    // If user already has a stripe_customer_id, use it
    if (sbAdmin && user_id) {
      const { data: profile } = await sbAdmin.from('profiles').select('stripe_customer_id').eq('id', user_id).single();
      if (profile?.stripe_customer_id) {
        delete sessionParams.customer_email; // can't use both customer and customer_email
        sessionParams.customer = profile.stripe_customer_id;
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (e) {
    console.error('[Checkout]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Stripe Customer Portal — manage/cancel subscription
app.post('/api/subscription/portal', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) return res.status(501).json({ error: 'Stripe not configured' });
  try {
    const stripe = (await import('stripe')).default(process.env.STRIPE_SECRET_KEY);
    const { user_id } = req.body;
    if (!user_id || !sbAdmin) return res.status(400).json({ error: 'User not authenticated' });

    const { data: profile } = await sbAdmin.from('profiles').select('stripe_customer_id').eq('id', user_id).single();
    if (!profile?.stripe_customer_id) return res.status(400).json({ error: 'No Stripe customer found. Please subscribe first.' });

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${req.headers.origin || 'https://5do.app'}/5do.html`,
    });
    res.json({ url: portalSession.url });
  } catch (e) {
    console.error('[Portal]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Grant QTX lifetime Pro membership (admin endpoint)
app.post('/api/subscription/grant-lifetime', async (req, res) => {
  if (!sbAdmin) return res.status(501).json({ error: 'DB not configured' });
  // Simple admin auth via env key
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_GRANT_KEY) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    const { data: profiles } = await sbAdmin.from('profiles').select('id').eq('email', email);
    if (!profiles?.[0]) return res.status(404).json({ error: 'User not found' });
    await sbAdmin.from('profiles').update({
      tier: 'pro', subscription_status: 'lifetime', tier_source: 'admin',
      current_period_end: null, // no expiry
    }).eq('id', profiles[0].id);
    await sbAdmin.from('subscription_events').insert({
      user_id: profiles[0].id, event_type: 'lifetime_granted', provider: 'admin',
      payload: { reason: 'QTX customer', granted_by: 'admin' },
    });
    res.json({ ok: true, message: `Lifetime Pro granted to ${email}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Daily Resonance Endpoints ───

// Today's cosmic snapshot (global, cached 1/day)
app.get('/api/daily/cosmic', async (req, res) => {
  try {
    const cosmic = await getCosmicState();
    res.json(cosmic);
  } catch (e) {
    console.error('[Daily] cosmic error:', e.message, e.stack);
    res.status(500).json({ error: e.message });
  }
});

// ─── Cosmic Monitor (live, server-cached 60s) ───
app.get('/api/cosmic/live', async (req, res) => {
  try {
    const data = await getCosmicLive();
    res.set('Cache-Control', 'public, max-age=30'); // browser can cache 30s too
    res.json(data);
  } catch (e) {
    console.error('[CosmicLive] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Biorhythm helper (same formula as client)
function computeBiorhythm(birthYear, birthMonth, birthDay, nowDate) {
  const birth = new Date(birthYear, birthMonth - 1, birthDay);
  const days = Math.floor((nowDate - birth) / 86400000);
  return {
    physical: Math.round(Math.sin(2 * Math.PI * days / 23) * 100),
    emotional: Math.round(Math.sin(2 * Math.PI * days / 28) * 100),
    intellectual: Math.round(Math.sin(2 * Math.PI * days / 33) * 100),
  };
}

// Generate daily life guidance via Claude (max 3 regens per day)
app.post('/api/daily/guide/generate', async (req, res) => {
  if (!sbAdmin) return res.status(501).json({ error: 'DB not configured' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(501).json({ error: 'Claude not configured' });

  const { user_id, regenerate, blueprint: clientBlueprint } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  const today = getKstDateString();

  try {
    // 1. Check existing guide
    const { data: existing } = await sbAdmin.from('daily_guides')
      .select('*').eq('user_id', user_id).eq('guide_date', today).maybeSingle();

    if (existing?.ai_guide && !regenerate) {
      return res.json({ ok: true, guide: existing, cached: true });
    }
    if (existing && regenerate && (existing.ai_regen_count || 0) >= 3) {
      return res.status(429).json({ error: 'REGEN_LIMIT', message: '하루 최대 3회까지 재생성 가능합니다', guide: existing });
    }

    // 2. Fetch blueprint — or auto-save from client payload if missing
    let { data: blueprint } = await sbAdmin.from('soul_blueprints')
      .select('*').eq('user_id', user_id).maybeSingle();

    if (!blueprint && clientBlueprint?.birth_year) {
      console.log('[Daily] auto-saving blueprint for user=', user_id);
      await sbAdmin.from('soul_blueprints').upsert({
        user_id,
        birth_year: clientBlueprint.birth_year,
        birth_month: clientBlueprint.birth_month,
        birth_day: clientBlueprint.birth_day,
        birth_time: clientBlueprint.birth_time || null,
        birth_place: clientBlueprint.birth_place || null,
        calendar_type: clientBlueprint.calendar_type || 'solar',
        name: clientBlueprint.name || null,
        gender: clientBlueprint.gender || null,
        blood_type: clientBlueprint.blood_type || null,
        mbti: clientBlueprint.mbti || null,
        intention: clientBlueprint.intention || null,
        zodiac: clientBlueprint.zodiac || null,
        life_path: clientBlueprint.life_path || null,
        saju: clientBlueprint.saju || null,
        starseed: clientBlueprint.starseed || null,
        personal_freq: clientBlueprint.personal_freq || null,
        active_chakras: clientBlueprint.active_chakras || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      const { data: saved } = await sbAdmin.from('soul_blueprints').select('*').eq('user_id', user_id).maybeSingle();
      blueprint = saved;
    }

    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found. Complete Soul Code analysis first.' });

    // 3. Compute biorhythm + fetch cosmic
    const bio = computeBiorhythm(blueprint.birth_year, blueprint.birth_month, blueprint.birth_day, new Date());
    const cosmic = await getCosmicState();

    // 4. Build Claude prompt
    const signKo = (s) => s?.ko || s?.en || '';
    const signEn = (s) => s?.en || s?.ko || '';
    const retros = (cosmic.events || []).filter(e => e.type === 'retrograde').map(e => `${e.planet}`).join(', ') || 'none';
    const eclipse = (cosmic.events || []).some(e => e.type === 'eclipse') ? 'yes (within ±2 days)' : 'no';
    const deficient = (blueprint.saju?.deficient || []).join(', ') || 'balanced';
    const excess = (blueprint.saju?.excess || []).join(', ') || 'balanced';
    const topStar = blueprint.starseed?.[0];
    const starName = topStar?.name?.en || topStar?.id || 'unknown';
    const bioState = (v) => Math.abs(v) < 5 ? 'critical (near zero-crossing)' : v > 50 ? 'peak' : v > 0 ? 'rising' : v > -50 ? 'falling' : 'low';

    const systemPrompt = `You are a wise cosmic companion for 5DO sound healing platform.
You provide daily life guidance at the intersection of the user's eternal blueprint (saju, zodiac, starseed), today's cosmic weather (moon, planets, geomagnetic field), and their current biorhythm cycle.

ROLE:
- Offer concrete, actionable invitations for today
- Connect cosmic conditions to practical daily choices
- Frame everything as gentle wisdom, never as prediction

STRICT RULES:
- NEVER predict outcomes ("You will meet..." or "Lucky number...")
- NEVER use fortune-telling or horoscope language
- USE "살펴보세요" / "consider" / "notice" / "explore" style
- Each section: 2-3 sentences only (concise, not flowery)
- Tone: warm sage speaking softly

OUTPUT: Strict JSON only (no markdown, no preamble, no trailing text):
{
  "morning":   {"ko": "…", "en": "…"},
  "afternoon": {"ko": "…", "en": "…"},
  "evening":   {"ko": "…", "en": "…"},
  "mantra":    {"ko": "…", "en": "…"}
}`;

    const userPrompt = `Today (KST): ${today}

COSMIC:
- Sun in ${signEn(cosmic.sun?.sign)}, Moon in ${signEn(cosmic.moon?.sign)} (${cosmic.moon?.name_en}, ${cosmic.moon?.illumination}% illum)
- Retrograde: ${retros}
- Eclipse season: ${eclipse}
- Geomagnetic Kp: ${cosmic.kp ?? 'N/A'}

USER BLUEPRINT:
- Saju day master: ${blueprint.saju?.dayMasterElement || 'unknown'} | Deficient: ${deficient} | Excess: ${excess}
- Zodiac: ${signEn(blueprint.zodiac?.name)} (${blueprint.zodiac?.element?.en || ''})
- Starseed: ${starName}
- MBTI: ${blueprint.mbti || 'unknown'} | Blood: ${blueprint.blood_type || 'unknown'}

TODAY'S BIORHYTHM:
- Physical: ${bio.physical}% (${bioState(bio.physical)})
- Emotional: ${bio.emotional}% (${bioState(bio.emotional)})
- Intellectual: ${bio.intellectual}% (${bioState(bio.intellectual)})

Return the JSON guidance for today. Both Korean and English in each field.`;

    // 5. Call Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error('Claude API error: ' + errText.slice(0, 200));
    }
    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || '';

    // 6. Parse JSON (tolerant)
    let aiGuide = null;
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      aiGuide = JSON.parse(match ? match[0] : rawText);
    } catch (e) {
      throw new Error('AI output parse failed: ' + rawText.slice(0, 200));
    }

    // 7. Upsert
    const newCount = (existing?.ai_regen_count || 0) + 1;
    const { data: saved, error: upErr } = await sbAdmin.from('daily_guides').upsert({
      user_id,
      guide_date: today,
      ai_guide: aiGuide,
      ai_lang: 'both',
      ai_regen_count: newCount,
      biorhythm: bio,
      cosmic_snapshot: cosmic,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,guide_date' }).select().maybeSingle();
    if (upErr) throw upErr;

    console.log(`[Daily] Guide ${regenerate ? 're' : ''}generated for user=${user_id} count=${newCount}`);
    res.json({ ok: true, guide: saved, cached: false });
  } catch (e) {
    console.error('[Daily] guide generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// List audio tracks in a folder (server-side Supabase storage list)
app.get('/api/daily/tracks', async (req, res) => {
  if (!sbAdmin) return res.status(501).json({ error: 'DB not configured' });
  const folder = (req.query.folder || '').toString();
  if (!folder) return res.status(400).json({ error: 'folder required' });
  try {
    const { data, error } = await sbAdmin.storage.from('media').list(folder, { limit: 200 });
    if (error) throw error;
    const audio = /\.(mp3|m4a|aac|wav|flac|ogg)$/i;
    const tracks = (data || [])
      .filter(o => o.name && audio.test(o.name) && !/_qtx\./i.test(o.name))
      .map(o => o.name);
    res.json({ folder, tracks });
  } catch (e) {
    console.error('[Daily] tracks list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Upsert soul blueprint (called after Soul Code analysis completes)
app.post('/api/daily/blueprint', async (req, res) => {
  if (!sbAdmin) return res.status(501).json({ error: 'DB not configured' });
  const { user_id, ...blueprint } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  try {
    const { error } = await sbAdmin.from('soul_blueprints').upsert({
      user_id,
      birth_year: blueprint.birth_year,
      birth_month: blueprint.birth_month,
      birth_day: blueprint.birth_day,
      birth_time: blueprint.birth_time || null,
      birth_place: blueprint.birth_place || null,
      calendar_type: blueprint.calendar_type || 'solar',
      name: blueprint.name || null,
      gender: blueprint.gender || null,
      blood_type: blueprint.blood_type || null,
      mbti: blueprint.mbti || null,
      intention: blueprint.intention || null,
      zodiac: blueprint.zodiac || null,
      life_path: blueprint.life_path || null,
      saju: blueprint.saju || null,
      starseed: blueprint.starseed || null,
      personal_freq: blueprint.personal_freq || null,
      active_chakras: blueprint.active_chakras || null,
      ai_text_ko: blueprint.ai_text_ko || null,
      ai_text_en: blueprint.ai_text_en || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[Daily] blueprint upsert error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Fetch soul blueprint for a user
app.get('/api/daily/blueprint/:user_id', async (req, res) => {
  if (!sbAdmin) return res.status(501).json({ error: 'DB not configured' });
  try {
    const { data } = await sbAdmin.from('soul_blueprints').select('*').eq('user_id', req.params.user_id).maybeSingle();
    res.json({ blueprint: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fetch or create today's daily guide
app.get('/api/daily/guide/:user_id', async (req, res) => {
  if (!sbAdmin) return res.status(501).json({ error: 'DB not configured' });
  const today = getKstDateString();
  try {
    const { data } = await sbAdmin.from('daily_guides')
      .select('*').eq('user_id', req.params.user_id).eq('guide_date', today).maybeSingle();
    res.json({ guide: data, date: today });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin API Endpoints ───

function checkAdmin(req, res) {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_GRANT_KEY) { res.status(403).json({ error: 'Unauthorized' }); return false; }
  if (!sbAdmin) { res.status(501).json({ error: 'DB not configured' }); return false; }
  return true;
}

// Admin stats
app.get('/api/admin/stats', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const { count: totalUsers } = await sbAdmin.from('profiles').select('*', { count: 'exact', head: true });
    const { count: proUsers } = await sbAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('tier', 'pro');
    const { count: lifetimeUsers } = await sbAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('subscription_status', 'lifetime');
    const { count: couponsTotal } = await sbAdmin.from('coupon_codes').select('*', { count: 'exact', head: true });
    const { count: couponsUsed } = await sbAdmin.from('coupon_codes').select('*', { count: 'exact', head: true }).not('used_by', 'is', null);
    res.json({ totalUsers, proUsers, lifetimeUsers, couponsTotal, couponsUsed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Announcement CRUD
app.get('/api/admin/announcement', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const { data } = await sbAdmin.from('feature_flags').select('metadata').eq('key', 'announcement').single();
    res.json({ metadata: data?.metadata || null });
  } catch (e) { res.json({ metadata: null }); }
});

app.put('/api/admin/announcement', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { text_ko, text_en, url } = req.body;
  try {
    await sbAdmin.from('feature_flags').upsert({
      key: 'announcement', enabled: true,
      metadata: { text_ko, text_en, url },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/announcement', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    await sbAdmin.from('feature_flags').delete().eq('key', 'announcement');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Coupon list (admin)
app.get('/api/admin/coupons', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const { data } = await sbAdmin.from('coupon_codes').select('*').order('created_at', { ascending: false }).limit(200);
    res.json({ coupons: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Email Endpoints (Resend) ───

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const EMAIL_FROM = process.env.EMAIL_FROM || '5DO <noreply@5do.app>';

// Send bulk email (admin)
app.post('/api/admin/send-email', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  if (!resend) return res.status(501).json({ error: 'Resend not configured' });

  const { target, subject, body_html } = req.body;
  if (!subject || !body_html) return res.status(400).json({ error: 'subject and body_html required' });

  try {
    // Get target emails
    let query = sbAdmin.from('profiles').select('email, display_name, tier');
    if (target === 'free') query = query.eq('tier', 'free');
    else if (target === 'pro') query = query.eq('tier', 'pro');
    // else 'all'

    const { data: users, error } = await query;
    if (error) throw error;

    const emails = (users || []).filter(u => u.email);
    if (!emails.length) return res.status(400).json({ error: 'No users found' });

    // Send in batches of 50
    let sent = 0, failed = 0;
    for (let i = 0; i < emails.length; i += 50) {
      const batch = emails.slice(i, i + 50);
      const results = await Promise.allSettled(
        batch.map(u => resend.emails.send({
          from: EMAIL_FROM,
          to: u.email,
          subject,
          html: body_html.replace(/\{\{name\}\}/g, u.display_name || ''),
        }))
      );
      results.forEach(r => r.status === 'fulfilled' ? sent++ : failed++);
    }

    // Log event
    await sbAdmin.from('subscription_events').insert({
      user_id: null, event_type: 'bulk_email_sent', provider: 'resend',
      payload: { target, subject, sent, failed, total: emails.length },
    });

    console.log(`[Email] Bulk sent: ${sent} ok, ${failed} failed (target: ${target})`);
    res.json({ ok: true, sent, failed, total: emails.length });
  } catch (e) {
    console.error('[Email] Send error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Send welcome email (server-side, called after signup)
app.post('/api/email/welcome', async (req, res) => {
  if (!resend || !sbAdmin) return res.status(501).json({ error: 'not configured' });
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  try {
    const { data: profile } = await sbAdmin.from('profiles').select('email, display_name').eq('id', user_id).single();
    if (!profile?.email) return res.status(404).json({ error: 'User not found' });

    await resend.emails.send({
      from: EMAIL_FROM,
      to: profile.email,
      subject: '5DO에 오신 것을 환영합니다! 🎵',
      html: `
        <div style="max-width:520px;margin:0 auto;font-family:-apple-system,sans-serif;color:#333;padding:20px">
          <h1 style="color:#7C5CFC;font-size:24px">5DO에 오신 것을 환영합니다!</h1>
          <p>안녕하세요 ${profile.display_name || ''}님,</p>
          <p>5DO는 치유 주파수, 가이드 명상, AI 영혼 분석을 제공하는 사운드 힐링 플랫폼입니다.</p>
          <h3 style="color:#3ECFCF">무료로 이용 가능한 기능:</h3>
          <ul>
            <li>4개 카테고리 치유 주파수 (Divine Tunes, 차크라, 크리스탈, 화이트노이즈)</li>
            <li>가이드 명상 (심호흡, 바디스캔, 차크라 활성화, CE-5)</li>
            <li>주파수 생성기 기본 모드</li>
          </ul>
          <h3 style="color:#7C5CFC">Pro로 업그레이드하면:</h3>
          <ul>
            <li>전체 라이브러리 150+ 트랙</li>
            <li>소울 코드 AI 영혼 분석</li>
            <li>생성기 풀 기능 (바이노럴, 하모닉스)</li>
          </ul>
          <a href="https://5do.app" style="display:inline-block;padding:12px 28px;background:#7C5CFC;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;margin-top:12px">5DO 시작하기</a>
          <p style="font-size:12px;color:#999;margin-top:32px">5DO — 5th Density Oscillator<br>주식회사 스피닛 (SPINIT)</p>
        </div>`,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Email] Welcome error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Send Pro upgrade thank you email
// Helper: send Pro welcome email (used internally + via endpoint)
async function _sendProWelcomeEmail(user_id) {
  if (!resend || !sbAdmin) return;
  try {
    const { data: profile } = await sbAdmin.from('profiles').select('email, display_name').eq('id', user_id).single();
    if (!profile?.email) return;
    await resend.emails.send({
      from: EMAIL_FROM,
      to: profile.email,
      subject: '5DO Pro에 오신 것을 환영합니다! ✦',
      html: `
        <div style="max-width:520px;margin:0 auto;font-family:-apple-system,sans-serif;color:#333;padding:20px">
          <h1 style="color:#7C5CFC;font-size:24px">✦ 5DO Pro 멤버가 되셨습니다!</h1>
          <p>안녕하세요 ${profile.display_name || ''}님,</p>
          <p>5DO Pro 결제가 완료되었습니다. 이제 모든 기능을 자유롭게 이용할 수 있습니다.</p>
          <h3 style="color:#3ECFCF">잠금 해제된 기능:</h3>
          <ul>
            <li>✅ 전체 라이브러리 150+ 트랙</li>
            <li>✅ 소울 코드 AI 영혼 분석</li>
            <li>✅ 주파수 생성기 풀 기능 (바이노럴/듀얼톤/하모닉스)</li>
            <li>✅ WAV 내보내기</li>
            <li>✅ QTX 출력 모드</li>
            <li>✅ 무제한 프리셋 & 플레이리스트</li>
          </ul>
          <a href="https://5do.app" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#7C5CFC,#3ECFCF);color:#fff;border-radius:10px;text-decoration:none;font-weight:600;margin-top:12px">5DO 열기</a>
          <p style="font-size:12px;color:#999;margin-top:32px">5DO — 5th Density Oscillator<br>주식회사 스피닛 (SPINIT)</p>
        </div>`,
    });
    console.log(`[Email] Pro welcome sent to ${profile.email}`);
  } catch (e) {
    console.error('[Email] Pro welcome error:', e.message);
  }
}

app.post('/api/email/pro-welcome', async (req, res) => {
  if (!resend || !sbAdmin) return res.status(501).json({ error: 'not configured' });
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  try {
    await _sendProWelcomeEmail(user_id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete user (admin)
app.post('/api/admin/delete-user', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  try {
    // Find user
    const { data: { users }, error: listErr } = await sbAdmin.auth.admin.listUsers();
    const user = users?.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Delete related data first
    await sbAdmin.from('subscription_events').delete().eq('user_id', user.id);
    await sbAdmin.from('coupon_codes').update({ used_by: null, used_at: null }).eq('used_by', user.id);
    await sbAdmin.from('profiles').delete().eq('id', user.id);

    // Delete auth user
    const { error: delErr } = await sbAdmin.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;

    console.log(`[Admin] Deleted user: ${email} (${user.id})`);
    res.json({ ok: true, message: `${email} 삭제 완료` });
  } catch (e) {
    console.error('[Admin] Delete user error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Coupon Code Endpoints ───

// Generate coupon codes (admin only)
app.post('/api/coupon/generate', async (req, res) => {
  if (!sbAdmin) return res.status(501).json({ error: 'DB not configured' });
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_GRANT_KEY) return res.status(403).json({ error: 'Unauthorized' });

  const count = Math.min(parseInt(req.body.count) || 1, 100);
  const type = req.body.type || 'lifetime_pro';
  const codes = [];
  for (let i = 0; i < count; i++) {
    const rand = Array.from(crypto.randomBytes(6)).map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
    codes.push({ code: '5DO-' + rand.slice(0, 4) + '-' + rand.slice(4, 8), type });
  }
  const { error } = await sbAdmin.from('coupon_codes').insert(codes);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, codes: codes.map(c => c.code) });
});

// Redeem coupon code (user-facing)
app.post('/api/coupon/redeem', async (req, res) => {
  if (!sbAdmin) return res.status(501).json({ error: 'DB not configured' });
  const { code, user_id } = req.body;
  if (!code || !user_id) return res.status(400).json({ error: 'code and user_id required' });

  try {
    // Find unused coupon
    const { data: coupon } = await sbAdmin.from('coupon_codes')
      .select('*').eq('code', code.trim().toUpperCase()).is('used_by', null).single();
    if (!coupon) return res.status(400).json({ error: 'INVALID_CODE' });

    // Mark coupon as used
    const { data: updated, error: updateErr } = await sbAdmin.from('coupon_codes')
      .update({ used_by: user_id, used_at: new Date().toISOString() })
      .eq('id', coupon.id).is('used_by', null).select();
    if (updateErr || !updated?.length) return res.status(400).json({ error: 'ALREADY_USED' });

    // Grant lifetime Pro
    await sbAdmin.from('profiles').update({
      tier: 'pro', subscription_status: 'lifetime', tier_source: 'coupon',
      current_period_end: null,
    }).eq('id', user_id);

    await sbAdmin.from('subscription_events').insert({
      user_id, event_type: 'coupon_redeemed', provider: 'coupon',
      payload: { code: coupon.code, type: coupon.type },
    });

    console.log(`[Coupon] Redeemed: ${coupon.code} → ${user_id} (lifetime pro)`);

    // Auto-send Pro welcome email
    _sendProWelcomeEmail(user_id).catch(() => {});

    res.json({ ok: true, tier: 'pro', status: 'lifetime' });
  } catch (e) {
    console.error('[Coupon] Redeem error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Toss Payments Billing Endpoints ───

const TOSS_SECRET = process.env.TOSS_SECRET_KEY;
const TOSS_API = 'https://api.tosspayments.com/v1';

function tossAuth() {
  return 'Basic ' + Buffer.from(TOSS_SECRET + ':').toString('base64');
}

// Billing auth success callback — issue billing key + first charge
app.get('/api/toss/billing-success', async (req, res) => {
  console.log('[Toss] billing-success called. TOSS_SECRET:', !!TOSS_SECRET, 'sbAdmin:', !!sbAdmin);
  console.log('[Toss] query:', JSON.stringify(req.query));
  if (!TOSS_SECRET || !sbAdmin) {
    console.error('[Toss] Missing config — TOSS_SECRET:', !!TOSS_SECRET, 'sbAdmin:', !!sbAdmin);
    return res.redirect('/5do.html?sub=cancel');
  }
  const { authKey, customerKey, interval, userId } = req.query;
  // `amount` and `orderName` are intentionally NOT read from req.query — they
  // are derived server-side from `interval` to prevent price-tampering via a
  // hand-edited Toss redirect URL (see services/pricing.js).

  try {
    // Verify the customerKey Toss handed back matches the userId claimed in
    // the URL. Without this, a tampered userId could redirect the Pro
    // entitlement to a different account.
    if (!userId || !customerKey || customerKey !== customerKeyFor(userId)) {
      console.error('[Toss] customerKey/userId mismatch', { customerKey, userId });
      return res.redirect('/5do.html?sub=cancel&error=identity_mismatch');
    }

    // Compute the canonical price for this interval. Throws on invalid interval.
    const { amount, orderName } = computeProPrice(interval);

    // 1. Issue billing key
    const issueRes = await fetch(TOSS_API + '/billing/authorizations/issue', {
      method: 'POST',
      headers: { 'Authorization': tossAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey, customerKey }),
    });
    const issueData = await issueRes.json();
    if (!issueRes.ok) throw new Error(issueData.message || 'Billing key issue failed');

    const billingKey = issueData.billingKey;
    const cardInfo = issueData.card || {};

    // 2. Store billing key in profile
    await sbAdmin.from('profiles').update({
      toss_customer_key: customerKey,
      toss_billing_key: billingKey,
      toss_card_info: `${cardInfo.issuerCode || ''} ${cardInfo.number || ''}`.trim(),
      toss_interval: interval,
      tier_source: 'toss',
    }).eq('id', userId);

    // 3. First charge
    const orderId = 'order_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const chargeRes = await fetch(TOSS_API + '/billing/' + billingKey, {
      method: 'POST',
      headers: { 'Authorization': tossAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerKey,
        amount,
        orderId,
        orderName,
        customerEmail: '',
      }),
    });
    const chargeData = await chargeRes.json();
    if (!chargeRes.ok) throw new Error(chargeData.message || 'Charge failed');

    // 4. Update profile to Pro
    const periodEnd = new Date();
    if (interval === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    await sbAdmin.from('profiles').update({
      tier: 'pro',
      subscription_status: 'active',
      subscription_id: chargeData.paymentKey,
      current_period_end: periodEnd.toISOString(),
    }).eq('id', userId);

    await sbAdmin.from('subscription_events').insert({
      user_id: userId,
      event_type: 'toss_billing_started',
      provider: 'toss',
      payload: { billingKey, orderId, amount, interval, paymentKey: chargeData.paymentKey },
    });

    console.log(`[Toss] Billing started: ${userId} → Pro (${interval}, ₩${amount})`);

    // Auto-send Pro welcome email
    _sendProWelcomeEmail(userId).catch(() => {});

    res.redirect('/5do.html?sub=success');
  } catch (e) {
    console.error('[Toss] Billing error:', e.message);
    res.redirect('/5do.html?sub=cancel&error=' + encodeURIComponent(e.message));
  }
});

// One-time payment success (간편결제 — 카카오페이/네이버페이/토스페이/카드)
app.get('/api/toss/payment-success', async (req, res) => {
  console.log('[Toss] payment-success called');
  if (!TOSS_SECRET || !sbAdmin) return res.redirect('/5do.html?sub=cancel');
  const { paymentKey, orderId, amount, interval, userId } = req.query;

  try {
    // Confirm payment
    const confirmRes = await fetch(TOSS_API + '/payments/confirm', {
      method: 'POST',
      headers: { 'Authorization': tossAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount: parseInt(amount) }),
    });
    const confirmData = await confirmRes.json();
    if (!confirmRes.ok) throw new Error(confirmData.message || 'Payment confirm failed');

    // Update profile to Pro
    const periodEnd = new Date();
    if (interval === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const payMethod = confirmData.method || 'card';
    const easyPay = confirmData.easyPay?.provider || '';

    if (userId) {
      await sbAdmin.from('profiles').update({
        tier: 'pro',
        subscription_status: 'active',
        subscription_id: paymentKey,
        current_period_end: periodEnd.toISOString(),
        tier_source: easyPay ? 'toss_' + easyPay.toLowerCase() : 'toss_card',
      }).eq('id', userId);

      await sbAdmin.from('subscription_events').insert({
        user_id: userId,
        event_type: 'toss_payment_completed',
        provider: 'toss',
        payload: { paymentKey, orderId, amount: parseInt(amount), interval, method: payMethod, easyPay },
      });
    }

    console.log(`[Toss] Payment completed: ${userId} → Pro (${interval}, ₩${amount}, ${easyPay || payMethod})`);

    // Auto-send Pro welcome email
    if (userId) {
      _sendProWelcomeEmail(userId).catch(() => {});
    }

    res.redirect('/5do.html?sub=success');
  } catch (e) {
    console.error('[Toss] Payment error:', e.message);
    res.redirect('/5do.html?sub=cancel&error=' + encodeURIComponent(e.message));
  }
});

// Cancel subscription
app.post('/api/toss/cancel', async (req, res) => {
  if (!sbAdmin) return res.status(501).json({ error: 'DB not configured' });
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const { data: profile } = await sbAdmin.from('profiles').select('subscription_status, current_period_end').eq('id', user_id).single();
    if (!profile) return res.status(404).json({ error: 'User not found' });

    // Don't cancel lifetime users
    if (profile.subscription_status === 'lifetime') {
      return res.json({ ok: false, error: 'Lifetime membership cannot be cancelled' });
    }

    // Set status to canceled — user keeps access until period end
    await sbAdmin.from('profiles').update({
      subscription_status: 'canceled',
      // Keep current_period_end so they can use until it expires
    }).eq('id', user_id);

    await sbAdmin.from('subscription_events').insert({
      user_id, event_type: 'subscription_canceled', provider: 'toss',
      payload: { canceled_at: new Date().toISOString(), period_end: profile.current_period_end },
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cron-compatible: Renew all due Toss subscriptions
app.post('/api/toss/renew', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_GRANT_KEY) return res.status(403).json({ error: 'Unauthorized' });
  if (!TOSS_SECRET || !sbAdmin) return res.status(501).json({ error: 'Not configured' });

  try {
    const now = new Date().toISOString();
    // Find active toss subscriptions that are due for renewal
    const { data: dueProfiles } = await sbAdmin.from('profiles')
      .select('id, toss_billing_key, toss_customer_key, toss_interval, current_period_end, email')
      .eq('tier_source', 'toss')
      .eq('subscription_status', 'active')
      .lt('current_period_end', now);

    if (!dueProfiles || dueProfiles.length === 0) {
      return res.json({ ok: true, renewed: 0, message: 'No due subscriptions' });
    }

    let renewed = 0, failed = 0;
    for (const p of dueProfiles) {
      if (!p.toss_billing_key) { failed++; continue; }

      const earlyBird = false; // Early bird only for first signup
      const interval = p.toss_interval || 'monthly';
      const amount = interval === 'yearly' ? 99000 : 9900;
      const orderId = 'renew_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

      try {
        const chargeRes = await fetch(TOSS_API + '/billing/' + p.toss_billing_key, {
          method: 'POST',
          headers: { 'Authorization': tossAuth(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerKey: p.toss_customer_key,
            amount,
            orderId,
            orderName: interval === 'yearly' ? '5DO Pro 연간 갱신' : '5DO Pro 월간 갱신',
          }),
        });
        const chargeData = await chargeRes.json();

        if (chargeRes.ok) {
          const newEnd = new Date();
          if (interval === 'yearly') newEnd.setFullYear(newEnd.getFullYear() + 1);
          else newEnd.setMonth(newEnd.getMonth() + 1);

          await sbAdmin.from('profiles').update({
            subscription_id: chargeData.paymentKey,
            current_period_end: newEnd.toISOString(),
          }).eq('id', p.id);

          await sbAdmin.from('subscription_events').insert({
            user_id: p.id, event_type: 'toss_renewal_success', provider: 'toss',
            payload: { orderId, amount, paymentKey: chargeData.paymentKey },
          });
          renewed++;
        } else {
          // Payment failed — downgrade to free
          await sbAdmin.from('profiles').update({
            tier: 'free', subscription_status: 'past_due',
          }).eq('id', p.id);

          await sbAdmin.from('subscription_events').insert({
            user_id: p.id, event_type: 'toss_renewal_failed', provider: 'toss',
            payload: { orderId, error: chargeData.message },
          });
          failed++;
        }
      } catch (e) {
        console.error(`[Toss Renew] Failed for ${p.id}:`, e.message);
        failed++;
      }
    }

    console.log(`[Toss Renew] ${renewed} renewed, ${failed} failed out of ${dueProfiles.length}`);
    res.json({ ok: true, renewed, failed, total: dueProfiles.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Feature flags
app.get('/api/flags', async (_req, res) => {
  if (!sbAdmin) return res.json({ subscription_live: false });
  try {
    const { data } = await sbAdmin.from('feature_flags').select('key, enabled');
    const flags = {};
    (data || []).forEach(f => { flags[f.key] = f.enabled; });
    res.json(flags);
  } catch (e) {
    res.json({ subscription_live: false });
  }
});

// ─── Static Routes (Tests & Public) ───
app.use('/tests', express.static(path.join(__dirname, 'tests')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// ✅ 0) /assets 를 루트 assets 폴더로 정적 서빙 (banners + nav + nav html/images)
app.use('/assets', express.static(path.join(__dirname, 'assets'), { extensions: ['html'] }));

// ✅ 1) /landing 정적 서빙
app.use('/landing', express.static(path.join(__dirname, 'public', 'landing'), { extensions: ['html'] }));

// ✅ 2) 호스트별 홈(/) 분기: 5do.app = 앱, 5do.co.kr = 랜딩
app.get('/', (req, res) => {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  if (host === '5do.app' || host === 'www.5do.app') {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  return res.sendFile(path.join(__dirname, 'public', 'landing', 'index.html'));
});

// 기존 public 정적 서빙(앱 파일들)
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// SPA fallback
app.get('*', (req, res, next) => {
  // 정적 리소스면 next()
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|webp|avif|svg|ico|mp3|wav|ogg|m4a|mp4|webm|json|txt|xml|woff|woff2|ttf|otf)$/i))
    return next();

  const host = (req.headers.host || '').split(':')[0].toLowerCase();

  // 5do.app 은 앱으로 fallback
  if (host === '5do.app' || host === 'www.5do.app') {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }

  // 5do.co.kr 은 랜딩으로 fallback
  return res.sendFile(path.join(__dirname, 'public', 'landing', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`5DIO server http://localhost:${PORT}`);
  console.log('[Config] TOSS_SECRET_KEY:', !!process.env.TOSS_SECRET_KEY);
  console.log('[Config] SUPABASE_SERVICE_ROLE_KEY:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log('[Config] sbAdmin:', !!sbAdmin);
});
