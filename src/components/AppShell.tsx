import { InteractiveOnboarding } from "@/components/InteractiveOnboarding";
import { SmartPermissionsModal } from "@/components/SmartPermissionsModal";
import { StatusBar } from "@capacitor/status-bar";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Home,
  ListChecks,
  Moon,
  BarChart3,
  Bot,
  Users,
  Settings,
  Clock,
  Mic,
  MicOff,
  Send,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { useApp, today, PRAYERS, type Profile } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { showNow, startAlarmSound, stopAlarmSound, syncNativeSchedules, isNative, playTone } from "@/lib/notify";
import { supabase, syncStatsToCloud } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { setNativeTrackerLanguage } from "@/lib/native-reels";

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

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

interface SmartPrayerAlertData {
  id: string;
  prayerKey: (typeof PRAYERS)[number];
  title: string;
  time: string;
  phase: 2 | 3; // 2: exact time, 3: 30-min follow up
}

function useScheduler(onTriggerPrayerAlert: (data: SmartPrayerAlertData) => void) {
  const t = useT();
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    const tick = () => {
      const s = useApp.getState();
      const d = new Date();
      const nowMin = d.getHours() * 60 + d.getMinutes();
      const day = today(d);

      if (!s.notificationsEnabled) return;

      for (const p of s.prayers) {
        if (!p.time || p.notify === "off") continue;
        const [h = 0, m = 0] = p.time.split(":").map(Number);
        const itemMin = h * 60 + m;
        const isDone = (p.doneDates || []).includes(day);

        // PHASE 1: 15 MINUTES BEFORE PRAYER
        if (!isDone && nowMin === itemMin - 15) {
          const k1 = `p1-${p.key}-${day}`;
          if (!fired.current.has(k1)) {
            fired.current.add(k1);
            s.addAppNotification(
              "prayer",
              `🕌 ${t(p.key)} নামাজের ওয়াক্ত হতে ১৫ মিনিট বাকি`,
              "ওযু করে নামাজের জন্য মানসিক ও শারীরিক প্রস্তুতি গ্রহণ করুন।"
            );
            showNow(`🕌 ${t(p.key)} ওয়াক্তের ১৫ মিনিট বাকি`, "প্রস্তুতি গ্রহণ করুন");
          }
        }

        // PHASE 2: AT EXACT PRAYER TIME
        if (!isDone && nowMin === itemMin) {
          const k2 = `p2-${p.key}-${day}`;
          if (!fired.current.has(k2)) {
            fired.current.add(k2);
            s.addAppNotification(
              "prayer",
              `🕌 ${t(p.key)} নামাজের ওয়াক্ত হয়েছে!`,
              "দুনিয়াবী ব্যস্ততা সাময়িক রেখে এখনই নামাজের জন্য দাঁড়ান।"
            );
            showNow(`🕌 ${t(p.key)} নামাজের ওয়াক্ত হয়েছে`, "এখনই নামাজ আদায় করুন");
            playTone(s.remindTone);
            onTriggerPrayerAlert({
              id: "p-" + p.key,
              prayerKey: p.key,
              title: t(p.key),
              time: p.time,
              phase: 2,
            });
          }
        }

        // PHASE 3: +30 MINUTES FOLLOW-UP CHECK (Aggressive)
        if (!isDone && nowMin === itemMin + 30) {
          const k3 = `p3-${p.key}-${day}`;
          if (!fired.current.has(k3)) {
            fired.current.add(k3);
            s.addAppNotification(
              "prayer",
              `⚠️ ${t(p.key)} নামাজ কি আদায় করেছেন?`,
              "ওয়াক্ত শেষ হওয়ার আগেই নামাজ আদায় সম্পন্ন করুন।"
            );
            showNow(`⚠️ ${t(p.key)} নামাজ কি আদায় করেছেন?`, "ওয়াক্ত চলে যাচ্ছে");
            startAlarmSound();
            onTriggerPrayerAlert({
              id: "p-" + p.key,
              prayerKey: p.key,
              title: t(p.key),
              time: p.time,
              phase: 3,
            });
          }
        }
      }

      // HABITS / TASKS REMINDERS
      for (const i of s.items) {
        if (!i.time || i.notify === "off") continue;
        const [h = 0, m = 0] = i.time.split(":").map(Number);
        const itemMin = h * 60 + m;
        const isDone = (i.doneDates || []).includes(day);

        if (!isDone && nowMin === itemMin) {
          const k = `item-${i.id}-${day}`;
          if (!fired.current.has(k)) {
            fired.current.add(k);
            s.addAppNotification("reminder", i.title, "আপনার নির্ধারিত সময় উপস্থিত হয়েছে।");
            showNow(`⏰ ${i.title}`, "সম্পন্ন করে এগিয়ে থাকুন");
            playTone(s.remindTone);
          }
        }
      }
    };

    tick();
    const iv = setInterval(tick, 30000);
    return () => clearInterval(iv);
  }, [t, onTriggerPrayerAlert]);

  // Sync Native schedules on Android
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
          ? !!(prayers.find((p) => "p-" + p.key === id)?.doneDates || []).includes(day)
          : !!(items.find((i) => i.id === id)?.doneDates || []).includes(day),
      notifsOn
    ).catch(() => {});
  }, [prayers, items, t]);

  // Handle native notification action button clicks
  useEffect(() => {
    if (!isNative()) return;
    let removeSub: (() => void) | undefined;
    (async () => {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        const handle = await LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
          const extra = (action.notification.extra as any) || {};
          const currentDay = today();
          if (action.actionId === "mark_done") {
            if (extra.prayerKey) {
              useApp.getState().markPrayer(extra.prayerKey, currentDay, true);
            } else if (extra.itemId) {
              useApp.getState().toggleItem(extra.itemId, currentDay);
            }
          } else if (action.actionId === "snooze") {
            const snoozeTarget = new Date(Date.now() + 20 * 60 * 1000);
            LocalNotifications.schedule({
              notifications: [
                {
                  id: Math.floor(Math.random() * 100000) + 60000,
                  title: `⏰ ২০ মিনিট পর তাগিদ: ${action.notification.title}`,
                  body: "অনুগ্রহ করে নামাজ আদায় করে নিন।",
                  schedule: { at: snoozeTarget, allowWhileIdle: true },
                  sound: "beep.wav",
                  channelId: "aggressive_channel_v2",
                  actionTypeId: "PRAYER_ACTION",
                  extra: action.notification.extra,
                },
              ],
            }).catch(() => {});
          }
        });
        removeSub = () => handle.remove();
      } catch (err) {
        console.warn("Could not register localNotificationActionPerformed listener:", err);
      }
    })();
    return () => {
      if (removeSub) removeSub();
    };
  }, []);
}

