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

/** Извлекает текст ответа из структуры parts в payload OpenCode. */
const extractTextFromParts = (parts: unknown): string => {
  const texts: string[] = [];

  const walk = (value: unknown): void => {
    if (!value) return;
    if (typeof value === "string") {
      texts.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (typeof obj.text === "string") {
        texts.push(obj.text);
      }
      for (const next of Object.values(obj)) {
        if (next !== obj.text) walk(next);
      }
    }
  };

  walk(parts);
  const output = texts.join("\n").trim();
  return output.length > 0 ? output : "Пустой ответ от Opencode";
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

  return extractTextFromParts(data.parts ?? data);
};

export {
  delay,
  listSessions,
  createSession,
  deleteSession,
  deleteAllSessions,
  sendMessageToSession,
};
