import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const screenUrl = new URL('../../src/screens/QueCocinoScreen.tsx', import.meta.url);
const apiUrl = new URL('../../src/api/recipes.ts', import.meta.url);
const actionsUrl = new URL('../../src/components/RecipeEngagementActions.tsx', import.meta.url);
const detailUrl = new URL('../../src/components/CommunityRecipeDetailModal.tsx', import.meta.url);
const badgeUrl = new URL('../../src/components/VerifiedBadge.tsx', import.meta.url);
const translationsUrl = new URL('../../src/i18n/translations.ts', import.meta.url);
const limitsUrl = new URL('../../src/constants/limits.ts', import.meta.url);
const navigationUrl = new URL('../../src/navigation/index.tsx', import.meta.url);

test('recipes are enabled and mounted as a tab', async () => {
  const [limits, navigation] = await Promise.all([
    readFile(limitsUrl, 'utf8'),
    readFile(navigationUrl, 'utf8'),
  ]);

  assert.match(limits, /export const QUE_COCINO_ENABLED = true/);
  assert.match(navigation, /\{QUE_COCINO_ENABLED && \([\s\S]*name="QueCocino"[\s\S]*component=\{QueCocinoScreen\}/);
});

test('recipe sources separate community content from the unavailable supermarket catalog', async () => {
  const [screen, translations] = await Promise.all([
    readFile(screenUrl, 'utf8'),
    readFile(translationsUrl, 'utf8'),
  ]);

  assert.match(screen, /useRecipeFeed\(userId\)/);
  assert.match(screen, /sortedRecipes\.map/);
  assert.match(screen, /!recipesLoading && !recipesError && communityRecipes\.length === 0/);
  assert.doesNotMatch(screen, /SectionHeading|SAMPLE_RECIPES|OFFICIAL_STORES/);
  assert.match(screen, /useState<RecipeSource>\('users'\)/);
  assert.match(screen, /<SlidingSegments<RecipeSource>[\s\S]*emphasized[\s\S]*value=\{recipeSource\}[\s\S]*onChange=\{selectRecipeSource\}/);
  assert.match(screen, /recipeSource === 'users' \? <>[\s\S]*sortedRecipes\.map[\s\S]*<\/\> : \([\s\S]*queCocino\.supermarketEmptyTitle/);
  assert.match(screen, /recipeFiltersVisible = recipeSource === 'users' && communityRecipes.length > 0/);
  assert.match(screen, /scrollRef\.current\?\.scrollTo\(\{ y: 0, animated: false \}\)/);
  assert.match(translations, /sources: \{ users: 'Usuarios', supermarket: 'Supermercado' \}/);
  assert.match(translations, /sources: \{ users: 'Usuaris', supermarket: 'Supermercat' \}/);
  assert.doesNotMatch(translations, /communityTitle|communitySubtitle|sourceCommunity|sourceSupermarkets|sampleIdeas|sampleNotice|queCocino\.recipes/);
});

test('recipe previews expose persistent like and save actions with counts', async () => {
  const [screen, api, actions, translations] = await Promise.all([
    readFile(screenUrl, 'utf8'),
    readFile(apiUrl, 'utf8'),
    readFile(actionsUrl, 'utf8'),
    readFile(translationsUrl, 'utf8'),
  ]);

  assert.match(screen, /recipe\.likeCount/);
  assert.match(screen, /recipe\.saveCount/);
  assert.match(screen, /testID=\{`recipe-like-\$\{recipe\.id\}`\}/);
  assert.match(screen, /testID=\{`recipe-save-\$\{recipe\.id\}`\}/);
  assert.match(screen, /recipeSaveButton:\s*\{[\s\S]*position: 'absolute', top: 12, right: 12[\s\S]*minHeight: 36/);
  assert.match(screen, /<GlassSurface[\s\S]*styles\.recipeSaveSurface[\s\S]*glassEffectStyle="regular"[\s\S]*interactive/);
  assert.match(screen, /tintColor=\{recipe\.isSaved \? colors\.accent : colors\.white\}/);
  assert.match(screen, /fallbackColor=\{recipe\.isSaved \? colors\.accent : colors\.white\}/);
  assert.match(screen, /color=\{recipe\.isSaved \? colors\.white : colors\.ink\}/);
  assert.match(screen, /recipeSaveSurfaceActive/);
  assert.doesNotMatch(screen, /<RecipeEngagementActions/);
  assert.match(screen, /setRecipeLiked/);
  assert.match(screen, /setRecipeSaved/);
  assert.match(api, /recipe_likes!recipe_likes_recipe_id_fkey\(user_id\)/);
  assert.match(api, /recipe_saves!recipe_saves_recipe_id_fkey\(user_id\)/);
  assert.match(api, /like_count, save_count/);
  assert.match(actions, /recipe\.likeCount/);
  assert.match(actions, /recipe\.saveCount/);
  assert.match(actions, /heart-outline/);
  assert.match(actions, /bookmark-outline/);
  assert.match(actions, /accessibilityState=\{\{ selected:/);
  assert.match(translations, /likesCount: '\{\{n\}\} Me gusta'/);
  assert.match(translations, /savesCount: '\{\{n\}\} guardados'/);
});

test('recipe controls stay fixed while sorting by like or save count', async () => {
  const [screen, translations] = await Promise.all([
    readFile(screenUrl, 'utf8'),
    readFile(translationsUrl, 'utf8'),
  ]);

  assert.match(screen, /const \[recipeSort, setRecipeSort\] = useState<RecipeSort>\(null\)/);
  assert.match(screen, /recipeSort === 'likes' \? 'likeCount' : 'saveCount'/);
  assert.match(screen, /b\.recipe\[countKey\] - a\.recipe\[countKey\]/);
  assert.match(screen, /testID="recipe-filter-liked"/);
  assert.match(screen, /testID="recipe-filter-saved"/);
  assert.match(screen, /current === 'likes' \? null : 'likes'/);
  assert.match(screen, /current === 'saves' \? null : 'saves'/);
  assert.ok(screen.indexOf('styles.recipeFiltersFixed') > screen.indexOf('</ScrollView>'));
  assert.match(screen, /styles\.recipeFiltersFixed, \{ top: headerH \+ RECIPE_FILTER_GAP \}/);
  assert.match(screen, /recipeFiltersFixed: \{[\s\S]*position: 'absolute'[\s\S]*zIndex: 9/);
  assert.doesNotMatch(screen, /filteredRecipes|likedOnly|savedOnly/);
  assert.equal((screen.match(/styles\.recipeFilterSurface,/g) ?? []).length, 2);
  assert.match(screen, /tintColor=\{recipeSort === 'likes' \? colors\.accent : colors\.white\}/);
  assert.match(screen, /tintColor=\{recipeSort === 'saves' \? colors\.accent : colors\.white\}/);
  assert.equal((screen.match(/pressed && styles\.recipeSaveButtonPressed/g) ?? []).length, 3);
  assert.doesNotMatch(screen, /recipeFilterPressed|recipeFilterActive/);
  assert.match(translations, /mostLiked: 'Más gustados'/);
  assert.match(translations, /mostSaved: 'Más guardados'/);
  assert.match(translations, /mostLiked: 'Més agradades'/);
  assert.match(translations, /mostSaved: 'Més desades'/);
});

test('recipe detail overlays circular icon-only like and save buttons on the image', async () => {
  const [detail, actions] = await Promise.all([
    readFile(detailUrl, 'utf8'),
    readFile(actionsUrl, 'utf8'),
  ]);

  assert.match(detail, /heroHeader[\s\S]*<RecipeEngagementActions/);
  assert.ok(detail.indexOf('<RecipeEngagementActions') < detail.indexOf('style={styles.heroCopy}'));
  assert.doesNotMatch(detail, /engagementActions/);
  assert.match(actions, /name=\{recipe\.isLiked \? 'heart' : 'heart-outline'\}/);
  assert.match(actions, /name=\{recipe\.isSaved \? 'bookmark' : 'bookmark-outline'\}/);
  assert.match(actions, /width: 36,[\s\S]*height: 36,[\s\S]*borderRadius: 18/);
  assert.equal((actions.match(/<GlassSurface/g) ?? []).length, 2);
  assert.equal((actions.match(/\binteractive\b/g) ?? []).length, 2);
  assert.match(actions, /tintColor=\{recipe\.isLiked \? colors\.accent : colors\.white\}/);
  assert.match(actions, /tintColor=\{recipe\.isSaved \? colors\.accent : colors\.white\}/);
  assert.match(actions, /fallbackColor=\{recipe\.isLiked \? colors\.accent : colors\.white\}/);
  assert.match(actions, /fallbackColor=\{recipe\.isSaved \? colors\.accent : colors\.white\}/);
  assert.match(actions, /color=\{recipe\.isLiked \? colors\.white : colors\.ink\}/);
  assert.match(actions, /color=\{recipe\.isSaved \? colors\.white : colors\.ink\}/);
  assert.match(actions, /actionPressed: \{ opacity: 0\.84, transform: \[\{ scale: 0\.93 \}\] \}/);
  assert.doesNotMatch(actions, /GlassView|Platform\.OS/);
  assert.doesNotMatch(actions, /<Text/);
});

test('recipe filters keep the same gap from the header and first recipe', async () => {
  const screen = await readFile(screenUrl, 'utf8');

  assert.match(screen, /const RECIPE_FILTER_GAP = 12/);
  assert.match(screen, /const RECIPE_FILTER_HEIGHT = 36/);
  assert.match(screen, /glassInset \+ RECIPE_FILTER_GAP \+ \(recipeFiltersVisible \? RECIPE_FILTER_HEIGHT : 0\)/);
  assert.match(screen, /: RECIPE_FILTER_GAP \+ \(recipeFiltersVisible \? RECIPE_FILTER_HEIGHT : 0\)/);
  assert.match(screen, /top: headerH \+ RECIPE_FILTER_GAP/);
  assert.match(screen, /recipeList: \{ gap: 11, paddingTop: RECIPE_FILTER_GAP \}/);
});

test('recipe previews show the golden public Plus badge beside verified authors', async () => {
  const [screen, api, badge] = await Promise.all([
    readFile(screenUrl, 'utf8'),
    readFile(apiUrl, 'utf8'),
    readFile(badgeUrl, 'utf8'),
  ]);

  assert.match(api, /profiles!recipes_author_id_fkey\(name, username, initials, color, avatar_url, verified\)/);
  assert.match(api, /verified: author\?\.verified \?\? false/);
  assert.match(api, /verified: profileFallback\.verified/);
  assert.match(screen, /import VerifiedBadge from '\.\.\/components\/VerifiedBadge'/);
  assert.match(screen, /recipe\.author\.verified \? <VerifiedBadge size=\{14\} \/> : null/);
  assert.match(screen, /<View style=\{styles\.authorIdentity\}>[\s\S]*authorName[\s\S]*VerifiedBadge/);
  assert.match(badge, /tone = 'gold'/);
  assert.match(badge, /tone === 'gold' \? '#F7D25A'/);
  assert.match(badge, /tone === 'gold' \? '#D2900F'/);
});
