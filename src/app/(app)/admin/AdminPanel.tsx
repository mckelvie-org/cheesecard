"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type { Profile, Role } from "@/lib/supabase/types";

interface Props {
  pending: Profile[];
  members: Profile[];
}

export default function AdminPanel({ pending: initialPending, members: initialMembers }: Props) {
  const supabase = createClient();
  const [pending, setPending] = useState(initialPending);
  const [members, setMembers] = useState(initialMembers);
  const [loading, setLoading] = useState<string | null>(null);

  const updateRole = async (userId: string, role: Role) => {
    setLoading(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId);

    setLoading(null);
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

  return (
    <div className="space-y-6">
      {/* Pending approvals */}
      <div className="space-y-3">
        <h2 className="font-semibold text-gray-700">
          Pending Approval ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-400">No pending requests.</p>
        ) : (
          pending.map((user) => (
            <Card key={user.id} className="border-amber-200">
              <CardContent className="flex items-center justify-between py-3">
                <UserInfo user={user} />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => updateRole(user.id, "member")}
                    disabled={loading === user.id}
                  >
                    Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Separator />

      {/* Current members */}
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
                    disabled={loading === user.id}
                  >
                    Make Admin
                  </Button>
                )}
                {user.role === "admin" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateRole(user.id, "member")}
                    disabled={loading === user.id}
                  >
                    Demote
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => updateRole(user.id, "pending")}
                  disabled={loading === user.id}
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
