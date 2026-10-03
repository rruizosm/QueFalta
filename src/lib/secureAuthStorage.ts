export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface SecureStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

// Publish the pointer only after all encrypted chunks have been written.
// An interrupted write leaves the previous slot readable on the next launch.
// A tombstone prevents legacy data from resurrecting a signed-out session.
type Head = { slot: 0 | 1; count: number } | 'removed';
const MAX_CHUNKS = 1024;
function count(raw: string): number {
  if (!/^\d+$/.test(raw) || Number(raw) > MAX_CHUNKS) {
    throw new Error('Invalid secure auth storage count');
  }
  return Number(raw);
}

// UTF-8 bytes, not UTF-16 units: profile names may contain emoji.
function split(value: string): string[] {
  const parts: string[] = [];
  let part = '';
  let bytes = 0;
  for (const char of value) {
    const cp = char.codePointAt(0)!;
    const size = cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    if (bytes + size > 2000) { parts.push(part); part = ''; bytes = 0; }
    part += char;
    bytes += size;
  }
  if (part) parts.push(part);
  if (parts.length > MAX_CHUNKS) throw new Error('Secure auth storage value too large');
  return parts;
}

export function createSecureAuthStorage(secure: SecureStore, legacy: AuthStorage): AuthStorage {
  const queues = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
    queues.set(key, next);
    const release = () => { if (queues.get(key) === next) queues.delete(key); };
    void next.then(release, release);
    return next;
  }
  const headKey = (key: string) => `${key}.v2.head`;
  const slotKey = (key: string, slot: number) => `${key}.v2.${slot}`;
  async function head(key: string): Promise<Head | null> {
    const raw = await secure.getItemAsync(headKey(key));
    if (raw === null || raw === 'removed') return raw;
    const match = /^([01]):(\d+)$/.exec(raw);
    if (!match) throw new Error('Invalid secure auth storage pointer');
    return { slot: Number(match[1]) as 0 | 1, count: count(match[2]) };
  }
  async function readChunks(prefix: string, length: number): Promise<string> {
    const parts: string[] = [];
    for (let i = 0; i < length; i++) {
      const part = await secure.getItemAsync(`${prefix}.${i}`);
      // A Keychain failure is not a signed-out session. Preserve the data and
      // propagate the error so callers don't silently send anonymous requests.
      if (part === null) throw new Error('Incomplete secure auth storage value');
      parts.push(part);
    }
    return parts.join('');
  }
  async function clear(prefix: string): Promise<void> {
    const raw = await secure.getItemAsync(`${prefix}.cnt`);
    if (raw !== null) {
      for (let i = 0; i < count(raw); i++) await secure.deleteItemAsync(`${prefix}.${i}`);
      await secure.deleteItemAsync(`${prefix}.cnt`);
    }
  }
  async function cleanLegacy(key: string): Promise<void> {
    await clear(key);
    await legacy.removeItem(key);
  }
  async function write(key: string, value: string): Promise<void> {
    const previous = await head(key);
    const slot = previous && previous !== 'removed' && previous.slot === 0 ? 1 : 0;
    const prefix = slotKey(key, slot);
    const parts = split(value);
    await clear(prefix);
    await secure.setItemAsync(`${prefix}.cnt`, String(parts.length));
    for (let i = 0; i < parts.length; i++) await secure.setItemAsync(`${prefix}.${i}`, parts[i]);
    await secure.setItemAsync(headKey(key), `${slot}:${parts.length}`);
    // Cleanup cannot turn a committed token rotation into a failed save.
    if (previous && previous !== 'removed') await clear(slotKey(key, previous.slot)).catch(() => {});
    await cleanLegacy(key).catch(() => {});
  }
  return {
    getItem: (key) => serial(key, async () => {
      const current = await head(key);
      if (current === 'removed') return null;
      if (current) return readChunks(slotKey(key, current.slot), current.count);
      const oldCount = await secure.getItemAsync(`${key}.cnt`);
      const value = oldCount !== null
        ? await readChunks(key, count(oldCount))
        : await legacy.getItem(key);
      if (value !== null) await write(key, value);
      return value;
    }),
    setItem: (key, value) => serial(key, () => write(key, value)),
    removeItem: (key) => serial(key, async () => {
      await secure.setItemAsync(headKey(key), 'removed');
      await Promise.allSettled([
        clear(slotKey(key, 0)), clear(slotKey(key, 1)), cleanLegacy(key),
      ]);
    }),
  };
}
