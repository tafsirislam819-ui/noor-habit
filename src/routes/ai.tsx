import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, WifiOff, Sparkles } from "lucide-react";
import { useApp, PRAYERS } from "@/lib/store";
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

function buildContext() {
  const s = useApp.getState();
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const missed = PRAYERS.filter((k) => !s.prayers.find((p) => p.key === k)?.doneDates.includes(z));
    return `${z}: missed prayers = ${missed.length ? missed.join(", ") : "none"}`;
  });
  return [
    `Name: ${s.profile?.name}; birth: ${s.profile?.birth || "-"}; main goal: ${s.profile?.goal || "-"}`,
    `Today: ${new Date().toDateString()}`,
    `Prayer times: ${s.prayers.map((p) => `${p.key} ${p.time}`).join(", ")}`,
    `Items: ${s.items.map((i) => `[${i.kind}] ${i.title} ${i.time} (done ${i.doneDates.length} days, started ${i.createdAt})`).join("; ") || "none"}`,
    `Prayer log (last 30 days):`,
    ...days,
  ].join("\n");
}

function AiPage() {
  const t = useT();
  const { chat, setChat, lang } = useApp();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [online, setOnline] = useState(true);
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

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !online) return;
    const next = [...chat, { role: "user" as const, content: text }];
    setChat(next);
    setInput("");
    setBusy(true);
    setErr("");

    try {
      // 1. Try internal API endpoint first
      let reply = "";
      const chatUrl = API_BASE ? `${API_BASE}/api/public/chat` : "/api/public/chat";
      try {
        const r = await fetch(chatUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: next, context: buildContext(), lang }),
        });
        if (r.ok) {
          const data = (await r.json()) as { reply?: string };
          if (data.reply) reply = data.reply;
        }
      } catch {
        // Fallback to direct client call if server endpoint is not available (e.g. mobile APK)
      }

      // 2. Direct fallback to VyceAI if internal route was unreachable
      if (!reply) {
        const system = `You are Noor, a warm Islamic habit and routine coach inside a habit app. Reply in ${lang === "en" ? "English" : "Bangla"} unless the user writes otherwise. Help plan routines around the 5 daily prayers, talk freely about habits, and answer questions about the user's records using ONLY the data below. If data for a date is missing, say so honestly.\n\nUSER DATA:\n${buildContext()}`;

        const fallbackRes = await fetch("https://vyceai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer sk-027318b719d9c5b6001189fd48234dbfc5cc364441d3eef9",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            messages: [{ role: "system", content: system }, ...next.slice(-15)],
          }),
        });

        if (!fallbackRes.ok) throw new Error(`AI request failed (${fallbackRes.status})`);
        const data = (await fallbackRes.json()) as { choices?: { message?: { content?: string } }[] };
        reply = data.choices?.[0]?.message?.content ?? "";
      }

      if (!reply) throw new Error("Could not get response from AI");
      setChat([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error connecting to AI");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col gap-3 md:h-[calc(100dvh-3rem)]">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <span>🌙</span>
          <span>Noor AI</span>
        </h1>
        <span className="flex items-center gap-1 text-xs text-primary bg-primary/10 rounded-full px-3 py-1 font-medium">
          <Sparkles className="size-3" />
          Claude 3.7
        </span>
      </div>

      {!online && (
        <div className="glass flex items-center gap-2 p-3 text-sm text-warning">
          <WifiOff className="size-4" />
          {t("offlineAi")}
        </div>
      )}

      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto overscroll-contain">
        {chat.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <span className="text-4xl mb-2">🕌</span>
            <p className="text-base font-semibold text-foreground">
              {lang === "bn" ? "আসসালামু আলাইকুম! আমি নূর এআই।" : "Assalamu alaikum! I am Noor AI."}
            </p>
            <p className="text-xs max-w-xs mt-1">
              {lang === "bn"
                ? "আপনার নামাজ ও অভ্যাসের ওপর ভিত্তি করে ইসলামিক রুটিন তৈরি করতে আমাকে যেকোনো প্রশ্ন করতে পারেন।"
                : "Ask me anything to plan a productive daily routine around your 5 daily prayers."}
            </p>
          </div>
        )}

        {chat.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed",
              m.role === "user"
                ? "ml-auto rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground shadow-sm"
                : "glass rounded-2xl px-4 py-2.5 text-foreground"
            )}
          >
            {m.content}
          </div>
        ))}
        {busy && <div className="text-sm text-muted-foreground animate-pulse p-2">Noor is thinking...</div>}
        {err && <div className="text-sm text-destructive p-2">{err}</div>}
        <div ref={endRef} />
      </div>

      <form className="glass flex items-end gap-2 p-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          rows={1}
          value={input}
          disabled={!online}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("askAi")}
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
    </div>
  );
}
