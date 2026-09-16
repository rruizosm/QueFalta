import { PagerNativeScrollView as ScrollView } from '../components/bottom-tabs-pager/PagerNativeScroll';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { useRecipeFeed } from '../hooks/useRecipeFeed';
import { recipeFeed } from '../lib/recipeFeed';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import SlidingSegments from '../components/SlidingSegments';
import CreateRecipeButton from '../components/CreateRecipeButton';
import CommunityRecipeDetailModal from '../components/CommunityRecipeDetailModal';
import VerifiedBadge from '../components/VerifiedBadge';
import {
  setRecipeLiked,
  setRecipeSaved,
  type CommunityRecipe,
} from '../api/recipes';

type EngagementKind = 'like' | 'save';
type RecipeSort = 'likes' | 'saves' | null;
type RecipeSource = 'users' | 'supermarket';
const RECIPE_FILTER_GAP = 12;
const RECIPE_FILTER_HEIGHT = 36;
const EMPTY_RECIPES: CommunityRecipe[] = [];

export default function QueCocinoScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const { session } = useAuth();
  const toast = useToast();
  const userId = session?.user.id ?? '';
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const createButtonBottom = useTabBarBottomPadding(16);
  const [createButtonH, setCreateButtonH] = useState(44);
  const [headerH, setHeaderH] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [recipeSource, setRecipeSource] = useState<RecipeSource>('users');
  const [selectedRecipe, setSelectedRecipe] = useState<CommunityRecipe | null>(null);
  const feed = useRecipeFeed(userId);
  const communityRecipes = feed.recipes ?? EMPTY_RECIPES;
  const recipesLoading = !!userId && feed.recipes === null && !feed.error;
  const recipesError = feed.error;
  const [recipeSort, setRecipeSort] = useState<RecipeSort>(null);
  const [interactionBusy, setInteractionBusy] = useState<Record<string, boolean>>({});
  const setCommunityRecipes = useCallback((update: (current: CommunityRecipe[]) => CommunityRecipe[]) => {
    recipeFeed.update(userId, update);
  }, [userId]);
  const loadRecipes = useCallback(() => { void recipeFeed.refresh(userId, true); }, [userId]);

  const sortedRecipes = useMemo(() => {
    if (!recipeSort) return communityRecipes;
    const countKey = recipeSort === 'likes' ? 'likeCount' : 'saveCount';
    return communityRecipes
      .map((recipe, index) => ({ recipe, index }))
      .sort((a, b) => b.recipe[countKey] - a.recipe[countKey] || a.index - b.index)
      .map(({ recipe }) => recipe);
  }, [communityRecipes, recipeSort]);

  const updateRecipe = useCallback((
    recipeId: string,
    update: (recipe: CommunityRecipe) => CommunityRecipe,
  ) => {
    setCommunityRecipes((current) => current.map((recipe) => (
      recipe.id === recipeId ? update(recipe) : recipe
    )));
    setSelectedRecipe((current) => (
      current?.id === recipeId ? update(current) : current
    ));
  }, [setCommunityRecipes]);

  const toggleEngagement = useCallback(async (
    recipe: CommunityRecipe,
    kind: EngagementKind,
  ) => {
    if (!userId) return;
    const key = `${kind}:${recipe.id}`;
    if (interactionBusy[key]) return;

    const stateKey = kind === 'like' ? 'isLiked' : 'isSaved';
    const countKey = kind === 'like' ? 'likeCount' : 'saveCount';
    const nextActive = !recipe[stateKey];
    const countDelta = nextActive ? 1 : -1;
    const finishMutation = recipeFeed.beginMutation(userId);

    setInteractionBusy((current) => ({ ...current, [key]: true }));
    updateRecipe(recipe.id, (current) => ({
      ...current,
      [stateKey]: nextActive,
      [countKey]: Math.max(0, current[countKey] + countDelta),
    }));
    Haptics.selectionAsync().catch(() => {});

    try {
      if (kind === 'like') {
        await setRecipeLiked(recipe.id, userId, nextActive);
      } else {
        await setRecipeSaved(recipe.id, userId, nextActive);
      }
    } catch {
      updateRecipe(recipe.id, (current) => ({
        ...current,
        [stateKey]: !nextActive,
        [countKey]: Math.max(0, current[countKey] - countDelta),
      }));
      toast.show(t('queCocino.engagementError'), 'error');
    } finally {
      finishMutation();
      setInteractionBusy((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }, [interactionBusy, t, toast, updateRecipe, userId]);

  const selectRecipeSource = (source: RecipeSource) => {
    setRecipeSource(source);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const recipeFiltersVisible = recipeSource === 'users' && communityRecipes.length > 0;
  const glassInset = glassAvailable ? headerH : 0;
  const header = (
    <View
      style={[styles.header, { paddingTop: headerTop }]}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.height;
        setHeaderH((current) => Math.abs(current - next) > 0.5 ? next : current);
      }}
    >
      <View style={styles.titleWrap}>
        <View style={styles.headerIcon}>
          <Ionicons name="restaurant-outline" size={15} color={colors.accent} />
        </View>
        <Text style={styles.headerTitle}>{t('queCocino.title')}</Text>
      </View>
      <SlidingSegments<RecipeSource>
        emphasized
        style={styles.recipeSources}
        value={recipeSource}
        onChange={selectRecipeSource}
        segments={[
          { key: 'users', label: t('queCocino.sources.users') },
          { key: 'supermarket', label: t('queCocino.sources.supermarket') },
        ]}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
      {!glassAvailable && header}

      <ScrollView tabBarScroll
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingBottom: bottomPad + (recipeSource === 'users' ? createButtonH : 0),
            paddingTop: glassInset
              ? glassInset + RECIPE_FILTER_GAP + (recipeFiltersVisible ? RECIPE_FILTER_HEIGHT : 0)
              : RECIPE_FILTER_GAP + (recipeFiltersVisible ? RECIPE_FILTER_HEIGHT : 0),
          },
        ]}
      >
        {recipeSource === 'users' ? <>
          {recipesLoading ? (
            <View style={styles.recipeStatus}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.recipeStatusText}>{t('queCocino.loading')}</Text>
            </View>
          ) : null}

          {recipesError ? (
            <Pressable
              onPress={loadRecipes}
              style={({ pressed }) => [styles.recipeStatus, pressed && styles.createButtonPressed]}
              accessibilityRole="button"
            >
              <Ionicons name="refresh" size={18} color={colors.accent} />
              <Text style={styles.recipeStatusText}>{t('queCocino.loadError')}</Text>
            </Pressable>
          ) : null}

          {sortedRecipes.length > 0 ? (
            <View style={styles.recipeList}>
              {sortedRecipes.map((recipe) => (
                <View key={recipe.id} style={styles.communityRecipeCard}>
                  <Pressable
                    onPress={() => setSelectedRecipe(recipe)}
                    style={({ pressed }) => pressed && styles.recipeCardPressed}
                    accessibilityRole="button"
                    accessibilityLabel={t('queCocino.openRecipe', { name: recipe.title })}
                  >
                    <Image source={{ uri: recipe.imageUrl }} style={styles.communityRecipeImage} contentFit="cover" cachePolicy="memory-disk" />
                    <View style={styles.communityRecipeBody}>
                      <View style={styles.authorRow}>
                        {recipe.author.avatarUrl ? (
                          <Image source={{ uri: recipe.author.avatarUrl }} style={styles.realAuthorAvatar} cachePolicy="memory-disk" />
                        ) : (
                          <View style={[styles.authorAvatar, { backgroundColor: recipe.author.color }]}>
                            <Text style={styles.realAuthorInitial}>{recipe.author.initials}</Text>
                          </View>
                        )}
                        <View style={styles.authorIdentity}>
                          <Text style={styles.authorName} numberOfLines={1}>
                            {recipe.author.username ? `@${recipe.author.username}` : recipe.author.name}
                          </Text>
                          {recipe.author.verified ? <VerifiedBadge size={14} /> : null}
                        </View>
                      </View>
                      <Text style={styles.communityRecipeTitle} numberOfLines={2}>{recipe.title}</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => toggleEngagement(recipe, 'save')}
                    disabled={Boolean(interactionBusy[`save:${recipe.id}`])}
                    testID={`recipe-save-${recipe.id}`}
                    hitSlop={4}
                    style={({ pressed }) => [
                      styles.recipeSaveButton,
                      pressed && styles.recipeSaveButtonPressed,
                      interactionBusy[`save:${recipe.id}`] && styles.recipeSaveButtonBusy,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      recipe.isSaved ? 'queCocino.unsaveRecipe' : 'queCocino.saveRecipe',
                      { name: recipe.title, n: recipe.saveCount },
                    )}
                    accessibilityState={{
                      selected: recipe.isSaved,
                      busy: Boolean(interactionBusy[`save:${recipe.id}`]),
                      disabled: Boolean(interactionBusy[`save:${recipe.id}`]),
                    }}
                  >
                    <GlassSurface
                      style={[
                        styles.recipeSaveSurface,
                        recipe.isSaved && styles.recipeSaveSurfaceActive,
                      ]}
                      glassEffectStyle="regular"
                      tintColor={recipe.isSaved ? colors.accent : colors.white}
                      fallbackColor={recipe.isSaved ? colors.accent : colors.white}
                      interactive
                    >
                      <Ionicons
                        name={recipe.isSaved ? 'bookmark' : 'bookmark-outline'}
                        size={17}
                        color={recipe.isSaved ? colors.white : colors.ink}
                      />
                      <Text style={[
                        styles.recipeSaveButtonText,
                        recipe.isSaved && styles.recipeSaveButtonTextActive,
                      ]}>
                        {recipe.saveCount}
                      </Text>
                    </GlassSurface>
                  </Pressable>
                  <View style={styles.recipeMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="basket-outline" size={14} color={colors.inkSoft} />
                      <Text style={styles.metaText}>{t('queCocino.ingredientsCount', { n: recipe.ingredients.length })}</Text>
                    </View>
                    <View style={styles.metaDot} />
                    <View style={styles.metaItem}>
                      <Ionicons name="list-outline" size={14} color={colors.inkSoft} />
                      <Text style={styles.metaText}>{t('queCocino.stepsCount', { n: recipe.steps.length })}</Text>
                    </View>
                    <View style={styles.metaDot} />
                    <Pressable
                      onPress={() => toggleEngagement(recipe, 'like')}
                      disabled={Boolean(interactionBusy[`like:${recipe.id}`])}
                      hitSlop={5}
                      testID={`recipe-like-${recipe.id}`}
                      style={({ pressed }) => [
                        styles.metaAction,
                        pressed && styles.metaActionPressed,
                        interactionBusy[`like:${recipe.id}`] && styles.metaActionBusy,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        recipe.isLiked ? 'queCocino.unlikeRecipe' : 'queCocino.likeRecipe',
                        { name: recipe.title, n: recipe.likeCount },
                      )}
                      accessibilityState={{
                        selected: recipe.isLiked,
                        busy: Boolean(interactionBusy[`like:${recipe.id}`]),
                        disabled: Boolean(interactionBusy[`like:${recipe.id}`]),
                      }}
                    >
                      <Ionicons
                        name={recipe.isLiked ? 'heart' : 'heart-outline'}
                        size={14}
                        color={recipe.isLiked ? colors.accent : colors.inkSoft}
                      />
                      <Text style={[styles.metaText, recipe.isLiked && styles.metaTextActive]}>
                        {recipe.likeCount}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {!recipesLoading && !recipesError && communityRecipes.length === 0 ? (
            <View style={styles.emptyRecipes}>
              <View style={styles.emptyRecipesIcon}>
                <Ionicons name="restaurant-outline" size={24} color={colors.accent} />
              </View>
              <Text style={styles.emptyRecipesTitle}>{t('queCocino.emptyTitle')}</Text>
              <Text style={styles.emptyRecipesText}>{t('queCocino.emptyText')}</Text>
            </View>
          ) : null}
        </> : (
          <View style={styles.emptyRecipes}>
            <View style={styles.emptyRecipesIcon}>
              <Ionicons name="storefront-outline" size={24} color={colors.accent} />
            </View>
            <Text style={styles.emptyRecipesTitle}>{t('queCocino.supermarketEmptyTitle')}</Text>
            <Text style={styles.emptyRecipesText}>{t('queCocino.supermarketEmptyText')}</Text>
          </View>
        )}
      </ScrollView>

      {recipeFiltersVisible ? (
        <View
          style={[styles.recipeFilters, styles.recipeFiltersFixed, { top: headerH + RECIPE_FILTER_GAP }]}
          accessibilityRole="toolbar"
        >
          <Pressable
            onPress={() => {
              setRecipeSort((current) => current === 'likes' ? null : 'likes');
              Haptics.selectionAsync().catch(() => {});
            }}
            testID="recipe-filter-liked"
            style={({ pressed }) => [
              styles.recipeFilter,
              pressed && styles.recipeSaveButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('queCocino.filters.mostLiked')}
            accessibilityState={{ selected: recipeSort === 'likes' }}
          >
            <GlassSurface
              style={[
                styles.recipeFilterSurface,
                recipeSort === 'likes' && styles.recipeFilterSurfaceActive,
              ]}
              glassEffectStyle="regular"
              tintColor={recipeSort === 'likes' ? colors.accent : colors.white}
              fallbackColor={recipeSort === 'likes' ? colors.accent : colors.white}
              interactive
            >
              <Ionicons
                name={recipeSort === 'likes' ? 'heart' : 'heart-outline'}
                size={17}
                color={recipeSort === 'likes' ? colors.white : colors.ink}
              />
              <Text style={[
                styles.recipeFilterText,
                recipeSort === 'likes' && styles.recipeFilterTextActive,
              ]}>
                {t('queCocino.filters.mostLiked')}
              </Text>
            </GlassSurface>
          </Pressable>
          <Pressable
            onPress={() => {
              setRecipeSort((current) => current === 'saves' ? null : 'saves');
              Haptics.selectionAsync().catch(() => {});
            }}
            testID="recipe-filter-saved"
            style={({ pressed }) => [
              styles.recipeFilter,
              pressed && styles.recipeSaveButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('queCocino.filters.mostSaved')}
            accessibilityState={{ selected: recipeSort === 'saves' }}
          >
            <GlassSurface
              style={[
                styles.recipeFilterSurface,
                recipeSort === 'saves' && styles.recipeFilterSurfaceActive,
              ]}
              glassEffectStyle="regular"
              tintColor={recipeSort === 'saves' ? colors.accent : colors.white}
              fallbackColor={recipeSort === 'saves' ? colors.accent : colors.white}
              interactive
            >
              <Ionicons
                name={recipeSort === 'saves' ? 'bookmark' : 'bookmark-outline'}
                size={17}
                color={recipeSort === 'saves' ? colors.white : colors.ink}
              />
              <Text style={[
                styles.recipeFilterText,
                recipeSort === 'saves' && styles.recipeFilterTextActive,
              ]}>
                {t('queCocino.filters.mostSaved')}
              </Text>
            </GlassSurface>
          </Pressable>
        </View>
      ) : null}

      {glassAvailable && (
        <View style={styles.chrome}>
          <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>
            {header}
          </GlassSurface>
        </View>
      )}

      {recipeSource === 'users' && (
        <CreateRecipeButton bottom={createButtonBottom}
          onLayout={(event) => setCreateButtonH(event.nativeEvent.layout.height)} />
      )}

      <CommunityRecipeDetailModal
        recipe={selectedRecipe}
        onClose={() => setSelectedRecipe(null)}
        onToggleLike={(recipe) => toggleEngagement(recipe, 'like')}
        onToggleSave={(recipe) => toggleEngagement(recipe, 'save')}
        likeBusy={selectedRecipe ? Boolean(interactionBusy[`like:${selectedRecipe.id}`]) : false}
        saveBusy={selectedRecipe ? Boolean(interactionBusy[`save:${selectedRecipe.id}`]) : false}
      />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingHorizontal: 16 },
  header: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  titleWrap: {
    flexGrow: 1, minWidth: 116, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  recipeSources: { width: 224, maxWidth: '100%', marginLeft: 'auto' },
  headerIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, fontSize: 20, fontFamily: fonts.bold,
    color: colors.ink, letterSpacing: -0.3,
  },
  createButtonPressed: { opacity: 0.82 },
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  chromeGlass: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  recipeStatus: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 8, marginBottom: 11, borderRadius: 16, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
  },
  recipeStatusText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.inkSoft },
  recipeFilters: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  recipeFiltersFixed: {
    position: 'absolute', left: 16, right: 16, zIndex: 9, elevation: 3,
  },
  recipeFilter: {
    minHeight: RECIPE_FILTER_HEIGHT, borderRadius: RECIPE_FILTER_HEIGHT / 2,
  },
  recipeFilterSurface: {
    minHeight: RECIPE_FILTER_HEIGHT, paddingHorizontal: 12, borderRadius: RECIPE_FILTER_HEIGHT / 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  recipeFilterSurfaceActive: { borderColor: colors.accent },
  recipeFilterText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.inkSoft },
  recipeFilterTextActive: { color: colors.white },
  recipeList: { gap: 11, paddingTop: RECIPE_FILTER_GAP },
  communityRecipeCard: {
    overflow: 'hidden', backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, borderRadius: 18,
  },
  recipeSaveButton: {
    position: 'absolute', top: 12, right: 12, zIndex: 1, elevation: 2,
    minWidth: 36, minHeight: 36, borderRadius: 18,
  },
  recipeSaveSurface: {
    minWidth: 36, minHeight: 36, paddingHorizontal: 9, borderRadius: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  recipeSaveSurfaceActive: { borderColor: colors.accent },
  recipeSaveButtonPressed: { opacity: 0.84, transform: [{ scale: 0.93 }] },
  recipeSaveButtonBusy: { opacity: 0.55 },
  recipeSaveButtonText: { fontSize: 11, fontFamily: fonts.bold, color: colors.inkSoft },
  recipeSaveButtonTextActive: { color: colors.white },
  recipeCardPressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
  communityRecipeImage: { width: '100%', height: 178, backgroundColor: colors.photoPlaceholder },
  communityRecipeBody: { paddingHorizontal: 13, paddingTop: 13 },
  communityRecipeTitle: {
    fontSize: 17, lineHeight: 21, fontFamily: fonts.bold,
    color: colors.ink, marginTop: 9,
  },
  realAuthorAvatar: { width: 24, height: 24, borderRadius: 9, backgroundColor: colors.photoPlaceholder },
  realAuthorInitial: { fontSize: 10, fontFamily: fonts.bold, color: '#ffffff' },
  authorRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
  authorIdentity: {
    flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center',
  },
  authorAvatar: {
    width: 22, height: 22, borderRadius: 8,
    backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center',
  },
  authorName: { flexShrink: 1, fontSize: 10.5, fontFamily: fonts.semibold, color: colors.inkSoft },
  recipeMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 13, paddingTop: 8, paddingBottom: 13,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaAction: {
    minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingHorizontal: 1,
  },
  metaActionPressed: { opacity: 0.62, transform: [{ scale: 0.95 }] },
  metaActionBusy: { opacity: 0.5 },
  metaText: { fontSize: 10.5, fontFamily: fonts.semibold, color: colors.inkSoft },
  metaTextActive: { color: colors.accent },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.border },
  emptyRecipes: {
    alignItems: 'center', marginTop: 8, paddingHorizontal: 24, paddingVertical: 30,
    borderWidth: 1, borderColor: colors.border, borderRadius: 18,
    backgroundColor: colors.white,
  },
  emptyRecipesIcon: {
    width: 48, height: 48, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight,
  },
  emptyRecipesTitle: {
    marginTop: 12, fontSize: 15, fontFamily: fonts.bold, color: colors.ink,
    textAlign: 'center',
  },
  emptyRecipesText: {
    marginTop: 4, fontSize: 12, lineHeight: 17, fontFamily: fonts.medium,
    color: colors.inkSoft, textAlign: 'center',
  },
});
