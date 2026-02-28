import { HashRouter, Routes, Route, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import LoginPage from "@/pages/LoginPage";
import PendingPage from "@/pages/PendingPage";
import AppLayout from "@/pages/app/Layout";
import TastingsPage from "@/pages/app/TastingsPage";
import TastingDetailPage from "@/pages/app/TastingDetailPage";
import NewTastingPage from "@/pages/app/NewTastingPage";
import CheesePage from "@/pages/app/CheesePage";
import NewCheesePage from "@/pages/app/NewCheesePage";
import AdminPage from "@/pages/app/AdminPage";
import { createClient } from "@/lib/supabase/client";

function LogoutPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.signOut().finally(() => {
      localStorage.clear();
      sessionStorage.clear();
      navigate("/login", { replace: true });
    });
  }, [navigate]);
  return <p style={{ padding: "2rem" }}>Signing out…</p>;
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/logout" element={<LogoutPage />} />
          <Route path="/pending" element={<PendingPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<TastingsPage />} />
            <Route path="/tastings/new" element={<NewTastingPage />} />
            <Route path="/tastings/:id" element={<TastingDetailPage />} />
            <Route path="/tastings/:id/cheeses/new" element={<NewCheesePage />} />
            <Route path="/cheeses/:cheeseId" element={<CheesePage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </HashRouter>
      <Toaster />
    </AuthProvider>
  );
}
