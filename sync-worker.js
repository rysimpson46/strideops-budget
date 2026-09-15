// Cloudflare Workers Cron - runs daily at 6am UTC (midnight Mountain Time)
export default {
  async scheduled(event, env, ctx) {
    await runSync(env);
  },
  // Also allow manual trigger via HTTP for testing
  async fetch(request, env, ctx) {
    if (request.method === 'POST') {
      await runSync(env);
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('Sync worker running', { status: 200 });
  }
};

async function runSync(env) {
  const { PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, SUPABASE_URL, SUPABASE_KEY } = env;
  const plaidBase = PLAID_ENV === 'sandbox' ? 'https://sandbox.plaid.com' : 'https://production.plaid.com';

  // Get all plaid items from Supabase
  const itemsRes = await fetch(`${SUPABASE_URL}/rest/v1/plaid_items?select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  const items = await itemsRes.json();
  if (!items || !items.length) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const end = now.toISOString().slice(0, 10);

  for (const item of items) {
    try {
      // Get transactions from Plaid
      const plaidRes = await fetch(`${plaidBase}/transactions/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: PLAID_CLIENT_ID,
          secret: PLAID_SECRET,
          access_token: item.access_token,
          start_date: start,
          end_date: end,
          options: { count: 500, offset: 0 }
        })
      });
      const plaidData = await plaidRes.json();
      if (plaidData.error_message) continue;

      const transactions = plaidData.transactions || [];
      if (!transactions.length) continue;

      // Map and upsert transactions
      const rows = transactions.map(tx => ({
        id: tx.transaction_id,
        household_id: item.household_id,
        description: tx.merchant_name || tx.name,
        amount: Math.abs(tx.amount),
        category: item.is_business ? mapBizCategory(tx) : mapPersonalCategory(tx),
        date: tx.date,
        income: tx.amount < 0,
        month: tx.date.slice(0, 7),
        is_business: item.is_business || false,
        pending_review: true  // All auto-synced transactions need review
      }));

      // Upsert to Supabase (on conflict with id, update but preserve pending_review=false if already reviewed)
      await fetch(`${SUPABASE_URL}/rest/v1/transactions`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=ignore-duplicates'  // Don't overwrite already-reviewed transactions
        },
        body: JSON.stringify(rows)
      });

    } catch(e) {
      console.error('Sync error for item', item.id, e.message);
    }
  }
}

function mapPersonalCategory(tx) {
  const c = (tx.category || []).map(x => x.toLowerCase());
  const m = (tx.merchant_name || tx.name || '').toLowerCase();
  if (m.includes('church') || m.includes('lds') || m.includes('tithing')) return 'tithing';
  if (c.some(x => x.includes('rent') || x.includes('mortgage') || x.includes('utilities') || x.includes('electric') || x.includes('water'))) return 'rent';
  if (c.some(x => x.includes('internet') || x.includes('cable') || x.includes('telephone')) || m.includes('comcast') || m.includes('xfinity') || m.includes('att') || m.includes('verizon')) return 'internet';
  if (c.some(x => x.includes('food') || x.includes('groceries') || x.includes('supermarket')) || m.includes('walmart') || m.includes('kroger') || m.includes('costco') || m.includes('smiths') || m.includes('whole foods')) return 'groceries';
  if (c.some(x => x.includes('gas station') || x.includes('fuel'))) return 'gas';
  if (c.some(x => x.includes('restaurant') || x.includes('entertainment') || x.includes('recreation'))) return 'dates';
  if (c.some(x => x.includes('subscription') || x.includes('software') || x.includes('streaming')) || m.includes('netflix') || m.includes('spotify') || m.includes('hulu') || m.includes('disney') || m.includes('apple')) return 'subscriptions';
  if (c.some(x => x.includes('investment') || x.includes('brokerage')) || m.includes('fidelity') || m.includes('vanguard') || m.includes('schwab')) return 'investments';
  return 'groceries';
}

function mapBizCategory(tx) {
  const c = (tx.category || []).map(x => x.toLowerCase());
  const m = (tx.merchant_name || tx.name || '').toLowerCase();
  if (c.some(x => x.includes('advertising') || x.includes('marketing'))) return 'advertising';
  if (c.some(x => x.includes('software') || x.includes('subscription') || x.includes('streaming')) || m.includes('netflix') || m.includes('spotify') || m.includes('adobe') || m.includes('google') || m.includes('microsoft')) return 'software';
  if (c.some(x => x.includes('phone') || x.includes('internet') || x.includes('telephone'))) return 'phone-internet';
  if (c.some(x => x.includes('travel') || x.includes('airline') || x.includes('hotel') || x.includes('lodging'))) return 'travel';
  if (c.some(x => x.includes('restaurant') || x.includes('food and drink'))) return 'meals';
  if (c.some(x => x.includes('professional') || x.includes('legal') || x.includes('accounting'))) return 'professional';
  if (c.some(x => x.includes('gas') || x.includes('fuel') || x.includes('automotive'))) return 'travel';
  return 'other-biz';
}
