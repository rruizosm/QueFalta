/* Reanimated values are UI-runtime handles, updated by gesture worklets. */
/* eslint-disable react-hooks/immutability */
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, type NativeGesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import { availablePantrySlots, clampPantryPlacement, findPantryPlacement, pantryProductWidth,
  pantryShelfIndex, pantryShelfIndexAtY, pantryShelfSurfaceY, pantryCanvasHeightRatio, PANTRY_SLOT_COUNT,
  PANTRY_ASPECT_RATIO, PANTRY_DEFAULT_SIZE, PANTRY_DEFAULT_SHELF_COUNT, type PantryItem, type PantryPlacement } from '../lib/pantryLayout';
import { PagerGestureContext } from './bottom-tabs-pager/PagerGestureContext';
import PantryWoodShelf, { PANTRY_SHELF_WIDTH_RATIO } from './PantryWoodShelf';

type Positions = Record<string, PantryPlacement>;
type ItemProps = {
  item: PantryItem;
  selected: boolean;
  hidden?: boolean;
  width: number;
  height: number;
  shelfCount: number;
  onSelect: (instanceId: string, sourceRef?: RefObject<View | null>) => void;
  onPlace: (instanceId: string, placement: PantryPlacement) => void;
  positions: SharedValue<Positions>;
  scrollGesture: NativeGesture;
  testIDPrefix: string;
};

