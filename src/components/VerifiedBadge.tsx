import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTranslation } from '../context/LanguageContext';

/**
 * Insignia dorada de cuenta verificada: sello festoneado con degradado oro y
 * check blanco. Se pinta junto al nombre de un usuario que tenga
 * `profiles.verified = true` (marca manual desde Supabase, ver
 * supabase/migrations/profile_verified.sql). Único punto de verdad para el
 * sello: úsalo en cualquier sitio donde aparezca el nombre de una persona.
 *
 * Va dentro de una fila (flexDirection: 'row', alignItems: 'center') a la
 * derecha del nombre; el `marginLeft` ya lo separa.
 */
export default function VerifiedBadge({ size = 15 }: { size?: number }) {
  const { t } = useTranslation();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      style={{ marginLeft: 4 }}
      accessibilityRole="image"
      accessibilityLabel={t('common.verified')}
    >
      <Defs>
        <LinearGradient id="verifiedGold" x1="24" y1="2" x2="24" y2="46" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#F7D25A" />
          <Stop offset="1" stopColor="#D2900F" />
        </LinearGradient>
      </Defs>
      <Path
        d="M24,2L28.79,6.13L35,4.95L37.08,10.92L43.05,13L41.87,19.21L46,24L41.87,28.79L43.05,35L37.08,37.08L35,43.05L28.79,41.87L24,46L19.21,41.87L13,43.05L10.92,37.08L4.95,35L6.13,28.79L2,24L6.13,19.21L4.95,13L10.92,10.92L13,4.95L19.21,6.13Z"
        fill="url(#verifiedGold)"
        stroke="url(#verifiedGold)"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Path
        d="M16 24.5 l5 5 l11 -12.5"
        fill="none"
        stroke="#fff"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
