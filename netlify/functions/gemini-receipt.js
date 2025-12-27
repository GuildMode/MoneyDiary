const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
const GEMINI_LIST_MODELS_URL = `${GEMINI_API_BASE}/v1beta/models`;

// Vision capabilities required.
// 1.5 Flash is preferred for speed/cost, but we fallback to others if needed.
const GEMINI_PREFERRED_MODELS = [
  'models/gemini-1.5-flash-latest',
  'models/gemini-1.5-flash-002',
  'models/gemini-1.5-flash',
  'models/gemini-1.5-flash-8b-latest',
  'models/gemini-1.5-pro-latest',
  'models/gemini-1.5-pro',
  'models/gemini-pro-vision' // Old vision model
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
      // Fallback to defaults if list fails
      return GEMINI_PREFERRED_MODELS.map(name => `v1beta/${name}:generateContent`);
    }

    const models = Array.isArray(data?.models) ? data.models : [];
    // We need models that support 'generateContent'
    const supported = models
      .filter(model => Array.isArray(model?.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
      .map(model => model.name);

    if (supported.length === 0) {
      return GEMINI_PREFERRED_MODELS.map(name => `v1beta/${name}:generateContent`);
    }

    const ordered = [];
    // 1. Preferred models if supported
    for (const modelName of GEMINI_PREFERRED_MODELS) {
      if (supported.includes(modelName)) {
        ordered.push(modelName);
      }
    }
    // 2. Any other supported models (that might be vision capable)
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

async function analyzeReceiptImage(imageBase64, mimeType, apiKey) {
  const modelPaths = await buildModelInvocationOrder(apiKey);
  
  const prompt = `
    Analyze this image of a receipt. Extract the following information in JSON format:
    1. "amount": The total amount (number only, no currency symbols).
    2. "date": The date of the transaction in "YYYY-MM-DD" format. If the year is missing, assume current year.
    3. "description": A short summary of the items or store name (max 20 characters).
    
    Return ONLY the JSON object. Do not wrap in markdown code blocks.
    Example: {"amount": 1200, "date": "2023-10-25", "description": "Convenience Store"}
  `;

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: mimeType,
            data: imageBase64
          }
        }
      ]
    }]
  };

  let lastError = null;

  for (const path of modelPaths) {
    try {
      const response = await fetch(`${GEMINI_API_BASE}/${path}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage = data?.error?.message || `Gemini API error (${response.status})`;
        // If 404 or specific errors, try next model
        if (response.status === 404 || /not found/i.test(errorMessage) || /not supported/i.test(errorMessage)) {
          lastError = errorMessage;
          continue;
        }
        throw new Error(errorMessage);
      }

      const candidate = data.candidates?.[0];
      const textPart = candidate?.content?.parts?.[0]?.text;

      if (!textPart) {
        // Successful response but no text? Try next model just in case.
        lastError = 'No text content returned from Gemini.';
        continue;
      }

      // Clean up potential markdown formatting
      const jsonString = textPart.replace(/```json/g, '').replace(/```/g, '').trim();
      try {
        return JSON.parse(jsonString);
      } catch (parseError) {
        // If JSON parse fails, it might be the model being chatty.
        // We could try to regex extract JSON, but for now let's treat it as a model failure and maybe try next?
        // Actually, let's just return partial if possible or throw.
        throw new Error('Failed to parse JSON from Gemini response: ' + jsonString.substring(0, 50) + '...');
      }

    } catch (error) {
      lastError = error.message;
      // Continue to next model loop
    }
  }

  throw new Error(lastError || 'Failed to analyze receipt with any available model.');
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
      body: JSON.stringify({ error: 'Server configuration error: API Key missing.' })
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { image, mimeType } = payload;

    if (!image || !mimeType) {
      return {
        statusCode: 400,
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({ error: 'Image data and mimeType are required.' })
      };
    }

    const result = await analyzeReceiptImage(image, mimeType, apiKey);

    return {
      statusCode: 200,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Gemini Receipt Function Error:', error);
    return {
      statusCode: 502,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ error: error.message || 'Failed to analyze receipt.' })
    };
  }
};