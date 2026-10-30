/** React Native downloads do not depend on a CDN allowing browser canvas CORS. */
export async function pantryImageDataUrl(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Pantry image unavailable');
  const blob = await response.blob();
  if (signal.aborted) throw new Error('Pantry image cancelled');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => signal.removeEventListener('abort', abort);
    reader.onload = () => {
      cleanup();
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Pantry image unreadable'));
    };
    reader.onerror = () => { cleanup(); reject(new Error('Pantry image unreadable')); };
    reader.onabort = () => { cleanup(); reject(new Error('Pantry image cancelled')); };
    signal.addEventListener('abort', abort, { once: true });
    reader.readAsDataURL(blob);
  });
}
