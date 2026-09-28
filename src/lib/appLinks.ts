// Versionar la URL fuerza a los clientes sociales a refrescar la tarjeta cuando
// cambia su imagen. El parser y los Universal/App Links ignoran esta query.
export const WORD_GAME_SHARE_URL = 'https://quefalta.es/inicio?v=3';

export type AppLinkDestination =
  | { type: 'home' }
  | { type: 'groupInvite'; groupId: string };

/**
 * Accept only links owned by QuéFalta. Keeping the parser independent from the
 * navigation tree makes cold-start links safe to queue until the app is ready.
 */
export function parseAppLink(url: string): AppLinkDestination | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const protocol = parsed.protocol.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const isWebLink = protocol === 'https:' && (host === 'quefalta.es' || host === 'www.quefalta.es');
  const isCustomLink = protocol === 'quefalta:';
  if (!isWebLink && !isCustomLink) return null;

  let segments: string[];
  try {
    segments = [
      ...(isCustomLink && host ? [host] : []),
      ...parsed.pathname.split('/'),
    ].filter(Boolean).map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }

  if (segments.length === 1 && segments[0] === 'inicio') return { type: 'home' };
  if (segments[0] === 'join' && segments[1]) {
    return { type: 'groupInvite', groupId: segments[1] };
  }
  return null;
}
