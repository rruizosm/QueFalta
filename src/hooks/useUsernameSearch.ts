import { useEffect, useRef, useState } from 'react';
import { searchUsersByUsername, type SearchedUser } from '../api/groups';

const TYPEAHEAD_DELAY_MS = 100;

/**
 * Búsqueda incremental de @usuario compartida por onboarding y Amigos.
 * La primera consulta válida sale sin espera; las siguientes cancelan la
 * petición anterior y aprovechan localmente el último prefijo resuelto.
 */
export function useUsernameSearch(query: string, currentUserId: string) {
  const cleanQuery = query.trim().toLowerCase().replace(/^@/, '');
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const latestRequest = useRef(0);
  const previousInput = useRef('');
  const resolvedQuery = useRef('');
  const resolvedResults = useRef<SearchedUser[]>([]);

  useEffect(() => {
    const requestId = ++latestRequest.current;
    const priorInput = previousInput.current;
    previousInput.current = cleanQuery;

    if (cleanQuery.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }

    const canFilterResolved =
      resolvedQuery.current.length >= 2 && cleanQuery.startsWith(resolvedQuery.current);
    setResults(canFilterResolved
      ? resolvedResults.current.filter((user) => user.username?.toLowerCase().startsWith(cleanQuery))
      : []);
    setSearching(true);

    const controller = new AbortController();
    const delay = priorInput.length < 2 ? 0 : TYPEAHEAD_DELAY_MS;
    const timer = setTimeout(async () => {
      try {
        const users = await searchUsersByUsername(cleanQuery, controller.signal);
        if (controller.signal.aborted || latestRequest.current !== requestId) return;

        const visibleUsers = users.filter((user) => user.id !== currentUserId);
        resolvedQuery.current = cleanQuery;
        resolvedResults.current = visibleUsers;
        setResults(visibleUsers);
      } catch {
        if (!controller.signal.aborted && latestRequest.current === requestId) {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted && latestRequest.current === requestId) {
          setSearching(false);
        }
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cleanQuery, currentUserId]);

  return { cleanQuery, results, searching };
}
