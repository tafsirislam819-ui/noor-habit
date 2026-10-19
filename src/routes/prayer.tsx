import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useApp, today } from "@/lib/store";
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
  const { prayers, setPrayer, markPrayer } = useApp();
  const d = today();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">{t("prayer")}</h1>
      <p className="text-sm text-muted-foreground">🔔 {t("normal")}: {t("normalDesc")} · 🚨 {t("aggressive")}: {t("aggrDesc")}</p>
      {prayers.map((p) => {
        const ok = p.doneDates.includes(d);
        return (
          <div key={p.key} className="glass flex items-center gap-3 p-4">
            <button onClick={() => markPrayer(p.key)} className={cn("grid size-10 place-items-center rounded-full border", ok && "glow-on border-transparent")}>
              {ok && <Check className="size-5" />}
            </button>
            <div className="flex-1">
              <p className="text-lg font-semibold">{t(p.key)}</p>
              <input type="time" value={p.time} onChange={(e) => setPrayer(p.key, { time: e.target.value })} className="bg-transparent text-sm text-muted-foreground" />
            </div>
            <NotifyToggle mode={p.notify} onChange={(m) => { setPrayer(p.key, { notify: m }); if (m !== "off") requestPermission(); }} />
          </div>
        );
      })}
    </div>
  );
}
