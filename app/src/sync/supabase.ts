// The Supabase client: the one part of Gauge that talks to a server, and only
// for Groups. Everything else stays on the phone.
//
// Configured by `extra.supabase` in app.json (url and publishableKey). Both are
// public by design: the publishable key identifies the project and grants
// nothing on its own. The database's row-level security decides what any
// caller can read or write (supabase/migrations/0001_groups.sql).
//
// Setup follows Expo's guide for SDK 57: expo-sqlite's localStorage holds the
// session, and token refresh follows the app's foreground state.

import 'expo-sqlite/localStorage/install';

import { SupabaseClient, createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState } from 'react-native';

interface Config {
  url: string;
  publishableKey: string;
}

function readConfig(): Config | null {
  const extra = Constants.expoConfig?.extra as { supabase?: Partial<Config> } | undefined;
  const c = extra?.supabase;
  return c?.url && c?.publishableKey ? { url: c.url, publishableKey: c.publishableKey } : null;
}

/** False in a build made before the project's keys were added to app.json. */
export const groupsServerConfigured = (): boolean => readConfig() !== null;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const cfg = readConfig();
  if (!cfg) throw new Error('The groups server is not configured in this build.');
  client = createClient(cfg.url, cfg.publishableKey, {
    auth: {
      storage: (globalThis as unknown as { localStorage: Storage }).localStorage,
      autoRefreshToken: true,
      persistSession: true,
      // There is no URL on a phone to read a session from.
      detectSessionInUrl: false,
    },
  });
  // Refreshing in the background wastes battery on a token nobody is using.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') client?.auth.startAutoRefresh();
    else client?.auth.stopAutoRefresh();
  });
  return client;
}

/**
 * Your anonymous user id, signing in the first time. No email, no password.
 * The id lives in this phone's storage, so reinstalling makes a new one.
 */
export async function ensureSession(): Promise<string> {
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signed, error } = await sb.auth.signInAnonymously();
  if (error || !signed.user) throw error ?? new Error('Anonymous sign-in failed');
  return signed.user.id;
}

/** Forget the session on this phone, after its user was deleted on the server. */
export async function signOutLocally(): Promise<void> {
  await supabase().auth.signOut({ scope: 'local' });
}
