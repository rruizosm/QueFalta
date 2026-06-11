/**
 * ProfileContext — single source of truth for the signed-in user's profile.
 * Fetches once when a session appears, so screens read the profile instantly
 * (no empty-field flash on EditProfile). Mutations update the context locally
 * so changes show up immediately everywhere without a refetch.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchProfile, type UserProfile } from '../api/profile';
import { useAuth } from './AuthContext';

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  /** Suscripción QuéFalta Plus activa (premium_until en el futuro).
   *  Los gates deben combinarlo con limitsApply() de constants/limits.ts. */
  isPremium: boolean;
  /** Re-fetch from the server. */
  refresh: () => Promise<void>;
  /** Patch the cached profile locally (e.g. right after saving). */
  applyProfile: (patch: Partial<UserProfile>) => void;
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  loading: true,
  isPremium: false,
  refresh: async () => {},
  applyProfile: () => {},
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const p = await fetchProfile(userId);
      setProfile(p);
    } catch {
      // keep whatever we had cached
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load once per signed-in user; clear when the session goes away.
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh();
  }, [userId, refresh]);

  const applyProfile = useCallback((patch: Partial<UserProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  // Se recalcula en cada render; suficiente, porque expira con horas de margen
  // y cualquier compra/restore refresca el perfil entero.
  const isPremium =
    !!profile?.premiumUntil && new Date(profile.premiumUntil).getTime() > Date.now();

  return (
    <ProfileContext.Provider value={{ profile, loading, isPremium, refresh, applyProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext);
}
