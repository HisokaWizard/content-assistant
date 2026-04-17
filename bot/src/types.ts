import { z } from "zod";

export const envSchema = z.object({
  TELEGRAM_TOKEN: z.string().min(1, "TELEGRAM_TOKEN is required"),
  OPENCODE_URL: z.string().url().default("http://localhost:8888"),
  YTDLP_COOKIES_FROM_BROWSER: z.string().min(1).optional(),
  YTDLP_COOKIES_FILE: z.string().min(1).optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export interface UserSession {
  interests?: string;
  criteria?: string;
  history?: string[];
}

export interface VideoMetadata {
  title?: string;
  uploader?: string;
  duration?: number;
  uploadDate?: string;
  viewCount?: number;
  language?: string;
  videoId: string;
  youtubeUrl: string;
}

export interface TranscriptExtractionResult {
  transcript: string;
  language: string;
  source: "subs" | "auto-subs";
  metadata: VideoMetadata;
}
