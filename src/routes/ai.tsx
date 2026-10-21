import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  Send,
  Sparkles,
  Plus,
  History,
  Trash2,
  CheckCircle2,
  Moon,
  X,
  AlertCircle,
  Mic,
  MicOff,
  Flame,
  Zap,
} from "lucide-react";
import {
  useApp,
  type ChatMsg,
  type PrayerKey,
  PRAYER_NAMES_BN,
  today,
  formatAppTime,
} from "@/lib/store";
import { useT } from "@/lib/i18n";
import { getAiProviders, type AiProviderConfig } from "@/lib/ai-config";
import { SUPERPOWERS_SYSTEM_PROMPT } from "@/lib/superpowers-skills";
import { cn } from "@/lib/utils";
import { Capacitor, CapacitorHttp } from "@capacitor/core";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "Noor AI — Islamic Routine & Habit Friend" },
      { name: "description", content: "Plan routines, track habits and prayers with intelligent AI friend." },
      { property: "og:title", content: "Noor AI — Islamic Routine & Habit Friend" },
      { property: "og:description", content: "Plan routines, track habits and prayers with intelligent AI friend." },
    ],
  }),
  component: AiPage,
});

/** Build comprehensive, live context of the entire app for Noor AI */
function buildCompactContext() {
  const s = useApp.getState();
  const todayStr = today();

  const prayers = s.prayers
    .map((p) => {
      const isDone = (p.doneDates || []).includes(todayStr);
      const name = PRAYER_NAMES_BN[p.key] || p.key;
      return `${name}(${p.time || "সময়হীন"}): ${isDone ? "আদায়কৃত" : "বাকি"}`;
    })
    .join(", ");

  const habits = s.items
    .filter((i) => i.kind === "habit")
    .map((i) => {
      const isDone = (i.doneDates || []).includes(todayStr);
      return `${i.title}(${i.time || "anytime"}): ${isDone ? "সম্পন্ন" : "বাকি"}`;
    })
    .join(", ");

  const goals = (s.goals || [])
    .map((g) => {
      const sub = (g.subTasks || []).map((st) => st.title).join("+");
      return `${g.title} [টাস্ক: ${sub || "None"}]`;
    })
    .join("; ");

  const todos = (s.todos || [])
    .filter((td) => !td.dueDate || td.dueDate === todayStr)
    .map((td) => `${td.title}: ${td.done ? "হয়েছে" : "বাকি"}`)
    .join(", ");

  const memory = (s.aiMemory.learnedNotes || []).slice(-4).join(" | ");

  return `Current App State:
User: ${s.profile?.name || "Friend"} (Language: ${s.lang}, TimeFormat: ${s.timeFormat})
Date: ${todayStr}
Prayers: ${prayers}
Habits: ${habits || "None yet"}
Goals: ${goals || "None yet"}
Today's To-Dos: ${todos || "None yet"}
Learned Context: ${memory || "None"}`;
}

/** Execute AI request with silent, automatic multi-provider fallback */
async function requestAiCompletionWithFailover(
  messages: { role: string; content: string }[],
  onStatusChange?: (statusText: string) => void
): Promise<{ text: string; providerName: string }> {
  const providers = getAiProviders();
  if (!providers.length) {
    throw new Error("No AI API keys configured.");
  }

  let lastError: Error | null = null;

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      if (i > 0 && onStatusChange) {
        onStatusChange(`Please wait... connecting to backup server (${p.name})`);
      }

      const url = `${p.baseUrl}/chat/completions`;
      const bodyPayload = {
        model: p.model || "glm-5.3-flash",
        messages,
        temperature: 0.7,
        max_tokens: 650,
      };

      let resultText = "";

      if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.post({
          url,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${p.apiKey}`,
          },
          data: bodyPayload,
        });

        if (response.status >= 200 && response.status < 300) {
          const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
          resultText = data.choices?.[0]?.message?.content ?? "";
        } else {
          throw new Error(`Status ${response.status}`);
        }
      } else {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${p.apiKey}`,
          },
          body: JSON.stringify(bodyPayload),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        resultText = data.choices?.[0]?.message?.content ?? "";
      }

      if (resultText && resultText.trim()) {
        return { text: resultText.trim(), providerName: p.name };
      }
    } catch (err: any) {
      console.warn(`AI Provider [${p.name}] failed:`, err?.message || err);
      lastError = err;
      // Continue to next backup provider without bothering user!
    }
  }

  throw lastError || new Error("All AI providers were temporarily unavailable.");
}

