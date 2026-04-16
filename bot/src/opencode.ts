import axios from "axios";

interface OpencodeResponse {
  response?: string;
  message?: string;
}

const queryOpencode = async (
  prompt: string,
  baseUrl: string = "http://localhost:4096"
): Promise<string> => {
  try {
    const { data } = await axios.post<OpencodeResponse>(`${baseUrl}/tui`, {
      prompt,
      mode: "build",
    });

    return data.response || data.message || JSON.stringify(data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Opencode API error: ${error.response?.status ?? "network"}`
      );
    }
    throw error;
  }
};

export { queryOpencode };