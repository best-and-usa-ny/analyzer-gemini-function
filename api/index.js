// /api/index.js

import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
    api: { bodyParser: true },
};

// --- Функция задержки ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- Функция "Агрессивного Дозвона" (усилена до 6 попыток) ---
async function callGeminiWithRetry(model, prompt, retries = 6) {
    let delay = 2000;
    for (let i = 0; i < retries; i++) {
        try {
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (err) {
            const isOverloaded = err.message.includes('503') || err.message.includes('overloaded') || err.message.includes('429');
            if (isOverloaded) {
                if (i === retries - 1) throw err;
                console.warn(`Gemini перегружен. Попытка ${i + 1}. Ждем...`);
                await sleep(delay);
                delay *= 1.5;
                continue;
            }
            throw err;
        }
    }
}

// --- Форматирование списка продуктов ---
function formatMealsForPrompt(meals) {
    if (!meals || Object.keys(meals).length === 0) return 'Приемы пищи не записаны.';
    let mealSummary = '';
    for (const mealKey in meals) {
        const meal = meals[mealKey];
        mealSummary += `\n[ПРИЕМ ПИЩИ: ${meal.name}]\n`;
        if (meal.items && meal.items.length > 0) {
            meal.items.forEach(item => {
                mealSummary += `   - Продукт: ${item.name} | Вес: ${Math.round(item.grams)}г | КБЖУ: ${Math.round(item.calories)}/${Math.round(item.proteins)}/${Math.round(item.fats)}/${Math.round(item.carbs)}\n`;
            });
        } else {
            mealSummary += `   - (Пустой прием пищи)\n`;
        }
    }
    return mealSummary;
}

// --- БАЗА СТРАТЕГИЙ ПО ЦЕЛЯМ (СЕРДЦЕ ЛОГИКИ) ---
function getGoalStrategy(goalCode) {
    const strategies = {
        // Управление весом
        'lose': `СТРАТЕГИЯ: СНИЖЕНИЕ ВЕСА.
        * Главный враг: Инсулиновые пики и голод вечером.
        * Правило пропусков: Нельзя пропускать полдник (16:00), иначе будет срыв на ужин.
        * Акцент B&P: Коктейли Shape вместо ужина для дефицита калорий.`,
        'maintain': `СТРАТЕГИЯ: ПОДДЕРЖАНИЕ ФОРМЫ.
        * Главный враг: Дисбаланс БЖУ.
        * Акцент: Баланс обычной еды и продуктов B&P для удобства.`,
        'gain': `СТРАТЕГИЯ: НАБОР МАССЫ.
        * Главный враг: Дефицит калорий и белка.
        * Правило: Есть каждые 3 часа. B&P продукты идут ДОПОЛНИТЕЛЬНО к еде, а не вместо.`,
        
        // Здоровье
        'diabetes1': `СТРАТЕГИЯ: САХАРНЫЙ ДИАБЕТ 1 ТИПА.
        * ВАЖНО: Строгий подсчет ХЕ (Хлебных Единиц).
        * Анализ: Следи за углеводами. Предупреждай о продуктах с высоким ГИ.
        * Рекомендация: It's Fiber для снижения скачков сахара.`,
        'diabetes2': `СТРАТЕГИЯ: САХАРНЫЙ ДИАБЕТ 2 ТИПА / ИНСУЛИНОРЕЗИСТЕНТНОСТЬ.
        * ВАЖНО: Контроль Гликемической Нагрузки (ГН).
        * Запреты: Сахар, белая мука, перекусы фруктами без белка.
        * Акцент B&P: Овощные супы, несладкие коктейли, It's Fiber.`,
        'no_gallbladder': `СТРАТЕГИЯ: НЕТ ЖЕЛЧНОГО ПУЗЫРЯ.
        * КРИТИЧЕСКИ ВАЖНО: Дробное питание (5-6 раз). Желчь течет постоянно!
        * Опасность: Голодание = ожог слизистой. Большие порции жирного = диарея/боль.
        * Решение: Маленькие порции часто. Пюре Re:Balance и супы B&P — идеальны, так как легкие для усвоения.`,
        'gallstones': `СТРАТЕГИЯ: ЖЕЛЧНОКАМЕННАЯ БОЛЕЗНЬ (ЖКБ).
        * ВАЖНО: Регулярный отток желчи. Не делать больших перерывов (>4 часов).
        * Запреты: Жирное/жареное. Рекомендация: Горечи (Herbal Mix) для оттока.`,
        'gi_issues': `СТРАТЕГИЯ: ЗДОРОВЬЕ ЖКТ.
        * ВАЖНО: Щадящее питание. Aloe Vera — база для заживления слизистой.
        * Запреты: Грубая пища в обострении. Рекомендация: Пюре и супы B&P.`,
        'app': `СТРАТЕГИЯ: АНТИПАРАЗИТАРНАЯ ПРОГРАММА (АПП).
        * ЖЕСТКИЙ ЗАПРЕТ: Сахар, Молоко, Дрожжи, Глютен. Иначе кормим паразитов!
        * Акцент: Очищение (Aloe Vera, Drain). Каша Detox Gentle — личная история спасения.`,
        'anticandida': `СТРАТЕГИЯ: АНТИКАНДИДНЫЙ ПРОТОКОЛ.
        * ЖЕСТКИЙ ЗАПРЕТ: Сладкое, Мучное. Грибки любят сахар!
        * Акцент: Очищение (Aloe Vera, Drain). Каша Detox Gentle — для микрофлоры.`
    };
    return strategies[goalCode] || strategies['lose'];
}

// --- БАЗА ЗНАНИЙ О ПРОДУКТАХ B&P ---
function getProductKnowledgeBase() {
    return `БАЗА ПРОДУКТОВ BEST&PEOPLE:
* Aloe Vera Smart Food: Очищение ЖКТ. 150-200 мл натощак. Для всех целей — база. При ЖКТ проблемах — заживляет слизистую.
* Shape Smart Food: Коктейль. Чистый белок (изолят). Замена приема пищи. Для похудения — вечерний дефицит. Для диабета — низкий ГИ.
* Detox Gentle: Каша (Яблочный пирог). Клетчатка + витамины. Для АПП/Антикандида — личная история спасения (рассказать).
* It's Fiber: Клетчатка (Яблоко-Корица). Для диабета — сглаживает сахар. Режимы: 1 (профилактика), 2 (запоры), 3 (SOS).
* Пюре Re:Balance: Легкий обед. Для без желчного — мягкая текстура, не нагружает.
* Herbal Mix: Горечи для желчи. Для ЖКБ — отток желчи.`;
}

// --- Сборка Промпта (МОЗГ СИСТЕМЫ) ---
function buildAnalysisPrompt(userData) {
    const { goal, dailyFact, dailyTarget, meals } = userData;
    const goalStrategy = getGoalStrategy(goal);
    const formattedMeals = formatMealsForPrompt(meals);
    const productBase = getProductKnowledgeBase();

    return `ТЫ — Андрей Солдатенко, нутрициолог (20 лет), основатель Best&People.
СТИЛЬ: Уважительный ("Вы"), уверенный, наставнический. Не робот. Говори просто о сложном.

ФИЛОСОФИЯ:
* Обычная еда — пустая (истощенные почвы).
* B&P — умная еда (технологии сохранения пользы, как у космонавтов).
* Вода — душ для клеток (чай/пиво — не вода).

ВХОДНЫЕ ДАННЫЕ:
* Цель: "${goalStrategy}"
* Факт: Калории:$$ {dailyFact.calories}, Белки: $${dailyFact.proteins}, Жиры:$$ {dailyFact.fats}, Углеводы: $${dailyFact.carbs}, Клетчатка:$$ {dailyFact.fiber}, Вода: $${dailyFact.water} мл.
* Цель: Калории:$$ {dailyTarget.calories}, Белки: $${dailyTarget.proteins}, Жиры:$$ {dailyTarget.fats}, Углеводы: $${dailyTarget.carbs}, Клетчатка:$$ {dailyTarget.fiber}, Вода: $${dailyTarget.water} мл.
* Приемы пищи: ${formattedMeals}
* База продуктов: ${productBase}

ЗАДАЧА: Разбор рациона с акцентом на цель. Объясняй физиологию (почему так) и дай решение (как исправить).

СТРУКТУРА ОТВЕТА (СТРОГО):
**БЛОК 1: Вода и Фундамент**
Кратко про воду и БЖУ. Если воды мало — объясни риск именно для цели (e.g., для ЖКТ — запоры).

**БЛОК 2: Хронологический Разбор (Завтрак -> Обед -> Ужин)**
Проходи по порядку.
* Если прием БЫЛ: Оцени продукты для цели. Дай рекомендацию (Метод Двух Путей): Обычная еда vs Best&People.
* Если ПРОПУЩЕН: Объясни риск для цели. Предложи решение.

**БЛОК 3: Акцент на 16:00 (Полдник)**
Если не было — почему важен.

**БЛОК 4: Итог**
Мотивация.

ЗАПРЕТЫ: Нет списков продуктов/КБЖУ в тексте. Нет кодов ("lose"). Нет скобок [ ].

ОТВЕТ НА РУССКОМ.`;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Only POST' }); return; }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY not found');
        const userData = req.body;
        if (!userData || !userData.dailyFact) {
             res.status(400).json({ error: 'Invalid user data' });
             return;
        }

        const mandatoryOpening = `Приветствую! На связи Андрей Солдатенко.
Я проанализировал Ваш рацион с учетом Вашей цели.`;

        const disclaimerBlock = `\n\n---\n**Важное примечание:** Данный разбор носит рекомендательный характер. При наличии заболеваний обязательно следуйте назначениям лечащего врача.`;

        const analysisPrompt = buildAnalysisPrompt(userData);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

        const aiText = await callGeminiWithRetry(model, analysisPrompt, 6);
        const fullText = mandatoryOpening + "\n\n" + aiText.trim() + disclaimerBlock;

        res.status(200).json({ text: fullText });

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Generation failed' });
    }
}
