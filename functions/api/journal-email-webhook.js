/**
 * functions/api/journal-email-webhook.js
 * Resend inbound webhook — saves email reply as a journal entry
 */

const SUPABASE_URL = 'https://blbizkzvjylptwterldw.supabase.co';

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const payload = await request.json();

    // Resend sends metadata only — we need to fetch the email body separately
    if (payload.type !== 'email.received') {
      return new Response('OK', { status: 200 });
    }

    const emailData = payload.data;
    const emailId   = emailData?.email_id;
    const fromEmail = (emailData?.from || '').toLowerCase();
    const subject   = emailData?.subject || '';

    if (!emailId || !fromEmail) {
      return new Response('Missing data', { status: 200 });
    }

    // Fetch full email content from Resend API
    const emailRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      }
    });

    const emailContent = await emailRes.json();
    const rawText = emailContent.text || emailContent.html || '';
    const replyText = extractReplyText(rawText);

    if (!replyText) {
      return new Response('No content', { status: 200 });
    }

    // Look up user by email in Supabase
    const userRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_user_id_by_email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ email_input: fromEmail }),
      }
    );

    const userId = await userRes.text();
    if (!userId || userId === 'null') {
      return new Response('Unknown sender', { status: 200 });
    }

    const cleanUserId = userId.replace(/"/g, '').trim();
    const entryDate  = extractDateFromSubject(subject) || getYesterday();
    const prompt     = subject.replace(/^Re:\s*/i, '').replace(/^Journal Prompt[^—]*—\s*/i, '').trim();

    // Upsert the journal entry
    const upsertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/journal_entries`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          user_id:    cleanUserId,
          entry_date: entryDate,
          content:    replyText,
          prompt:     prompt || null,
          source:     'email',
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!upsertRes.ok) {
      const err = await upsertRes.text();
      console.error('Supabase error:', err);
      return new Response('DB error', { status: 500 });
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('Error', { status: 500 });
  }
}

function extractReplyText(raw) {
  if (!raw) return '';
  let text = raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  const lines = text.split('\n');
  const cleaned = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) break;
    if (trimmed.match(/^On .+ wrote:$/)) break;
    if (trimmed.includes('igaraachoi.resend.app') && trimmed.includes('wrote:')) break;
    if (trimmed.includes('strideops.com') && trimmed.includes('wrote:')) break;
    cleaned.push(line);
  }
  return cleaned.join('\n').trim();
}

function extractDateFromSubject(subject) {
  const match = subject.match(/(\w+ \d+,?\s*\d{4})/);
  if (!match) return null;
  try {
    const d = new Date(match[1]);
    if (isNaN(d)) return null;
    return d.toISOString().split('T')[0];
  } catch { return null; }
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
