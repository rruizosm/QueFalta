import { useState } from 'react';
import {
  Image, ScrollView, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { STORE_META, type Store } from '../constants/stores';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import HardShadow from '../components/HardShadow';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';

type Recipe = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  difficultyKey: string;
  author: string;
  initials: string;
  emoji: string;
  minutes: number;
  likes: number;
  gradient: readonly [string, string];
};

const OFFICIAL_STORES: Store[] = ['mercadona', 'carrefour', 'dia', 'eroski'];

const SAMPLE_RECIPES: Recipe[] = [
  {
    id: 'tortilla', titleKey: 'queCocino.recipes.tortilla.title',
    descriptionKey: 'queCocino.recipes.tortilla.description',
    difficultyKey: 'queCocino.difficulty.easy', author: '@lauraencasa', initials: 'L',
    emoji: '🥔', minutes: 35, likes: 128, gradient: ['#F7CF63', '#E99434'],
  },
  {
    id: 'pasta', titleKey: 'queCocino.recipes.pasta.title',
    descriptionKey: 'queCocino.recipes.pasta.description',
    difficultyKey: 'queCocino.difficulty.easy', author: '@marcocina', initials: 'M',
    emoji: '🍝', minutes: 25, likes: 94, gradient: ['#F2A86F', '#D85F45'],
  },
  {
    id: 'curry', titleKey: 'queCocino.recipes.curry.title',
    descriptionKey: 'queCocino.recipes.curry.description',
    difficultyKey: 'queCocino.difficulty.medium', author: '@nuria_alplato', initials: 'N',
    emoji: '🥘', minutes: 40, likes: 211, gradient: ['#E6B94A', '#C56B2D'],
  },
  {
    id: 'salad', titleKey: 'queCocino.recipes.salad.title',
    descriptionKey: 'queCocino.recipes.salad.description',
    difficultyKey: 'queCocino.difficulty.veryEasy', author: '@paucomebien', initials: 'P',
    emoji: '🥗', minutes: 15, likes: 76, gradient: ['#7BCB83', '#2E8B62'],
  },
];

