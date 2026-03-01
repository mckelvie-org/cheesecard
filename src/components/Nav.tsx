import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Profile, Notification } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/utils";
import NavSignOut from "./NavSignOut";

export default function Nav({ profile }: { profile: Profile }) {
  const navigate = useNavigate();
  const initials = profile.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)
    : profile.email[0].toUpperCase();

  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const supabase = createClient();

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(15);
      setNotifications((data ?? []) as Notification[]);
    };

    fetchNotifications();

    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const n = payload.new as Notification;
          const hash = window.location.hash;
          const isSuppressed = hash.includes(n.ref_id) ||
            (n.type === "new_member" && hash.includes("/admin"));
          if (isSuppressed) {
            // User is already viewing this content — delete silently.
            // The resulting DELETE event will trigger fetchNotifications.
            supabase.from("notifications").delete().eq("id", n.id);
          } else {
            fetchNotifications();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` },
        fetchNotifications
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile.id]);

  const notificationText = (n: Notification) => {
    const actor = n.actor_name ?? "Someone";
    switch (n.type) {
      case "new_tasting": return `${actor} started a new tasting`;
      case "new_cheese":  return `${actor} added ${n.subject}`;
      case "new_review":  return `${actor} reviewed ${n.subject}`;
      case "new_comment": return `${actor} commented on ${n.subject}`;
      case "new_member":  return `${n.subject} requested to join`;
      default: return n.subject;
    }
  };

  const notificationHref = (n: Notification) => {
    if (n.type === "new_tasting") return `/tastings/${n.ref_id}`;
    if (n.type === "new_member")  return `/admin`;
    return `/cheeses/${n.ref_id}`;
  };

  const handleMarkAllRead = async () => {
    setNotifications([]); // optimistic
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("user_id", profile.id);
  };

  return (
    <header className="bg-white border-b border-amber-100 sticky top-0 z-10">
      <div className="container mx-auto px-4 max-w-2xl h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-amber-900 text-lg">
          🧀 Cheese Club
        </Link>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative p-1 rounded-full hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-400">
                <Bell className="h-5 w-5 text-amber-700" />
                {notifications.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                    {notifications.length > 9 ? "9+" : notifications.length}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 max-h-80 overflow-y-auto p-0">
              {notifications.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400">No notifications</div>
              ) : (
                <>
                  {notifications.map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      className="flex flex-col items-start gap-0.5 px-4 py-3 cursor-pointer"
                      onSelect={() => navigate(notificationHref(n))}
                    >
                      <span className="text-sm text-gray-900 leading-snug">{notificationText(n)}</span>
                      <span className="text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="justify-center text-xs text-gray-400 hover:text-gray-600 py-2 cursor-pointer"
                    onSelect={handleMarkAllRead}
                  >
                    Mark all as read
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-amber-400">
                <Avatar className="h-8 w-8">
                  {profile.avatar_url && (
                    <AvatarImage src={profile.avatar_url} alt={profile.full_name ?? ""} />
                  )}
                  <AvatarFallback className="bg-amber-200 text-amber-900 text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-3 py-2">
                <p className="text-sm font-medium truncate">{profile.full_name ?? "User"}</p>
                <p className="text-xs text-gray-500 truncate">{profile.email}</p>
              </div>
              <DropdownMenuSeparator />
              {profile.role === "admin" && (
                <>
                  <DropdownMenuItem asChild>
                    <Link to="/admin">Admin Panel</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <NavSignOut />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
