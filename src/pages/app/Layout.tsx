import { useEffect } from "react";
import { Outlet, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import Nav from "@/components/Nav";

export default function AppLayout() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/login", { replace: true }); return; }
    if (!profile || profile.role === "pending") {
      navigate("/pending", { replace: true });
    }
  }, [user, profile, loading, navigate]);

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
      <Nav profile={profile} />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-2xl">
        <Outlet />
      </main>
    </div>
  );
}
