import express from 'express';
import akashicFrequency from "./akashic-frequency/api.js";
import ce5Protocol from "./ce5-protocol/api.js";
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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
      payment_method_types: ['card'],
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
  const { authKey, customerKey, interval, amount, orderName, userId } = req.query;

  try {
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
    if (userId) {
      await sbAdmin.from('profiles').update({
        toss_customer_key: customerKey,
        toss_billing_key: billingKey,
        toss_card_info: `${cardInfo.issuerCode || ''} ${cardInfo.number || ''}`.trim(),
        toss_interval: interval || 'monthly',
        tier_source: 'toss',
      }).eq('id', userId);
    }

    // 3. First charge
    const orderId = 'order_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const chargeRes = await fetch(TOSS_API + '/billing/' + billingKey, {
      method: 'POST',
      headers: { 'Authorization': tossAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerKey,
        amount: parseInt(amount),
        orderId,
        orderName: decodeURIComponent(orderName || '5DO Pro'),
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

    if (userId) {
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
        payload: { billingKey, orderId, amount: parseInt(amount), interval, paymentKey: chargeData.paymentKey },
      });
    }

    console.log(`[Toss] Billing started: ${userId} → Pro (${interval}, ₩${amount})`);
    res.redirect('/5do.html?sub=success');
  } catch (e) {
    console.error('[Toss] Billing error:', e.message);
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
