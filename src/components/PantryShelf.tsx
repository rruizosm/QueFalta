/* Reanimated values are UI-runtime handles, updated by gesture worklets. */
/* eslint-disable react-hooks/immutability */
import { useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, type NativeGesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import { availablePantrySlots, clampPantryPlacement, findPantryPlacement, pantryProductWidth,
  pantryShelfIndex, pantryShelfIndexAtY, pantryShelfSurfaceY, pantryCanvasHeightRatio, PANTRY_SLOT_COUNT,
  PANTRY_ASPECT_RATIO, PANTRY_DEFAULT_SHELF_COUNT, type PantryItem, type PantryPlacement } from '../lib/pantryLayout';
import { PagerGestureContext } from './bottom-tabs-pager/PagerGestureContext';
import PantryWoodShelf, { PANTRY_SHELF_WIDTH_RATIO } from './PantryWoodShelf';

type ItemProps = {
  item: PantryItem;
  selected: boolean;
  width: number;
  height: number;
  shelfCount: number;
  onSelect: (instanceId: string) => void;
  onPlace: (instanceId: string, placement: PantryPlacement) => void;
  positions: SharedValue<PantryItem[]>;
  scrollGesture: NativeGesture;
};

function PlacedProduct({ item, selected, width, height, shelfCount, onSelect, onPlace, positions, scrollGesture }: ItemProps) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const pager = useContext(PagerGestureContext);
  const [imageError, setImageError] = useState(false);
  const initial = clampPantryPlacement(item, shelfCount);
  const startX = useSharedValue(initial.x);
  const startY = useSharedValue(initial.y);
  const dragging = useSharedValue(false);
  const instanceId = item.instanceId;

  useEffect(() => { setImageError(false); }, [item.product.illustrationUrl]);

  const gesture = useMemo(() => {
    const current = () => {
      'worklet';
      return positions.value.find((entry) => entry.instanceId === instanceId);
    };
    const preview = (desired: PantryPlacement) => {
      'worklet';
      const next = findPantryPlacement(desired, positions.value.filter((entry) => entry.instanceId !== instanceId), shelfCount);
      if (next) positions.value = positions.value.map((entry) => entry.instanceId === instanceId ? { ...entry, ...next } : entry);
      return next !== null;
    };
    const commit = () => {
      'worklet';
      const entry = current();
      if (entry) runOnJS(onPlace)(instanceId, entry);
    };
    const pan = Gesture.Pan().minDistance(2).maxPointers(1)
      .onStart(() => {
        const entry = current();
        if (!entry) return;
        dragging.value = true;
        startX.value = entry.x;
        startY.value = entry.y;
        runOnJS(onSelect)(instanceId);
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
      if (success) runOnJS(onSelect)(instanceId);
    });
    pan.blocksExternalGesture(scrollGesture);
    tap.blocksExternalGesture(scrollGesture);
    if (pager) {
      pan.blocksExternalGesture(pager);
      tap.blocksExternalGesture(pager);
    }
    return Gesture.Simultaneous(pan, tap);
  }, [pager, scrollGesture, width, height, shelfCount, onSelect, onPlace, instanceId, positions, startX, startY, dragging]);

  const placement = useAnimatedStyle(() => {
    const current = positions.value.find((entry) => entry.instanceId === instanceId);
    const next = clampPantryPlacement(current ?? item, shelfCount);
    const frameWidth = pantryProductWidth(next.size) * width;
    const imageSide = next.size * width;
    return {
      opacity: current ? 1 : 0,
      left: next.x * width - frameWidth / 2,
      top: next.y * height - imageSide / 2,
      width: frameWidth,
      height: imageSide,
    };
  });
  const imagePlacement = useAnimatedStyle(() => {
    const current = positions.value.find((entry) => entry.instanceId === instanceId);
    const next = clampPantryPlacement(current ?? item, shelfCount);
    const frameWidth = pantryProductWidth(next.size) * width;
    const imageSide = next.size * width;
    return {
      left: (frameWidth - imageSide) / 2,
      width: imageSide,
      height: imageSide,
    };
  });

  return <GestureDetector gesture={gesture}>
    <Animated.View style={[styles.product, placement, selected && styles.selected]} collapsable={false} hitSlop={8}
      testID={`pantry-item-${instanceId}`} accessible accessibilityRole="button"
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
        onSelect(instanceId);
        const action = nativeEvent.actionName;
        if (!['left', 'right', 'shelfUp', 'shelfDown'].includes(action)) return;
        onPlace(instanceId, clampPantryPlacement({
          x: item.x + (action === 'right' ? 0.04 : action === 'left' ? -0.04 : 0),
          y: 0,
          size: item.size,
          shelfIndex: pantryShelfIndex(item, shelfCount) + (action === 'shelfDown' ? 1 : action === 'shelfUp' ? -1 : 0),
        }, shelfCount));
      }}>
      <Animated.View pointerEvents="none" style={[styles.imageFrame, imagePlacement]}>
        <Image source={item.product.illustrationUrl} style={StyleSheet.absoluteFill} contentFit="contain"
          cachePolicy="memory-disk" transition={0} draggable={false} accessible={false} pointerEvents="none"
          onError={() => setImageError(true)} />
        {imageError && <View pointerEvents="none" style={styles.failedImage}>
          <Ionicons name="image-outline" size={22} color="#FFF0D4" />
        </View>}
      </Animated.View>
    </Animated.View>
  </GestureDetector>;
}

