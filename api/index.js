import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
    api: { bodyParser: true },
};

// --- 1. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callGeminiWithRetry(model, prompt, retries = 3) {
    let delay = 2000;
    for (let i = 0; i < retries; i++) {
        try {
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (err) {
            console.warn(`Gemini 503/Overloaded. Попытка ${i + 1}/${retries}`);
            if (i === retries - 1) throw err;
            await sleep(delay);
            delay *= 1.5;
        }
    }
}

function formatMealsForAnalysis(meals) {
    if (!meals || Object.keys(meals).length === 0) return 'Данные о приемах пищи отсутствуют (голод).';
    let text = '';
    for (const key in meals) {
        const m = meals[key];
        text += `[Прием: ${m.name}]\n`;
        if (m.items?.length) {
            m.items.forEach(item => {
                text += ` - ${item.name} (${item.grams}г): Ккал ${item.calories}, Б ${item.proteins}, Ж ${item.fats}, У ${item.carbs}\n`;
            });
        } else {
            text += ` - Пусто\n`;
        }
    }
    return text;
}

function getGoalTitle(goalCode) {
    const goals = {
        'lose': 'Снижение веса',
        'maintain': 'Поддержание веса и здоровья',
        'gain': 'Набор мышечной массы',
        'diabetes1': 'Контроль диабета 1 типа',
        'diabetes2': 'Контроль диабета 2 типа / ИР',
        'no_gallbladder': 'Питание при удаленном желчном',
        'gallstones': 'Питание при ЖКБ (камни)',
        'gi_issues': 'Восстановление ЖКТ',
        'app': 'Антипаразитарная программа',
        'anticandida': 'Антикандидный протокол'
    };
    return goals[goalCode] || 'Снижение веса';
}

// --- 2. ГЕНЕРАЦИЯ ПРОМПТА ---
function buildAnalysisPrompt(userData) {
    const { goal, dailyFact, dailyTarget, meals } = userData;
    const goalTitle = getGoalTitle(goal);
    const mealsData = formatMealsForAnalysis(meals);

    const gallbladderCondition = (goal === 'no_gallbladder' || goal === 'gallstones') 
        ? "КРИТИЧНО ВАЖНО: У клиента проблемы с желчным. Обязательно напомни про дробное питание (5-6 раз), иначе застой желчи или ожог кишечника." 
        : "Напомни про важность питания 4-5 раз в день для разгона метаболизма и профилактики застоя желчи.";

    return `
Ты — Андрей Солдатенко, нутрициолог с 20-летним стажем и основатель компании Best&People.
Твоя задача: Провести жесткий, но заботливый разбор рациона клиента.
Твой тон: Экспертный, честный, без сюсюканья, но уважительный (на "Вы"). Ты используешь метафоры ("душ для клеток", "строительный материал", "пустые калории").

=== ВХОДНЫЕ ДАННЫЕ ===
ЦЕЛЬ КЛИЕНТА: ${goalTitle}
ФАКТ (за день): Калории ${dailyFact.calories} (Цель ${dailyTarget.calories}), Белки ${dailyFact.proteins} (Цель ${dailyTarget.proteins}), Вода ${dailyFact.water} мл (Цель ${dailyTarget.water} мл).
ОСТАЛЬНЫЕ МАКРОСЫ: Ж ${dailyFact.fats}, У ${dailyFact.carbs}, Клетчатка ${dailyFact.fiber}.
МЕНЮ КЛИЕНТА (ДЛЯ АНАЛИЗА):
${mealsData}

=== ТВОЯ ФИЛОСОФИЯ И БАЗА ЗНАНИЙ ===
1. **Вода:** Жидкость (чай, кофе, пиво, суп) ≠ Вода. Клеткам нужен душ. Межклеточное пространство накапливает "шлаки" (продукты распада), их надо вымывать.
2. **Идеальный завтрак (3 шага):**
   - Шаг 1: Очищение (Aloe Vera). Запускает ЖКТ.
   - Шаг 2: Питание (Shape Smart Food / Detox Gentle). Кормит клетку.
   - Шаг 3: Энергия (Herbal Mix). Термогенез и бодрость.
   *Если чего-то нет — это не идеальный завтрак.*
3. **Золотой час (16:00-17:00):** Время падения сахара. Обязателен полдник (Detox Gentle / Shape), иначе вечерний жор.
4. **Продукты Best&People (B&P):** Это "Умная еда" (как у космонавтов), технологии сохранения пользы. Это не "химия", это еда для клеток.
5. **Обычная еда:** Часто "пустая". Чтобы получить норму нутриентов из обычной еды, нужно съесть "ведро" и получить ожирение.

=== ИНСТРУКЦИЯ ПО СТРУКТУРЕ ОТВЕТА (СТРОГО!) ===

**ВАЖНО: НЕ ПИШИ ПРИВЕТСТВИЕ В НАЧАЛЕ ОТВЕТА. ПРИВЕТСТВИЕ УЖЕ ДОБАВЛЕНО В ПРОГРАММЕ. СРАЗУ НАЧИНАЙ С БЛОКА ПРО ВОДУ.**

1. **БЛОК "ВОДНЫЙ БАЛАНС: ДУШ ДЛЯ КЛЕТОК":**
   - Сравни Факт и Цель по воде.
   - Если пил алкоголь/газировку: Жестко скажи, что это не вода, а токсины. Клеткам нужен душ, а не пиво.
   - Объясни про межклеточное пространство и отеки.

2. **БЛОК "РАЗБОР РАЦИОНА" (Иди по хронологии):**
   *ВАЖНО: ЗАПРЕЩЕНО перечислять список продуктов с граммами и КБЖУ в начале блоков! (Не пиши: "Вы съели Курицу 300г..."). Сразу пиши АНАЛИЗ.*

   **(А) ЗАВТРАК:**
   - Проверь наличие 3-х шагов (Алоэ, Коктейль/Каша, Чай).
   - Если чего-то нет: "Ваш завтрак неполный. Вы запустили организм, но не накормили клетку..." (или наоборот).
   - Если обычная еда: Объясни, почему она проигрывает (долго усваивается, тяжесть).

   **(Б) ОБЕД И УЖИН:**
   - Найди главную ошибку (алкоголь, жареное, сахар, дефицит белка).
   - Объясни вред для цели (инсулиновые качели, нагрузка на печень).
   - **ПРИМЕНИ МЕТОД ДВУХ ПУТЕЙ (ОБЯЗАТЕЛЬНО ДЛЯ УЖИНА):**
     * Четко напиши: "У Вас есть два пути решения:"
     * **Путь 1 (Обычная еда):** Опиши, что нужно приготовить (сложно, долго, нужно считать КБЖУ). Например: "Варить куриную грудку, резать тазик салата..."
     * **Путь 2 (Умные продукты B&P):** Предложи заменить на Shape Smart Food или Пюре Re:Balance. Аргументы: "Вкусно, 1 минута, идеальный баланс, клетка сыта, жир горит".

   **(В) ЗОЛОТОЙ ЧАС (16:00):**
   - Если полдника не было: "Вы пропустили Золотой час. Это риск срыва вечером." Рекомендуй Detox Gentle.

3. **БЛОК "ФИЗИОЛОГИЯ И РЕЖИМ":**
   - ${gallbladderCondition}
   - Про дефицит белка: Белок = ДНК. Если нет белка, организм "ест" свои мышцы. Решение: Best Protein.

4. **МОТИВАЦИЯ:**
   - "Каждый кусок — это или лекарство, или яд. Выбирайте мудро."

=== ЗАПРЕТЫ (CRITICAL) ===
- НЕ ИСПОЛЬЗУЙ КВАДРАТНЫЕ СКОБКИ В ЗАГОЛОВКАХ [ ].
- НЕ ПИШИ ВНУТРЕННИЕ КОДЫ (lose, gain). Пиши по-русски.
- НЕ ДЕЛАЙ СПИСКИ СЪЕДЕННОГО ("Продукт: Пиво, Вес: 3000г"). Сразу анализируй суть.
`;
}

