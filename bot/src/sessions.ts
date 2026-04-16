import axios from "axios";

const OPENCODE_URL = process.env.OPENCODE_URL || "http://localhost:8888";

interface Session {
  id: string;
  title: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const listSessions = async (): Promise<Session[]> => {
  const { data } = await axios.get(`${OPENCODE_URL}/sessions`);
  return data as Session[];
};

const createSession = async (title?: string): Promise<Session> => {
  const { data } = await axios.post(`${OPENCODE_URL}/session/create`, { title });
  return data as Session;
};

const deleteSession = async (sessionId: string): Promise<boolean> => {
  const { data } = await axios.delete(`${OPENCODE_URL}/session/${sessionId}`);
  return data.success === true;
};

const clearAllSessions = async (): Promise<{ deleted: number; errors: number }> => {
  const sessions = await listSessions();
  const currentSession = sessions.find((s) => s.active);
  const toDelete = sessions.filter((s) => s.id !== currentSession?.id);

  let deleted = 0;
  let errors = 0;

  for (const session of toDelete) {
    try {
      const success = await deleteSession(session.id);
      if (success) deleted++;
      else errors++;
    } catch {
      errors++;
    }
  }

  return { deleted, errors };
};

export { listSessions, createSession, deleteSession, clearAllSessions };