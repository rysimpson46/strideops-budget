export async function onRequestPost(context) {
  const { ANTHROPIC_API_KEY } = context.env;
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set in Cloudflare Pages environment variables.' }), { status: 500, headers });
  }

  try {
    const { lesson, mode, question } = await context.request.json();
    if (!lesson || !lesson.trim()) {
      return new Response(JSON.stringify({ error: 'No lesson text provided.' }), { status: 400, headers });
    }

    const prompts = {
      summarize: `Summarize the following WGU lesson for a student studying for the course exam. Use short paragraphs or a tight bulleted list. Focus on the core concepts, definitions, and anything that sounds testable. Keep it well under half the length of the original. Do not add a preamble like "Here is a summary" — just give the summary.\n\nLESSON:\n${lesson}`,
      examples: `Based on the following WGU lesson, give 2-4 concrete worked examples that illustrate the key concepts. If the lesson involves calculations, formulas, or journal entries, show the actual numbers/steps. Label each example clearly. Do not add a preamble — start directly with the first example.\n\nLESSON:\n${lesson}`,
      quiz: `Based on the following WGU lesson, write 5 short quiz questions (mix of multiple choice and short answer) that test the key concepts a student would need to know for an exam. After all 5 questions, include an "Answers" section with the correct answers and a one-line explanation for each. Do not add a preamble.\n\nLESSON:\n${lesson}`,
      simpler: `Re-explain the following WGU lesson in plain, simple language, as if explaining it to someone with no background in the subject. Use short sentences and everyday analogies where helpful. Do not add a preamble.\n\nLESSON:\n${lesson}`,
      ask: `You are helping a WGU student understand a lesson they pasted in. Answer their question using the lesson as context. If the answer isn't in the lesson, say so and then answer from general knowledge, noting that it goes beyond the lesson. Do not add a preamble — answer directly.\n\nLESSON:\n${lesson}\n\nSTUDENT QUESTION:\n${question || ''}`,
      whiteboard: `Break the following WGU lesson into a sequence of 8-20 "beats" for an animated whiteboard-style study video aimed at a visual learner. Return ONLY valid JSON, no markdown code fences, no preamble, in exactly this shape:\n\n{\n  "beats": [\n    {\n      "text": "a natural narration sentence or two covering this beat's content — this is what gets read aloud, so it should read naturally, lightly paraphrased from the lesson is fine",\n      "card": {\n        "type": "title" | "bullets" | "definition" | "process" | "comparison" | "formula" | "note",\n        "heading": "short heading, a few words",\n        "items": ["short phrase", "short phrase"],\n        "term": "...", "definition": "...",\n        "left": {"heading": "...", "items": ["..."]},\n        "right": {"heading": "...", "items": ["..."]}\n      }\n    }\n  ]\n}\n\nOnly include the fields relevant to that card's "type": "bullets" and "process" use "heading"+"items"; "definition" uses "term"+"definition"; "comparison" uses "left"+"right" (each with "heading" and "items"); "formula" uses "heading"+"items" (each item a formula/step); "title" uses just "heading" (use this for section breaks); "note" uses "heading"+"items" for an aside/tip. Keep headings under 6 words and items under ~10 words each — this needs to be readable on a whiteboard at a glance, not a paragraph. Start with a "title" beat introducing the lesson topic.\n\nLESSON:\n${lesson}`
    };

    const userPrompt = prompts[mode];
    if (!userPrompt) {
      return new Response(JSON.stringify({ error: 'Unknown mode.' }), { status: 400, headers });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: mode === 'whiteboard' ? 4000 : 1500,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || 'Anthropic API error', raw: data }), { status: 500, headers });
    }

    const text = (data.content || []).map(b => b.text || '').join('\n').trim();

    if (mode === 'whiteboard') {
      const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      try {
        const parsed = JSON.parse(stripped);
        if (!parsed || !Array.isArray(parsed.beats)) {
          throw new Error('Response JSON did not contain a "beats" array.');
        }
        return new Response(JSON.stringify({ beats: parsed.beats }), { headers });
      } catch (parseErr) {
        return new Response(JSON.stringify({ error: 'Could not parse whiteboard JSON from AI response: ' + parseErr.message, raw: text }), { status: 500, headers });
      }
    }

    return new Response(JSON.stringify({ text }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
