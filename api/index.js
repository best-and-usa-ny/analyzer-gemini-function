const { GoogleGenAI } = require('@google/genai');

// Ключ берется из переменных окружения Vercel (GEMINI_API_KEY)
const geminiKey = process.env.GEMINI_API_KEY;

// Инициализируем Gemini
const ai = new GoogleGenAI({ apiKey: geminiKey });

// Главный HTTP-обработчик для Vercel
module.exports = async (req, res) => {
    
    // === НОВЫЙ БЛОК: Устанавливаем заголовки ОДИН РАЗ ===
    // Это "разрешение" теперь будет прикреплено к ЛЮБОМУ ответу (даже к ошибкам)
    const allowedOrigin = 'https://analyzer.xn----8sba0c1a2a.xn--p1ai';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // =========================

    // Обработка OPTIONS (проверка связи)
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // Обработка POST (основной запрос)
    if (req.method === 'POST') {
        try {
            const prompt = req.body.prompt;
            if (!prompt) {
                return res.status(400).json({ error: 'Missing prompt' });
            }
            
            // Пытаемся вызвать Gemini
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: "user", parts: [{ text: prompt }] }],
            });
            
            // Успешный ответ
            return res.status(200).json({ text: response.text });

        } catch (error) {
            // !!! ВОТ ЧТО НАМ НУЖНО !!!
            // Если Gemini "упал" (например, неверный API ключ):
            console.error("Gemini API Error:", error.message); // Записываем ошибку в лог
            
            // Отправляем ошибку 500. Т.к. заголовки (CORS) уже установлены,
            // браузер не будет жаловаться на CORS, а мы увидим ЭТУ ошибку в логах.
            return res.status(500).json({ 
                error: 'Internal server error while calling Gemini', 
                details: error.message // Отправляем детали ошибки
            });
        }
    }
    
    // Если это не POST и не OPTIONS
    return res.status(405).json({ error: 'Method Not Allowed' });
};
