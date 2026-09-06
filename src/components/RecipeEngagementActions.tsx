import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { CommunityRecipe } from '../api/recipes';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import GlassSurface from './GlassSurface';

interface Props {
  recipe: CommunityRecipe;
  onToggleLike: () => void;
  onToggleSave: () => void;
  likeBusy?: boolean;
  saveBusy?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function RecipeEngagementActions({
  recipe,
  onToggleLike,
  onToggleSave,
  likeBusy = false,
  saveBusy = false,
  style,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();

  return (
    <View style={[styles.row, style]}>
      <Pressable
        onPress={onToggleLike}
        disabled={likeBusy}
        hitSlop={4}
        testID={`recipe-like-${recipe.id}`}
        style={({ pressed }) => [
          styles.action,
          pressed && styles.actionPressed,
          likeBusy && styles.actionBusy,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t(
          recipe.isLiked ? 'queCocino.unlikeRecipe' : 'queCocino.likeRecipe',
          { name: recipe.title, n: recipe.likeCount },
        )}
        accessibilityState={{ selected: recipe.isLiked, busy: likeBusy, disabled: likeBusy }}
      >
        <GlassSurface
          style={[styles.actionSurface, recipe.isLiked && styles.actionSurfaceActive]}
          glassEffectStyle="regular"
          tintColor={recipe.isLiked ? colors.accent : colors.white}
          fallbackColor={recipe.isLiked ? colors.accent : colors.white}
          interactive
        >
          <Ionicons
            name={recipe.isLiked ? 'heart' : 'heart-outline'}
            size={21}
            color={recipe.isLiked ? colors.white : colors.ink}
          />
        </GlassSurface>
      </Pressable>

      <Pressable
        onPress={onToggleSave}
        disabled={saveBusy}
        hitSlop={4}
        testID={`recipe-save-${recipe.id}`}
        style={({ pressed }) => [
          styles.action,
          pressed && styles.actionPressed,
          saveBusy && styles.actionBusy,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t(
          recipe.isSaved ? 'queCocino.unsaveRecipe' : 'queCocino.saveRecipe',
          { name: recipe.title, n: recipe.saveCount },
        )}
        accessibilityState={{ selected: recipe.isSaved, busy: saveBusy, disabled: saveBusy }}
      >
        <GlassSurface
          style={[styles.actionSurface, recipe.isSaved && styles.actionSurfaceActive]}
          glassEffectStyle="regular"
          tintColor={recipe.isSaved ? colors.accent : colors.white}
          fallbackColor={recipe.isSaved ? colors.accent : colors.white}
          interactive
        >
          <Ionicons
            name={recipe.isSaved ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={recipe.isSaved ? colors.white : colors.ink}
          />
        </GlassSurface>
      </Pressable>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  action: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  actionSurface: {
    flex: 1,
    width: '100%',
    borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionSurfaceActive: {
    borderColor: colors.accent,
  },
  actionPressed: { opacity: 0.84, transform: [{ scale: 0.93 }] },
  actionBusy: { opacity: 0.55 },
});
