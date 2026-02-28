"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "./supabase/types";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Handle OAuth PKCE callback: Supabase redirects to the base URL with
    // ?code=... in the query string. Exchange it here, then clean the URL.
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).finally(() => {
        window.history.replaceState({}, "", window.location.pathname);
      });
    }

    const fetchProfile = async (userId: string) => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();
        setProfile(data as Profile | null);
      } catch {
        setProfile(null);
      }
    };

    const timeout = setTimeout(() => {
      console.warn("[auth] timeout: onAuthStateChange never fired");
      setLoading(false);
    }, 4000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log("[auth] onAuthStateChange fired, event:", _event, "user:", session?.user?.id ?? "none");
      clearTimeout(timeout);
      setUser(session?.user ?? null);
      if (session?.user) {
        console.log("[auth] fetching profile...");
        await fetchProfile(session.user.id);
        console.log("[auth] profile fetched");
      } else {
        setProfile(null);
      }
      console.log("[auth] setLoading(false)");
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
