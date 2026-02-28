import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export default function NavSignOut() {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = () => {
    setSigningOut(true);
    createClient().auth.signOut().catch(() => {});
    navigate("/login", { replace: true });
  };

  return (
    <DropdownMenuItem onClick={signOut} disabled={signingOut} className="text-red-600">
      {signingOut ? "Signing out..." : "Sign out"}
    </DropdownMenuItem>
  );
}
