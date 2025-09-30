// api/generate.js
// Accepts { prompt } OR { notes, style, tone } — unchanged behavior.
// Adds journaling guardrails via system message (validate → reframe, done-well + tiny step, self-compassion).

module.exports = async (req, res) => {
  const readBody = async () => {
    if (req.body) {
      if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
      if (typeof req.body === 'object') return req.body;
    }
    let raw=''; await new Promise(r=>{ req.on('data',c=>raw+=c); req.on('end',r); });
    try { return JSON.parse(raw||'{}'); } catch { return {}; }
  };

  try {
    if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({error:'Method Not Allowed'}); }

    const body = await readBody();

    let finalPrompt = '';
    if (typeof body.prompt === 'string' && body.prompt.trim()) {
      finalPrompt = body.prompt.trim();
    } else {
      const notes = (body.notes ?? '').toString().trim();
      const style = (body.style ?? 'reflective').toString();
      const tone  = (body.tone  ?? 'calm').toString();
      if (!notes) return res.status(400).json({ error:'Missing or invalid "notes" string.' });

      finalPrompt = `Transform these notes into a mental health journal entry.
Write a ${style} first-person entry with a ${tone} tone.
Validate feelings first, then offer a gentle, optional reframe if appropriate (no toxic positivity).
End with (a) one thing I handled well today and (b) one tiny next step.
Add one short self-compassion sentence as if to a friend.
Keep it human and grounded. Avoid clichés. No medical or crisis advice.

Notes: "${notes}"

Write the final entry:`;
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(500).json({ error:'Server missing OPENROUTER_API_KEY' });

    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:'POST',
      headers:{
        'Authorization':`Bearer ${apiKey}`,
        'Content-Type':'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE || 'https://vercel.app',
        'X-Title':'DayTale'
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: [
              'You are a gentle journaling assistant for mental wellbeing.',
              'Always: 1) validate feelings; 2) offer a gentle optional reframe; 3) end with one thing done well + one tiny next step; 4) add one short self-compassion sentence.',
              'Do not give medical or crisis advice; no diagnosis. If severe distress is explicit, suggest contacting a trusted person or local services.'
            ].join('\n')
          },
          { role: 'user', content: finalPrompt }
        ]
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(()=> '');
      return res.status(upstream.status).json({ error:`Upstream error: ${errText || upstream.statusText}` });
    }

    const data = await upstream.json();
    const text =
      data?.choices?.[0]?.message?.content?.trim() ||
      data?.choices?.[0]?.text?.trim() || '';

    if (!text) return res.status(502).json({ error:'No text returned from model.' });

    return res.status(200).json({ text: text.replace(/^["'\s]+|["'\s]+$/g, '') });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error:'Server error.' });
  }
};
