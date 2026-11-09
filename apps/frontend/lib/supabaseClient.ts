import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Custom lock to prevent navigator.locks deadlocks in browser environments
const customLock = async (name: string, acquireTimeout: number, fn: () => Promise<any>) => {
  return await fn();
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true,
    lock: typeof window !== 'undefined' ? customLock : undefined,
  },
});
