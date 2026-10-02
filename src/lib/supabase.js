import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

function validPublicConfig() {
  try {
    const url = new URL(supabaseUrl);
    return url.protocol === "https:" && !url.hostname.includes("YOUR_PROJECT") && typeof supabaseKey === "string" && supabaseKey.length >= 20 && !/^YOUR_/i.test(supabaseKey);
  } catch {
    return false;
  }
}

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey && validPublicConfig());

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
