import type { ViewInstance } from 'react-native';
/* Reanimated values are UI-runtime handles, updated by gesture worklets. */
/* eslint-disable react-hooks/immutability */
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { availablePantrySlots, pantryMoveSpaces, pantryDropPlacement, type PantryMoveSpace, clampPantryPlacement, insertPantryPlacement, pantryProductWidth, pantryHorizontalExtents,
  pantryShelfIndex, pantryShelfSurfaceY, pantryCanvasHeightRatio, pantryQuantity, pantryExpiryStatus, PANTRY_SLOT_COUNT,
  PANTRY_ASPECT_RATIO, PANTRY_DEFAULT_SIZE, PANTRY_DEFAULT_SHELF_COUNT, type PantryItem, type PantryPlacement,
  type PantryShelfLabel as ShelfLabel } from '../lib/pantryLayout';
import { PagerGestureContext } from './bottom-tabs-pager/PagerGestureContext';
import PantryWoodShelf, { PANTRY_SHELF_WIDTH_RATIO } from './PantryWoodShelf';
import PantryShelfLabel from './PantryShelfLabel';
import { pantryImageBoundsCache } from './PantryImageBoundsProbe';
import type { PantryVisibleBounds } from '../lib/pantryVisibleBounds';
import PantryNoteButton from './PantryNoteButton';
import PantryExpiryAlarm from './PantryExpiryAlarm';

const LABEL_ROW_HEIGHT = 40;

type Positions = Record<string, PantryPlacement>;
type ItemProps = {
  today?: string;
  item: PantryItem;
  selected: boolean;
  hidden?: boolean;
  visibleBounds?: PantryVisibleBounds;
  width: number;
  height: number;
  shelfCount: number;
  onSelect: (instanceId: string, sourceRef?: RefObject<ViewInstance | null>) => void;
  onRemove?: (instanceId: string) => void;
  notesEnabled: boolean;
  onPlace: (instanceId: string, placement: PantryPlacement, beforeId?: string | null) => void;
  onCancelPlacement: () => void;
  positions: SharedValue<Positions>;
  moveSpaces: SharedValue<PantryMoveSpace[]>;
  activeMove: SharedValue<string | null>;
  scrollGesture: GestureType;
  testIDPrefix: string;
  interactionsDisabled: boolean;
  animatedShelfOffsets: SharedValue<number[]>;
};

