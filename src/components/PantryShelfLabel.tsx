import { memo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts } from '../constants/typography';
import { useTranslation } from '../context/LanguageContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { PANTRY_MAX_SHELF_NAME_LENGTH, type PantryShelfLabel as ShelfLabel } from '../lib/pantryLayout';
import GroupIconPickerSheet from './GroupIconPickerSheet';

interface Props {
  index: number;
  label?: ShelfLabel;
  editing: boolean;
  onChange: (index: number, label: ShelfLabel | null) => void;
}

function PantryShelfLabel({ index, label, editing, onChange }: Props) {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const styles = useThemedStyles(themedStyles);
  const [choosingEmoji, setChoosingEmoji] = useState(false);
  const [focusNew, setFocusNew] = useState(false);
  const ink = scheme === 'dark' ? '#FFF4E3' : '#49311E';
  const location = t('pantry.shelfLocation', { number: index + 1 });
  if (!label) return editing ? <Pressable testID={`pantry-add-label-${index}`}
    accessibilityRole="button" accessibilityLabel={t('pantry.addShelfLabel', { number: index + 1 })}
    hitSlop={6} onPress={() => { setFocusNew(true); onChange(index, { name: '', emoji: null }); }}
    style={({ pressed }) => [styles.add, pressed && styles.pressed]}>
    <Ionicons name="add" size={18} color={ink} />
  </Pressable> : null;

  return <View style={styles.labelRow}>
    <View testID={`pantry-shelf-label-${index}`} style={[styles.sign, scheme === 'dark' && styles.darkSign]}
      accessible={!editing} accessibilityLabel={editing ? undefined
        : `${location}: ${label.emoji ?? ''} ${label.name.trim() || location}`}>
      <View style={styles.content}>
        {label.emoji ? <Text style={[styles.name, { color: ink }]} accessible={false}>{`${label.emoji}  `}</Text> : null}
        <View style={styles.nameField}>
          {/* The same text sizes the sign in both modes; the input never changes its bounds. */}
          <Text style={[styles.name, { color: ink }, editing && styles.hidden]} numberOfLines={1} accessible={false}>
            {label.name.trim() || location}
          </Text>
          {editing && <TextInput testID={`pantry-label-name-${index}`} style={[styles.name, styles.input, { color: ink }]}
            value={label.name} onChangeText={(name) => onChange(index, { ...label, name })}
            autoFocus={focusNew} onFocus={() => setFocusNew(false)} selectTextOnFocus
            maxLength={PANTRY_MAX_SHELF_NAME_LENGTH} returnKeyType="done"
            accessibilityLabel={t('pantry.shelfName', { number: index + 1 })}
            placeholder={location} placeholderTextColor={scheme === 'dark' ? '#D5BFA6' : '#82664A'} />}
        </View>
      </View>
    </View>
    {/* Reserve the actions' space in both modes so long names also keep the same width. */}
    <View style={[styles.actions, !editing && styles.hidden]} pointerEvents={editing ? 'auto' : 'none'}
      accessibilityElementsHidden={!editing} importantForAccessibility={editing ? 'auto' : 'no-hide-descendants'}>
      <Pressable testID={`pantry-label-emoji-${index}`} style={styles.iconButton}
        accessibilityRole="button" accessibilityLabel={t('pantry.shelfEmoji')}
        onPress={() => { Keyboard.dismiss(); setChoosingEmoji(true); }}>
        <Ionicons name="happy-outline" size={18} color={ink} />
      </Pressable>
      <Pressable testID={`pantry-remove-label-${index}`} style={styles.iconButton}
        accessibilityRole="button" accessibilityLabel={t('pantry.removeShelfLabel', { number: index + 1 })}
        onPress={() => { Keyboard.dismiss(); onChange(index, null); }}>
        <Ionicons name="close" size={18} color={ink} />
      </Pressable>
    </View>
    {choosingEmoji && editing && <GroupIconPickerSheet visible selectedIcon={label.emoji} busy={false}
      titleText={t('pantry.shelfEmoji')} subtitleText={location}
      optionAccessibilityLabel={t('pantry.shelfEmojiOption')}
      onSave={(emoji) => { onChange(index, { ...label, emoji }); setChoosingEmoji(false); }}
      onClose={() => setChoosingEmoji(false)} />}
  </View>;
}

export default memo(PantryShelfLabel);

const themedStyles = () => StyleSheet.create({
  add: { width: 32, height: 32, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#B58B62' },
  labelRow: { maxWidth: '100%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center' },
  sign: { minHeight: 36, maxWidth: '100%', flexShrink: 1, flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: '#B58B62', backgroundColor: '#FFF4E3',
    shadowColor: '#25150C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 3 },
  darkSign: { backgroundColor: '#49392D', borderColor: '#96724F' },
  content: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2 },
  nameField: { minWidth: 0, flexShrink: 1 },
  name: { fontSize: 15, lineHeight: 20, fontFamily: fonts.semibold },
  input: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    padding: 0, textAlignVertical: 'center' },
  actions: { flexShrink: 0, flexDirection: 'row', marginLeft: 4 },
  iconButton: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  hidden: { opacity: 0 },
  pressed: { opacity: 0.65 },
});
