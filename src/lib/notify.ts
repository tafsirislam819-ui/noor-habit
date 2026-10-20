import { Capacitor } from "@capacitor/core";
import type { Item, Prayer } from "./store";

export const isNative = () => typeof window !== "undefined" && Capacitor.isNativePlatform();

export async function requestPermission() {
  if (isNative()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const r = await LocalNotifications.requestPermissions();
      return r.display === "granted";
    } catch {
      return false;
    }
  }
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (window.top !== window.self) return false;
  return (await Notification.requestPermission()) === "granted";
}

const recentWebNotifs = new Set<string>();

export function showNow(title: string, body: string) {
  if (isNative()) return;
  const key = `${title}-${new Date().getHours()}-${new Date().getMinutes()}`;
  if (recentWebNotifs.has(key)) return;
  recentWebNotifs.add(key);

  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, tag: title });
    }
  } catch {
    /* ignore */
  }
}

const hash = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 10000;
};

/** Native: schedule daily polite notifications without spamming. */
export async function syncNativeSchedules(
  prayers: Prayer[],
  items: Item[],
  label: (k: string) => string,
  doneToday: (id: string) => boolean,
  enabled: boolean = true,
) {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }

    if (!enabled) return;

    const list: { id: string; title: string; time: string; mode: string }[] = [
      ...prayers.map((p) => ({ id: "p-" + p.key, title: label(p.key), time: p.time, mode: p.notify })),
      ...items.filter((i) => i.time).map((i) => ({ id: i.id, title: i.title, time: i.time, mode: i.notify })),
    ];

    const notifications: Parameters<typeof LocalNotifications.schedule>[0]["notifications"] = [];
    const now = Date.now();

    for (const e of list) {
      if (e.mode === "off" || !e.time) continue;
      const [h = 0, m = 0] = e.time.split(":").map(Number);
      const baseId = hash(e.id) * 10;

      // Calculate next trigger time
      const target = new Date();
      target.setHours(h, m, 0, 0);

      // If already passed today or done today, schedule for tomorrow
      if (target.getTime() <= now || doneToday(e.id)) {
        target.setDate(target.getDate() + 1);
      }

      // 1. Primary reminder
      notifications.push({
        id: baseId,
        title: e.title,
        body: "⏰ নামাজের/অভ্যাসের সময় হয়েছে • Time for " + e.title,
        schedule: { at: target, allowWhileIdle: true },
        sound: "beep.wav",
      });

      // 2. If aggressive mode, add at most ONE follow-up 10 minutes later if unconfirmed
      if (e.mode === "aggressive") {
        const followUp = new Date(target.getTime() + 10 * 60000);
        notifications.push({
          id: baseId + 1,
          title: "🔔 স্মরণ করিয়ে দেওয়া: " + e.title,
          body: "অনুগ্রহ করে সম্পন্ন করুন / Please complete and mark",
          schedule: { at: followUp, allowWhileIdle: true },
        });
      }
    }

    if (notifications.length) {
      await LocalNotifications.schedule({ notifications });
    }
  } catch (err) {
    console.warn("Could not sync native notifications:", err);
  }
}

let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export function startAlarmSound() {
  stopAlarmSound();
  try {
    ctx = new AudioContext();
    let count = 0;
    const beep = () => {
      if (!ctx) return;
      count++;
      if (count > 5) {
        // Stop automatically after 5 beeps to avoid annoying the user
        stopAlarmSound();
        return;
      }
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.4);
    };
    beep();
    timer = setInterval(beep, 1200);
    navigator.vibrate?.([300, 200, 300]);
  } catch {
    /* ignore */
  }
}

export function stopAlarmSound() {
  if (timer) clearInterval(timer);
  timer = null;
  ctx?.close().catch(() => {});
  ctx = null;
}