const PlacedProduct = memo(function PlacedProduct({ item, today, selected, hidden, width, height, shelfCount, onSelect, onPlace, onCancelPlacement, positions, moveSpaces, activeMove, scrollGesture, testIDPrefix, interactionsDisabled, onRemove, notesEnabled, visibleBounds, animatedShelfOffsets }: ItemProps) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const pager = useContext(PagerGestureContext);
  const imageRef = useRef<ViewInstance>(null);
  const select = useCallback(() => {
    if (!interactionsDisabled && !onRemove) onSelect(item.instanceId, imageRef);
  }, [item.instanceId, onSelect, interactionsDisabled, onRemove]);
  const [imageError, setImageError] = useState(false);
  // Capture geometry only in worklets, never product names/remote image URLs.
  const initial = useMemo(() => clampPantryPlacement(item, shelfCount), [item, shelfCount]);
  const originPositions = useSharedValue<Positions>({});
  const startX = useSharedValue(initial.x);
  const startY = useSharedValue(initial.y);
  const dragging = useSharedValue(false);
  const floating = useSharedValue(false);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const instanceId = item.instanceId;

  useEffect(() => { setImageError(false); }, [item.product.illustrationUrl]);

  const gesture = useMemo(() => {
    const current = () => {
      'worklet';
      return positions.value[instanceId];
    };
    const commit = () => {
      'worklet';
      const entry = current();
      if (entry) {
        const ids = Object.keys(positions.value).filter(id => pantryShelfIndex(positions.value[id], shelfCount) === pantryShelfIndex(entry, shelfCount))
          .sort((a, b) => positions.value[a].x - pantryHorizontalExtents(positions.value[a]).left
            - (positions.value[b].x - pantryHorizontalExtents(positions.value[b]).left));
        runOnJS(onPlace)(instanceId, entry, ids[ids.indexOf(instanceId) + 1] ?? null);
      }
    };
    const pan = Gesture.Pan().enabled(!interactionsDisabled && !onRemove).activateAfterLongPress(350).maxPointers(1)
      .onStart(() => {
        const entry = current();
        if (!entry) return;
        if (activeMove.value && activeMove.value !== instanceId) return;
        originPositions.value = positions.value;
        dragging.value = true;
        floating.value = true;
        activeMove.value = instanceId;
        moveSpaces.value = pantryMoveSpaces(positions.value, instanceId, shelfCount);
        startX.value = entry.x;
        startY.value = entry.y * height + (animatedShelfOffsets.value[pantryShelfIndex(entry, shelfCount)] ?? 0);
        dragX.value = startX.value * width;
        dragY.value = startY.value;
      })
      .onUpdate((event) => {
        const entry = current();
        if (!entry || !dragging.value || activeMove.value !== instanceId) return;
        // Keep the held photo under the finger while neighbours make room.
        dragX.value = startX.value * width + event.translationX;
        dragY.value = startY.value + event.translationY;
        const baseline = originPositions.value;
        const desired = pantryDropPlacement(baseline, instanceId, dragX.value / width,
          (dragY.value + entry.size * width / 2) / height, shelfCount,
          animatedShelfOffsets.value.map(offset => offset / height));
        const next = desired ? insertPantryPlacement(baseline, instanceId, desired, shelfCount) : null;
        positions.value = next ?? baseline;
        moveSpaces.value = pantryMoveSpaces(positions.value, instanceId, shelfCount);
      })
      .onFinalize((_event, success) => {
        if (!dragging.value) return;
        const entry = current();
        const desired = success && activeMove.value === instanceId && entry
          ? pantryDropPlacement(originPositions.value, instanceId, dragX.value / width,
            (dragY.value + entry.size * width / 2) / height, shelfCount,
            animatedShelfOffsets.value.map(offset => offset / height)) : null;
        const next = desired ? insertPantryPlacement(originPositions.value, instanceId, desired, shelfCount) : null;
        dragging.value = false;
        if (!next && activeMove.value === instanceId) positions.value = originPositions.value;
        activeMove.value = null;
        moveSpaces.value = [];
        if (next) {
          positions.value = next;
          commit();
        } else runOnJS(onCancelPlacement)();
        const target = positions.value[instanceId];
        if (!target) { floating.value = false; return; }
        const targetX = target.x * width;
        const targetY = target.y * height + (animatedShelfOffsets.value[pantryShelfIndex(target, shelfCount)] ?? 0);
        const duration = reducedMotion ? 0 : 220;
        dragX.value = withTiming(targetX, { duration });
        dragY.value = withTiming(targetY, { duration }, finished => {
          if (finished) floating.value = false;
        });
      });
    const tap = Gesture.Tap().enabled(!interactionsDisabled && !onRemove).maxDistance(8).onEnd((_event, success) => {
      if (success) runOnJS(select)();
    });
    pan.blocksExternalGesture(scrollGesture);
    tap.blocksExternalGesture(scrollGesture);
    if (pager) {
      pan.blocksExternalGesture(pager);
      tap.blocksExternalGesture(pager);
    }
    return Gesture.Race(pan, tap);
  }, [pager, scrollGesture, width, height, shelfCount, select, onPlace, onCancelPlacement, instanceId, positions, startX, startY, dragging, interactionsDisabled, onRemove, animatedShelfOffsets, moveSpaces, activeMove, dragX, dragY, floating, reducedMotion, originPositions]);

  const placement = useAnimatedStyle(() => {
    const current = positions.value[instanceId];
    // New items can mount before the UI-thread snapshot catches up. Their
    // persisted placement is already valid; never hide them during that handoff.
    const next = current ?? initial;
    const frameWidth = pantryProductWidth(next.size, next.visibleBounds) * width;
    const frameLeft = next.visibleBounds ? pantryHorizontalExtents(next).left * width : frameWidth / 2;
    const imageSide = next.size * width;
    return {
      // Translate the fixed frame; moving left/top would run native layout on every drag frame.
      transform: [{ translateX: floating.value ? dragX.value - frameLeft
        : withTiming(next.x * width - frameLeft, { duration: reducedMotion ? 0 : 150 }) },
        { translateY: floating.value ? dragY.value - imageSide / 2
          : withTiming(next.y * height + (animatedShelfOffsets.value[pantryShelfIndex(next, shelfCount)] ?? 0) - imageSide / 2,
            { duration: reducedMotion ? 0 : 150 }) }],
    };
  });
  // Keep product stacking separate from the shared position mapper: applying
  // its animated zIndex to the trash target would override deleteTarget's 10.
  const productLayer = useAnimatedStyle(() => ({
    zIndex: floating.value ? 20 : 0,
    opacity: dragging.value ? 0.85 : 1,
  }));
  // Dragging never resizes art. This inner frame needs no UI-thread mapper.
  const imageSide = initial.size * width;
  const productWidth = pantryProductWidth(initial.size, initial.visibleBounds) * width;
  const productFrame = { width: productWidth, height: imageSide };
  const imagePlacement = { left: initial.visibleBounds ? -initial.visibleBounds.left * imageSide : (productWidth - imageSide) / 2,
    width: imageSide, height: imageSide };
  const deletePosition = visibleBounds ? {
    left: imagePlacement.left + visibleBounds.right * imageSide - 22,
    top: visibleBounds.top * imageSide - 22,
  } : { left: productFrame.width - 36, top: -8 };
  const notePosition = { left: deletePosition.left - 6, top: deletePosition.top + 6 };
  const quantity = pantryQuantity(item.quantity);
  const quantityLabel = t(quantity === 1 ? 'pantry.oneUnit' : 'pantry.units', { count: quantity });
  const expiryStatus = pantryExpiryStatus(item.expiryDate, today);
  const expiryLabel = expiryStatus ? t(expiryStatus === 'expired' ? 'pantry.expired' : 'pantry.expiringSoon') : '';
  const quantityPosition = {
    right: visibleBounds ? productWidth - (imagePlacement.left + visibleBounds.right * imageSide) + 4 : 4,
    bottom: imageSide * (1 - (visibleBounds?.bottom ?? 1)) + 4,
  };
  return <><GestureDetector gesture={gesture}>
    <Animated.View style={[styles.product, productFrame, placement, selected && styles.selected, productLayer]} collapsable={false} hitSlop={8}
      testID={`${testIDPrefix}-item-${instanceId}`} accessible={!onRemove} accessibilityRole="button"
      pointerEvents={interactionsDisabled ? 'none' : 'auto'}
      accessibilityLabel={`${item.product.name}. ${quantityLabel}${expiryLabel ? `. ${expiryLabel}` : ''}`} accessibilityState={{ selected, disabled: interactionsDisabled }}
      accessibilityHint={interactionsDisabled ? undefined : t('pantry.productAccessibilityHint', { shelf: pantryShelfIndex(item, shelfCount) + 1 })}
      accessibilityActions={interactionsDisabled || onRemove ? [] : [
        { name: 'activate', label: t('pantry.selectProduct') },
        { name: 'left', label: t('pantry.moveLeft') }, { name: 'right', label: t('pantry.moveRight') },
        ...(pantryShelfIndex(item, shelfCount) > 0 ? [{ name: 'shelfUp', label: t('pantry.moveShelfUp') }] : []),
        ...(pantryShelfIndex(item, shelfCount) < shelfCount - 1
          ? [{ name: 'shelfDown', label: t('pantry.moveShelfDown') }] : []),
      ]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (interactionsDisabled || onRemove) return;
        const action = nativeEvent.actionName;
        if (action === 'activate') { select(); return; }
        if (!['left', 'right', 'shelfUp', 'shelfDown'].includes(action)) return;
        const current = positions.value[instanceId] ?? initial;
        if (action === 'left' || action === 'right') {
          const ids = Object.keys(positions.value).filter(id => pantryShelfIndex(positions.value[id], shelfCount) === pantryShelfIndex(current, shelfCount))
            .sort((a, b) => positions.value[a].x - pantryHorizontalExtents(positions.value[a]).left
              - (positions.value[b].x - pantryHorizontalExtents(positions.value[b]).left));
          const index = ids.indexOf(instanceId);
          const before = action === 'left' ? ids[Math.max(0, index - 1)] : ids[index + 2] ?? null;
          onPlace(instanceId, current, before);
          return;
        }
        onPlace(instanceId, clampPantryPlacement({ ...current,
          shelfIndex: pantryShelfIndex(current, shelfCount) + (action === 'shelfDown' ? 1 : -1),
        }, shelfCount));
      }}>
      <Animated.View ref={imageRef} collapsable={false} pointerEvents="none"
        style={[styles.imageFrame, imagePlacement, hidden && styles.hidden]}>
        <Image source={item.product.illustrationUrl} style={StyleSheet.absoluteFill} contentFit="contain"
          cachePolicy="memory-disk" transition={0} draggable={false} accessible={false} pointerEvents="none"
          onError={() => setImageError(true)} />
        {imageError && <View pointerEvents="none" style={styles.failedImage}>
          <Ionicons name="image-outline" size={22} color="#FFF0D4" />
        </View>}
      </Animated.View>
      {quantity > 1 && <View testID={`${testIDPrefix}-quantity-${instanceId}`} pointerEvents="none"
        accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[styles.quantityBadge, quantityPosition, hidden && styles.hidden]}>
        <Text style={styles.quantityText} numberOfLines={1} adjustsFontSizeToFit>{quantity}</Text>
      </View>}
    </Animated.View>
  </GestureDetector>
    {/* A sibling target remains tappable outside the compact product frame and
        does not compete with its movement/selection gesture detector. */}
    {onRemove && !interactionsDisabled && <Animated.View
      testID={`${testIDPrefix}-delete-target-${instanceId}`} pointerEvents="box-none"
      style={[styles.deleteTarget, placement, deletePosition]}>
      <Pressable testID={`${testIDPrefix}-delete-item-${instanceId}`}
        style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]} accessibilityRole="button"
        accessibilityLabel={t('pantry.deleteProduct', { name: item.product.name })}
        onPress={() => onRemove(instanceId)}>
        <View style={styles.deleteButtonFace}>
          <Ionicons name="trash" size={16} color="#D32F2F" />
        </View>
      </Pressable>
    </Animated.View>}
    {!onRemove && !interactionsDisabled && expiryStatus && <Animated.View
      testID={`${testIDPrefix}-expiry-alarm-${instanceId}`} pointerEvents="none"
      style={[styles.deleteTarget, placement, notePosition, hidden && styles.hidden]}>
      <PantryExpiryAlarm />
    </Animated.View>}
    {!expiryStatus && !onRemove && !interactionsDisabled && item.notes?.trim() && <Animated.View
      testID={`${testIDPrefix}-note-target-${instanceId}`} pointerEvents="box-none"
      style={[styles.deleteTarget, placement, notePosition]}>
      <PantryNoteButton notes={item.notes} name={item.product.name}
        testID={`${testIDPrefix}-note-item-${instanceId}`} enabled={notesEnabled && !hidden} />
    </Animated.View>}
  </>;
});

