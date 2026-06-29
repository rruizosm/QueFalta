/**
 * ProfileContext — single source of truth for the signed-in user's profile.
 * Fetches once when a session appears, so screens read the profile instantly
 * (no empty-field flash on EditProfile). Mutations update the context locally
 * so changes show up immediately everywhere without a refetch.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { fetchProfile, updateProfile, type UserProfile } from '../api/profile';
import { initialsFromName, takePendingProfileName } from '../lib/pendingProfileName';
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

      // Nombre que Apple entregó en el primer login (buzón de pendingProfileName).
      // Solo existe justo tras un alta con Apple, cuando el perfil aún tiene el
      // nombre por defecto del trigger → lo persistimos y lo reflejamos ya.
      const pendingName = takePendingProfileName();
      if (pendingName && pendingName !== p.name) {
        const initials = initialsFromName(pendingName);
        updateProfile(userId, { name: pendingName, initials }).catch(() => {});
        setProfile({ ...p, name: pendingName, initials });
      } else {
        setProfile(p);
      }

      // Calienta la caché en disco de expo-image en cuanto sabemos la URL, así
      // la foto ya está lista la primera vez que el usuario abre Perfil (sin el
      // retardo de descargarla al navegar). No-op si ya está cacheada.
      if (p.avatarUrl) Image.prefetch(p.avatarUrl).catch(() => {});
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
