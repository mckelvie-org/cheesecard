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
          // No-op lock: avoids 5-second cross-tab lock contention.
          // Fine for a single-user SPA with no concurrent auth operations.
          lock: (_name, _acquireTimeout, fn) => fn(),
        },
      }
    );
  }
  return client;
}
