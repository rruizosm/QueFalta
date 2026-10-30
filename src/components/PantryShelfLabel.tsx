/* Reanimated shared values are UI-runtime handles, updated from effects. */
/* eslint-disable react-hooks/immutability */
import { memo, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { fonts } from '../constants/typography';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTranslation } from '../context/LanguageContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { PANTRY_MAX_SHELF_NAME_LENGTH, type PantryShelfLabel as ShelfLabel } from '../lib/pantryLayout';
import GroupIconPickerSheet from './GroupIconPickerSheet';
import PantryWoodSign from './PantryWoodSign';

interface Props {
  index: number;
  label?: ShelfLabel;
  editing: boolean;
  ropeLength?: number;
  finish?: 'wood' | 'ice';
  testIDPrefix?: string;
  onRemoveShelf?: (index: number) => void;
  onInsertShelfBelow?: (index: number) => void;
  onChange: (index: number, label: ShelfLabel | null) => void;
}

function PantryShelfLabel({ index, label, editing, ropeLength = 0, finish = 'wood', testIDPrefix = 'pantry', onChange, onInsertShelfBelow, onRemoveShelf }: Props) {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const styles = useThemedStyles(themedStyles);
  const [choosingEmoji, setChoosingEmoji] = useState(false);
  const [focusNew, setFocusNew] = useState(false);
  const [rowWidth, setRowWidth] = useState(0);
  const [candidate, setCandidate] = useState<{ id: number; label: ShelfLabel } | null>(null);
  const requestId = useRef(0);
  useEffect(() => {
    if (!editing) {
      requestId.current++;
      setCandidate(null);
    }
  }, [editing]);
  const proposeLabel = (next: ShelfLabel) => {
    setCandidate({ id: ++requestId.current, label: {
      ...next, name: next.name.replace(/[\r\n]/g, '').slice(0, PANTRY_MAX_SHELF_NAME_LENGTH),
    } });
  };
  const reducedMotion = useReducedMotion();
  const hasLabel = Boolean(label);
  const [lastLabel, setLastLabel] = useState<ShelfLabel | null>(label ?? null);
  const [lastRopeLength, setLastRopeLength] = useState(ropeLength);
  const signOpacity = useSharedValue(hasLabel ? 1 : 0);
  const addOpacity = useSharedValue(hasLabel ? 0 : 1);
  const swing = useSharedValue(0);
  const swingStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${swing.value}deg` }] }));
  const signFadeStyle = useAnimatedStyle(() => ({ opacity: signOpacity.value }));
  const addFadeStyle = useAnimatedStyle(() => ({ opacity: addOpacity.value }));
  useEffect(() => {
    if (label) {
      setLastLabel(label);
      setLastRopeLength(ropeLength);
    }
  }, [label, ropeLength]);
  useEffect(() => {
    cancelAnimation(signOpacity);
    cancelAnimation(addOpacity);
    if (reducedMotion) {
      signOpacity.value = hasLabel ? 1 : 0;
      addOpacity.value = hasLabel ? 0 : 1;
      if (!hasLabel) setLastLabel(null);
    } else {
      signOpacity.value = withTiming(hasLabel ? 1 : 0, { duration: hasLabel ? 280 : 220 }, (finished) => {
        if (finished && !hasLabel) runOnJS(setLastLabel)(null);
      });
      addOpacity.value = withTiming(hasLabel ? 0 : 1, { duration: hasLabel ? 180 : 220 });
    }
    return () => {
      cancelAnimation(signOpacity);
      cancelAnimation(addOpacity);
    };
  }, [hasLabel, reducedMotion, signOpacity, addOpacity]);
  useEffect(() => {
    cancelAnimation(swing);
    if (!editing || !hasLabel || reducedMotion) {
      swing.value = 0;
      return;
    }
    swing.value = -6;
    swing.value = withSequence(
      withTiming(2.4, { duration: 190, easing: Easing.out(Easing.cubic) }),
      withTiming(-1.1, { duration: 160, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 210, easing: Easing.out(Easing.quad) }),
    );
    return () => cancelAnimation(swing);
  }, [editing, hasLabel, reducedMotion, swing]);
  const ice = finish === 'ice';
  const dark = scheme === 'dark';
  const ink = ice ? (dark ? '#E8F5FF' : '#1E4866') : (dark ? '#FFF4E3' : '#49311E');
  const signInk = ice ? ink : '#49311E';
  const location = t('pantry.shelfLocation', { number: index + 1 });
  // Echo native edits immediately, including the text used to size the field.
  // Waiting for onTextLayout would send the previous value back to TextInput
  // on every keystroke, rewinding the text and cursor until measurement finishes.
  const displayedLabel = (editing && label ? candidate?.label : null) ?? label ?? lastLabel;
  if (!displayedLabel && !editing) return null;
  // Reserve the editing buttons too, so a name fits in both modes. Native Text
  // measures every prefix with the same font and accessibility scale as the sign.
  const textBudget = Math.max(0, rowWidth * 0.76 - 36 - 68 - 2);
  const characters = candidate ? Array.from(candidate.label.name) : [];
  const prefixes = candidate ? Array.from({ length: characters.length + 1 }, (_, length) =>
    `${candidate.label.emoji ? `${candidate.label.emoji}  ` : ''}${characters.slice(0, length).join('')}`) : [];


  return <View style={[styles.labelRow, editing && onRemoveShelf ? styles.removableLabelRow : undefined]}
    onLayout={({ nativeEvent: { layout } }) => setRowWidth(layout.width)}>
    {candidate && editing && hasLabel && textBudget > 0 && <Text
      key={`${candidate.id}:${textBudget}`} testID={`${testIDPrefix}-label-fit-${index}`}
      pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.name, styles.fitMeasure]}
      onTextLayout={({ nativeEvent: { lines } }) => {
        if (requestId.current !== candidate.id || lines.length !== prefixes.length) return;
        let length = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].width > textBudget) break;
          length = i;
        }
        requestId.current++;
        setCandidate(null);
        onChange(index, { ...candidate.label, name: characters.slice(0, length).join('') });
      }}>{prefixes.map(prefix => prefix || ' ').join('\n')}</Text>}

    {editing && <Animated.View style={[styles.addLayer, addFadeStyle]} pointerEvents={hasLabel ? 'none' : 'auto'}>
      <Pressable testID={`${testIDPrefix}-add-label-${index}`}
        accessibilityRole="button" accessibilityLabel={t('pantry.addShelfLabel', { number: index + 1 })}
        accessibilityElementsHidden={hasLabel} importantForAccessibility={hasLabel ? 'no-hide-descendants' : 'auto'}
        hitSlop={11} onPress={() => { setFocusNew(true); onChange(index, { name: '', emoji: null }); }}
        style={({ pressed }) => [styles.add, ice && styles.iceAdd, pressed && styles.pressed]}>
        <Ionicons name="add" size={13} color="#FFF4E3" />
      </Pressable>
    </Animated.View>}
    {displayedLabel && <Animated.View style={[styles.signLayer, swingStyle, signFadeStyle, { transformOrigin: 'top center' }]}
      pointerEvents={hasLabel ? 'auto' : 'none'}>
      <View testID={`${testIDPrefix}-shelf-label-${index}`} style={styles.sign}
        accessible={!editing && hasLabel} accessibilityLabel={editing || !hasLabel ? undefined
          : `${location}: ${displayedLabel.emoji ?? ''} ${displayedLabel.name.trim() || location}`}>
        {ice ? <View pointerEvents="none" accessible={false}
          style={[StyleSheet.absoluteFill, styles.iceSign, { backgroundColor: dark ? '#294F69' : '#EEF8FD',
            borderColor: dark ? '#6E9BB7' : '#83B2CC' }]}>
          {(['left', 'right'] as const).map((side) => <View key={side} style={[styles.iceHanger, { [side]: 12 },
            { top: -(hasLabel ? ropeLength : lastRopeLength), height: hasLabel ? ropeLength : lastRopeLength }]} />)}
        </View> : <PantryWoodSign dark={dark} ropeLength={hasLabel ? ropeLength : lastRopeLength} />}
        <View style={styles.content}>
          {displayedLabel.emoji ? <Text style={[styles.name, { color: signInk }]} accessible={false}>{`${displayedLabel.emoji}  `}</Text> : null}
          {/* The invisible text gives the overlaid input its natural width as the name changes. */}
          <View style={styles.nameField}>
            <Text style={[styles.name, styles.nameMeasure]} numberOfLines={1} accessible={false}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {displayedLabel.name || location}
            </Text>
          {!editing && <Text style={[styles.name, styles.readName, { color: signInk }]} numberOfLines={1}
            adjustsFontSizeToFit minimumFontScale={0.5} accessible={false}>{displayedLabel.name || location}</Text>}
          <TextInput testID={`${testIDPrefix}-label-name-${index}`} style={[styles.name, styles.input, !editing && styles.hidden, { color: signInk }]}
            value={displayedLabel.name} onChangeText={(name) => { if (label) proposeLabel({ ...displayedLabel, name }); }}
            editable={editing && hasLabel} accessible={editing && hasLabel} pointerEvents={editing && hasLabel ? 'auto' : 'none'}
            autoFocus={focusNew && hasLabel} onFocus={() => setFocusNew(false)} selectTextOnFocus
            maxLength={PANTRY_MAX_SHELF_NAME_LENGTH} returnKeyType="done" multiline={false}
            accessibilityLabel={t('pantry.shelfName', { number: index + 1 })}
            placeholder={location} placeholderTextColor={ice ? (dark ? '#A7C8DC' : '#52788F') : '#82664A'} />
          </View>
        </View>
        {/* Editing actions only take space while visible. */}
        <View style={[styles.actions, !editing && styles.hidden]} pointerEvents={editing && hasLabel ? 'auto' : 'none'}
          accessibilityElementsHidden={!editing || !hasLabel} importantForAccessibility={editing && hasLabel ? 'auto' : 'no-hide-descendants'}>
          <Pressable testID={`${testIDPrefix}-label-emoji-${index}`} style={styles.iconButton}
            accessibilityRole="button" accessibilityLabel={t('pantry.shelfEmoji')}
            onPress={() => { Keyboard.dismiss(); setChoosingEmoji(true); }}>
            <Ionicons name="happy-outline" size={18} color={ink} />
          </Pressable>
          <Pressable testID={`${testIDPrefix}-remove-label-${index}`} style={styles.iconButton}
            accessibilityRole="button" accessibilityLabel={t('pantry.removeShelfLabel', { number: index + 1 })}
            onPress={() => { Keyboard.dismiss(); requestId.current++; setCandidate(null); onChange(index, null); }}>
            <Ionicons name="close" size={18} color={ink} />
          </Pressable>
        </View>
      </View>
    </Animated.View>}
    {editing && onInsertShelfBelow && <Pressable testID={`${testIDPrefix}-insert-shelf-below-${index}`}
      accessibilityRole="button" accessibilityLabel={t('pantry.insertShelfBelow', { number: index + 1 })}
      onPress={() => { Keyboard.dismiss(); onInsertShelfBelow(index); }}
      style={({ pressed }) => [styles.insertShelf, pressed && styles.pressed]}>
      <View style={[styles.insertShelfIcon, ice && styles.iceAdd]}>
        <Ionicons name="add" size={16} color="#FFF4E3" />
        <Ionicons name="arrow-down" size={12} color="#FFF4E3" />
      </View>
    </Pressable>}
    {editing && onRemoveShelf && <Pressable testID={`${testIDPrefix}-remove-shelf-${index}`}
      accessibilityRole="button" accessibilityLabel={t('pantry.removeShelf', { number: index + 1 })}
      onPress={() => { Keyboard.dismiss(); onRemoveShelf(index); }}
      style={({ pressed }) => [styles.insertShelf, styles.removeShelf, pressed && styles.pressed]}>
      <View style={styles.removeShelfIcon}>
        <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
      </View>
    </Pressable>}
    {choosingEmoji && editing && label && displayedLabel && <GroupIconPickerSheet visible selectedIcon={displayedLabel.emoji} busy={false}
      titleText={t('pantry.shelfEmoji')} subtitleText={location}
      optionAccessibilityLabel={t('pantry.shelfEmojiOption')}
      onSave={(emoji) => { proposeLabel({ ...displayedLabel, emoji }); setChoosingEmoji(false); }}
      onClose={() => setChoosingEmoji(false)} />}
  </View>;
}

export default memo(PantryShelfLabel);

const themedStyles = () => StyleSheet.create({
  add: { width: 20, height: 20, alignSelf: 'flex-start', marginTop: 8, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: '#3F2818', backgroundColor: '#734927' },
  insertShelf: { position: 'absolute', right: -4, top: -4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  insertShelfIcon: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: 34, height: 28,
    borderRadius: 8, borderWidth: 1, borderColor: '#3F2818', backgroundColor: '#734927' },
  removeShelf: { top: 40 },
  removeShelfIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#B52B32', alignItems: 'center', justifyContent: 'center' },
  iceAdd: { backgroundColor: '#285C7F', borderColor: '#A9D3EB' },
  iceSign: { borderRadius: 7, borderWidth: 1, borderBottomWidth: 2 },
  iceHanger: { position: 'absolute', width: 2, backgroundColor: '#83B2CC' },
  labelRow: { width: '100%', height: 36, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  removableLabelRow: { height: 84, justifyContent: 'flex-start' },
  addLayer: { position: 'absolute', left: 0, top: 0 },
  signLayer: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  sign: { height: 36, minWidth: 96, maxWidth: '76%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  content: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 4 },
  name: { fontSize: 15, lineHeight: 20, fontFamily: fonts.semibold, includeFontPadding: false },
  nameField: { flexShrink: 1, minWidth: 24 },
  nameMeasure: { opacity: 0 },
  readName: { position: 'absolute', top: 0, left: 0, right: 0 },
  fitMeasure: { position: 'absolute', top: 0, left: 0, width: 10000, opacity: 0 },
  input: { position: 'absolute', top: 0, left: 0, right: 0, height: 20, padding: 0, textAlign: 'left', textAlignVertical: 'center' },
  actions: { flexDirection: 'row', marginRight: 4 },
  iconButton: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  hidden: { display: 'none' },
  pressed: { opacity: 0.65 },
});
