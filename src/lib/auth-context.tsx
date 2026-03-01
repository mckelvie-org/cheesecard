"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "./supabase/types";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;      // true while auth state OR profile is unknown
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
});

const PROFILE_CACHE_KEY = (uid: string) => `cheesecard:profile:${uid}`;

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

    // Fetch profile from DB and update cache. Fire-and-forget; does not
    // block the loading state when a cached profile is already available.
    const refreshProfile = async (userId: string) => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();
        const p = data as Profile | null;
        setProfile(p);
        if (p) localStorage.setItem(PROFILE_CACHE_KEY(userId), JSON.stringify(p));
        else localStorage.removeItem(PROFILE_CACHE_KEY(userId));
      } catch {
        // Leave whatever is already in state (cache or null).
      }
    };

    // Fallback: if onAuthStateChange never fires, stop loading after 5s.
    const timeout = setTimeout(() => setLoading(false), 5000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(timeout);
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);

      if (sessionUser) {
        // Load cached profile instantly so the page renders without a DB round-trip.
        const cached = localStorage.getItem(PROFILE_CACHE_KEY(sessionUser.id));
        if (cached) {
          try { setProfile(JSON.parse(cached)); } catch { /* ignore bad cache */ }
        }
        setLoading(false);          // unblock render immediately
        refreshProfile(sessionUser.id);  // update in background
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Reactively update profile when an admin changes our role.
  // This is what makes PendingPage redirect automatically on approval.
  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`profile:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => {
          const p = payload.new as Profile;
          setProfile(p);
          localStorage.setItem(PROFILE_CACHE_KEY(user.id), JSON.stringify(p));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
