import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTranslation } from '../context/LanguageContext';
import { colors } from '../constants/colors';

/**
 * Insignia de cuenta QuéFalta Plus: sello festoneado con el acento de la app
 * y check blanco. La cabecera del perfil puede conservar explícitamente la
 * variante dorada. En el perfil propio se deriva directamente de isPremium; en
 * superficies públicas usa `profiles.verified`, reflejo protegido de
 * `premium_until`. Ver supabase/migrations/profile_verified.sql.
 *
 * Va dentro de una fila (flexDirection: 'row', alignItems: 'center') a la
 * derecha del nombre; el `marginLeft` ya lo separa.
 */
export default function VerifiedBadge({
  size = 15,
  marginLeft = 4,
  tone = 'accent',
}: {
  size?: number;
  marginLeft?: number;
  tone?: 'accent' | 'gold';
}) {
  const { t } = useTranslation();
  const gradientId = tone === 'gold' ? 'verifiedGold' : 'verifiedAccent';
  const startColor = tone === 'gold' ? '#F7D25A' : colors.accent;
  const endColor = tone === 'gold' ? '#D2900F' : colors.accent;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      style={{ marginLeft }}
      accessibilityRole="image"
      accessibilityLabel={t('common.verified')}
    >
      <Defs>
        <LinearGradient id={gradientId} x1="24" y1="2" x2="24" y2="46" gradientUnits="userSpaceOnUse">
          <Stop stopColor={startColor} />
          <Stop offset="1" stopColor={endColor} />
        </LinearGradient>
      </Defs>
      <Path
        d="M24,2L28.79,6.13L35,4.95L37.08,10.92L43.05,13L41.87,19.21L46,24L41.87,28.79L43.05,35L37.08,37.08L35,43.05L28.79,41.87L24,46L19.21,41.87L13,43.05L10.92,37.08L4.95,35L6.13,28.79L2,24L6.13,19.21L4.95,13L10.92,10.92L13,4.95L19.21,6.13Z"
        fill={`url(#${gradientId})`}
        stroke={`url(#${gradientId})`}
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
