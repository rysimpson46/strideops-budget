export async function onRequestPost(context) {
  const { PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV } = context.env;
  const plaidBase = PLAID_ENV === 'sandbox' ? 'https://sandbox.plaid.com' : 'https://production.plaid.com';
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    const body_in = await context.request.json();
    const { user_id, access_token } = body_in;

    let plaid_body;
    if (access_token) {
      plaid_body = {
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        user: { client_user_id: user_id },
        client_name: "Ryan & Sariah's Budget",
        country_codes: ['US'],
        language: 'en',
        access_token: access_token
      };
    } else {
      plaid_body = {
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        user: { client_user_id: user_id },
        client_name: "Ryan & Sariah's Budget",
        products: ['transactions'],
        country_codes: ['US'],
        language: 'en',
        redirect_uri: 'https://strideops.com'
      };
    }

    const res = await fetch(`${plaidBase}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plaid_body)
    });
    const data = await res.json();
    // Return full Plaid error details for debugging
    if (!data.link_token) {
      return new Response(JSON.stringify({ 
        error: data.error_message || 'No link token returned',
        error_code: data.error_code,
        error_type: data.error_type,
        display_message: data.display_message,
        raw: data
      }), { status: 400, headers });
    }
    return new Response(JSON.stringify({ link_token: data.link_token }), { headers });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500, headers });
  }
}
export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
// 20260909094359
