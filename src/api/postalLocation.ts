export async function fetchPostalLocation(postalCode: string, signal: AbortSignal): Promise<{ latitude: number; longitude: number } | null> {
  if (!/^\d{5}$/.test(postalCode)) return null;
  const response = await fetch(`https://api.zippopotam.us/es/${postalCode}`, { signal });
  if (!response.ok) return null;
  const data = await response.json();
  const place = data.places?.[0];
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= 27 && latitude <= 44 && longitude >= -19 && longitude <= 5
    ? { latitude, longitude } : null;
}
