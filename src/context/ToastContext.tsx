/**
 * ToastContext — mensajes breves no bloqueantes (en vez de Alert.alert para
 * confirmaciones/avisos). Se muestra sobre toda la app y se oculta solo.
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useReducedMotion } from '../hooks/useReducedMotion';

type ToastType = 'success' | 'error' | 'info';

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

const ICON: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

// El toast es siempre una superficie oscura con texto blanco (legible en claro y
// oscuro). El fondo se calcula en render para que `success` use el verde del tema
// actual; `info` usa un carbón fijo para no aclararse en modo oscuro.
const TOAST_INK = '#ffffff';
function toastBg(type: ToastType): string {
  if (type === 'error') return '#d6452b';
  if (type === 'success') return colors.ok;
  return '#2b2521';
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (reducedMotion) {
      opacity.setValue(0);
      translateY.setValue(24);
      setToast(null);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 24, duration: 180, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity, reducedMotion, translateY]);

  const show = useCallback((message: string, type: ToastType = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, type });
    AccessibilityInfo.announceForAccessibility(message);
    if (reducedMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      timer.current = setTimeout(hide, 2400);
      return;
    }
    opacity.setValue(0);
    translateY.setValue(24);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();
    timer.current = setTimeout(hide, 2400);
  }, [opacity, reducedMotion, translateY, hide]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[styles.wrap, { opacity, transform: [{ translateY }] }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <View style={[styles.toast, { backgroundColor: toastBg(toast.type) }]}>
            <Ionicons name={ICON[toast.type]} size={18} color={TOAST_INK} />
            <Text style={styles.text}>{toast.message}</Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 96,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  text: { flex: 1, fontSize: 13.5, fontFamily: fonts.semibold, color: TOAST_INK },
});
