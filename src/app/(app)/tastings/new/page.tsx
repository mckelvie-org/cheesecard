"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import NewTastingForm from "./NewTastingForm";

export default function NewTastingPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.role !== "admin") router.push("/");
  }, [profile, loading, router]);

  if (loading || profile?.role !== "admin") return null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-amber-900">New Tasting</h1>
      <NewTastingForm />
    </div>
  );
}
