export async function onRequestPost(context) {
  const { PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV } = context.env;
  const plaidBase = PLAID_ENV === 'sandbox' ? 'https://sandbox.plaid.com' : 'https://production.plaid.com';
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    const { public_token } = await context.request.json();
    const res = await fetch(`${plaidBase}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET, public_token })
    });
    const data = await res.json();
    if (data.error_message) throw new Error(data.error_message);
    return new Response(JSON.stringify({ access_token: data.access_token, item_id: data.item_id }), { headers });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