const PlacedProduct = memo(function PlacedProduct({ item, selected, hidden, width, height, shelfCount, onSelect, onPlace, positions, scrollGesture, testIDPrefix }: ItemProps) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const pager = useContext(PagerGestureContext);
  const imageRef = useRef<View>(null);
  const select = useCallback(() => onSelect(item.instanceId, imageRef), [item.instanceId, onSelect]);
  const [imageError, setImageError] = useState(false);
  // Capture geometry only in worklets, never product names/remote image URLs.
  const initial = useMemo(() => clampPantryPlacement(item, shelfCount), [item, shelfCount]);
  const startX = useSharedValue(initial.x);
  const startY = useSharedValue(initial.y);
  const dragging = useSharedValue(false);
  const instanceId = item.instanceId;

  useEffect(() => { setImageError(false); }, [item.product.illustrationUrl]);

  const gesture = useMemo(() => {
    const current = () => {
      'worklet';
      return positions.value[instanceId];
    };
    const preview = (desired: PantryPlacement) => {
      'worklet';
      const occupied: PantryPlacement[] = [];
      for (const id of Object.keys(positions.value)) {
        const entry = positions.value[id];
        if (id !== instanceId && pantryShelfIndex(entry, shelfCount) === pantryShelfIndex(desired, shelfCount)) {
          occupied.push(entry);
        }
      }
      const next = findPantryPlacement(desired, occupied, shelfCount);
      const previous = current();
      if (next && (!previous || next.x !== previous.x || next.y !== previous.y || next.size !== previous.size)) {
        positions.value = { ...positions.value, [instanceId]: next };
      }
      return next !== null;
    };
    const commit = () => {
      'worklet';
      const entry = current();
      if (entry) runOnJS(onPlace)(instanceId, entry);
    };
    const pan = Gesture.Pan().minDistance(8).maxPointers(1)
      .onStart(() => {
        const entry = current();
        if (!entry) return;
        dragging.value = true;
        startX.value = entry.x;
        startY.value = entry.y;
      })
      .onUpdate((event) => {
        const entry = current();
        if (entry && dragging.value) preview({
          x: startX.value + event.translationX / width, y: 0, size: entry.size,
          shelfIndex: pantryShelfIndexAtY(startY.value + event.translationY / height + entry.size * PANTRY_ASPECT_RATIO / 2, shelfCount),
        });
      })
      .onFinalize((_event, success) => {
        if (!dragging.value) return;
        dragging.value = false;
        if (success) commit();
      });
    const tap = Gesture.Tap().maxDistance(8).onEnd((_event, success) => {
      if (success) runOnJS(select)();
    });
    pan.blocksExternalGesture(scrollGesture);
    tap.blocksExternalGesture(scrollGesture);
    if (pager) {
      pan.blocksExternalGesture(pager);
      tap.blocksExternalGesture(pager);
    }
    return Gesture.Race(pan, tap);
  }, [pager, scrollGesture, width, height, shelfCount, select, onPlace, instanceId, positions, startX, startY, dragging]);

  const placement = useAnimatedStyle(() => {
    const current = positions.value[instanceId];
    // New items can mount before the UI-thread snapshot catches up. Their
    // persisted placement is already valid; never hide them during that handoff.
    const next = current ?? initial;
    const frameWidth = pantryProductWidth(next.size) * width;
    const imageSide = next.size * width;
    return {
      // Translate the fixed frame; moving left/top would run native layout on every drag frame.
      transform: [{ translateX: next.x * width - frameWidth / 2 }, { translateY: next.y * height - imageSide / 2 }],
    };
  });
  // Dragging never resizes art. This inner frame needs no UI-thread mapper.
  const imageSide = initial.size * width;
  const productFrame = { width: pantryProductWidth(initial.size) * width, height: imageSide };
  const imagePlacement = { left: (pantryProductWidth(initial.size) * width - imageSide) / 2,
    width: imageSide, height: imageSide };

  return <GestureDetector gesture={gesture}>
    <Animated.View style={[styles.product, productFrame, placement, selected && styles.selected]} collapsable={false} hitSlop={8}
      testID={`${testIDPrefix}-item-${instanceId}`} accessible accessibilityRole="button"
      accessibilityLabel={item.product.name} accessibilityState={{ selected }}
      accessibilityHint={t('pantry.productAccessibilityHint', { shelf: pantryShelfIndex(item, shelfCount) + 1 })}
      accessibilityActions={[
        { name: 'activate', label: t('pantry.selectProduct') },
        { name: 'left', label: t('pantry.moveLeft') }, { name: 'right', label: t('pantry.moveRight') },
        ...(pantryShelfIndex(item, shelfCount) > 0 ? [{ name: 'shelfUp', label: t('pantry.moveShelfUp') }] : []),
        ...(pantryShelfIndex(item, shelfCount) < shelfCount - 1
          ? [{ name: 'shelfDown', label: t('pantry.moveShelfDown') }] : []),
      ]}
      onAccessibilityAction={({ nativeEvent }) => {
        const action = nativeEvent.actionName;
        if (action === 'activate') { select(); return; }
        if (!['left', 'right', 'shelfUp', 'shelfDown'].includes(action)) return;
        onPlace(instanceId, clampPantryPlacement({
          x: item.x + (action === 'right' ? 0.04 : action === 'left' ? -0.04 : 0),
          y: 0,
          size: item.size,
          shelfIndex: pantryShelfIndex(item, shelfCount) + (action === 'shelfDown' ? 1 : action === 'shelfUp' ? -1 : 0),
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
    </Animated.View>
  </GestureDetector>;
});

export type PantryShelfProps = {
  items: PantryItem[];
  shelfCount?: number;
  selectedId: string | null;
  hiddenId?: string | null;
  onSelect: ItemProps['onSelect'];
  onPlace: ItemProps['onPlace'];
  onAddAt: (placement: PantryPlacement) => void;
  canAdd: boolean;
  scrollGesture: NativeGesture;
  finish?: 'wood' | 'ice';
  dark?: boolean;
  testIDPrefix?: string;
};

function PantryShelf({ items, shelfCount = PANTRY_DEFAULT_SHELF_COUNT, selectedId, hiddenId, onSelect, onPlace,
  onAddAt, canAdd, scrollGesture, finish = 'wood', dark = false, testIDPrefix = 'pantry' }: PantryShelfProps) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  // A common UI-thread snapshot also prevents two simultaneous product gestures
  // from each treating the same gap as empty. JS revalidates again when saving.
  const snapshot = useMemo(() => Object.fromEntries(items.map((item) =>
    [item.instanceId, clampPantryPlacement(item, shelfCount)])), [items, shelfCount]);
  const positions = useSharedValue<Positions>(snapshot);
  useEffect(() => { positions.value = snapshot; }, [snapshot, positions]);
  const [frame, setFrame] = useState({ width: 0 });
  // Scale only with available WIDTH. Editing, alerts and viewport height must
  // never shrink products or move shelves; small screens scroll vertically.
  const width = frame.width / PANTRY_SHELF_WIDTH_RATIO;
  const height = width / PANTRY_ASPECT_RATIO;
  const heightRatio = pantryCanvasHeightRatio(shelfCount);
  const topShelfSize = useMemo(() => Object.values(snapshot).reduce((size, placement) =>
    pantryShelfIndex(placement, shelfCount) === 0 ? Math.max(size, placement.size) : size,
  PANTRY_DEFAULT_SIZE), [snapshot, shelfCount]);
  // Remove only unused headroom, retaining 8 pt above the tallest top-shelf
  // illustration (or add target). Keep saved coordinates and drag geometry intact.
  const topTrim = Math.max(0, pantryShelfSurfaceY(0) * height - topShelfSize * width - 8);
  const visibleHeightRatio = heightRatio - (height > 0 ? topTrim / height : 0);
  const slots = useMemo(() => availablePantrySlots(items, shelfCount), [items, shelfCount]);
  return <View style={[styles.frame, { aspectRatio: PANTRY_ASPECT_RATIO * PANTRY_SHELF_WIDTH_RATIO / visibleHeightRatio }]} testID={`${testIDPrefix}-shelf-frame`} onLayout={({ nativeEvent: { layout } }) => {
    // Ignore transient zero layouts when an ancestor is hidden/detached.
    if (layout.width <= 0) return;
    setFrame((previous) => previous.width === layout.width ? previous : { width: layout.width });
  }}>
    {width > 0 && <View testID={`${testIDPrefix}-canvas`} style={{ position: 'absolute', width, height: height * heightRatio,
      left: (frame.width - width) / 2, top: -topTrim }}>
      {Array.from({ length: shelfCount }, (_, index) => <PantryWoodShelf key={index}
        width={width} surfaceY={height * pantryShelfSurfaceY(index)} finish={finish} dark={dark} />)}
      {slots.map(({ index, placement }) => {
        const imageSide = placement.size * width;
        const slotWidth = pantryProductWidth(placement.size) * width;
        return <Pressable key={index} disabled={!canAdd} testID={`${testIDPrefix}-slot-${index}`}
          accessibilityRole="button" accessibilityLabel={t('pantry.addAtSlot', {
            number: index % PANTRY_SLOT_COUNT + 1, shelf: pantryShelfIndex(placement, shelfCount) + 1,
          })}
          onPress={() => onAddAt(placement)} hitSlop={4}
          style={({ pressed }) => [styles.slot, {
            left: placement.x * width - slotWidth / 2,
            top: placement.y * height - imageSide / 2,
            width: slotWidth,
            height: imageSide,
          }, (!canAdd || pressed) && styles.slotPressed]}>
          <View style={[styles.slotIcon, finish === 'ice' && styles.iceSlotIcon]}>
            <Ionicons name="add" size={18} color={finish === 'ice' ? '#F2FAFF' : '#FFF0D4'} />
          </View>
        </Pressable>;
      })}
      {items.map((item) => <PlacedProduct key={item.instanceId} item={item} selected={item.instanceId === selectedId} hidden={item.instanceId === hiddenId}
        width={width} height={height} shelfCount={shelfCount} onSelect={onSelect} onPlace={onPlace}
        positions={positions} scrollGesture={scrollGesture} testIDPrefix={testIDPrefix} />)}
    </View>}
  </View>;
}

export default memo(PantryShelf);

const themedStyles = () => StyleSheet.create({
  frame: { flexShrink: 0,
    width: '100%', maxWidth: 520, alignSelf: 'center',
    backgroundColor: 'transparent', overflow: 'visible' },
  slot: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: 12,
  },
  slotPressed: { opacity: 0.45 },
  slotIcon: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(61, 36, 19, 0.7)', borderWidth: 1, borderColor: 'rgba(255, 240, 212, 0.6)',
  },
  iceSlotIcon: { backgroundColor: 'rgba(40, 92, 127, 0.85)', borderColor: 'rgba(209, 236, 253, 0.8)' },
  product: { position: 'absolute', left: 0, top: 0, overflow: 'visible' },
  selected: { zIndex: 1 },
  hidden: { opacity: 0 },
  imageFrame: { position: 'absolute', top: 0 },
  failedImage: { position: 'absolute', left: '50%', top: '50%', marginLeft: -20, marginTop: -20,
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(61, 36, 19, 0.8)', borderRadius: 20 },
});
