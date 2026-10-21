import { Capacitor } from "@capacitor/core";
import { useApp, type Item, type Prayer } from "./store";

export const isNative = () => typeof window !== "undefined" && Capacitor.isNativePlatform();

/** Register high-priority notification channels and interactive action buttons on native Android */
export async function setupNotificationChannels() {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    // Interactive Action Buttons in Android Notification Shade
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: "PRAYER_ACTION",
          actions: [
            {
              id: "mark_done",
              title: "✓ আদায় করেছি (Done)",
              foreground: false,
            },
            {
              id: "snooze",
              title: "⏰ ২০ মিনিট পর (Snooze 20m)",
              foreground: false,
            },
          ],
        },
        {
          id: "HABIT_ACTION",
          actions: [
            {
              id: "mark_done",
              title: "✓ সম্পন্ন করেছি (Done)",
              foreground: false,
            },
            {
              id: "snooze",
              title: "⏰ পরে (Snooze 15m)",
              foreground: false,
            },
          ],
        },
      ],
    }).catch(() => {});

    // Primary High-Priority Channel for Prayers
    await LocalNotifications.createChannel({
      id: "prayer_channel_v2",
      name: "🕌 Prayer & Lifestyle Reminders",
      description: "Scheduled daily prayers and lifestyle habit alerts",
      importance: 5, // IMPORTANCE_HIGH (Shows heads-up banner on top of other apps)
      visibility: 1, // VISIBILITY_PUBLIC (Shows on lockscreen)
      sound: "beep.wav",
      vibration: true,
      lights: true,
      lightColor: "#7c6cf0",
    }).catch(() => {});

    // Aggressive Alarm Channel
    await LocalNotifications.createChannel({
      id: "aggressive_channel_v2",
      name: "🚨 Aggressive Prayer & Habit Alarms",
      description: "Insistent alerts for critical prayers and habits",
      importance: 5,
      visibility: 1,
      sound: "beep.wav",
      vibration: true,
      lights: true,
      lightColor: "#f59e0b",
    }).catch(() => {});
  } catch (err) {
    console.warn("Could not setup native notification channels or actions:", err);
  }
}

export async function requestPermission() {
  if (isNative()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await setupNotificationChannels();
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
  } catch {}
}

const hash = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 10000;
};

/**
 * 3-PHASE SMART PRAYER NOTIFICATION SCHEDULER:
 * Phase 1: 15 minutes before Prayer -> Preparation alert
 * Phase 2: Exact Prayer time -> Urgent call to prayer
 * Phase 3: +30 minutes after -> Follow-up status check
 * Phase 4: +50 minutes after (+20m extra grace) -> Final insistent reminder
 */
