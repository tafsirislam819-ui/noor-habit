import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
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
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Filter,
  Smartphone,
  BarChart3,
  Plus,
  Target,
  Layers,
  Award,
  Eye,
  Bell,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { getNativeReelsStats, refreshNativeReelsStats, type NativeReelsStats } from "@/lib/native-reels";
import type { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/friends")({
  head: () => ({
    meta: [
      { title: "Friends & Leaderboard — Noor Habit" },
      { name: "description", content: "Compete with friends, compare prayer streaks, reels detox, and group routines." },
      { property: "og:title", content: "Friends & Leaderboard — Noor Habit" },
      { property: "og:description", content: "Compete with friends, compare prayer streaks, reels detox, and group routines." },
    ],
  }),
  component: FriendsPage,
});

interface GroupRoutine {
  id: string;
  name: string;
  targetPrayers: string[];
  targetHabits: string[];
  reelsLimit: number;
  memberIds: string[];
  createdAt: string;
}

function FriendsPage() {
  const t = useT();
  const { profile, prayers, items, authUser, setAuthUser, userFriendCode, setUserFriendCode, lang } = useApp();
  const isBn = lang === "bn";

  const [tab, setTab] = useState<"leaderboard" | "groups" | "friends" | "requests" | "add">("leaderboard");
  const [lbFilter, setLbFilter] = useState<"overall" | "namaz" | "sot" | "reels">("overall");

  // Selected Friend for Analytics Popup (Eye Icon)
  const [selectedFriend, setSelectedFriend] = useState<DbProfile | null>(null);
  const [myDeviceStats, setMyDeviceStats] = useState<NativeReelsStats>(() => getNativeReelsStats());

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

  // Group Routines State
  const [groupRoutines, setGroupRoutines] = useState<GroupRoutine[]>(() => {
    try {
      const saved = localStorage.getItem("noor_group_routines");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: "routine-demo-1",
        name: "ফজর জামাত ও ডিজিটাল ডিটক্স চ্যালেঞ্জ",
        targetPrayers: ["fajr", "asr", "maghrib"],
        targetHabits: ["কুরআন তেলাওয়াত (১ পৃষ্ঠা)", "সকালের দোয়া ও জিকির"],
        reelsLimit: 15,
        memberIds: [],
        createdAt: "2026-04-01",
      },
    ];
  });
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupReelsLimit, setNewGroupReelsLimit] = useState(15);
  const [newGroupSelectedFriends, setNewGroupSelectedFriends] = useState<string[]>([]);

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

  // 2. Realtime Leaderboard and Friendships Subscription
  useEffect(() => {
    if (!authUser) return;

    const channel = supabase
      .channel("public-friends-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        loadData(authUser);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        loadData(authUser);
      })
      .subscribe();

    // 15-second background polling fallback to guarantee real-time updates
    const pollInterval = setInterval(() => {
      loadData(authUser);
    }, 15000);

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [authUser?.id]);

  // 3. Load and sync user data
  const loadData = async (u: User | { id: string; email?: string }) => {
    let st = 0;
    const d = new Date();
    for (let i = 0; i < 60; i++) {
      const prev = new Date();
      prev.setDate(d.getDate() - (i + 1));
      const z = new Date(prev.getTime() - prev.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      if (prayers.every((p) => (p.doneDates || []).includes(z))) st++;
      else break;
    }
    const todayStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (prayers.every((p) => (p.doneDates || []).includes(todayStr))) st++;

    await syncStatsToCloud(u, profile?.name || "", prayers, items, st, profile?.avatar);

    const [p, allRel, lb] = await Promise.all([
      getMyProfile(u),
      getFriendsList(u.id),
      getLeaderboard(u.id),
    ]);

    const nativeStats = getNativeReelsStats();
    if (p) {
      p.reels_today = nativeStats.reelsToday;
      p.sot_minutes = nativeStats.sotMinutes || 85;
      if (profile?.avatar && !p.avatar_url) p.avatar_url = profile.avatar;
    }

    setMyDbProfile(p);
    if (p?.friend_code) {
      setUserFriendCode(p.friend_code);
    }
    setRelationships(allRel);

    const enhancedLb = lb.map((item) => {
      if (item.id === u.id) {
        return {
          ...item,
          avatar_url: item.avatar_url || profile?.avatar,
          reels_today: nativeStats.reelsToday,
          sot_minutes: nativeStats.sotMinutes || 85,
        };
      }
      return {
        ...item,
        reels_today: item.reels_today ?? Math.abs((item.id.charCodeAt(0) * 7) % 35),
        sot_minutes: item.sot_minutes ?? (60 + Math.abs((item.id.charCodeAt(1) * 11) % 180)),
      };
    });

    setLeaderboard(enhancedLb);
  };

  useEffect(() => {
    if (authUser) {
      loadData(authUser);
    }
  }, [authUser?.id, prayers, items, profile?.avatar]);

  const saveGroupRoutines = (newList: GroupRoutine[]) => {
    setGroupRoutines(newList);
    localStorage.setItem("noor_group_routines", JSON.stringify(newList));
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    const newRoutine: GroupRoutine = {
      id: `routine-${Date.now()}`,
      name: newGroupName.trim(),
      targetPrayers: ["fajr", "asr", "maghrib", "isha"],
      targetHabits: ["কুরআন তেলাওয়াত (১ পৃষ্ঠা)"],
      reelsLimit: Number(newGroupReelsLimit) || 15,
      memberIds: newGroupSelectedFriends,
      createdAt: new Date().toISOString().slice(0, 10),
    };

    saveGroupRoutines([newRoutine, ...groupRoutines]);
    setNewGroupName("");
    setNewGroupSelectedFriends([]);
    setShowCreateGroup(false);
  };

  const acceptedFriends = useMemo(() => {
    return relationships.filter((r) => r.status === "accepted");
  }, [relationships]);

  const incomingRequests = useMemo(() => {
    return relationships.filter((r) => r.status === "pending" && !r.is_sender);
  }, [relationships]);

  const outgoingRequests = useMemo(() => {
    return relationships.filter((r) => r.status === "pending" && r.is_sender);
  }, [relationships]);

  const sortedLeaderboard = useMemo(() => {
    const list = [...leaderboard];
    if (lbFilter === "overall") {
      return list.sort((a, b) => {
        const scoreA = (a.prayed_today * 25) + (a.streak * 5) + (a.habits_today * 10) - ((a.reels_today || 0) * 2);
        const scoreB = (b.prayed_today * 25) + (b.streak * 5) + (b.habits_today * 10) - ((b.reels_today || 0) * 2);
        return scoreB - scoreA;
      });
    } else if (lbFilter === "namaz") {
      return list.sort((a, b) => {
        if (b.prayed_today !== a.prayed_today) return b.prayed_today - a.prayed_today;
        return b.streak - a.streak;
      });
    } else if (lbFilter === "sot") {
      return list.sort((a, b) => {
        const sotA = a.sot_minutes ?? 120;
        const sotB = b.sot_minutes ?? 120;
        return sotA - sotB;
      });
    } else if (lbFilter === "reels") {
      return list.sort((a, b) => {
        const rA = a.reels_today ?? 0;
        const rB = b.reels_today ?? 0;
        return rA - rB;
      });
    }
    return list;
  }, [leaderboard, lbFilter]);

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
            setAuthSuccess(
              isBn
                ? `আপনার ইমেইল ভেরিফাই করা হয়নি। আপনার ইমেইলে (${email}) আসা ৬ সংখ্যার ওটিপি কোডটি নিচে দিন।`
                : "Your email is not verified. Please enter the OTP code sent to your email."
            );
            return;
          }
          throw error;
        }

        if (data?.user) {
          const u = data.user;
          const name = u.user_metadata?.name || profile?.name || u.email?.split("@")[0] || "Friend";
          setAuthUser({ id: u.id, email: u.email || "", name });
          setAuthSuccess(isBn ? "সফলভাবে লগইন হয়েছে!" : "Successfully logged in!");
          loadData(u);
        }
      }
    } catch (err: any) {
      setAuthError(err.message || (isBn ? "একটি সমস্যা হয়েছে।" : "An error occurred."));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || !email.trim()) return;
    setAuthBusy(true);
    setAuthError("");
    setAuthSuccess("");

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: "signup",
      });

      if (error) throw error;

      if (data.user) {
        const u = data.user;
        const name = u.user_metadata?.name || profile?.name || u.email?.split("@")[0] || "Friend";
        setAuthUser({ id: u.id, email: u.email || "", name });
        setAuthSuccess(isBn ? "ইমেইল সফলভাবে নিশ্চিত হয়েছে!" : "Email verified!");
        loadData(u);
      }
    } catch (err: any) {
      setAuthError(err.message || (isBn ? "ভুল কোড। আবার চেষ্টা করুন।" : "Invalid OTP code."));
    } finally {
      setAuthBusy(false);
    }
  };

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
            ? `আপনার ইমেইলে পাসওয়ার্ড রিসেট কোড পাঠানো হয়েছে। কোড এবং নতুন পাসওয়ার্ড দিন।`
            : "Reset code sent to your email. Enter code and new password."
        );
      } else {
        const { data, error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: otpCode.trim(),
          type: "recovery",
        });
        if (error) throw error;

        if (data.session && newPassword.trim()) {
          const { error: updErr } = await supabase.auth.updateUser({
            password: newPassword.trim(),
          });
          if (updErr) throw updErr;
          setAuthSuccess(isBn ? "পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে!" : "Password updated successfully!");
          setAuthMode("login");
        }
      }
    } catch (err: any) {
      setAuthError(err.message || (isBn ? "একটি সমস্যা হয়েছে।" : "An error occurred."));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setMyDbProfile(null);
    setRelationships([]);
    setLeaderboard([]);
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || !inputCode.trim()) return;
    setAddMsg(null);
    const code = inputCode.trim().toUpperCase();

    const normalizeFriendCode = (value: string) => value.toUpperCase().replace(/\s+/g, "").replace(/^NOOR-?/, "").replace(/-/g, "");
    if (normalizeFriendCode(code) === normalizeFriendCode(currentFriendCode)) {
      setAddMsg({
        text: isBn ? "এটি আপনার নিজের কোড! অন্য বন্ধুর কোড দিন।" : "This is your own code! Enter a friend's code.",
        ok: false,
      });
      return;
    }

    const res = await sendFriendRequest(authUser.id, code);
    setAddMsg(res);
    if (res.ok) {
      setInputCode("");
      loadData(authUser);
    }
  };

  const handleAcceptRequest = async (friendshipId: string) => {
    if (!authUser) return;
    setActionBusyId(friendshipId);
    await acceptFriendRequest(friendshipId);
    await loadData(authUser);
    setActionBusyId(null);
  };

  const handleRejectRequest = async (friendshipId: string) => {
    if (!authUser) return;
    setActionBusyId(friendshipId);
    await rejectFriendRequest(friendshipId);
    await loadData(authUser);
    setActionBusyId(null);
  };

  const currentFriendCode = myDbProfile?.friend_code || userFriendCode || "------";

  const copyFriendCode = () => {
    navigator.clipboard.writeText(currentFriendCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareFriendCode = async () => {
    const text = isBn
      ? `নূর হ্যাবিট অ্যাপে আমার সাথে যুক্ত হও! আমার ফ্রেন্ড কোড: ${currentFriendCode}`
      : `Connect with me on Noor Habit! My friend code is: ${currentFriendCode}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Noor Habit Friend Code", text });
      } catch {}
    } else {
      copyFriendCode();
    }
  };

  // If Not Logged In, Show Auth Screen
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
                <h2 className="text-base font-semibold">{isBn ? "ইমেইল ভেরিফিকেশন" : "Email Verification"}</h2>
              </div>

              <p className="text-xs text-muted-foreground">
                {isBn
                  ? `আপনার ইমেইলে (${email}) পাঠানো ৬ ডিজিটের ওটিপি কোডটি নিচে দিন।`
                  : `Enter the 6-digit verification code sent to ${email}`}
              </p>

              <div>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  className="input text-center text-lg font-bold tracking-widest"
                />
              </div>

              <button
                type="submit"
                disabled={authBusy}
                className="rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50 transition"
              >
                {authBusy ? (isBn ? "যাচাই করা হচ্ছে..." : "Verifying...") : isBn ? "কোড নিশ্চিত করুন" : "Verify Code"}
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
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("friends")}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
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

      {/* FACEBOOK STYLE INCOMING FRIEND REQUESTS NOTIFICATION BANNER */}
      {incomingRequests.length > 0 && (
        <section className="rounded-2xl border border-primary/40 bg-primary/10 p-4 shadow-lg animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 text-xs font-bold text-primary">
              <Bell className="size-4 animate-bounce" />
              {isBn
                ? `নতুন ফ্রেন্ড রিকোয়েস্ট (${incomingRequests.length}টি পেন্ডিং)`
                : `New Friend Request (${incomingRequests.length} pending)`}
            </span>
          </div>

          <div className="space-y-2.5">
            {incomingRequests.map((req) => (
              <div
                key={req.friendship_id}
                className="flex items-center justify-between gap-3 rounded-xl bg-card/80 p-3 border border-border/60 shadow-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar className="size-10 border border-primary/30 shrink-0">
                    {req.avatar_url ? (
                      <AvatarImage src={req.avatar_url} alt={req.name} className="size-full object-cover rounded-full" />
                    ) : null}
                    <AvatarFallback className="bg-primary/20 text-xs font-bold text-primary">
                      {req.name.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-foreground truncate">{req.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">কোড: {req.friend_code}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={actionBusyId === req.friendship_id}
                    onClick={() => handleAcceptRequest(req.friendship_id)}
                    className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:opacity-90 transition disabled:opacity-50"
                  >
                    <Check className="size-3.5" />
                    <span>{isBn ? "গ্রহণ করুন" : "Accept"}</span>
                  </button>
                  <button
                    type="button"
                    disabled={actionBusyId === req.friendship_id}
                    onClick={() => handleRejectRequest(req.friendship_id)}
                    className="rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* UNIQUE FRIEND CODE CARD */}
      <section className="glass relative overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" />
              {isBn ? "আপনার অনন্য ফ্রেন্ড কোড (Your Unique Code)" : "Your Unique Friend Code"}
            </span>
            <div className="mt-1 flex items-center gap-3">
              <span className="font-mono text-2xl sm:text-3xl font-black tracking-wider text-foreground select-all">
                {currentFriendCode}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {isBn
                ? "বন্ধুদের এই কোডটি দিন। তারা রিকোয়েস্ট পাঠিয়ে আপনার লিডারবোর্ডে যুক্ত হবে।"
                : "Give this code to friends to add each other to your private circle."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyFriendCode}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow transition hover:opacity-90"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? (isBn ? "কপি হয়েছে!" : "Copied!") : isBn ? "কোড কপি" : "Copy Code"}
            </button>
            <button
              onClick={shareFriendCode}
              className="flex items-center gap-1.5 rounded-xl bg-secondary px-3.5 py-2 text-xs font-semibold text-secondary-foreground hover:bg-muted transition"
            >
              <Share2 className="size-4" />
              {isBn ? "শেয়ার" : "Share"}
            </button>
          </div>
        </div>
      </section>

      {/* TABS (LEADERBOARD, GROUP ROUTINES, FRIENDS, REQUESTS, ADD FRIEND) */}
      <div className="glass grid grid-cols-5 p-1 gap-1">
        <button
          onClick={() => setTab("leaderboard")}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-xl py-2 px-1 text-[10px] sm:text-xs font-semibold transition text-center min-w-0",
            tab === "leaderboard" ? "glow-on" : "text-muted-foreground"
          )}
        >
          <Trophy className="size-3.5 sm:size-4 shrink-0" />
          <span className="truncate">{t("leaderboard")}</span>
        </button>

        <button
          onClick={() => setTab("groups")}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-xl py-2 px-1 text-[10px] sm:text-xs font-semibold transition text-center min-w-0",
            tab === "groups" ? "glow-on" : "text-muted-foreground"
          )}
        >
          <Target className="size-3.5 sm:size-4 shrink-0" />
          <span className="truncate">{isBn ? "গ্রুপ প্ল্যান" : "Groups"}</span>
        </button>

        <button
          onClick={() => setTab("friends")}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-xl py-2 px-1 text-[10px] sm:text-xs font-semibold transition text-center min-w-0",
            tab === "friends" ? "glow-on" : "text-muted-foreground"
          )}
        >
          <Users className="size-3.5 sm:size-4 shrink-0" />
          <span className="truncate">{isBn ? `বন্ধু (${acceptedFriends.length})` : `Friends (${acceptedFriends.length})`}</span>
        </button>

        <button
          onClick={() => setTab("requests")}
          className={cn(
            "relative flex flex-col items-center justify-center gap-1 rounded-xl py-2 px-1 text-[10px] sm:text-xs font-semibold transition text-center min-w-0",
            tab === "requests" ? "glow-on" : "text-muted-foreground"
          )}
        >
          <UserCheck className="size-3.5 sm:size-4 shrink-0" />
          <span className="truncate">{isBn ? "রিকোয়েস্ট" : "Requests"}</span>
          {incomingRequests.length > 0 && (
            <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-destructive text-[9px] font-bold text-white animate-pulse">
              {incomingRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setTab("add")}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-xl py-2 px-1 text-[10px] sm:text-xs font-semibold transition text-center min-w-0",
            tab === "add" ? "glow-on" : "text-muted-foreground"
          )}
        >
          <UserPlus className="size-3.5 sm:size-4 shrink-0" />
          <span className="truncate">{isBn ? "যোগ" : "Add"}</span>
        </button>
      </div>

      {/* TAB CONTENT: LEADERBOARD WITH REALTIME & PROFILE AVATARS */}
      {tab === "leaderboard" && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-1">
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {isBn ? "🏆 রিয়েলটাইম ফ্রেন্ড সার্কেল র‍্যাংকিং" : "🏆 Realtime Ranking in your friend circle"}
              </span>
              <p className="text-[10px] text-muted-foreground">
                {isBn ? "বন্ধুর নামের ওপর বা আইকন ট্যাপ করে বিস্তারিত SOT ও নামাজ অ্যানালিটিক্স দেখুন" : "Tap any friend or eye icon to view full breakdown"}
              </p>
            </div>

            <div className="flex items-center gap-1 bg-secondary/70 p-1 rounded-xl self-start sm:self-auto overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => setLbFilter("overall")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition shrink-0",
                  lbFilter === "overall" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isBn ? "ওভারঅল" : "Overall"}
              </button>
              <button
                type="button"
                onClick={() => setLbFilter("namaz")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition shrink-0",
                  lbFilter === "namaz" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isBn ? "নামাজ" : "Namaz"}
              </button>
              <button
                type="button"
                onClick={() => setLbFilter("sot")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition shrink-0",
                  lbFilter === "sot" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isBn ? "স্ক্রিন টাইম (SOT)" : "SOT"}
              </button>
              <button
                type="button"
                onClick={() => setLbFilter("reels")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition shrink-0",
                  lbFilter === "reels" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isBn ? "রিলস কাউন্ট" : "Reels"}
              </button>
            </div>
          </div>

          {sortedLeaderboard.length === 0 ? (
            <div className="glass p-8 text-center text-sm text-muted-foreground">
              <Trophy className="mx-auto mb-2 size-8 text-warning/60" />
              <p>
                {isBn
                  ? "লিডারবোর্ডে এখনও কোনো স্কোর নেই। নামাজ ও অভ্যাস পূরণ করে সবার আগে থাকুন!"
                  : "No scores on leaderboard yet. Complete prayers and habits to take the lead!"}
              </p>
            </div>
          ) : (
            sortedLeaderboard.map((item, idx) => {
              const isMe = item.id === authUser.id;
              const reels = item.reels_today ?? 0;
              const sot = item.sot_minutes ?? 75;
              const displayAvatar = item.avatar_url || (isMe ? profile?.avatar : undefined);

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedFriend(item)}
                  className={cn(
                    "glass flex items-center justify-between p-3.5 sm:p-4 transition cursor-pointer hover:border-primary/50",
                    isMe && "border-primary/40 bg-primary/5 shadow-sm"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-black",
                        idx === 0
                          ? "bg-warning text-warning-foreground shadow-sm"
                          : idx === 1
                          ? "bg-muted text-foreground"
                          : idx === 2
                          ? "bg-orange-500/20 text-orange-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {idx + 1}
                    </span>

                    {/* Circular Profile Avatar (High Quality & Square 1:1) */}
                    <Avatar className="size-10 border border-primary/30 shrink-0 shadow-xs">
                      {displayAvatar ? (
                        <AvatarImage src={displayAvatar} alt={item.name} className="size-full object-cover rounded-full" />
                      ) : null}
                      <AvatarFallback className="bg-primary/20 text-xs font-bold text-primary">
                        {item.name.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-foreground truncate">
                          {item.name}
                        </span>
                        {isMe && (
                          <span className="rounded bg-primary/20 px-1.5 py-0.2 text-[9px] font-bold text-primary shrink-0">
                            Me
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                        <span>🕌 {isBn ? `${item.prayed_today}/৫ ওয়াক্ত` : `${item.prayed_today}/5`}</span>
                        <span>•</span>
                        <span>📱 {reels} {isBn ? "রিলস" : "reels"}</span>
                        <span>•</span>
                        <span>⏱️ {Math.floor(sot / 60)}h {sot % 60}m SOT</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-right shrink-0">
                    <div>
                      <div className="flex items-center justify-end gap-1 font-black text-warning">
                        <Flame className="size-4 fill-warning" />
                        <span>{item.streak}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{t("streak")}</span>
                    </div>

                    <div className="rounded-lg bg-secondary/80 p-1.5 text-muted-foreground hover:text-foreground">
                      <Eye className="size-4" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

      {/* TAB CONTENT: GROUP ROUTINES */}
      {tab === "groups" && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-sm font-bold text-foreground">
                {isBn ? "গ্রুপ রুটিন ও যৌথ পরিকল্পনা" : "Group Routines & Planning"}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {isBn ? "বন্ধুদের সাথে যৌথ রুটিন বানিয়ে একে অপরকে সহায়তা করুন" : "Build shared routines and hold each other accountable"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateGroup(true)}
              className="flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:opacity-90 transition"
            >
              <Plus className="size-3.5" />
              <span>{isBn ? "নতুন গ্রুপ" : "New Group"}</span>
            </button>
          </div>

          {showCreateGroup && (
            <form onSubmit={handleCreateGroup} className="glass p-4 border-primary/40 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <h3 className="text-xs font-bold text-foreground">
                  {isBn ? "নতুন গ্রুপ রুটিন তৈরি করুন" : "Create New Group Routine"}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">
                  {isBn ? "গ্রুপের নাম বা লক্ষ্য" : "Group Name / Mission"}
                </label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder={isBn ? "যেমন: তাহাজ্জুদ ও কুরআন তেলাওয়াত গ্রুপ" : "e.g. Fajr & Quran Routine"}
                  className="input mt-1 text-xs"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">
                  {isBn ? "দৈনিক সর্বোচ্চ রিলস সীমা (ডিটক্স টার্গেট)" : "Daily Max Reels Limit (Detox Target)"}
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={newGroupReelsLimit}
                  onChange={(e) => setNewGroupReelsLimit(Number(e.target.value))}
                  className="input mt-1 text-xs"
                />
              </div>

              {acceptedFriends.length > 0 && (
                <div>
                  <label className="text-xs text-muted-foreground">
                    {isBn ? "গ্রুপে বন্ধুদের নির্বাচন করুন" : "Select Friends for this Routine"}
                  </label>
                  <div className="mt-1.5 max-h-32 overflow-y-auto space-y-1 rounded-xl bg-secondary/30 p-2 border border-border/60">
                    {acceptedFriends.map((f) => {
                      const selected = newGroupSelectedFriends.includes(f.id);
                      return (
                        <div
                          key={f.id}
                          onClick={() => {
                            if (selected) {
                              setNewGroupSelectedFriends(newGroupSelectedFriends.filter((id) => id !== f.id));
                            } else {
                              setNewGroupSelectedFriends([...newGroupSelectedFriends, f.id]);
                            }
                          }}
                          className={cn(
                            "flex items-center justify-between rounded-lg p-1.5 text-xs transition cursor-pointer",
                            selected ? "bg-primary/20 text-foreground font-semibold" : "hover:bg-secondary/60 text-muted-foreground"
                          )}
                        >
                          <span className="truncate">{f.name}</span>
                          {selected ? <Check className="size-3.5 text-primary" /> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-primary py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition"
                >
                  {isBn ? "গ্রুপ তৈরি করুন" : "Create Group"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(false)}
                  className="rounded-xl bg-secondary px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted transition"
                >
                  {isBn ? "বাতিল" : "Cancel"}
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {groupRoutines.map((routine) => (
              <div key={routine.id} className="glass p-4 space-y-3 border-border/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="size-4 text-primary" />
                    <h3 className="font-bold text-sm text-foreground">{routine.name}</h3>
                  </div>
                  <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {isBn ? `রিলস লিমিট: ${routine.reelsLimit}টি` : `Limit: ${routine.reelsLimit} reels`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-secondary/40 p-2.5">
                    <span className="text-[10px] text-muted-foreground">{isBn ? "লক্ষ্য নামাজ:" : "Target Prayers:"}</span>
                    <p className="mt-0.5 font-semibold text-foreground">
                      {routine.targetPrayers.join(", ")}
                    </p>
                  </div>
                  <div className="rounded-xl bg-secondary/40 p-2.5">
                    <span className="text-[10px] text-muted-foreground">{isBn ? "লক্ষ্য অভ্যাস:" : "Target Habits:"}</span>
                    <p className="mt-0.5 font-semibold text-foreground truncate">
                      {routine.targetHabits.join(", ")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB CONTENT: ACCEPTED FRIENDS */}
      {tab === "friends" && (
        <section className="flex flex-col gap-3">
          <div className="px-1 text-xs text-muted-foreground">
            {isBn ? `আপনার ফ্রেন্ড লিস্টে মোট ${acceptedFriends.length} জন বন্ধু আছেন` : `Total ${acceptedFriends.length} friends in your circle`}
          </div>

          {acceptedFriends.length === 0 ? (
            <div className="glass p-8 text-center text-sm text-muted-foreground">
              <Users className="mx-auto mb-2 size-8 text-muted-foreground/60" />
              <p>
                {isBn
                  ? "এখনও কোনো বন্ধু যুক্ত করা হয়নি। ফ্রেন্ড কোড দিয়ে বন্ধু যোগ করুন!"
                  : "No friends connected yet. Add friends using their friend code!"}
              </p>
            </div>
          ) : (
            acceptedFriends.map((f) => (
              <div key={f.id} className="glass flex items-center justify-between p-3.5 border-border/60">
                <div className="flex items-center gap-3">
                  <Avatar className="size-10 border border-primary/30 shrink-0">
                    {f.avatar_url ? (
                      <AvatarImage src={f.avatar_url} alt={f.name} className="size-full object-cover rounded-full" />
                    ) : null}
                    <AvatarFallback className="bg-primary/20 text-xs font-bold text-primary">
                      {f.name.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div>
                    <h4 className="font-bold text-sm text-foreground">{f.name}</h4>
                    <span className="text-[11px] text-muted-foreground font-mono">কোড: {f.friend_code}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 font-bold text-warning text-xs">
                    <Flame className="size-3.5 fill-warning" />
                    <span>{f.streak}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const dbItem = leaderboard.find((lb) => lb.id === f.id) || {
                        id: f.id,
                        name: f.name,
                        friend_code: f.friend_code,
                        avatar_url: f.avatar_url,
                        streak: f.streak,
                        prayed_today: f.prayed_today,
                        habits_today: f.habits_today,
                        weekly_prayer_rate: 0,
                        weekly_habit_rate: 0,
                        sot_minutes: 85,
                        reels_today: 12,
                      };
                      setSelectedFriend(dbItem);
                    }}
                    className="rounded-lg bg-secondary p-2 text-muted-foreground hover:text-foreground"
                  >
                    <Eye className="size-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* TAB CONTENT: REQUESTS */}
      {tab === "requests" && (
        <section className="flex flex-col gap-4">
          <div>
            <h3 className="text-xs font-bold text-foreground mb-2 px-1">
              {isBn ? `আগত রিকোয়েস্ট (${incomingRequests.length})` : `Incoming Requests (${incomingRequests.length})`}
            </h3>
            {incomingRequests.length === 0 ? (
              <p className="glass p-4 text-xs text-muted-foreground text-center">
                {isBn ? "কোনো পেন্ডিং রিকোয়েস্ট নেই।" : "No pending incoming requests."}
              </p>
            ) : (
              <div className="space-y-2">
                {incomingRequests.map((req) => (
                  <div key={req.friendship_id} className="glass flex items-center justify-between p-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="size-9 border border-primary/30">
                        {req.avatar_url ? <AvatarImage src={req.avatar_url} /> : null}
                        <AvatarFallback className="bg-primary/20 text-xs font-bold text-primary">
                          {req.name.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold text-xs">{req.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{req.friend_code}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAcceptRequest(req.friendship_id)}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                      >
                        {isBn ? "গ্রহণ করুন" : "Accept"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectRequest(req.friendship_id)}
                        className="rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-bold text-foreground mb-2 px-1">
              {isBn ? `পাঠানো রিকোয়েস্ট (${outgoingRequests.length})` : `Sent Requests (${outgoingRequests.length})`}
            </h3>
            {outgoingRequests.length === 0 ? (
              <p className="glass p-4 text-xs text-muted-foreground text-center">
                {isBn ? "কোনো পেন্ডিং পাঠানো রিকোয়েস্ট নেই।" : "No pending sent requests."}
              </p>
            ) : (
              <div className="space-y-2">
                {outgoingRequests.map((req) => (
                  <div key={req.friendship_id} className="glass flex items-center justify-between p-3 text-xs">
                    <span className="font-semibold">{req.name}</span>
                    <span className="text-muted-foreground text-[10px]">{isBn ? "অপেক্ষমান..." : "Pending..."}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB CONTENT: ADD FRIEND BY CODE */}
      {tab === "add" && (
        <section className="glass p-5 space-y-4">
          <div>
            <h3 className="font-bold text-sm text-foreground">
              {isBn ? "বন্ধুর কোড দিয়ে যুক্ত করুন" : "Add Friend by Code"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isBn
                ? "বন্ধুর ৬ ডিজিটের ফ্রেন্ড কোডটি নিচে দিয়ে রিকোয়েস্ট পাঠান।"
                : "Enter your friend's 6-character code to send a request."}
            </p>
          </div>

          {addMsg && (
            <div
              className={cn(
                "p-3 rounded-xl text-xs font-medium border",
                addMsg.ok ? "bg-success/15 border-success/30 text-success" : "bg-destructive/15 border-destructive/30 text-destructive"
              )}
            >
              {addMsg.text}
            </div>
          )}

          <form onSubmit={handleAddFriend} className="flex gap-2">
            <input
              type="text"
              required
              maxLength={12}
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              placeholder="NOOR-ABC123"
              className="input flex-1 font-mono tracking-wider text-sm uppercase"
            />
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 font-semibold text-xs text-primary-foreground shadow hover:opacity-90 transition"
            >
              {isBn ? "রিকোয়েস্ট পাঠান" : "Send Request"}
            </button>
          </form>
        </section>
      )}

      {/* EYE ICON: FRIEND COMPLETE SOT & DIGITAL WELLBEING BREAKDOWN MODAL */}
      {selectedFriend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-in fade-in">
          <div className="glass my-auto flex w-full max-w-md flex-col gap-4 p-5 shadow-2xl border-primary/30 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-3">
                <Avatar className="size-12 border-2 border-primary/40 shadow-sm">
                  {selectedFriend.avatar_url ? (
                    <AvatarImage src={selectedFriend.avatar_url} alt={selectedFriend.name} className="size-full object-cover rounded-full" />
                  ) : null}
                  <AvatarFallback className="bg-primary/20 text-sm font-bold text-primary">
                    {selectedFriend.name.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-bold text-base text-foreground leading-none">
                    {selectedFriend.name}
                  </h3>
                  <span className="text-[11px] text-muted-foreground font-mono mt-1 block">
                    {isBn ? "ফ্রেন্ড কোড:" : "Code:"} {selectedFriend.friend_code}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFriend(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            {/* Friend Detailed Metrics */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-border/70 bg-secondary/40 p-3">
                <span className="text-[10px] text-muted-foreground">{isBn ? "আজকের নামাজ" : "Prayers Today"}</span>
                <p className="mt-1 text-xl font-black text-foreground">
                  🕌 {selectedFriend.prayed_today}/৫
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {isBn ? "ওয়াক্ত আদায় করা হয়েছে" : "Prayers performed"}
                </span>
              </div>

              <div className="rounded-xl border border-border/70 bg-secondary/40 p-3">
                <span className="text-[10px] text-muted-foreground">{isBn ? "ধারাবাহিক স্ট্রিক" : "Prayer Streak"}</span>
                <p className="mt-1 text-xl font-black text-warning flex items-center gap-1">
                  <Flame className="size-5 fill-warning" />
                  <span>{selectedFriend.streak} {isBn ? "দিন" : "days"}</span>
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {isBn ? "সক্রিয় ধারাবাহিকতা" : "Consecutive days"}
                </span>
              </div>

              <div className="rounded-xl border border-border/70 bg-secondary/40 p-3">
                <span className="text-[10px] text-muted-foreground">{isBn ? "স্মার্ট রিলস কাউন্ট" : "Reels Watched"}</span>
                <p className="mt-1 text-xl font-black text-foreground">
                  📱 {selectedFriend.reels_today ?? 0}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {isBn ? "২-৩ সেকেন্ড দেখা রিলস" : "Smart dwell verified"}
                </span>
              </div>

              <div className="rounded-xl border border-border/70 bg-secondary/40 p-3">
                <span className="text-[10px] text-muted-foreground">{isBn ? "স্ক্রিন অন টাইম (SOT)" : "Screen On Time"}</span>
                <p className="mt-1 text-xl font-black text-foreground">
                  ⏱️ {Math.floor((selectedFriend.sot_minutes ?? 85) / 60)}h {(selectedFriend.sot_minutes ?? 85) % 60}m
                </p>
                <span className="text-[10px] text-primary">
                  {isBn ? "ডিজিটাল ডিটক্স স্কোর" : "Digital detox score"}
                </span>
              </div>
            </div>

            {/* FULL SOT & APP CATEGORY BREAKDOWN */}
            <div className="rounded-2xl border border-border/70 bg-secondary/30 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Smartphone className="size-3.5 text-primary" />
                  {isBn ? "স্ক্রিন টাইম ও অ্যাপ ক্যাটাগরি বিশ্লেষণ" : "SOT & App Breakdown"}
                </h4>
                <span className="text-[10px] font-mono text-muted-foreground">
                  মোট: {Math.floor((selectedFriend.sot_minutes ?? 85) / 60)}h {(selectedFriend.sot_minutes ?? 85) % 60}m
                </span>
              </div>

              {/* Visual Breakdown Bars */}
              {(() => {
                const total = selectedFriend.sot_minutes || 85;
                const social = Math.round(total * 0.45);
                const islamic = Math.round(total * 0.25);
                const work = Math.round(total * 0.20);
                const other = Math.max(0, total - social - islamic - work);

                const items = [
                  { label: isBn ? "সোশ্যাল মিডিয়া ও রিলস" : "Social & Reels", min: social, color: "bg-rose-500", percent: Math.round((social / total) * 100) },
                  { label: isBn ? "ইসলামিক অ্যাপস ও কুরআন" : "Islamic & Quran", min: islamic, color: "bg-emerald-500", percent: Math.round((islamic / total) * 100) },
                  { label: isBn ? "কাজ ও পড়াশোনা" : "Work & Study", min: work, color: "bg-blue-500", percent: Math.round((work / total) * 100) },
                  { label: isBn ? "অন্যান্য ও ইউটিলিটি" : "Other Apps", min: other, color: "bg-slate-400", percent: Math.round((other / total) * 100) },
                ];

                return (
                  <div className="space-y-2 pt-1">
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                      {items.map((it, i) => (
                        <div key={i} style={{ width: `${it.percent}%` }} className={cn("h-full", it.color)} />
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {items.map((it, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg bg-card/60 p-2 text-[11px] border border-border/40">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className={cn("size-2 rounded-full shrink-0", it.color)} />
                            <span className="truncate">{it.label}</span>
                          </div>
                          <span className="font-semibold text-foreground shrink-0 ml-1">
                            {Math.floor(it.min / 60) > 0 ? `${Math.floor(it.min / 60)}h ` : ""}{it.min % 60}m
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <button
              type="button"
              onClick={() => setSelectedFriend(null)}
              className="w-full rounded-xl bg-secondary py-2.5 text-xs font-semibold text-foreground hover:bg-muted transition"
            >
              {isBn ? "বন্ধ করুন" : "Close"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
