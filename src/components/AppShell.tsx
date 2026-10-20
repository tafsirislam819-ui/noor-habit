import { StatusBar } from "@capacitor/status-bar";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Home, ListChecks, Moon, BarChart3, Bot, Users, Settings, RefreshCw, CheckCircle2 } from "lucide-react";
import { useApp, today, PRAYERS, type Profile } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { showNow, startAlarmSound, stopAlarmSound, syncNativeSchedules, isNative, playTone } from "@/lib/notify";
import { supabase, syncStatsToCloud } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", icon: Home, k: "home" },
  { to: "/plan", icon: ListChecks, k: "plan" },
  { to: "/prayer", icon: Moon, k: "prayer" },
  { to: "/analytics", icon: BarChart3, k: "analytics" },
  { to: "/ai", icon: Bot, k: "ai" },
  { to: "/friends", icon: Users, k: "friends" },
  { to: "/settings", icon: Settings, k: "settings" },
] as const;

function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  return h;
}

function Onboarding() {
  const t = useT();
  const setProfile = useApp((s) => s.setProfile);
  const [p, setP] = useState<Profile>({ name: "", birth: "", goal: "" });
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex justify-end">
        <button className="glass px-3 py-1 text-sm rounded-lg" onClick={() => setLang(lang === "bn" ? "en" : "bn")}>
          {lang === "bn" ? "English" : "বাংলা"}
        </button>
      </div>
      <div>
        <h1 className="text-4xl font-bold">{t("appName")}</h1>
        <p className="mt-2 text-muted-foreground">{t("welcome")}</p>
      </div>
      <form
        className="glass flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (p.name.trim()) setProfile(p);
        }}
      >
        <Field label={t("name")}>
          <input required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} className="input" />
        </Field>
        <Field label={t("birth")}>
          <input type="date" value={p.birth} onChange={(e) => setP({ ...p, birth: e.target.value })} className="input" />
        </Field>
        <Field label={t("mainGoal")}>
          <input value={p.goal} onChange={(e) => setP({ ...p, goal: e.target.value })} className="input" />
        </Field>
        <button className="rounded-xl bg-primary py-3 font-semibold text-primary-foreground">{t("start")}</button>
      </form>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

interface Alarm {
  id: string;
  title: string;
  prayer?: (typeof PRAYERS)[number] | undefined;
}

function useScheduler(onAggressive: (a: Alarm) => void) {
  const t = useT();
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    const tick = () => {
      const s = useApp.getState();
      const d = new Date();
      const nowMin = d.getHours() * 60 + d.getMinutes();
      const day = today(d);

      // Strict rule: only items that HAVE a non-empty time
      const entries = [
        ...s.prayers
          .filter((p) => p.time && p.time.trim() !== "")
          .map((p) => ({
            id: "p-" + p.key,
            title: `${t("timeFor")}: ${t(p.key)}`,
            time: p.time,
            mode: p.notify,
            done: p.doneDates.includes(day),
            prayer: p.key,
          })),
        ...s.items
          .filter((i) => i.time && i.time.trim() !== "")
          .map((i) => ({
            id: i.id,
            title: i.title,
            time: i.time,
            mode: i.notify,
            done: i.doneDates.includes(day),
            prayer: undefined,
          })),
      ];

      if (!s.notificationsEnabled) return;

      for (const e of entries) {
        if (e.mode === "off" || !e.time || e.done) continue;
        const [h = 0, m = 0] = e.time.split(":").map(Number);
        const itemMin = h * 60 + m;
        const diff = nowMin - itemMin;
        if (diff !== 0) continue;

        const key = `${e.id}-${day}`;
        if (fired.current.has(key)) continue;
        fired.current.add(key);

        // Add to in-app notification center
        s.addAppNotification(
          e.prayer ? "prayer" : "reminder",
          e.title,
          s.lang === "bn" ? "নির্ধারিত সময় উপস্থিত হয়েছে।" : "Scheduled time has arrived."
        );

        showNow(e.title, "⏰");
        playTone(s.remindTone);

        if (e.mode === "aggressive") {
          onAggressive({ id: e.id, title: e.title, prayer: e.prayer });
        }
      }
    };

    tick();
    const iv = setInterval(tick, 30000);
    return () => clearInterval(iv);
  }, [t, onAggressive]);

  // native schedules
  const prayers = useApp((s) => s.prayers);
  const items = useApp((s) => s.items);
  useEffect(() => {
    if (!isNative()) return;
    const day = today();
    const notifsOn = useApp.getState().notificationsEnabled;
    syncNativeSchedules(
      prayers,
      items,
      (k) => t(k as never),
      (id) =>
        id.startsWith("p-")
          ? !!prayers.find((p) => "p-" + p.key === id)?.doneDates.includes(day)
          : !!items.find((i) => i.id === id)?.doneDates.includes(day),
      notifsOn
    ).catch(() => {});
  }, [prayers, items, t]);
}

