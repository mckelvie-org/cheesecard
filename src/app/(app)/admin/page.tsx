"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import AdminPanel from "./AdminPanel";
import type { Profile } from "@/lib/supabase/types";

export default function AdminPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState<Profile[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && profile?.role !== "admin") router.push("/");
  }, [profile, loading, router]);

  useEffect(() => {
    if (profile?.role !== "admin") return;
    const supabase = createClient();
    Promise.all([
      supabase.from("profiles").select("*").eq("role", "pending").order("created_at"),
      supabase.from("profiles").select("*").in("role", ["member", "admin"]).order("full_name"),
    ]).then(([{ data: p }, { data: m }]) => {
      setPending((p ?? []) as Profile[]);
      setMembers((m ?? []) as Profile[]);
      setDataLoading(false);
    });
  }, [profile]);

  if (loading || profile?.role !== "admin") return null;
  if (dataLoading) return <p className="text-center py-12 text-gray-400">Loading...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-amber-900">Admin Panel</h1>
      <AdminPanel pending={pending} members={members} />
    </div>
  );
}
