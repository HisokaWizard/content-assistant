import { z, type ZodIssue } from "zod";
import type { EnvConfig } from "./types";

const envSchema = z.object({
  TELEGRAM_TOKEN: z.string().min(1, "TELEGRAM_TOKEN is required"),
  OPENCODE_URL: z.string().url().default("http://localhost:8888"),
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
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map((i: ZodIssue) => i.message).join(", ");
    throw new Error(`Env validation failed: ${errors}`);
  }
  return result.data;
};

/** Возвращает текст справки по доступным командам бота. */
const formatHelp = (): string => {
  return (
    "📖 *Список команд:*\n\n" +
    "/start - Начать работу\n" +
    "/help - Показать помощь\n" +
    "/analyze <url> - Проанализировать видео\n" +
    "/interests <текст> - Задать интересы\n" +
    "/criteria <текст> - Задать критерии оценки\n" +
    "/clear - Очистить контекст, настройки и сессии\n\n" +
    "_Обычный текст идет в chat-сессию агента. Видео-запрос создает отдельную сессию анализа и удаляет ее после ответа._"
  );
};

/** Возвращает стартовое сообщение бота. */
const formatStart = (): string => {
  return (
    "🎬 *Content Assistant*\n\n" +
    "Я помогу тебе анализировать YouTube видео быстро.\n\n" +
    "_Отправь мне ссылку на видео и получишь:_\n" +
    "• Краткое summary\n" +
    "• Ключевые тезисы\n" +
    "• Рекомендацию\n\n" +
    "Обычный текст идет в chat-сессию, а /interests и /criteria влияют только на видео-анализ.\n\n" +
    "Используй /help для списка команд."
  );
};

/** Формирует prompt для анализа видео с учетом интересов и критериев пользователя. */
const buildAnalyzePrompt = (
  youtubeUrl: string,
  criteria?: string,
  interests?: string
): string => {
  let prompt = `Проанализируй это видео: ${youtubeUrl}`;
  if (criteria) prompt += `\nКритерии оценки: ${criteria}`;
  if (interests) prompt += `\nИнтересы: ${interests}`;
  return prompt;
};

export {
  extractYouTubeUrl,
  getEnvConfig,
  formatHelp,
  formatStart,
  buildAnalyzePrompt,
};
