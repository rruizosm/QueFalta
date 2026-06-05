import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import HardShadow from '../components/HardShadow';

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    await signInWithGoogle();
    setLoading(false);
  };

  return (
    <View style={styles.container}>

      {/* Hero */}
      <View style={styles.hero}>
        <HardShadow style={styles.iconBox}>
          <Ionicons name="cart-outline" size={46} color={colors.white} />
        </HardShadow>

        <View style={styles.heroText}>
          <Text style={styles.title}>LaCompra</Text>
          <Text style={styles.subtitle}>
            Tu lista de la compra, compartida con quien quieras.
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={handleGoogleSignIn}
          disabled={loading}
          activeOpacity={0.85}
        >
          <HardShadow style={loading ? { ...styles.googleButton, ...styles.googleButtonDisabled } : styles.googleButton}>
            {loading ? (
              <ActivityIndicator color={colors.ink} size="small" />
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleButtonText}>Continuar con Google</Text>
              </>
            )}
          </HardShadow>
        </TouchableOpacity>

        <Text style={styles.legal}>
          Al continuar aceptas los Términos de Servicio y la Política de Privacidad.
        </Text>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingHorizontal: 26,
    paddingTop: 30,
    paddingBottom: 36,
    justifyContent: 'space-between',
  },

  // ── Hero ──────────────────────────────────────────────────────
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  iconBox: {
    width: 96,
    height: 96,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 38,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 240,
  },

  // ── Actions ───────────────────────────────────────────────────
  actions: {
    gap: 16,
    alignItems: 'stretch',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 12,
  },
  googleButtonDisabled: { opacity: 0.6 },
  googleIcon: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  legal: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: colors.inkFaint,
    textAlign: 'center',
    lineHeight: 17,
  },
});
