import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NotifyMode = "off" | "normal" | "aggressive";
export type ItemKind = "habit" | "goal" | "task";
export type Lang = "bn" | "en";
export const THEMES = ["midnight", "aurora", "ember", "rose", "emerald", "light"] as const;
export type Theme = (typeof THEMES)[number];
export const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type PrayerKey = (typeof PRAYERS)[number];

export type TimeFormat = "12h" | "24h";
export type RemindTone = "gentle_bell" | "soft_chime" | "mellow_beep";
export type AggressiveTone = "continuous_alarm" | "pulse_radar" | "urgent_ping";

export interface Item {
  id: string;
  kind: ItemKind;
  title: string;
  time: string; // HH:MM, "" = no reminder
  notify: NotifyMode;
  doneDates: string[];
  createdAt: string;
}

export interface GoalSubTask {
  id: string;
  title: string;
  time?: string;
  doneDates: string[]; // daily completion dates
}

export interface Goal {
  id: string;
  title: string;
  deadline?: string; // target duration e.g. "1 week" or date "2026-10-27"
  subTasks: GoalSubTask[];
  createdAt: string;
}

export interface TodoItem {
  id: string;
  title: string;
  dueDate?: string;
  time?: string;
  notify: NotifyMode;
  completed: boolean;
  completedAt?: string;
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

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: "prayer" | "goal" | "friend" | "streak" | "system";
  createdAt: string;
  read: boolean;
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

/** Convert 24h HH:MM to user-preferred 12h or 24h format */
export function formatAppTime(timeStr: string, format: TimeFormat = "12h", lang: Lang = "bn"): string {
  if (!timeStr || !timeStr.includes(":")) return timeStr || "";
  if (format === "24h") return timeStr;

  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return timeStr;

  const isPM = h >= 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = m < 10 ? `0${m}` : `${m}`;

  if (lang === "en") {
    return `${h12}:${mm} ${isPM ? "PM" : "AM"}`;
  }

  // Smart natural Bengali time
  const period = h < 6 ? "ভোর" : h < 12 ? "সকাল" : h < 15 ? "দুপুর" : h < 18 ? "বিকাল" : "রাত";
  return `${period} ${h12}:${mm}`;
}

interface State {
  profile: Profile | null;
  lang: Lang;
  theme: Theme;
  timeFormat: TimeFormat;
  remindTone: RemindTone;
  aggressiveTone: AggressiveTone;

  items: Item[];
  goals: Goal[];
  todos: TodoItem[];
  prayers: Prayer[];

  chat: ChatMsg[];
  chatSessions: ChatSession[];
  activeSessionId: string;

  authUser: AuthUser | null;
  userFriendCode: string;
  aiMemory: AiMemory;
  hijriOffset: number;
  notificationsEnabled: boolean;
  appNotifications: AppNotification[];

  setProfile: (p: Profile) => void;
  setLang: (l: Lang) => void;
  setTheme: (t: Theme) => void;
  setTimeFormat: (tf: TimeFormat) => void;
  setRemindTone: (rt: RemindTone) => void;
  setAggressiveTone: (at: AggressiveTone) => void;

  // Habits & generic items
  addItem: (kind: ItemKind, title: string, time: string) => void;
  removeItem: (id: string) => void;
  toggleItem: (id: string, date?: string) => void;
  setItemNotify: (id: string, mode: NotifyMode) => void;
  setItemTime: (id: string, time: string) => void;

  // Goals with daily actionable tasks
  addGoal: (title: string, deadline?: string, initialSubTaskTitle?: string) => void;
  removeGoal: (id: string) => void;
  addGoalSubTask: (goalId: string, title: string, time?: string) => void;
  removeGoalSubTask: (goalId: string, subTaskId: string) => void;
  toggleGoalSubTask: (goalId: string, subTaskId: string, date?: string) => void;

