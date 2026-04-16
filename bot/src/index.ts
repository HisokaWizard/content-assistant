import { Bot, type Context, type CommandContext } from "grammy";
import type { UserSession } from "./types";
import {
  extractYouTubeUrl,
  getEnvConfig,
  formatHelp,
  formatStart,
  buildAnalyzePrompt,
} from "./utils";
import { queryOpencode } from "./opencode";
import {
  listSessions,
  createSession,
  clearAllSessions,
} from "./sessions";

const config = getEnvConfig();
const bot = new Bot(config.TELEGRAM_TOKEN);

const userSessions = new Map<string, UserSession>();

const getUserId = (ctx: { from?: { id: number } }): string => {
  return ctx.from?.id.toString() ?? "unknown";
};

const handleStart = async (ctx: CommandContext<Context>): Promise<void> => {
  await ctx.reply(formatStart(), { parse_mode: "Markdown" });
};

const handleHelp = async (ctx: CommandContext<Context>): Promise<void> => {
  await ctx.reply(formatHelp(), { parse_mode: "Markdown" });
};

const handleNew = async (ctx: CommandContext<Context>): Promise<void> => {
  try {
    const session = await createSession();
    await ctx.reply(`✅ Создана новая сессия: ${session.title} (${session.id})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await ctx.reply(`❌ Ошибка: ${message}`);
  }
};

const handleClearSessions = async (ctx: CommandContext<Context>): Promise<void> => {
  try {
    const result = await clearAllSessions();
    await ctx.reply(
      `✅ Удалено сессий: ${result.deleted}, ошибок: ${result.errors}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await ctx.reply(`❌ Ошибка: ${message}`);
  }
};

const handleSessions = async (ctx: CommandContext<Context>): Promise<void> => {
  try {
    const sessions = await listSessions();
    if (sessions.length === 0) {
      await ctx.reply("Нет сессий");
      return;
    }

    const list = sessions
      .map((s) => `${s.active ? "👉 " : "  "}${s.title} (${s.id})`)
      .join("\n");

    await ctx.reply(`📋 Сессии:\n${list}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await ctx.reply(`❌ Ошибка: ${message}`);
  }
};

const handleAnalyze = async (ctx: CommandContext<Context>): Promise<void> => {
  const userId = getUserId(ctx);
  const args = ctx.message?.text?.replace("/analyze", "").trim() ?? "";

  const youtubeUrl = extractYouTubeUrl(args);
  if (!youtubeUrl) {
    await ctx.reply("⚠️ Укажи ссылку на YouTube видео");
    return;
  }

  const session = userSessions.get(userId) || {};
  const prompt = buildAnalyzePrompt(youtubeUrl, session.criteria, session.interests);

  await ctx.reply("⏳ Анализирую видео...");

  try {
    const result = await queryOpencode(prompt, config.OPENCODE_URL);
    await ctx.reply(result, { parse_mode: "Markdown" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await ctx.reply(`❌ Ошибка: ${message}`);
  }
};

const handleInterests = async (ctx: CommandContext<Context>): Promise<void> => {
  const userId = getUserId(ctx);
  const args = ctx.message?.text?.replace("/interests", "").trim() ?? "";

  if (!args) {
    await ctx.reply("⚠️ Укажи интересы: /interests crypto, AI, технологии");
    return;
  }

  const session = userSessions.get(userId) || {};
  session.interests = args;
  userSessions.set(userId, session);

  await ctx.reply(`✅ Интересы сохранены: ${args}`);
};

const handleCriteria = async (ctx: CommandContext<Context>): Promise<void> => {
  const userId = getUserId(ctx);
  const args = ctx.message?.text?.replace("/criteria", "").trim() ?? "";

  if (!args) {
    await ctx.reply("⚠️ Укажи критерии: /criteria короткие видео, полезные факты");
    return;
  }

  const session = userSessions.get(userId) || {};
  session.criteria = args;
  userSessions.set(userId, session);

  await ctx.reply(`✅ Критерии сохранены: ${args}`);
};

const handleClear = async (ctx: CommandContext<Context>): Promise<void> => {
  const userId = getUserId(ctx);
  userSessions.delete(userId);
  await ctx.reply("✅ Сессия очищена!");
};

const handleMessage = async (ctx: Context): Promise<void> => {
  const text = ctx.message?.text ?? "";

  if (text.startsWith("/")) return;

  const userId = getUserId(ctx);
  const youtubeUrl = extractYouTubeUrl(text);

  if (youtubeUrl) {
    const session = userSessions.get(userId) || {};
    const prompt = buildAnalyzePrompt(youtubeUrl, session.criteria, session.interests);

    await ctx.reply("⏳ Анализирую видео...");

    try {
      const result = await queryOpencode(prompt, config.OPENCODE_URL);
      await ctx.reply(result, { parse_mode: "Markdown" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await ctx.reply(`❌ Ошибка: ${message}`);
    }
  } else {
    const session = userSessions.get(userId) || {};
    const context = session.history
      ? `\nКонтекст предыдущего разговора:\n${session.history.slice(-5).join("\n")}`
      : "";

    try {
      const result = await queryOpencode(text + context, config.OPENCODE_URL);
      await ctx.reply(result, { parse_mode: "Markdown" });

      session.history = session.history || [];
      session.history.push(`User: ${text}`);
      session.history.push(`Assistant: ${result}`);
      userSessions.set(userId, session);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await ctx.reply(`❌ Ошибка: ${message}`);
    }
  }
};

bot.command("start", handleStart);
bot.command("help", handleHelp);
bot.command("new", handleNew);
bot.command("sessions", handleSessions);
bot.command("clear-sessions", handleClearSessions);
bot.command("analyze", handleAnalyze);
bot.command("interests", handleInterests);
bot.command("criteria", handleCriteria);
bot.command("clear", handleClear);

bot.on("message:text", handleMessage);

bot.start();

console.log("🤖 Bot started. Press Ctrl+C to stop.");