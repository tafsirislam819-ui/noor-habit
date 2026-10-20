import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, WifiOff, Sparkles, Plus, History, Trash2, CheckCircle2, ListPlus, Moon, X } from "lucide-react";
import { useApp, PRAYERS, type ChatMsg, type PrayerKey, type ItemKind, today } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { API_BASE } from "@/lib/update";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "AI Coach — Noor Habit" },
      { name: "description", content: "Plan routines and chat about your habits and prayers." },
      { property: "og:title", content: "AI Coach — Noor Habit" },
      { property: "og:description", content: "Plan routines and chat about your habits and prayers." },
    ],
  }),
  component: AiPage,
});

/** Build rich app data context for smart AI execution */
function buildContext() {
  const s = useApp.getState();
  const todayStr = today();

  const todayPrayers = s.prayers.map((p) => {
    const isDone = p.doneDates.includes(todayStr);
    return `${p.key} (${p.time}): ${isDone ? "আদায় হয়েছে (Done)" : "বাকি আছে (Pending)"}`;
  });

  const allItems = s.items.map((i) => {
    const isDone = i.doneDates.includes(todayStr);
    return `[${i.kind.toUpperCase()}] "${i.title}" time: ${i.time || "anytime"} - Today: ${isDone ? "Done" : "Pending"} (Total done: ${i.doneDates.length} days)`;
  });

  const last7DaysMissed = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - idx);
    const z = today(d);
    const missed = PRAYERS.filter((k) => !s.prayers.find((p) => p.key === k)?.doneDates.includes(z));
    return `${z}: ${missed.length ? "Missed " + missed.join(", ") : "All 5 prayers completed"}`;
  });

  return [
    `=== USER PROFILE ===`,
    `Name: ${s.profile?.name || "User"}; Goal: ${s.profile?.goal || "Spiritual growth"}; Language: ${s.lang}`,
    `Learned User Tone & Style: ${s.aiMemory.tone}`,
    s.aiMemory.learnedNotes.length ? `Memory Notes: ${s.aiMemory.learnedNotes.join("; ")}` : "",
    ``,
    `=== TODAY'S PRAYER STATUS (${todayStr}) ===`,
    ...todayPrayers,
    ``,
    `=== USER'S ACTIVE TASKS & HABITS ===`,
    allItems.length ? allItems.join("\n") : "No custom items yet.",
    ``,
    `=== RECENT 7 DAYS PRAYER RECORD ===`,
    ...last7DaysMissed,
  ].filter(Boolean).join("\n");
}

