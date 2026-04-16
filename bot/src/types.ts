import { z } from "zod";

export const envSchema = z.object({
  TELEGRAM_TOKEN: z.string().min(1, "TELEGRAM_TOKEN is required"),
  OPENCODE_URL: z.string().url().default("http://localhost:8888"),
});

export type EnvConfig = z.infer<typeof envSchema>;

export interface UserSession {
  interests?: string;
  criteria?: string;
  history?: string[];
}