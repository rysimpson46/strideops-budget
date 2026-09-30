export async function onRequestPost(context) {
  const { ANTHROPIC_API_KEY } = context.env;
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set in Cloudflare Pages environment variables.' }), { status: 500, headers });
  }

  try {
    const { lesson, mode, question, excludeQuestions } = await context.request.json();
    if (!lesson || !lesson.trim()) {
      return new Response(JSON.stringify({ error: 'No lesson text provided.' }), { status: 400, headers });
    }

    const excludeBlock = (Array.isArray(excludeQuestions) && excludeQuestions.length)
      ? `\n\nDo NOT reuse or write close variants of these previously-asked questions:\n${excludeQuestions.map(q => '- ' + q).join('\n')}`
      : '';

    const prompts = {
      summarize: `Summarize the following WGU lesson for a student studying for the course exam, and write it as natural spoken prose — this will be read aloud by text-to-speech, not displayed as a formatted document. Use flowing sentences and paragraphs. Do not use markdown formatting like **bold**, # headers, or bullet/numbered lists — if you'd naturally reach for a list, write it as a spoken transition instead, like "There are three things to know here: first..., second..., and third...". Focus on the core concepts, definitions, and anything that sounds testable. Keep it well under half the length of the original. Do not add a preamble like "Here is a summary" — just give the summary.\n\nLESSON:\n${lesson}`,
      examples: `Based on the following WGU lesson, give 2-4 concrete worked examples that illustrate the key concepts, written as natural spoken prose — this will be read aloud by text-to-speech, not displayed as a formatted document. Use flowing sentences and paragraphs, introducing each example conversationally (e.g. "Here's a first example...", "Now let's look at another case..."). Do not use markdown formatting like **bold**, # headers, or bullet/numbered lists. If the lesson involves calculations, formulas, or journal entries, walk through the actual numbers/steps in sentence form. Do not add a preamble — start directly with the first example.\n\nLESSON:\n${lesson}`,
      quiz: `Based on the following WGU lesson, write 5 multiple-choice quiz questions that test the key concepts a student would need to know for an exam. Return ONLY valid JSON, no markdown code fences, no preamble, in exactly this shape:\n\n{\n  "questions": [\n    {\n      "question": "...",\n      "options": ["...", "...", "...", "..."],\n      "correctIndex": 0,\n      "explanation": "one sentence explaining why the correct answer is correct"\n    }\n  ]\n}\n\nEach question must have exactly 4 options, and "correctIndex" is the 0-based index of the correct option in "options".${excludeBlock}\n\nLESSON:\n${lesson}`,
      simpler: `Re-explain the following WGU lesson in plain, simple language, as if explaining it to someone with no background in the subject, written as natural spoken prose — this will be read aloud by text-to-speech, not displayed as a formatted document. Use flowing sentences and paragraphs, short sentences, and everyday analogies where helpful. Do not use markdown formatting like **bold**, # headers, or bullet/numbered lists — if you'd naturally reach for a list, write it as a spoken transition instead, like "There are three things to know here: first..., second..., and third...". Do not add a preamble.\n\nLESSON:\n${lesson}`,
      ask: `You are helping a WGU student understand a lesson they pasted in. Answer their question using the lesson as context. If the answer isn't in the lesson, say so and then answer from general knowledge, noting that it goes beyond the lesson. Do not add a preamble — answer directly.\n\nLESSON:\n${lesson}\n\nSTUDENT QUESTION:\n${question || ''}`,
      whiteboard: `Break the following WGU lesson into a sequence of 8-20 "beats" for an animated whiteboard-style study video aimed at a visual learner. Return ONLY valid JSON, no markdown code fences, no preamble, in exactly this shape:\n\n{\n  "beats": [\n    {\n      "text": "a VERBATIM excerpt copied exactly, word-for-word, from the lesson text covering this beat's content — do not paraphrase or reword it, only light whitespace cleanup is allowed. The "text" fields of all beats, concatenated in order, must reconstruct the full lesson essentially verbatim.",\n      "card": {\n        "type": "title" | "bullets" | "definition" | "process" | "comparison" | "formula" | "note",\n        "heading": "short heading, a few words",\n        "items": ["short phrase", "short phrase"],\n        "term": "...", "definition": "...",\n        "left": {"heading": "...", "items": ["..."]},\n        "right": {"heading": "...", "items": ["..."]}\n      }\n    }\n  ]\n}\n\nOnly include the fields relevant to that card's "type": "bullets" and "process" use "heading"+"items"; "definition" uses "term"+"definition"; "comparison" uses "left"+"right" (each with "heading" and "items"); "formula" uses "heading"+"items" (each item a formula/step); "title" uses just "heading" (use this for section breaks); "note" uses "heading"+"items" for an aside/tip. The "card" field should be a paraphrased, simplified visual summary of the beat's excerpt — keep headings under 6 words and items under ~10 words each so it's readable on a whiteboard at a glance. Only the "text" field must stay verbatim; the "card" field should NOT be verbatim. Start with a "title" beat whose "text" is the lesson's opening words.\n\nLESSON:\n${lesson}`
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
        max_tokens: mode === 'whiteboard' ? 4000 : (mode === 'quiz' ? 2500 : 1500),
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || 'Anthropic API error', raw: data }), { status: 500, headers });
    }

    const text = (data.content || []).map(b => b.text || '').join('\n').trim();

    if (mode === 'whiteboard' || mode === 'quiz') {
      const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      try {
        const parsed = JSON.parse(stripped);
        if (mode === 'whiteboard') {
          if (!parsed || !Array.isArray(parsed.beats)) {
            throw new Error('Response JSON did not contain a "beats" array.');
          }
          return new Response(JSON.stringify({ beats: parsed.beats }), { headers });
        }
        if (!parsed || !Array.isArray(parsed.questions)) {
          throw new Error('Response JSON did not contain a "questions" array.');
        }
        return new Response(JSON.stringify({ questions: parsed.questions }), { headers });
      } catch (parseErr) {
        return new Response(JSON.stringify({ error: `Could not parse ${mode} JSON from AI response: ` + parseErr.message, raw: text }), { status: 500, headers });
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
