import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { TranscriptExtractionResult, VideoMetadata } from "./types";

const execFileAsync = promisify(execFile);

const YTDLP_TIMEOUT_MS = 120_000;
const TRANSCRIPT_MIN_CHARS = 300;
const TRANSCRIPT_MAX_CHARS = 120_000;

interface YtDlpJsonPayload {
  title?: string;
  uploader?: string;
  duration?: number;
  upload_date?: string;
  view_count?: number;
  language?: string;
}

interface AuthConfig {
  cookiesFromBrowser?: string;
  cookiesFile?: string;
}

interface RunnerOptions {
  auth?: AuthConfig;
}

/** Проверяет, установлен ли yt-dlp в системе. */
const ensureYtDlpInstalled = async (): Promise<void> => {
  try {
    await execFileAsync("yt-dlp", ["--version"], { timeout: 15_000 });
  } catch {
    throw new Error("yt-dlp не установлен. Установи: brew install yt-dlp");
  }
};

/** Извлекает videoId из YouTube URL. */
const extractVideoId = (youtubeUrl: string): string => {
  const match = youtubeUrl.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  );
  if (!match?.[1]) {
    throw new Error("Не удалось извлечь videoId из YouTube URL.");
  }
  return match[1];
};

/** Собирает auth-аргументы для yt-dlp из переменных окружения. */
const getAuthConfig = (): AuthConfig => {
  const cookiesFromBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  const cookiesFile = process.env.YTDLP_COOKIES_FILE?.trim();
  return {
    cookiesFromBrowser: cookiesFromBrowser || undefined,
    cookiesFile: cookiesFile || undefined,
  };
};

/** Добавляет auth-аргументы к команде yt-dlp при наличии настроек. */
const withAuthArgs = (args: string[], options?: RunnerOptions): string[] => {
  const auth = options?.auth;
  if (!auth) return args;

  if (auth.cookiesFromBrowser) {
    return [...args, "--cookies-from-browser", auth.cookiesFromBrowser];
  }
  if (auth.cookiesFile) {
    return [...args, "--cookies", auth.cookiesFile];
  }
  return args;
};

const isAntiBotError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("sign in to confirm you're not a bot") ||
    normalized.includes("confirm you’re not a bot") ||
    normalized.includes("use --cookies-from-browser") ||
    normalized.includes("use --cookies")
  );
};

const mapYtDlpError = (error: unknown, authConfigured: boolean): Error => {
  const stderr =
    typeof error === "object" && error && "stderr" in error
      ? String((error as { stderr?: string }).stderr ?? "")
      : "";
  const stdout =
    typeof error === "object" && error && "stdout" in error
      ? String((error as { stdout?: string }).stdout ?? "")
      : "";
  const message = `${stderr}\n${stdout}`.trim();

  if (isAntiBotError(message)) {
    if (!authConfigured) {
      return new Error(
        "YouTube заблокировал запрос (anti-bot). Настрой авторизацию для yt-dlp: " +
          "укажи YTDLP_COOKIES_FROM_BROWSER=chrome (или safari/firefox) " +
          "либо YTDLP_COOKIES_FILE=/абсолютный/путь/cookies.txt, затем перезапусти бота."
      );
    }
    return new Error(
      "YouTube отклонил запрос даже с cookies. Проверь актуальность cookies и доступ к видео."
    );
  }

  if (message.length > 0) {
    return new Error(`Ошибка yt-dlp: ${message.split("\n").slice(-4).join(" ")}`);
  }
  return new Error("Не удалось получить transcript через yt-dlp.");
};

