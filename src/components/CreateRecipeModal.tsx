import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createCommunityRecipe, type CommunityRecipe } from '../api/recipes';
import { CATALOG_STORE_KEYS, STORE_META, type CatalogStore } from '../constants/stores';
import { storeInRegion, storesForRegion } from '../constants/regions';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useTranslation } from '../context/LanguageContext';
import { searchCatalogStores } from '../lib/catalogSearch';
import type { UIProduct } from '../lib/productAdapters';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: (recipe: CommunityRecipe) => void;
}

interface SelectedIngredient {
  product: UIProduct;
  quantity: string;
}

const productKey = (product: Pick<UIProduct, 'store' | 'id'>) => `${product.store}:${product.id}`;

export default function CreateRecipeModal({ visible, onClose, onCreated }: Props) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useToast();
  const { session } = useAuth();
  const { profile } = useProfile();
  const [title, setTitle] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UIProduct[]>([]);
  const [ingredients, setIngredients] = useState<SelectedIngredient[]>([]);
  const [steps, setSteps] = useState(['']);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [saving, setSaving] = useState(false);

  const stores = useMemo<CatalogStore[]>(() => {
    const regional = storesForRegion(profile?.region ?? null);
    const preferred = profile?.catalogStores?.length
      ? CATALOG_STORE_KEYS.filter((store) => profile.catalogStores.includes(store))
      : CATALOG_STORE_KEYS;
    const available = preferred.filter((store) => storeInRegion(store, profile?.region ?? null));
    return available.length ? available : regional;
  }, [profile?.catalogStores, profile?.region]);

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setImageUri(null);
    setQuery('');
    setResults([]);
    setIngredients([]);
    setSteps(['']);
    setSearchError(false);
    setSaving(false);
  }, [visible]);

  useEffect(() => {
    if (!visible || query.trim().length < 2 || stores.length === 0) {
      setResults([]);
      setSearching(false);
      setSearchError(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchError(false);
      searchCatalogStores(
        stores,
        query.trim(),
        profile?.region ?? null,
        profile?.postalCode ?? null,
        controller.signal,
        16,
        true,
        profile?.lidlStoreId ?? null,
      )
        .then((products) => setResults(products))
        .catch(() => {
          if (!controller.signal.aborted) setSearchError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [visible, query, stores, profile?.region, profile?.postalCode, profile?.lidlStoreId]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]?.uri) setImageUri(result.assets[0].uri);
    } catch {
      toast.show(t('queCocino.creator.imageError'), 'error');
    }
  };

  const addIngredient = (product: UIProduct) => {
    if (ingredients.some((item) => productKey(item.product) === productKey(product))) {
      toast.show(t('queCocino.creator.ingredientAlreadyAdded'), 'info');
      return;
    }
    setIngredients((current) => [...current, { product, quantity: '' }]);
    setQuery('');
    setResults([]);
    Haptics.selectionAsync();
  };

  const removeIngredient = (product: UIProduct) => {
    setIngredients((current) => current.filter(
      (item) => productKey(item.product) !== productKey(product),
    ));
  };

  const updateIngredientQuantity = (product: UIProduct, quantity: string) => {
    setIngredients((current) => current.map((item) => (
      productKey(item.product) === productKey(product) ? { ...item, quantity } : item
    )));
  };

  const updateStep = (index: number, value: string) => {
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? value : step));
  };

  const save = async () => {
    const userId = session?.user.id;
    const cleanSteps = steps.map((step) => step.trim()).filter(Boolean);
    const quantitiesComplete = ingredients.every((ingredient) => ingredient.quantity.trim());
    if (
      !userId || !title.trim() || !imageUri || ingredients.length === 0
      || !quantitiesComplete || cleanSteps.length === 0
    ) {
      toast.show(t('queCocino.creator.validation'), 'error');
      return;
    }

    setSaving(true);
    try {
      const recipe = await createCommunityRecipe({
        userId,
        title,
        imageUri,
        ingredients,
        steps: cleanSteps,
        profile,
      });
      onCreated(recipe);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('queCocino.creator.created'));
      onClose();
    } catch {
      toast.show(t('queCocino.creator.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const canSave = !!title.trim() && !!imageUri && ingredients.length > 0
    && ingredients.every((ingredient) => ingredient.quantity.trim())
    && steps.some((step) => step.trim()) && !saving;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={onClose}
            disabled={saving}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('queCocino.creator.title')}</Text>
          <Pressable
            onPress={save}
            disabled={!canSave}
            style={({ pressed }) => [styles.saveButton, !canSave && styles.saveButtonDisabled, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            {saving ? <ActivityIndicator size="small" color="#ffffff" /> : (
              <Text style={styles.saveButtonText}>{t('queCocino.creator.save')}</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.fieldLabel}>{t('queCocino.creator.name')}</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t('queCocino.creator.namePlaceholder')}
            placeholderTextColor={colors.inkFaint}
            maxLength={120}
            style={styles.textInput}
            returnKeyType="done"
          />

          <Text style={styles.fieldLabel}>{t('queCocino.creator.resultImage')}</Text>
          <Pressable
            onPress={pickImage}
            style={({ pressed }) => [styles.imagePicker, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            {imageUri ? (
              <>
                <Image source={{ uri: imageUri }} style={styles.recipeImage} />
                <View style={styles.changeImageBadge}>
                  <Ionicons name="camera" size={15} color="#ffffff" />
                  <Text style={styles.changeImageText}>{t('queCocino.creator.changeImage')}</Text>
                </View>
              </>
            ) : (
              <View style={styles.imagePlaceholder}>
                <View style={styles.imageIcon}>
                  <Ionicons name="image-outline" size={28} color={colors.accent} />
                </View>
                <Text style={styles.imagePlaceholderTitle}>{t('queCocino.creator.addImage')}</Text>
                <Text style={styles.imagePlaceholderHint}>{t('queCocino.creator.imageHint')}</Text>
              </View>
            )}
          </Pressable>

          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>{t('queCocino.creator.ingredients')}</Text>
            <Text style={styles.countBadge}>{ingredients.length}</Text>
          </View>
          <Text style={styles.sectionHint}>{t('queCocino.creator.ingredientsHint')}</Text>

          {ingredients.length > 0 ? (
            <View style={styles.ingredientColumns} accessibilityElementsHidden>
              <Text style={styles.ingredientNumberHeader}>#</Text>
              <Text style={styles.ingredientNameHeader}>{t('queCocino.creator.ingredientColumn')}</Text>
              <Text style={styles.ingredientQuantityHeader}>{t('queCocino.creator.quantityColumn')}</Text>
              <View style={styles.ingredientRemoveSpacer} />
            </View>
          ) : null}

          {ingredients.map(({ product, quantity }, index) => (
            <View key={productKey(product)} style={styles.selectedProduct}>
              <View style={styles.ingredientNumber}>
                <Text style={styles.ingredientNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.ingredientProduct}>
                <ProductImage product={product} style={styles.selectedProductImage} />
                <View style={styles.productCopy}>
                  <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                  <Text style={styles.productMeta} numberOfLines={1}>{STORE_META[product.store].name}</Text>
                </View>
              </View>
              <TextInput
                value={quantity}
                onChangeText={(value) => updateIngredientQuantity(product, value)}
                placeholder={t('queCocino.creator.quantityPlaceholder')}
                placeholderTextColor={colors.inkFaint}
                maxLength={40}
                style={styles.quantityInput}
                returnKeyType="done"
                selectTextOnFocus
                accessibilityLabel={t('queCocino.creator.quantityFor', { name: product.name })}
              />
              <Pressable
                onPress={() => removeIngredient(product)}
                style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t('queCocino.creator.removeIngredient', { name: product.name })}
              >
                <Ionicons name="close" size={16} color={colors.inkSoft} />
              </Pressable>
            </View>
          ))}

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.inkSoft} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('queCocino.creator.searchProducts')}
              placeholderTextColor={colors.inkFaint}
              style={styles.searchInput}
              autoCorrect={false}
              returnKeyType="search"
            />
            {searching ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          </View>

          {query.trim().length === 1 ? (
            <Text style={styles.searchMessage}>{t('queCocino.creator.minLetters')}</Text>
          ) : null}
          {searchError ? <Text style={styles.searchError}>{t('queCocino.creator.searchError')}</Text> : null}
          {!searching && !searchError && query.trim().length >= 2 && results.length === 0 ? (
            <Text style={styles.searchMessage}>{t('queCocino.creator.noProducts')}</Text>
          ) : null}

          {results.length > 0 ? (
            <View style={styles.resultsCard}>
              {results.map((product) => (
                <Pressable
                  key={productKey(product)}
                  onPress={() => addIngredient(product)}
                  style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
                  accessibilityRole="button"
                >
                  <ProductImage product={product} style={styles.resultImage} />
                  <View style={styles.productCopy}>
                    <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                    <Text style={styles.productMeta} numberOfLines={1}>
                      {STORE_META[product.store].name}{product.priceLabel ? ` · ${product.priceLabel}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="add-circle" size={24} color={colors.accent} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>{t('queCocino.creator.steps')}</Text>
            <Text style={styles.countBadge}>{steps.length}</Text>
          </View>
          <Text style={styles.sectionHint}>{t('queCocino.creator.stepsHint')}</Text>

          <View style={styles.stepsList}>
            {steps.map((step, index) => (
              <View key={`step-${index}`} style={styles.stepRow}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View>
                <TextInput
                  value={step}
                  onChangeText={(value) => updateStep(index, value)}
                  placeholder={t('queCocino.creator.stepPlaceholder', { n: index + 1 })}
                  placeholderTextColor={colors.inkFaint}
                  multiline
                  maxLength={600}
                  style={styles.stepInput}
                />
                {steps.length > 1 ? (
                  <Pressable
                    onPress={() => setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index))}
                    style={({ pressed }) => [styles.stepRemove, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={t('queCocino.creator.removeStep', { n: index + 1 })}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.inkSoft} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>

          {steps.length < 30 ? (
            <Pressable
              onPress={() => setSteps((current) => [...current, ''])}
              style={({ pressed }) => [styles.addStepButton, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={19} color={colors.accent} />
              <Text style={styles.addStepText}>{t('queCocino.creator.addStep')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ProductImage({ product, style }: { product: UIProduct; style: object }) {
  if (product.imageUrl) return <Image source={{ uri: product.imageUrl }} style={style} resizeMode="contain" />;
  return (
    <View style={[style, themedStyles().productImageFallback]}>
      <Ionicons name="basket-outline" size={19} color={colors.inkSoft} />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  headerButton: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt,
  },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  saveButton: {
    minWidth: 74, minHeight: 38, borderRadius: 19, paddingHorizontal: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent,
  },
  saveButtonDisabled: { opacity: 0.42 },
  saveButtonText: { color: '#ffffff', fontSize: 13, fontFamily: fonts.bold },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  content: { paddingHorizontal: 16, paddingTop: 20 },
  fieldLabel: { fontSize: 13, fontFamily: fonts.bold, color: colors.ink, marginBottom: 8 },
  textInput: {
    minHeight: 50, borderRadius: 15, paddingHorizontal: 14,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    fontSize: 16, fontFamily: fonts.medium, color: colors.ink,
  },
  imagePicker: {
    height: 210, borderRadius: 20, overflow: 'hidden', marginBottom: 26,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  recipeImage: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  imageIcon: {
    width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight, marginBottom: 10,
  },
  imagePlaceholderTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink },
  imagePlaceholderHint: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 4 },
  changeImageBadge: {
    position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(43,37,33,0.82)',
  },
  changeImageText: { fontSize: 11, fontFamily: fonts.bold, color: '#ffffff' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  sectionTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.ink },
  countBadge: {
    minWidth: 24, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10,
    overflow: 'hidden', textAlign: 'center', color: colors.accent,
    backgroundColor: colors.accentLight, fontSize: 11, fontFamily: fonts.bold,
  },
  sectionHint: { fontSize: 12, lineHeight: 17, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 3, marginBottom: 11 },
  ingredientColumns: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 9, marginBottom: 6,
  },
  ingredientNumberHeader: {
    width: 28, textAlign: 'center', fontSize: 9, fontFamily: fonts.bold,
    color: colors.inkSoft, textTransform: 'uppercase',
  },
  ingredientNameHeader: {
    flex: 1, fontSize: 9, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 0.35,
  },
  ingredientQuantityHeader: {
    width: 76, textAlign: 'center', fontSize: 9, fontFamily: fonts.bold,
    color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.35,
  },
  ingredientRemoveSpacer: { width: 28 },
  selectedProduct: {
    flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 66,
    padding: 8, marginBottom: 8, borderRadius: 15,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  ingredientNumber: {
    width: 28, height: 28, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight,
  },
  ingredientNumberText: { fontSize: 11, fontFamily: fonts.bold, color: colors.accent },
  ingredientProduct: {
    flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7,
  },
  selectedProductImage: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.photoPlaceholder },
  productImageFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.photoPlaceholder },
  productCopy: { flex: 1, minWidth: 0 },
  productName: { fontSize: 13, lineHeight: 17, fontFamily: fonts.semibold, color: colors.ink },
  productMeta: { fontSize: 10.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 3 },
  quantityInput: {
    width: 76, minHeight: 40, paddingHorizontal: 7, borderRadius: 11,
    textAlign: 'center', fontSize: 12, fontFamily: fonts.semibold, color: colors.ink,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  removeButton: {
    width: 28, height: 32, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt,
  },
  searchBox: {
    minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 13, borderRadius: 15, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: fonts.medium, color: colors.ink },
  searchMessage: { paddingVertical: 10, textAlign: 'center', fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft },
  searchError: { paddingVertical: 10, textAlign: 'center', fontSize: 12, fontFamily: fonts.semibold, color: colors.red },
  resultsCard: {
    marginTop: 8, marginBottom: 10, borderRadius: 16, overflow: 'hidden',
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  resultRow: {
    minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  resultRowPressed: { backgroundColor: colors.accentLight },
  resultImage: { width: 50, height: 50, borderRadius: 10, backgroundColor: colors.photoPlaceholder },
  stepsList: { gap: 9 },
  stepRow: {
    minHeight: 76, flexDirection: 'row', alignItems: 'flex-start', gap: 9,
    padding: 10, borderRadius: 15, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
  },
  stepNumber: {
    width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight,
  },
  stepNumberText: { color: colors.accent, fontSize: 12, fontFamily: fonts.bold },
  stepInput: {
    flex: 1, minHeight: 52, paddingTop: 4, paddingBottom: 4,
    fontSize: 13.5, lineHeight: 19, fontFamily: fonts.medium, color: colors.ink,
  },
  stepRemove: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  addStepButton: {
    minHeight: 46, marginTop: 10, marginBottom: 8, borderRadius: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.accentLight,
  },
  addStepText: { color: colors.accent, fontSize: 13, fontFamily: fonts.bold },
});
