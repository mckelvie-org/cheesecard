"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Nav from "@/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/login"); return; }
    if (!profile || profile.role === "pending") { router.push("/pending"); return; }
  }, [user, profile, loading, router]);

  if (loading || !user || !profile || profile.role === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <p className="text-amber-600 animate-pulse">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Nav profile={profile} />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-2xl">
        {children}
      </main>
    </div>
  );
}
