// The publishable key is intended to be used by browser applications.
// Access to data is enforced by Supabase Auth, grants, and RLS policies.
window.eduSupabase = window.supabase.createClient(
  'https://qqrywksazgzfnluzglzc.supabase.co',
  'sb_publishable_a2u5f9MSAYjXUCmfRb6Sgg_wlkaaD-n',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
