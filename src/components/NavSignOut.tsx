"use client";

import { createClient } from "@/lib/supabase/client";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export default function NavSignOut() {
  const supabase = createClient();

  const signOut = async () => {
    try { await supabase.auth.signOut(); } catch (_) {}
    window.location.href = "/cheesecard/login";
  };

  return (
    <DropdownMenuItem onClick={signOut} className="text-red-600">
      Sign out
    </DropdownMenuItem>
  );
}
