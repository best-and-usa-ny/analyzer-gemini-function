const functions = require('firebase-functions');
const { GoogleGenAI } = require('@google/genai');

// 1. Получаем секретный ключ из конфигурации Firebase
const geminiKey = functions.config().gemini.key;

// 2. Инициализируем Gemini с нашим секретным ключом
const ai = new GoogleGenAI({ apiKey: geminiKey });

// --- Главная функция: "Посредник" ---
// Она принимает HTTP-запрос от браузера и отвечает ему
exports.getNutritionAdvice = functions.https.onCall(async (data, context) => {

    // Проверка: Убедимся, что пользователь вошел в Firebase
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Требуется аутентификация для доступа к Gemini API.');
    }

    // Получаем промт (запрос) от app.js
    const prompt = data.prompt;

    if (!prompt) {
        throw new new functions.https.HttpsError('invalid-argument', 'Отсутствует текст запроса (prompt).');
    }

    try {
        // Вызываем модель Gemini с полученным промтом
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        // Возвращаем чистый текст ответа обратно в app.js
        return {
            text: response.text,
        };

    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new functions.https.HttpsError('internal', 'Произошла ошибка при обращении к Gemini API.');
    }
});