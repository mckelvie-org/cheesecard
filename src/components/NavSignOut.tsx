"use client";

import { createClient } from "@/lib/supabase/client";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export default function NavSignOut() {
  const supabase = createClient();

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/cheesecard/login";
  };

  return (
    <DropdownMenuItem onClick={signOut} className="text-red-600">
      Sign out
    </DropdownMenuItem>
  );
}