/** ELEGANT APP SPLASH ANIMATION */
function SplashAnimation({ show, onFinish }: { show: boolean; onFinish: () => void }) {
  const [fading, setFading] = useState(false);
  const lang = useApp((s) => s.lang);

  useEffect(() => {
    if (show) {
      setFading(false);
      const timer1 = setTimeout(() => setFading(true), 1200);
      const timer2 = setTimeout(() => {
        onFinish();
      }, 1500);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [show, onFinish]);

  if (!show) return null;

  return (
    <div
      onClick={onFinish}
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background transition-opacity duration-300 cursor-pointer",
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      )}
    >
      <div className="relative flex flex-col items-center">
        <div className="absolute -inset-4 rounded-full bg-primary/20 blur-xl animate-pulse" />
        <div className="relative grid size-20 place-items-center rounded-3xl bg-primary/10 border border-primary/30 shadow-2xl animate-in zoom-in-75 duration-400">
          <Moon className="size-10 fill-primary text-primary transition-transform duration-700" />
        </div>

        <h1 className="mt-4 text-2xl font-black tracking-wide text-foreground">
          Noor Habit
        </h1>
        <p className="mt-1 text-xs font-medium text-primary tracking-widest uppercase">
          {lang === "bn" ? "ইসলামিক লাইফস্টাইল ও অভ্যাস ট্র্যাকার" : "Islamic Lifestyle & Habit Tracker"}
        </p>

        <div className="mt-5 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary animate-ping" />
          <span className="text-[11px] text-muted-foreground">
            {lang === "bn" ? "প্রস্তুত হচ্ছে..." : "Loading..."}
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

  useEffect(() => {
    setNativeTrackerLanguage(lang);
  }, [lang]);

  const [prayerAlert, setPrayerAlert] = useState<SmartPrayerAlertData | null>(null);
  const [aiExcuseText, setAiExcuseText] = useState("");
  const [aiReplyMsg, setAiReplyMsg] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  const markPrayer = useApp((s) => s.markPrayer);
  const earlyCheckWarning = useApp((s) => s.earlyCheckWarning);
  const setEarlyCheckWarning = useApp((s) => s.setEarlyCheckWarning);

  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
    document.documentElement.lang = lang;
  }, [theme, lang]);

  useEffect(() => {
    if (isNative()) {
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    }
  }, []);

  const triggerPrayerAlert = useRef((data: SmartPrayerAlertData) => {
    setPrayerAlert(data);
    setAiExcuseText("");
    setAiReplyMsg(null);
  }).current;

  useScheduler(triggerPrayerAlert);

  // Auto sync to cloud when state changes
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
          if (prayers.every((p) => (p.doneDates || []).includes(z))) st++;
          else break;
        }
        const todayStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        if (prayers.every((p) => (p.doneDates || []).includes(todayStr))) st++;

        syncStatsToCloud(data.user, profile?.name || "", prayers, items, st, profile?.avatar);
      }
    });
  }, [prayers, items, profile]);

  if (!hydrated) return null;
  const onboardingCompleted = typeof window !== "undefined" && localStorage.getItem("noor_onboarding_completed") === "true";
  if (!profile || !onboardingCompleted) {
    return <InteractiveOnboarding onComplete={() => {}} isInitial={true} />;
  }

  // Handle Action Button: I Prayed
  const handleMarkPrayed = () => {
    if (prayerAlert) {
      markPrayer(prayerAlert.prayerKey, today(), true);
    }
    stopAlarmSound();
    setPrayerAlert(null);
  };

  // Handle Action Button: Snooze 20 Minutes
  const handleSnooze20Min = () => {
    stopAlarmSound();
    setPrayerAlert(null);
    if (isNative()) {
      import("@capacitor/local-notifications").then(({ LocalNotifications }) => {
        LocalNotifications.schedule({
          notifications: [
            {
              id: Math.floor(Math.random() * 100000) + 70000,
              title: `⏰ ২০ মিনিট পর তাগিদ: ${prayerAlert?.title || "নামাজ"}`,
              body: "অনুগ্রহ করে নামাজ আদায় সম্পন্ন করে নিন।",
              schedule: { at: new Date(Date.now() + 20 * 60 * 1000), allowWhileIdle: true },
              sound: "beep.wav",
              channelId: "aggressive_channel_v2",
              actionTypeId: "PRAYER_ACTION",
              extra: { prayerKey: prayerAlert?.prayerKey },
            },
          ],
        }).catch(() => {});
      });
    }
  };

  // Handle Smart AI Voice / Text Reason (e.g. "আমি এখন বাইরে আছি, বাড়ি গিয়ে পড়ব")
  const handleSendAiExcuse = (customText?: string) => {
    const textToSend = customText || aiExcuseText;
    if (!textToSend.trim()) return;

    let reply = "ইনশাআল্লাহ, আপনার নিয়ত কবুল হোক। আপনি নিরাপদে গন্তব্যে পৌঁছান এবং সুযোগ পাওয়া মাত্রই নামাজ আদায় করে নেবেন। এখন আর কোনো এলার্ট দিয়ে আপনাকে বিরক্ত করা হবে না।";
    if (textToSend.includes("বাইরে") || textToSend.includes("সফর") || textToSend.includes("রাস্তা")) {
      reply = "বুঝতে পেরেছি, আপনি এখন বাইরে আছেন। আল্লাহ আপনার সফর সহজ করুন। বাড়ি পৌঁছানো পর্যন্ত আপনাকে কোনো নোটিফিকেশন পাঠানো হবে না। বাড়ি ফিরে নামাজ আদায় করে নেবেন।";
    } else if (textToSend.includes("অসুস্থ") || textToSend.includes("শরীর খারাপ")) {
      reply = "আল্লাহ আপনাকে দ্রুত শিফা দান করুন। যতটুকু সামর্থ্য রয়েছে সেভাবে বসে বা ইশারায় আদায় করার চেষ্টা করুন।";
    }

    setAiReplyMsg(reply);
    stopAlarmSound();

    setTimeout(() => {
      setPrayerAlert(null);
      setAiReplyMsg(null);
      setAiExcuseText("");
    }, 2800);
  };

  const startVoiceInput = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("ভয়েস ইনপুট এই ব্রাউজারে সমর্থিত নয়। অনুগ্রহ করে লিখে জানান।");
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "bn-BD";
      recognition.interimResults = false;
      setIsListening(true);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setAiExcuseText(transcript);
        setIsListening(false);
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const isAiRoute = loc.pathname === "/ai";

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl md:gap-4 md:p-4">
      {/* APP SPLASH ANIMATION */}
      <SplashAnimation show={showSplash} onFinish={() => setShowSplash(false)} />

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
      <main
        className={cn(
          "flex-1 px-4 pt-[max(3rem,calc(env(safe-area-inset-top,0px)+1.5rem))] md:pt-4 md:pb-8 w-full",
          isAiRoute ? "pb-20 h-[100dvh] overflow-hidden flex flex-col" : "pb-36"
        )}
      >
        {children}
      </main>

      {/* BOTTOM NAVIGATION (MOBILE) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around px-2 pt-2.5 border-t border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl md:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 14px))" }}
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

      {/* SMART SCREEN-OVERLAY PRAYER ALERT WITH AI MIC/TEXT ASSISTANCE */}
      {prayerAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="glass flex w-full max-w-sm flex-col items-center gap-4 p-6 text-center shadow-2xl border-2 border-primary/50 rounded-3xl">
            {/* Header Icon */}
            <div className="relative grid size-18 place-items-center rounded-2xl bg-primary/20 text-primary shadow-lg border border-primary/30">
              <Moon className="size-10 fill-primary animate-pulse" />
            </div>

            {/* Title & Phase Notice */}
            <div>
              <span className="rounded-full bg-primary/20 px-3 py-1 text-[11px] font-bold text-primary tracking-wide">
                {prayerAlert.phase === 3 ? "⚠️ তাগিদ এলার্ট (৩০ মিনিট পর)" : "🕌 ওয়াক্ত উপস্থিত"}
              </span>
              <h2 className="mt-2 text-2xl font-black text-foreground">
                {prayerAlert.title} নামাজের ওয়াক্ত
              </h2>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {prayerAlert.phase === 3
                  ? "আপনি কি নামাজ আদায় করেছেন? না করে থাকলে এখনই আদায় করে নিন।"
                  : "দুনিয়াবী কাজ সাময়িক বিরতি দিয়ে এখনই নামাজের জন্য দাঁড়িয়ে যান।"}
              </p>
            </div>

            {/* Direct Action Buttons */}
            <div className="flex w-full flex-col gap-2">
              <button
                type="button"
                onClick={handleMarkPrayed}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-base font-bold text-primary-foreground shadow-lg hover:opacity-95 active:scale-95 transition"
              >
                <CheckCircle2 className="size-5" />
                <span>নামাজ আদায় করেছি</span>
              </button>

              <button
                type="button"
                onClick={handleSnooze20Min}
                className="w-full rounded-xl bg-secondary py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                ⏰ ২০ মিনিট পর আবার জানান
              </button>
            </div>

            {/* AI Assistant Voice/Text Communication Box */}
            <div className="w-full rounded-2xl bg-secondary/40 p-3 border border-border/60 text-left space-y-2 mt-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary">
                <Sparkles className="size-3.5" />
                <span>নূর এআই সহকারী (পরিস্থিতি জানান):</span>
              </div>

              {aiReplyMsg ? (
                <div className="rounded-xl bg-primary/15 border border-primary/30 p-2.5 text-xs text-foreground animate-in fade-in leading-relaxed">
                  {aiReplyMsg}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={aiExcuseText}
                      onChange={(e) => setAiExcuseText(e.target.value)}
                      placeholder="যেমন: আমি এখন বাইরে আছি, বাড়ি গিয়ে পড়ব"
                      className="input text-xs py-1.5 h-8 flex-1"
                    />
                    <button
                      type="button"
                      onClick={startVoiceInput}
                      title="ভয়েস রেকর্ড করুন"
                      className={cn(
                        "grid size-8 place-items-center rounded-lg border transition shrink-0",
                        isListening ? "bg-destructive text-white animate-pulse" : "bg-secondary text-primary hover:bg-muted"
                      )}
                    >
                      {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendAiExcuse()}
                      className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow hover:opacity-90 shrink-0"
                    >
                      <Send className="size-3.5" />
                    </button>
                  </div>

                  {/* Quick Excuse Chips */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSendAiExcuse("আমি এখন বাইরে আছি, বাড়ি গিয়ে পড়ব")}
                      className="rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition"
                    >
                      🚶 বাইরে আছি
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendAiExcuse("আমি এখন অসুস্থ")}
                      className="rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition"
                    >
                      🤒 অসুস্থ
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendAiExcuse("সফরে আছি")}
                      className="rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition"
                    >
                      🚗 সফরে আছি
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SMART SYSTEM PERMISSIONS CHECKER MODAL */}
      <SmartPermissionsModal />

      {/* EARLY CHECK TIME RESTRICTION MODAL */}
      {earlyCheckWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="glass flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl p-6 text-center shadow-2xl border border-primary/30">
            <div className="relative grid size-16 place-items-center rounded-2xl bg-amber-500/15 text-amber-500 shadow-inner">
              <Clock className="size-8 animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-foreground">
                {lang === "bn" ? "সময়ের পূর্বে চেক করা যাবে না" : "Cannot Check Before Time"}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed px-2">
                {earlyCheckWarning.message}
              </p>
            </div>
            <div className="rounded-xl bg-secondary/60 px-3 py-1.5 border border-border/40 text-xs font-medium text-foreground">
              ⏰ {lang === "bn" ? "নির্ধারিত সময়:" : "Scheduled Time:"}{" "}
              <span className="text-primary font-bold">{earlyCheckWarning.scheduledTime}</span>
            </div>
            <button
              type="button"
              onClick={() => setEarlyCheckWarning(null)}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-md hover:opacity-90 transition active:scale-[0.98]"
            >
              {lang === "bn" ? "ঠিক আছে, বুঝতে পেরেছি" : "Got it"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