/** Overlays describe empty photo space and never intercept scrolling or drops. */
function MoveSpace({ index, spaces, offsets, width, height, testIDPrefix }: {
  index: number; spaces: SharedValue<PantryMoveSpace[]>; offsets: SharedValue<number[]>;
  width: number; height: number; testIDPrefix: string;
}) {
  const styles = useThemedStyles(themedStyles);
  const geometry = useAnimatedStyle(() => {
    const space = spaces.value[index];
    if (!space) return { opacity: 0, width: 0, height: 0 };
    const photo = space.placement;
    const side = photo.size * width;
    const top = photo.visibleBounds?.top ?? 0;
    const bottom = photo.visibleBounds?.bottom ?? 1;
    return { opacity: 1, width: (space.right - space.left) * width,
      height: (bottom - top) * side,
      transform: [{ translateX: space.left * width },
        { translateY: photo.y * height - side / 2 + top * side + (offsets.value[space.shelfIndex] ?? 0) }] };
  });
  return <Animated.View pointerEvents="none" accessible={false}
    testID={`${testIDPrefix}-move-space-${index}`} style={[styles.moveSpace, geometry]} />;
}

function AnimatedShelfBoard({ index, width, height, offsets, finish, dark }: {
  index: number; width: number; height: number; offsets: SharedValue<number[]>;
  finish: 'wood' | 'ice'; dark: boolean;
}) {
  const offsetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offsets.value[index] ?? 0 }] }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, offsetStyle]}>
    <PantryWoodShelf width={width} surfaceY={height * pantryShelfSurfaceY(index)} finish={finish} dark={dark} />
  </Animated.View>;
}

