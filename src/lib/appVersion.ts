/** Comparación de versiones comerciales numéricas; una versión desconocida no habilita gates. */
export function isVersionAtLeast(version: string | null | undefined, minimum: string): boolean {
  const parse = (value: string | null | undefined): number[] | null => {
    if (!value || !/^\d+(?:\.\d+){0,2}$/.test(value)) return null;
    const parts = value.split('.').map(Number);
    while (parts.length < 3) parts.push(0);
    return parts;
  };
  const current = parse(version);
  const target = parse(minimum);
  if (!current || !target) return false;
  for (let i = 0; i < 3; i += 1) {
    if (current[i] !== target[i]) return current[i] > target[i];
  }
  return true;
}

/** En una app instalada manda el binario; Expo Go/web ejecutan el proyecto. */
export function releaseVersionForHost(
  nativeVersion: string | null,
  projectVersion: string | null,
  isExpoGoOrWeb: boolean,
): string | null {
  return isExpoGoOrWeb ? projectVersion : nativeVersion;
}
