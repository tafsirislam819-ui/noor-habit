import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useApp, today, type ItemKind } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { NotifyToggle } from "@/components/NotifyToggle";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Noor Habit — Prayer, habits & goals" },
      { name: "description", content: "Track namaz, habits, goals and tasks with smart reminders." },
      { property: "og:title", content: "Noor Habit — Prayer, habits & goals" },
      { property: "og:description", content: "Track namaz, habits, goals and tasks with smart reminders." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const t = useT();
  const { profile, items, prayers, markPrayer, toggleItem, setItemNotify } = useApp();
  const d = today();
  const prayed = prayers.filter((p) => p.doneDates.includes(d)).length;
  const done = items.filter((i) => i.doneDates.includes(d)).length;
  const total = prayers.length + items.length;
  const pct = total ? Math.round(((prayed + done) / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-sm text-muted-foreground">{t("hello")} 👋</p>
        <h1 className="text-3xl font-bold">{profile?.name}</h1>
      </header>

      <section className="glass flex items-center gap-5 p-5">
        <div className="relative grid size-24 place-items-center">
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct * 0.974} 100`} />
          </svg>
          <span className="text-2xl font-bold">{pct}%</span>
        </div>
        <div>
          <p className="text-muted-foreground">{t("todayProgress")}</p>
          <p className="mt-1 text-sm">🕌 {prayed}/5 · ✅ {done}/{items.length}</p>
          {profile?.goal && <p className="mt-1 text-sm text-primary">🎯 {profile.goal}</p>}
        </div>
      </section>

      <section className="glass p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{t("prayer")}</h2>
          <Link to="/prayer" className="text-xs text-primary">→</Link>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {prayers.map((p) => {
            const ok = p.doneDates.includes(d);
            return (
              <button key={p.key} onClick={() => markPrayer(p.key)} className={cn("flex flex-col items-center gap-1 rounded-xl py-3 text-xs transition", ok ? "glow-on" : "bg-secondary")}>
                {ok ? <Check className="size-4" /> : <span className="size-4" />}
                {t(p.key)}
                <span className="text-[10px] text-muted-foreground">{p.time}</span>
              </button>
            );
          })}
        </div>
      </section>

      {(["habit", "goal", "task"] as ItemKind[]).map((k) => {
        const list = items.filter((i) => i.kind === k);
        return (
          <section key={k} className="glass p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">{t(k === "habit" ? "habits" : k === "goal" ? "goals" : "tasks")}</h2>
              <Link to="/plan" className="text-xs text-primary">+ {t("add")}</Link>
            </div>
            {list.length === 0 && <p className="py-2 text-sm text-muted-foreground">{t("empty")}</p>}
            <ul className="flex flex-col gap-2">
              {list.map((i) => {
                const ok = i.doneDates.includes(d);
                return (
                  <li key={i.id} className="flex items-center gap-3 rounded-xl bg-secondary p-3">
                    <button onClick={() => toggleItem(i.id)} className={cn("grid size-7 shrink-0 place-items-center rounded-full border", ok && "glow-on border-transparent")}>
                      {ok && <Check className="size-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate", ok && "text-muted-foreground line-through")}>{i.title}</p>
                      {i.time && <p className="text-xs text-muted-foreground">{i.time}</p>}
                    </div>
                    <NotifyToggle mode={i.notify} onChange={(m) => setItemNotify(i.id, m)} />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
