const { GoogleGenAI } = require('@google/genai');

// Главный HTTP-обработчик для Vercel
module.exports = async (req, res) => {
    
    // === БЛОК 1: Устанавливаем "разрешение" (CORS) ===
    // Он сработает для ЛЮБОГО ответа, даже для ошибок
    const allowedOrigin = 'https://analyzer.xn----8sba0c1a2a.xn--p1ai';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // ===============================================

    // БЛОК 2: Обработка "проверки связи"
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // БЛОК 3: Обработка ОСНОВНОГО запроса
    if (req.method === 'POST') {
        try {
            // === ВОТ ГЛАВНОЕ ИЗМЕНЕНИЕ ===
            // Мы "включаем" Gemini ЗДЕСЬ, внутри "ловушки"
            
            // 1. Пытаемся достать "спрятанный" ключ
            const geminiKey = process.env.GEMINI_API_KEY;
            if (!geminiKey) {
                // Если ключа в "сейфе" нет, "ломаемся" с понятной ошибкой
                throw new Error('GEMINI_API_KEY не найден на Vercel. Проверьте "Environment Variables".');
            }
            
            // 2. Пытаемся "включить" Gemini с этим ключом
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            
            // 3. Пытаемся получить промпт от пользователя
            const prompt = req.body.prompt;
            if (!prompt) {
                return res.status(400).json({ error: 'Missing prompt' });
            }
            
            // 4. Пытаемся вызвать Gemini
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: "user", parts: [{ text: prompt }] }],
            });
            
            // 5. Ура! Отправляем успешный ответ
            return res.status(200).json({ text: response.text });

        } catch (error) {
            // === НАША "ЛОВУШКА" ===
            // Если ЛЮБОЙ из 4 шагов выше "сломался" (неверный ключ, нет ключа и т.д.)
            
            // 1. Записываем НАСТОЯЩУЮ ошибку в лог Vercel
            console.error("!!! ОШИБКА В БЛОКЕ POST:", error.message); 
            
            // 2. Отправляем браузеру ошибку 500.
            // Так как "разрешение" (БЛОК 1) уже установлено, браузер не будет жаловаться на CORS!
            return res.status(500).json({ 
                error: 'Внутренняя ошибка сервера. Проблема с API Gemini.', 
                details: error.message 
            });
        }
    }
    
    // Если это не POST и не OPTIONS
    return res.status(405).json({ error: 'Method Not Allowed' });
};
