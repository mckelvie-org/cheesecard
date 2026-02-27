"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function LogoutButton() {
  const supabase = createClient();

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/cheesecard/login";
  };

  return (
    <Button variant="outline" onClick={signOut}>
      Sign out
    </Button>
  );
}
