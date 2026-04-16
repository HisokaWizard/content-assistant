import { z, type ZodIssue } from "zod";
import type { EnvConfig } from "./types";

const envSchema = z.object({
  TELEGRAM_TOKEN: z.string().min(1, "TELEGRAM_TOKEN is required"),
  OPENCODE_URL: z.string().url().default("http://localhost:8888"),
});

const extractYouTubeUrl = (text: string): string | null => {
  const regex =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
  const match = text.match(regex);
  return match ? match[0] : null;
};

const getEnvConfig = (): EnvConfig => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map((i: ZodIssue) => i.message).join(", ");
    throw new Error(`Env validation failed: ${errors}`);
  }
  return result.data;
};

const formatHelp = (): string => {
  return (
    "📖 *Список команд:*\n\n" +
    "/start - Начать работу\n" +
    "/help - Показать помощь\n" +
    "/new - Создать новую сессию OpenCode\n" +
    "/sessions - Список сессий OpenCode\n" +
    "/clear-sessions - Удалить все сессии кроме текущей\n" +
    "/analyze <url> - Проанализировать видео\n" +
    "/interests <текст> - Задать интересы\n" +
    "/criteria <текст> - Задать критерии оценки\n" +
    "/clear - Очистить сессию пользователя\n\n" +
    "_Также просто отправь ссылку на YouTube видео_"
  );
};

const formatStart = (): string => {
  return (
    "🎬 *Content Assistant*\n\n" +
    "Я помогу тебе анализировать YouTube видео быстро.\n\n" +
    "_Отправь мне ссылку на видео и получишь:_\n" +
    "• Краткое summary\n" +
    "• Ключевые тезисы\n" +
    "• Рекомендацию\n\n" +
    "Используй /help для списка команд."
  );
};

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