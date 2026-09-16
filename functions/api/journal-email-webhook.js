/**
 * functions/api/journal-email-webhook.js
 * Resend inbound webhook — saves email reply as a journal entry
 */

const SUPABASE_URL = 'https://blbizkzvjylptwterldw.supabase.co';

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const body = await request.json();

    // Resend sends inbound email as JSON
    const fromEmail = (body.from || '').toLowerCase();
    const replyText = extractReplyText(body.text || body.html || '');
    const subject   = body.subject || '';

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
      console.log('No user found for email:', fromEmail);
      return new Response('Unknown sender', { status: 200 });
    }

    const cleanUserId = userId.replace(/"/g, '').trim();

    // Extract the entry date from subject line (format: "Journal Prompt — Sep 15")
    // Default to yesterday
    const entryDate = extractDateFromSubject(subject) || getYesterday();

    // Extract prompt from subject
    const prompt = subject.replace(/^Re:\s*/i, '').replace(/^Journal Prompt[^—]*—\s*/i, '').trim();

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
          user_id: cleanUserId,
          entry_date: entryDate,
          content: replyText,
          prompt: prompt || null,
          source: 'email',
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

  // Strip HTML if present
  let text = raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');

  // Remove quoted reply content (lines starting with >)
  const lines = text.split('\n');
  const cleaned = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) break;
    if (trimmed.match(/^On .+ wrote:$/)) break;
    if (trimmed.includes('journal@strideops.com') && trimmed.includes('wrote:')) break;
    cleaned.push(line);
  }

  return cleaned.join('\n').trim();
}

function extractDateFromSubject(subject) {
  // Subject format: "Journal Prompt — Sep 15, 2026"
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
