import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isSecretKey = typeof supabaseAnonKey === "string" && supabaseAnonKey.startsWith("sb_secret_");

export const supabaseConfigError = isSecretKey
  ? "Your Supabase frontend key is a secret key. Replace VITE_SUPABASE_ANON_KEY with your project's publishable anon key."
  : "";

export const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseAnonKey) && !supabaseConfigError;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;
