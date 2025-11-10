const { GoogleGenAI } = require('@google/genai');

// Ключ берется из переменных окружения Vercel (GEMINI_API_KEY)
const geminiKey = process.env.GEMINI_API_KEY;

// Инициализируем Gemini
const ai = new GoogleGenAI({ apiKey: geminiKey });

// Главный HTTP-обработчик для Vercel
module.exports = async (req, res) => {
    
    // === ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ ===
    // Мы указываем "шифр" (Punycode) вашего домена.
    const allowedOrigin = 'https://analyzer.xn----8sba0c1a2a.xn--p1ai';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    // =========================

    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Обработка OPTIONS-запросов (предварительная проверка браузером)
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Получаем промт из тела запроса
        const prompt = req.body.prompt;

        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt in request body' });
        }

        // Вызываем модель Gemini
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        // Отправляем чистый ответ обратно
        res.status(200).json({
            text: response.text,
        });

    } catch (error) {
        console.error("Gemini API Error:", error);
        res.status(500).json({ error: 'Internal server error while calling Gemini API' });
    }
};