function AnimatedLabelSlot({ index, height, topTrim, offsets, label, editing, ropeLength, onChange, onInsertShelfBelow, onRemoveShelf, finish, testIDPrefix }: {
  index: number; height: number; topTrim: number; offsets: SharedValue<number[]>;
  label?: ShelfLabel; editing: boolean; ropeLength: number; finish: 'wood' | 'ice'; testIDPrefix: string;
  onChange: (index: number, label: ShelfLabel | null) => void;
  onRemoveShelf?: (index: number) => void;
  onInsertShelfBelow?: (index: number) => void;
}) {
  const baseTop = index === 0 ? topTrim : height * (pantryShelfSurfaceY(index - 1) + 0.04);
  const offsetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: index === 0 ? 0 : (offsets.value[index - 1] ?? 0) }],
  }));
  return <Animated.View style={[labelSlotStyles.row, { top: baseTop, height: editing && onRemoveShelf ? 84 : LABEL_ROW_HEIGHT }, offsetStyle]}>
    <PantryShelfLabel index={index} label={label} editing={editing} ropeLength={ropeLength} onChange={onChange} onInsertShelfBelow={onInsertShelfBelow} onRemoveShelf={onRemoveShelf}
      finish={finish} testIDPrefix={testIDPrefix} />
  </Animated.View>;
}

