import { Capacitor } from "@capacitor/core";
import { useApp, type Item, type Prayer } from "./store";

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

    // Filter strictly to items that HAVE a non-empty time
    const list: { id: string; title: string; time: string; mode: string }[] = [
      ...prayers
        .filter((p) => p.time && p.time.trim() !== "")
        .map((p) => ({ id: "p-" + p.key, title: label(p.key), time: p.time, mode: p.notify })),
      ...items
        .filter((i) => i.time && i.time.trim() !== "")
        .map((i) => ({ id: i.id, title: i.title, time: i.time, mode: i.notify })),
    ];

    const notifications: Parameters<typeof LocalNotifications.schedule>[0]["notifications"] = [];
    const now = Date.now();

    for (const e of list) {
      if (e.mode === "off" || !e.time) continue;
      const [h = 0, m = 0] = e.time.split(":").map(Number);
      const baseId = hash(e.id) * 10;

      const target = new Date();
      target.setHours(h, m, 0, 0);

      if (target.getTime() <= now || doneToday(e.id)) {
        target.setDate(target.getDate() + 1);
      }

      notifications.push({
        id: baseId,
        title: e.title,
        body: "⏰ নামাজের/অভ্যাসের সময় হয়েছে • Time for " + e.title,
        schedule: { at: target, allowWhileIdle: true },
        sound: "beep.wav",
      });

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

let audioCtx: AudioContext | null = null;
let alarmTimer: ReturnType<typeof setInterval> | null = null;

function getAudioContext() {
  if (!audioCtx || audioCtx.state === "closed") {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/** Play a single tone preview or single reminder ping */
export function playTone(tone: string) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (tone === "gentle_bell") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now); // D5
      gain.setValueAtTime(0.3, now);
      gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.2);
    } else if (tone === "soft_chime") {
      // 2-tone melodic chime
      [523.25, 659.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.2;
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, start);
        gain.setValueAtTime(0.25, start);
        gain.exponentialRampToValueAtTime(0.001, start + 0.8);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.8);
      });
    } else if (tone === "mellow_beep") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);
      gain.setValueAtTime(0.2, now);
      gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (tone === "pulse_radar") {
      [880, 1174.66].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.12;
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, start);
        gain.setValueAtTime(0.2, start);
        gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    } else if (tone === "urgent_ping") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(1046.5, now);
      gain.setValueAtTime(0.15, now);
      gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      // default / continuous_alarm pulse
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.25);
      gain.setValueAtTime(0.25, now);
      gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch {
    /* ignore */
  }
}

/** Play repeating alarm for aggressive mode */
export function startAlarmSound() {
  stopAlarmSound();
  const tone = useApp.getState().aggressiveTone || "pulse_radar";
  let count = 0;

  const run = () => {
    count++;
    if (count > 6) {
      stopAlarmSound();
      return;
    }
    playTone(tone);
    navigator.vibrate?.([300, 150, 300]);
  };

  run();
  alarmTimer = setInterval(run, 1400);
}

export function stopAlarmSound() {
  if (alarmTimer) clearInterval(alarmTimer);
  alarmTimer = null;
}