export async function syncNativeSchedules(
  prayers: Prayer[],
  items: Item[],
  label: (k: string) => string,
  _doneToday: (id: string) => boolean,
  enabled: boolean = true,
) {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await setupNotificationChannels();

    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }

    if (!enabled) return;

    const list: { id: string; title: string; time: string; mode: string; isPrayer: boolean; prayerKey?: string }[] = [
      ...prayers
        .filter((p) => p.time && p.time.trim() !== "")
        .map((p) => ({
          id: "p-" + p.key,
          title: label(p.key),
          time: p.time,
          mode: p.notify,
          isPrayer: true,
          prayerKey: p.key,
        })),
      ...items
        .filter((i) => i.time && i.time.trim() !== "")
        .map((i) => ({
          id: i.id,
          title: i.title,
          time: i.time,
          mode: i.notify,
          isPrayer: false,
        })),
    ];

    const notifications: Parameters<typeof LocalNotifications.schedule>[0]["notifications"] = [];

    for (const e of list) {
      if (e.mode === "off" || !e.time) continue;
      const [h = 0, m = 0] = e.time.split(":").map(Number);
      const baseId = hash(e.id) * 10;
      const isAggr = e.mode === "aggressive";
      const channelId = isAggr ? "aggressive_channel_v2" : "prayer_channel_v2";
      const actionTypeId = e.isPrayer ? "PRAYER_ACTION" : "HABIT_ACTION";
      const exactMin = h * 60 + m;

      if (e.isPrayer) {
        // PHASE 1: 15 MINUTES BEFORE PRAYER TIME (Preparation)
        const p1TotalMin = (exactMin - 15 + 1440) % 1440;
        const p1H = Math.floor(p1TotalMin / 60);
        const p1M = p1TotalMin % 60;
        notifications.push({
          id: baseId,
          title: `🕌 ${e.title} নামাজের ওয়াক্ত হতে ১৫ মিনিট বাকি`,
          body: "ওযু করে নামাজের জন্য মানসিক ও শারীরিক প্রস্তুতি গ্রহণ করুন।",
          schedule: { on: { hour: p1H, minute: p1M }, allowWhileIdle: true },
          sound: "beep.wav",
          channelId,
          actionTypeId,
          extra: { id: e.id, phase: 1, prayerKey: e.prayerKey },
        });

        // PHASE 2: AT EXACT PRAYER TIME (Direct Alert)
        notifications.push({
          id: baseId + 1,
          title: `🕌 ${e.title} নামাজের ওয়াক্ত হয়েছে!`,
          body: "দুনিয়াবী কাজ সাময়িক বিরতি দিয়ে এখনই নামাজের জন্য প্রস্তুতি নিন।",
          schedule: { on: { hour: h, minute: m }, allowWhileIdle: true },
          sound: "beep.wav",
          channelId,
          actionTypeId,
          extra: { id: e.id, phase: 2, prayerKey: e.prayerKey },
        });

        // PHASE 3: +30 MINUTES (Follow-up Check)
        const p3TotalMin = (exactMin + 30) % 1440;
        const p3H = Math.floor(p3TotalMin / 60);
        const p3M = p3TotalMin % 60;
        notifications.push({
          id: baseId + 2,
          title: `⚠️ ${e.title} নামাজ কি আদায় করেছেন?`,
          body: "আদায় হয়ে থাকলে চেক দিন, অথবা পরে পড়তে চাইলে স্নুজ করুন।",
          schedule: { on: { hour: p3H, minute: p3M }, allowWhileIdle: true },
          sound: "beep.wav",
          channelId: "aggressive_channel_v2",
          actionTypeId,
          extra: { id: e.id, phase: 3, prayerKey: e.prayerKey },
        });

        // PHASE 4: +50 MINUTES (+20m extra grace)
        const p4TotalMin = (exactMin + 50) % 1440;
        const p4H = Math.floor(p4TotalMin / 60);
        const p4M = p4TotalMin % 60;
        notifications.push({
          id: baseId + 3,
          title: `🚨 জরুরি তাগিদ: ${e.title} নামাজ দ্রুত আদায় করে নিন`,
          body: "ওয়াক্ত শেষ হয়ে যাওয়ার আগেই নামাজ সম্পন্ন করুন।",
          schedule: { on: { hour: p4H, minute: p4M }, allowWhileIdle: true },
          sound: "beep.wav",
          channelId: "aggressive_channel_v2",
          actionTypeId,
          extra: { id: e.id, phase: 4, prayerKey: e.prayerKey },
        });
      } else {
        // GENERAL HABIT / TO-DO
        notifications.push({
          id: baseId,
          title: isAggr ? `🚨 ${e.title} এর সময় হয়েছে!` : `⏰ ${e.title}`,
          body: isAggr ? "অনুগ্রহ করে এখনই সম্পন্ন করুন!" : "আপনার নির্ধারিত রুটিন অনুযায়ী সম্পন্ন করুন।",
          schedule: { on: { hour: h, minute: m }, allowWhileIdle: true },
          sound: "beep.wav",
          channelId,
          actionTypeId,
          extra: { id: e.id, itemId: e.id },
        });

        if (isAggr) {
          const followUpMin = (exactMin + 25) % 1440;
          notifications.push({
            id: baseId + 1,
            title: `⚠️ স্মরণ: ${e.title} সম্পন্ন হয়েছে কি?`,
            body: "আজকের রুটিন বজায় রাখতে কাজটি সম্পন্ন করে নিন।",
            schedule: { on: { hour: Math.floor(followUpMin / 60), minute: followUpMin % 60 }, allowWhileIdle: true },
            sound: "beep.wav",
            channelId,
            actionTypeId,
            extra: { id: e.id, itemId: e.id },
          });
        }
      }
    }

    if (notifications.length) {
      await LocalNotifications.schedule({ notifications });
    }
  } catch (err) {
    console.warn("Could not sync native notifications:", err);
  }
}

