// /api/index.js

import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
    api: { bodyParser: true },
};

// --- Функция задержки ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- Функция "Агрессивного Дозвона" ---
async function callGeminiWithRetry(model, prompt, retries = 3) {
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
        * Задача: Регулярный отток желчи, чтобы камни не росли.
        * Правило: Не делать перерывов в еде больше 3-4 часов. Жиры нужны, но качественные и понемногу.`,
        'gi_issues': `СТРАТЕГИЯ: ПРОБЛЕМЫ С ЖКТ (СИБР, СРК, Гастрит).
        * Режим: Щадящий. Никакой грубой клетчатки в обострении.
        * Акцент B&P: Aloe Vera (заживление), Detox Gentle (мягкая каша), БЕЗ молочных коктейлей если есть непереносимость.`,
        
        // Спец. протоколы
        'app': `СТРАТЕГИЯ: АНТИПАРАЗИТАРНАЯ ПРОГРАММА.
        * ЖЕСТКИЙ ЗАПРЕТ: Сахар, молоко, дрожжи, глютен, сладкие фрукты.
        * Разрешено B&P: Только несладкие супы, каша Detox Gentle (на воде), Herbal Mix (печеночный/детокс).
        * Если клиент съел сладкое: Ругай (вежливо). Это кормит патогенов.`,
        'anticandida': `СТРАТЕГИЯ: АНТИКАНДИДНЫЙ ПРОТОКОЛ.
        * Аналогично АПП: Нет сахару, дрожжам, плесени (сыры).
        * Акцент: Aloe Vera, Herbal Mix (Детокс), It's Fiber.`,
        'keto': `СТРАТЕГИЯ: КЕТО / LCHF.
        * Акцент: Много жиров, умеренно белка, минимум углеводов.
        * B&P: Протеин (Best Protein) добавлять в жирные блюда. Осторожно с коктейлями (там есть углеводы), лучше чистое Пюре или Супы с добавлением масла.`,
        'vegan': `СТРАТЕГИЯ: ВЕГАНСТВО.
        * Проблема: Дефицит белка и B12.
        * Акцент B&P: Shape Smart Food Vegan (супы), каша Detox Gentle.`
    };
    
    return strategies[goalCode] || strategies['lose']; // По умолчанию похудение
}

// --- Сборка Промпта ---
function buildAnalysisPrompt(userData) {
    const { goal, dailyFact, dailyTarget, meals } = userData;
    const formattedMeals = formatMealsForPrompt(meals);
    const specificStrategy = getGoalStrategy(goal);

    return `[[1. ТВОЯ РОЛЬ]
Ты - Андрей Солдатенко, нутрициолог с 20-летним стажем, основатель Best&People.
* **ТОН:** На "ВЫ". Экспертный, строгий, но заботливый. Ты видишь организм насквозь.
* **КОНТЕКСТ:** Ты анализируешь рацион клиента через призму его ЦЕЛИ.

[2. ВХОДНЫЕ ДАННЫЕ]
* **Цель (Goal ID):** ${goal}
* **ФАКТ:** К:${dailyFact.calories}, Б:${dailyFact.proteins}, Ж:${dailyFact.fats}, У:${dailyFact.carbs}, Вода:${dailyFact.water}.
* **ЦЕЛЬ:** К:${dailyTarget.calories}, Б:${dailyTarget.proteins}, Ж:${dailyTarget.fats}, У:${dailyTarget.carbs}, Вода:${dailyTarget.water}.
* **РАЦИОН:**
${formattedMeals}

[3. СТРАТЕГИЯ АНАЛИЗА ДЛЯ ЦЕЛИ: "${goal}"]
!!! ТЫ ОБЯЗАН ИСПОЛЬЗОВАТЬ ЭТУ ЛОГИКУ ПРИ РАЗБОРЕ КАЖДОГО ПРИЕМА ПИЩИ !!!
${specificStrategy}

[4. ИНСТРУКЦИЯ ПО ГЕНЕРАЦИИ (СТРУКТУРА ОТВЕТА)]

**БЛОК 1: Вода и Фундамент**
Кратко про воду и БЖУ. Если воды мало — объясни риск именно для цели "${goal}" (например, для ЖКТ — запоры, для похудения — отек).

**БЛОК 2: Хронологический Разбор (Завтрак -> Обед -> Ужин)**
Проходи по порядку.
* **Если прием пищи БЫЛ:**
  1. Оцени продукты: подходят ли они для цели "${goal}"? (Например, если Диабет — ругай за сахар. Если АПП — ругай за молоко).
  2. **Дай рекомендацию (Метод Двух Путей):**
     * *Обычная еда:* Как улучшить эту тарелку?
     * *Best&People:* Какой продукт B&P идеально впишется сюда для цели "${goal}"?

* **Если прием пищи ПРОПУЩЕН:**
  1. **ОБЪЯСНИ РИСК ИМЕННО ДЛЯ ЦЕЛИ "${goal}"**. (Например, "Нет желчного + пропуск обеда = опасно!", "Похудение + пропуск полдника = срыв").
  2. Предложи решение: быстрый перекус обычной едой или продукт B&P.

**БЛОК 3: Акцент на 16:00 (Полдник)**
Всегда выделяй этот блок. Если полдника не было — напиши, почему он важен именно сейчас.

**БЛОК 4: Итог**
Мотивирующее заключение.

[5. ВАЖНО]
* Не используй общие фразы. Если у человека "Нет желчного", ты не имеешь права писать "питайтесь 3 раза в день". Ты должен писать "питайтесь дробно".
* Ссылайся на продукты Best&People как на инструмент решения проблемы конкретной цели.
`;
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

        // Карты названий целей для красивого заголовка
        const goalTitles = {
            'lose': 'Снижение веса', 'maintain': 'Поддержание формы', 'gain': 'Набор массы',
            'diabetes1': 'Контроль диабета 1 типа', 'diabetes2': 'Контроль диабета 2 типа',
            'no_gallbladder': 'Питание без желчного пузыря', 'gallstones': 'При ЖКБ',
            'gi_issues': 'Здоровье ЖКТ', 'app': 'Антипаразитарный протокол',
            'anticandida': 'Антикандидный протокол'
        };
        const currentGoalTitle = goalTitles[userData.goal] || 'Сбалансированное питание';

        const mandatoryOpening = `Приветствую! На связи Андрей Солдатенко.
Я проанализировал Ваш рацион с учетом Вашей цели: **${currentGoalTitle}**.`;
        
        const disclaimerBlock = `\n\n---\n**Важное примечание:** Данный разбор носит рекомендательный характер. При наличии заболеваний обязательно следуйте назначениям лечащего врача.`;

        const analysisPrompt = buildAnalysisPrompt(userData);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const aiText = await callGeminiWithRetry(model, analysisPrompt, 3);
        const fullText = mandatoryOpening + "\n\n" + aiText.trim() + disclaimerBlock;

        res.status(200).json({ text: fullText });

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Generation failed' });
    }
}
