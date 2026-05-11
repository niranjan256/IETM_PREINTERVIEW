const API_BASE = "/api";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SourceCitation {
  node_pk: number;
  node_title: string;
  node_number: string;
  xml_id: string;
  doc_pk: number;
}

export interface StreamCallbacks {
  onSources: (sources: SourceCitation[]) => void;
  onToken:   (token: string) => void;
  onDone:    () => void;
  onError:   (message: string) => void;
}

export function streamChat(
  query: string,
  history: ChatMessage[],
  callbacks: StreamCallbacks,
  docPk?: number | null,
): AbortController {
  const controller = new AbortController();
  const token = localStorage.getItem("token");

  const body: Record<string, unknown> = { query, history };
  if (docPk != null) {
    body.doc_pk = docPk;
  }

  fetch(`${API_BASE}/rag/chat/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok || !response.body) {
        callbacks.onError(`HTTP ${response.status}: ${response.statusText}`);
        return;
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const trimmed = frame.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const jsonStr = trimmed.slice(6);
          try {
            const event = JSON.parse(jsonStr) as {
              type: string;
              sources?: SourceCitation[];
              content?: string;
              message?: string;
            };

            switch (event.type) {
              case "sources":
                callbacks.onSources(event.sources ?? []);
                break;
              case "token":
                callbacks.onToken(event.content ?? "");
                break;
              case "done":
                callbacks.onDone();
                break;
              case "error":
                callbacks.onError(event.message ?? "Unknown error");
                break;
            }
          } catch {
            
          }
        }
      }
    })
    .catch((err: Error) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message ?? "Network error");
      }
    });

  return controller;
}