  // To-Do items (One-time, non-daily)
  addTodo: (title: string, dueDate?: string, time?: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
  setTodoNotify: (id: string, mode: NotifyMode) => void;

  // Prayers
  setPrayer: (key: PrayerKey, patch: Partial<Prayer>) => void;
  markPrayer: (key: PrayerKey, date?: string, done?: boolean) => void;
  setChat: (c: ChatMsg[]) => void;

  // Multi-session AI actions
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

  // Home Screen Notifications
  addAppNotification: (notif: Omit<AppNotification, "id" | "createdAt" | "read">) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
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
        timeFormat: "12h",
        remindTone: "gentle_bell",
        aggressiveTone: "pulse_radar",

        items: [],
        goals: [
          {
            id: "goal-sample-1",
            title: "১ সপ্তাহের মধ্যে ক্লায়েন্ট ক্লোজ করা",
            deadline: "১ সপ্তাহ",
            createdAt: today(),
            subTasks: [
              { id: "st-1", title: "১৫টি LinkedIn Outreach", time: "11:00", doneDates: [] },
              { id: "st-2", title: "Follow-up ইমেইল পাঠানো", time: "16:00", doneDates: [] },
            ],
          },
        ],
        todos: [
          {
            id: "todo-sample-1",
            title: "আজকে বন্ধুর পারিবারিক দাওয়াত",
            dueDate: today(),
            time: "20:00",
            notify: "normal",
            completed: false,
            createdAt: today(),
          },
        ],
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
        appNotifications: [
          {
            id: "notif-welcome",
            title: "নূর হ্যাবিটে স্বাগতম! ✨",
            body: "আপনার প্রতিদিনের নামাজ ও লক্ষ্য পূরণে আমরা আপনার সাথে আছি।",
            type: "system",
            createdAt: today(),
            read: false,
          },
        ],

        setProfile: (profile) => set({ profile }),
        setLang: (lang) => set({ lang }),
        setTheme: (theme) => set({ theme }),
        setTimeFormat: (timeFormat) => set({ timeFormat }),
        setRemindTone: (remindTone) => set({ remindTone }),
        setAggressiveTone: (aggressiveTone) => set({ aggressiveTone }),

        // Habit & Generic Items
        addItem: (kind, title, time) =>
          set((s) => ({
            items: [
              ...s.items,
              {
                id: uid(),
                kind,
                title,
                time,
                notify: time.trim() ? "normal" : "off",
                doneDates: [],
                createdAt: today(),
              },
            ],
          })),
        removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
        toggleItem: (id, date = today()) =>
          set((s) => ({
            items: s.items.map((i) => (i.id === id ? { ...i, doneDates: toggleDate(i.doneDates, date) } : i)),
          })),
        // Bug fix: If time is not set, notify MUST NOT turn on!
        setItemNotify: (id, notify) =>
          set((s) => ({
            items: s.items.map((i) => {
              if (i.id !== id) return i;
              if (!i.time || !i.time.trim()) {
                return { ...i, notify: "off" };
              }
              return { ...i, notify };
            }),
          })),
        setItemTime: (id, time) =>
          set((s) => ({
            items: s.items.map((i) => {
              if (i.id !== id) return i;
              const nextNotify = !time.trim() ? "off" : i.notify;
              return { ...i, time, notify: nextNotify };
            }),
          })),

        // Goals with Daily Tasks
        addGoal: (title, deadline, initialSubTaskTitle) =>
          set((s) => {
            const newGoal: Goal = {
              id: uid(),
              title,
              deadline: deadline || "",
              createdAt: today(),
              subTasks: initialSubTaskTitle
                ? [{ id: uid(), title: initialSubTaskTitle, doneDates: [] }]
                : [],
            };
            return { goals: [newGoal, ...s.goals] };
          }),
        removeGoal: (id) => set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),
        addGoalSubTask: (goalId, title, time) =>
          set((s) => ({
            goals: s.goals.map((g) =>
              g.id === goalId
                ? {
                    ...g,
                    subTasks: [
                      ...g.subTasks,
                      { id: uid(), title, time: time || "", doneDates: [] },
                    ],
                  }
                : g
            ),
          })),
        removeGoalSubTask: (goalId, subTaskId) =>
          set((s) => ({
            goals: s.goals.map((g) =>
              g.id === goalId
                ? { ...g, subTasks: g.subTasks.filter((st) => st.id !== subTaskId) }
                : g
            ),
          })),
        toggleGoalSubTask: (goalId, subTaskId, date = today()) =>
          set((s) => ({
            goals: s.goals.map((g) =>
              g.id === goalId
                ? {
                    ...g,
                    subTasks: g.subTasks.map((st) =>
                      st.id === subTaskId ? { ...st, doneDates: toggleDate(st.doneDates, date) } : st
                    ),
                  }
                : g
            ),
          })),

        // To-Do List (One-time Tasks)
        addTodo: (title, dueDate, time) =>
          set((s) => ({
            todos: [
              {
                id: uid(),
                title,
                dueDate: dueDate || today(),
                time: time || "",
                notify: time && time.trim() ? "normal" : "off",
                completed: false,
                createdAt: today(),
              },
              ...s.todos,
            ],
          })),
        toggleTodo: (id) =>
          set((s) => ({
            todos: s.todos.map((td) =>
              td.id === id
                ? { ...td, completed: !td.completed, completedAt: !td.completed ? new Date().toISOString() : undefined }
                : td
            ),
          })),
        removeTodo: (id) => set((s) => ({ todos: s.todos.filter((td) => td.id !== id) })),
        setTodoNotify: (id, notify) =>
          set((s) => ({
            todos: s.todos.map((td) => {
              if (td.id !== id) return td;
              if (!td.time || !td.time.trim()) return { ...td, notify: "off" };
              return { ...td, notify };
            }),
          })),

        // Prayers
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
            const remaining =
              filtered.length > 0
                ? filtered
                : [
                    {
                      id: uid(),
                      title: s.lang === "bn" ? "নতুন আলোচনা" : "New Chat",
                      createdAt: today(),
                      messages: [],
                    },
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
                const title =
                  sess.messages.length === 0 && msg.role === "user"
                    ? msg.content.slice(0, 24) + (msg.content.length > 24 ? "..." : "")
                    : sess.title;
                return { ...sess, title, messages: nextChat };
              }
              return sess;
            });
            return { chat: nextChat, chatSessions: updatedSessions };
          });
        },

        setAiMemory: (patch) => set((s) => ({ aiMemory: { ...s.aiMemory, ...patch } })),

        setAuthUser: (authUser) => set({ authUser }),
        setUserFriendCode: (userFriendCode) => set({ userFriendCode }),

        setHijriOffset: (hijriOffset) => set({ hijriOffset }),
        setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),

        addAppNotification: (notif) =>
          set((s) => ({
            appNotifications: [
              {
                id: uid(),
                ...notif,
                createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                read: false,
              },
              ...s.appNotifications.slice(0, 30),
            ],
          })),
        markNotificationRead: (id) =>
          set((s) => ({
            appNotifications: s.appNotifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
          })),
        markAllNotificationsRead: () =>
          set((s) => ({
            appNotifications: s.appNotifications.map((n) => ({ ...n, read: true })),
          })),
        clearNotifications: () => set({ appNotifications: [] }),
      };
    },
    { name: "deen-habit-store" },
  ),
);
