"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import LogoutButton from "@/components/LogoutButton";

export default function PendingPage() {
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) { window.location.href = "/cheesecard/login"; return; }
    if (profile?.role === "member" || profile?.role === "admin") {
      window.location.href = "/cheesecard/";
    }
  }, [user, profile, loading]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <p className="text-amber-600 animate-pulse">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50">
      <div className="bg-white rounded-2xl shadow-lg p-10 flex flex-col items-center gap-6 w-full max-w-sm mx-4 text-center">
        <div className="text-5xl">⏳</div>
        <div>
          <h1 className="text-2xl font-bold text-amber-900">Awaiting Approval</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Hi{profile?.full_name ? ` ${profile.full_name}` : ""}! Your account
            has been created and is pending admin approval. You&apos;ll be able
            to access Cheese Club once an admin approves your membership.
          </p>
        </div>
        <p className="text-xs text-gray-400">Signed in as {user.email}</p>
        <LogoutButton />
      </div>
    </div>
  );
}
