"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export default function NavSignOut() {
  const supabase = createClient();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = () => {
    setSigningOut(true);
    supabase.auth.signOut().catch(() => {});
    window.location.href = "/cheesecard/login";
  };

  return (
    <DropdownMenuItem onClick={signOut} disabled={signingOut} className="text-red-600">
      {signingOut ? "Signing out..." : "Sign out"}
    </DropdownMenuItem>
  );
}