function AiPage() {
  const t = useT();
  const {
    chat,
    chatSessions,
    activeSessionId,
    createChatSession,
    switchChatSession,
    deleteChatSession,
    addChatMessage,
    addItem,
    markPrayer,
    removeItem,
    setAiMemory,
    lang,
  } = useApp();

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [online, setOnline] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = () => setOnline(navigator.onLine);
    u();
    window.addEventListener("online", u);
    window.addEventListener("offline", u);
    return () => {
      window.removeEventListener("online", u);
      window.removeEventListener("offline", u);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length, busy]);

  /** Execute action instructions parsed from AI response */
  const executeAiAction = (actionJsonStr: string) => {
    try {
      const data = JSON.parse(actionJsonStr);
      if (!data || !data.action) return null;

      if (data.action === "ADD_ITEM") {
        const kind: ItemKind = ["habit", "goal", "task"].includes(data.kind) ? data.kind : "task";
        const title: string = data.title || "নতুন টাস্ক";
        const time: string = data.time || "";
        addItem(kind, title, time);
        return {
          type: "ADD_ITEM",
          details: `${kind === "habit" ? "অভ্যাস" : kind === "goal" ? "লক্ষ্য" : "টাস্ক"}: ${title} ${time ? `(${time})` : ""}`,
        };
      } else if (data.action === "MARK_PRAYER") {
        const prayer = data.prayer?.toLowerCase() as PrayerKey;
        if (PRAYERS.includes(prayer)) {
          markPrayer(prayer, today(), data.done ?? true);
          return {
            type: "MARK_PRAYER",
            details: `${t(prayer as never)} নামাজ ${data.done === false ? "মিস হিসেবে চিহ্নিত" : "আদায় সম্পন্ন"}`,
          };
        }
      } else if (data.action === "DELETE_ITEM") {
        const targetTitle = (data.title || "").toLowerCase();
        const found = useApp.getState().items.find((i) => i.title.toLowerCase().includes(targetTitle));
        if (found) {
          removeItem(found.id);
          return {
            type: "DELETE_ITEM",
            details: `"${found.title}" সফলভাবে ডিলিট করা হয়েছে`,
          };
        }
      } else if (data.action === "LEARN_TONE") {
        if (data.note) {
          setAiMemory({
            learnedNotes: [...useApp.getState().aiMemory.learnedNotes.slice(-5), data.note],
          });
        }
      }
    } catch (e) {
      console.warn("Could not parse AI action:", e);
    }
    return null;
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !online) return;

    const userMsg: ChatMsg = { role: "user", content: text };
    addChatMessage(userMsg);
    setInput("");
    setBusy(true);
    setErr("");

    try {
      const currentHistory = [...chat, userMsg];
      let rawReply = "";

      // 1. Try internal server API if available
      const chatUrl = API_BASE ? `${API_BASE}/api/public/chat` : "/api/public/chat";
      try {
        const r = await fetch(chatUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: currentHistory, context: buildContext(), lang }),
        });
        if (r.ok) {
          const data = (await r.json()) as { reply?: string };
          if (data.reply) rawReply = data.reply;
        }
      } catch {
        // Fallback to client AI endpoint
      }

      // 2. Direct AI call
      if (!rawReply) {
        const systemPrompt = `You are Noor, a deeply compassionate, highly capable Islamic habit coach and smart in-app assistant.
Language: Reply in ${lang === "bn" ? "Bangla" : "English"} naturally, matching the user's tone, dialect, and emotional state.
Tone adaptation: Observe how the user speaks (friendly, serious, concise, devotional) and adapt smoothly. Be warm, non-judgmental, and practical.

CAPABILITIES & REAL IN-APP ACTIONS:
You have direct read/write control of the user's habit app!
Whenever the user asks you to add a task, habit, goal, record a prayer, or remove something, you MUST include a JSON action block at the very end of your reply in this exact format:
\`\`\`action
{"action":"ADD_ITEM","kind":"task","title":"কুরআন তিলাওয়াত","time":"06:30"}
\`\`\`
Or for prayer:
\`\`\`action
{"action":"MARK_PRAYER","prayer":"fajr","done":true}
\`\`\`
Or for delete:
\`\`\`action
{"action":"DELETE_ITEM","title":"..."}
\`\`\`

Available actions:
- {"action":"ADD_ITEM","kind":"task"|"habit"|"goal","title":string,"time":"HH:MM"|""}
- {"action":"MARK_PRAYER","prayer":"fajr"|"dhuhr"|"asr"|"maghrib"|"isha","done":true|false}
- {"action":"DELETE_ITEM","title":string}

Never say you added or marked a task unless you provide the \`\`\`action\`\`\` block! The app executes it instantly.

LIVE USER APP DATA:
${buildContext()}`;

        const fallbackRes = await fetch("https://vyceai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer sk-027318b719d9c5b6001189fd48234dbfc5cc364441d3eef9",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            messages: [
              { role: "system", content: systemPrompt },
              ...currentHistory.slice(-12).map((m) => ({ role: m.role, content: m.content })),
            ],
          }),
        });

        if (!fallbackRes.ok) throw new Error(`AI request failed (${fallbackRes.status})`);
        const data = (await fallbackRes.json()) as { choices?: { message?: { content?: string } }[] };
        rawReply = data.choices?.[0]?.message?.content ?? "";
      }

      if (!rawReply) throw new Error("Could not get response from AI");

      // Parse and execute actions
      let cleanContent = rawReply;
      let actionResult: { type: string; details: string } | null = null;
      const actionMatch = rawReply.match(/```action\s*([\s\S]*?)\s*```/);

      if (actionMatch && actionMatch[1]) {
        actionResult = executeAiAction(actionMatch[1].trim());
        cleanContent = rawReply.replace(/```action\s*[\s\S]*?\s*```/g, "").trim();
      }

      addChatMessage({
        role: "assistant",
        content: cleanContent,
        actionDone: actionResult || undefined,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error connecting to AI");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col gap-3 md:h-[calc(100dvh-3rem)]">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-muted transition"
            title="আলোচনার ইতিহাস (Chat History)"
          >
            <History className="size-3.5" />
            ইতিহাস ({chatSessions.length})
          </button>
          <button
            onClick={() => createChatSession()}
            className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition"
          >
            <Plus className="size-3.5" />
            নতুন চ্যাট
          </button>
        </div>

        <span className="flex items-center gap-1 text-xs text-primary bg-primary/10 rounded-full px-3 py-1 font-medium">
          <Sparkles className="size-3" />
          নূর এআই সহকারী
        </span>
      </div>

      {!online && (
        <div className="glass flex items-center gap-2 p-3 text-sm text-warning">
          <WifiOff className="size-4" />
          {t("offlineAi")}
        </div>
      )}

      {/* CHAT MESSAGES */}
      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto overscroll-contain">
        {chat.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <span className="text-4xl mb-2">🕌</span>
            <p className="text-base font-semibold text-foreground">
              {lang === "bn" ? "আসসালামু আলাইকুম! আমি নূর এআই।" : "Assalamu alaikum! I am Noor AI."}
            </p>
            <p className="text-xs max-w-xs mt-1">
              {lang === "bn"
                ? "আমি আপনার অ্যাপের নামাজ ও অভ্যাস সরাসরি ম্যানেজ করতে পারি। যেকোনো টাস্ক যোগ করতে বলুন বা রুটিন সাজাতে পরামর্শ নিন।"
                : "I can directly manage your prayers, habits, and tasks inside this app. Ask me to add tasks or plan your routine!"}
            </p>

            <div className="mt-4 flex flex-wrap justify-center gap-2 max-w-sm">
              <button
                onClick={() => setInput(lang === "bn" ? "প্রতিদিন সকাল ৭টায় কুরআন তিলাওয়াতের একটা টাস্ক যুক্ত করো" : "Add a Quran recitation task daily at 7 AM")}
                className="rounded-xl border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                ✨ কুরআন তিলাওয়াত টাস্ক যোগ করো
              </button>
              <button
                onClick={() => setInput(lang === "bn" ? "আজকে আমার কোন কোন নামাজ বাকি আছে?" : "Which prayers are pending today?")}
                className="rounded-xl border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                🕌 আজকের নামাজের হিসাব
              </button>
            </div>
          </div>
        )}

        {chat.map((m, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-col gap-1.5 max-w-[85%]",
              m.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
            )}
          >
            <div
              className={cn(
                "whitespace-pre-wrap text-sm leading-relaxed",
                m.role === "user"
                  ? "rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground shadow-sm"
                  : "glass rounded-2xl px-4 py-2.5 text-foreground"
              )}
            >
              {m.content}
            </div>

            {/* ACTION CARD EXECUTED */}
            {m.actionDone && (
              <div className="flex items-center gap-1.5 rounded-xl border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success shadow-sm animate-in fade-in">
                <CheckCircle2 className="size-3.5 shrink-0" />
                <span>অ্যাপে স্বয়ংক্রিয়ভাবে সম্পন্ন: {m.actionDone.details}</span>
              </div>
            )}
          </div>
        ))}

        {busy && <div className="text-sm text-muted-foreground animate-pulse p-2">Noor is thinking & updating...</div>}
        {err && <div className="text-sm text-destructive p-2">{err}</div>}
        <div ref={endRef} />
      </div>

      {/* INPUT BOX */}
      <form
        className="glass flex items-end gap-2 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          rows={1}
          value={input}
          disabled={!online}
          onChange={(e) => setInput(e.target.value)}
          placeholder={lang === "bn" ? "নূর এআই-কে বলুন (যেমন: একটি টাস্ক যোগ করো...)" : "Tell Noor AI (e.g. Add a task...)"}
          className="max-h-32 flex-1 resize-none bg-transparent p-2 outline-none text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          disabled={busy || !online || !input.trim()}
          aria-label={t("send")}
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 transition"
        >
          <Send className="size-4" />
        </button>
      </form>

      {/* CHAT HISTORY MODAL / DRAWER */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="glass flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border/40">
              <h2 className="text-base font-bold flex items-center gap-2">
                <History className="size-4" />
                আলোচনার ইতিহাস (Chat History)
              </h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="my-3">
              <button
                onClick={() => {
                  createChatSession();
                  setShowHistory(false);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
              >
                <Plus className="size-4" />
                নতুন আলোচনা শুরু করুন (New Chat)
              </button>
            </div>

            <div className="no-scrollbar flex-1 space-y-2 overflow-y-auto">
              {chatSessions.map((sess) => {
                const isActive = sess.id === activeSessionId;
                return (
                  <div
                    key={sess.id}
                    onClick={() => {
                      switchChatSession(sess.id);
                      setShowHistory(false);
                    }}
                    className={cn(
                      "flex items-center justify-between rounded-xl p-3 cursor-pointer transition",
                      isActive ? "glow-on" : "bg-muted/40 hover:bg-muted"
                    )}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {sess.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {sess.createdAt} • {sess.messages.length}টি বার্তা
                      </p>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChatSession(sess.id);
                      }}
                      className="text-muted-foreground hover:text-destructive p-1 rounded transition"
                      title="মুছে ফেলুন"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
