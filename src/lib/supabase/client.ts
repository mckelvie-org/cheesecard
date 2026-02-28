import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let client: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function createClient() {
  if (!client) {
    client = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          // Disable background auto-refresh timer. Without this, initialize()
          // and startAutoRefresh() both acquire the Web Lock simultaneously at
          // startup, causing 5-second contention on every page load with an
          // expired token. initialize() still refreshes expired tokens on load;
          // this just prevents the race condition with the background timer.
          autoRefreshToken: false,
        },
      }
    );
  }
  return client;
}