function AiPage() {
  const t = useT();
  const {
    chat,
    chatSessions,
    activeSessionId,
    addChatMessage,
    createChatSession,
    switchChatSession,
    deleteChatSession,
    addItem,
    addGoal,
    addTodo,
    markPrayer,
    setAiMemory,
    aiMemory,
    profile,
    lang,
    timeFormat,
  } = useApp();

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [err, setErr] = useState("");
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Voice speech recognition state
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechLang, setSpeechLang] = useState<"bn-BD" | "en-US">("bn-BD");
  const recognitionRef = useRef<any>(null);
  const listeningRequestedRef = useRef(false);
  const recognitionRetryRef = useRef<number | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 130);
    el.style.height = `${Math.max(40, nextHeight)}px`;
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length, busy, interimTranscript]);

  // Setup Speech Recognition
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionClass) {
      const rec = new SpeechRecognitionClass();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = speechLang;

      rec.onstart = () => {
        setIsListening(true);
        setInterimTranscript("");
      };

      rec.onresult = (event: any) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const trans = event.results[i][0]?.transcript || "";
          if (event.results[i].isFinal) {
            final += trans;
          } else {
            interim += trans;
          }
        }

        if (final) {
          const cleanFinal = final.trim();
          setInput((prev) => {
            if (!prev) return cleanFinal;
            if (prev.endsWith(cleanFinal)) return prev;
            return `${prev.trim()} ${cleanFinal}`;
          });
          setInterimTranscript("");
        } else if (interim) {
          setInterimTranscript(interim);
        }
      };

      rec.onerror = (e: any) => {
        if (e.error !== "no-speech" && e.error !== "aborted") {
          listeningRequestedRef.current = false;
          setIsListening(false);
        }
        setInterimTranscript("");
        if (e.error === "not-allowed") {
          setErr(
            lang === "bn"
              ? "মাইক্রোফোনের অনুমতি (Permission) প্রয়োজন।"
              : "Microphone permission is required for voice input."
          );
        }
      };

      rec.onend = () => {
        setInterimTranscript("");
        if (listeningRequestedRef.current) {
          if (recognitionRetryRef.current !== null) window.clearTimeout(recognitionRetryRef.current);
          recognitionRetryRef.current = window.setTimeout(() => {
            if (!listeningRequestedRef.current) return;
            try { rec.start(); } catch { /* ignore */ }
          }, 350);
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = rec;
    }

    return () => {
      listeningRequestedRef.current = false;
      if (recognitionRetryRef.current !== null) window.clearTimeout(recognitionRetryRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
    };
  }, [speechLang]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setErr(
        lang === "bn"
          ? "আপনার ডিভাইসে স্পিচ রিকগনিশন সমর্থিত নয়।"
          : "Speech recognition is not supported on this device."
      );
      return;
    }

    if (isListening) {
      listeningRequestedRef.current = false;
      try { recognitionRef.current.stop(); } catch {}
      setIsListening(false);
    } else {
      listeningRequestedRef.current = true;
      setErr("");
      try { recognitionRef.current.start(); } catch (e) {
        console.warn("Could not start recognition:", e);
      }
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;

    if (isListening && recognitionRef.current) {
      listeningRequestedRef.current = false;
      try { recognitionRef.current.stop(); } catch {}
      setIsListening(false);
    }

    const userMsg: ChatMsg = { role: "user", content: text };
    addChatMessage(userMsg);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "40px";
    setBusy(true);
    setErr("");
    setStatusMessage("");

    try {
      const currentHistory = [...chat, userMsg];

      // System Prompt combining Superpowers framework + Dynamic Context
      const systemPrompt = `তুমি 'নূর' (Noor AI) — ব্যবহারকারীর কাছের বিশ্বস্ত ইসলামিক লাইফস্টাইল ও অভ্যাস বন্ধু।
${SUPERPOWERS_SYSTEM_PROMPT}

USER REALTIME APP CONTEXT:
${buildCompactContext()}`;

      // Send recent messages
      const trimmedHistory = currentHistory.slice(-7).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { text: rawReply } = await requestAiCompletionWithFailover(
        [{ role: "system", content: systemPrompt }, ...trimmedHistory],
        (status) => setStatusMessage(status)
      );

      // Parse and execute ALL in-app action blocks
      let cleanContent = rawReply;
      const executedActions: string[] = [];
      const actionMatches = [...rawReply.matchAll(/```action\s*([\s\S]*?)\s*```/gi)];
      cleanContent = rawReply.replace(/```action[\s\S]*?```/gi, "").trim();

      for (const match of actionMatches) {
        try {
          const parsed = JSON.parse(match[1] ?? "{}");
          const title = typeof parsed.title === "string" ? parsed.title.trim() : "";

          if (parsed.action === "ADD_ITEM" && title) {
            if (parsed.kind === "goal") {
              addGoal(title, parsed.deadline, parsed.task);
              executedActions.push(`লক্ষ্য: ${title}`);
            } else if (parsed.kind === "task") {
              addTodo(title, today(), typeof parsed.time === "string" ? parsed.time : "");
              executedActions.push(`টাস্ক: ${title}`);
            } else if (parsed.kind === "habit") {
              addItem("habit", title, typeof parsed.time === "string" ? parsed.time : "");
              executedActions.push(`অভ্যাস: ${title}`);
            }
          } else if (parsed.action === "DELETE_ITEM" && title) {
            if (parsed.kind === "task") {
              useApp.getState().removeTodoByTitle(title);
              executedActions.push(`মুছে ফেলা হয়েছে: ${title}`);
            } else if (parsed.kind === "habit") {
              useApp.getState().removeHabitByTitle(title);
              executedActions.push(`মুছে ফেলা হয়েছে: ${title}`);
            } else if (parsed.kind === "goal") {
              useApp.getState().removeGoalByTitle(title);
              executedActions.push(`মুছে ফেলা হয়েছে: ${title}`);
            }
          } else if (parsed.action === "MARK_PRAYER" && parsed.prayer && ["fajr", "dhuhr", "asr", "maghrib", "isha"].includes(parsed.prayer)) {
            markPrayer(parsed.prayer as PrayerKey, today(), parsed.done !== false);
            executedActions.push(`নামাজ: ${PRAYER_NAMES_BN[parsed.prayer as PrayerKey] || parsed.prayer}`);
          }
        } catch (e) {
          console.warn("Failed to parse action JSON:", e);
        }
      }

      if (!cleanContent) {
        cleanContent = executedActions.length > 0
          ? (lang === "bn" ? `কাজগুলো অ্যাপে সফলভাবে যোগ করেছি:\n• ${executedActions.join("\n• ")}` : `Successfully created actions:\n• ${executedActions.join("\n• ")}`)
          : (lang === "bn" ? "আমি আপনার কথাটি বুঝতে পেরেছি। বলুন কিভাবে আরও সাহায্য করতে পারি?" : "I understand. How else can I assist you?");
      }

      addChatMessage({ role: "assistant", content: cleanContent });

      if (executedActions.length > 0) {
        setActionNotice(
          lang === "bn"
            ? `✅ সফলভাবে সম্পন্ন হয়েছে: ${executedActions.join(", ")}`
            : `✅ Successfully completed: ${executedActions.join(", ")}`
        );
        setTimeout(() => setActionNotice(null), 5000);
      }
    } catch (e: any) {
      console.error("AI send error:", e);
      setErr(
        lang === "bn"
          ? "নূর এআই বর্তমানে সাময়িকভাবে ব্যস্ত। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।"
          : "Noor AI is temporarily busy. Please try again shortly."
      );
    } finally {
      setBusy(false);
      setStatusMessage("");
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 relative">
      {/* HEADER: NOOR AI WITH CRESCENT MOON & HISTORY */}
      <header className="flex items-center justify-between pb-3 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-2xl bg-primary/15 text-primary shadow-sm border border-primary/20">
            <Moon className="size-5 fill-primary text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-lg text-foreground tracking-tight">
                {lang === "bn" ? "নূর এআই" : "Noor AI"}
              </h1>
              <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500 border border-emerald-500/20">
                <Zap className="size-2.5 fill-emerald-500" />
                {lang === "bn" ? "সক্রিয়" : "Active"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-none">
              {lang === "bn" ? "আপনার স্মার্ট ইসলামিক রুটিন ও অভ্যাস পার্টনার" : "Your intelligent routine and habit partner"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => createChatSession()}
            title={lang === "bn" ? "নতুন চ্যাট শুরু করুন" : "New Chat"}
            className="flex items-center gap-1 rounded-xl bg-secondary/80 px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary transition"
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">{lang === "bn" ? "নতুন চ্যাট" : "New"}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            title={lang === "bn" ? "চ্যাট হিস্ট্রি" : "Chat History"}
            className="flex items-center gap-1 rounded-xl bg-secondary/80 px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary transition"
          >
            <History className="size-3.5" />
            <span className="hidden sm:inline">{lang === "bn" ? "হিস্ট্রি" : "History"}</span>
          </button>
        </div>
      </header>

      {/* ACTION NOTICE TOAST */}
      {actionNotice && (
        <div className="mt-2 flex items-center justify-between rounded-xl bg-success/15 border border-success/30 px-3 py-2 text-xs text-success animate-in fade-in shrink-0">
          <span>{actionNotice}</span>
          <button onClick={() => setActionNotice(null)} className="text-success/70 hover:text-success">
            ✕
          </button>
        </div>
      )}

      {/* STATUS MESSAGE (FOR SILENT BACKUP FALLBACK) */}
      {statusMessage && (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs text-primary animate-pulse shrink-0">
          <Sparkles className="size-3.5" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* CHAT MESSAGES CONTAINER */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
        {chat.length === 0 ? (
          <div className="my-auto flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <div className="grid size-16 place-items-center rounded-3xl bg-primary/10 border border-primary/20 mb-3 shadow-inner">
              <Sparkles className="size-8 text-primary" />
            </div>
            <h3 className="font-bold text-base text-foreground mb-1">
              {lang === "bn" ? "আসসালামু আলাইকুম! আমি নূর।" : "Assalamu Alaikum! I am Noor."}
            </h3>
            <p className="max-w-xs text-xs leading-relaxed mb-4">
              {lang === "bn"
                ? "আপনার সারাদিনের ব্যস্ততা বা লক্ষ্যের কথা আমাকে বলুন। আমি প্রতিটি সময় অনুযায়ী একটি নিখুঁত রুটিন তৈরি করে সরাসরি আপনার অ্যাপে সেট করে দেব।"
                : "Tell me about your day, routine, or goals. I will design a structured schedule and automatically add tasks to your app."}
            </p>

            {/* Quick Suggestion Prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
              <button
                type="button"
                onClick={() => setInput(lang === "bn" ? "আমার সারাদিনের জন্য একটি সুন্দর ইসলামিক রুটিন বানিয়ে অ্যাপে যোগ করে দাও" : "Build an Islamic daily routine and add habits to my app")}
                className="glass p-2.5 text-left text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition rounded-xl"
              >
                💡 {lang === "bn" ? "সারাদিনের ইসলামিক রুটিন তৈরি করো" : "Create full day Islamic routine"}
              </button>
              <button
                type="button"
                onClick={() => setInput(lang === "bn" ? "আগামী ১ সপ্তাহে কুরআন খতমের জন্য দৈনিক পড়ার টাস্ক বানিয়ে দাও" : "Create daily Quran recitation plan for next week")}
                className="glass p-2.5 text-left text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition rounded-xl"
              >
                📖 {lang === "bn" ? "কুরআন পড়ার ধারাবাহিক পরিকল্পনা" : "Quran study habit plan"}
              </button>
            </div>
          </div>
        ) : (
          chat.map((m, idx) => {
            const isUser = m.role === "user";
            return (
              <div
                key={idx}
                className={cn("flex items-start gap-2.5", isUser ? "justify-end" : "justify-start")}
              >
                {!isUser && (
                  <div className="grid size-7 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary border border-primary/30 mt-1">
                    <Moon className="size-4 fill-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap shadow-sm",
                    isUser
                      ? "bg-primary text-primary-foreground font-medium rounded-br-xs"
                      : "glass border-border/60 text-foreground rounded-bl-xs"
                  )}
                >
                  {m.content}
                </div>
              </div>
            );
          })
        )}

        {/* Busy Indicator */}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="grid size-6 place-items-center rounded-lg bg-primary/15 text-primary">
              <Moon className="size-3.5 fill-primary animate-pulse" />
            </div>
            <span className="animate-pulse">
              {lang === "bn" ? "নূর চিন্তা করছে..." : "Noor is formulating..."}
            </span>
          </div>
        )}

        {/* Interim Speech Transcript */}
        {isListening && interimTranscript && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-2 text-xs italic text-primary">
            🎤 {interimTranscript}
          </div>
        )}

        {err && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
            {err}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* INPUT BAR WITH VOICE MIC & SEND */}
      <div className="pt-2 border-t border-border/40 shrink-0">
        <div className="glass flex items-end gap-1.5 p-1.5 rounded-2xl border-border/70 focus-within:border-primary/60 transition">
          <button
            type="button"
            onClick={toggleListening}
            title={isListening ? (lang === "bn" ? "ভয়েস ইনপুট বন্ধ" : "Stop voice") : (lang === "bn" ? "ভয়েসে কথা বলুন" : "Speak")}
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl transition",
              isListening
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              isListening
                ? (lang === "bn" ? "শুনছি... কথা বলুন" : "Listening...")
                : (lang === "bn" ? "নূরকে কিছু বলুন বা সারাদিনের কাজের কথা লিখুন..." : "Message Noor...")
            }
            className="flex-1 resize-none bg-transparent px-2 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none max-h-32 min-h-[38px]"
          />

          <button
            type="button"
            onClick={send}
            disabled={!input.trim() || busy}
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow transition hover:opacity-90 disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>

      {/* CHAT SESSIONS DRAWER / MODAL */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="glass my-auto flex w-full max-w-sm flex-col gap-3 p-4 shadow-2xl border-border/60">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <h3 className="text-sm font-bold text-foreground">
                {lang === "bn" ? "পূর্ববর্তী আলাপচারিতা (History)" : "Chat History"}
              </h3>
              <button onClick={() => setShowHistory(false)} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {(chatSessions || []).length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">
                  {lang === "bn" ? "কোনো চ্যাট হিস্ট্রি নেই।" : "No previous chats."}
                </p>
              ) : (
                chatSessions.map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      "flex items-center justify-between rounded-xl p-2 text-xs transition cursor-pointer",
                      session.id === activeSessionId
                        ? "bg-primary/20 text-foreground font-semibold"
                        : "hover:bg-secondary/60 text-muted-foreground"
                    )}
                  >
                    <span
                      onClick={() => {
                        switchChatSession(session.id);
                        setShowHistory(false);
                      }}
                      className="truncate flex-1 pr-2"
                    >
                      {session.title || (lang === "bn" ? "নতুন আলাপ" : "Conversation")}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChatSession(session.id);
                      }}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                createChatSession();
                setShowHistory(false);
              }}
              className="w-full rounded-xl bg-primary py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition"
            >
              + {lang === "bn" ? "নতুন চ্যাট শুরু করুন" : "Start New Chat"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
