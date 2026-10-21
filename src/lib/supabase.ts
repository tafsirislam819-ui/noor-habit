import { createClient, type User } from "@supabase/supabase-js";
import { useApp, today, type Item, type Prayer } from "./store";

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
    readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  }
}

const env = import.meta.env;
const supabaseUrl = (
  env.VITE_SUPABASE_URL ||
  "https://ahyiwiguhpmyoyavhyrv.supabase.co"
).trim();

const supabaseAnonKey = (
  env.VITE_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_n4Yq_eA6N5r1qWjX8kL2mP0s"
).trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export interface DbProfile {
  id: string;
  name: string;
  friend_code: string;
  avatar_url?: string;
  streak: number;
  prayed_today: number;
  habits_today: number;
  weekly_prayer_rate: number;
  weekly_habit_rate: number;
  reels_today?: number;
  sot_minutes?: number;
}

export interface FriendEntry {
  id: string;
  friendship_id: string;
  name: string;
  friend_code: string;
  avatar_url?: string;
  streak: number;
  prayed_today: number;
  habits_today: number;
  status: "pending" | "accepted";
  is_sender: boolean;
}

/** Sync local today's progress and streak to Supabase profile */
export async function syncStatsToCloud(
  user: User | { id: string; email?: string },
  name: string,
  prayers: Prayer[],
  items: Item[],
  streak: number,
  avatarUrl?: string
) {
  const d = today();
  const prayedToday = prayers.filter((p) => (p.doneDates || []).includes(d)).length;
  const habitsToday = items.filter((i) => (i.doneDates || []).includes(d)).length;
  const friendCode = useApp.getState().userFriendCode;
  const currentAvatar = avatarUrl || useApp.getState().profile?.avatar;

  try {
    const payload: any = {
      id: user.id,
      name: name || user.email?.split("@")[0] || "Friend",
      friend_code: friendCode,
      streak,
      prayed_today: prayedToday,
      habits_today: habitsToday,
      updated_at: new Date().toISOString(),
    };
    if (currentAvatar) {
      payload.avatar_url = currentAvatar;
    }

    const { error: profError } = await supabase.from("profiles").upsert(payload);

    if (profError) {
      // If column avatar_url not yet created, fallback without avatar_url
      if (profError.message?.includes("avatar_url")) {
        delete payload.avatar_url;
        await supabase.from("profiles").upsert(payload);
      } else {
        console.warn("Could not sync profile to Supabase:", profError.message);
      }
    }

    // Upsert daily log for history & analytics
    await supabase.from("daily_logs").upsert(
      {
        user_id: user.id,
        log_date: d,
        prayers_completed: prayedToday,
        habits_completed: habitsToday,
        total_habits: items.length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,log_date" }
    );
  } catch (err) {
    console.warn("Cloud sync exception:", err);
  }
}

/** Fetch current user's profile from Supabase */
export async function getMyProfile(user: User | { id: string }): Promise<DbProfile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: data.id,
      name: data.name,
      friend_code: data.friend_code,
      avatar_url: data.avatar_url,
      streak: data.streak || 0,
      prayed_today: data.prayed_today || 0,
      habits_today: data.habits_today || 0,
      weekly_prayer_rate: data.weekly_prayer_rate || 0,
      weekly_habit_rate: data.weekly_habit_rate || 0,
    };
  } catch {
    return null;
  }
}