export default function PantryShelf({ items, shelfCount = PANTRY_DEFAULT_SHELF_COUNT, selectedId, onSelect, onPlace, onAddAt, canAdd, scrollGesture }: {
  items: PantryItem[];
  shelfCount?: number;
  selectedId: string | null;
  onSelect: ItemProps['onSelect'];
  onPlace: ItemProps['onPlace'];
  onAddAt: (placement: PantryPlacement) => void;
  canAdd: boolean;
  scrollGesture: NativeGesture;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  // A common UI-thread snapshot also prevents two simultaneous product gestures
  // from each treating the same gap as empty. JS revalidates again when saving.
  const positions = useSharedValue(items);
  useEffect(() => { positions.value = items; }, [items, positions]);
  const [frame, setFrame] = useState({ width: 0 });
  // Scale only with available WIDTH. Editing, alerts and viewport height must
  // never shrink products or move shelves; small screens scroll vertically.
  const width = frame.width / PANTRY_SHELF_WIDTH_RATIO;
  const height = width / PANTRY_ASPECT_RATIO;
  const heightRatio = pantryCanvasHeightRatio(shelfCount);
  const slots = useMemo(() => availablePantrySlots(items, shelfCount), [items, shelfCount]);
  return <View style={[styles.frame, { aspectRatio: PANTRY_ASPECT_RATIO * PANTRY_SHELF_WIDTH_RATIO / heightRatio }]} testID="pantry-shelf-frame" onLayout={({ nativeEvent: { layout } }) => {
    setFrame((previous) => previous.width === layout.width ? previous : { width: layout.width });
  }}>
    {width > 0 && <View testID="pantry-canvas" style={{ position: 'absolute', width, height: height * heightRatio,
      left: (frame.width - width) / 2, top: 0 }}>
      {Array.from({ length: shelfCount }, (_, index) => <PantryWoodShelf key={index}
        width={width} surfaceY={height * pantryShelfSurfaceY(index)} />)}
      {slots.map(({ index, placement }) => {
        const imageSide = placement.size * width;
        const slotWidth = pantryProductWidth(placement.size) * width;
        return <Pressable key={index} disabled={!canAdd} testID={`pantry-slot-${index}`}
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
          <View style={styles.slotIcon}>
            <Ionicons name="add" size={18} color="#FFF0D4" />
          </View>
        </Pressable>;
      })}
      {items.map((item) => <PlacedProduct key={item.instanceId} item={item} selected={item.instanceId === selectedId}
        width={width} height={height} shelfCount={shelfCount} onSelect={onSelect} onPlace={onPlace}
        positions={positions} scrollGesture={scrollGesture} />)}
    </View>}
  </View>;
}

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
  product: { position: 'absolute', overflow: 'visible' },
  selected: { zIndex: 1 },
  imageFrame: { position: 'absolute', top: 0 },
  failedImage: { position: 'absolute', left: '50%', top: '50%', marginLeft: -20, marginTop: -20,
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(61, 36, 19, 0.8)', borderRadius: 20 },
});
