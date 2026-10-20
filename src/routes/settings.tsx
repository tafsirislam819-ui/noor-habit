import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Volume2, Clock, Check, Bell, Sparkles } from "lucide-react";
import {
  useApp,
  THEMES,
  formatAppTime,
  type Profile,
  type TimeFormat,
  type RemindTone,
  type AggressiveTone,
} from "@/lib/store";
import { useT } from "@/lib/i18n";
import { NotifyToggle } from "@/components/NotifyToggle";
import { Field } from "@/components/AppShell";
import { requestPermission, playTone } from "@/lib/notify";
import { APP_VERSION, checkForUpdate, openUpdate, type UpdateInfo } from "@/lib/update";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Noor Habit" },
      { name: "description", content: "Notifications, themes, language, time format and updates." },
      { property: "og:title", content: "Settings — Noor Habit" },
      { property: "og:description", content: "Notifications, themes, language, time format and updates." },
    ],
  }),
  component: SettingsPage,
});

const SWATCH: Record<string, string> = {
  midnight: "oklch(0.62 0.2 280)",
  aurora: "oklch(0.75 0.14 185)",
  ember: "oklch(0.72 0.19 50)",
  rose: "oklch(0.7 0.19 0)",
  emerald: "oklch(0.74 0.16 160)",
  light: "oklch(0.95 0.02 270)",
};

