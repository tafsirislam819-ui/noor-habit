import { Capacitor } from "@capacitor/core";
import type { Item, Prayer } from "./store";

export const isNative = () => typeof window !== "undefined" && Capacitor.isNativePlatform();

export async function requestPermission() {
  if (isNative()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const r = await LocalNotifications.requestPermissions();
    return r.display === "granted";
  }
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (window.top !== window.self) return false; // preview iframe blocks the prompt
  return (await Notification.requestPermission()) === "granted";
}

export function showNow(title: string, body: string) {
  if (isNative()) return; // native uses scheduled notifications
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
  return Math.abs(h) % 100000;
};

/** Native: schedule daily notifications. Aggressive = repeats every minute for 30 min until confirmed. */
export async function syncNativeSchedules(
  prayers: Prayer[],
  items: Item[],
  label: (k: string) => string,
  doneToday: (id: string) => boolean,
) {
  if (!isNative()) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });

  const list: { id: string; title: string; time: string; mode: string }[] = [
    ...prayers.map((p) => ({ id: "p-" + p.key, title: label(p.key), time: p.time, mode: p.notify })),
    ...items.filter((i) => i.time).map((i) => ({ id: i.id, title: i.title, time: i.time, mode: i.notify })),
  ];
  const notifications: Parameters<typeof LocalNotifications.schedule>[0]["notifications"] = [];
  for (const e of list) {
    if (e.mode === "off" || !e.time) continue;
    const [h = 0, m = 0] = e.time.split(":").map(Number);
    const base = hash(e.id) * 40;
    if (e.mode === "normal") {
      notifications.push({ id: base, title: e.title, body: "⏰", schedule: { on: { hour: h, minute: m }, allowWhileIdle: true } });
    } else {
      const start = new Date();
      start.setHours(h, m, 0, 0);
      if (start.getTime() < Date.now() - 30 * 60000 || doneToday(e.id)) start.setDate(start.getDate() + 1);
      for (let k = 0; k < 30; k++) {
        notifications.push({
          id: base + k,
          title: e.title,
          body: "🔔 নিশ্চিত করতে অ্যাপ খুলুন / Open app to confirm",
          schedule: { at: new Date(start.getTime() + k * 60000), allowWhileIdle: true },
          ongoing: true,
          autoCancel: false,
        });
      }
    }
  }
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
export function startAlarmSound() {
  stopAlarmSound();
  try {
    ctx = new AudioContext();
    const beep = () => {
      if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.5);
    };
    beep();
    timer = setInterval(beep, 900);
    navigator.vibrate?.([500, 300, 500, 300, 500]);
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
