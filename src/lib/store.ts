import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NotifyMode = "off" | "normal" | "aggressive";
export type ItemKind = "habit" | "goal" | "task";
export type Lang = "bn" | "en";
export const THEMES = ["midnight", "aurora", "ember", "rose", "emerald", "light"] as const;
export type Theme = (typeof THEMES)[number];
export const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type PrayerKey = (typeof PRAYERS)[number];

export interface Item {
  id: string;
  kind: ItemKind;
  title: string;
  time: string; // HH:MM, "" = no reminder
  notify: NotifyMode;
  doneDates: string[];
  createdAt: string;
}
export interface Prayer {
  key: PrayerKey;
  time: string;
  notify: NotifyMode;
  doneDates: string[];
}
export interface Profile {
  name: string;
  birth: string;
  goal: string;
}
export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export const today = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

const uid = () => Math.random().toString(36).slice(2, 10);

interface State {
  profile: Profile | null;
  lang: Lang;
  theme: Theme;
  items: Item[];
  prayers: Prayer[];
  chat: ChatMsg[];
  setProfile: (p: Profile) => void;
  setLang: (l: Lang) => void;
  setTheme: (t: Theme) => void;
  addItem: (kind: ItemKind, title: string, time: string) => void;
  removeItem: (id: string) => void;
  toggleItem: (id: string, date?: string) => void;
  setItemNotify: (id: string, mode: NotifyMode) => void;
  setItemTime: (id: string, time: string) => void;
  setPrayer: (key: PrayerKey, patch: Partial<Prayer>) => void;
  markPrayer: (key: PrayerKey, date?: string, done?: boolean) => void;
  setChat: (c: ChatMsg[]) => void;
}

/** Turning one mode on turns the other off; tapping the active one turns it off. */
export function nextMode(current: NotifyMode, tapped: Exclude<NotifyMode, "off">): NotifyMode {
  return current === tapped ? "off" : tapped;
}

const toggleDate = (arr: string[], d: string, force?: boolean) => {
  const has = arr.includes(d);
  const want = force ?? !has;
  if (want && !has) return [...arr, d];
  if (!want && has) return arr.filter((x) => x !== d);
  return arr;
};

export const useApp = create<State>()(
  persist(
    (set) => ({
      profile: null,
      lang: "bn",
      theme: "midnight",
      items: [],
      prayers: [
        { key: "fajr", time: "05:00", notify: "normal", doneDates: [] },
        { key: "dhuhr", time: "13:15", notify: "normal", doneDates: [] },
        { key: "asr", time: "16:30", notify: "normal", doneDates: [] },
        { key: "maghrib", time: "18:00", notify: "normal", doneDates: [] },
        { key: "isha", time: "19:30", notify: "normal", doneDates: [] },
      ],
      chat: [],
      setProfile: (profile) => set({ profile }),
      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      addItem: (kind, title, time) =>
        set((s) => ({
          items: [
            ...s.items,
            { id: uid(), kind, title, time, notify: time ? "normal" : "off", doneDates: [], createdAt: today() },
          ],
        })),
      removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      toggleItem: (id, date = today()) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, doneDates: toggleDate(i.doneDates, date) } : i)),
        })),
      setItemNotify: (id, notify) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, notify } : i)) })),
      setItemTime: (id, time) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, time } : i)) })),
      setPrayer: (key, patch) =>
        set((s) => ({ prayers: s.prayers.map((p) => (p.key === key ? { ...p, ...patch } : p)) })),
      markPrayer: (key, date = today(), done) =>
        set((s) => ({
          prayers: s.prayers.map((p) =>
            p.key === key ? { ...p, doneDates: toggleDate(p.doneDates, date, done) } : p,
          ),
        })),
      setChat: (chat) => set({ chat }),
    }),
    { name: "deen-habit-store" },
  ),
);
