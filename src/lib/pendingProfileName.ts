/**
 * Buzón en memoria para el nombre que un proveedor de login entrega UNA sola vez.
 * Sign in with Apple solo devuelve `fullName` en el PRIMER inicio de sesión y
 * NUNCA dentro del id_token, así que el trigger de Supabase cae al prefijo del
 * email (p. ej. "y9h4vv8kr9" del relay privado "Ocultar mi correo").
 *
 * `signInWithApple` deja aquí el nombre ANTES de crear la sesión y
 * `ProfileContext` lo recoge al cargar el perfil, escribiéndolo en BD y en la
 * caché a la vez → sin carrera con el fetch inicial del perfil.
 */
let pending: string | null = null;

export function setPendingProfileName(name: string | null): void {
  pending = name && name.trim() ? name.trim() : null;
}

/** Devuelve el nombre pendiente y lo limpia (un solo uso). */
export function takePendingProfileName(): string | null {
  const n = pending;
  pending = null;
  return n;
}

/** Iniciales para el avatar: "Rubén Ruiz" → "RR", "Rubén" → "RU". */
export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}
