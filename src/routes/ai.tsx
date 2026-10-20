import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, WifiOff, Sparkles, Plus, History, Trash2, CheckCircle2, Moon, X, AlertCircle } from "lucide-react";
import { useApp, PRAYERS, type ChatMsg, type PrayerKey, type ItemKind, today } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { API_BASE } from "@/lib/update";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "Noor AI — Islamic Routine & Habit Coach" },
      { name: "description", content: "Plan routines, track habits and prayers with intelligent AI coach." },
      { property: "og:title", content: "Noor AI — Islamic Routine & Habit Coach" },
      { property: "og:description", content: "Plan routines, track habits and prayers with intelligent AI coach." },
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
    return `${p.key} (${p.time}): ${isDone ? "Done" : "Pending"}`;
  });

  const habitsList = s.items.filter((i) => i.kind === "habit").map((i) => {
    const isDone = i.doneDates.includes(todayStr);
    return `[HABIT] "${i.title}" time: ${i.time || "anytime"} - Today: ${isDone ? "Done" : "Pending"}`;
  });

  const goalsList = s.goals.map((g) => {
    const subTasks = g.subTasks.map((st) => `  * ${st.title} (${st.doneDates.includes(todayStr) ? "Done today" : "Pending"})`).join("\n");
    return `[GOAL] "${g.title}" (Deadline: ${g.deadline || "None"})\n${subTasks || "  * No subtasks yet"}`;
  });

  const todosList = s.todos.map((td) => {
    return `[TODO] "${td.title}" Due: ${td.dueDate || "today"} Status: ${td.completed ? "Completed" : "Pending"}`;
  });

  return [
    `=== USER PROFILE ===`,
    `Name: ${s.profile?.name || "Friend"}; Goal: ${s.profile?.goal || "Spiritual growth"}; Language: ${s.lang}`,
    `Memory Notes: ${s.aiMemory.learnedNotes.join("; ") || "None"}`,
    ``,
    `=== TODAY'S PRAYER STATUS (${todayStr}) ===`,
    ...todayPrayers,
    ``,
    `=== ACTIVE HABITS ===`,
    habitsList.length ? habitsList.join("\n") : "No habits yet.",
    ``,
    `=== ACTIVE GOALS & DAILY TASKS ===`,
    goalsList.length ? goalsList.join("\n") : "No goals set yet.",
    ``,
    `=== TO-DO LIST ===`,
    todosList.length ? todosList.join("\n") : "No to-do items.",
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
    addGoal,
    addTodo,
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
        const kind: ItemKind = ["habit", "goal", "task"].includes(data.kind) ? data.kind : "habit";
        const title: string = data.title || "নতুন টাস্ক";
        const time: string = data.time || "";

        if (kind === "goal") {
          addGoal(title, data.deadline || "1 week", data.subtask);
          return {
            type: "ADD_GOAL",
            details: lang === "bn" ? `লক্ষ্য যোগ করা হয়েছে: ${title}` : `Goal created: ${title}`,
          };
        } else if (kind === "task") {
          addTodo(title, today(), time);
          return {
            type: "ADD_TODO",
            details: lang === "bn" ? `টু-ডু যোগ করা হয়েছে: ${title}` : `To-Do added: ${title}`,
          };
        } else {
          addItem("habit", title, time);
          return {
            type: "ADD_HABIT",
            details: lang === "bn" ? `অভ্যাস যোগ করা হয়েছে: ${title}` : `Habit added: ${title}`,
          };
        }
      } else if (data.action === "MARK_PRAYER") {
        const prayer = data.prayer?.toLowerCase() as PrayerKey;
        if (PRAYERS.includes(prayer)) {
          markPrayer(prayer, today(), data.done ?? true);
          return {
            type: "MARK_PRAYER",
            details:
              lang === "bn"
                ? `${t(prayer as never)} নামাজ ${data.done === false ? "মিস হিসেবে চিহ্নিত" : "আদায় সম্পন্ন"}`
                : `${prayer} prayer marked as ${data.done === false ? "missed" : "prayed"}`,
          };
        }
      } else if (data.action === "DELETE_ITEM") {
        const targetTitle = (data.title || "").toLowerCase();
        const found = useApp.getState().items.find((i) => i.title.toLowerCase().includes(targetTitle));
        if (found) {
          removeItem(found.id);
          return {
            type: "DELETE_ITEM",
            details: lang === "bn" ? `"${found.title}" সফলভাবে মোছা হয়েছে` : `Deleted: "${found.title}"`,
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
        } else if (r.status === 402) {
          const data = (await r.json()) as { error?: string };
          throw new Error(
            data.error ||
              (lang === "bn"
                ? "এআই অ্যাকাউন্টে ব্যালেন্স অপর্যাপ্ত। অনুগ্রহ করে VyceAI ক্রেডিট রিচার্জ করুন।"
                : "Insufficient balance in AI account. Please top up VyceAI credits.")
          );
        }
      } catch (innerErr) {
        if (innerErr instanceof Error && innerErr.message.includes("balance")) {
          throw innerErr;
        }
      }

      // 2. Direct client fallback call to VyceAI with glm-5.3-flash
      if (!rawReply) {
        const systemPrompt = `You are Noor, a warm, caring Islamic habit coach and routine assistant.
Language: Reply in ${lang === "bn" ? "smart natural Bengali" : "clear English"} matching the user.
Adapt to user tone and habit goals.

REAL APP ACTIONS:
If the user asks to add habits, goals, to-do items or mark prayers, add a JSON block at the end:
\`\`\`action
{"action":"ADD_ITEM","kind":"habit"|"goal"|"task","title":"...","time":"HH:MM"}
\`\`\`
Or
\`\`\`action
{"action":"MARK_PRAYER","prayer":"fajr"|"dhuhr"|"asr"|"maghrib"|"isha","done":true}
\`\`\`

USER DATA CONTEXT:
${buildContext()}`;

        const fallbackRes = await fetch("https://vyceai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer sk-8c5c0bc6d8871536b2f2bec1d549f8382e901c65d369e5d3",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          body: JSON.stringify({
            model: "glm-5.3-flash",
            messages: [
              { role: "system", content: systemPrompt },
              ...currentHistory.slice(-12).map((m) => ({ role: m.role, content: m.content })),
            ],
          }),
        });

        if (!fallbackRes.ok) {
          const errText = await fallbackRes.text();
          if (fallbackRes.status === 402 || errText.includes("insufficient_balance")) {
            throw new Error(
              lang === "bn"
                ? "⚠️ VyceAI অ্যাকাউন্টে ব্যালেন্স শেষ হয়ে গেছে। অনুগ্রহ করে ব্যালেন্স রিচার্জ করুন।"
                : "⚠️ Insufficient balance in VyceAI account. Please top up credits."
            );
          }
          throw new Error(`AI request failed (${fallbackRes.status})`);
        }

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
      {/* HEADER: CLEAN CRESCENT LOGO & ACTION BUTTONS */}
      <div className="flex items-center justify-between border-b border-border/20 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
            title={lang === "bn" ? "আলোচনার ইতিহাস" : "Chat History"}
          >
            <History className="size-3.5" />
            {lang === "bn" ? `ইতিহাস (${chatSessions.length})` : `History (${chatSessions.length})`}
          </button>
          <button
            onClick={() => createChatSession()}
            className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition"
          >
            <Plus className="size-3.5" />
            {lang === "bn" ? "নতুন চ্যাট" : "New Chat"}
          </button>
        </div>

        {/* ELEGANT LOGO WITH CRESCENT */}
        <div className="flex items-center gap-1.5 text-primary font-bold text-base tracking-wide">
          <Moon className="size-4 fill-primary" />
          <span>Noor AI</span>
        </div>
      </div>

      {!online && (
        <div className="glass flex items-center gap-2 p-3 text-xs text-warning">
          <WifiOff className="size-4 shrink-0" />
          {t("offlineAi")}
        </div>
      )}

      {/* CHAT MESSAGES */}
      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto overscroll-contain">
        {chat.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <div className="relative mb-3 grid size-16 place-items-center rounded-3xl bg-primary/10 shadow-lg">
              <Moon className="size-8 fill-primary text-primary" />
            </div>
            <p className="text-base font-bold text-foreground">
              {lang === "bn" ? "আসসালামু আলাইকুম! আমি নূর এআই।" : "Assalamu alaikum! I am Noor AI."}
            </p>
            <p className="text-xs max-w-xs mt-1 leading-relaxed">
              {lang === "bn"
                ? "আমি আপনার অ্যাপের নামাজ, অভ্যাস ও টাস্ক সরাসরি ম্যানেজ করতে পারি। যেকোনো লক্ষ্য যোগ করতে বলুন বা রুটিন সাজাতে সাহায্য নিন।"
                : "I can manage your prayers, habits, goals and to-do lists directly inside this app. Ask me to add tasks or plan your routine!"}
            </p>

            <div className="mt-4 flex flex-wrap justify-center gap-2 max-w-sm">
              <button
                onClick={() =>
                  setInput(
                    lang === "bn"
                      ? "প্রতিদিন সকাল ৭টায় কুরআন তিলাওয়াতের একটা অভ্যাস যুক্ত করো"
                      : "Add a Quran recitation habit daily at 7 AM"
                  )
                }
                className="rounded-xl border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                ✨ {lang === "bn" ? "কুরআন তিলাওয়াত অভ্যাস যোগ করো" : "Add Quran recitation habit"}
              </button>
              <button
                onClick={() =>
                  setInput(
                    lang === "bn"
                      ? "আজকে আমার কোন কোন নামাজ বাকি আছে?"
                      : "Which prayers are pending today?"
                  )
                }
                className="rounded-xl border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                🕌 {lang === "bn" ? "আজকের নামাজের হিসাব" : "Check today's prayers"}
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
                  ? "rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground shadow-sm font-medium"
                  : "glass rounded-2xl px-4 py-2.5 text-foreground"
              )}
            >
              {m.content}
            </div>

            {/* ACTION CARD EXECUTED */}
            {m.actionDone && (
              <div className="flex items-center gap-1.5 rounded-xl border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success shadow-sm animate-in fade-in">
                <CheckCircle2 className="size-3.5 shrink-0" />
                <span>
                  {lang === "bn" ? `অ্যাপে সম্পন্ন: ${m.actionDone.details}` : `Executed in app: ${m.actionDone.details}`}
                </span>
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-primary font-medium animate-pulse p-2">
            <Moon className="size-3.5 animate-spin" />
            <span>{lang === "bn" ? "নূর চিন্তা করছে ও আপডেট করছে..." : "Noor is thinking and updating..."}</span>
          </div>
        )}

        {err && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{err}</span>
          </div>
        )}

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
          placeholder={
            lang === "bn"
              ? "নূর এআই-কে বলুন (যেমন: একটি অভ্যাস বা টাস্ক যোগ করো...)"
              : "Tell Noor AI (e.g. Add a habit or task...)"
          }
          className="max-h-32 flex-1 resize-none bg-transparent p-2 outline-none text-sm placeholder:text-muted-foreground/60"
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
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 transition shadow"
        >
          <Send className="size-4" />
        </button>
      </form>

      {/* CHAT HISTORY MODAL / DRAWER */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="glass flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden p-5 shadow-2xl rounded-2xl border border-border/60">
            <div className="flex items-center justify-between pb-3 border-b border-border/40">
              <h2 className="text-base font-bold flex items-center gap-2">
                <History className="size-4 text-primary" />
                {lang === "bn" ? "আলোচনার ইতিহাস (Chat History)" : "Chat History"}
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
                {lang === "bn" ? "নতুন আলোচনা শুরু করুন (New Chat)" : "Start New Chat"}
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
                      "flex items-center justify-between rounded-xl p-3 cursor-pointer transition border",
                      isActive
                        ? "border-primary bg-primary/10 glow-on"
                        : "border-border/30 bg-secondary/40 hover:bg-secondary"
                    )}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {sess.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {sess.createdAt} • {sess.messages.length} {lang === "bn" ? "টি বার্তা" : "messages"}
                      </p>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChatSession(sess.id);
                      }}
                      className="text-muted-foreground hover:text-destructive p-1 rounded transition"
                      title={lang === "bn" ? "মুছে ফেলুন" : "Delete"}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 pt-2 border-t border-border/30 text-center text-[10px] text-muted-foreground">
              🔒 {lang === "bn" ? "সমস্ত আলোচনা আপনার ফোনেই নিরাপদে সংরক্ষিত।" : "All chat sessions are saved securely on your device."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
