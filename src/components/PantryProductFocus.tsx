import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { fonts } from '../constants/typography';
import { colors } from '../constants/colors';
import { STORE_META } from '../constants/stores';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { isPantryExpiryDate, PANTRY_MAX_QUANTITY, PANTRY_MAX_NOTES_LENGTH,
  PANTRY_MAX_LOCATION_LENGTH,
  type PantryProduct, type PantrySection } from '../lib/pantryLayout';

type Rect = { x: number; y: number; width: number; height: number };
type Props = {
  product: PantryProduct;
  section?: PantrySection;
  quantity: number;
  notes: string;
  kitchenLocation: string;
  kitchenLocationOptions: string[];
  onKitchenLocationOptionsChange: (options: string[], removedIndex?: number) => void;
  expiryDate: string | null;
  onEdit: (patch: { quantity?: number; notes?: string; kitchenLocation?: string; expiryDate?: string | null }) => void;
  saveError: boolean;
  onRetrySave: () => void;
  onFinish: () => void;
  onAddToCart: () => Promise<void>;
  onShowDetails: () => void;
  sourceRef?: RefObject<View | null>;
  backgroundRef: RefObject<View | null>;
  onReady: () => void;
  onClose: () => void;
};

function expiryDateToInput(value: string | null): string {
  if (!value || !isPantryExpiryDate(value)) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function formatExpiryInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function expiryInputToDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const isoDate = `${year}-${month}-${day}`;
  return isPantryExpiryDate(isoDate) ? isoDate : null;
}

