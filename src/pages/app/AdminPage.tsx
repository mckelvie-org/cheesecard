import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type { Profile, Role } from "@/lib/supabase/types";

export default function AdminPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Profile[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (profile && profile.role !== "admin") {
      navigate("/", { replace: true });
      return;
    }

    const supabase = createClient();

    const fetchData = () =>
      supabase
        .from("profiles")
        .select("*")
        .order("full_name")
        .then(({ data }) => {
          const all = (data ?? []) as Profile[];
          setPending(all.filter((p) => p.role === "pending"));
          setMembers(all.filter((p) => p.role === "member" || p.role === "admin"));
          setLoading(false);
        });

    fetchData();

    // Clear new_member notifications when admin visits this page
    if (profile?.id) {
      supabase.from("notifications").delete().eq("user_id", profile.id).eq("type", "new_member").then(() => {});
    }

    const channel = supabase
      .channel("admin-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, fetchData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, navigate]);

  const updateRole = async (userId: string, role: Role) => {
    setUpdating(userId);
    const { error } = await createClient()
      .from("profiles")
      .update({ role })
      .eq("id", userId);

    setUpdating(null);
    if (error) {
      toast.error("Failed to update role");
      return;
    }

    if (role === "member" || role === "admin") {
      const user = pending.find((p) => p.id === userId);
      if (user) {
        setPending((prev) => prev.filter((p) => p.id !== userId));
        setMembers((prev) =>
          [...prev, { ...user, role }].sort((a, b) =>
            (a.full_name ?? "").localeCompare(b.full_name ?? "")
          )
        );
        toast.success(`${user.full_name ?? user.email} approved`);
      }
    } else if (role === "pending") {
      const user = members.find((p) => p.id === userId);
      if (user) {
        setMembers((prev) => prev.filter((p) => p.id !== userId));
        setPending((prev) => [...prev, { ...user, role }]);
        toast.success(`${user.full_name ?? user.email} revoked`);
      }
    }
  };

  if (loading) return <p className="text-center py-12 text-gray-400">Loading...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-amber-900">Admin Panel</h1>

      <div className="space-y-3">
        <h2 className="font-semibold text-gray-700">Pending Approval ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-400">No pending requests.</p>
        ) : (
          pending.map((user) => (
            <Card key={user.id} className="border-amber-200">
              <CardContent className="flex items-center justify-between py-3">
                <UserInfo user={user} />
                <Button
                  size="sm"
                  onClick={() => updateRole(user.id, "member")}
                  disabled={updating === user.id}
                >
                  Approve
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <h2 className="font-semibold text-gray-700">Members ({members.length})</h2>
        {members.map((user) => (
          <Card key={user.id} className="border-amber-100">
            <CardContent className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2">
                <UserInfo user={user} />
                <Badge
                  variant={user.role === "admin" ? "default" : "secondary"}
                  className="text-xs"
                >
                  {user.role}
                </Badge>
              </div>
              <div className="flex gap-2">
                {user.role === "member" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateRole(user.id, "admin")}
                    disabled={updating === user.id}
                  >
                    Make Admin
                  </Button>
                )}
                {user.role === "admin" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateRole(user.id, "member")}
                    disabled={updating === user.id}
                  >
                    Demote
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => updateRole(user.id, "pending")}
                  disabled={updating === user.id}
                >
                  Revoke
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function UserInfo({ user }: { user: Profile }) {
  const initials = user.full_name
    ? user.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)
    : user.email[0].toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-8 w-8">
        {user.avatar_url && <AvatarImage src={user.avatar_url} />}
        <AvatarFallback className="text-xs bg-amber-100 text-amber-900">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div>
        <p className="text-sm font-medium">{user.full_name ?? "—"}</p>
        <p className="text-xs text-gray-500">{user.email}</p>
      </div>
    </div>
  );
}
