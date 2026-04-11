import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import Nav from "@/components/Nav";

const PULL_THRESHOLD = 72;

export default function AppLayout() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const pullYRef = useRef(0);
  const [pullDisplay, setPullDisplay] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/login", { replace: true }); return; }
    if (!profile || profile.role === "pending") {
      navigate("/pending", { replace: true });
    }
  }, [user, profile, loading, navigate]);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startYRef.current = e.touches[0].clientY;
        pullingRef.current = true;
      } else {
        pullingRef.current = false;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0) {
        pullYRef.current = Math.min(dy, PULL_THRESHOLD + 20);
        setPullDisplay(pullYRef.current);
      } else {
        pullingRef.current = false;
        pullYRef.current = 0;
        setPullDisplay(0);
      }
    };
    const onTouchEnd = () => {
      if (pullYRef.current >= PULL_THRESHOLD) {
        window.location.href = window.location.origin + window.location.pathname + "?bust=" + Date.now();
      } else {
        pullYRef.current = 0;
        setPullDisplay(0);
      }
      pullingRef.current = false;
      startYRef.current = 0;
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <p className="text-amber-600 animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!profile || profile.role === "pending") return <Navigate to="/pending" replace />;

  return (
    <div className="flex flex-col min-h-screen">
      {pullDisplay > 0 && (
        <div
          className="fixed top-0 left-0 right-0 z-50 flex items-end justify-center bg-amber-50 text-xs text-amber-600 pointer-events-none"
          style={{ height: pullDisplay }}
        >
          <span className="pb-1">
            {pullDisplay >= PULL_THRESHOLD ? "↑ Release to refresh" : "↓ Pull to refresh"}
          </span>
        </div>
      )}
      <Nav profile={profile} />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-2xl">
        <Outlet />
      </main>
    </div>
  );
}
