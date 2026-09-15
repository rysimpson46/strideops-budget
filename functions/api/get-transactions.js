function mapCategory(cats, merchant) {
  const c = (cats || []).map(x => x.toLowerCase());
  const m = (merchant || '').toLowerCase();
  if (m.includes('church') || m.includes('lds') || m.includes('tithing')) return 'tithing';
  if (c.some(x => x.includes('rent') || x.includes('mortgage') || x.includes('utilities') || x.includes('electric') || x.includes('water'))) return 'rent';
  if (c.some(x => x.includes('internet') || x.includes('cable') || x.includes('telephone')) || m.includes('comcast') || m.includes('xfinity') || m.includes('att') || m.includes('verizon')) return 'internet';
  if (c.some(x => x.includes('food') || x.includes('groceries') || x.includes('supermarket')) || m.includes('walmart') || m.includes('kroger') || m.includes('costco') || m.includes('smiths') || m.includes('whole foods') || m.includes('trader joe')) return 'groceries';
  if (c.some(x => x.includes('gas station') || x.includes('fuel'))) return 'gas';
  if (c.some(x => x.includes('restaurant') || x.includes('entertainment') || x.includes('recreation'))) return 'dates';
  if (c.some(x => x.includes('subscription') || x.includes('software') || x.includes('streaming')) || m.includes('netflix') || m.includes('spotify') || m.includes('hulu') || m.includes('disney') || m.includes('apple')) return 'subscriptions';
  if (c.some(x => x.includes('investment') || x.includes('brokerage')) || m.includes('fidelity') || m.includes('vanguard') || m.includes('schwab')) return 'investments';
  return 'uncategorized';
}

export async function onRequestPost(context) {
  const { PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV } = context.env;
  const plaidBase = PLAID_ENV === 'sandbox' ? 'https://sandbox.plaid.com' : 'https://production.plaid.com';
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    const { access_token, start_date, end_date, institution_name } = await context.request.json();
    const now = new Date();
    const start = start_date || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
    const end = end_date || now.toISOString().slice(0,10);
    const res = await fetch(`${plaidBase}/transactions/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET, access_token, start_date: start, end_date: end, options: { count: 500, offset: 0 } })
    });
    const data = await res.json();
    if (data.error_message) throw new Error(data.error_message);
    const transactions = data.transactions.map(tx => ({
      id: tx.transaction_id,
      desc: tx.merchant_name || tx.name,
      amount: Math.abs(tx.amount),
      date: tx.date,
      income: tx.amount < 0,
      cat: mapCategory(tx.category, tx.merchant_name || tx.name),
      account: institution_name || ''
    }));
    return new Response(JSON.stringify({ transactions }), { headers });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
