// api/generate.js
// Vercel Serverless Function: proxies your request to OpenRouter with a hidden API key

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { notes, style, tone } = req.body || {};
    if (!notes || typeof notes !== 'string' || !notes.trim()) {
      return res.status(400).json({ error: 'Missing or invalid "notes" string.' });
    }

    const styleSafe = (style || 'reflective').toString();
    const toneSafe  = (tone  || 'calm').toString();

    const prompt = `Transform these brief daily notes into a cohesive, ${styleSafe} journal entry with a ${toneSafe} tone. 
Keep it human and grounded. Avoid clichés; prefer concrete details and natural rhythm. 
Validate feelings and, if appropriate, offer one gentle, optional next step—no medical advice.

Daily notes: "${notes}"

Write the final journal entry in first person:`;

    // IMPORTANT: use server-side env var
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server missing OPENROUTER_API_KEY' });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Optional but good practice:
        'HTTP-Referer': 'https://your-domain-or-vercel-url.example', 
        'X-Title': 'DayTale'
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',      // change if you want a different model
        messages: [
          { role: 'system', content: 'You are a gentle journaling assistant for mental wellbeing.' },
          { role: 'user',   content: prompt }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(response.status).json({ error: `Upstream error: ${errText || response.statusText}` });
    }

    const data = await response.json();

    const text =
      data?.choices?.[0]?.message?.content?.trim() ||
      data?.choices?.[0]?.text?.trim() ||
      '';

    if (!text) {
      return res.status(502).json({ error: 'No text returned from model.' });
    }

    // Basic trimming of quotes if present
    const cleaned = text.replace(/^["'\s]+|["'\s]+$/g, '');
    return res.status(200).json({ text: cleaned });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
};
