import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { PANTRY_SEARCH_PAGE_SIZE, searchPantryProducts } from '../api/pantry';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import type { PantryProduct } from '../lib/pantryLayout';

export default function PantryProductPicker({ onSelect, onClose }: {
  onSelect: (product: PantryProduct) => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t, lang } = useTranslation();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<PantryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const version = useRef(0);
  const nextOffset = useRef(0);
  const moreRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const scope = ++version.current;
    const controller = new AbortController();
    moreRequest.current?.abort();
    moreRequest.current = null;
    setProducts([]);
    setLoading(true);
    setLoadingMore(false);
    setHasMore(false);
    setError(false);
    nextOffset.current = 0;
    const timer = setTimeout(() => {
      void searchPantryProducts(query, lang, 0, controller.signal).then((page) => {
        if (version.current !== scope || controller.signal.aborted) return;
        setProducts(page.products);
        setHasMore(page.hasMore);
        nextOffset.current = PANTRY_SEARCH_PAGE_SIZE;
      }).catch(() => {
        if (version.current === scope && !controller.signal.aborted) setError(true);
      }).finally(() => {
        if (version.current === scope && !controller.signal.aborted) setLoading(false);
      });
    }, query ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); moreRequest.current?.abort(); };
  }, [query, lang, attempt]);

  const loadMore = async () => {
    if (loading || loadingMore || moreRequest.current) return;
    const scope = version.current;
    const controller = new AbortController();
    moreRequest.current = controller;
    setLoadingMore(true);
    setError(false);
    try {
      const page = await searchPantryProducts(query, lang, nextOffset.current, controller.signal);
      if (version.current !== scope || controller.signal.aborted) return;
      setProducts((previous) => [...previous, ...page.products.filter((product) => !previous.some((p) => p.id === product.id))]);
      setHasMore(page.hasMore);
      nextOffset.current += PANTRY_SEARCH_PAGE_SIZE;
    } catch {
      if (version.current === scope && !controller.signal.aborted) setError(true);
    } finally {
      if (moreRequest.current === controller) moreRequest.current = null;
      if (version.current === scope && !controller.signal.aborted) setLoadingMore(false);
    }
  };

  const retry = () => products.length ? void loadMore() : setAttempt((n) => n + 1);
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Text style={styles.title} accessibilityRole="header">{t('pantry.productsTitle')}</Text>
            <Text style={styles.subtitle}>Mercadona</Text>
          </View>
          <Pressable style={styles.iconButton} accessibilityRole="button" accessibilityLabel={t('common.close')}
            testID="pantry-search-close" onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.search}>
          <Ionicons name="search-outline" size={20} color={colors.inkSoft} />
          <TextInput value={query} onChangeText={setQuery} style={styles.input} testID="pantry-search-input"
            placeholder={t('pantry.searchPlaceholder')} placeholderTextColor={colors.inkFaint}
            accessibilityLabel={t('pantry.searchPlaceholder')} autoCorrect={false} autoCapitalize="none"
            returnKeyType="search" maxLength={120} />
          {!!query && <Pressable onPress={() => setQuery('')} style={styles.iconButton}
            accessibilityRole="button" accessibilityLabel={t('common.clear')}>
            <Ionicons name="close-circle" size={20} color={colors.inkSoft} />
          </Pressable>}
        </View>
        <Text style={styles.hint}>{t('pantry.onlyIllustrated')}</Text>
        {loading ? <View style={styles.state}><ActivityIndicator color={colors.accent} /><Text style={styles.subtitle}>{t('common.loading')}</Text></View>
          : <FlatList data={products} keyExtractor={(product) => product.id} keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag" contentContainerStyle={styles.list} testID="pantry-search-results"
            renderItem={({ item }) => <Pressable onPress={() => onSelect(item)} testID={`pantry-result-${item.id}`}
              accessibilityRole="button" accessibilityLabel={t('pantry.addNamedProduct', { name: item.name })}
              style={({ pressed }) => [styles.product, pressed && styles.pressed]}>
              <View style={styles.preview}><Image source={item.illustrationUrl} style={StyleSheet.absoluteFill}
                contentFit="contain" cachePolicy="memory-disk" draggable={false} accessible={false} /></View>
              <Text style={styles.productName}>{item.name}</Text>
              <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
            </Pressable>}
            ListEmptyComponent={!error ? <Text style={styles.stateText}>{t(query ? 'pantry.noResults' : 'pantry.noIllustrations')}</Text> : null}
            ListFooterComponent={<>
              {error && <View style={styles.state}><Text style={styles.stateText}>{t('pantry.searchError')}</Text>
                <Pressable onPress={retry} accessibilityRole="button" style={styles.action}><Text style={styles.actionText}>{t('common.retry')}</Text></Pressable></View>}
              {!error && hasMore && <Pressable onPress={() => void loadMore()} disabled={loadingMore}
                accessibilityRole="button" style={styles.action}>
                {loadingMore ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.actionText}>{t('pantry.moreProducts')}</Text>}
              </Pressable>}
            </>} />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

const themedStyles = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1, width: '100%', maxWidth: 650, alignSelf: 'center', padding: 20, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heading: { flex: 1, gap: 3 },
  title: { color: colors.ink, fontFamily: fonts.bold, fontSize: 24 },
  subtitle: { color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 14 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, minHeight: 50,
    borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.white },
  input: { flex: 1, minHeight: 48, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingRight: 12 },
  hint: { fontSize: 13, lineHeight: 18, color: colors.inkSoft, fontFamily: fonts.regular },
  list: { paddingBottom: 20, gap: 10 },
  product: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 20, backgroundColor: colors.white },
  preview: { width: 76, height: 76, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  productName: { flex: 1, fontFamily: fonts.semibold, color: colors.ink, fontSize: 15, lineHeight: 21 },
  pressed: { opacity: 0.6 },
  state: { padding: 24, gap: 12, alignItems: 'center' },
  stateText: { textAlign: 'center', color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 15, paddingVertical: 16 },
  action: { minHeight: 44, paddingHorizontal: 18, alignSelf: 'center', justifyContent: 'center' },
  actionText: { fontFamily: fonts.semibold, color: colors.accent, fontSize: 15 },
});
