import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Trash2,
  Plus,
  CheckCircle2,
  Calendar,
  Clock,
  Target,
  ListTodo,
  Sparkles,
  ChevronRight,
  Flame,
} from "lucide-react";
import {
  useApp,
  today,
  formatAppTime,
  type ItemKind,
  type Goal,
  type TodoItem,
} from "@/lib/store";
import { useT } from "@/lib/i18n";
import { NotifyToggle } from "@/components/NotifyToggle";
import { requestPermission } from "@/lib/notify";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "Plan & Goals — Noor Habit" },
      { name: "description", content: "Set daily habits, actionable goals, and to-do lists." },
      { property: "og:title", content: "Plan & Goals — Noor Habit" },
      { property: "og:description", content: "Set daily habits, actionable goals, and to-do lists." },
    ],
  }),
  component: Plan,
});

type TabKey = "habit" | "goal" | "todo";

function Plan() {
  const t = useT();
  const {
    items,
    addItem,
    removeItem,
    setItemNotify,
    setItemTime,
    goals,
    addGoal,
    removeGoal,
    addGoalSubTask,
    removeGoalSubTask,
    toggleGoalSubTask,
    todos,
    addTodo,
    toggleTodo,
    removeTodo,
    setTodoNotify,
    timeFormat,
    lang,
  } = useApp();

  const [activeTab, setActiveTab] = useState<TabKey>("habit");
  const todayStr = today();

  // Habit Form State
  const [habitTitle, setHabitTitle] = useState("");
  const [habitTime, setHabitTime] = useState("");

  // Goal Form State
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDeadline, setGoalDeadline] = useState("");
  const [initialGoalTask, setInitialGoalTask] = useState("");

  // To-Do Form State
  const [todoTitle, setTodoTitle] = useState("");
  const [todoDate, setTodoDate] = useState(todayStr);
  const [todoTime, setTodoTime] = useState("");

  // Subtask inputs keyed by goalId
  const [subTaskInputs, setSubTaskInputs] = useState<Record<string, { title: string; time: string }>>({});

  const handleAddHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!habitTitle.trim()) return;
    addItem("habit", habitTitle.trim(), habitTime);
    if (habitTime) requestPermission();
    setHabitTitle("");
    setHabitTime("");
  };

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) return;
    addGoal(goalTitle.trim(), goalDeadline.trim(), initialGoalTask.trim());
    setGoalTitle("");
    setGoalDeadline("");
    setInitialGoalTask("");
  };

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!todoTitle.trim()) return;
    addTodo(todoTitle.trim(), todoDate, todoTime);
    if (todoTime) requestPermission();
    setTodoTitle("");
    setTodoTime("");
  };

  const handleAddSubTask = (goalId: string) => {
    const data = subTaskInputs[goalId];
    if (!data || !data.title.trim()) return;
    addGoalSubTask(goalId, data.title.trim(), data.time.trim());
    if (data.time) requestPermission();
    setSubTaskInputs((prev) => ({ ...prev, [goalId]: { title: "", time: "" } }));
  };

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-3xl font-bold">{t("plan")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {lang === "bn"
            ? "দৈনিক অভ্যাস, লক্ষ্য ও সাব-টাস্ক এবং ওয়ান-টাইম টু-ডু লিস্ট পরিচালনা করুন"
            : "Manage daily habits, targeted goals with action tasks, and to-do lists"}
        </p>
      </header>

      {/* TABS */}
      <div className="glass flex p-1.5">
        <button
          onClick={() => setActiveTab("habit")}
          className={cn(
            "flex-1 rounded-xl py-2.5 text-xs font-semibold transition flex items-center justify-center gap-1.5",
            activeTab === "habit" ? "glow-on bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Sparkles className="size-3.5" />
          {t("habits")} ({items.filter((i) => i.kind === "habit").length})
        </button>

        <button
          onClick={() => setActiveTab("goal")}
          className={cn(
            "flex-1 rounded-xl py-2.5 text-xs font-semibold transition flex items-center justify-center gap-1.5",
            activeTab === "goal" ? "glow-on bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Target className="size-3.5" />
          {t("goals")} ({goals.length})
        </button>

        <button
          onClick={() => setActiveTab("todo")}
          className={cn(
            "flex-1 rounded-xl py-2.5 text-xs font-semibold transition flex items-center justify-center gap-1.5",
            activeTab === "todo" ? "glow-on bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ListTodo className="size-3.5" />
          {t("todoList")} ({todos.filter((td) => !td.completed).length})
        </button>
      </div>

      {/* 1. HABITS SECTION */}
      {activeTab === "habit" && (
        <section className="flex flex-col gap-4">
          <form onSubmit={handleAddHabit} className="glass flex flex-col gap-3 p-4">
            <h2 className="text-sm font-bold flex items-center gap-1.5">
              <Plus className="size-4 text-primary" />
              {lang === "bn" ? "নতুন দৈনিক অভ্যাস যোগ করুন" : "Add New Daily Habit"}
            </h2>
            <input
              className="input"
              placeholder={lang === "bn" ? "অভ্যাসের নাম (যেমন: প্রতিদিন ৩০ মিনিট বই পড়া)" : "Habit title (e.g. Read Quran 30 mins)"}
              value={habitTitle}
              onChange={(e) => setHabitTitle(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="time"
                  className="input flex-1 font-mono text-xs"
                  value={habitTime}
                  onChange={(e) => setHabitTime(e.target.value)}
                />
                {habitTime && (
                  <span className="text-xs text-primary font-medium shrink-0">
                    {formatAppTime(habitTime, timeFormat, lang)}
                  </span>
                )}
              </div>
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90 transition text-xs"
              >
                {t("add")}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {lang === "bn"
                ? "💡 সময় নির্ধারণ করলে নির্দিষ্ট সময়ে রিমাইন্ডার নোটিফিকেশন পেতে পারবেন।"
                : "💡 Setting a time enables reminder notifications at the exact scheduled minute."}
            </p>
          </form>

          <div className="flex flex-col gap-2">
            {items.filter((i) => i.kind === "habit").length === 0 ? (
              <div className="glass p-8 text-center text-xs text-muted-foreground">
                <Sparkles className="mx-auto mb-2 size-6 opacity-40" />
                {t("empty")}
              </div>
            ) : (
              items.filter((i) => i.kind === "habit").map((i) => (
                <div key={i.id} className="glass flex items-center justify-between gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{i.title}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="time"
                        value={i.time}
                        onChange={(e) => setItemTime(i.id, e.target.value)}
                        className="bg-transparent text-xs text-muted-foreground font-mono"
                      />
                      {i.time && (
                        <span className="text-[11px] text-primary">
                          • {formatAppTime(i.time, timeFormat, lang)}
                        </span>
                      )}
                    </div>
                  </div>
                  <NotifyToggle
                    mode={i.notify}
                    hasTime={!!i.time.trim()}
                    onChange={(m) => {
                      setItemNotify(i.id, m);
                      if (m !== "off") requestPermission();
                    }}
                  />
                  <button
                    onClick={() => removeItem(i.id)}
                    aria-label="delete"
                    className="text-muted-foreground hover:text-destructive p-1 rounded transition"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* 2. GOALS WITH ACTIONABLE DAILY TASKS */}
      {activeTab === "goal" && (
        <section className="flex flex-col gap-4">
          <form onSubmit={handleAddGoal} className="glass flex flex-col gap-3 p-4">
            <h2 className="text-sm font-bold flex items-center gap-1.5">
              <Target className="size-4 text-primary" />
              {lang === "bn" ? "নতুন লক্ষ্য (Goal) নির্ধারণ করুন" : "Set New Goal"}
            </h2>
            <input
              className="input"
              placeholder={lang === "bn" ? "লক্ষ্যের শিরোনাম (যেমন: ১ সপ্তাহে ক্লায়েন্ট ক্লোজ করা / ১ কেজি ওজন বাড়ানো)" : "Goal title (e.g. Close client in 1 week)"}
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                className="input text-xs"
                placeholder={lang === "bn" ? "মেয়াদ/টার্গেট (যেমন: ১ সপ্তাহ, বা ২০২৬-১০-২৭)" : "Deadline (e.g. 1 week, or Oct 27)"}
                value={goalDeadline}
                onChange={(e) => setGoalDeadline(e.target.value)}
              />
              <input
                className="input text-xs"
                placeholder={lang === "bn" ? "প্রথম দৈনিক টাস্ক (যেমন: ১৫টি LinkedIn outreach)" : "First daily task (e.g. 15 LinkedIn outreach)"}
                value={initialGoalTask}
                onChange={(e) => setInitialGoalTask(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="self-end rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90 transition text-xs"
            >
              {lang === "bn" ? "লক্ষ্য যুক্ত করুন" : "Create Goal"}
            </button>
          </form>

          {/* GOALS LIST */}
          <div className="flex flex-col gap-4">
            {goals.length === 0 ? (
              <div className="glass p-8 text-center text-xs text-muted-foreground">
                <Target className="mx-auto mb-2 size-6 opacity-40" />
                {lang === "bn" ? "এখনো কোনো লক্ষ্য নির্ধারণ করেননি।" : "No goals set yet."}
              </div>
            ) : (
              goals.map((g) => {
                const totalSub = g.subTasks.length;
                const completedToday = g.subTasks.filter((st) => st.doneDates.includes(todayStr)).length;
                const pct = totalSub ? Math.round((completedToday / totalSub) * 100) : 0;
                const curSubInput = subTaskInputs[g.id] || { title: "", time: "" };

                return (
                  <div key={g.id} className="glass flex flex-col gap-3 p-4 border border-primary/20">
                    <div className="flex items-start justify-between gap-2 border-b border-border/30 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Target className="size-4 text-primary shrink-0" />
                          <h3 className="font-bold text-base text-foreground">{g.title}</h3>
                        </div>
                        {g.deadline && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground font-medium">
                            <Clock className="size-3" />
                            {lang === "bn" ? `টার্গেট: ${g.deadline}` : `Target: ${g.deadline}`}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => removeGoal(g.id)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded transition"
                        title={lang === "bn" ? "লক্ষ্য মুছে ফেলুন" : "Delete goal"}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {/* DAILY ACTION PROGRESS */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">
                        {lang === "bn"
                          ? `আজকের লক্ষ্য পূরণ: ${completedToday}/${totalSub} টাস্ক সম্পন্ন`
                          : `Today's Progress: ${completedToday}/${totalSub} tasks completed`}
                      </span>
                      <span className="font-bold text-primary">{pct}%</span>
                    </div>

                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* LINKED DAILY SUB-TASKS */}
                    <div className="flex flex-col gap-2 mt-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {lang === "bn" ? "দৈনিক করণীয় টাস্কসমূহ (Daily Action Tasks)" : "Daily Action Tasks"}
                      </span>

                      {g.subTasks.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-1">
                          {lang === "bn"
                            ? "এই লক্ষ্যের অধীনে কোনো দৈনিক টাস্ক যোগ করা হয়নি।"
                            : "No daily tasks added under this goal yet."}
                        </p>
                      ) : (
                        g.subTasks.map((st) => {
                          const isDone = st.doneDates.includes(todayStr);
                          return (
                            <div
                              key={st.id}
                              className={cn(
                                "flex items-center justify-between gap-2 rounded-xl p-2.5 transition",
                                isDone ? "bg-success/10 border border-success/30" : "bg-secondary/40 border border-transparent"
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() => toggleGoalSubTask(g.id, st.id)}
                                  className={cn(
                                    "grid size-6 shrink-0 place-items-center rounded-full border transition",
                                    isDone ? "border-success bg-success text-success-foreground" : "border-muted-foreground/60"
                                  )}
                                >
                                  {isDone && <CheckCircle2 className="size-4" />}
                                </button>
                                <div className="min-w-0">
                                  <p className={cn("text-xs font-medium truncate", isDone && "line-through text-muted-foreground")}>
                                    {st.title}
                                  </p>
                                  {st.time && (
                                    <span className="text-[10px] text-primary">
                                      ⏰ {formatAppTime(st.time, timeFormat, lang)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <button
                                onClick={() => removeGoalSubTask(g.id, st.id)}
                                className="text-muted-foreground hover:text-destructive p-1 rounded transition shrink-0"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          );
                        })
                      )}

                      {/* ADD SUB-TASK INLINE FORM */}
                      <div className="mt-2 flex flex-col sm:flex-row gap-2">
                        <input
                          className="input text-xs flex-1"
                          placeholder={lang === "bn" ? "নতুন দৈনিক টাস্ক (যেমন: ১৫টি LinkedIn outreach)" : "Add daily task (e.g. 15 LinkedIn outreach)"}
                          value={curSubInput.title}
                          onChange={(e) =>
                            setSubTaskInputs((prev) => ({
                              ...prev,
                              [g.id]: { ...curSubInput, title: e.target.value },
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddSubTask(g.id);
                            }
                          }}
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            className="input text-xs font-mono w-28"
                            value={curSubInput.time}
                            onChange={(e) =>
                              setSubTaskInputs((prev) => ({
                                ...prev,
                                [g.id]: { ...curSubInput, time: e.target.value },
                              }))
                            }
                          />
                          <button
                            type="button"
                            onClick={() => handleAddSubTask(g.id)}
                            className="rounded-xl bg-primary/20 hover:bg-primary/30 text-primary font-semibold px-3 py-2 text-xs transition shrink-0"
                          >
                            + {t("add")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* 3. TO-DO LIST (ONE-TIME TASKS) */}
      {activeTab === "todo" && (
        <section className="flex flex-col gap-4">
          <form onSubmit={handleAddTodo} className="glass flex flex-col gap-3 p-4">
            <h2 className="text-sm font-bold flex items-center gap-1.5">
              <ListTodo className="size-4 text-primary" />
              {lang === "bn" ? "নতুন টু-ডু আইটেম যোগ করুন (এককালীন টাস্ক)" : "Add New To-Do Item (One-time Task)"}
            </h2>
            <input
              className="input"
              placeholder={lang === "bn" ? "যেমন: আজকে বন্ধুর সাথে পারিবারিক দাওয়াত" : "e.g. Family dinner invitation tonight"}
              value={todoTitle}
              onChange={(e) => setTodoTitle(e.target.value)}
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="date"
                  className="input flex-1 text-xs"
                  value={todoDate}
                  onChange={(e) => setTodoDate(e.target.value)}
                />
                <input
                  type="time"
                  className="input w-32 text-xs font-mono"
                  value={todoTime}
                  onChange={(e) => setTodoTime(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90 transition text-xs shrink-0"
              >
                {t("add")}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {lang === "bn"
                ? "💡 টু-ডু লিস্টের কাজ একবার সম্পন্ন করলেই শেষ। এটি প্রতিদিনের অভ্যাসের মতো পুনরায় রিসেট হবে না।"
                : "💡 To-Do items are one-time tasks. Once marked complete, they stay done and do not reset daily."}
            </p>
          </form>

          {/* ACTIVE & COMPLETED TODOS */}
          <div className="flex flex-col gap-2">
            {todos.length === 0 ? (
              <div className="glass p-8 text-center text-xs text-muted-foreground">
                <ListTodo className="mx-auto mb-2 size-6 opacity-40" />
                {lang === "bn" ? "কোনো টু-ডু আইটেম নেই।" : "No to-do items yet."}
              </div>
            ) : (
              todos.map((td) => (
                <div
                  key={td.id}
                  className={cn(
                    "glass flex items-center justify-between gap-3 p-3.5 transition",
                    td.completed && "opacity-60 bg-muted/20"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => toggleTodo(td.id)}
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full border transition",
                        td.completed ? "border-success bg-success text-success-foreground" : "border-muted-foreground/60 hover:border-foreground"
                      )}
                    >
                      {td.completed && <CheckCircle2 className="size-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium truncate", td.completed && "line-through text-muted-foreground")}>
                        {td.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                        {td.dueDate && <span>📅 {td.dueDate}</span>}
                        {td.time && (
                          <span className="text-primary font-medium">
                            ⏰ {formatAppTime(td.time, timeFormat, lang)}
                          </span>
                        )}
                        {td.completed && <span className="text-success font-semibold">• সম্পন্ন</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <NotifyToggle
                      mode={td.notify}
                      hasTime={!!td.time?.trim()}
                      onChange={(m) => {
                        setTodoNotify(td.id, m);
                        if (m !== "off") requestPermission();
                      }}
                    />
                    <button
                      onClick={() => removeTodo(td.id)}
                      className="text-muted-foreground hover:text-destructive p-1 rounded transition"
                      title="মুছে ফেলুন"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
