"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import AddCheeseWizard from "./AddCheeseWizard";

export default function NewCheesePage() {
  const { id } = useParams<{ id: string }>();
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.role !== "admin") router.push(`/tastings/${id}`);
  }, [profile, loading, router, id]);

  if (loading || profile?.role !== "admin") return null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-amber-900">Add Cheese</h1>
      <AddCheeseWizard tastingId={id} />
    </div>
  );
}
