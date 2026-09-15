export async function onRequestPost(context) {
  const { PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV } = context.env;
  const plaidBase = PLAID_ENV === 'sandbox' ? 'https://sandbox.plaid.com' : 'https://production.plaid.com';
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    const { access_token } = await context.request.json();
    const res = await fetch(`${plaidBase}/item/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET, access_token })
    });
    const data = await res.json();
    // Only flag as needing reconnect if there's an active item-level error
    // ITEM_LOGIN_REQUIRED is the main one that needs user action
    const item_error = data.item?.error;
    const needs_reconnect = !!(item_error && 
      (item_error.error_code === 'ITEM_LOGIN_REQUIRED' || 
       item_error.error_code === 'INVALID_CREDENTIALS' ||
       item_error.error_code === 'MFA_NOT_SUPPORTED' ||
       item_error.error_type === 'ITEM_ERROR'));
    return new Response(JSON.stringify({ needs_reconnect, error_code: item_error?.error_code || null }), { headers });
  } catch(e) {
    return new Response(JSON.stringify({ needs_reconnect: false }), { headers });
  }
}
export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
// 20260909100557
