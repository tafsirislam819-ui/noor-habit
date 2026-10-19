import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useApp, THEMES, type Profile } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { NotifyToggle } from "@/components/NotifyToggle";
import { Field } from "@/components/AppShell";
import { requestPermission } from "@/lib/notify";
import { APP_VERSION, checkForUpdate, openUpdate, type UpdateInfo } from "@/lib/update";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Noor Habit" },
      { name: "description", content: "Notifications, themes, language and updates." },
      { property: "og:title", content: "Settings — Noor Habit" },
      { property: "og:description", content: "Notifications, themes, language and updates." },
    ],
  }),
  component: SettingsPage,
});

const SWATCH: Record<string, string> = {
  midnight: "oklch(0.62 0.2 280)", aurora: "oklch(0.75 0.14 185)", ember: "oklch(0.72 0.19 50)",
  rose: "oklch(0.7 0.19 0)", emerald: "oklch(0.74 0.16 160)", light: "oklch(0.95 0.02 270)",
};

function SettingsPage() {
  const t = useT();
  const s = useApp();
  const [p, setP] = useState<Profile>(s.profile ?? { name: "", birth: "", goal: "" });
  const [upd, setUpd] = useState<UpdateInfo | null | "none" | "err">(null);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">{t("settings")}</h1>

      <section className="glass flex flex-col gap-3 p-4">
        <h2 className="font-semibold">{t("prayerNotif")}</h2>
        {s.prayers.map((pr) => (
          <div key={pr.key} className="flex items-center gap-3">
            <span className="w-20">{t(pr.key)}</span>
            <input type="time" value={pr.time} onChange={(e) => s.setPrayer(pr.key, { time: e.target.value })} className="input flex-1 py-2" />
            <NotifyToggle mode={pr.notify} onChange={(m) => { s.setPrayer(pr.key, { notify: m }); if (m !== "off") requestPermission(); }} />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">🔔 {t("normalDesc")} · 🚨 {t("aggrDesc")}</p>
      </section>

      <section className="glass flex flex-col gap-3 p-4">
        <h2 className="font-semibold">{t("itemNotif")}</h2>
        {s.items.filter((i) => i.time).length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {s.items.filter((i) => i.time).map((i) => (
          <div key={i.id} className="flex items-center gap-3">
            <span className="flex-1 truncate">{i.title} <span className="text-xs text-muted-foreground">{i.time}</span></span>
            <NotifyToggle mode={i.notify} onChange={(m) => s.setItemNotify(i.id, m)} />
          </div>
        ))}
      </section>

      <section className="glass p-4">
        <h2 className="mb-3 font-semibold">{t("theme")}</h2>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((th) => (
            <button key={th} onClick={() => s.setTheme(th)} className={cn("flex items-center gap-2 rounded-xl bg-secondary p-3 text-sm capitalize", s.theme === th && "ring-2 ring-ring")}>
              <span className="size-4 rounded-full" style={{ background: SWATCH[th] }} />
              {th}
            </button>
          ))}
        </div>
      </section>

      <section className="glass p-4">
        <h2 className="mb-3 font-semibold">{t("language")}</h2>
        <div className="flex gap-2">
          {(["bn", "en"] as const).map((l) => (
            <button key={l} onClick={() => s.setLang(l)} className={cn("flex-1 rounded-xl py-2", s.lang === l ? "glow-on" : "bg-secondary")}>
              {l === "bn" ? "বাংলা" : "English"}
            </button>
          ))}
        </div>
      </section>

      <form className="glass flex flex-col gap-3 p-4" onSubmit={(e) => { e.preventDefault(); if (p.name.trim()) s.setProfile(p); }}>
        <h2 className="font-semibold">{t("profile")}</h2>
        <Field label={t("name")}><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
        <Field label={t("birth")}><input type="date" className="input" value={p.birth} onChange={(e) => setP({ ...p, birth: e.target.value })} /></Field>
        <Field label={t("mainGoal")}><input className="input" value={p.goal} onChange={(e) => setP({ ...p, goal: e.target.value })} /></Field>
        <button className="rounded-xl bg-primary py-2.5 font-semibold text-primary-foreground">{t("save")}</button>
      </form>

      <section className="glass flex flex-col gap-2 p-4">
        <p className="text-sm text-muted-foreground">v{APP_VERSION}</p>
        <button
          onClick={async () => { try { setUpd((await checkForUpdate()) ?? "none"); } catch { setUpd("err"); } }}
          className="rounded-xl bg-secondary py-2.5"
        >
          {t("checkUpdate")}
        </button>
        {upd === "none" && <p className="text-sm text-success">{t("upToDate")}</p>}
        {upd === "err" && <p className="text-sm text-destructive">{t("offlineAi")}</p>}
        {upd && typeof upd === "object" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm">{t("updateAvail")}: v{upd.version}</p>
            <button onClick={() => openUpdate(upd)} className="rounded-xl bg-primary py-2.5 font-semibold text-primary-foreground">{t("download")}</button>
          </div>
        )}
      </section>
    </div>
  );
}