/** Fetch all friends (accepted & pending) of current user */
export async function getFriendsList(userId: string): Promise<FriendEntry[]> {
  try {
    const { data: sentReqs, error: err1 } = await supabase
      .from("friendships")
      .select(`
        id,
        status,
        friend:profiles!friendships_friend_id_fkey(id, name, friend_code, avatar_url, streak, prayed_today, habits_today)
      `)
      .eq("user_id", userId);

    const { data: recReqs, error: err2 } = await supabase
      .from("friendships")
      .select(`
        id,
        status,
        sender:profiles!friendships_user_id_fkey(id, name, friend_code, avatar_url, streak, prayed_today, habits_today)
      `)
      .eq("friend_id", userId);

    if (err1 && err2) return [];

    const list: FriendEntry[] = [];

    (sentReqs || []).forEach((row: any) => {
      if (row.friend) {
        list.push({
          id: row.friend.id,
          friendship_id: row.id,
          name: row.friend.name,
          friend_code: row.friend.friend_code,
          avatar_url: row.friend.avatar_url,
          streak: row.friend.streak || 0,
          prayed_today: row.friend.prayed_today || 0,
          habits_today: row.friend.habits_today || 0,
          status: row.status,
          is_sender: true,
        });
      }
    });

    (recReqs || []).forEach((row: any) => {
      if (row.sender) {
        list.push({
          id: row.sender.id,
          friendship_id: row.id,
          name: row.sender.name,
          friend_code: row.sender.friend_code,
          avatar_url: row.sender.avatar_url,
          streak: row.sender.streak || 0,
          prayed_today: row.sender.prayed_today || 0,
          habits_today: row.sender.habits_today || 0,
          status: row.status,
          is_sender: false,
        });
      }
    });

    return list;
  } catch (err) {
    console.warn("Could not fetch friends:", err);
    return [];
  }
}

/** Fetch private leaderboard strictly for current user and their accepted friends */
export async function getLeaderboard(currentUserId: string): Promise<DbProfile[]> {
  try {
    const friends = await getFriendsList(currentUserId);
    const acceptedIds = friends
      .filter((f) => f.status === "accepted")
      .map((f) => f.id);

    const targetUserIds = [currentUserId, ...acceptedIds];

    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, friend_code, avatar_url, streak, prayed_today, habits_today, weekly_prayer_rate, weekly_habit_rate")
      .in("id", targetUserIds);

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      friend_code: row.friend_code,
      avatar_url: row.avatar_url,
      streak: row.streak || 0,
      prayed_today: row.prayed_today || 0,
      habits_today: row.habits_today || 0,
      weekly_prayer_rate: row.weekly_prayer_rate || 0,
      weekly_habit_rate: row.weekly_habit_rate || 0,
    }));
  } catch {
    return [];
  }
}

/** Send friend request using 6-character code */
export async function sendFriendRequest(
  currentUserId: string,
  code: string
): Promise<{ text: string; ok: boolean }> {
  try {
    const cleanCode = code.toUpperCase().replace(/\s+/g, "").replace(/^NOOR-?/, "").replace(/-/g, "");

    const { data: targetProfile, error: findError } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("friend_code", cleanCode)
      .maybeSingle();

    if (findError || !targetProfile) {
      return { text: "এই কোডের কোনো অ্যাকাউন্ট পাওয়া যায়নি।", ok: false };
    }

    if (targetProfile.id === currentUserId) {
      return { text: "এটি আপনার নিজের কোড!", ok: false };
    }

    const { error: insertError } = await supabase.from("friendships").insert({
      user_id: currentUserId,
      friend_id: targetProfile.id,
      status: "pending",
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return { text: "ইতিমধ্যেই এই বন্ধুকে রিকোয়েস্ট পাঠানো হয়েছে।", ok: false };
      }
      return { text: `রিকোয়েস্ট পাঠানো যায়নি: ${insertError.message}`, ok: false };
    }

    return { text: `${targetProfile.name}-কে ফ্রেন্ড রিকোয়েস্ট পাঠানো হয়েছে!`, ok: true };
  } catch (err: any) {
    return { text: "একটি সমস্যা হয়েছে। আবার চেষ্টা করুন।", ok: false };
  }
}

export async function acceptFriendRequest(friendshipId: string) {
  try {
    await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendshipId);
  } catch (err) {
    console.warn("Could not accept friend request:", err);
  }
}

export async function rejectFriendRequest(friendshipId: string) {
  try {
    await supabase
      .from("friendships")
      .delete()
      .eq("id", friendshipId);
  } catch (err) {
    console.warn("Could not reject friend request:", err);
  }
}
