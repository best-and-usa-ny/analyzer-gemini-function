// api/index.js
import { GoogleGenerativeAI } from '@google/generative-ai';

// CORS для твоего фронтенда
export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  // CORS заголовки
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
    // 1. Проверяем ключ (из Vercel env)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY не найден в Vercel Environment Variables');
    }

    // 2. Проверяем промпт
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Промпт (prompt) обязателен и должен быть строкой' });
      return;
    }

    // 3. Инициализируем Gemini 2.5 Flash
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash'  // Новая модель: быстрее, 1M контекст
    });

    // 4. Генерируем ответ (с safety settings для диетологии)
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,  // Баланс креативности/точности
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,  // Достаточно для 3-5 советов
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    });

    const advice = result.response.text().trim();

    // 5. Успешный ответ
    res.status(200).json({ 
      advice: advice || 'Gemini не смог сгенерировать совет — попробуйте другой промпт.' 
    });

  } catch (error) {
    console.error('Gemini 2.5 error:', error);
    
    // Расширенная обработка ошибок
    let errorMsg = 'Внутренняя ошибка сервера';
    if (error.message.includes('quota')) errorMsg = 'Превышен лимит запросов — подождите 1 час.';
    else if (error.message.includes('invalid_argument')) errorMsg = 'Неверный промпт — сделайте его короче.';
    else if (error.message.includes('permission_denied')) errorMsg = 'Проблема с API-ключом — проверьте ограничения в Google Cloud.';
    else errorMsg = error.message;

    res.status(500).json({ error: errorMsg });
  }
}