/** The illustration zoom is visual only; edits are scoped to the selected instance. */
export default function PantryProductFocus({ product, section = 'pantry', quantity, notes, kitchenLocation, kitchenLocationOptions,
  onKitchenLocationOptionsChange, expiryDate,
  onEdit, saveError, onRetrySave, onFinish, onAddToCart, onShowDetails, sourceRef, backgroundRef, onReady, onClose }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const [presented, setPresented] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [started, setStarted] = useState(false);
  const [origin, setOrigin] = useState<Rect | null>(null);
  const rootRef = useRef<View>(null);
  const mounted = useRef(true);
  const closing = useRef(false);
  const opening = useRef(false);
  const progress = useSharedValue(0);
  const addingRef = useRef(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notesFocused, setNotesFocused] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [editingLocations, setEditingLocations] = useState(false);
  const deletingLocation = useRef(false);
  const [locationsHeight, setLocationsHeight] = useState(0);
  const locationsAnimatedHeight = useSharedValue(0);
  const locationsProgress = useSharedValue(0);
  const [expiryFocused, setExpiryFocused] = useState(false);
  const [expiryInput, setExpiryInput] = useState(() => expiryDateToInput(expiryDate));
  const [expiryError, setExpiryError] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const keyboardVisible = size.height < window.height - 100;

  useEffect(() => {
    const config = { duration: reducedMotion ? 0 : 240, easing: Easing.inOut(Easing.cubic) };
    locationsAnimatedHeight.set(withTiming(locationsOpen ? locationsHeight : 0, config));
    locationsProgress.set(withTiming(locationsOpen ? 1 : 0, config));
  }, [locationsOpen, locationsHeight, reducedMotion, locationsAnimatedHeight, locationsProgress]);
  const locationsTransition = useAnimatedStyle(() => ({
    height: locationsAnimatedHeight.value,
    opacity: locationsProgress.value,
  }));
  const locationsChevron = useAnimatedStyle(() => ({
    transform: [{ rotate: `${locationsProgress.value * 180}deg` }],
  }));

  useEffect(() => {
    setExpiryInput(expiryDateToInput(expiryDate));
    setExpiryError(false);
  }, [expiryDate]);

  const changeExpiryInput = (value: string) => {
    const formatted = formatExpiryInput(value);
    setExpiryInput(formatted);
    setExpiryError(false);
    const digits = formatted.replace(/\D/g, '');
    if (!digits.length) {
      onEdit({ expiryDate: null });
      return;
    }
    if (digits.length === 8) {
      const parsed = expiryInputToDate(formatted);
      if (parsed) onEdit({ expiryDate: parsed });
      else setExpiryError(true);
    }
  };

  const finishExpiryInput = () => {
    setExpiryFocused(false);
    if (!expiryInput) return;
    if (!expiryInputToDate(expiryInput)) {
      setExpiryInput(expiryDateToInput(expiryDate));
      setExpiryError(true);
    }
  };

  const addToCart = async () => {
    if (addingRef.current || added || closing.current) return;
    addingRef.current = true;
    setAdding(true);
    setActionError(null);
    try {
      await onAddToCart();
      if (mounted.current) setAdded(true);
    } catch (error) {
      if (mounted.current) setActionError(error instanceof Error ? error.message : t('product.addErrorSingle'));
    } finally {
      addingRef.current = false;
      if (mounted.current) setAdding(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelAnimation(progress); };
  }, [progress]);

  const measureSource = useCallback((done: (rect: Rect | null) => void) => {
    const root = rootRef.current;
    const source = sourceRef?.current;
    if (!root || !source) { done(null); return; }
    root.measureInWindow((rootX, rootY) => {
      if (!mounted.current) return;
      source.measureInWindow((x, y, width, height) => {
        if (!mounted.current) return;
        done(width > 0 && height > 0 ? { x: x - rootX, y: y - rootY, width, height } : null);
      });
    });
  }, [sourceRef]);

  useEffect(() => {
    // Wait for the cached image before hiding the original to avoid an empty frame.
    if (!presented || !imageReady || opening.current || closing.current) return;
    opening.current = true;
    measureSource((rect) => {
      if (closing.current) return;
      setOrigin(rect);
      setStarted(true);
      onReady();
    });
  }, [presented, imageReady, measureSource, onReady]);

  useEffect(() => {
    if (!started || closing.current) return;
    progress.set(withTiming(1, {
      duration: reducedMotion ? 180 : 460,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      reduceMotion: ReduceMotion.Never,
    }));
  }, [started, progress, reducedMotion]);

  const close = (finished = false) => {
    if (closing.current) return;
    if (finished && addingRef.current) return;
    Keyboard.dismiss();
    closing.current = true;
    const complete = finished ? onFinish : onClose;
    if (!started) { complete(); return; }
    // Remeasure after a rotation so the return still lands on the real product.
    measureSource((rect) => {
      setOrigin(finished ? null : rect);
      progress.set(withTiming(0, {
        duration: reducedMotion ? 160 : 340,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        reduceMotion: ReduceMotion.Never,
      }, (finished) => { if (finished) scheduleOnRN(complete); }));
    });
  };

  const panelWidth = Math.min(520, size.width - 24);
  const safeBottomGap = keyboardVisible ? 8 : insets.bottom + 12;
  const panelBottom = keyboardVisible ? safeBottomGap : 12;
  const top = insets.top + 56;
  const availableHeight = Math.max(1, size.height - top - safeBottomGap);
  const panelContentHeight = keyboardVisible ? availableHeight : Math.min(560, availableHeight * 0.75);
  const panelHeight = keyboardVisible ? panelContentHeight : panelContentHeight + safeBottomGap - panelBottom;
  const panelTop = size.height - panelBottom - panelHeight;
  // The close button sits beside the hero: use the space below the safe area,
  // without borrowing height from the editable panel or changing saved art sizes.
  const imageTop = insets.top + 4;
  const imageSide = Math.max(1, Math.min(320, size.width - 80, panelTop - imageTop - 8));
  const targetX = (size.width - imageSide) / 2;
  const targetY = imageTop + (panelTop - imageTop - imageSide) / 2;
  const fade = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panel = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reducedMotion ? 0 : (panelHeight + panelBottom) * (1 - progress.value) }],
  }));
  const zoom = useAnimatedStyle(() => {
    const p = progress.value;
    if (keyboardVisible) return { opacity: 0 };
    if (reducedMotion || !origin) return { opacity: started ? p : 0 };
    return {
      opacity: started ? 1 : 0,
      transform: [
        { translateX: (origin.x + origin.width / 2 - targetX - imageSide / 2) * (1 - p) },
        { translateY: (origin.y + origin.height / 2 - targetY - imageSide / 2) * (1 - p) },
        { scale: origin.width / imageSide + (1 - origin.width / imageSide) * p },
      ],
    };
  });

  return <Modal visible transparent animationType="none" presentationStyle="overFullScreen"
    statusBarTranslucent navigationBarTranslucent onShow={() => setPresented(true)} onRequestClose={() => close()}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, fade]}>
      <BlurView testID="pantry-focus-blur" tint="dark" intensity={65}
        blurTarget={backgroundRef} blurMethod="dimezisBlurView" blurReductionFactor={4}
        style={StyleSheet.absoluteFill} />
    </Animated.View>
    <Animated.View pointerEvents="none" style={[styles.backdrop, fade]} />
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View ref={rootRef} collapsable={false} style={styles.root} accessibilityViewIsModal
      onAccessibilityEscape={() => close()} onLayout={({ nativeEvent: { layout } }) => {
        setSize(layout);
        if (notesFocused || expiryFocused) requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: !reducedMotion }));
      }}>
      <Pressable testID="pantry-focus-dismiss" style={StyleSheet.absoluteFill} onPress={() => close()} accessible={false} />
      <Animated.View testID="pantry-focus-panel" style={[styles.panel,
        { width: panelWidth, left: (size.width - panelWidth) / 2, top: panelTop, bottom: panelBottom }, panel]}>
        <View pointerEvents="none" style={styles.panelSheen}>
          <LinearGradient colors={[colors.accentLight, 'transparent']} style={StyleSheet.absoluteFill} />
        </View>
        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={styles.detailsScroll}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          contentContainerStyle={styles.details}>
          <View style={styles.heading}>
            <View style={styles.nameRow}>
              <Image source={STORE_META[product.store ?? 'mercadona'].icon} style={styles.storeLogo}
                contentFit="contain" accessible accessibilityLabel={STORE_META[product.store ?? 'mercadona'].name} />
              <Text accessibilityRole="header" style={styles.name}>{product.name}</Text>
              <Pressable testID="pantry-focus-details" accessibilityRole="button"
                accessibilityLabel={t('pantry.productDetails')} accessibilityHint={t('pantry.productDetailsHint')}
                onPress={onShowDetails} hitSlop={4}
                style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed]}>
                <Ionicons name="information-circle-outline" size={20} color={colors.accent} />
              </Pressable>
            </View>
          </View>
          <View testID="pantry-focus-fields" style={styles.fields}>
            <View style={[styles.field, styles.compactField, styles.quantityField,
              (window.fontScale > 1.4 || size.width < 360) && styles.largeQuantityField]}>
              <View style={[styles.fieldHeading, styles.compactFieldHeading]}>
                <View style={styles.compactFieldIcon}><Ionicons name="cube-outline" size={18} color={colors.accent} /></View>
                <View style={styles.fieldText}>
                  <Text style={styles.label}>{t('pantry.quantity')}</Text>
                </View>
              </View>
              <View style={styles.stepper}>
                <Pressable testID="pantry-focus-decrease" accessibilityRole="button"
                  accessibilityLabel={t('pantry.decreaseQuantity')} disabled={quantity <= 1}
                  accessibilityState={{ disabled: quantity <= 1 }} onPress={() => onEdit({ quantity: quantity - 1 })}
                  hitSlop={9}
                  style={({ pressed }) => [styles.stepButton, styles.stepRemove,
                    quantity <= 1 && styles.stepDisabled, pressed && styles.stepPressed,
                    pressed && !reducedMotion && styles.stepCompressed]}>
                  <Ionicons name="remove" size={13} color={quantity <= 1 ? colors.inkFaint : colors.ink} />
                </Pressable>
                <Text testID="pantry-focus-quantity" accessibilityLiveRegion="polite"
                  accessibilityLabel={t(quantity === 1 ? 'pantry.oneUnit' : 'pantry.units', { count: quantity })}
                  style={styles.quantity}>{quantity}</Text>
                <Pressable testID="pantry-focus-increase" accessibilityRole="button"
                  accessibilityLabel={t('pantry.increaseQuantity')} disabled={quantity >= PANTRY_MAX_QUANTITY}
                  accessibilityState={{ disabled: quantity >= PANTRY_MAX_QUANTITY }} onPress={() => onEdit({ quantity: quantity + 1 })}
                  hitSlop={9}
                  style={({ pressed }) => [styles.stepButton, styles.stepAdd,
                    quantity >= PANTRY_MAX_QUANTITY && styles.stepDisabled, pressed && styles.stepPressed,
                    pressed && !reducedMotion && styles.stepCompressed]}>
                  <Ionicons name="add" size={14} color={quantity >= PANTRY_MAX_QUANTITY ? colors.inkFaint : '#FFFFFF'} />
                </Pressable>
              </View>
            </View>
            <View style={[styles.field, styles.compactField, expiryFocused && styles.activeField]}>
              <View style={[styles.fieldHeading, styles.compactFieldHeading]}>
                <View style={styles.compactFieldIcon}><Ionicons name="calendar-outline" size={18} color={colors.accent} /></View>
                <Text style={[styles.label, styles.fieldText]}>{t('pantry.expiry')}</Text>
                <TextInput testID="pantry-focus-expiry" accessibilityLabel={t('pantry.expiry')}
                  value={expiryInput} onChangeText={changeExpiryInput} onFocus={() => {
                    setExpiryFocused(true);
                    setExpiryError(false);
                    setLocationsOpen(false);
                  }} onBlur={finishExpiryInput}
                  placeholder={t('pantry.expiryPlaceholder')} placeholderTextColor={colors.inkFaint}
                  keyboardType="number-pad" maxLength={10} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()}
                  selectionColor={colors.accent} style={styles.expiryInput} />
                {(expiryInput.length > 0 || expiryDate) && <Pressable testID="pantry-focus-clear-expiry"
                  accessibilityRole="button" accessibilityLabel={t('pantry.clearExpiry')}
                  onPress={() => {
                    setExpiryInput('');
                    setExpiryError(false);
                    onEdit({ expiryDate: null });
                  }} hitSlop={8} style={({ pressed }) => [styles.clearExpiry, pressed && styles.pressed]}>
                  <Ionicons name="close-circle" size={20} color={colors.inkFaint} />
                </Pressable>}
              </View>
              <Text style={styles.expiryNote}>{t('pantry.expiryNotificationNote')}</Text>
              {expiryError && <Text accessibilityRole="alert" style={[styles.error, styles.expiryError]}>
                {t('pantry.expiryInvalid')}
              </Text>}
            </View>
            <View style={[styles.field, styles.locationField, locationsOpen && styles.activeField]}>
              <Pressable testID="pantry-focus-location-options" accessibilityRole="button"
                accessibilityLabel={`${t('pantry.location')}: ${kitchenLocation || t('pantry.chooseKitchenLocation')}`}
                accessibilityState={{ expanded: locationsOpen }}
                onPress={() => { Keyboard.dismiss(); setLocationsOpen((open) => !open); }}
                style={({ pressed }) => [styles.locationControl, pressed && styles.pressed]}>
                <View style={styles.locationFieldIcon}><Ionicons name="location-outline" size={18} color={colors.accent} /></View>
                <Text style={styles.label}>{t('pantry.location')}</Text>
                <Text numberOfLines={1} style={[styles.locationValue, !kitchenLocation && styles.locationPlaceholder]}>
                  {kitchenLocation || t('pantry.chooseKitchenLocation')}
                </Text>
                <Animated.View style={locationsChevron}>
                  <Ionicons name="chevron-down" size={18} color={colors.inkSoft} />
                </Animated.View>
              </Pressable>
              <Animated.View style={[styles.locationOptionsClip, locationsTransition]}
                pointerEvents={locationsOpen ? 'auto' : 'none'} accessibilityElementsHidden={!locationsOpen}
                importantForAccessibility={locationsOpen ? 'auto' : 'no-hide-descendants'}>
              <View style={styles.locationOptionsMeasure} onLayout={({ nativeEvent }) => setLocationsHeight(nativeEvent.layout.height)}>
              <View style={styles.locationOptions}>
                {kitchenLocationOptions.map((option, index) => <View key={index}
                  style={[styles.locationOption, kitchenLocation === option && styles.selectedLocationOption]}>
                  <Pressable disabled={editingLocations} testID={`pantry-focus-location-option-${index}`}
                    accessible={!editingLocations}
                    accessibilityRole="button" accessibilityLabel={option}
                    accessibilityState={{ selected: kitchenLocation === option }}
                    onPress={() => { onEdit({ kitchenLocation: option }); setLocationsOpen(false); }}
                    style={styles.locationOptionText}>
                    <Text numberOfLines={1} style={[styles.locationOptionLabel,
                      kitchenLocation === option && styles.selectedLocationOptionLabel,
                      editingLocations && styles.locationTextMeasure]}>{option || t('pantry.defaultKitchenLocation', { number: index + 1 })}</Text>
                  {editingLocations && <TextInput testID={`pantry-focus-location-edit-${index}`}
                    accessibilityLabel={`${t('pantry.location')} ${index + 1}`} value={option}
                    onChangeText={(value) => {
                      const next = [...kitchenLocationOptions];
                      next[index] = value.slice(0, PANTRY_MAX_LOCATION_LENGTH);
                      onKitchenLocationOptionsChange(next);
                    }} onEndEditing={({ nativeEvent }) => {
                      if (!deletingLocation.current && !nativeEvent.text.trim()) {
                        const next = [...kitchenLocationOptions];
                        next[index] = t('pantry.defaultKitchenLocation', { number: index + 1 });
                        onKitchenLocationOptionsChange(next);
                      }
                    }} maxLength={PANTRY_MAX_LOCATION_LENGTH} returnKeyType="done"
                    placeholder={t('pantry.defaultKitchenLocation', { number: index + 1 })}
                    placeholderTextColor={colors.inkFaint} style={[styles.locationOptionInput,
                      kitchenLocation === option && styles.selectedLocationOptionLabel]} />}
                  </Pressable>
                  <View style={styles.locationOptionAction}>
                    {editingLocations ? <Pressable testID={`pantry-focus-delete-location-${index}`}
                      accessibilityRole="button" accessibilityLabel={t('pantry.deleteKitchenLocation', { name: option })}
                      onPress={() => {
                        deletingLocation.current = true;
                        Keyboard.dismiss();
                        onKitchenLocationOptionsChange(kitchenLocationOptions.filter((_, optionIndex) => optionIndex !== index), index);
                        requestAnimationFrame(() => { deletingLocation.current = false; });
                      }} style={({ pressed }) => [styles.locationDeleteButton, pressed && styles.pressed]}>
                      <Ionicons name="trash-outline" size={16} color={colors.red} />
                    </Pressable> : kitchenLocation === option && <Ionicons name="checkmark" size={16} color={colors.accent} />}
                  </View>
                </View>)}
                {editingLocations && <Pressable testID="pantry-focus-add-location" accessibilityRole="button"
                  accessibilityLabel={t('pantry.addKitchenLocation')} onPress={() => {
                    let number = kitchenLocationOptions.length + 1;
                    let name = t('pantry.defaultKitchenLocation', { number });
                    while (kitchenLocationOptions.includes(name)) name = t('pantry.defaultKitchenLocation', { number: ++number });
                    onKitchenLocationOptionsChange([...kitchenLocationOptions, name]);
                  }} style={({ pressed }) => [styles.addLocationOption, pressed && styles.pressed]}>
                  <Ionicons name="add" size={18} color={colors.accent} />
                </Pressable>}
                <View style={styles.locationOptionsFooter}>
                  <Pressable testID="pantry-focus-edit-locations" accessibilityRole="button"
                    accessibilityLabel={t('pantry.editKitchenLocations')} onPress={() => setEditingLocations((editing) => !editing)}
                    style={({ pressed }) => [styles.editLocationsButton, pressed && styles.pressed]}>
                    <Ionicons name={editingLocations ? 'checkmark' : 'pencil-outline'} size={17} color={colors.accent} />
                  </Pressable>
                </View>
              </View>
              </View>
              </Animated.View>
            </View>
            <View style={[styles.field, styles.notesField, notesFocused && styles.activeField]}>
              <View style={styles.notesRow}>
                <View style={styles.notesIcon}><Ionicons name="create-outline" size={20} color={colors.accent} /></View>
                <TextInput testID="pantry-focus-notes" accessibilityLabel={t('pantry.notesPlaceholder')}
                value={notes} onChangeText={(text) => onEdit({ notes: text })}
                onFocus={() => { setNotesFocused(true); setLocationsOpen(false); }} onBlur={() => setNotesFocused(false)}
                placeholder={t('pantry.notesPlaceholder')} placeholderTextColor={colors.inkFaint}
                multiline maxLength={PANTRY_MAX_NOTES_LENGTH} textAlignVertical="top"
                selectionColor={colors.accent} style={styles.notesInput} />
              </View>
            </View>
          </View>
          {saveError && <Pressable testID="pantry-focus-save-error" onPress={onRetrySave} accessibilityRole="button"
            accessibilityLabel={`${t('pantry.saveError')} ${t('common.retry')}`} style={styles.saveError}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.red} />
            <Text accessibilityLiveRegion="polite" style={[styles.error, styles.fieldText]}>
              {t('pantry.saveError')} · {t('common.retry')}
            </Text>
          </Pressable>}
          {actionError && <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
            testID="pantry-focus-error" style={styles.error}>{actionError}</Text>}
          {!keyboardVisible && <View style={styles.actions}>
            <Pressable testID="pantry-focus-add-cart" accessibilityRole="button"
              accessibilityLabel={t(adding ? 'pantry.addingToCart' : added ? 'pantry.addedToCart' : 'pantry.addToCart')}
              accessibilityHint={t('pantry.cartOneUnitHint')}
              accessibilityState={{ disabled: adding || added, busy: adding }} disabled={adding || added}
              onPress={addToCart} style={({ pressed }) => [styles.action, styles.primaryAction,
                added && styles.addedAction, pressed && styles.actionPressed,
                pressed && !reducedMotion && styles.actionCompressed]}>
              <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']}
                style={styles.actionSheen} />
              <View style={[styles.actionIcon, styles.primaryActionIcon]}>
                {adding ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Ionicons name={added ? 'checkmark' : 'cart-outline'} size={20} color="#FFFFFF" />}
              </View>
              <Text accessibilityLiveRegion="polite" style={styles.primaryLabel}>
                {t(adding ? 'pantry.addingToCart' : added ? 'pantry.addedToCart' : 'pantry.addToCart')}
              </Text>
            </Pressable>
            <Pressable testID="pantry-focus-finished" accessibilityRole="button" accessibilityLabel={t('pantry.finished')}
              accessibilityHint={t(section === 'fridge' ? 'pantry.fridgeFinishHint' : 'pantry.finishHint')}
              accessibilityState={{ disabled: adding }} disabled={adding} onPress={() => close(true)}
              style={({ pressed }) => [styles.action, styles.secondaryAction,
                adding && styles.actionDisabled, pressed && styles.actionPressed,
                pressed && !reducedMotion && styles.actionCompressed]}>
              <View style={[styles.actionIcon, styles.secondaryActionIcon]}>
                <Ionicons name="checkmark-done-outline" size={20} color={colors.inkSoft} />
              </View>
              <Text style={styles.secondaryLabel}>{t('pantry.finished')}</Text>
            </Pressable>
          </View>}
        </ScrollView>
        {keyboardVisible && <Pressable accessibilityRole="button" accessibilityLabel={t('pantry.doneEditing')}
          onPress={() => Keyboard.dismiss()} style={styles.keyboardDone}>
          <Text style={styles.doneLabel}>{t('pantry.doneEditing')}</Text>
          <Ionicons name="checkmark" size={20} color={colors.accent} />
        </Pressable>}
      </Animated.View>
      <Animated.View testID="pantry-focus-product" pointerEvents="none"
        style={[styles.product, { left: targetX, top: targetY, width: imageSide, height: imageSide }, zoom]}>
        <Image source={product.illustrationUrl} style={StyleSheet.absoluteFill} contentFit="contain"
          cachePolicy="memory-disk" transition={0} accessible accessibilityLabel={product.name}
          onLoad={() => setImageReady(true)} onError={() => { setImageError(true); setImageReady(true); }} />
        {imageError && <Ionicons name="image-outline" size={48} color="#FFF0D4" />}
      </Animated.View>
      <Pressable testID="pantry-focus-close" accessibilityRole="button" accessibilityLabel={t('common.close')}
        onPress={() => close()} style={({ pressed }) => [styles.close, { top: insets.top + 8 }, pressed && styles.pressed]}>
        <Ionicons name="close" size={23} color="#FFFFFF" />
      </Pressable>
    </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const themedStyles = () => StyleSheet.create({
  root: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20, 17, 15, 0.24)' },
  panel: { position: 'absolute', borderTopLeftRadius: 30, borderTopRightRadius: 30,
    borderBottomLeftRadius: 36, borderBottomRightRadius: 36, backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#100C08', shadowOpacity: 0.24, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  panelSheen: { ...StyleSheet.absoluteFill, bottom: undefined, height: 150, overflow: 'hidden', borderTopLeftRadius: 29, borderTopRightRadius: 29 },
  detailsScroll: { flex: 1, minHeight: 0, borderTopLeftRadius: 29, borderTopRightRadius: 29,
    borderBottomLeftRadius: 35, borderBottomRightRadius: 35 },
  details: { padding: 18, paddingTop: 16, paddingBottom: 14, gap: 10, flexGrow: 1 },
  heading: { gap: 10 },
  storeLogo: { width: 28, height: 28 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { flex: 1, color: colors.ink, fontFamily: fonts.bold, fontSize: 19, lineHeight: 23, letterSpacing: -0.4 },
  detailsButton: { width: 38, height: 38, borderRadius: 14, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  fields: { gap: 8 },
  field: { padding: 12, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  activeField: { borderColor: colors.accentMid },
  quantityField: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  compactField: { padding: 8 },
  compactFieldHeading: { gap: 8 },
  compactFieldIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center' },
  largeQuantityField: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  fieldHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  fieldIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center' },
  fieldText: { flex: 1 },
  label: { color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 12 },
  hint: { marginTop: 3, color: colors.ink, fontFamily: fonts.semibold, fontSize: 13 },
  value: { marginTop: 3, color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  clearExpiry: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  expiryInput: { width: 112, color: colors.ink, fontFamily: fonts.semibold, fontSize: 15,
    padding: 0, paddingHorizontal: 2, minHeight: 32, textAlign: 'right' },
  expiryNote: { color: colors.inkFaint, fontFamily: fonts.medium, fontSize: 10, lineHeight: 13, marginTop: 3 },
  expiryError: { marginTop: 3 },
  locationField: { padding: 8 },
  locationControl: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationFieldIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center' },
  locationValue: { flex: 1, minWidth: 0, color: colors.ink, fontFamily: fonts.semibold, fontSize: 13, textAlign: 'right' },
  locationPlaceholder: { color: colors.inkFaint, fontFamily: fonts.medium },
  locationOptionsClip: { overflow: 'hidden' },
  locationOptionsMeasure: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 6 },
  locationOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 6,
    borderTopWidth: 1, borderTopColor: colors.border },
  locationOptionsFooter: { width: '100%', alignItems: 'flex-end' },
  editLocationsButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  addLocationOption: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.accentMid,
    backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  locationOptionText: { flexShrink: 1, justifyContent: 'center' },
  locationTextMeasure: { opacity: 0 },
  locationOptionAction: { width: 22, height: 20, alignItems: 'center', justifyContent: 'center' },
  locationDeleteButton: { width: 22, height: 28, alignItems: 'center', justifyContent: 'center' },
  locationOptionInput: { ...StyleSheet.absoluteFill, padding: 0,
    color: colors.ink, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  locationOption: { minHeight: 36, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 11,
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  selectedLocationOption: { backgroundColor: colors.accentLight, borderColor: colors.accentMid },
  locationOptionLabel: { flexShrink: 1, color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  selectedLocationOptionLabel: { color: colors.ink, fontFamily: fonts.semibold },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0 },
  stepButton: { width: 26, height: 26, borderRadius: 13, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  stepRemove: { backgroundColor: colors.white, borderColor: colors.border, shadowColor: '#24170E', shadowOpacity: 0.07 },
  stepAdd: { backgroundColor: colors.accent, borderColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.24 },
  quantity: { minWidth: 28, paddingHorizontal: 1, textAlign: 'center', color: colors.ink,
    fontFamily: fonts.bold, fontSize: 16, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  stepDisabled: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, shadowOpacity: 0, elevation: 0 },
  stepPressed: { opacity: 0.82, shadowOpacity: 0, elevation: 0 },
  stepCompressed: { transform: [{ scale: 0.94 }] },
  notesInput: { color: colors.ink, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21,
    flex: 1, minWidth: 0, padding: 0, paddingVertical: 6, paddingHorizontal: 2, minHeight: 34, maxHeight: 72 },
  notesField: { padding: 8 },
  notesRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notesIcon: { width: 28, height: 28, borderRadius: 10, backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center' },
  counter: { color: colors.inkFaint, fontFamily: fonts.regular, fontSize: 11 },
  error: { color: colors.red, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  saveError: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { marginTop: 'auto', flexDirection: 'row', gap: 8 },
  action: { flex: 1, minWidth: 0, minHeight: 62, borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 7, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionIcon: { width: 26, height: 26, borderRadius: 13, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center' },
  primaryActionIcon: { backgroundColor: 'rgba(255,255,255,0.16)' },
  secondaryActionIcon: { backgroundColor: colors.surfaceAlt },
  actionSheen: { ...StyleSheet.absoluteFill, borderRadius: 19 },
  primaryAction: { backgroundColor: colors.accent, borderColor: colors.accent,
    shadowColor: colors.accent, shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  addedAction: { backgroundColor: '#347A43', borderColor: '#347A43', shadowColor: '#347A43' },
  primaryLabel: { width: '100%', color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 12, lineHeight: 15, textAlign: 'center' },
  secondaryAction: { backgroundColor: colors.white, borderColor: colors.border,
    shadowColor: '#24170E', shadowOpacity: 0.04, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  secondaryLabel: { width: '100%', color: colors.ink, fontFamily: fonts.semibold, fontSize: 12, lineHeight: 15, textAlign: 'center' },
  actionDisabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  actionPressed: { opacity: 0.88, shadowOpacity: 0, elevation: 0 },
  actionCompressed: { transform: [{ scale: 0.98 }] },
  keyboardDone: { minHeight: 44, paddingHorizontal: 18, flexDirection: 'row', gap: 6,
    alignItems: 'center', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: colors.border },
  doneLabel: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 14 },
  pressed: { opacity: 0.65 },
  product: { position: 'absolute', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000000', shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  close: { position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
});
