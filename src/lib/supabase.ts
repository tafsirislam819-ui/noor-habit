import { createClient, type User } from "@supabase/supabase-js";
import { today, useApp, type Item, type Prayer } from "./store";

const SUPABASE_URL = (import.meta.env["VITE_SUPABASE_URL"] as string) || "https://ahyiwiguhpmyoyavhyrv.supabase.co";
const SUPABASE_ANON_KEY = (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string) || "sb_publishable_dxA2DDBOtig9Dpdxm_O6nw_4NWffoAa";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
  streak: number;
  prayed_today: number;
  habits_today: number;
  weekly_prayer_rate: number;
  weekly_habit_rate: number;
}

export interface FriendEntry {
  id: string;
  friendship_id: string;
  name: string;
  friend_code: string;
  streak: number;
  prayed_today: number;
  habits_today: number;
  status: "pending" | "accepted";
  is_sender: boolean; // true if current user sent request, false if received
}

/** Sync local today's progress and streak to Supabase profile */
export async function syncStatsToCloud(
  user: User | { id: string; email?: string },
  name: string,
  prayers: Prayer[],
  items: Item[],
  streak: number,
) {
  const d = today();
  const prayedToday = prayers.filter((p) => p.doneDates.includes(d)).length;
  const habitsToday = items.filter((i) => i.doneDates.includes(d)).length;
  const friendCode = useApp.getState().userFriendCode;

  try {
    // 1. Update/Ensure profile row
    const { error: profError } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        name: name || user.email?.split("@")[0] || "Friend",
        friend_code: friendCode,
        streak,
        prayed_today: prayedToday,
        habits_today: habitsToday,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (profError) {
      console.warn("Could not sync profile to cloud:", profError.message);
    }

    // 2. Insert/update daily log
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
    console.warn("Failed to sync stats to cloud:", err);
  }
}

/** Get the current user's profile with their unique friend code */
export async function getMyProfile(user: User | { id: string; email?: string }): Promise<DbProfile> {
  const storeCode = useApp.getState().userFriendCode;
  const defaultProfile: DbProfile = {
    id: user.id,
    name: (user as User).user_metadata?.name || user.email?.split("@")[0] || "Friend",
    friend_code: storeCode,
    streak: 0,
    prayed_today: 0,
    habits_today: 0,
    weekly_prayer_rate: 0,
    weekly_habit_rate: 0,
  };

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !data) {
      try {
        const { data: newProf } = await supabase
          .from("profiles")
          .upsert({
            id: user.id,
            name: defaultProfile.name,
            friend_code: storeCode,
          })
          .select()
          .single();
        if (newProf) return newProf as DbProfile;
      } catch {
        /* fallback to default */
      }
      return defaultProfile;
    }

    if (data.friend_code && data.friend_code !== storeCode) {
      useApp.getState().setUserFriendCode(data.friend_code);
    }

    return data as DbProfile;
  } catch {
    return defaultProfile;
  }
}

/** Send Facebook-style friend request (status: 'pending') by unique friend code */
export async function sendFriendRequest(
  currentUserId: string,
  friendCode: string
): Promise<{ success: boolean; message: string }> {
  const cleanCode = friendCode.trim().toUpperCase();
  if (!cleanCode) return { success: false, message: "অনুগ্রহ করে একটি কোড দিন (Please enter a code)" };

  try {
    const { data: friend, error: findErr } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("friend_code", cleanCode)
      .maybeSingle();

    if (findErr || !friend) {
      return { success: false, message: "এই কোড দিয়ে কোনো ব্যবহারকারী পাওয়া যায়নি! (User not found with this code)" };
    }

    if (friend.id === currentUserId) {
      return { success: false, message: "এটি আপনার নিজের কোড! (Cannot send request to yourself)" };
    }

    // Check existing friendship/request in either direction
    const { data: existing } = await supabase
      .from("friendships")
      .select("id, status, user_id")
      .or(`and(user_id.eq.${currentUserId},friend_id.eq.${friend.id}),and(user_id.eq.${friend.id},friend_id.eq.${currentUserId})`)
      .maybeSingle();

    if (existing) {
      if (existing.status === "accepted") {
        return { success: false, message: "এই বন্ধু ইতিমধ্যে আপনার ফ্রেন্ড লিস্টে আছেন! (Already friends)" };
      }
      if (existing.user_id === currentUserId) {
        return { success: false, message: "আপনি ইতিমধ্যে ফ্রেন্ড রিকোয়েস্ট পাঠিয়েছেন! (Request already sent)" };
      }
      return { success: false, message: "তিনি আপনাকে ইতিমধ্যে ফ্রেন্ড রিকোয়েস্ট পাঠিয়েছেন, অনুগ্রহ করে গ্রহণ করুন।" };
    }

    // Insert pending friend request
    const { error: insErr } = await supabase.from("friendships").insert({
      user_id: currentUserId,
      friend_id: friend.id,
      status: "pending",
    });

    if (insErr) {
      return { success: false, message: insErr.message };
    }

    return {
      success: true,
      message: `${friend.name}-এর কাছে ফ্রেন্ড রিকোয়েস্ট পাঠানো হয়েছে! তিনি গ্রহণ করলেই ফ্রেন্ড লিস্ট ও লিডারবোর্ডে যুক্ত হবেন।`,
    };
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : "Error sending request" };
  }
}

