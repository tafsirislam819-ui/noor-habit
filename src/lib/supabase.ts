import { createClient, type User } from "@supabase/supabase-js";
import { today, type Item, type Prayer } from "./store";

const SUPABASE_URL = (import.meta.env["VITE_SUPABASE_URL"] as string) || "https://ahyiwiguhpmyoyavhyrv.supabase.co";
const SUPABASE_ANON_KEY = (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string) || "sb_publishable_dxA2DDBOtig9Dpdxm_O6nw_4NWffoAa";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  is_sender: boolean;
}

/** Sync local today's progress and streak to Supabase profile */
export async function syncStatsToCloud(
  user: User,
  name: string,
  prayers: Prayer[],
  items: Item[],
  streak: number,
) {
  const d = today();
  const prayedToday = prayers.filter((p) => p.doneDates.includes(d)).length;
  const habitsToday = items.filter((i) => i.doneDates.includes(d)).length;

  try {
    // 1. Update/Ensure profile row
    const { error: profError } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        name: name || user.email?.split("@")[0] || "Friend",
        streak,
        prayed_today: prayedToday,
        habits_today: habitsToday,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (profError) console.error("Error upserting profile:", profError);

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
    console.error("Failed to sync stats to cloud:", err);
  }
}

/** Get the current user's profile with their unique friend code */
export async function getMyProfile(user: User): Promise<DbProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    // If profile not created yet, create one
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data: newProf } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        name: user.email?.split("@")[0] || "Friend",
        friend_code: code,
      })
      .select()
      .single();
    return newProf as DbProfile | null;
  }

  return data as DbProfile;
}

/** Send friend request by 6-character friend code */
export async function sendFriendRequest(currentUserId: string, friendCode: string): Promise<{ success: boolean; message: string }> {
  const cleanCode = friendCode.trim().toUpperCase();
  if (!cleanCode) return { success: false, message: "Please enter a valid code" };

  // Find friend profile
  const { data: friend, error: findErr } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("friend_code", cleanCode)
    .maybeSingle();

  if (findErr || !friend) {
    return { success: false, message: "No friend found with this code!" };
  }

  if (friend.id === currentUserId) {
    return { success: false, message: "You cannot add yourself!" };
  }

  // Check if existing friendship
  const { data: existing } = await supabase
    .from("friendships")
    .select("*")
    .or(`and(user_id.eq.${currentUserId},friend_id.eq.${friend.id}),and(user_id.eq.${friend.id},friend_id.eq.${currentUserId})`)
    .maybeSingle();

  if (existing) {
    return { success: false, message: "Already in your friends list or pending!" };
  }

  // Create friend request
  const { error: insErr } = await supabase.from("friendships").insert({
    user_id: currentUserId,
    friend_id: friend.id,
    status: "accepted", // Auto-accept or set to accepted
  });

  if (insErr) {
    return { success: false, message: insErr.message };
  }

  return { success: true, message: `Connected with ${friend.name}!` };
}

/** Get user's accepted friends with their real-time stats */
export async function getFriendsList(currentUserId: string): Promise<FriendEntry[]> {
  const { data: relations, error } = await supabase
    .from("friendships")
    .select(`
      id,
      user_id,
      friend_id,
      status
    `)
    .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);

  if (error || !relations) return [];

  const friendUserIds = relations.map((r) => (r.user_id === currentUserId ? r.friend_id : r.user_id));
  if (friendUserIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", friendUserIds);

  if (!profiles) return [];

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  return relations.map((r) => {
    const isSender = r.user_id === currentUserId;
    const fId = isSender ? r.friend_id : r.user_id;
    const p = profileMap.get(fId);
    return {
      id: fId,
      friendship_id: r.id,
      name: p?.name || "Friend",
      friend_code: p?.friend_code || "------",
      streak: p?.streak || 0,
      prayed_today: p?.prayed_today || 0,
      habits_today: p?.habits_today || 0,
      status: r.status,
      is_sender: isSender,
    };
  });
}

/** Get top rankers (friends + self) */
export async function getLeaderboard(currentUserId: string): Promise<DbProfile[]> {
  // Fetch self and all connected profiles
  const friends = await getFriendsList(currentUserId);
  const ids = [currentUserId, ...friends.map((f) => f.id)];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", ids)
    .order("streak", { ascending: false })
    .order("prayed_today", { ascending: false })
    .limit(50);

  return (profiles || []) as DbProfile[];
}