// --- 3. ОСНОВНОЙ ОБРАБОТЧИК ---

export default async function handler(req, res) {
    // 1. CORS (обязательно для работы с твоим фронтом)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Only POST' });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('Нет GEMINI_API_KEY');

        const userData = req.body;
        if (!userData?.dailyFact || !userData?.goal) {
            return res.status(400).json({ error: 'Нет данных' });
        }

        // 2. Подготовка данных для "золотого сниппета"
        const goalTitle = getGoalTitle(userData.goal);
        
        // Формируем обязательное вступление (JS сторона)
        const mandatoryOpening = `Приветствую! На связи Андрей Солдатенко.\nЯ проанализировал Ваш рацион с учетом Вашей цели: **${goalTitle}**.\nДавайте начистоту: я буду говорить прямо, как эксперт, которому важно Ваше здоровье, а не просто сухие цифры.`;
        
        // Формируем дисклеймер (JS сторона)
        const disclaimerBlock = `\n\n------------------\n**ВАЖНОЕ ПРИМЕЧАНИЕ:**\nДанные рекомендации основаны на анализе предоставленных Вами цифр и моем профессиональном опыте. Они носят информационный характер.\nВы принимаете на себя полную ответственность за использование этой информации.\nЕсли у Вас имеются хронические заболевания или Вы принимаете лекарственные препараты, перед любыми изменениями в рационе обязательна консультация с Вашим лечащим врачом.`;

        // 3. ТВОЙ РАБОЧИЙ КУСОК КОДА (Интегрирован сюда)
        const analysisPrompt = buildAnalysisPrompt(userData);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Здесь 6 ретраев, как ты и просил
        const aiText = await callGeminiWithRetry(model, analysisPrompt, 6);
        
        // Склейка текста
        const fullText = mandatoryOpening + "\n\n" + aiText.trim() + disclaimerBlock;

        res.status(200).json({ text: fullText });

    } catch (error) {
        console.error('Error:', error.message);
        // Простое сообщение об ошибке, как в твоем коде
        res.status(500).json({ error: 'Generation failed' });
    }
}
