import express from 'express';
import akashicFrequency from "./akashic-frequency/api.js";
import ce5Protocol from "./ce5-protocol/api.js";
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

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
        const tier = (sub.status === 'active' || sub.status === 'trialing') ? 'basic' : 'free';
        const { data: profiles } = await sbAdmin.from('profiles').select('id').eq('stripe_customer_id', customerId);
        if (profiles?.[0]) {
          await sbAdmin.from('profiles').update({
            tier, subscription_status: sub.status || 'active',
            subscription_id: sub.id || sub.subscription,
            current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          }).eq('id', profiles[0].id);
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
    const { interval } = req.body; // 'monthly' | 'yearly'
    const priceId = interval === 'yearly' ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;
    if (!priceId) return res.status(400).json({ error: 'Price not configured' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.headers.origin || 'https://5do.app'}/5do.html?sub=success`,
      cancel_url: `${req.headers.origin || 'https://5do.app'}/5do.html?sub=cancel`,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('[Checkout]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Stripe Customer Portal
app.post('/api/subscription/portal', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) return res.status(501).json({ error: 'Stripe not configured' });
  try {
    const stripe = (await import('stripe')).default(process.env.STRIPE_SECRET_KEY);
    // TODO: get customer ID from authenticated user's profile
    res.status(501).json({ error: 'Portal requires auth integration' });
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

app.listen(PORT, () => console.log(`5DIO server http://localhost:${PORT}`));
