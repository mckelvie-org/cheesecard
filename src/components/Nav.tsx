import Link from "next/link";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Profile } from "@/lib/supabase/types";
import NavSignOut from "./NavSignOut";

export default function Nav({ profile }: { profile: Profile }) {
  const initials = profile.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)
    : profile.email[0].toUpperCase();

  return (
    <header className="bg-white border-b border-amber-100 sticky top-0 z-10">
      <div className="container mx-auto px-4 max-w-2xl h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-amber-900 text-lg">
          🧀 Cheese Club
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-amber-400">
              <Avatar className="h-8 w-8">
                {profile.avatar_url && (
                  <AvatarImage src={profile.avatar_url} alt={profile.full_name ?? ""} />
                )}
                <AvatarFallback className="bg-amber-200 text-amber-900 text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-3 py-2">
              <p className="text-sm font-medium truncate">{profile.full_name ?? "User"}</p>
              <p className="text-xs text-gray-500 truncate">{profile.email}</p>
            </div>
            <DropdownMenuSeparator />
            {profile.role === "admin" && (
              <>
                <DropdownMenuItem asChild>
                  <Link href="/admin">Admin Panel</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <NavSignOut />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
