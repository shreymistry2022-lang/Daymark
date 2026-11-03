import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_AUTHORIZATION');
  const revenueCatSecret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!webhookSecret || !revenueCatSecret || !supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server configuration is incomplete' }, 503);
  }
  if (request.headers.get('Authorization') !== webhookSecret) return json({ error: 'Unauthorized' }, 401);

  let body: { event?: Record<string, unknown> };
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }
  const event = body.event;
  if (!event || typeof event.type !== 'string' || typeof event.app_user_id !== 'string') {
    return json({ error: 'Invalid RevenueCat event' }, 400);
  }

  const userId = event.app_user_id;
  // Anonymous RevenueCat IDs and aliases must not be treated as authenticated app users.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return json({ received: true, ignored: 'No authenticated app user ID' });
  }

  const verification = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${revenueCatSecret}`, 'Content-Type': 'application/json' },
  });
  if (!verification.ok) return json({ error: 'Could not verify subscriber with RevenueCat' }, 502);

  const result = await verification.json();
  const subscriber = result?.subscriber;
  const entitlement = subscriber?.entitlements?.daymark_pro;
  const now = new Date();
  const expiresAt = entitlement?.expires_date ? new Date(entitlement.expires_date) : null;
  const active = Boolean(entitlement && (!expiresAt || expiresAt.getTime() > now.getTime()));
  const productId = entitlement?.product_identifier ?? (typeof event.product_id === 'string' ? event.product_id : null);
  const subscription = productId ? subscriber?.subscriptions?.[productId] : null;
  const periodType = subscription?.period_type ?? null;
  const store = typeof subscription?.store === 'string' ? subscription.store : (typeof event.store === 'string' ? event.store : null);
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const profile = await supabase.from('subscription_profiles').upsert({
    user_id: userId,
    entitlement_status: active ? (periodType === 'trial' ? 'trial' : 'active') : 'inactive',
    product_id: productId,
    subscription_type: periodType,
    platform: store,
    trial_started_at: active && periodType === 'trial' ? (subscription?.purchase_date ?? null) : null,
    expires_at: expiresAt?.toISOString() ?? null,
    will_renew: active ? subscription?.unsubscribe_detected_at == null : false,
    last_verified_at: now.toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'user_id' });
  if (profile.error) return json({ error: 'Could not update subscription profile' }, 500);

  const eventTimestamp = typeof event.event_timestamp_ms === 'number'
    ? new Date(event.event_timestamp_ms).toISOString()
    : now.toISOString();
  const eventId = typeof event.id === 'string' ? event.id : null;
  const logged = await supabase.from('subscription_events').upsert({
    provider_event_id: eventId,
    user_id: userId,
    event_type: event.type,
    product_id: typeof event.product_id === 'string' ? event.product_id : productId,
    platform: store,
    event_timestamp: eventTimestamp,
    metadata: { entitlement_status: active ? 'active' : 'inactive', environment: event.environment ?? null },
  }, { onConflict: 'provider_event_id', ignoreDuplicates: true });
  if (logged.error) return json({ error: 'Could not record subscription event' }, 500);

  return json({ received: true, verified: true });
});
