// api/index.js
import { GoogleGenerativeAI } from '@google/generative-ai';

// CORS настройки (обязательно!)
export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader('Access-Control-Allow-Origin', 'https://analyzer.лучшее-и-люди.рф');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Only POST requests are allowed' });
    return;
  }

  try {
    // 1. Ключ API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY не найден в Vercel');
    }

    // 2. Промпт
    const { prompt } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'Промпт (prompt) не найден в теле запроса' });
      return;
    }

    // 3. Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent(prompt);
    const advice = result.response.text();

    // 4. Ответ
    res.status(200).json({ advice });

  } catch (error) {
    console.error('Gemini error:', error);
    res.status(500).json({ error: error.message || 'Внутренняя ошибка' });
  }
}
