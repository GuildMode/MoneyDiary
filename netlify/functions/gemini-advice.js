const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: DEFAULT_HEADERS,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ error: 'Gemini API key is not configured on the server.' })
    };
  }

  let prompt = '';
  try {
    const payload = JSON.parse(event.body || '{}');
    prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  } catch (error) {
    return {
      statusCode: 400,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ error: 'Invalid JSON payload.' })
    };
  }

  if (!prompt) {
    return {
      statusCode: 400,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ error: 'Prompt is required.' })
    };
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data?.error?.message || `Gemini API error (${response.status})`;
      return {
        statusCode: response.status,
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({ error: errorMessage })
      };
    }

    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    const text = candidates
      .flatMap(candidate => candidate?.content?.parts || [])
      .map(part => part?.text)
      .filter(Boolean)
      .join('\n');

    if (!text) {
      return {
        statusCode: 502,
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({ error: 'The Gemini API did not return any advice.' })
      };
    }

    return {
      statusCode: 200,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ text })
    };
  } catch (error) {
    console.error('Gemini function failed', error);
    return {
      statusCode: 500,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ error: 'Failed to contact the Gemini API.' })
    };
  }
};
