const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
const GEMINI_LIST_MODELS_URL = `${GEMINI_API_BASE}/v1beta/models`;
const GEMINI_PREFERRED_MODELS = [
  'models/gemini-1.5-flash-latest',
  'models/gemini-1.5-flash-002',
  'models/gemini-1.5-flash',
  'models/gemini-1.5-flash-8b-latest',
  'models/gemini-1.5-pro-latest',
  'models/gemini-1.5-pro',
  'models/gemini-1.0-pro',
  'models/gemini-1.0-pro-001',
  'models/gemini-pro'
];

const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

async function buildModelInvocationOrder(apiKey) {
  try {
    const response = await fetch(`${GEMINI_LIST_MODELS_URL}?key=${apiKey}`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error?.message || `Gemini model list error (${response.status})`);
    }

    const models = Array.isArray(data?.models) ? data.models : [];
    const supported = models
      .filter(model => Array.isArray(model?.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
      .map(model => model.name);

    if (supported.length === 0) {
      throw new Error('No Gemini models available for generateContent.');
    }

    const ordered = [];
    for (const modelName of GEMINI_PREFERRED_MODELS) {
      if (supported.includes(modelName)) {
        ordered.push(modelName);
      }
    }

    for (const remaining of supported) {
      if (!ordered.includes(remaining)) {
        ordered.push(remaining);
      }
    }

    return ordered.map(name => `v1beta/${name}:generateContent`);
  } catch (error) {
    console.warn('Failed to list Gemini models, falling back to defaults', error);
    return GEMINI_PREFERRED_MODELS.map(name => `v1beta/${name}:generateContent`);
  }
}

async function requestGeminiAdvice(prompt, apiKey) {
  const modelPaths = await buildModelInvocationOrder(apiKey);
  let lastError = null;

  for (const path of modelPaths) {
    try {
      const response = await fetch(`${GEMINI_API_BASE}/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage = data?.error?.message || `Gemini API error (${response.status})`;
        const shouldTryNextModel =
          response.status === 404 || /not found/i.test(errorMessage) || /not supported/i.test(errorMessage);

        if (shouldTryNextModel) {
          lastError = errorMessage;
          continue;
        }

        throw new Error(errorMessage);
      }

      const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
      const text = candidates
        .flatMap(candidate => candidate?.content?.parts || [])
        .map(part => part?.text)
        .filter(Boolean)
        .join('\n');

      if (text) {
        return text;
      }

      lastError = 'The Gemini API did not return any advice.';
    } catch (error) {
      lastError = error?.message || 'Failed to contact the Gemini API.';
    }
  }

  throw new Error(lastError || 'Failed to contact the Gemini API.');
}

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
    const text = await requestGeminiAdvice(prompt, apiKey);
    return {
      statusCode: 200,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ text })
    };
  } catch (error) {
    console.error('Gemini function failed', error);
    return {
      statusCode: 502,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ error: error?.message || 'Failed to contact the Gemini API.' })
    };
  }
};