const labelSlotStyles = StyleSheet.create({
  row: { position: 'absolute', left: 4, right: 4, height: LABEL_ROW_HEIGHT, zIndex: 2 },
});

function AnimatedAddSlot({ index, placement, width, height, shelfCount, offsets, canAdd, onAddAt, finish, testIDPrefix }: {
  index: number; placement: PantryPlacement; width: number; height: number; shelfCount: number;
  offsets: SharedValue<number[]>; canAdd: boolean; onAddAt: (placement: PantryPlacement) => void;
  finish: 'wood' | 'ice'; testIDPrefix: string;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const shelfIndex = pantryShelfIndex(placement, shelfCount);
  const imageSide = placement.size * width;
  const slotWidth = pantryProductWidth(placement.size) * width;
  const offsetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offsets.value[shelfIndex] ?? 0 }] }));
  return <Animated.View style={[styles.slot, {
    left: placement.x * width - slotWidth / 2,
    top: placement.y * height - imageSide / 2,
    width: slotWidth, height: imageSide,
  }, offsetStyle]}>
    <Pressable disabled={!canAdd} testID={`${testIDPrefix}-slot-${index}`}
      accessibilityRole="button" accessibilityLabel={t('pantry.addAtSlot', {
        number: index % PANTRY_SLOT_COUNT + 1, shelf: shelfIndex + 1,
      })}
      onPress={() => onAddAt(placement)} hitSlop={4}
      style={({ pressed }) => [styles.slotTouch, (!canAdd || pressed) && styles.slotPressed]}>
      <View style={[styles.slotIcon, finish === 'ice' && styles.iceSlotIcon]}>
        <Ionicons name="add" size={18} color={finish === 'ice' ? '#F2FAFF' : '#FFF0D4'} />
      </View>
    </Pressable>
  </Animated.View>;
}

