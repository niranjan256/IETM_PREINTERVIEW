import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";

import {
  type ChatMessage,
  type SourceCitation,
  streamChat,
} from "../../services/chatService";

interface ChatPanelProps {
  currentDocPk: number | null;
  currentDocTitle?: string;
  onNavigateToNode?: (nodePk: number) => void;
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
  isStreaming?: boolean;
}

export function ChatPanel({
  currentDocPk,
  currentDocTitle,
  onNavigateToNode,
}: ChatPanelProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen]             = useState(false);
  const [scopeAllDocs, setScopeAllDocs] = useState(false);
  const [inputValue, setInputValue]     = useState("");
  const [messages, setMessages]         = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading]       = useState(false);
  const [history, setHistory]           = useState<ChatMessage[]>([]);

  const messagesEndRef             = useRef<HTMLDivElement>(null);
  const abortControllerRef         = useRef<AbortController | null>(null);
  const latestAssistantContentRef  = useRef<string>("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isOpen) {
      abortControllerRef.current?.abort();
    }
  }, [isOpen]);

  const handleSend = useCallback(() => {
    const query = inputValue.trim();
    if (!query || isLoading) return;

    const userMsgId      = `user-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;
    latestAssistantContentRef.current = "";

    setMessages((prev) => [
      ...prev,
      { id: userMsgId,      role: "user",      content: query },
      { id: assistantMsgId, role: "assistant",  content: "", isStreaming: true },
    ]);
    setInputValue("");
    setIsLoading(true);

    const docPk = scopeAllDocs ? null : currentDocPk;

    abortControllerRef.current = streamChat(
      query,
      history,
      {
        onSources: (sources) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, sources } : m)),
          );
        },
        onToken: (token) => {
          latestAssistantContentRef.current += token;
          const captured = latestAssistantContentRef.current;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: captured } : m,
            ),
          );
        },
        onDone: () => {
          setIsLoading(false);
          const finalContent = latestAssistantContentRef.current;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: finalContent, isStreaming: false }
                : m,
            ),
          );
          setHistory((prev) => [
            ...prev,
            { role: "user",      content: query },
            { role: "assistant", content: finalContent },
          ]);
        },
        onError: (message) => {
          setIsLoading(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: `Error: ${message}`, isStreaming: false }
                : m,
            ),
          );
        },
      },
      docPk,
    );
  }, [inputValue, isLoading, scopeAllDocs, currentDocPk, history]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setHistory([]);
    setIsLoading(false);
    latestAssistantContentRef.current = "";
  };

  const scopeLabel = scopeAllDocs
    ? t("chat.searching_all")
    : currentDocTitle
      ? currentDocTitle.slice(0, 28) + (currentDocTitle.length > 28 ? "…" : "")
      : t("chat.no_doc");

  return (
    <>
      {}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600
                   hover:bg-blue-700 active:bg-blue-800 text-white shadow-xl
                   flex items-center justify-center transition-colors duration-150"
        title="Open AI Assistant"
        aria-label="Open AI chat assistant"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
        </svg>
      </button>

      {}
      <div
        className={[
          "fixed bottom-0 right-6 z-40 w-96 bg-white rounded-t-xl shadow-2xl",
          "border border-gray-200 flex flex-col",
          "transition-all duration-300 ease-in-out",
          isOpen ? "h-[600px] opacity-100" : "h-0 opacity-0 pointer-events-none",
        ].join(" ")}
      >
        {}
        <div className="flex items-center justify-between px-4 py-3 bg-blue-600 rounded-t-xl flex-shrink-0">
          <div className="flex flex-col min-w-0">
            <span className="text-white font-semibold text-sm">{t("chat.title")}</span>
            <span className="text-blue-200 text-xs truncate">{scopeLabel}</span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={handleClear}
              className="text-blue-200 hover:text-white text-xs underline"
            >
              {t("chat.clear")}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:text-blue-200"
              aria-label="Close chat"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        </div>

        {}
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <span className="text-xs text-gray-500 font-medium">Search:</span>
          <button
            onClick={() => setScopeAllDocs(false)}
            className={[
              "text-xs px-2 py-1 rounded transition-colors",
              !scopeAllDocs
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-600 hover:bg-gray-300",
            ].join(" ")}
          >
            {t("chat.scope_current")}
          </button>
          <button
            onClick={() => setScopeAllDocs(true)}
            className={[
              "text-xs px-2 py-1 rounded transition-colors",
              scopeAllDocs
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-600 hover:bg-gray-300",
            ].join(" ")}
          >
            {t("chat.scope_all")}
          </button>
        </div>

        {}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {messages.length === 0 && (
            <p className="text-center text-gray-400 text-sm mt-10">
              {t("chat.empty")}
            </p>
          )}
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onNavigateToNode={onNavigateToNode}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {}
        <div className="px-4 py-3 border-t border-gray-200 flex-shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.placeholder")}
              className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2
                         text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                         focus:border-transparent min-h-[40px] max-h-[100px]"
              rows={2}
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !inputValue.trim()}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                         flex items-center justify-center flex-shrink-0 self-end"
              aria-label="Send message"
            >
              {isLoading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

interface MessageBubbleProps {
  message: DisplayMessage;
  onNavigateToNode?: (nodePk: number) => void;
}

function MessageBubble({ message, onNavigateToNode }: MessageBubbleProps) {
  const { t } = useTranslation();
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%]">
        <div
          className={[
            "rounded-lg px-3 py-2 text-sm break-words",
            isUser
              ? "bg-blue-600 text-white rounded-br-none"
              : "bg-gray-100 text-gray-800 rounded-bl-none",
          ].join(" ")}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p:          ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                strong:     ({ children }) => <strong className="font-semibold">{children}</strong>,
                em:         ({ children }) => <em className="italic">{children}</em>,
                ul:         ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
                ol:         ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
                li:         ({ children }) => <li>{children}</li>,
                code:       ({ children }) => (
                  <code className="bg-gray-200 text-gray-900 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
                ),
                pre:        ({ children }) => (
                  <pre className="bg-gray-200 text-gray-900 rounded p-2 text-xs font-mono overflow-x-auto mb-1">{children}</pre>
                ),
                table:      ({ children }) => (
                  <div className="overflow-x-auto my-1">
                    <table className="text-xs border-collapse w-full">{children}</table>
                  </div>
                ),
                thead:      ({ children }) => <thead className="bg-gray-300">{children}</thead>,
                th:         ({ children }) => (
                  <th className="border border-gray-400 px-2 py-1 font-semibold text-left">{children}</th>
                ),
                td:         ({ children }) => (
                  <td className="border border-gray-300 px-2 py-1">{children}</td>
                ),
                tr:         ({ children }) => <tr className="even:bg-gray-200">{children}</tr>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-gray-400 pl-2 italic text-gray-600 mb-1">{children}</blockquote>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-current opacity-70 ml-0.5 animate-pulse align-text-bottom" />
          )}
        </div>

        {}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-1.5 space-y-1">
            <span className="text-xs text-gray-400 font-medium">{t("chat.sources")}</span>
            {message.sources.map((src) => (
              <button
                key={`${src.node_pk}-${src.xml_id}`}
                onClick={() => onNavigateToNode?.(src.node_pk)}
                className="block w-full text-left text-xs text-blue-600 hover:text-blue-800
                           hover:underline bg-blue-50 hover:bg-blue-100 rounded px-2 py-1
                           truncate transition-colors"
                title={`Section ${src.node_number}: ${src.node_title}`}
              >
                <span className="font-medium">{src.node_number}</span>
                {" — "}
                {src.node_title.length > 45
                  ? src.node_title.slice(0, 45) + "…"
                  : src.node_title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
