"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import LoginButton from "./LoginButton";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.push("/");
  }, [user, loading, router]);

  if (loading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50">
      <div className="bg-white rounded-2xl shadow-lg p-10 flex flex-col items-center gap-6 w-full max-w-sm mx-4">
        <div className="text-5xl">🧀</div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-amber-900">Cheese Club</h1>
          <p className="text-sm text-gray-500 mt-1">
            Sign in to track your tastings
          </p>
        </div>
        <LoginButton />
        <p className="text-xs text-gray-400 text-center">
          New accounts require admin approval before access is granted.
        </p>
      </div>
    </div>
  );
}
