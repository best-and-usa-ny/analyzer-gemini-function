const { GoogleGenerativeAI } = require("@google/generative-ai");

// Обработчик для Vercel
module.exports = async (req, res) => {
    // --- (ВАЖНО!) НАСТРОЙКА CORS ---
    // Разрешаем вашему сайту делать запросы
    res.setHeader('Access-Control-Allow-Origin', 'https_analyzer.лучшее-и-люди.рф'); 
    // Разрешаем методы
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    // Разрешаем заголовки
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // (ВАЖНО!) Обработчик для "предварительного" запроса (OPTIONS)
    // Браузер сначала "спрашивает" разрешения перед POST
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    // --- КОНЕЦ БЛОКА CORS ---

    // Обрабатываем только POST-запросы
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Only POST requests are allowed' });
        return;
    }

    try {
        // 1. Получаем API-ключ из "сейфа" Vercel
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY не найден в Vercel.");
        }

        // 2. Получаем промпт от клиента (из app.js)
        const { prompt } = req.body;
        if (!prompt) {
            res.status(400).json({ error: "Промпт (prompt) не найден в теле запроса." });
            return;
        }

        // 3. Инициализируем Gemini
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel("gemini-1.5-flash-latest"); // Используем 1.5 Flash

        // 4. Отправляем запрос в Gemini
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // 5. Отправляем успешный ответ обратно в app.js
        res.status(200).json({ text: text });

    } catch (error) {
        // 6. Отправляем ошибку обратно в app.js
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};
