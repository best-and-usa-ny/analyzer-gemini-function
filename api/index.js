// /api/index.js

import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
    api: { bodyParser: true },
};

// Retry с экспоненциальной задержкой
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callGeminiWithRetry(model, prompt, retries = 6) {
    let delay = 1500;
    for (let i = 0; i < retries; i++) {
        try {
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (err) {
            if (err.message.includes('503') || err.message.includes('429') || err.message.includes('overloaded')) {
                if (i === retries - 1) throw err;
                console.warn(`Gemini перегружен. Попытка ${i + 1}/${retries}`);
                await sleep(delay);
                delay = Math.min(delay * 1.7, 10000);
                continue;
            }
            throw err;
        }
    }
}

// Форматирование приёмов (только для промпта, не в ответе)
function formatMeals(meals) {
    if (!meals || Object.keys(meals).length === 0) return 'Приёмы пищи не добавлены.';
    let text = '';
    for (const key in meals) {
        const m = meals[key];
        text += `\n**${m.name}**:\n`;
        if (m.items?.length > 0) {
            m.items.forEach(item => {
                text += `- ${item.name} (${Math.round(item.grams)}г, К:${Math.round(item.calories)} Б:${Math.round(item.proteins)} Ж:${Math.round(item.fats)} У:${Math.round(item.carbs)})\n`;
            });
        } else {
            text += `- Нет продуктов\n`;
        }
    }
    return text;
}

// Словарь целей и стратегий (из 1.txt)
function getGoalInfo(goalCode) {
    const goals = {
        lose: { title: 'снижение веса', strategy: 'Главный враг - инсулин вечером. Пропуск полдника = срыв. Фокус на дефицит калорий без потери мышц.' },
        gain: { title: 'набор мышечной массы', strategy: 'Профицит калорий и белка. Есть каждые 3 часа. Акцент на строительный материал для ДНК.' },
        maintain: { title: 'поддержание формы', strategy: 'Баланс БЖУ. Удержание веса сложнее, чем сброс. Избегать скачков сахара.' },
        diabetes1: { title: 'сахарный диабет 1 типа', strategy: 'Строгий контроль ХЕ. Никаких быстрых углеводов. Сглаживать инсулиновые пики.' },
        diabetes2: { title: 'сахарный диабет 2 типа', strategy: 'Низкая Гликемическая Нагрузка. Убираем скачки сахара. Фокус на It's Fiber для стабилизации.' },
        no_gallbladder: { title: 'отсутствие желчного пузыря', strategy: 'Дробное питание (5-6 раз). Желчь течет постоянно, нельзя голодать! Избегать застоя.' },
        gallstones: { title: 'желчнокаменная болезнь', strategy: 'Регулярный отток желчи. Жиры нужны, но правильные. Горечи и травы для предотвращения камней.' },
        gi_issues: { title: 'проблемы с ЖКТ', strategy: 'Щадящее питание. Aloe Vera - база для заживления. Избегать раздражителей.' },
        pregnancy: { title: 'беременность / лактация', strategy: 'Баланс для мамы и ребенка. Дополнительный белок и клетчатка. Избегать токсинов.' },
        app: { title: 'антипаразитарная программа', strategy: 'СТОП: Сахар, Молоко, Дрожжи, Глютен. Иначе кормим паразитов. Фокус на выведение токсинов.' },
        anticandida: { title: 'антикандидный протокол', strategy: 'Аналогично АПП. Грибки любят сладкое и мучное. Очищение с Detox Gentle.' },
        keto_lchf: { title: 'кето / LCHF', strategy: 'Низкие углеводы, высокие жиры. Поддерживать кетоз. Вода критично для метаболизма.' },
        vegan_veg: { title: 'веганство / вегетарианство', strategy: 'Полноценный белок из растений. Дополнять Shape vegan. Избегать дефицита.' }
    };
    return goals[goalCode] || goals['lose'];
}

// Промпт с полной базой и стратегиями
function buildPrompt(userData) {
    const { goal, dailyFact, dailyTarget, glHistory = {}, meals = {} } = userData;
    const formattedMeals = formatMeals(meals);
    const goalInfo = getGoalInfo(goal);

    return `Ты - Андрей Солдатенко, нутрициолог с 20-летним стажем, основатель Best&People. Обращайся исключительно на "Вы", стиль - строгий, профессиональный, честный, уважительный.

ВХОДНЫЕ ДАННЫЕ
Цель: ${goalInfo.title} (стратегия: ${goalInfo.strategy})
Факт: Калории ${dailyFact.calories}, Белки ${dailyFact.proteins}г, Жиры ${dailyFact.fats}г, Углеводы ${dailyFact.carbs}г, Клетчатка ${dailyFact.fiber}г, Вода ${dailyFact.water}мл, ГН ${dailyFact.gl || '-'}.
Цель: Калории ${dailyTarget.calories}, Белки ${dailyTarget.proteins}г, Жиры ${dailyTarget.fats}г, Углеводы ${dailyTarget.carbs}г, Клетчатка ${dailyTarget.fiber}г, Вода ${dailyTarget.water}мл.
Динамика ГН: неделя ${glHistory.week || '-'}, 2 недели ${glHistory.twoWeeks || '-'}, 5 недель ${glHistory.fiveWeeks || '-'}.
Приёмы: ${formattedMeals}

БАЗА ЗНАНИЙ
Продукты B&P - умная еда, технологии сохранения пользы (как у космонавтов или детского питания, упоминать только если нужно закрыть возражение). Белок - ДНК, строительный материал. Скачки сахара: быстрые углеводы вызывают впрыск инсулина, излишки в жир. Клеточный голод: люди приучили желудок, но клетки недополучают, рождают больные. Шлаки: в межклеточном пространстве (70-100 трлн клеток, отходы жизнедеятельности), вода моет клетки. Застой желчи: горечи, травы. Идеальный завтрак: 3 шага - 1. Очищение (Aloe Vera/Drain), 2. Питание (Shape/Detox Gentle), 3. Энергия (Herbal Mix) - адаптировать к цели.

Полная база продуктов B&P с КБЖУ, составами, способами (используй точно в рекомендациях):
- It's Fiber (Яблоко-Корица): К:210, Б:4, Ж:1, У:46.3, Клетч:84. Порция 10г. Состав: яблоко порошок, полидекстроза... [полный состав из документа]. Приготовление: 10г + 250мл воды, размешать. Режимы: 1-профилактика (10г вечером), 2-восстановление (5г 1-4 дня, потом 10г), 3-SOS (10г в 350-400мл + 250мл воды).
- Пюре Re:Balance (С Беконом): К:363.3, Б:32, Ж:5.3, У:46.8, Клетч:10. Порция 30г. Состав: картофельные хлопья, изолят соевого белка... [полный]. Приготовление: 30г + 120-150мл воды 65-85°C, размешать, настоять 2-3 мин.
- [добавьте все остальные продукты из вашего документа аналогично, без truncation - полный текст]

СТРУКТУРА ОТВЕТА (строго, без скобок, перечислений продуктов/КБЖУ в тексте - только в рекомендациях примеры; ЗАПРЕЩЕНО писать коды вроде "lose", только русские названия; ЗАПРЕЩЕНО упоминать "порошки" заранее):
1. Персональные рекомендации от Андрея Солдатенко
2. Краткий обзор КБЖУ, ГН, воды (связать с целью/стратегией, риски: для снижения веса - профицит ведет к набору, дефицит воды - отеки, шлаки в межклеточном пространстве).
3. Золотой стандарт (идеальный завтрак 3 шага, адаптировать к цели; полдник 16:00-17:00 - биологические часы усвоения, дать максимум хорошего для тела по стратегии).
4. Пошаговый разбор каждого приёма (Завтрак, Второй завтрак, Обед, Полдник, Ужин, Перекусы): Что хорошо/плохо (связать с целью, клеточный голод, инсулин, шлаки); Ошибки (риски для цели по стратегии); МЕТОД ДВУХ ПУТЕЙ: Вариант 1 - обычная еда (примеры с КБЖУ, почему для цели, покажи сложно/долго); Вариант 2 - B&P (название, порция, КБЖУ, почему для цели, удобно/эффективно). Если нет - предложить добавить по стратегии.
5. Итоговые рекомендации на завтра (меню с вариантами 1-2, прогноз для цели: минус 0.5-1 кг для снижения веса).
6. Мотивация (каждый кусок - лекарство или нагрузка; выбирайте мудро).

Ответ на русском, markdown, эмодзи ок, но без лишнего.`;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('Нет GEMINI_API_KEY');

        const userData = req.body;
        if (!userData?.dailyFact || !userData?.dailyTarget || !userData?.goal) {
            return res.status(400).json({ error: 'Нет данных' });
        }

        const goalInfo = getGoalInfo(userData.goal);
        const mandatoryOpening = `Приветствую! На связи Андрей Солдатенко.
Я проанализировал Ваш рацион с учетом Вашей цели: ${goalInfo.title}.`;

        const prompt = buildPrompt(userData);

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

        const text = await callGeminiWithRetry(model, prompt);

        // Дисклеймер приклеен в коде
        const disclaimerBlock = `\n\n---\n\n**ВАЖНОЕ ПРИМЕЧАНИЕ:** Данные рекомендации основаны на анализе предоставленных Вами цифр и моем профессиональном опыте. Они носят информационный характер. Вы принимаете на себя полную ответственность за использование этой информации. Если у Вас имеются хронические заболевания или Вы принимаете лекарственные препараты, перед любыми изменениями в рационе обязательна консультация с Вашим лечащим врачом.`;

        const fullText = mandatoryOpening + "\n\n" + text.trim() + disclaimerBlock;

        res.status(200).json({ text: fullText });

    } catch (error) {
        console.error('Ошибка:', error.message);
        res.status(500).json({ error: 'Не удалось сгенерировать' });
    }
}