// -------------------------------------------------------------
// DUAL-ENGINE AUDIO PLAYBACK
// -------------------------------------------------------------

function buildWavDataUri(notes: { freq: number; duration: number; type?: "sine" | "triangle" | "sawtooth" }[]): string {
  const sampleRate = 22050;
  let totalSamples = 0;
  for (const n of notes) totalSamples += Math.floor(sampleRate * n.duration);
  const buffer = new Int16Array(totalSamples);
  let offset = 0;

  for (const n of notes) {
    const samples = Math.floor(sampleRate * n.duration);
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const progress = i / samples;
      let envelope = 1;
      if (progress < 0.05) envelope = progress / 0.05;
      else envelope = Math.max(0, 1 - (progress - 0.05) / 0.95);

      let val = 0;
      if (n.type === "sawtooth") {
        val = 2 * ((t * n.freq) % 1) - 1;
      } else if (n.type === "triangle") {
        val = 2 * Math.abs(2 * ((t * n.freq) % 1) - 1) - 1;
      } else {
        val = Math.sin(2 * Math.PI * n.freq * t);
      }

      val = val * envelope * 0.85;
      buffer[offset + i] = Math.max(-32768, Math.min(32767, val * 32000));
    }
    offset += samples;
  }

  const byteLength = totalSamples * 2;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + byteLength, true);
  view.setUint32(8, 0x57415645, false);
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, byteLength, true);

  const fullBytes = new Uint8Array(44 + byteLength);
  fullBytes.set(new Uint8Array(header), 0);
  fullBytes.set(new Uint8Array(buffer.buffer), 44);

  let binary = "";
  const len = fullBytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(fullBytes[i]);
  }
  return "data:audio/wav;base64," + btoa(binary);
}

const TONE_DATA_URIS: Record<string, string> = {
  gentle_bell: buildWavDataUri([{ freq: 587.33, duration: 1.2, type: "sine" }]),
  soft_chime: buildWavDataUri([
    { freq: 523.25, duration: 0.25, type: "triangle" },
    { freq: 659.25, duration: 0.7, type: "triangle" },
  ]),
  mellow_beep: buildWavDataUri([{ freq: 440, duration: 0.5, type: "sine" }]),
  pulse_radar: buildWavDataUri([
    { freq: 880, duration: 0.15, type: "sawtooth" },
    { freq: 1174.66, duration: 0.45, type: "sawtooth" },
  ]),
  urgent_ping: buildWavDataUri([
    { freq: 1046.5, duration: 0.15, type: "sawtooth" },
    { freq: 1318.51, duration: 0.4, type: "sawtooth" },
  ]),
  continuous_alarm: buildWavDataUri([
    { freq: 750, duration: 0.35, type: "sawtooth" },
    { freq: 1100, duration: 0.4, type: "sawtooth" },
  ]),
};

let sharedAudioCtx: AudioContext | null = null;
let alarmTimer: ReturnType<typeof setInterval> | null = null;

function getSynchronousAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    let audioCtx = sharedAudioCtx;
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        sharedAudioCtx = audioCtx;
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export async function playTone(tone: string): Promise<void> {
  const uri = TONE_DATA_URIS[tone] || TONE_DATA_URIS["gentle_bell"];
  if (uri && typeof Audio !== "undefined") {
    try {
      const audio = new Audio(uri);
      audio.volume = 1.0;
      audio.play().catch(() => {});
    } catch {}
  }

  try {
    const ctx = getSynchronousAudioContext();
    if (ctx) {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.setValueAtTime(0.7, now);

      if (tone === "gentle_bell") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, now);
        gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 1.2);
      } else if (tone === "soft_chime") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.22);
        gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.9);
      } else {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1174.66, now + 0.12);
        gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.6);
      }
    }
  } catch {}
}

export function startAlarmSound() {
  stopAlarmSound();
  const tone = useApp.getState().aggressiveTone || "pulse_radar";
  let count = 0;

  const run = () => {
    count++;
    if (count > 10) {
      stopAlarmSound();
      return;
    }
    playTone(tone).catch(() => {});
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([400, 200, 400]);
    }
  };

  run();
  alarmTimer = setInterval(run, 1300);
}

export function stopAlarmSound() {
  if (alarmTimer) clearInterval(alarmTimer);
  alarmTimer = null;
}
