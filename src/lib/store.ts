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
  actionDone?: {
    type: string;
    details: string;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMsg[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AiMemory {
  tone: string;
  preferences: string[];
  learnedNotes: string[];
}

export const today = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

const uid = () => Math.random().toString(36).slice(2, 10);
export const generateCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let res = "NOOR-";
  for (let i = 0; i < 6; i++) {
    res += chars[Math.floor(Math.random() * chars.length)];
  }
  return res;
};

interface State {
  profile: Profile | null;
  lang: Lang;
  theme: Theme;
  items: Item[];
  prayers: Prayer[];
  chat: ChatMsg[];
  chatSessions: ChatSession[];
  activeSessionId: string;
  authUser: AuthUser | null;
  userFriendCode: string;
  aiMemory: AiMemory;
  hijriOffset: number;
  notificationsEnabled: boolean;

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

  // New multi-session AI actions
  createChatSession: (title?: string) => string;
  switchChatSession: (id: string) => void;
  deleteChatSession: (id: string) => void;
  addChatMessage: (msg: ChatMsg) => void;
  setAiMemory: (patch: Partial<AiMemory>) => void;

  // Auth & Friend
  setAuthUser: (u: AuthUser | null) => void;
  setUserFriendCode: (code: string) => void;

  // Calendar & Settings
  setHijriOffset: (offset: number) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
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
    (set, get) => {
      const initialSessionId = uid();
      return {
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
        chatSessions: [
          {
            id: initialSessionId,
            title: "প্রথম আলোচনা / New Chat",
            createdAt: today(),
            messages: [],
          },
        ],
        activeSessionId: initialSessionId,
        authUser: null,
        userFriendCode: generateCode(),
        aiMemory: {
          tone: "warm, respectful, encouraging",
          preferences: [],
          learnedNotes: [],
        },
        hijriOffset: 0,
        notificationsEnabled: true,

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
        setChat: (chat) => {
          set((s) => {
            const sid = s.activeSessionId;
            const updatedSessions = s.chatSessions.map((sess) =>
              sess.id === sid ? { ...sess, messages: chat } : sess,
            );
            return { chat, chatSessions: updatedSessions };
          });
        },

        createChatSession: (title) => {
          const newId = uid();
          const newSession: ChatSession = {
            id: newId,
            title: title || (get().lang === "bn" ? "নতুন আলোচনা" : "New Chat"),
            createdAt: today(),
            messages: [],
          };
          set((s) => ({
            chatSessions: [newSession, ...s.chatSessions],
            activeSessionId: newId,
            chat: [],
          }));
          return newId;
        },

        switchChatSession: (id) => {
          const target = get().chatSessions.find((s) => s.id === id);
          if (target) {
            set({ activeSessionId: id, chat: target.messages });
          }
        },

        deleteChatSession: (id) => {
          set((s) => {
            const filtered = s.chatSessions.filter((x) => x.id !== id);
            const remaining = filtered.length > 0 ? filtered : [
              { id: uid(), title: s.lang === "bn" ? "নতুন আলোচনা" : "New Chat", createdAt: today(), messages: [] }
            ];
            const nextActive = remaining[0].id;
            return {
              chatSessions: remaining,
              activeSessionId: nextActive,
              chat: remaining[0].messages,
            };
          });
        },

        addChatMessage: (msg) => {
          set((s) => {
            const nextChat = [...s.chat, msg];
            const sid = s.activeSessionId;
            const updatedSessions = s.chatSessions.map((sess) => {
              if (sess.id === sid) {
                const title = sess.messages.length === 0 && msg.role === "user"
                  ? msg.content.slice(0, 24) + (msg.content.length > 24 ? "..." : "")
                  : sess.title;
                return { ...sess, title, messages: nextChat };
              }
              return sess;
            });
            return { chat: nextChat, chatSessions: updatedSessions };
          });
        },

        setAiMemory: (patch) =>
          set((s) => ({ aiMemory: { ...s.aiMemory, ...patch } })),

        setAuthUser: (authUser) => set({ authUser }),
        setUserFriendCode: (userFriendCode) => set({ userFriendCode }),

        setHijriOffset: (hijriOffset) => set({ hijriOffset }),
        setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      };
    },
    { name: "deen-habit-store" },
  ),
);
