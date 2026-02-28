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
          // Default lockAcquireTimeout is 5000ms. Reduce to 500ms so that
          // if an orphaned lock is detected, recovery happens quickly.
          lockAcquireTimeout: 500,
        },
      }
    );
  }
  return client;
}
