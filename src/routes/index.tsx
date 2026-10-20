import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Check,
  Bell,
  CheckCircle2,
  Target,
  ListTodo,
  Sparkles,
  ChevronRight,
  Flame,
  X,
  Clock,
} from "lucide-react";
import {
  useApp,
  today,
  formatAppTime,
  type PrayerKey,
  type Goal,
} from "@/lib/store";
import { useT } from "@/lib/i18n";
import { NotifyToggle } from "@/components/NotifyToggle";
import { requestPermission } from "@/lib/notify";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Noor Habit — Daily Prayers, Goals & Habits" },
      { name: "description", content: "Track namaz, actionable goals, daily habits and to-do lists." },
      { property: "og:title", content: "Noor Habit — Daily Prayers, Goals & Habits" },
      { property: "og:description", content: "Track namaz, actionable goals, daily habits and to-do lists." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const t = useT();
  const {
    profile,
    items,
    prayers,
    goals,
    todos,
    markPrayer,
    toggleItem,
    setItemNotify,
    toggleGoalSubTask,
    toggleTodo,
    appNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
    timeFormat,
    lang,
  } = useApp();

  const d = today();
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  // Daily Calculations
  const habits = useMemo(() => items.filter((i) => i.kind === "habit"), [items]);
  const prayedCount = prayers.filter((p) => p.doneDates.includes(d)).length;
  const habitsCount = habits.filter((h) => h.doneDates.includes(d)).length;

  // Subtasks across goals
  const allGoalSubTasks = useMemo(() => {
    return goals.flatMap((g) => g.subTasks.map((st) => ({ ...st, goalId: g.id, goalTitle: g.title })));
  }, [goals]);
  const goalSubTasksDoneCount = allGoalSubTasks.filter((st) => st.doneDates.includes(d)).length;

  const totalActionsToday = prayers.length + habits.length + allGoalSubTasks.length;
  const doneActionsToday = prayedCount + habitsCount + goalSubTasksDoneCount;
  const pct = totalActionsToday ? Math.round((doneActionsToday / totalActionsToday) * 100) : 0;

  const unreadNotifs = useMemo(
    () => appNotifications.filter((n) => !n.read).length,
    [appNotifications]
  );

  return (
    <div className="flex flex-col gap-5">
      {/* HEADER WITH FACEBOOK-STYLE NOTIFICATION BELL */}
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{t("hello")} 👋</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {profile?.name || (lang === "bn" ? "প্রিয় মুসলিম ভাই/বোন" : "Welcome")}
          </h1>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifPanel(!showNotifPanel)}
            className="relative grid size-10 place-items-center rounded-2xl bg-secondary/80 hover:bg-secondary text-foreground transition shadow-sm"
            title={t("notifications")}
          >
            <Bell className="size-5" />
            {unreadNotifs > 0 && (
              <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-pulse shadow">
                {unreadNotifs > 9 ? "9+" : unreadNotifs}
              </span>
            )}
          </button>

          {/* NOTIFICATION POPOVER (FB-STYLE) */}
          {showNotifPanel && (
            <div className="absolute right-0 top-12 z-50 w-80 sm:w-96 rounded-2xl glass p-4 shadow-2xl border border-border/60 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-3">
                <div className="flex items-center gap-1.5">
                  <Bell className="size-4 text-primary" />
                  <h3 className="text-sm font-bold">{t("notifications")}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {unreadNotifs > 0 && (
                    <button
                      onClick={markAllNotificationsRead}
                      className="text-[11px] text-primary hover:underline font-medium"
                    >
                      {lang === "bn" ? "সব পড়ুন" : "Mark all read"}
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotifPanel(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              <div className="no-scrollbar max-h-72 space-y-2 overflow-y-auto">
                {appNotifications.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {t("noNotifs")}
                  </p>
                ) : (
                  appNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => markNotificationRead(notif.id)}
                      className={cn(
                        "rounded-xl p-2.5 transition cursor-pointer text-xs",
                        notif.read ? "bg-muted/20 opacity-70" : "bg-primary/10 border border-primary/30"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">{notif.title}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{notif.createdAt}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                        {notif.body}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {appNotifications.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/30 text-center">
                  <button
                    onClick={clearNotifications}
                    className="text-[10px] text-muted-foreground hover:text-destructive transition"
                  >
                    {lang === "bn" ? "সকল নোটিফিকেশন মুছুন" : "Clear all notifications"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* TODAY'S OVERALL PROGRESS CARD */}
      <section className="glass flex items-center gap-5 p-5">
        <div className="relative grid size-24 place-items-center shrink-0">
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${pct * 0.974} 100`}
            />
          </svg>
          <span className="text-2xl font-black">{pct}%</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground font-medium">{t("todayProgress")}</p>
          <div className="mt-1.5 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-lg bg-secondary px-2.5 py-1">
              🕌 {prayedCount}/৫ {t("prayer")}
            </span>
            <span className="rounded-lg bg-secondary px-2.5 py-1">
              ✨ {habitsCount}/{habits.length} {t("habits")}
            </span>
            {allGoalSubTasks.length > 0 && (
              <span className="rounded-lg bg-secondary px-2.5 py-1">
                🎯 {goalSubTasksDoneCount}/{allGoalSubTasks.length} {t("goals")}
              </span>
            )}
          </div>
          {profile?.goal && (
            <p className="mt-2 text-xs text-primary font-medium truncate">
              🎯 {profile.goal}
            </p>
          )}
        </div>
      </section>

      {/* 1. 5 DAILY PRAYERS QUICK TRACKER */}
      <section className="glass p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-base">🕌</span>
            <h2 className="font-bold text-sm">{t("prayer")}</h2>
          </div>
          <Link to="/prayer" className="text-xs text-primary hover:underline flex items-center gap-0.5">
            {lang === "bn" ? "বিস্তারিত" : "Details"} <ChevronRight className="size-3" />
          </Link>
        </div>

        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {prayers.map((p) => {
            const ok = p.doneDates.includes(d);
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => markPrayer(p.key)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl py-3 px-1 text-xs transition select-none",
                  ok
                    ? "glow-on bg-primary text-primary-foreground font-bold"
                    : "bg-secondary/70 hover:bg-secondary text-foreground"
                )}
              >
                {ok ? <Check className="size-4 stroke-[3]" /> : <span className="size-4" />}
                <span className="truncate">{t(p.key)}</span>
                <span className="text-[10px] opacity-75 font-mono">
                  {formatAppTime(p.time, timeFormat, lang)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. GOALS & LINKED DAILY TASKS */}
      <section className="glass p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Target className="size-4 text-primary" />
            <h2 className="font-bold text-sm">{t("goals")} ({goals.length})</h2>
          </div>
          <Link to="/plan" className="text-xs text-primary hover:underline flex items-center gap-0.5">
            + {t("add")} <ChevronRight className="size-3" />
          </Link>
        </div>

        {goals.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            {lang === "bn" ? "কোনো লক্ষ্য যুক্ত করা হয়নি।" : "No goals created yet."}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {goals.map((g) => {
              const subTasksTodayDone = g.subTasks.filter((st) => st.doneDates.includes(d)).length;
              return (
                <div key={g.id} className="rounded-xl border border-primary/20 bg-secondary/30 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-xs text-foreground">{g.title}</h3>
                      {g.deadline && (
                        <span className="text-[10px] text-muted-foreground">
                          {lang === "bn" ? `টার্গেট: ${g.deadline}` : `Target: ${g.deadline}`}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-primary">
                      {subTasksTodayDone}/{g.subTasks.length} {lang === "bn" ? "আজকের টাস্ক" : "tasks today"}
                    </span>
                  </div>

                  {/* Daily action tasks under this goal */}
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    {g.subTasks.map((st) => {
                      const isDone = st.doneDates.includes(d);
                      return (
                        <div
                          key={st.id}
                          onClick={() => toggleGoalSubTask(g.id, st.id)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg p-2 text-xs transition cursor-pointer",
                            isDone ? "bg-success/10 text-success line-through" : "bg-card/40 hover:bg-card"
                          )}
                        >
                          <div
                            className={cn(
                              "grid size-5 shrink-0 place-items-center rounded-full border transition",
                              isDone ? "border-success bg-success text-success-foreground" : "border-muted-foreground/60"
                            )}
                          >
                            {isDone && <Check className="size-3.5" />}
                          </div>
                          <span className="truncate flex-1 font-medium">{st.title}</span>
                          {st.time && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {formatAppTime(st.time, timeFormat, lang)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. DAILY HABITS */}
      <section className="glass p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-primary" />
            <h2 className="font-bold text-sm">{t("habits")} ({habits.length})</h2>
          </div>
          <Link to="/plan" className="text-xs text-primary hover:underline flex items-center gap-0.5">
            + {t("add")} <ChevronRight className="size-3" />
          </Link>
        </div>

        {habits.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {habits.map((i) => {
              const ok = i.doneDates.includes(d);
              return (
                <li key={i.id} className="flex items-center gap-3 rounded-xl bg-secondary/50 p-2.5">
                  <button
                    type="button"
                    onClick={() => toggleItem(i.id)}
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border transition",
                      ok ? "glow-on border-transparent bg-primary text-primary-foreground" : "border-border/80"
                    )}
                  >
                    {ok && <Check className="size-3.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-xs font-medium truncate", ok && "text-muted-foreground line-through")}>
                      {i.title}
                    </p>
                    {i.time && (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {formatAppTime(i.time, timeFormat, lang)}
                      </p>
                    )}
                  </div>
                  <NotifyToggle
                    mode={i.notify}
                    hasTime={!!i.time.trim()}
                    onChange={(m) => {
                      setItemNotify(i.id, m);
                      if (m !== "off") requestPermission();
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 4. TODAY'S TO-DO LIST (ONE-TIME TASKS) */}
      <section className="glass p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ListTodo className="size-4 text-primary" />
            <h2 className="font-bold text-sm">{t("todoList")}</h2>
          </div>
          <Link to="/plan" className="text-xs text-primary hover:underline flex items-center gap-0.5">
            + {t("add")} <ChevronRight className="size-3" />
          </Link>
        </div>

        {todos.filter((td) => !td.completed).length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            {lang === "bn" ? "কোনো পেন্ডিং টু-ডু নেই।" : "No pending to-do items."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {todos
              .filter((td) => !td.completed)
              .map((td) => (
                <div
                  key={td.id}
                  onClick={() => toggleTodo(td.id)}
                  className="flex items-center gap-3 rounded-xl bg-secondary/50 p-2.5 transition cursor-pointer"
                >
                  <div className="grid size-6 shrink-0 place-items-center rounded-full border border-muted-foreground/60">
                    {td.completed && <Check className="size-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{td.title}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      {td.dueDate && <span>📅 {td.dueDate}</span>}
                      {td.time && <span>⏰ {formatAppTime(td.time, timeFormat, lang)}</span>}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
