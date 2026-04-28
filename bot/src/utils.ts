import { z, type ZodIssue } from 'zod';
import type { EnvConfig } from './types';
import type { TranscriptExtractionResult } from './types';

const envSchema = z.object({
  TELEGRAM_TOKEN: z.string().min(1, 'TELEGRAM_TOKEN is required'),
  OPENCODE_URL: z.string().url().default('http://localhost:8888'),
  YTDLP_COOKIES_FROM_BROWSER: z.string().min(1).optional(),
  YTDLP_COOKIES_FILE: z.string().min(1).optional(),
});

/** Находит первую YouTube-ссылку в тексте и возвращает ее в исходном виде. */
const extractYouTubeUrl = (text: string): string | null => {
  const regex =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
  const match = text.match(regex);
  return match ? match[0] : null;
};

/** Валидирует и возвращает конфиг окружения для бота. */
const getEnvConfig = (): EnvConfig => {
  const envSource = {
    ...process.env,
    TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  };
  const result = envSchema.safeParse(envSource);
  if (!result.success) {
    const errors = result.error.issues.map((i: ZodIssue) => i.message).join(', ');
    throw new Error(`Env validation failed: ${errors}`);
  }
  return result.data;
};

/** Возвращает текст справки по доступным командам бота. */
const formatHelp = (): string => {
  return (
    '📖 *Список команд:*\n\n' +
    '/start - Начать работу\n' +
    '/help - Показать помощь\n' +
    '/analyze <url> - Проанализировать видео\n' +
    '/interests <текст> - Задать интересы\n' +
    '/criteria <текст> - Задать критерии оценки\n' +
    '/clear - Очистить контекст, настройки и сессии\n\n' +
    '_Обычный текст идет в chat-сессию агента. Видео-запрос создает отдельную сессию анализа и удаляет ее после ответа._'
  );
};

/** Возвращает стартовое сообщение бота. */
const formatStart = (): string => {
  return (
    '🎬 *Content Assistant*\n\n' +
    'Я помогу тебе анализировать YouTube видео быстро.\n\n' +
    '_Отправь мне ссылку на видео и получишь:_\n' +
    '• Краткое summary\n' +
    '• Ключевые тезисы\n' +
    '• Рекомендацию\n\n' +
    'Обычный текст идет в chat-сессию, а /interests и /criteria влияют только на видео-анализ.\n\n' +
    'Используй /help для списка команд.'
  );
};

/** Формирует prompt для анализа видео на основе transcript и пользовательских критериев. */
const buildAnalyzePrompt = (
  transcriptPayload: TranscriptExtractionResult,
  criteria?: string,
  interests?: string
): string => {
  const { metadata, transcript, language, source } = transcriptPayload;
  let prompt =
    `Сделай глубокий и полезный анализ видео на основе transcript.\n\n` +
    `Исходные данные:\n` +
    `- URL: ${metadata.youtubeUrl}\n` +
    `- Video ID: ${metadata.videoId}\n` +
    `- Название: ${metadata.title ?? 'не указано'}\n` +
    `- Канал: ${metadata.uploader ?? 'не указано'}\n` +
    `- Длительность (сек): ${metadata.duration ?? 'не указано'}\n` +
    `- Язык transcript: ${language}\n` +
    `- Источник subtitle: ${source}\n\n` +
    `Требования к качеству:\n` +
    `- Опирайся только на transcript и указанные данные.\n` +
    `- Дай факты, аргументы, выводы и практическую пользу.\n` +
    `- Если в видео несколько спикеров, выдели позицию каждого и точки согласия/спора.\n` +
    `- Для длинных видео (>30 минут) выдели самое важное, но содержательно.\n` +
    `- Не выдумывай факты, которых нет в transcript.\n\n` +
    `Сформируй ответ строго в таком формате:\n` +
    `1) Коротко о видео (2-3 предложения): тема, цель, кому полезно.\n` +
    `2) Главные тезисы (6-10 пунктов): только содержательные мысли.\n` +
    `3) Факты и аргументы из видео (5-8 пунктов): цифры, примеры, причинно-следственные связи.\n` +
    `4) Позиция автора(ов):\n` +
    `   - ключевые убеждения;\n` +
    `   - на чем они основаны;\n` +
    `   - возможные слабые места в аргументации.\n` +
    `5) Выводы и результаты:\n` +
    `   - какие практические выводы делает автор;\n` +
    `   - что это значит для зрителя.\n` +
    `6) Что делать дальше (3-5 действий): конкретные шаги для пользователя.\n` +
    `7) Оценка релевантности интересам пользователя: 0-10 + короткое объяснение.\n\n` +
    `Ограничение объема: строго 3000 символов максимум. Это жесткий лимит. Если нужно сократить - сокращай содержание, выбрасывай второстепенное, но НЕ ОБРЕЗАЙ готовый ответ. Лучше меньше да лучше.`;

  if (criteria) prompt += `\nКритерии оценки пользователя: ${criteria}`;
  if (interests) prompt += `\nИнтересы пользователя: ${interests}`;

  prompt +=
    `\n\nВажно:\n` +
    `- Если данных не хватает, явно укажи это.\n` +
    `- Не добавляй служебные блоки и рассуждения о процессе анализа.\n\n` +
    `Transcript (источник истины для анализа):\n` +
    transcript;
  return prompt;
};

export { extractYouTubeUrl, getEnvConfig, formatHelp, formatStart, buildAnalyzePrompt };
