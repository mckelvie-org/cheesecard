import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let client: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function createClient() {
  if (!client) {
    client = createSupabaseClient<Database>(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY
    );
  }
  return client;
}
