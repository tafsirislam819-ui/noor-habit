import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Trophy,
  Users,
  UserPlus,
  UserCheck,
  Copy,
  Check,
  LogOut,
  Flame,
  Sparkles,
  Share2,
  Mail,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import {
  supabase,
  getMyProfile,
  getFriendsList,
  getLeaderboard,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
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
  const { profile, prayers, items, authUser, setAuthUser, userFriendCode, setUserFriendCode, lang } = useApp();
  const isBn = lang === "bn";

  const [tab, setTab] = useState<"leaderboard" | "friends" | "requests" | "add">("leaderboard");

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
  const [relationships, setRelationships] = useState<FriendEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<DbProfile[]>([]);
  const [inputCode, setInputCode] = useState("");
  const [addMsg, setAddMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

    const [p, allRel, lb] = await Promise.all([
      getMyProfile(u),
      getFriendsList(u.id),
      getLeaderboard(u.id),
    ]);

    setMyDbProfile(p);
    if (p.friend_code) {
      setUserFriendCode(p.friend_code);
    }
    setRelationships(allRel);
    setLeaderboard(lb);
  };

  useEffect(() => {
    if (authUser) {
      loadData(authUser);
    }
  }, [authUser?.id]);

  // Filter accepted friends and requests
  const acceptedFriends = useMemo(() => {
    return relationships.filter((r) => r.status === "accepted");
  }, [relationships]);

  const incomingRequests = useMemo(() => {
    return relationships.filter((r) => r.status === "pending" && !r.is_sender);
  }, [relationships]);

  const outgoingRequests = useMemo(() => {
    return relationships.filter((r) => r.status === "pending" && r.is_sender);
  }, [relationships]);

  // Handle Login & Signup Submit
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAuthBusy(true);
    setAuthError("");
    setAuthSuccess("");

    try {
      if (authMode === "signup") {
        if (!password.trim()) throw new Error(isBn ? "পাসওয়ার্ড দিন" : "Password is required");
        const displayName = nameInput.trim() || profile?.name || "Muslim Friend";
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            data: { name: displayName },
          },
        });
        if (error) throw error;

        if (data.user && !data.session) {
          setAuthMode("verify_otp");
          setAuthSuccess(
            isBn
              ? `আপনার ইমেইলে (${email}) একটি ভেরিফিকেশন কোড পাঠানো হয়েছে। কোডটি নিচে দিন।`
              : `A verification code was sent to ${email}. Please enter the code below.`
          );
          return;
        }

        if (data.user) {
          setAuthUser({
            id: data.user.id,
            email: data.user.email || "",
            name: displayName,
          });
          setAuthSuccess(isBn ? "অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে!" : "Account successfully created!");
        }
      } else if (authMode === "login") {
        if (!password.trim()) throw new Error(isBn ? "পাসওয়ার্ড দিন" : "Password is required");
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });

        if (error) {
          if (error.message.toLowerCase().includes("email not confirmed")) {
            setAuthMode("verify_otp");
            setAuthError(
              isBn
                ? "আপনার ইমেইল এখনও নিশ্চিত করা হয়নি। ইমেইলের কোডটি নিচে দিন।"
                : "Your email is not confirmed yet. Enter the OTP code sent to your email."
            );
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
          setAuthSuccess(isBn ? "ইমেইল সফলভাবে নিশ্চিত করা হয়েছে!" : "Email successfully verified!");
          return;
        }
      }

      if (data.user) {
        setAuthUser({
          id: data.user.id,
          email: data.user.email || "",
          name: data.user.user_metadata?.name || "Friend",
        });
        setAuthSuccess(isBn ? "ইমেইল সফলভাবে নিশ্চিত করা হয়েছে!" : "Email successfully verified!");
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : isBn ? "ভেরিফিকেশন কোডটি সঠিক নয়" : "Invalid code");
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
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
        setAuthSuccess(
          isBn
            ? "আপনার ইমেইলে পাসওয়ার্ড রিসেট কোড পাঠানো হয়েছে! কোড ও নতুন পাসওয়ার্ড দিন।"
            : "Password reset code sent to your email! Enter the code and your new password."
        );
      } else {
        if (!newPassword.trim()) throw new Error(isBn ? "নতুন পাসওয়ার্ড দিন" : "Enter new password");
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
          setAuthSuccess(isBn ? "পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!" : "Password successfully updated!");
        }
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : isBn ? "পাসওয়ার্ড রিসেট ব্যর্থ হয়েছে" : "Reset failed");
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

  const handleAcceptRequest = async (relId: string) => {
    if (!authUser) return;
    setActionBusyId(relId);
    await acceptFriendRequest(relId);
    await loadData(authUser);
    setActionBusyId(null);
  };

  const handleRejectRequest = async (relId: string) => {
    if (!authUser) return;
    setActionBusyId(relId);
    await rejectFriendRequest(relId);
    await loadData(authUser);
    setActionBusyId(null);
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
    const shareText = isBn
      ? `আসসালামু আলাইকুম! নূর হ্যাবিট অ্যাপে আমার সাথে যুক্ত হতে আমার ফ্রেন্ড কোড ব্যবহার করুন: ${currentFriendCode}`
      : `Assalamu alaikum! Connect with me on Noor Habit using my friend code: ${currentFriendCode}`;
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
                    placeholder={profile?.name || (isBn ? "আপনার নাম" : "Your Name")}
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
                    {isBn ? "পাসওয়ার্ড ভুলে গেছেন?" : "Forgot Password?"}
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={authBusy}
                className="mt-2 rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50 transition"
              >
                {authBusy ? (isBn ? "অপেক্ষা করুন..." : "Please wait...") : authMode === "signup" ? t("createAccount") : t("login")}
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
                <h2 className="text-base font-semibold">
                  {isBn ? "ইমেইল ভেরিফিকেশন কোড" : "Email Verification Code"}
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                {isBn ? "আপনার ইমেইলে পাঠানো ৬ ডিজিটের কোডটি দিন।" : "Enter the 6-digit code sent to your email."}
              </p>

              <div>
                <label className="text-xs text-muted-foreground">{isBn ? "ভেরিফিকেশন কোড" : "Verification Code"}</label>
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
                {authBusy ? (isBn ? "যাচাই করা হচ্ছে..." : "Verifying...") : isBn ? "কোড নিশ্চিত করুন ও প্রবেশ করুন" : "Confirm Code & Continue"}
              </button>

              <button
                type="button"
                onClick={() => {
                  supabase.auth.resend({ type: "signup", email: email.trim() });
                  setAuthSuccess(isBn ? "নতুন ভেরিফিকেশন কোড পাঠানো হয়েছে!" : "New verification code sent!");
                }}
                className="text-xs text-center text-primary hover:underline"
              >
                {isBn ? "কোড পাননি? পুনরায় কোড পাঠান" : "Didn't receive code? Resend"}
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
                <h2 className="text-base font-semibold">{isBn ? "পাসওয়ার্ড পুনরুদ্ধার" : "Reset Password"}</h2>
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
                    <label className="text-xs text-muted-foreground">{isBn ? "ইমেইলের ৬ ডিজিট কোড" : "6-digit OTP from email"}</label>
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
                    <label className="text-xs text-muted-foreground">{isBn ? "নতুন পাসওয়ার্ড" : "New Password"}</label>
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
                  ? (isBn ? "অপেক্ষা করুন..." : "Please wait...")
                  : authSuccess
                  ? (isBn ? "পাসওয়ার্ড নিশ্চিত করুন ও লগইন করুন" : "Confirm Password & Login")
                  : (isBn ? "ভেরিফিকেশন কোড পাঠান" : "Send Verification Code")}
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
          title={isBn ? "লগআউট" : "Logout"}
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
              {isBn ? "আপনার অনন্য ফ্রেন্ড কোড (Your Unique Code)" : "Your Unique Friend Code"}
            </span>
            <div className="mt-2 flex items-center gap-3">
              <span className="font-mono text-2xl sm:text-3xl font-extrabold tracking-wider text-foreground select-all">
                {currentFriendCode}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isBn
                ? "বন্ধুদের এই কোডটি দিন। তারা ফ্রেন্ড রিকোয়েস্ট পাঠাতে পারবে।"
                : "Give this code to friends. They can send you a friend request."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyFriendCode}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow transition hover:opacity-90"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? (isBn ? "কপি হয়েছে!" : "Copied!") : isBn ? "কোড কপি" : "Copy Code"}
            </button>
            <button
              onClick={shareFriendCode}
              className="flex items-center gap-1.5 rounded-xl bg-secondary px-3.5 py-2.5 text-xs font-semibold text-secondary-foreground hover:bg-muted transition"
            >
              <Share2 className="size-4" />
              {isBn ? "শেয়ার" : "Share"}
            </button>
          </div>
        </div>
      </section>

      {/* TABS (LEADERBOARD, FRIENDS, REQUESTS, ADD FRIEND) */}
      <div className="glass flex p-1.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setTab("leaderboard")}
          className={cn(
            "flex flex-1 min-w-[7rem] items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition",
            tab === "leaderboard" ? "glow-on" : "text-muted-foreground"
          )}
        >
          <Trophy className="size-4" />
          {t("leaderboard")}
        </button>

        <button
          onClick={() => setTab("friends")}
          className={cn(
            "flex flex-1 min-w-[7rem] items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition",
            tab === "friends" ? "glow-on" : "text-muted-foreground"
          )}
        >
          <Users className="size-4" />
          {isBn ? `বন্ধুরা (${acceptedFriends.length})` : `Friends (${acceptedFriends.length})`}
        </button>

        <button
          onClick={() => setTab("requests")}
          className={cn(
            "relative flex flex-1 min-w-[7.5rem] items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition",
            tab === "requests" ? "glow-on" : "text-muted-foreground"
          )}
        >
          <UserCheck className="size-4" />
          <span>{isBn ? "রিকোয়েস্ট" : "Requests"}</span>
          {incomingRequests.length > 0 && (
            <span className="grid size-4 place-items-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {incomingRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setTab("add")}
          className={cn(
            "flex flex-1 min-w-[7rem] items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition",
            tab === "add" ? "glow-on" : "text-muted-foreground"
          )}
        >
          <UserPlus className="size-4" />
          {t("addFriend")}
        </button>
      </div>

      {/* TAB CONTENT: LEADERBOARD (ONLY ACCEPTED FRIENDS + CURRENT USER) */}
      {tab === "leaderboard" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>{isBn ? "🏆 শুধুমাত্র আপনার ও ফ্রেন্ডদের র‍্যাংকিং" : "🏆 Ranking for you and your accepted friends"}</span>
            <span>{isBn ? `মোট: ${leaderboard.length} জন` : `Total: ${leaderboard.length}`}</span>
          </div>

          {leaderboard.length === 0 ? (
            <div className="glass p-8 text-center text-sm text-muted-foreground">
              <Trophy className="mx-auto mb-2 size-8 text-warning/60" />
              <p>
                {isBn
                  ? "লিডারবোর্ডে এখনও কোনো স্কোর নেই। নামাজ ও অভ্যাস পূরণ করে সবার আগে থাকুন!"
                  : "No scores on leaderboard yet. Complete prayers and habits to take the lead!"}
              </p>
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
                          {item.name} {isMe && (isBn ? "(আপনি)" : "(You)")}
                        </span>
                        {isMe && (
                          <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                            Me
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {isBn ? `আজকে নামাজ: ${item.prayed_today}/৫` : `Prayers today: ${item.prayed_today}/5`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <div className="flex items-center justify-end gap-1 font-bold text-warning">
                        <Flame className="size-4 fill-warning" />
                        <span>{item.streak}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{t("streak")}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

      {/* TAB CONTENT: MY FRIENDS (ACCEPTED ONLY) */}
      {tab === "friends" && (
        <section className="flex flex-col gap-3">
          {acceptedFriends.length === 0 ? (
            <div className="glass p-8 text-center text-sm text-muted-foreground">
              <Users className="mx-auto mb-2 size-8 text-muted-foreground/60" />
              <p>{isBn ? "এখনও কোনো ফ্রেন্ড যুক্ত করেননি।" : "You have not added any friends yet."}</p>
              <button
                onClick={() => setTab("add")}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
              >
                <UserPlus className="size-4" />
                {t("addFriend")}
              </button>
            </div>
          ) : (
            acceptedFriends.map((f) => (
              <div key={f.friendship_id} className="glass flex items-center justify-between p-4">
                <div>
                  <p className="font-semibold text-sm text-foreground">{f.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {isBn ? "কোড:" : "Code:"} <span className="font-mono">{f.friend_code}</span> • {isBn ? `নামাজ: ${f.prayed_today}/৫` : `Prayers: ${f.prayed_today}/5`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 font-bold text-warning text-xs">
                    <Flame className="size-4 fill-warning" />
                    <span>{f.streak}</span>
                  </div>
                  <button
                    disabled={actionBusyId === f.friendship_id}
                    onClick={() => handleRejectRequest(f.friendship_id)}
                    className="ml-2 text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded transition"
                    title={isBn ? "আনফ্রেন্ড" : "Unfriend"}
                  >
                    {isBn ? "আনফ্রেন্ড" : "Remove"}
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* TAB CONTENT: REQUESTS (FACEBOOK STYLE INCOMING & OUTGOING) */}
      {tab === "requests" && (
        <section className="flex flex-col gap-5">
          {/* Incoming Requests */}
          <div>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <UserCheck className="size-4 text-primary" />
              {isBn ? `ইনকামিং ফ্রেন্ড রিকোয়েস্ট (${incomingRequests.length})` : `Incoming Requests (${incomingRequests.length})`}
            </h3>

            {incomingRequests.length === 0 ? (
              <div className="glass p-5 text-center text-xs text-muted-foreground">
                {isBn ? "কোনো নতুন ফ্রেন্ড রিকোয়েস্ট নেই।" : "No pending incoming requests."}
              </div>
            ) : (
              <div className="space-y-2">
                {incomingRequests.map((req) => (
                  <div key={req.friendship_id} className="glass flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-semibold text-sm">{req.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {isBn ? "ফ্রেন্ড কোড:" : "Friend code:"} <span className="font-mono">{req.friend_code}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        disabled={actionBusyId === req.friendship_id}
                        onClick={() => handleAcceptRequest(req.friendship_id)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                      >
                        <CheckCircle2 className="size-3.5" />
                        {isBn ? "গ্রহণ করুন (Accept)" : "Accept"}
                      </button>
                      <button
                        disabled={actionBusyId === req.friendship_id}
                        onClick={() => handleRejectRequest(req.friendship_id)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1 rounded-xl bg-destructive/10 border border-destructive/30 px-3.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition disabled:opacity-50"
                      >
                        <XCircle className="size-3.5" />
                        {isBn ? "বাতিল (Decline)" : "Decline"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outgoing Requests */}
          {outgoingRequests.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock className="size-4 text-warning" />
                {isBn ? `পাঠানো রিকোয়েস্ট (${outgoingRequests.length})` : `Sent Requests (${outgoingRequests.length})`}
              </h3>
              <div className="space-y-2">
                {outgoingRequests.map((req) => (
                  <div key={req.friendship_id} className="glass flex items-center justify-between p-3.5">
                    <div>
                      <p className="font-semibold text-xs text-foreground">{req.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{req.friend_code}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">
                        {isBn ? "অপেক্ষমাণ (Pending)" : "Pending"}
                      </span>
                      <button
                        onClick={() => handleRejectRequest(req.friendship_id)}
                        className="text-xs text-muted-foreground hover:text-destructive p-1"
                        title={isBn ? "রিকোয়েস্ট বাতিল" : "Cancel Request"}
                      >
                        <XCircle className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB CONTENT: ADD FRIEND */}
      {tab === "add" && (
        <section className="glass p-5">
          <h2 className="text-base font-bold">{t("enterFriendCode")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isBn
              ? "বন্ধুর ৬ ডিজিটের কোড দিয়ে রিকোয়েস্ট পাঠান। তিনি গ্রহণ করলেই আপনারা বন্ধু তালিকায় যুক্ত হবেন।"
              : "Enter your friend's 6-character code to send a friend request. Once they accept, you'll be connected."}
          </p>

          <form onSubmit={handleAddFriend} className="mt-4 flex flex-col gap-3">
            <input
              type="text"
              maxLength={6}
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              placeholder={t("friendCodePlaceholder")}
              className="input font-mono text-center text-lg uppercase tracking-widest font-bold"
            />
            <button
              type="submit"
              disabled={!inputCode.trim()}
              className="rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-40 transition"
            >
              {isBn ? "ফ্রেন্ড রিকোয়েস্ট পাঠান (Send Request)" : "Send Friend Request"}
            </button>
          </form>

          {addMsg && (
            <div
              className={cn(
                "mt-4 rounded-xl border p-3 text-xs leading-relaxed",
                addMsg.ok
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              )}
            >
              {addMsg.text}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
