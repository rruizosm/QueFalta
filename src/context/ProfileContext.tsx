/**
 * ProfileContext — single source of truth for the signed-in user's profile.
 * Fetches once when a session appears, so screens read the profile instantly
 * (no empty-field flash on EditProfile). Mutations update the context locally
 * so changes show up immediately everywhere without a refetch.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { fetchProfile, updateProfile, type UserProfile } from '../api/profile';
import { initialsFromName, takePendingProfileName } from '../lib/pendingProfileName';
import { useAuth } from './AuthContext';
import { readStartupCache, startupKeys, writeStartupCache } from '../lib/startupCache';

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
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const requestId = useRef(0);
  const activeUserId = useRef<string | null>(userId);
  activeUserId.current = userId;

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const p = await fetchProfile(userId);
      if (activeUserId.current !== userId) return;

      // Nombre que Apple entregó en el primer login (buzón de pendingProfileName).
      // Solo existe justo tras un alta con Apple, cuando el perfil aún tiene el
      // nombre por defecto del trigger → lo persistimos y lo reflejamos ya.
      const pendingName = takePendingProfileName();
      if (pendingName && pendingName !== p.name) {
        const initials = initialsFromName(pendingName);
        updateProfile(userId, { name: pendingName, initials }).catch(() => {});
        const next = { ...p, name: pendingName, initials };
        setProfile(next);
        writeStartupCache(startupKeys.profile(userId), next);
      } else {
        setProfile(p);
        writeStartupCache(startupKeys.profile(userId), p);
      }

      // Calienta la caché en disco de expo-image en cuanto sabemos la URL, así
      // la foto ya está lista la primera vez que el usuario abre Perfil (sin el
      // retardo de descargarla al navegar). No-op si ya está cacheada.
      if (p.avatarUrl) Image.prefetch(p.avatarUrl).catch(() => {});
    } catch {
      // keep whatever we had cached
    } finally {
      if (activeUserId.current === userId) {
        setResolvedUserId(userId);
        setLoading(false);
      }
    }
  }, [userId]);

  // Load once per signed-in user; clear when the session goes away.
  useEffect(() => {
    const currentRequest = ++requestId.current;
    if (!userId) {
      setProfile(null);
      setResolvedUserId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const cached = await readStartupCache<UserProfile>(startupKeys.profile(userId));
      if (requestId.current !== currentRequest) return;
      // Solo una ruta ya resuelta puede acelerar el gate. Un snapshot de un
      // onboarding/región a medias podría haberse completado en otro dispositivo
      // y no debe aparecer ni un frame mientras llega la copia remota.
      if (cached?.id === userId && cached.onboardedAt && cached.region) {
        setProfile(cached);
        setResolvedUserId(userId);
        setLoading(false);
        if (cached.avatarUrl) Image.prefetch(cached.avatarUrl).catch(() => {});
      }
      // Sin caché esperamos a la red como antes; con caché, revalidamos sin
      // desmontar la app ni reabrir los gates de onboarding durante la espera.
      await refresh();
    })();
  }, [userId, refresh]);

  const applyProfile = useCallback((patch: Partial<UserProfile>) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      writeStartupCache(startupKeys.profile(prev.id), next);
      return next;
    });
  }, []);

  // Se recalcula en cada render; suficiente, porque expira con horas de margen
  // y cualquier compra/restore refresca el perfil entero.
  const isPremium =
    !!profile?.premiumUntil && new Date(profile.premiumUntil).getTime() > Date.now();
  // Al cambiar la sesión, el efecto de carga se ejecuta después del primer
  // render. Esta comprobación evita que ese render trate como listo el perfil
  // (vacío o perteneciente al usuario anterior) antes de iniciar el fetch.
  const profileLoading = !!userId && (loading || resolvedUserId !== userId);

  return (
    <ProfileContext.Provider value={{ profile, loading: profileLoading, isPremium, refresh, applyProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext);
}