function SettingsPage() {
  const t = useT();
  const s = useApp();
  const [p, setP] = useState<Profile>(s.profile ?? { name: "", birth: "", goal: "" });
  const [upd, setUpd] = useState<UpdateInfo | null | "none" | "err">(null);
  const [savedBanner, setSavedBanner] = useState(false);

  const remindToneOptions: { id: RemindTone; labelBn: string; labelEn: string }[] = [
    { id: "gentle_bell", labelBn: "শান্ত ঘণ্টার ধ্বনি (Gentle Bell)", labelEn: "Gentle Bell" },
    { id: "soft_chime", labelBn: "মধুর ঝংকার (Soft Chime)", labelEn: "Soft Chime" },
    { id: "mellow_beep", labelBn: "মৃদু বিপ (Mellow Beep)", labelEn: "Mellow Beep" },
  ];

  const aggressiveToneOptions: { id: AggressiveTone; labelBn: string; labelEn: string }[] = [
    { id: "pulse_radar", labelBn: "পালস রাডার (Pulse Radar)", labelEn: "Pulse Radar" },
    { id: "continuous_alarm", labelBn: "সাইরেন অ্যালার্ম (Continuous Siren)", labelEn: "Continuous Siren" },
    { id: "urgent_ping", labelBn: "জরুরি সংকেত (Urgent Ping)", labelEn: "Urgent Ping" },
  ];

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (p.name.trim()) {
      s.setProfile(p);
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 2500);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-3xl font-bold">{t("settings")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {s.lang === "bn"
            ? "সময় ফরম্যাট, নোটিফিকেশন টোন, থিম ও ভাষা পছন্দমতো সাজান"
            : "Customize time format, notification tones, themes and language"}
        </p>
      </header>

      {/* 1. TIME FORMAT (12-HOUR vs 24-HOUR) */}
      <section className="glass p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="size-4 text-primary" />
          <h2 className="font-semibold text-base">{t("timeFormat")}</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {s.lang === "bn"
            ? "অ্যাপের প্রতিটি পৃষ্ঠায় নামাজের সময় ও রিমাইন্ডার এই ফরম্যাটে প্রদর্শিত হবে।"
            : "Prayer times and reminders across the app will follow this format."}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => s.setTimeFormat("12h")}
            className={cn(
              "flex flex-col items-center justify-center rounded-xl p-3.5 border transition",
              s.timeFormat === "12h"
                ? "border-primary glow-on bg-primary/10 text-primary font-bold"
                : "border-border/60 bg-secondary/60 hover:bg-secondary"
            )}
          >
            <span className="text-sm font-semibold">12-Hour (AM/PM)</span>
            <span className="text-xs text-muted-foreground mt-1">
              {s.lang === "bn" ? "যেমন: ৫:৩০ PM" : "e.g. 5:30 PM"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => s.setTimeFormat("24h")}
            className={cn(
              "flex flex-col items-center justify-center rounded-xl p-3.5 border transition",
              s.timeFormat === "24h"
                ? "border-primary glow-on bg-primary/10 text-primary font-bold"
                : "border-border/60 bg-secondary/60 hover:bg-secondary"
            )}
          >
            <span className="text-sm font-semibold">24-Hour</span>
            <span className="text-xs text-muted-foreground mt-1">
              {s.lang === "bn" ? "যেমন: ১৭:৩০" : "e.g. 17:30"}
            </span>
          </button>
        </div>
      </section>

      {/* 2. TONE SETTINGS (REMIND TONE & AGGRESSIVE TONE) */}
      <section className="glass p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Volume2 className="size-4 text-primary" />
          <h2 className="font-semibold text-base">{t("toneSettings")}</h2>
        </div>

        {/* Remind Tone */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t("remindTone")}
          </label>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {remindToneOptions.map((opt) => {
              const active = s.remindTone === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => s.setRemindTone(opt.id)}
                  className={cn(
                    "flex items-center justify-between rounded-xl p-3 cursor-pointer border transition",
                    active
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/40 bg-secondary/40 hover:bg-secondary"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        "grid size-4 place-items-center rounded-full border",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"
                      )}
                    >
                      {active && <Check className="size-3" />}
                    </div>
                    <span className="text-sm font-medium">
                      {s.lang === "bn" ? opt.labelBn : opt.labelEn}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playTone(opt.id);
                    }}
                    className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition"
                    title={s.lang === "bn" ? "শব্দ শুনুন" : "Play preview"}
                  >
                    <Volume2 className="size-3.5" />
                    <span>{s.lang === "bn" ? "টেস্ট করুন" : "Play"}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Aggressive Alert Tone */}
        <div className="pt-2 border-t border-border/30">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t("aggressiveTone")}
          </label>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {aggressiveToneOptions.map((opt) => {
              const active = s.aggressiveTone === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => s.setAggressiveTone(opt.id)}
                  className={cn(
                    "flex items-center justify-between rounded-xl p-3 cursor-pointer border transition",
                    active
                      ? "border-warning/60 bg-warning/10"
                      : "border-border/40 bg-secondary/40 hover:bg-secondary"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        "grid size-4 place-items-center rounded-full border",
                        active ? "border-warning bg-warning text-warning-foreground" : "border-muted-foreground"
                      )}
                    >
                      {active && <Check className="size-3" />}
                    </div>
                    <span className="text-sm font-medium">
                      {s.lang === "bn" ? opt.labelBn : opt.labelEn}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playTone(opt.id);
                    }}
                    className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition"
                    title={s.lang === "bn" ? "শব্দ শুনুন" : "Play preview"}
                  >
                    <Volume2 className="size-3.5" />
                    <span>{s.lang === "bn" ? "টেস্ট করুন" : "Play"}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. PRAYER NOTIFICATIONS */}
      <section className="glass flex flex-col gap-3 p-5">
        <h2 className="font-semibold text-base">{t("prayerNotif")}</h2>
        <div className="flex flex-col gap-2">
          {s.prayers.map((pr) => (
            <div key={pr.key} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 p-2.5">
              <span className="w-24 font-medium text-sm">{t(pr.key)}</span>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={pr.time}
                  onChange={(e) => s.setPrayer(pr.key, { time: e.target.value })}
                  className="input py-1 px-2.5 text-xs font-mono"
                />
                <span className="text-[11px] text-muted-foreground w-16 text-right">
                  {formatAppTime(pr.time, s.timeFormat, s.lang)}
                </span>
              </div>
              <NotifyToggle
                mode={pr.notify}
                hasTime={!!pr.time.trim()}
                onChange={(m) => {
                  s.setPrayer(pr.key, { notify: m });
                  if (m !== "off") requestPermission();
                }}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          🔔 {t("normalDesc")} · 🚨 {t("aggrDesc")}
        </p>
      </section>

      {/* 4. THEME */}
      <section className="glass p-5">
        <h2 className="mb-3 font-semibold text-base">{t("theme")}</h2>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((th) => (
            <button
              key={th}
              onClick={() => s.setTheme(th)}
              className={cn(
                "flex items-center gap-2 rounded-xl bg-secondary p-3 text-sm capitalize transition",
                s.theme === th && "ring-2 ring-primary glow-on"
              )}
            >
              <span className="size-4 rounded-full shadow-sm" style={{ background: SWATCH[th] }} />
              {th}
            </button>
          ))}
        </div>
      </section>

      {/* 5. LANGUAGE */}
      <section className="glass p-5">
        <h2 className="mb-3 font-semibold text-base">{t("language")}</h2>
        <div className="flex gap-2">
          {(["bn", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => s.setLang(l)}
              className={cn(
                "flex-1 rounded-xl py-3 font-medium transition",
                s.lang === l ? "glow-on bg-primary text-primary-foreground font-bold" : "bg-secondary"
              )}
            >
              {l === "bn" ? "বাংলা (Smart Bangla)" : "English (100%)"}
            </button>
          ))}
        </div>
      </section>

      {/* 6. PROFILE */}
      <form className="glass flex flex-col gap-3 p-5" onSubmit={handleSaveProfile}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">{t("profile")}</h2>
          {savedBanner && (
            <span className="text-xs text-success flex items-center gap-1 font-semibold animate-in fade-in">
              <Check className="size-3.5" />
              {s.lang === "bn" ? "সংরক্ষিত হয়েছে!" : "Saved successfully!"}
            </span>
          )}
        </div>
        <Field label={t("name")}>
          <input
            className="input"
            value={p.name}
            onChange={(e) => setP({ ...p, name: e.target.value })}
            placeholder={s.lang === "bn" ? "আপনার নাম" : "Your Name"}
          />
        </Field>
        <Field label={t("birth")}>
          <input
            type="date"
            className="input"
            value={p.birth}
            onChange={(e) => setP({ ...p, birth: e.target.value })}
          />
        </Field>
        <Field label={t("mainGoal")}>
          <input
            className="input"
            value={p.goal}
            onChange={(e) => setP({ ...p, goal: e.target.value })}
            placeholder={
              s.lang === "bn"
                ? "যেমন: ৫ ওয়াক্ত নামাজ জামাতে আদায় করা"
                : "e.g. Pray 5 daily prayers in congregation"
            }
          />
        </Field>
        <button className="rounded-xl bg-primary py-3 font-semibold text-primary-foreground hover:opacity-90 transition">
          {t("save")}
        </button>
      </form>

      {/* 7. APP UPDATE */}
      <section className="glass flex flex-col gap-2 p-5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">Noor Habit</span>
          <span className="text-xs text-muted-foreground font-mono">v{APP_VERSION}</span>
        </div>
        <button
          onClick={async () => {
            try {
              setUpd((await checkForUpdate()) ?? "none");
            } catch {
              setUpd("err");
            }
          }}
          className="rounded-xl bg-secondary py-2.5 text-xs font-semibold hover:bg-muted transition"
        >
          {t("checkUpdate")}
        </button>
        {upd === "none" && <p className="text-xs text-success mt-1">{t("upToDate")}</p>}
        {upd === "err" && <p className="text-xs text-destructive mt-1">{t("offlineAi")}</p>}
        {upd && typeof upd === "object" && (
          <div className="flex flex-col gap-2 mt-2">
            <p className="text-xs font-semibold">{t("updateAvail")}: v{upd.version}</p>
            <button
              onClick={() => openUpdate(upd)}
              className="rounded-xl bg-primary py-2.5 font-semibold text-primary-foreground"
            >
              {t("download")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