/** Accept an incoming friend request */
export async function acceptFriendRequest(friendshipId: string): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendshipId);

    if (error) throw error;
    return { success: true, message: "ফ্রেন্ড রিকোয়েস্ট গ্রহণ করা হয়েছে!" };
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : "Error accepting request" };
  }
}

/** Reject or cancel a friend request / unfriend */
export async function rejectFriendRequest(friendshipId: string): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", friendshipId);

    if (error) throw error;
    return { success: true, message: "রিকোয়েস্ট বাতিল করা হয়েছে।" };
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : "Error rejecting request" };
  }
}

/** Get list of all relationships (accepted friends and pending requests) */
export async function getFriendsList(currentUserId: string): Promise<FriendEntry[]> {
  try {
    const { data, error } = await supabase
      .from("friendships")
      .select(`
        id,
        user_id,
        friend_id,
        status,
        sender:profiles!friendships_user_id_fkey(id, name, friend_code, streak, prayed_today, habits_today),
        receiver:profiles!friendships_friend_id_fkey(id, name, friend_code, streak, prayed_today, habits_today)
      `)
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);

    if (error || !data) return [];

    return data.map((row: any) => {
      const isSender = row.user_id === currentUserId;
      const other = isSender ? row.receiver : row.sender;
      return {
        id: other?.id || "",
        friendship_id: row.id,
        name: other?.name || "Friend",
        friend_code: other?.friend_code || "",
        streak: other?.streak || 0,
        prayed_today: other?.prayed_today || 0,
        habits_today: other?.habits_today || 0,
        status: row.status as "pending" | "accepted",
        is_sender: isSender,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Get Leaderboard ONLY FOR ACCEPTED FRIENDS + CURRENT USER
 * As requested: "leader board e sobar asbe na sudhu nijer friend der asbe"
 */
export async function getLeaderboard(currentUserId: string): Promise<DbProfile[]> {
  try {
    // 1. Get current user's profile
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUserId)
      .maybeSingle();

    // 2. Get all accepted friends
    const { data: friendships } = await supabase
      .from("friendships")
      .select("user_id, friend_id")
      .eq("status", "accepted")
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);

    const friendIds = new Set<string>();
    if (friendships) {
      friendships.forEach((f) => {
        if (f.user_id === currentUserId) friendIds.add(f.friend_id);
        else friendIds.add(f.user_id);
      });
    }

    let friendProfiles: DbProfile[] = [];
    if (friendIds.size > 0) {
      const { data: friendsData } = await supabase
        .from("profiles")
        .select("*")
        .in("id", Array.from(friendIds));

      if (friendsData) {
        friendProfiles = friendsData as DbProfile[];
      }
    }

    // Combine current user and accepted friends
    const combined: DbProfile[] = [];
    if (myProfile) combined.push(myProfile as DbProfile);
    friendProfiles.forEach((fp) => {
      if (!combined.some((c) => c.id === fp.id)) {
        combined.push(fp);
      }
    });

    // Sort by streak desc, then prayed_today desc
    combined.sort((a, b) => {
      if (b.streak !== a.streak) return b.streak - a.streak;
      return b.prayed_today - a.prayed_today;
    });

    return combined;
  } catch {
    return [];
  }
}