/** Выполняет yt-dlp с единым timeout/buffer и конвертирует ошибки в читаемые сообщения. */
const runYtDlp = async (
  args: string[],
  options?: RunnerOptions
): Promise<{ stdout: string; stderr: string }> => {
  const authConfigured = Boolean(
    options?.auth?.cookiesFromBrowser || options?.auth?.cookiesFile
  );
  try {
    const finalArgs = withAuthArgs(args, options);
    return await execFileAsync("yt-dlp", finalArgs, {
      timeout: YTDLP_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    throw mapYtDlpError(error, authConfigured);
  }
};

/** Читает metadata видео через yt-dlp JSON dump. */
const fetchVideoMetadata = async (
  youtubeUrl: string,
  videoId: string,
  options?: RunnerOptions
): Promise<VideoMetadata> => {
  try {
    const { stdout } = await runYtDlp(
      ["--skip-download", "--dump-single-json", youtubeUrl],
      options
    );
    const payload = JSON.parse(stdout) as YtDlpJsonPayload;
    return {
      videoId,
      youtubeUrl,
      title: payload.title,
      uploader: payload.uploader,
      duration: payload.duration,
      uploadDate: payload.upload_date,
      viewCount: payload.view_count,
      language: payload.language,
    };
  } catch {
    return { videoId, youtubeUrl };
  }
};

/** Удаляет временные файлы субтитров по префиксу. */
const cleanupTmpFiles = async (prefix: string): Promise<void> => {
  try {
    const files = await fs.readdir(tmpdir());
    const targets = files.filter((name) => name.startsWith(prefix));
    await Promise.all(
      targets.map(async (name) => {
        try {
          await fs.unlink(join(tmpdir(), name));
        } catch {
          // Best effort cleanup
        }
      })
    );
  } catch {
    // Ignore cleanup errors
  }
};

const formatTmpPrefix = (videoId: string): string => `ca-subs-${videoId}-`;

/** Запускает yt-dlp для скачивания captions (regular + auto). */
const downloadCaptions = async (
  youtubeUrl: string,
  videoId: string,
  options?: RunnerOptions
): Promise<{ prefix: string }> => {
  const prefix = formatTmpPrefix(videoId);
  const outputTemplate = join(tmpdir(), `${prefix}%(id)s.%(ext)s`);

  await runYtDlp(
    [
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-format",
      "vtt/srt/best",
      "--sub-langs",
      "ru.*,en.*",
      "-o",
      outputTemplate,
      youtubeUrl,
    ],
    options
  );

  return { prefix };
};

const pickBestSubtitleFile = (
  files: string[],
  videoId: string
): { file: string; source: "subs" | "auto-subs"; language: string } | null => {
  const candidates = files
    .filter((name) => name.includes(videoId))
    .filter((name) => name.endsWith(".vtt") || name.endsWith(".srt"));

  if (candidates.length === 0) return null;

  const score = (name: string): number => {
    const lower = name.toLowerCase();
    let value = 0;
    if (lower.includes(".ru")) value += 100;
    if (lower.includes(".en")) value += 60;
    if (lower.includes(".live_chat.")) value -= 50;
    if (lower.includes(".vtt")) value += 10;
    if (lower.includes(".srt")) value += 5;
    if (lower.includes("auto")) value -= 1;
    return value;
  };

  const selected = [...candidates].sort((a, b) => score(b) - score(a))[0];
  const lower = selected.toLowerCase();
  const language = lower.includes(".ru")
    ? "ru"
    : lower.includes(".en")
      ? "en"
      : "unknown";
  const source = lower.includes("auto") ? "auto-subs" : "subs";
  return { file: selected, source, language };
};

/** Очищает VTT/SRT от таймкодов и служебных токенов, оставляет только текст. */
const parseSubtitleText = (raw: string): string => {
  const lines = raw.split(/\r?\n/);
  const textLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === "WEBVTT") continue;
    if (/^\d+$/.test(trimmed)) continue;
    if (
      /^\d{2}:\d{2}:\d{2}[.,]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[.,]\d{3}/.test(
        trimmed
      )
    ) {
      continue;
    }
    if (trimmed.startsWith("NOTE")) continue;
    if (/^<\d{2}:\d{2}:\d{2}[.,]\d{3}>/.test(trimmed)) continue;

    const cleaned = trimmed
      .replace(/<[^>]+>/g, "")
      .replace(/\[[^\]]+\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;

    const last = textLines[textLines.length - 1];
    if (last === cleaned) continue;
    textLines.push(cleaned);
  }

  return textLines.join("\n");
};

/** Ограничивает transcript до рабочего размера prompt. */
const normalizeTranscriptLength = (text: string): string => {
  const compact = text.trim();
  if (compact.length <= TRANSCRIPT_MAX_CHARS) return compact;
  return compact.slice(0, TRANSCRIPT_MAX_CHARS);
};

/** Основной метод: извлекает transcript и metadata; без transcript бросает ошибку. */
const extractTranscript = async (
  youtubeUrl: string
): Promise<TranscriptExtractionResult> => {
  await ensureYtDlpInstalled();
  const videoId = extractVideoId(youtubeUrl);

  const auth = getAuthConfig();
  const hasAuth = Boolean(auth.cookiesFromBrowser || auth.cookiesFile);
  const optionsWithoutAuth: RunnerOptions = {};
  const optionsWithAuth: RunnerOptions = hasAuth ? { auth } : {};

  const metadata = await fetchVideoMetadata(
    youtubeUrl,
    videoId,
    hasAuth ? optionsWithAuth : optionsWithoutAuth
  );

  let prefix: string | undefined;
  try {
    try {
      const result = await downloadCaptions(youtubeUrl, videoId, optionsWithoutAuth);
      prefix = result.prefix;
    } catch (error) {
      if (!hasAuth) throw error;
      const result = await downloadCaptions(youtubeUrl, videoId, optionsWithAuth);
      prefix = result.prefix;
    }

    if (!prefix) {
      throw new Error("Не удалось инициализировать загрузку субтитров.");
    }
    const activePrefix = prefix;

    const tmpFiles = await fs.readdir(tmpdir());
    const picked = pickBestSubtitleFile(
      tmpFiles.filter((name) => name.startsWith(activePrefix)),
      videoId
    );

    if (!picked) {
      throw new Error(
        "Для этого видео не найдены субтитры. Анализ без transcript невозможен."
      );
    }

    const raw = await fs.readFile(join(tmpdir(), picked.file), "utf-8");
    const transcript = normalizeTranscriptLength(parseSubtitleText(raw));

    if (transcript.length < TRANSCRIPT_MIN_CHARS) {
      throw new Error(
        "Transcript слишком короткий или пустой. Анализ без полноценного transcript невозможен."
      );
    }

    return {
      transcript,
      language: picked.language,
      source: picked.source,
      metadata,
    };
  } finally {
    if (prefix) {
      await cleanupTmpFiles(prefix);
    }
  }
};

export { extractTranscript };
