/**
 * journal-cron-worker.js
 * Standalone Cloudflare Worker with cron trigger
 * Fires daily, picks a random time between 10am–4:30pm MT, sends prompt email
 *
 * Cron: "0 * * * *" (every hour — worker checks if it's time to send)
 */

const SUPABASE_URL = 'https://blbizkzvjylptwterldw.supabase.co';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyPrompt(env));
  },

  // Also allow manual trigger via GET /trigger for testing
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/trigger') {
      const result = await runDailyPrompt(env, true);
      return new Response(JSON.stringify(result), { status: 200, headers: {'Content-Type':'application/json'} });
    }
    return new Response('Journal Cron Worker', { status: 200 });
  }
};

async function runDailyPrompt(env, force = false) {
  const log = [];

  // Current time in Mountain Time
  const now = new Date();
  const mtOffset = isDST(now) ? -6 : -7;
  const mtHour = (now.getUTCHours() + mtOffset + 24) % 24;
  const mtMinute = now.getUTCMinutes();
  const mtTime = mtHour + mtMinute / 60;
  log.push(`MT time: ${mtHour}:${String(mtMinute).padStart(2,'0')}, force: ${force}`);

  // Only run between 10:00am and 4:30pm MT (skip if force=true)
  if (!force && (mtTime < 10 || mtTime > 16.5)) {
    log.push('Outside time window, skipping');
    return { log };
  }

  // Get today's date in MT
  const mtDate = getMTDate(now, mtOffset);

  // Fetch all users with journal enabled and no prompt sent today
  const settingsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/journal_settings?enabled=eq.true&select=user_id,telegram_chat_id,last_sent_date,window_start,window_end`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      }
    }
  );

  const settings = await settingsRes.json();
  log.push(`Settings rows found: ${settings.length}`);
  if (!settings.length) return { log };

  for (const userSettings of settings) {
    log.push(`Processing user: ${userSettings.user_id.slice(0,8)}... last_sent: ${userSettings.last_sent_date}`);

    // Skip if already sent today
    if (userSettings.last_sent_date === mtDate) {
      log.push('Already sent today, skipping');
      continue;
    }

    // Respect each user's window (stored as HH:MM)
    const winStart = timeToDecimal(userSettings.window_start || '10:00');
    const winEnd   = timeToDecimal(userSettings.window_end   || '16:30');
    if (!force && (mtTime < winStart || mtTime > winEnd)) {
      log.push('Outside user window, skipping');
      continue;
    }

    // 1-in-N chance per hour so it lands at a random time across the window
    const windowHours = winEnd - winStart;
    const checksInWindow = Math.max(1, Math.round(windowHours));
    if (!force && Math.random() > 1 / checksInWindow) {
      log.push('Random check failed, skipping');
      continue;
    }

    // Get user email
    const emailRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_user_email_by_id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ user_id_input: userSettings.user_id }),
      }
    );
    const userEmail = (await emailRes.text()).replace(/"/g, '').trim();
    log.push(`User email: ${userEmail}`);
    if (!userEmail) { log.push('No email found, skipping'); continue; }

    // Get recent entries to give Claude context
    const entriesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/journal_entries?user_id=eq.${userSettings.user_id}&order=entry_date.desc&limit=5&select=entry_date,content,prompt`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        }
      }
    );
    const recentEntries = await entriesRes.json();

    // Generate prompt with Claude
    const prompt = await generatePrompt(env, recentEntries, mtDate);

    // Format yesterday's date for subject line
    const yesterday = getYesterdayStr(now, mtOffset);
    const subject = `Journal Prompt — ${yesterday}`;

    // Send email via Resend
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Journal <journal@strideops.com>',
        to: userEmail,
        reply_to: 'journal@reply.strideops.com',
        subject,
        text: `${prompt}\n\nJust reply to this email — your response saves automatically to your journal.\n\n—\nStrideOps Journal`,
      }),
    });
    const sendResult = await sendRes.json();
    log.push(`Email send result: ${JSON.stringify(sendResult)}`);

    // Update last_sent_date
    await fetch(
      `${SUPABASE_URL}/rest/v1/journal_settings?user_id=eq.${userSettings.user_id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ last_sent_date: mtDate }),
      }
    );
    log.push('last_sent_date updated');
  }

  return { log };
}

async function generatePrompt(env, recentEntries, todayDate) {
  const context = recentEntries.length
    ? recentEntries.map(e => `${e.entry_date}: ${(e.content || '').slice(0, 200)}`).join('\n')
    : 'No recent entries yet.';

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `You are a gentle, thoughtful journaling assistant. Generate ONE short, open-ended journaling prompt about yesterday. 

The prompt should feel warm and conversational — like a friend checking in, not a therapist. Keep it to 1-2 sentences max. Don't use the word "journal". Don't ask multiple questions. Make it specific enough to spark a memory but open enough to go anywhere.

Recent journal entries for context (don't reference these directly):
${context}

Today's date: ${todayDate}

Respond with ONLY the prompt, nothing else.`
      }]
    })
  });

  const data = await res.json();
  return data.content?.[0]?.text?.trim() || "What's one moment from yesterday that stuck with you?";
}

function timeToDecimal(timeStr) {
  const [h, m] = (timeStr || '10:00').split(':').map(Number);
  return h + (m || 0) / 60;
}

function isDST(date) {
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  return Math.min(jan, jul) === date.getTimezoneOffset();
}

function getMTDate(utcDate, offset) {
  const mt = new Date(utcDate.getTime() + offset * 3600000);
  return mt.toISOString().split('T')[0];
}

function getYesterdayStr(utcDate, offset) {
  const mt = new Date(utcDate.getTime() + offset * 3600000);
  mt.setDate(mt.getDate() - 1);
  return mt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
