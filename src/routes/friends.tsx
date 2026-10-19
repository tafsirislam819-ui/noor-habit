import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useTransition } from "react";
import { Trophy, Users, UserPlus, Copy, Check, LogOut, Flame, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import {
  supabase,
  getMyProfile,
  getFriendsList,
  getLeaderboard,
  sendFriendRequest,
  syncStatsToCloud,
  type DbProfile,
  type FriendEntry,
} from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/friends")({
  head: () => ({
    meta: [
      { title: "Friends & Leaderboard — Noor Habit" },
      { name: "description", content: "Compete with friends, compare prayer streaks and progress." },
      { property: "og:title", content: "Friends & Leaderboard — Noor Habit" },
      { property: "og:description", content: "Compete with friends, compare prayer streaks and progress." },
    ],
  }),
  component: FriendsPage,
});

function FriendsPage() {
  const t = useT();
  const { profile, prayers, items } = useApp();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"leaderboard" | "friends" | "add">("leaderboard");
  
  // Auth Form State
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  // Friends Data
  const [myDbProfile, setMyDbProfile] = useState<DbProfile | null>(null);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<DbProfile[]>([]);
  const [inputCode, setInputCode] = useState("");
  const [addMsg, setAddMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  // Load session
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadData(session.user);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const loadData = async (u: User) => {
    // 1. Calculate streak from prayers
    let st = 0;
    const d = new Date();
    // Check consecutive days
    for (let i = 0; i < 60; i++) {
      const prev = new Date();
      prev.setDate(d.getDate() - (i + 1));
      const z = new Date(prev.getTime() - prev.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      if (prayers.every((p) => p.doneDates.includes(z))) {
        st++;
      } else {
        break;
      }
    }
    // Also check today
    const todayStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (prayers.every((p) => p.doneDates.includes(todayStr))) {
      st++;
    }

    // 2. Sync stats
    await syncStatsToCloud(u, profile?.name || "", prayers, items, st);

    // 3. Fetch profile, friends, leaderboard
    const [p, fr, lb] = await Promise.all([
      getMyProfile(u),
      getFriendsList(u.id),
      getLeaderboard(u.id),
    ]);

    setMyDbProfile(p);
    setFriends(fr);
    setLeaderboard(lb);
  };

  useEffect(() => {
    if (user) {
      loadData(user);
    }
  }, [user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setAuthBusy(true);
    setAuthError("");

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            data: { name: profile?.name || "Friend" },
          },
        });
        if (error) throw error;
        if (data.user) {
          setUser(data.user);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });
        if (error) throw error;
        if (data.user) {
          setUser(data.user);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setAuthError(msg);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !inputCode.trim()) return;
    const res = await sendFriendRequest(user.id, inputCode.trim());
    setAddMsg({ text: res.message, ok: res.success });
    if (res.success) {
      setInputCode("");
      loadData(user);
    }
  };

  const copyFriendCode = () => {
    if (!myDbProfile?.friend_code) return;
    navigator.clipboard.writeText(myDbProfile.friend_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="animate-pulse text-muted-foreground">{t("appName")}...</p>
      </div>
    );
  }

  // If not logged in -> Show Auth UI
  if (!user) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-3xl font-bold">{t("friends")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("authNote")}</p>
        </header>

        <div className="glass mx-auto w-full max-w-md p-6">
          <div className="mb-6 flex gap-2">
            <button
              onClick={() => { setAuthMode("login"); setAuthError(""); }}
              className={cn("flex-1 rounded-xl py-2 font-medium transition", authMode === "login" ? "glow-on" : "bg-secondary")}
            >
              {t("login")}
            </button>
            <button
              onClick={() => { setAuthMode("signup"); setAuthError(""); }}
              className={cn("flex-1 rounded-xl py-2 font-medium transition", authMode === "signup" ? "glow-on" : "bg-secondary")}
            >
              {t("signup")}
            </button>
          </div>

          <form onSubmit={handleAuth} className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-muted-foreground">{t("email")}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="input mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("password")}</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input mt-1 w-full"
              />
            </div>

            {authError && <p className="text-xs text-destructive">{authError}</p>}

            <button
              disabled={authBusy}
              type="submit"
              className="mt-2 rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {authBusy ? "..." : authMode === "login" ? t("login") : t("signup")}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // User is logged in -> Full Friends & Leaderboard experience
  return (
    <div className="flex flex-col gap-5">
      {/* Profile Bar */}
      <section className="glass flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">
            {myDbProfile?.name?.[0]?.toUpperCase() || "🌙"}
          </div>
          <div>
            <h2 className="font-bold">{myDbProfile?.name || profile?.name}</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("friendCode")}:</span>
              <span className="rounded bg-secondary px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                {myDbProfile?.friend_code || "------"}
              </span>
              <button onClick={copyFriendCode} title={t("copyCode")} className="text-muted-foreground hover:text-primary">
                {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-1.5">
            <Flame className="size-4 text-warning" />
            <span className="text-sm font-bold">{myDbProfile?.streak ?? 0}</span>
            <span className="text-[10px] text-muted-foreground">{t("streak")}</span>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            title={t("logout")}
            className="rounded-xl bg-secondary p-2 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </section>

      {/* Tabs */}
      <div className="glass flex gap-1 p-1">
        <button
          onClick={() => startTransition(() => setTab("leaderboard"))}
          className={cn("flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition md:text-sm", tab === "leaderboard" && "glow-on")}
        >
          <Trophy className="size-4" />
          {t("leaderboard")}
        </button>
        <button
          onClick={() => startTransition(() => setTab("friends"))}
          className={cn("flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition md:text-sm", tab === "friends" && "glow-on")}
        >
          <Users className="size-4" />
          {t("myFriends")} ({friends.length})
        </button>
        <button
          onClick={() => startTransition(() => setTab("add"))}
          className={cn("flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition md:text-sm", tab === "add" && "glow-on")}
        >
          <UserPlus className="size-4" />
          {t("addFriend")}
        </button>
      </div>

      {/* Tab 1: Leaderboard */}
      {tab === "leaderboard" && (
        <section className="flex flex-col gap-3">
          {leaderboard.length === 0 ? (
            <div className="glass flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
              <Trophy className="size-10 text-muted-foreground/40" />
              <p className="text-sm">{t("noFriendsYet")}</p>
            </div>
          ) : (
            leaderboard.map((item, idx) => {
              const isMe = item.id === user.id;
              const rankIcon = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "glass flex items-center gap-3 p-3.5 transition",
                    isMe && "ring-2 ring-primary/60 bg-primary/10"
                  )}
                >
                  <span className="w-8 text-center text-lg font-bold">{rankIcon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {item.name} {isMe && <span className="text-xs text-primary">(You)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      🕌 {item.prayed_today ?? 0}/5 · ✅ {item.habits_today ?? 0}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-1 text-sm font-bold">
                    <Flame className="size-4 text-warning" />
                    <span>{item.streak}</span>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

      {/* Tab 2: Friends List */}
      {tab === "friends" && (
        <section className="flex flex-col gap-3">
          {friends.length === 0 ? (
            <div className="glass flex flex-col items-center gap-3 p-8 text-center">
              <Users className="size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t("noFriendsYet")}</p>
              <button
                onClick={() => setTab("add")}
                className="mt-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
              >
                + {t("addFriend")}
              </button>
            </div>
          ) : (
            friends.map((f) => (
              <div key={f.id} className="glass flex items-center justify-between p-3.5">
                <div>
                  <h3 className="font-semibold">{f.name}</h3>
                  <p className="text-xs text-muted-foreground font-mono">{f.friend_code}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs font-medium">🕌 {f.prayed_today}/5</p>
                    <p className="text-[10px] text-muted-foreground">{f.habits_today} habits</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-xs font-bold">
                    <Flame className="size-3.5 text-warning" />
                    {f.streak}
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* Tab 3: Add Friend */}
      {tab === "add" && (
        <section className="flex flex-col gap-4">
          <div className="glass flex flex-col items-center gap-2 p-6 text-center">
            <Sparkles className="size-8 text-primary" />
            <h3 className="text-lg font-bold">{t("friendCode")}</h3>
            <p className="text-xs text-muted-foreground">Share this code with your friends so they can add you:</p>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-secondary px-4 py-2">
              <span className="font-mono text-xl font-bold tracking-widest text-primary">
                {myDbProfile?.friend_code || "------"}
              </span>
              <button onClick={copyFriendCode} className="ml-2 rounded-lg bg-background/50 p-2 text-primary hover:bg-background">
                {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              </button>
            </div>
          </div>

          <form onSubmit={handleAddFriend} className="glass flex flex-col gap-3 p-5">
            <h3 className="font-semibold">{t("addFriend")}</h3>
            <div className="flex gap-2">
              <input
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder={t("enterFriendCode")}
                className="input flex-1 font-mono uppercase"
              />
              <button type="submit" className="shrink-0 rounded-xl bg-primary px-5 font-semibold text-primary-foreground">
                {t("sendRequest")}
              </button>
            </div>
            {addMsg && (
              <p className={cn("text-xs", addMsg.ok ? "text-success" : "text-destructive")}>
                {addMsg.text}
              </p>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
