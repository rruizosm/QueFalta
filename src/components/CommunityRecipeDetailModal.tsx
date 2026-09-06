import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CommunityRecipe, RecipeIngredient } from '../api/recipes';
import { STORE_META } from '../constants/stores';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useCart } from '../context/CartContext';
import { recipeIngredientsToListItems } from '../lib/recipeCart';
import SlidingSegments, { type Segment } from './SlidingSegments';
import RecipeEngagementActions from './RecipeEngagementActions';

type DetailSection = 'ingredients' | 'steps';

interface Props {
  recipe: CommunityRecipe | null;
  onClose: () => void;
  onToggleLike: (recipe: CommunityRecipe) => void;
  onToggleSave: (recipe: CommunityRecipe) => void;
  likeBusy?: boolean;
  saveBusy?: boolean;
}

export default function CommunityRecipeDetailModal({
  recipe,
  onClose,
  onToggleLike,
  onToggleSave,
  likeBusy = false,
  saveBusy = false,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { activeCart, addToActiveCart, busy: cartBusy, hydrated } = useCart();
  const [section, setSection] = useState<DetailSection>('ingredients');
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);
  const [addedTo, setAddedTo] = useState<{ recipeId: string; listId: string } | null>(null);
  const recipeId = recipe?.id;
  const added = !!recipeId && addedTo?.recipeId === recipeId && addedTo?.listId === activeCart?.listId;

  useEffect(() => {
    setSection('ingredients');
    setAddedTo(null);
  }, [recipeId]);

  const handleAddIngredients = async () => {
    if (!recipe || !recipe.ingredients.length || addingRef.current || cartBusy || !hydrated || added) return;
    if (!activeCart) {
      Alert.alert(t('product.noCartTitle'), t('product.noCartMsg'));
      return;
    }

    addingRef.current = true;
    setAdding(true);
    try {
      await addToActiveCart(recipeIngredientsToListItems(recipe.ingredients));
      setAddedTo({ recipeId: recipe.id, listId: activeCart.listId });
    } catch {
      Alert.alert(t('common.error'), t('queCocino.detail.addError'));
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  };

  const segments = useMemo<Segment<DetailSection>[]>(() => [
    {
      key: 'ingredients',
      label: t('queCocino.detail.ingredients'),
      icon: 'basket-outline',
    },
    {
      key: 'steps',
      label: t('queCocino.detail.steps'),
      icon: 'list-outline',
    },
  ], [t]);

  if (!recipe) return null;

  const addButtonLabel = t(adding
    ? 'queCocino.detail.addingIngredients'
    : added ? 'queCocino.detail.ingredientsAdded' : 'queCocino.detail.addIngredients');
  const heroHeight = Math.min(Math.max(height * 0.45, 290), 390);
  const authorName = recipe.author.username
    ? `@${recipe.author.username}`
    : recipe.author.name;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        <View style={[styles.hero, { height: heroHeight }]}>
          <Image source={{ uri: recipe.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(0,0,0,0.32)', 'transparent', 'rgba(0,0,0,0.76)']}
            locations={[0, 0.46, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroHeader, { paddingTop: insets.top + 8 }]}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="chevron-back" size={23} color="#ffffff" />
            </Pressable>
            <RecipeEngagementActions
              recipe={recipe}
              onToggleLike={() => onToggleLike(recipe)}
              onToggleSave={() => onToggleSave(recipe)}
              likeBusy={likeBusy}
              saveBusy={saveBusy}
            />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.recipeTitle}>{recipe.title}</Text>
            <View style={styles.authorRow}>
              {recipe.author.avatarUrl ? (
                <Image source={{ uri: recipe.author.avatarUrl }} style={styles.authorAvatar} />
              ) : (
                <View style={[styles.authorAvatar, styles.authorFallback, { backgroundColor: recipe.author.color }]}>
                  <Text style={styles.authorInitial}>{recipe.author.initials}</Text>
                </View>
              )}
              <Text style={styles.authorName}>{authorName}</Text>
            </View>
          </View>
        </View>

        <View style={styles.contentPanel}>
          <SlidingSegments
            emphasized
            style={styles.sectionSelector}
            segments={segments}
            value={section}
            onChange={setSection}
          />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: section === 'ingredients' ? 16 : Math.max(insets.bottom, 16) + 24 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {section === 'ingredients' ? (
              <View style={styles.list}>
                {recipe.ingredients.map((ingredient, index) => (
                  <IngredientRow
                    key={`${ingredient.store}:${ingredient.productId}:${index}`}
                    ingredient={ingredient}
                    index={index}
                    unspecified={t('queCocino.detail.quantityUnspecified')}
                    styles={styles}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.list}>
                {recipe.steps.map((step, index) => {
                  const stepIngredients = recipe.ingredients.filter(
                    (ingredient) => ingredient.stepIndexes?.includes(index),
                  );
                  return (
                  <View key={`step-${index}`} style={styles.stepRow}>
                    <View style={styles.numberBadge}>
                      <Text style={styles.numberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.stepCopy}>
                      <Text style={styles.stepText}>{step}</Text>
                      {stepIngredients.length > 0 ? (
                        <View style={styles.stepIngredients}>
                          <Text style={styles.stepIngredientsLabel}>
                            {t('queCocino.detail.stepIngredients')}
                          </Text>
                          <View style={styles.stepIngredientChips}>
                            {stepIngredients.map((ingredient) => (
                              <View
                                key={`${ingredient.store}:${ingredient.productId}`}
                                style={styles.stepIngredientChip}
                              >
                                {ingredient.productImageUrl ? (
                                  <Image
                                    source={{ uri: ingredient.productImageUrl }}
                                    style={styles.stepIngredientImage}
                                    resizeMode="contain"
                                  />
                                ) : (
                                  <View style={[styles.stepIngredientImage, styles.ingredientFallback]}>
                                    <Ionicons name="basket-outline" size={13} color={colors.inkSoft} />
                                  </View>
                                )}
                                <Text style={styles.stepIngredientName} numberOfLines={1}>
                                  {ingredient.productName}
                                </Text>
                                {ingredient.quantity ? (
                                  <Text style={styles.stepIngredientQuantity} numberOfLines={1}>
                                    {ingredient.quantity}
                                  </Text>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {section === 'ingredients' && (
            <View style={[styles.cartFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <Text style={styles.cartDestination} accessibilityLiveRegion="polite">
                {activeCart
                  ? t(added ? 'queCocino.detail.addedToCart' : 'product.toGroup', { group: activeCart.groupName })
                  : t('product.noCartTitle')}
              </Text>
              <Pressable
                testID="recipe-add-ingredients"
                onPress={handleAddIngredients}
                disabled={adding || cartBusy || !hydrated || added || !recipe.ingredients.length}
                accessibilityRole="button"
                accessibilityLabel={addButtonLabel}
                accessibilityState={{
                  busy: adding,
                  disabled: adding || cartBusy || !hydrated || added || !recipe.ingredients.length,
                }}
                style={({ pressed }) => [
                  styles.addButton,
                  (adding || cartBusy || !hydrated || !recipe.ingredients.length) && styles.addButtonDisabled,
                  added && styles.addButtonDone,
                  pressed && styles.pressed,
                ]}
              >
                {adding ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name={added ? 'checkmark-circle' : 'cart-outline'} size={21} color={added ? colors.accent : '#ffffff'} />
                )}
                <Text style={[styles.addButtonText, added && styles.addButtonTextDone]}>
                  {addButtonLabel}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function IngredientRow({
  ingredient,
  index,
  unspecified,
  styles,
}: {
  ingredient: RecipeIngredient;
  index: number;
  unspecified: string;
  styles: ReturnType<typeof themedStyles>;
}) {
  const storeName = STORE_META[ingredient.store]?.name ?? ingredient.store;
  return (
    <View style={styles.ingredientRow}>
      <View style={styles.numberBadge}>
        <Text style={styles.numberText}>{index + 1}</Text>
      </View>
      {ingredient.productImageUrl ? (
        <Image
          source={{ uri: ingredient.productImageUrl }}
          style={styles.ingredientImage}
          resizeMode="contain"
        />
      ) : (
        <View style={[styles.ingredientImage, styles.ingredientFallback]}>
          <Ionicons name="basket-outline" size={20} color={colors.inkSoft} />
        </View>
      )}
      <View style={styles.ingredientCopy}>
        <Text style={styles.ingredientName}>{ingredient.productName}</Text>
        <Text style={styles.ingredientStore} numberOfLines={1}>
          {storeName}{ingredient.metaLabel ? ` · ${ingredient.metaLabel}` : ''}
        </Text>
      </View>
      <Text style={styles.quantity} numberOfLines={2}>
        {ingredient.quantity || unspecified}
      </Text>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  hero: { width: '100%', backgroundColor: colors.photoPlaceholder },
  heroHeader: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(25,21,18,0.58)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  heroCopy: { position: 'absolute', left: 18, right: 18, bottom: 38 },
  recipeTitle: {
    fontSize: 28, lineHeight: 32, fontFamily: fonts.bold,
    color: '#ffffff', letterSpacing: -0.6,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 },
  authorAvatar: { width: 27, height: 27, borderRadius: 10 },
  authorFallback: { alignItems: 'center', justifyContent: 'center' },
  authorInitial: { fontSize: 10, fontFamily: fonts.bold, color: '#ffffff' },
  authorName: { fontSize: 12, fontFamily: fonts.semibold, color: 'rgba(255,255,255,0.90)' },
  contentPanel: {
    flex: 1, marginTop: -22, paddingTop: 16,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    overflow: 'hidden', backgroundColor: colors.paper,
  },
  sectionSelector: { marginHorizontal: 16, marginBottom: 13 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  cartFooter: {
    paddingHorizontal: 16, paddingTop: 10, gap: 8,
    backgroundColor: colors.paper, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cartDestination: {
    fontSize: 12, lineHeight: 17, fontFamily: fonts.medium,
    color: colors.inkSoft, textAlign: 'center',
  },
  addButton: {
    minHeight: 50, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    backgroundColor: colors.accent,
  },
  addButtonDisabled: { opacity: 0.6 },
  addButtonDone: { backgroundColor: colors.accentLight },
  addButtonText: {
    flexShrink: 1, fontSize: 14, lineHeight: 20, fontFamily: fonts.bold,
    color: '#ffffff', textAlign: 'center',
  },
  addButtonTextDone: { color: colors.accent },
  list: { gap: 10 },
  ingredientRow: {
    minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 9,
    padding: 10, borderRadius: 17,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  numberBadge: {
    width: 30, height: 30, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight,
  },
  numberText: { fontSize: 12, fontFamily: fonts.bold, color: colors.accent },
  ingredientImage: {
    width: 48, height: 48, borderRadius: 11, backgroundColor: colors.photoPlaceholder,
  },
  ingredientFallback: { alignItems: 'center', justifyContent: 'center' },
  ingredientCopy: { flex: 1, minWidth: 0 },
  ingredientName: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.semibold, color: colors.ink },
  ingredientStore: { marginTop: 3, fontSize: 10.5, fontFamily: fonts.medium, color: colors.inkSoft },
  quantity: {
    maxWidth: 88, paddingHorizontal: 10, paddingVertical: 7,
    overflow: 'hidden', borderRadius: 11, textAlign: 'center',
    fontSize: 11.5, lineHeight: 15, fontFamily: fonts.bold,
    color: colors.accent, backgroundColor: colors.accentLight,
  },
  stepRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 11,
    padding: 14, borderRadius: 17,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  stepText: {
    paddingTop: 4, fontSize: 14, lineHeight: 21,
    fontFamily: fonts.medium, color: colors.ink,
  },
  stepCopy: { flex: 1, minWidth: 0 },
  stepIngredients: {
    marginTop: 12, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  stepIngredientsLabel: {
    marginBottom: 7, fontSize: 10, letterSpacing: 0.45, textTransform: 'uppercase',
    fontFamily: fonts.bold, color: colors.inkSoft,
  },
  stepIngredientChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stepIngredientChip: {
    maxWidth: '100%', minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 4, paddingLeft: 4, paddingRight: 8, borderRadius: 11,
    backgroundColor: colors.accentLight,
  },
  stepIngredientImage: {
    width: 24, height: 24, borderRadius: 7, backgroundColor: colors.photoPlaceholder,
  },
  stepIngredientName: {
    maxWidth: 150, fontSize: 10.5, fontFamily: fonts.semibold, color: colors.ink,
  },
  stepIngredientQuantity: {
    maxWidth: 80, fontSize: 10, fontFamily: fonts.bold, color: colors.accent,
  },
});
