// Supabase project: is404_teacherTips.
// The publishable key is meant to ship in client code. What it can do is limited by the
// RLS policies in supabase/migrations: read the tip catalog, submit feedback, register a teacher.
export const SUPABASE_URL = 'https://eithnvohtxqzbqejxsor.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_sDe6DDTaHck8BsraqOPTTA_h3pkUZ2z';

// How long the cached tip catalog is trusted before we refetch it.
export const CATALOG_TTL_MS = 10 * 60 * 1000;
