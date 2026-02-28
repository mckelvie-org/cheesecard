import { HashRouter, Routes, Route } from "react-router-dom";
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

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
