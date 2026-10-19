import { createFileRoute } from "@tanstack/react-router";
import { Smartphone, Flame } from "lucide-react";
import { useApp, today } from "@/lib/store";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Noor Habit" },
      { name: "description", content: "Your real prayer and habit stats." },
      { property: "og:title", content: "Analytics — Noor Habit" },
      { property: "og:description", content: "Your real prayer and habit stats." },
    ],
  }),
  component: Analytics,
});

function lastDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return today(d);
  });
}

function Analytics() {
  const t = useT();
  const { prayers, items } = useApp();
  const days = lastDays(7);
  const perDay = days.map((d) => ({
    d,
    p: prayers.filter((x) => x.doneDates.includes(d)).length,
    h: items.filter((x) => x.doneDates.includes(d)).length,
  }));
  const prayerPct = Math.round((perDay.reduce((a, b) => a + b.p, 0) / 35) * 100);
  const habits = items.filter((i) => i.kind === "habit");
  const habitPct = habits.length
    ? Math.round((habits.reduce((a, h) => a + days.filter((d) => h.doneDates.includes(d)).length, 0) / (habits.length * 7)) * 100)
    : 0;

  // Fixed streak calculation:
  // Check if today is completed
  const todayStr = today();
  const todayComplete = prayers.every((p) => p.doneDates.includes(todayStr));
  let streak = todayComplete ? 1 : 0;

  // Check backwards starting from yesterday
  for (let i = 1; i <= 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayKey = today(d);
    if (prayers.every((p) => p.doneDates.includes(dayKey))) {
      streak++;
    } else {
      break;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">{t("analytics")}</h1>
      <div className="grid grid-cols-3 gap-3">
        <Stat v={`${prayerPct}%`} l={t("prayerRate")} />
        <Stat v={`${habitPct}%`} l={t("habitRate")} />
        <Stat v={`${streak}`} l={t("streak")} icon={<Flame className="inline size-4 text-warning" />} />
      </div>
      <section className="glass p-4">
        <h2 className="mb-4 font-semibold">{t("last7")}</h2>
        <div className="flex h-40 items-end gap-2">
          {perDay.map((x) => (
            <div key={x.d} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-32 w-full items-end gap-0.5">
                <div className="flex-1 rounded-t-md bg-primary transition-all duration-500" style={{ height: `${(x.p / 5) * 100}%` }} />
                <div className="flex-1 rounded-t-md bg-success/70 transition-all duration-500" style={{ height: `${items.length ? (x.h / items.length) * 100 : 0}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground">{x.d.slice(8)}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">■ <span className="text-primary">{t("prayer")}</span> · ■ <span className="text-success">{t("habits")}/{t("tasks")}</span></p>
      </section>
      <section className="glass flex gap-3 p-4">
        <Smartphone className="size-6 shrink-0 text-primary" />
        <div>
          <h2 className="font-semibold">{t("screenTime")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("screenTimeNote")}</p>
        </div>
      </section>
    </div>
  );
}

function Stat({ v, l, icon }: { v: string; l: string; icon?: React.ReactNode }) {
  return (
    <div className="glass p-3">
      <p className="flex items-center gap-1 text-2xl font-bold text-primary">
        {icon}
        {v}
      </p>
      <p className="text-xs text-muted-foreground">{l}</p>
    </div>
  );
}
