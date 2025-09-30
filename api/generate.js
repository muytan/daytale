// api/generate.js
// Vercel Serverless Function: safely parses the body and proxies to OpenRouter

module.exports = async (req, res) => {
  // Only POST is allowed
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ---- Robust body parsing (handles object, string, or raw stream) ----
  const readBody = async () => {
    if (req.body) {
      if (typeof req.body === 'string') {
        try { return JSON.parse(req.body); } catch { return {}; }
      }
      if (typeof req.body === 'object') return req.body;
    }
    let raw = '';
    await new Promise((resolve) => {
      req.on('data', (c) => (raw += c));
      req.on('end', resolve);
    });
    try { return JSON.parse(raw || '{}'); } catch { return {}; }
  };

  try {
    const body = await readBody();

    const notes = (body.notes ?? '').toString().trim();
    const style = (body.style ?? 'reflective').toString();
    const tone  = (body.tone  ?? 'calm').toString();

    if (!notes) {
      return res.status(400).json({ error: 'Missing or invalid "notes" string.' });
    }

    const prompt = `Transform these brief daily notes into a cohesive, ${style} journal entry with a ${tone} tone.
Keep it human and grounded. Avoid clichés; prefer concrete details and natural rhythm.
Validate feelings and, if appropriate, offer one gentle, optional next step—no medical advice.

Daily notes: "${notes}"

Write the final journal entry in first person:`;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server missing OPENROUTER_API_KEY' });
    }

    // Call OpenRouter (using OpenAI gpt-3.5-turbo via OpenRouter; change model if you want)
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Optional but recommended for OpenRouter analytics:
        'HTTP-Referer': process.env.OPENROUTER_SITE || 'https://vercel.app',
        'X-Title': 'DayTale'
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        temperature: 0.7,
        messages: [
          { role: 'system', content: 'You are a gentle journaling assistant for mental wellbeing.' },
          { role: 'user',   content: prompt }
        ]
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: `Upstream error: ${errText || upstream.statusText}` });
    }

    const data = await upstream.json();

    const text =
      data?.choices?.[0]?.message?.content?.trim() ||
      data?.choices?.[0]?.text?.trim() || '';

    if (!text) {
      return res.status(502).json({ error: 'No text returned from model.' });
    }

    // Return cleaned text
    return res.status(200).json({
      text: text.replace(/^["'\s]+|["'\s]+$/g, '')
    });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
};
