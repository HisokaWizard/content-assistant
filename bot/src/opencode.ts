import axios from "axios";

interface OpencodeSession {
  id: string;
  title?: string;
}

interface MessagePart {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

interface SessionMessageResponse {
  parts?: MessagePart[];
  response?: string;
  message?: string;
  [key: string]: unknown;
}

/** Пауза между операциями, чтобы дождаться готовности новой сессии OpenCode. */
const delay = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

/** Собирает корректный URL для API OpenCode и убирает лишние "/" в конце baseUrl. */
const withBase = (baseUrl: string, path: string): string => {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
};

/** Возвращает список сессий агента. */
const listSessions = async (baseUrl: string): Promise<OpencodeSession[]> => {
  const { data } = await axios.get(withBase(baseUrl, "/session"));
  if (!Array.isArray(data)) return [];
  return data.filter(
    (session: unknown): session is OpencodeSession =>
      Boolean(
        session &&
          typeof session === "object" &&
          "id" in session &&
          typeof (session as { id?: unknown }).id === "string"
      )
  );
};

/** Создает новую сессию агента с опциональным названием. */
const createSession = async (
  baseUrl: string,
  title?: string
): Promise<OpencodeSession> => {
  const { data } = await axios.post(withBase(baseUrl, "/session"), { title });
  if (!data || typeof data !== "object" || typeof data.id !== "string") {
    throw new Error("Opencode API error: invalid session payload");
  }
  return data as OpencodeSession;
};

/** Удаляет сессию агента по id. */
const deleteSession = async (
  sessionId: string,
  baseUrl: string
): Promise<void> => {
  await axios.delete(withBase(baseUrl, `/session/${sessionId}`));
};

/** Удаляет все сессии агента (best effort: продолжает даже при ошибках отдельных удалений). */
const deleteAllSessions = async (baseUrl: string): Promise<void> => {
  const sessions = await listSessions(baseUrl);
  for (const session of sessions) {
    try {
      await deleteSession(session.id, baseUrl);
    } catch {
      // Continue cleanup for the rest; caller decides how to handle leftovers.
    }
  }
};

const cleanupServiceLines = (text: string): string => {
  const noise = [
    /^[a-f0-9]{32,}$/i,
    /^(step-start|step-finish|reasoning|text|stop)$/i,
    /^(prt|ses|msg)_[A-Za-z0-9]+$/,
  ];

  const cleaned = text
    .split("\n")
    .filter((line) => {
      const value = line.trim();
      if (!value) return false;
      return !noise.some((pattern) => pattern.test(value));
    })
    .join("\n")
    .trim();

  return cleaned;
};

/** Извлекает финальный пользовательский ответ и убирает служебные данные/размышления. */
const extractTextFromPayload = (data: SessionMessageResponse): string => {
  if (Array.isArray(data.parts)) {
    const textParts = data.parts
      .filter((part) => {
        if (!part || typeof part !== "object") return false;
        const type = typeof part.type === "string" ? part.type.toLowerCase() : "";
        if (type.includes("reason")) return false;
        return type === "text" || type === "output_text" || type === "final";
      })
      .map((part) => (typeof part.text === "string" ? part.text.trim() : ""))
      .filter((text) => text.length > 0);

    if (textParts.length > 0) {
      const finalText = cleanupServiceLines(textParts[textParts.length - 1]);
      if (finalText.length > 0) return finalText;
    }
  }

  const fallbackRaw =
    (typeof data.response === "string" ? data.response : "") ||
    (typeof data.message === "string" ? data.message : "");
  const fallback = cleanupServiceLines(fallbackRaw);
  return fallback.length > 0 ? fallback : "Пустой ответ от Opencode";
};

/** Отправляет prompt в конкретную сессию и возвращает итоговый текст ответа модели. */
const sendMessageToSession = async (
  sessionId: string,
  prompt: string,
  baseUrl: string
): Promise<string> => {
  const body = {
    parts: [
      {
        type: "text",
        text: prompt,
      },
    ],
  };

  const { data } = await axios.post<SessionMessageResponse>(
    withBase(baseUrl, `/session/${sessionId}/message`),
    body
  );

  return extractTextFromPayload(data);
};

export {
  delay,
  listSessions,
  createSession,
  deleteSession,
  deleteAllSessions,
  sendMessageToSession,
};