export default function QueCocinoScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const [headerH, setHeaderH] = useState(0);
  const glassInset = glassAvailable ? headerH : 0;
  const header = (
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <View style={styles.headerIcon}>
        <Ionicons name="restaurant-outline" size={18} color={colors.accent} />
      </View>
      <Text style={styles.headerTitle}>{t('queCocino.title')}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
      {!glassAvailable && header}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: bottomPad, paddingTop: glassInset ? glassInset + 12 : 8 },
        ]}
      >
        <LinearGradient
          colors={[colors.accent, colors.accent]}
          style={styles.hero}
        >
          <View style={styles.heroGlowLarge} />
          <View style={styles.heroGlowSmall} />
          <View style={styles.heroBadge}>
            <Ionicons name="sparkles" size={12} color={colors.accent} />
            <Text style={styles.heroBadgeText}>{t('queCocino.newContent')}</Text>
          </View>
          <View style={styles.heroBody}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>{t('queCocino.heroTitle')}</Text>
              <Text style={styles.heroText}>{t('queCocino.heroText')}</Text>
            </View>
            <View style={styles.heroIcon}>
              <Text style={styles.heroEmoji}>🍳</Text>
            </View>
          </View>
        </LinearGradient>

        <SectionHeading
          icon="storefront-outline"
          title={t('queCocino.supermarketsTitle')}
          subtitle={t('queCocino.supermarketsSubtitle')}
          styles={styles}
        />

        <HardShadow style={styles.officialCard}>
          <View style={styles.officialTop}>
            <View style={styles.officialIcon}>
              <Ionicons name="book-outline" size={23} color={colors.accent} />
            </View>
            <View style={styles.officialCopy}>
              <Text style={styles.officialTitle}>{t('queCocino.officialComingTitle')}</Text>
              <Text style={styles.officialText}>{t('queCocino.officialComingText')}</Text>
            </View>
            <View style={styles.soonBadge}>
              <Text style={styles.soonBadgeText}>{t('queCocino.soon')}</Text>
            </View>
          </View>
          <View style={styles.storeStrip}>
            {OFFICIAL_STORES.map((store) => (
              <View key={store} style={styles.storePill}>
                <Image source={STORE_META[store].icon} style={styles.storeLogo} resizeMode="contain" />
                <Text style={styles.storeName} numberOfLines={1}>{STORE_META[store].name}</Text>
              </View>
            ))}
          </View>
        </HardShadow>

        <SectionHeading
          icon="people-outline"
          title={t('queCocino.communityTitle')}
          subtitle={t('queCocino.communitySubtitle')}
          badge={t('queCocino.sample')}
          styles={styles}
        />

        <View style={styles.recipeList}>
          {SAMPLE_RECIPES.map((recipe) => (
            <View key={recipe.id} style={styles.recipeCard}>
              <LinearGradient colors={recipe.gradient} style={styles.recipeVisual}>
                <View style={styles.recipeVisualGlow} />
                <Text style={styles.recipeEmoji}>{recipe.emoji}</Text>
              </LinearGradient>
              <View style={styles.recipeContent}>
                <View style={styles.recipeTopRow}>
                  <View style={styles.authorRow}>
                    <View style={styles.authorAvatar}>
                      <Text style={styles.authorInitial}>{recipe.initials}</Text>
                    </View>
                    <Text style={styles.authorName} numberOfLines={1}>{recipe.author}</Text>
                  </View>
                  <View style={styles.likeRow}>
                    <Ionicons name="heart-outline" size={14} color={colors.accent} />
                    <Text style={styles.likeText}>{recipe.likes}</Text>
                  </View>
                </View>
                <Text style={styles.recipeTitle} numberOfLines={2}>{t(recipe.titleKey)}</Text>
                <Text style={styles.recipeDescription} numberOfLines={2}>{t(recipe.descriptionKey)}</Text>
                <View style={styles.recipeMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color={colors.inkSoft} />
                    <Text style={styles.metaText}>{t('queCocino.minutes', { n: recipe.minutes })}</Text>
                  </View>
                  <View style={styles.metaDot} />
                  <View style={styles.metaItem}>
                    <Ionicons name="speedometer-outline" size={14} color={colors.inkSoft} />
                    <Text style={styles.metaText}>{t(recipe.difficultyKey)}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.communityNote}>
          <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
          <Text style={styles.communityNoteText}>{t('queCocino.sampleNotice')}</Text>
        </View>
      </ScrollView>

      {glassAvailable && (
        <View style={styles.chrome} onLayout={(event) => setHeaderH(event.nativeEvent.layout.height)}>
          <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>
            {header}
          </GlassSurface>
        </View>
      )}
    </View>
  );
}

function SectionHeading({
  icon, title, subtitle, badge, styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  badge?: string;
  styles: ReturnType<typeof themedStyles>;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.sectionCopy}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {badge ? <Text style={styles.sampleBadge}>{badge}</Text> : null}
        </View>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingHorizontal: 16 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 10,
  },
  headerIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, fontSize: 21, fontFamily: fonts.bold,
    color: colors.ink, letterSpacing: -0.3,
  },
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  chromeGlass: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  hero: {
    padding: 18, minHeight: 172, borderRadius: 22, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
  },
  heroGlowLarge: {
    position: 'absolute', width: 170, height: 170, borderRadius: 85,
    right: -58, top: -90, backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroGlowSmall: {
    position: 'absolute', width: 90, height: 90, borderRadius: 45,
    left: -34, bottom: -50, backgroundColor: 'rgba(255,255,255,0.10)',
  },
  heroBadge: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  heroBadgeText: {
    fontSize: 9.5, fontFamily: fonts.bold, color: colors.accent,
    letterSpacing: 0.6, textTransform: 'uppercase',
  },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 15 },
  heroCopy: { flex: 1, minWidth: 0 },
  heroTitle: {
    fontSize: 23, lineHeight: 27, fontFamily: fonts.bold,
    color: '#ffffff', letterSpacing: -0.5,
  },
  heroText: {
    fontSize: 12.5, lineHeight: 18, fontFamily: fonts.medium,
    color: 'rgba(255,255,255,0.86)', marginTop: 6,
  },
  heroIcon: {
    width: 68, height: 68, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.17)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  heroEmoji: { fontSize: 36 },

  sectionHeading: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 24, marginBottom: 10,
  },
  sectionIcon: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  sectionCopy: { flex: 1, minWidth: 0 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: { flexShrink: 1, fontSize: 17, fontFamily: fonts.bold, color: colors.ink },
  sectionSubtitle: {
    fontSize: 12, lineHeight: 16, fontFamily: fonts.medium,
    color: colors.inkSoft, marginTop: 1,
  },
  sampleBadge: {
    fontSize: 9, fontFamily: fonts.bold, color: colors.accent,
    backgroundColor: colors.accentLight, overflow: 'hidden',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  officialCard: { padding: 14, borderColor: colors.border, borderRadius: 18 },
  officialTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  officialIcon: {
    width: 45, height: 45, borderRadius: 15,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  officialCopy: { flex: 1, minWidth: 0 },
  officialTitle: { fontSize: 14.5, fontFamily: fonts.bold, color: colors.ink },
  officialText: {
    fontSize: 11.5, lineHeight: 16, fontFamily: fonts.medium,
    color: colors.inkSoft, marginTop: 2,
  },
  soonBadge: {
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10,
    backgroundColor: colors.surfaceAlt, flexShrink: 0,
  },
  soonBadgeText: { fontSize: 9, fontFamily: fonts.bold, color: colors.inkSoft, textTransform: 'uppercase' },
  storeStrip: { flexDirection: 'row', gap: 7, marginTop: 14 },
  storePill: {
    flex: 1, minWidth: 0, alignItems: 'center', gap: 5,
    paddingHorizontal: 4, paddingVertical: 8, borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
  },
  storeLogo: { width: 26, height: 26, borderRadius: 7 },
  storeName: { width: '100%', fontSize: 8.5, fontFamily: fonts.semibold, color: colors.inkSoft, textAlign: 'center' },

  recipeList: { gap: 11 },
  recipeCard: {
    minHeight: 154, flexDirection: 'row', overflow: 'hidden',
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, borderRadius: 18,
  },
  recipeVisual: {
    width: 104, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  recipeVisualGlow: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    top: -44, left: -30, backgroundColor: 'rgba(255,255,255,0.24)',
  },
  recipeEmoji: { fontSize: 43 },
  recipeContent: { flex: 1, minWidth: 0, padding: 12 },
  recipeTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 },
  authorRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
  authorAvatar: {
    width: 22, height: 22, borderRadius: 8,
    backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center',
  },
  authorInitial: { fontSize: 10, fontFamily: fonts.bold, color: colors.accent },
  authorName: { flex: 1, fontSize: 10.5, fontFamily: fonts.semibold, color: colors.inkSoft },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  likeText: { fontSize: 10.5, fontFamily: fonts.semibold, color: colors.inkSoft },
  recipeTitle: {
    fontSize: 15.5, lineHeight: 19, fontFamily: fonts.bold,
    color: colors.ink, marginTop: 8,
  },
  recipeDescription: {
    fontSize: 11.5, lineHeight: 16, fontFamily: fonts.medium,
    color: colors.inkSoft, marginTop: 3,
  },
  recipeMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 'auto', paddingTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 10.5, fontFamily: fonts.semibold, color: colors.inkSoft },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.border },
  communityNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginTop: 13, padding: 12, borderRadius: 15,
    backgroundColor: colors.accentLight,
  },
  communityNoteText: {
    flex: 1, fontSize: 11.5, lineHeight: 16,
    fontFamily: fonts.medium, color: colors.inkSoft,
  },
});
