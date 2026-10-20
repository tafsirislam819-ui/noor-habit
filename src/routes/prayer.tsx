import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useApp, today, formatAppTime } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { NotifyToggle } from "@/components/NotifyToggle";
import { requestPermission } from "@/lib/notify";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/prayer")({
  head: () => ({
    meta: [
      { title: "Prayer — Noor Habit" },
      { name: "description", content: "Set namaz times and normal or alarm-style reminders." },
      { property: "og:title", content: "Prayer — Noor Habit" },
      { property: "og:description", content: "Set namaz times and normal or alarm-style reminders." },
    ],
  }),
  component: PrayerPage,
});

function PrayerPage() {
  const t = useT();
  const { prayers, setPrayer, markPrayer, timeFormat, lang } = useApp();
  const d = today();

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-3xl font-bold">{t("prayer")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          🔔 {t("normal")}: {t("normalDesc")} · 🚨 {t("aggressive")}: {t("aggrDesc")}
        </p>
      </header>

      <div className="flex flex-col gap-2.5">
        {prayers.map((p) => {
          const ok = p.doneDates.includes(d);
          return (
            <div key={p.key} className="glass flex items-center gap-3 p-4">
              <button
                onClick={() => markPrayer(p.key)}
                className={cn(
                  "grid size-11 place-items-center rounded-full border transition",
                  ok ? "glow-on border-transparent bg-primary text-primary-foreground" : "border-border/60 hover:bg-secondary"
                )}
                title={ok ? (lang === "bn" ? "আদায় হয়েছে" : "Completed") : (lang === "bn" ? "আদায় হিসেবে চিহ্নিত করুন" : "Mark as prayed")}
              >
                {ok ? <Check className="size-5" /> : <span className="size-4" />}
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold">{t(p.key)}</p>
                  <span className="text-xs text-primary font-medium">
                    {formatAppTime(p.time, timeFormat, lang)}
                  </span>
                </div>
                <input
                  type="time"
                  value={p.time}
                  onChange={(e) => setPrayer(p.key, { time: e.target.value })}
                  className="bg-transparent text-xs text-muted-foreground font-mono mt-0.5"
                />
              </div>
              <NotifyToggle
                mode={p.notify}
                hasTime={!!p.time.trim()}
                onChange={(m) => {
                  setPrayer(p.key, { notify: m });
                  if (m !== "off") requestPermission();
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
