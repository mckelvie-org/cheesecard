"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function LogoutButton() {
  const supabase = createClient();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = () => {
    setSigningOut(true);
    supabase.auth.signOut().catch(() => {});
    window.location.href = "/cheesecard/login";
  };

  return (
    <Button variant="outline" onClick={signOut} disabled={signingOut}>
      {signingOut ? "Signing out..." : "Sign out"}
    </Button>
  );
}
