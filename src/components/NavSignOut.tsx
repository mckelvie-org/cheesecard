"use client";

import { createClient } from "@/lib/supabase/client";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";

export default function NavSignOut() {
  const supabase = createClient();
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <DropdownMenuItem onClick={signOut} className="text-red-600">
      Sign out
    </DropdownMenuItem>
  );
}
