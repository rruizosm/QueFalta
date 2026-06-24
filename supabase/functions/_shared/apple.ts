// Utilidades de "Iniciar sesión con Apple" compartidas por las Edge Functions
// `apple-link` (canjea el authorizationCode por refresh_token) y `delete-account`
// (revoca el refresh_token al borrar la cuenta).
//
// Secrets necesarios (Supabase → Edge Functions → Secrets):
//   APPLE_CLIENT_ID   = com.quefalta.app   (bundle id; client_id del flujo nativo)
//   APPLE_TEAM_ID     = LX4BLQDZS4
//   APPLE_KEY_ID      = Key ID de la "Sign in with Apple" Key (.p8)
//   APPLE_PRIVATE_KEY = contenido del .p8 (PEM PKCS#8, EC P-256)
//
// Sin ellos, appleConfigured() = false y las funciones degradan sin romperse.

import * as jose from 'npm:jose@5';

export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

/** true solo si los 4 secrets de Apple están presentes. */
export function appleConfigured(): boolean {
  return Boolean(
    Deno.env.get('APPLE_CLIENT_ID') &&
    Deno.env.get('APPLE_TEAM_ID') &&
    Deno.env.get('APPLE_KEY_ID') &&
    Deno.env.get('APPLE_PRIVATE_KEY'),
  );
}

export function appleClientId(): string {
  return Deno.env.get('APPLE_CLIENT_ID')!;
}

/**
 * client_secret de Apple: un JWT ES256 firmado con la clave .p8. Caduca pronto
 * (Apple admite hasta 6 meses; 5 min sobra para una sola petición).
 */
export async function buildAppleClientSecret(): Promise<string> {
  const teamId = Deno.env.get('APPLE_TEAM_ID')!;
  const keyId = Deno.env.get('APPLE_KEY_ID')!;
  const clientId = Deno.env.get('APPLE_CLIENT_ID')!;
  // Por si el secret se guardó con saltos de línea escapados ("\n").
  const pem = Deno.env.get('APPLE_PRIVATE_KEY')!.replace(/\\n/g, '\n');

  const privateKey = await jose.importPKCS8(pem, 'ES256');

  return await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setAudience('https://appleid.apple.com')
    .setSubject(clientId)
    .sign(privateKey);
}

/**
 * Canjea el authorizationCode (del login nativo) por un refresh_token de Apple.
 * Devuelve null si Apple no entrega refresh_token o si algo falla.
 */
export async function exchangeAuthCodeForRefreshToken(
  authorizationCode: string,
): Promise<string | null> {
  const clientSecret = await buildAppleClientSecret();

  // Nota: el flujo NATIVO no lleva redirect_uri (el code viene de la app, no de
  // una web), a diferencia del flujo de Services ID.
  const res = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appleClientId(),
      client_secret: clientSecret,
      code: authorizationCode,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return (data?.refresh_token as string | undefined) ?? null;
}

/** Revoca un refresh_token en Apple. No lanza: best-effort. */
export async function revokeAppleToken(refreshToken: string): Promise<void> {
  const clientSecret = await buildAppleClientSecret();
  await fetch(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appleClientId(),
      client_secret: clientSecret,
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }),
  });
}