/** ELEGANT APP SPLASH / RESUME ANIMATION */
function SplashAnimation({ show, onFinish }: { show: boolean; onFinish: () => void }) {
  const [fading, setFading] = useState(false);
  const lang = useApp((s) => s.lang);

  useEffect(() => {
    if (show) {
      setFading(false);
      const timer1 = setTimeout(() => setFading(true), 750);
      const timer2 = setTimeout(() => {
        onFinish();
      }, 1050);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [show, onFinish]);

  if (!show) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background transition-opacity duration-300",
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      )}
    >
      <div className="relative flex flex-col items-center">
        {/* Glowing Aura Ring */}
        <div className="absolute -inset-4 rounded-full bg-primary/20 blur-xl animate-pulse" />

        {/* Crescent Moon Container */}
        <div className="relative grid size-20 place-items-center rounded-3xl bg-primary/10 border border-primary/30 shadow-2xl animate-in zoom-in-75 duration-500">
          <Moon className="size-10 fill-primary text-primary transition-transform duration-700 animate-spin-slow" />
        </div>

        {/* Title & Slogan */}
        <h1 className="mt-4 text-2xl font-black tracking-wide text-foreground animate-in fade-in slide-in-from-bottom-2 duration-500">
          Noor Habit
        </h1>
        <p className="mt-1 text-xs font-medium text-primary tracking-widest uppercase">
          {lang === "bn" ? "ইসলামিক লাইফস্টাইল ও অভ্যাস ট্র্যাকার" : "Islamic Lifestyle & Habit Tracker"}
        </p>

        {/* Subtle breathing indicator */}
        <div className="mt-6 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary animate-ping" />
          <span className="text-[11px] text-muted-foreground">
            {lang === "bn" ? "অ্যাপ প্রস্তুত হচ্ছে..." : "Loading routine..."}
          </span>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const profile = useApp((s) => s.profile);
  const theme = useApp((s) => s.theme);
  const lang = useApp((s) => s.lang);
  const t = useT();
  const loc = useLocation();
  const [alarm, setAlarm] = useState<Alarm | null>(null);
  const markPrayer = useApp((s) => s.markPrayer);
  const toggleItem = useApp((s) => s.toggleItem);

  // App Startup / Resume Splash
  const [showSplash, setShowSplash] = useState(true);
  const lastHiddenTime = useRef<number>(Date.now());

  // Pull to refresh states
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const startYRef = useRef<number>(0);
  const isPullingRef = useRef<boolean>(false);

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
    document.documentElement.lang = lang;
  }, [theme, lang]);

  // Set native status bar overlay on mount
  useEffect(() => {
    if (isNative()) {
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    }
  }, []);

  // Handle App Resume / Visibility Change for smooth startup animation
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        lastHiddenTime.current = Date.now();
      } else {
        const awayMs = Date.now() - lastHiddenTime.current;
        // If app was minimized for > 6 seconds, show quick pleasant splash on resume
        if (awayMs > 6000) {
          setShowSplash(true);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Audio gesture unlock
  useEffect(() => {
    const unlock = () => {
      try {
        const audio = new Audio();
        audio.play().catch(() => {});
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  const onAggr = useRef((a: Alarm) => {
    setAlarm(a);
    startAlarmSound();
  }).current;
  useScheduler(onAggr);

  // Auto sync to cloud when state changes (debounced)
  const prayers = useApp((s) => s.prayers);
  const items = useApp((s) => s.items);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        let st = 0;
        const d = new Date();
        for (let i = 0; i < 60; i++) {
          const prev = new Date();
          prev.setDate(d.getDate() - (i + 1));
          const z = new Date(prev.getTime() - prev.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
          if (prayers.every((p) => p.doneDates.includes(z))) st++;
          else break;
        }
        const todayStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        if (prayers.every((p) => p.doneDates.includes(todayStr))) st++;

        syncStatsToCloud(data.user, profile?.name || "", prayers, items, st);
      }
    });
  }, [prayers, items, profile?.name]);

  // Pull to refresh touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    } else {
      isPullingRef.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPullingRef.current || refreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;
    if (diff > 0 && window.scrollY === 0) {
      setPullY(Math.min(diff * 0.45, 80));
    }
  };

  const handleTouchEnd = async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;
    if (pullY > 50) {
      setRefreshing(true);
      setPullY(60);
      try {
        // Sync with supabase
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          await syncStatsToCloud(data.user, profile?.name || "", prayers, items, 0);
        }
      } catch {
        /* ignore */
      } finally {
        setTimeout(() => {
          setRefreshing(false);
          setRefreshDone(true);
          setTimeout(() => {
            setPullY(0);
            setRefreshDone(false);
          }, 600);
        }, 500);
      }
    } else {
      setPullY(0);
    }
  };

  if (!hydrated) return <div className="min-h-dvh" />;
  if (!profile) return <Onboarding />;

  const confirm = async () => {
    if (alarm) {
      if (alarm.prayer) markPrayer(alarm.prayer, today(), true);
      else toggleItem(alarm.id);
    }
    stopAlarmSound();
    setAlarm(null);
    if (isNative()) {
      const s = useApp.getState();
      await syncNativeSchedules(s.prayers, s.items, (k) => t(k as never), () => true).catch(() => {});
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="mx-auto flex min-h-dvh max-w-5xl md:gap-4 md:p-4 select-none-touch"
    >
      {/* APP SPLASH / RESUME ANIMATION */}
      <SplashAnimation show={showSplash} onFinish={() => setShowSplash(false)} />

      {/* PULL TO REFRESH INDICATOR */}
      <div
        style={{
          transform: `translateY(${pullY}px)`,
          opacity: pullY > 10 ? 1 : 0,
        }}
        className="fixed inset-x-0 top-2 z-50 flex items-center justify-center transition-transform duration-150 pointer-events-none"
      >
        <div className="glass flex items-center gap-2 rounded-full px-4 py-2 shadow-xl border border-primary/40 text-xs font-semibold text-primary">
          {refreshing ? (
            <>
              <RefreshCw className="size-4 animate-spin text-primary" />
              <span>{lang === "bn" ? "রিফ্রেশ ও সিঙ্ক হচ্ছে..." : "Syncing & refreshing..."}</span>
            </>
          ) : refreshDone ? (
            <>
              <CheckCircle2 className="size-4 text-success" />
              <span className="text-success">{lang === "bn" ? "আপডেট সম্পন্ন!" : "Updated!"}</span>
            </>
          ) : (
            <>
              <RefreshCw
                className="size-4 text-primary transition-transform"
                style={{ transform: `rotate(${pullY * 4}deg)` }}
              />
              <span>{lang === "bn" ? "ছেড়ে দিলে রিফ্রেশ হবে" : "Release to refresh"}</span>
            </>
          )}
        </div>
      </div>

      {/* SIDEBAR NAVIGATION (DESKTOP) */}
      <nav className="glass sticky top-4 hidden h-[calc(100dvh-2rem)] w-20 flex-col items-center gap-2 py-4 md:flex">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            title={t(n.k)}
            className={cn(
              "grid size-11 place-items-center rounded-xl text-muted-foreground transition hover:text-foreground",
              loc.pathname === n.to && "glow-on text-primary"
            )}
          >
            <n.icon className="size-5" />
          </Link>
        ))}
      </nav>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top,0px))] md:pb-6">
        {children}
      </main>

      {/* BOTTOM NAVIGATION (MOBILE) */}
      <nav
        className="glass fixed inset-x-3 bottom-3 z-40 flex justify-between px-3 py-2.5 backdrop-blur-xl shadow-2xl md:hidden"
        style={{ paddingBottom: "max(0.6rem, env(safe-area-inset-bottom))" }}
      >
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] text-muted-foreground transition",
              loc.pathname === n.to && "glow-on text-primary"
            )}
          >
            <n.icon className="size-5" />
            {t(n.k)}
          </Link>
        ))}
      </nav>

      {/* AGGRESSIVE ALARM MODAL */}
      {alarm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-6 backdrop-blur-xl animate-in fade-in">
          <div className="glass flex w-full max-w-sm flex-col items-center gap-5 p-8 text-center shadow-2xl">
            <div className="glow-on grid size-20 animate-pulse place-items-center rounded-full text-4xl">🔔</div>
            <h2 className="text-2xl font-bold">{alarm.title}</h2>
            <button
              onClick={confirm}
              className="w-full rounded-xl bg-primary py-4 text-lg font-semibold text-primary-foreground shadow-lg hover:opacity-90 transition"
            >
              {alarm.prayer ? t("iPrayed") : "✓"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