export type PantryShelfProps = {
  today?: string;
  items: PantryItem[];
  shelfCount?: number;
  selectedId: string | null;
  hiddenId?: string | null;
  onSelect: ItemProps['onSelect'];
  onPlace: ItemProps['onPlace'];
  onRemove?: ItemProps['onRemove'];
  notesEnabled?: boolean;
  onAddAt?: (placement: PantryPlacement) => void;
  canAdd: boolean;
  showAddSlots?: boolean;
  scrollGesture: GestureType;
  finish?: 'wood' | 'ice';
  dark?: boolean;
  testIDPrefix?: string;
  editingLabels?: boolean;
  shelfLabels?: Record<string, ShelfLabel>;
  removableShelfIndices?: number[];
  onRemoveShelf?: (index: number) => void;
  onInsertShelfBelow?: (index: number) => void;
  onChangeShelfLabel?: (index: number, label: ShelfLabel | null) => void;
};

function PantryShelf({ items, today, shelfCount = PANTRY_DEFAULT_SHELF_COUNT, selectedId, hiddenId, onSelect, onPlace,
  onAddAt, canAdd, showAddSlots = true, scrollGesture, finish = 'wood', dark = false, testIDPrefix = 'pantry',
  editingLabels = false, onRemove, notesEnabled = true, shelfLabels, onChangeShelfLabel, onInsertShelfBelow, onRemoveShelf, removableShelfIndices = [] }: PantryShelfProps) {
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  // A common UI-thread snapshot also prevents two simultaneous product gestures
  // from each treating the same gap as empty. JS revalidates again when saving.
  const snapshot = useMemo(() => Object.fromEntries(items.map((item) =>
    [item.instanceId, clampPantryPlacement(item, shelfCount)])), [items, shelfCount]);
  const positions = useSharedValue<Positions>(snapshot);
  const activeMove = useSharedValue<string | null>(null);
  const moveSpaces = useSharedValue<PantryMoveSpace[]>([]);
  const latestSnapshot = useRef(snapshot);
  useEffect(() => {
    latestSnapshot.current = snapshot;
    positions.value = snapshot;
    activeMove.value = null;
    moveSpaces.value = [];
  }, [snapshot, positions, editingLabels, onRemove, activeMove, moveSpaces]);
  const cancelPlacement = useCallback(() => { positions.value = latestSnapshot.current; }, [positions]);
  const [frame, setFrame] = useState({ width: 0 });
  // Scale only with available WIDTH. Editing, alerts and viewport height must
  // never shrink products or move shelves; small screens scroll vertically.
  const width = frame.width / PANTRY_SHELF_WIDTH_RATIO;
  const height = width / PANTRY_ASPECT_RATIO;
  // Only shelves with a saved label reserve a row. In edit mode, empty-shelf
  // plus buttons overlay the scene and do not change its layout.
  const labelKeys = Object.keys(shelfLabels ?? {}).sort((a, b) => Number(a) - Number(b)).join(',');
  const labelIndices = new Set(labelKeys ? labelKeys.split(',').map(Number) : []);
  const shelfOffsets = useMemo(() => {
    let offset = 0;
    return Array.from({ length: shelfCount }, (_, index) => {
      if (labelIndices.has(index)) offset += LABEL_ROW_HEIGHT;
      return offset;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfCount, labelKeys]);
  const animatedShelfOffsets = useSharedValue<number[]>(shelfOffsets);
  const previousShelfCount = useRef(shelfCount);
  useEffect(() => {
    if (reducedMotion || previousShelfCount.current !== shelfCount) {
      animatedShelfOffsets.value = shelfOffsets;
    } else {
      animatedShelfOffsets.value = withTiming([...shelfOffsets], {
        duration: 360, easing: Easing.inOut(Easing.cubic),
      });
    }
    previousShelfCount.current = shelfCount;
  }, [animatedShelfOffsets, reducedMotion, shelfCount, shelfOffsets]);
  const heightRatio = pantryCanvasHeightRatio(shelfCount);
  const topShelfSize = useMemo(() => Object.values(snapshot).reduce((size, placement) =>
    pantryShelfIndex(placement, shelfCount) === 0 ? Math.max(size, placement.size) : size,
  PANTRY_DEFAULT_SIZE), [snapshot, shelfCount]);
  // Remove only unused headroom, retaining 8 pt above the tallest top-shelf
  // illustration. Keep saved coordinates and drag geometry intact.
  const topTrim = Math.max(0, pantryShelfSurfaceY(0) * height - topShelfSize * width - 8);
  // Reserve the boards' height in the React layout as soon as width is measured.
  // An initially undefined animated height can leave the native frame collapsed
  // until another interaction (such as adding a shelf) updates its layout.
  const frameHeight = height * heightRatio - topTrim;
  const frameSpacingStyle = useAnimatedStyle(() => ({
    paddingBottom: animatedShelfOffsets.value[shelfCount - 1] ?? 0,
  }));
  const canvasHeightStyle = useAnimatedStyle(() => ({
    height: height * heightRatio + (animatedShelfOffsets.value[shelfCount - 1] ?? 0),
  }));
  const slots = useMemo(() => !editingLabels && showAddSlots && onAddAt ? availablePantrySlots(items, shelfCount) : [],
    [items, shelfCount, showAddSlots, onAddAt, editingLabels]);
  // Keep the measured width independent of the animated height. Combining an
  // explicit height with aspectRatio lets Yoga shrink the whole cupboard.
  return <Animated.View style={[styles.frame, frameSpacingStyle]} testID={`${testIDPrefix}-shelf-frame`} onLayout={({ nativeEvent: { layout } }) => {
    // Ignore transient zero layouts when an ancestor is hidden/detached.
    if (layout.width <= 0) return;
    setFrame((previous) => previous.width === layout.width ? previous : { width: layout.width });
  }}>
    <View testID={`${testIDPrefix}-shelf-spacer`} pointerEvents="none" accessible={false} style={{ height: frameHeight }} />
    {width > 0 && <Animated.View testID={`${testIDPrefix}-canvas`} style={[{ position: 'absolute', width,
      left: (frame.width - width) / 2, top: -topTrim }, canvasHeightStyle]}>
      {Array.from({ length: shelfCount }, (_, index) => <AnimatedShelfBoard key={index}
        index={index} width={width} height={height} offsets={animatedShelfOffsets} finish={finish} dark={dark} />)}
      {onChangeShelfLabel && (editingLabels || labelIndices.size > 0) && Array.from({ length: shelfCount }, (_, index) => {
        const hasLabel = labelIndices.has(index);
        // Empty slots and saved signs share the same position for their shelf.
        // Otherwise the '+' for shelf N overlaps the sign hanging from shelf N for shelf N+1.
        return <AnimatedLabelSlot key={`label-${index}`} index={index} height={height} topTrim={topTrim}
          offsets={animatedShelfOffsets} label={shelfLabels?.[index]} editing={editingLabels}
          ropeLength={hasLabel && index > 0
            ? Math.max(0, height * 0.04 - width * 48 / 2000) : 0}
          onRemoveShelf={canAdd && removableShelfIndices.includes(index) ? onRemoveShelf : undefined}
          onChange={onChangeShelfLabel} onInsertShelfBelow={canAdd ? onInsertShelfBelow : undefined} finish={finish} testIDPrefix={testIDPrefix} />;
      })}
      {onAddAt && slots.map(({ index, placement }) => <AnimatedAddSlot key={index}
        index={index} placement={placement} width={width} height={height} shelfCount={shelfCount}
        offsets={animatedShelfOffsets} canAdd={canAdd} onAddAt={onAddAt} finish={finish} testIDPrefix={testIDPrefix} />)}
      {Array.from({ length: items.length + shelfCount }, (_, index) => <MoveSpace key={`move-${index}`}
        index={index} spaces={moveSpaces} offsets={animatedShelfOffsets} width={width} height={height}
        testIDPrefix={testIDPrefix} />)}
      {items.map((item) => <PlacedProduct key={item.instanceId} item={item} today={today} selected={item.instanceId === selectedId} hidden={item.instanceId === hiddenId}
        width={width} height={height} shelfCount={shelfCount} onSelect={onSelect} onPlace={onPlace} onCancelPlacement={cancelPlacement}
        positions={positions} moveSpaces={moveSpaces} activeMove={activeMove} scrollGesture={scrollGesture} testIDPrefix={testIDPrefix}
        visibleBounds={item.boundsImageUrl === item.product.illustrationUrl ? item.visibleBounds
          : pantryImageBoundsCache.get(item.product.illustrationUrl)}
        interactionsDisabled={editingLabels} onRemove={onRemove} notesEnabled={notesEnabled} animatedShelfOffsets={animatedShelfOffsets} />)}
    </Animated.View>}
  </Animated.View>;
}

export default memo(PantryShelf);

const themedStyles = () => StyleSheet.create({
  frame: { flexShrink: 0,
    width: '100%', maxWidth: 532, alignSelf: 'center',
    backgroundColor: 'transparent', overflow: 'visible' },
  slot: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: 12,
  },
  slotTouch: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  slotPressed: { opacity: 0.45 },
  slotIcon: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(61, 36, 19, 0.7)', borderWidth: 1, borderColor: 'rgba(255, 240, 212, 0.6)',
  },
  iceSlotIcon: { backgroundColor: 'rgba(40, 92, 127, 0.85)', borderColor: 'rgba(209, 236, 253, 0.8)' },
  moveSpace: { position: 'absolute', left: 0, top: 0, borderWidth: 2, borderStyle: 'dashed',
    borderColor: '#2E7D32', backgroundColor: 'rgba(76, 175, 80, 0.18)', borderRadius: 8 },
  product: { position: 'absolute', left: 0, top: 0, overflow: 'visible' },
  quantityBadge: { position: 'absolute', width: 21.6, height: 21.6,
    borderRadius: 10.8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
    borderWidth: 0.9, borderColor: colors.border },
  quantityText: { maxWidth: '100%', fontFamily: fonts.semibold, fontSize: 10.8, lineHeight: 14.4,
    textAlign: 'center', includeFontPadding: false, color: colors.ink },
  deleteTarget: { position: 'absolute', width: 44, height: 44, zIndex: 10 },
  deleteButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  deleteButtonPressed: { opacity: 0.5 },
  deleteButtonFace: { width: 26.4, height: 26.4, borderRadius: 13.2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF4E3' },
  selected: { zIndex: 1 },
  hidden: { opacity: 0 },
  imageFrame: { position: 'absolute', top: 0 },
  failedImage: { position: 'absolute', left: '50%', top: '50%', marginLeft: -20, marginTop: -20,
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(61, 36, 19, 0.8)', borderRadius: 20 },
});
