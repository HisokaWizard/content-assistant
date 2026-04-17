import { Bot, type Context, type CommandContext } from "grammy";
import type { UserSession } from "./types";
import {
  extractYouTubeUrl,
  getEnvConfig,
  formatHelp,
  formatStart,
  buildAnalyzePrompt,
} from "./utils";
import {
  delay,
  createSession,
  deleteAllSessions,
  deleteSession,
  sendMessageToSession,
} from "./opencode";

const config = getEnvConfig();
const bot = new Bot(config.TELEGRAM_TOKEN);

const SESSION_READY_DELAY_MS = 3000;
const HISTORY_LIMIT = 10;

const chatState: UserSession & { agentSessionId?: string } = {
  history: [],
};

let queue: Promise<void> = Promise.resolve();

/** Добавляет задачу в последовательную очередь, чтобы избежать гонок по сессиям агента. */
const enqueue = async (task: () => Promise<void>): Promise<void> => {
  const next = queue.then(task, task);
  queue = next.then(
    () => undefined,
    () => undefined
  );
  await next;
};

/** Обрезает локальную историю до лимита последних элементов. */
const trimHistory = (): void => {
  chatState.history = chatState.history || [];
  if (chatState.history.length > HISTORY_LIMIT) {
    chatState.history = chatState.history.slice(-HISTORY_LIMIT);
  }
};

/** Добавляет пару user/assistant в локальную историю и применяет лимит. */
const appendHistory = (userText: string, assistantText: string): void => {
  chatState.history = chatState.history || [];
  chatState.history.push(`User: ${userText}`);
  chatState.history.push(`Assistant: ${assistantText}`);
  trimHistory();
};

/** Полностью очищает локальный буфер истории диалога. */
const resetLocalHistory = (): void => {
  chatState.history = [];
};

/** Закрывает текущую chat-сессию и выполняет cleanup всех сессий агента. */
const closeAllAgentSessions = async (): Promise<void> => {
  if (chatState.agentSessionId) {
    try {
      await deleteSession(chatState.agentSessionId, config.OPENCODE_URL);
    } catch {
      // Continue cleanup via list+delete below.
    }
    chatState.agentSessionId = undefined;
  }
  await deleteAllSessions(config.OPENCODE_URL);
};

/** Гарантирует наличие ровно одной активной chat-сессии и создает ее при необходимости. */
const ensureChatAgentSession = async (): Promise<string> => {
  if (chatState.agentSessionId) return chatState.agentSessionId;

  await closeAllAgentSessions();
  const session = await createSession(config.OPENCODE_URL, "telegram-chat");
  chatState.agentSessionId = session.id;
  await delay(SESSION_READY_DELAY_MS);
  return session.id;
};

/** Обработчик команды /start. */
const handleStart = async (ctx: CommandContext<Context>): Promise<void> => {
  await ctx.reply(formatStart(), { parse_mode: "Markdown" });
};

/** Обработчик команды /help. */
const handleHelp = async (ctx: CommandContext<Context>): Promise<void> => {
  await ctx.reply(formatHelp(), { parse_mode: "Markdown" });
};

/** Обработчик /analyze: валидирует URL и запускает поток видео-анализа. */
const handleAnalyze = async (ctx: CommandContext<Context>): Promise<void> => {
  const args = ctx.message?.text?.replace("/analyze", "").trim() ?? "";
  const youtubeUrl = extractYouTubeUrl(args);
  if (!youtubeUrl) {
    await ctx.reply("⚠️ Укажи ссылку на YouTube видео");
    return;
  }
  await runVideoFlow(ctx, youtubeUrl);
};

/** Обработчик /interests: сохраняет интересы пользователя для видео-анализа. */
const handleInterests = async (ctx: CommandContext<Context>): Promise<void> => {
  const args = ctx.message?.text?.replace("/interests", "").trim() ?? "";
  if (!args) {
    await ctx.reply("⚠️ Укажи интересы: /interests crypto, AI, технологии");
    return;
  }
  chatState.interests = args;
  await ctx.reply(`✅ Интересы сохранены: ${args}`);
};

