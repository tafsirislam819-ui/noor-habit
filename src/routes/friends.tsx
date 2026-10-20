import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useTransition } from "react";
import { Trophy, Users, UserPlus, Copy, Check, LogOut, Flame, Sparkles, Share2, KeyRound, Mail, ArrowLeft, ShieldCheck } from "lucide-react";
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
  const { profile, prayers, items, authUser, setAuthUser, userFriendCode, setUserFriendCode } = useApp();
  const [tab, setTab] = useState<"leaderboard" | "friends" | "add">("leaderboard");

  // Auth Modes: login | signup | verify_otp | forgot_password
  const [authMode, setAuthMode] = useState<"login" | "signup" | "verify_otp" | "forgot_password">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  // Friends Data
  const [myDbProfile, setMyDbProfile] = useState<DbProfile | null>(null);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<DbProfile[]>([]);
  const [inputCode, setInputCode] = useState("");
  const [addMsg, setAddMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  // 1. Initial Session Load
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) {
        const u = data.session.user;
        const name = u.user_metadata?.name || profile?.name || u.email?.split("@")[0] || "Friend";
        setAuthUser({ id: u.id, email: u.email || "", name });
        loadData(u);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const u = session.user;
        const name = u.user_metadata?.name || profile?.name || u.email?.split("@")[0] || "Friend";
        setAuthUser({ id: u.id, email: u.email || "", name });
        loadData(u);
      } else {
        // Only reset if user explicitly signed out
        if (_event === "SIGNED_OUT") {
          setAuthUser(null);
        }
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // 2. Load and sync user data
  const loadData = async (u: User | { id: string; email?: string }) => {
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

    await syncStatsToCloud(u, profile?.name || "", prayers, items, st);

    const [p, fr, lb] = await Promise.all([
      getMyProfile(u),
      getFriendsList(u.id),
      getLeaderboard(u.id),
    ]);

    setMyDbProfile(p);
    if (p.friend_code) {
      setUserFriendCode(p.friend_code);
    }
    setFriends(fr);
    setLeaderboard(lb);
  };

  useEffect(() => {
    if (authUser) {
      loadData(authUser);
    }
  }, [authUser?.id]);

  // Handle Login & Signup Submit
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAuthBusy(true);
    setAuthError("");
    setAuthSuccess("");

    try {
      if (authMode === "signup") {
        if (!password.trim()) throw new Error("পাসওয়ার্ড দিন (Password required)");
        const displayName = nameInput.trim() || profile?.name || "Muslim Friend";
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            data: { name: displayName },
          },
        });
        if (error) throw error;

        // If email confirmation OTP is needed
        if (data.user && !data.session) {
          setAuthMode("verify_otp");
          setAuthSuccess(`আপনার ইমেইলে (${email}) একটি ভেরিফিকেশন কোড পাঠানো হয়েছে। কোডটি নিচে দিন।`);
          return;
        }

        if (data.user) {
          setAuthUser({
            id: data.user.id,
            email: data.user.email || "",
            name: displayName,
          });
          setAuthSuccess("অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে!");
        }
      } else if (authMode === "login") {
        if (!password.trim()) throw new Error("পাসওয়ার্ড দিন (Password required)");
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });

        if (error) {
          if (error.message.toLowerCase().includes("email not confirmed")) {
            setAuthMode("verify_otp");
            setAuthError("আপনার ইমেইল এখনও নিশ্চিত করা হয়নি। ইমেইলের কোডটি নিচে দিন।");
            return;
          }
          throw error;
        }

        if (data.user) {
          const displayName = data.user.user_metadata?.name || data.user.email?.split("@")[0] || "Friend";
          setAuthUser({
            id: data.user.id,
            email: data.user.email || "",
            name: displayName,
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setAuthError(msg);
    } finally {
      setAuthBusy(false);
    }
  };

  // Handle OTP Verification for Signup
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;
    setAuthBusy(true);
    setAuthError("");
    setAuthSuccess("");

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: "signup",
      });

      if (error) {
        // Try email recovery type if signup failed
        const res2 = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: otpCode.trim(),
          type: "recovery",
        });
        if (res2.error) throw error;
        if (res2.data.user) {
          setAuthUser({
            id: res2.data.user.id,
            email: res2.data.user.email || "",
            name: res2.data.user.user_metadata?.name || "Friend",
          });
          setAuthSuccess("ইমেইল সফলভাবে নিশ্চিত করা হয়েছে!");
          return;
        }
      }

      if (data.user) {
        setAuthUser({
          id: data.user.id,
          email: data.user.email || "",
          name: data.user.user_metadata?.name || "Friend",
        });
        setAuthSuccess("ইমেইল সফলভাবে নিশ্চিত করা হয়েছে!");
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "ভেরিফিকেশন কোডটি সঠিক নয়");
    } finally {
      setAuthBusy(false);
    }
  };

  // Handle Forgot Password
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAuthBusy(true);
    setAuthError("");
    setAuthSuccess("");

    try {
      if (!otpCode.trim()) {
        // Step 1: Send recovery email
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
        setAuthSuccess("আপনার ইমেইলে পাসওয়ার্ড রিসেট কোড পাঠানো হয়েছে! কোড ও নতুন পাসওয়ার্ড দিন।");
      } else {
        // Step 2: Verify OTP and update password
        if (!newPassword.trim()) throw new Error("নতুন পাসওয়ার্ড দিন");
        const { error: otpErr } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: otpCode.trim(),
          type: "recovery",
        });
        if (otpErr) throw otpErr;

        const { data, error: upErr } = await supabase.auth.updateUser({
          password: newPassword.trim(),
        });
        if (upErr) throw upErr;

        if (data.user) {
          setAuthUser({
            id: data.user.id,
            email: data.user.email || "",
            name: data.user.user_metadata?.name || "Friend",
          });
          setAuthSuccess("পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!");
        }
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "পাসওয়ার্ড রিসেট ব্যর্থ হয়েছে");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || !inputCode.trim()) return;
    const res = await sendFriendRequest(authUser.id, inputCode.trim());
    setAddMsg({ text: res.message, ok: res.success });
    if (res.success) {
      setInputCode("");
      loadData(authUser);
    }
  };

  const currentFriendCode = myDbProfile?.friend_code || userFriendCode;

  const copyFriendCode = () => {
    if (!currentFriendCode) return;
    navigator.clipboard.writeText(currentFriendCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareFriendCode = () => {
    if (!currentFriendCode) return;
    const shareText = `আসসালামু আলাইকুম! নূর হ্যাবিট অ্যাপে আমার সাথে যুক্ত হতে আমার ফ্রেন্ড কোড ব্যবহার করুন: ${currentFriendCode}`;
    if (navigator.share) {
      navigator.share({ title: "Noor Habit Friend Code", text: shareText }).catch(() => {});
    } else {
      copyFriendCode();
    }
  };

  // If Not Authenticated -> Show Auth Forms
  if (!authUser) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-3xl font-bold">{t("friends")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("authNote")}</p>
        </header>

        <div className="glass mx-auto w-full max-w-md p-6">
          {authMode !== "verify_otp" && authMode !== "forgot_password" && (
            <div className="mb-6 flex gap-2">
              <button
                onClick={() => { setAuthMode("login"); setAuthError(""); setAuthSuccess(""); }}
                className={cn("flex-1 rounded-xl py-2 font-medium transition", authMode === "login" ? "glow-on" : "bg-secondary")}
              >
                {t("login")}
              </button>
              <button
                onClick={() => { setAuthMode("signup"); setAuthError(""); setAuthSuccess(""); }}
                className={cn("flex-1 rounded-xl py-2 font-medium transition", authMode === "signup" ? "glow-on" : "bg-secondary")}
              >
                {t("signup")}
              </button>
            </div>
          )}

          {authError && (
            <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {authError}
            </div>
          )}
          {authSuccess && (
            <div className="mb-4 rounded-xl border border-success/30 bg-success/10 p-3 text-xs text-success">
              {authSuccess}
            </div>
          )}

          {/* MODE: LOGIN or SIGNUP */}
          {(authMode === "login" || authMode === "signup") && (
            <form onSubmit={handleAuth} className="flex flex-col gap-4">
              {authMode === "signup" && (
                <div>
                  <label className="text-xs text-muted-foreground">{t("name")}</label>
                  <input
                    type="text"
                    required
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder={profile?.name || "আপনার নাম"}
                    className="input mt-1"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground">{t("email")}</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@mail.com"
                  className="input mt-1"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">{t("password")}</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input mt-1"
                />
              </div>

              {authMode === "login" && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setAuthMode("forgot_password"); setAuthError(""); setAuthSuccess(""); }}
                    className="text-xs text-primary hover:underline"
                  >
                    পাসওয়ার্ড ভুলে গেছেন? (Forgot Password?)
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={authBusy}
                className="mt-2 rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50 transition"
              >
                {authBusy ? "অপেক্ষা করুন..." : authMode === "signup" ? t("createAccount") : t("login")}
              </button>
            </form>
          )}

          {/* MODE: VERIFY OTP CODE */}
          {authMode === "verify_otp" && (
            <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <h2 className="text-base font-semibold">ইমেইল ভেরিফিকেশন কোড</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                আপনার ইমেইলে পাঠানো ৬ ডিজিটের কোডটি দিন।
              </p>

              <div>
                <label className="text-xs text-muted-foreground">ভেরিফিকেশন কোড (OTP Token)</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  className="input mt-1 text-center text-xl font-bold tracking-widest"
                />
              </div>

              <button
                type="submit"
                disabled={authBusy || !otpCode.trim()}
                className="rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50 transition"
              >
                {authBusy ? "যাচাই করা হচ্ছে..." : "কোড নিশ্চিত করুন ও প্রবেশ করুন"}
              </button>

              <button
                type="button"
                onClick={() => {
                  supabase.auth.resend({ type: "signup", email: email.trim() });
                  setAuthSuccess("নতুন ভেরিফিকেশন কোড পাঠানো হয়েছে!");
                }}
                className="text-xs text-center text-primary hover:underline"
              >
                কোড পাননি? পুনরায় কোড পাঠান
              </button>
            </form>
          )}

          {/* MODE: FORGOT PASSWORD */}
          {authMode === "forgot_password" && (
            <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <h2 className="text-base font-semibold">পাসওয়ার্ড পুনরুদ্ধার</h2>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">{t("email")}</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@mail.com"
                  className="input mt-1"
                />
              </div>

              {authSuccess && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground">ইমেইলের ৬ ডিজিট কোড</label>
                    <input
                      type="text"
                      required
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="123456"
                      className="input mt-1 text-center font-bold tracking-widest"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">নতুন পাসওয়ার্ড</label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="input mt-1"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={authBusy}
                className="rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50 transition"
              >
                {authBusy
                  ? "অপেক্ষা করুন..."
                  : authSuccess
                  ? "পাসওয়ার্ড নিশ্চিত করুন ও লগইন করুন"
                  : "ভেরিফিকেশন কোড পাঠান"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Authenticated Friends & Leaderboard Dashboard
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("friends")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {authUser.name} ({authUser.email})
          </p>
        </div>
        <button
          onClick={handleLogout}
          title="লগআউট"
          className="flex items-center gap-1.5 rounded-xl border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition"
        >
          <LogOut className="size-3.5" />
          {t("logout")}
        </button>
      </header>

      {/* UNIQUE FRIEND CODE CARD */}
      <section className="glass relative overflow-hidden p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" />
              আপনার অনন্য ফ্রেন্ড কোড (Your Unique Code)
            </span>
            <div className="mt-2 flex items-center gap-3">
              <span className="font-mono text-2xl sm:text-3xl font-extrabold tracking-wider text-foreground select-all">
                {currentFriendCode}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              বন্ধুদের এই কোডটি দিন। তারা আপনাকে ফ্রেন্ড লিস্টে যুক্ত করতে পারবে।
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyFriendCode}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow transition hover:opacity-90"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "কপি হয়েছে!" : "কোড কপি"}
            </button>
            <button
              onClick={shareFriendCode}
              className="flex items-center gap-1.5 rounded-xl bg-secondary px-3.5 py-2.5 text-xs font-semibold text-secondary-foreground hover:bg-muted transition"
            >
              <Share2 className="size-4" />
              শেয়ার
            </button>
          </div>
        </div>
      </section>

      {/* TABS */}
      <div className="glass flex p-1.5">
        <button
          onClick={() => setTab("leaderboard")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition",
            tab === "leaderboard" ? "glow-on" : "text-muted-foreground"
          )}
        >
          <Trophy className="size-4" />
          {t("leaderboard")}
        </button>
        <button
          onClick={() => setTab("friends")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition",
            tab === "friends" ? "glow-on" : "text-muted-foreground"
          )}
        >
          <Users className="size-4" />
          {t("myFriends")} ({friends.length})
        </button>
        <button
          onClick={() => setTab("add")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition",
            tab === "add" ? "glow-on" : "text-muted-foreground"
          )}
        >
          <UserPlus className="size-4" />
          {t("addFriend")}
        </button>
      </div>

      {/* TAB CONTENT: LEADERBOARD */}
      {tab === "leaderboard" && (
        <section className="flex flex-col gap-3">
          {leaderboard.length === 0 ? (
            <div className="glass p-8 text-center text-sm text-muted-foreground">
              <Trophy className="mx-auto mb-2 size-8 text-warning/60" />
              <p>লিডারবোর্ডে এখনও কোনো স্কোর নেই। নামাজ ও অভ্যাস পূরণ করে সবার আগে থাকুন!</p>
            </div>
          ) : (
            leaderboard.map((item, idx) => {
              const isMe = item.id === authUser.id;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "glass flex items-center justify-between p-4 transition",
                    isMe && "border-primary/40 bg-primary/5"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "grid size-7 place-items-center rounded-full text-xs font-bold",
                        idx === 0
                          ? "bg-warning text-warning-foreground"
                          : idx === 1
                          ? "bg-muted text-foreground"
                          : idx === 2
                          ? "bg-orange-500/20 text-orange-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">
                          {item.name} {isMe && "(আপনি)"}
                        </span>
                        {isMe && (
                          <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                            Me
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        আজকে নামাজ: {item.prayed_today}/৫
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 font-bold text-warning text-sm">
                    <Flame className="size-4 fill-warning" />
                    <span>{item.streak} দিন</span>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

      {/* TAB CONTENT: MY FRIENDS */}
      {tab === "friends" && (
        <section className="flex flex-col gap-3">
          {friends.length === 0 ? (
            <div className="glass p-8 text-center text-sm text-muted-foreground">
              <Users className="mx-auto mb-2 size-8 opacity-40" />
              <p>আপনার তালিকায় এখনও কোনো বন্ধু নেই।</p>
              <button
                onClick={() => setTab("add")}
                className="mt-3 inline-flex items-center gap-1 text-xs text-primary underline"
              >
                বন্ধুর কোড দিয়ে যুক্ত করুন
              </button>
            </div>
          ) : (
            friends.map((fr) => (
              <div key={fr.friendship_id} className="glass flex items-center justify-between p-4">
                <div>
                  <h3 className="font-semibold text-sm">{fr.name}</h3>
                  <p className="text-xs text-muted-foreground font-mono">{fr.friend_code}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    আজকের নামাজ: {fr.prayed_today}/৫ • অভ্যাস: {fr.habits_today}টি
                  </p>
                </div>
                <div className="flex items-center gap-1 text-sm font-bold text-warning">
                  <Flame className="size-4 fill-warning" />
                  <span>{fr.streak} দিন</span>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* TAB CONTENT: ADD FRIEND */}
      {tab === "add" && (
        <section className="glass p-6">
          <h2 className="text-lg font-bold">বন্ধুর কোড দিয়ে যুক্ত করুন</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            আপনার বন্ধুর Noor Habit প্রোফাইলের ৬ ডিজিটের ফ্রেন্ড কোডটি লিখুন।
          </p>

          <form onSubmit={handleAddFriend} className="mt-4 flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              required
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              placeholder="NOOR-XXXXXX"
              className="input flex-1 font-mono text-base uppercase tracking-wider"
            />
            <button
              type="submit"
              className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90 transition shrink-0"
            >
              যুক্ত করুন
            </button>
          </form>

          {addMsg && (
            <p className={cn("mt-3 text-xs font-medium", addMsg.ok ? "text-success" : "text-destructive")}>
              {addMsg.text}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