/** Обработчик /criteria: сохраняет критерии оценки для видео-анализа. */
const handleCriteria = async (ctx: CommandContext<Context>): Promise<void> => {
  const args = ctx.message?.text?.replace("/criteria", "").trim() ?? "";
  if (!args) {
    await ctx.reply("⚠️ Укажи критерии: /criteria короткие видео, полезные факты");
    return;
  }
  chatState.criteria = args;
  await ctx.reply(`✅ Критерии сохранены: ${args}`);
};

/** Обработчик /clear: очищает локальный контекст и закрывает сессии агента. */
const handleClear = async (ctx: CommandContext<Context>): Promise<void> => {
  chatState.criteria = undefined;
  chatState.interests = undefined;
  resetLocalHistory();
  await closeAllAgentSessions();
  await ctx.reply("✅ Контекст очищен, сессии агента закрыты.");
};

/** Полный цикл видео-анализа: cleanup -> новая сессия -> задержка -> запрос -> удаление сессии. */
const runVideoFlow = async (
  ctx: Context | CommandContext<Context>,
  youtubeUrl: string
): Promise<void> => {
  await ctx.reply("⏳ Анализирую видео...");

  let videoSessionId: string | undefined;
  try {
    resetLocalHistory();
    await closeAllAgentSessions();

    const session = await createSession(config.OPENCODE_URL, "telegram-video-analysis");
    videoSessionId = session.id;
    await delay(SESSION_READY_DELAY_MS);

    const prompt = buildAnalyzePrompt(
      youtubeUrl,
      chatState.criteria,
      chatState.interests
    );

    const result = await sendMessageToSession(
      videoSessionId,
      prompt,
      config.OPENCODE_URL
    );
    await ctx.reply(result);

    await deleteSession(videoSessionId, config.OPENCODE_URL);
    videoSessionId = undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await ctx.reply(`❌ Ошибка анализа видео: ${message}`);
  } finally {
    if (videoSessionId) {
      try {
        await deleteSession(videoSessionId, config.OPENCODE_URL);
      } catch {
        // Best-effort cleanup
      }
    }
    chatState.agentSessionId = undefined;
  }
};

/** Поток обычного чата: использует (или создает) chat-сессию и отправляет текст в модель. */
const runChatFlow = async (ctx: Context, text: string): Promise<void> => {
  try {
    const sessionId = await ensureChatAgentSession();
    const result = await sendMessageToSession(sessionId, text, config.OPENCODE_URL);
    await ctx.reply(result);
    appendHistory(text, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await ctx.reply(`❌ Ошибка чата: ${message}`);
  }
};

/** Роутер текстовых сообщений: видео-ссылка уходит в видео-flow, остальное в chat-flow. */
const handleMessage = async (ctx: Context): Promise<void> => {
  const text = ctx.message?.text ?? "";
  if (text.startsWith("/")) return;

  const youtubeUrl = extractYouTubeUrl(text);
  if (youtubeUrl) {
    await runVideoFlow(ctx, youtubeUrl);
    return;
  }
  await runChatFlow(ctx, text);
};

bot.command("start", (ctx) => enqueue(() => handleStart(ctx)));
bot.command("help", (ctx) => enqueue(() => handleHelp(ctx)));
bot.command("analyze", (ctx) => enqueue(() => handleAnalyze(ctx)));
bot.command("interests", (ctx) => enqueue(() => handleInterests(ctx)));
bot.command("criteria", (ctx) => enqueue(() => handleCriteria(ctx)));
bot.command("clear", (ctx) => enqueue(() => handleClear(ctx)));

bot.on("message:text", (ctx) => enqueue(() => handleMessage(ctx)));

bot.start();

console.log("🤖 Bot started. Press Ctrl+C to stop.");
