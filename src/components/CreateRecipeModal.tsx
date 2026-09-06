import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
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
import { STORE_META } from '../constants/stores';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useTranslation } from '../context/LanguageContext';
import RecipeIngredientPickerModal from './RecipeIngredientPickerModal';
import type { UIProduct } from '../lib/productAdapters';
import { cleanRecipeSteps, recipeProductKey } from '../lib/recipeSteps';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: (recipe: CommunityRecipe) => void;
}

interface SelectedIngredient {
  product: UIProduct;
  quantity: string;
}

interface RecipeStepDraft {
  id: number;
  text: string;
  ingredientKeys: string[];
}

const emptyStep = (id: number): RecipeStepDraft => ({ id, text: '', ingredientKeys: [] });

export default function CreateRecipeModal({ visible, onClose, onCreated }: Props) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useToast();
  const { session } = useAuth();
  const { profile } = useProfile();
  const [title, setTitle] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ingredients, setIngredients] = useState<SelectedIngredient[]>([]);
  const [draftQuantity, setDraftQuantity] = useState('');
  const [steps, setSteps] = useState<RecipeStepDraft[]>([emptyStep(0)]);
  const nextStepId = useRef(1);
  const scrollRef = useRef<ScrollView>(null);
  const scrollToNewStep = useRef(false);
  const [focusedStep, setFocusedStep] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedIngredientKeys = useMemo(
    () => new Set(ingredients.map(({ product }) => recipeProductKey(product))),
    [ingredients],
  );

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setImageUri(null);
    setPickerOpen(false);
    setIngredients([]);
    setDraftQuantity('');
    setSteps([emptyStep(0)]);
    nextStepId.current = 1;
    scrollToNewStep.current = false;
    setFocusedStep(null);
    setSaving(false);
  }, [visible]);

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
    if (ingredients.some((item) => recipeProductKey(item.product) === recipeProductKey(product))) {
      toast.show(t('queCocino.creator.ingredientAlreadyAdded'), 'info');
      return;
    }
    setIngredients((current) => [...current, { product, quantity: draftQuantity }]);
    setDraftQuantity('');
    setPickerOpen(false);
    Haptics.selectionAsync();
  };

  const removeIngredient = (product: UIProduct) => {
    const key = recipeProductKey(product);
    setIngredients((current) => current.filter(
      (item) => recipeProductKey(item.product) !== key,
    ));
    setSteps((current) => current.map((step) => ({
      ...step,
      ingredientKeys: step.ingredientKeys.filter((ingredientKey) => ingredientKey !== key),
    })));
  };

  const updateIngredientQuantity = (product: UIProduct, quantity: string) => {
    setIngredients((current) => current.map((item) => (
      recipeProductKey(item.product) === recipeProductKey(product) ? { ...item, quantity } : item
    )));
  };

  const updateStep = (id: number, text: string) => {
    setSteps((current) => current.map((step) => step.id === id ? { ...step, text } : step));
  };

  const toggleStepIngredient = (stepId: number, ingredientKey: string) => {
    setSteps((current) => current.map((step) => {
      if (step.id !== stepId) return step;
      const selected = step.ingredientKeys.includes(ingredientKey);
      return {
        ...step,
        ingredientKeys: selected
          ? step.ingredientKeys.filter((key) => key !== ingredientKey)
          : [...step.ingredientKeys, ingredientKey],
      };
    }));
    Haptics.selectionAsync();
  };

  const save = async () => {
    const userId = session?.user.id;
    const cleanSteps = cleanRecipeSteps(steps);
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
    && steps.some((step) => step.text.trim()) && !saving;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View
        style={styles.root}
        accessibilityElementsHidden={pickerOpen}
        importantForAccessibility={pickerOpen ? 'no-hide-descendants' : 'auto'}
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
            accessibilityState={{ disabled: !canSave, busy: saving }}
          >
            {saving ? <ActivityIndicator size="small" color="#ffffff" /> : (
              <Text style={styles.saveButtonText}>{t('queCocino.creator.save')}</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          automaticallyAdjustKeyboardInsets
          onContentSizeChange={() => {
            if (!scrollToNewStep.current) return;
            scrollToNewStep.current = false;
            scrollRef.current?.scrollToEnd({ animated: true });
          }}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 32 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.fieldLabel}>{t('queCocino.creator.name')}</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t('queCocino.creator.namePlaceholder')}
            placeholderTextColor={colors.inkFaint}
            maxLength={120}
            style={[styles.textInput, styles.nameInput]}
            accessibilityLabel={t('queCocino.creator.name')}
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

          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <Ionicons name="basket-outline" size={21} color={colors.accent} />
            </View>
            <View style={styles.sectionCopy}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle} accessibilityRole="header">{t('queCocino.creator.ingredients')}</Text>
                <Text style={styles.countBadge}>{ingredients.length}</Text>
              </View>
              <Text style={styles.sectionHint}>{t('queCocino.creator.ingredientsHint')}</Text>
            </View>
          </View>

          <View style={styles.ingredientsList}>
            {ingredients.map(({ product, quantity }, index) => (
              <View key={recipeProductKey(product)} style={styles.numberedRow}>
                <View style={styles.itemNumber}>
                  <Text style={styles.itemNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.ingredientCard}>
                  <View style={styles.ingredientCardHeader}>
                    <Text style={styles.cardLabel}>{t('queCocino.creator.ingredientColumn')}</Text>
                    <Pressable
                      onPress={() => removeIngredient(product)}
                      style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={t('queCocino.creator.removeIngredient', { name: product.name })}
                    >
                      <Ionicons name="close" size={18} color={colors.inkSoft} />
                    </Pressable>
                  </View>
                  <View style={styles.ingredientProduct}>
                    <ProductImage product={product} style={styles.selectedProductImage} />
                    <View style={styles.productCopy}>
                      <Text style={styles.selectedProductName} numberOfLines={3}>{product.name}</Text>
                      <Text style={styles.productMeta} numberOfLines={1}>{STORE_META[product.store].name}</Text>
                    </View>
                  </View>
                  <QuantityField
                    value={quantity}
                    onChangeText={(value) => updateIngredientQuantity(product, value)}
                    accessibilityLabel={t('queCocino.creator.quantityFor', { name: product.name })}
                  />
                </View>
              </View>
            ))}

            <View style={styles.numberedRow}>
              <View style={[styles.itemNumber, styles.draftNumber]}>
                <Text style={styles.itemNumberText}>{ingredients.length + 1}</Text>
              </View>
              <View style={[styles.ingredientCard, styles.draftCard]}>
                <View style={styles.draftCardHeader}>
                  <Text style={styles.cardLabel}>{t('queCocino.creator.ingredientColumn')}</Text>
                  <Text style={styles.draftTag}>{t('queCocino.creator.nextIngredient')}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setPickerOpen(true);
                  }}
                  style={({ pressed }) => [styles.searchBox, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={t('queCocino.creator.searchProducts')}
                  accessibilityHint={t('queCocino.creator.openIngredientCatalog')}
                >
                  <Ionicons name="search" size={19} color={colors.inkSoft} />
                  <Text style={styles.searchPlaceholder}>{t('queCocino.creator.searchProducts')}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
                </Pressable>
                <QuantityField
                  value={draftQuantity}
                  onChangeText={setDraftQuantity}
                  accessibilityLabel={t('queCocino.creator.draftQuantity')}
                />
              </View>
            </View>
          </View>

          <View style={[styles.sectionHeader, styles.stepsHeader]}>
            <View style={styles.sectionIcon}>
              <Ionicons name="list-outline" size={21} color={colors.accent} />
            </View>
            <View style={styles.sectionCopy}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle} accessibilityRole="header">{t('queCocino.creator.steps')}</Text>
                <Text style={styles.countBadge}>{steps.length}</Text>
              </View>
              <Text style={styles.sectionHint}>{t('queCocino.creator.stepsHint')}</Text>
            </View>
          </View>

          <View>
            {steps.map((step, index) => (
              <View key={step.id} style={styles.stepRow}>
                <View style={styles.stepRail}>
                  <View style={[styles.itemNumber, focusedStep === step.id && styles.activeNumber]}>
                    <Text style={[styles.itemNumberText, focusedStep === step.id && styles.activeNumberText]}>{index + 1}</Text>
                  </View>
                  {index < steps.length - 1 ? <View style={styles.stepConnector} /> : null}
                </View>
                <View style={[styles.stepCard, focusedStep === step.id && styles.fieldFocused]}>
                  <View style={styles.stepCardHeader}>
                    <Text style={styles.stepTitle}>{t('queCocino.creator.stepTitle', { n: index + 1 })}</Text>
                    {steps.length > 1 ? (
                      <Pressable
                        onPress={() => setSteps((current) => current.filter((item) => item.id !== step.id))}
                        style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel={t('queCocino.creator.removeStep', { n: index + 1 })}
                      >
                        <Ionicons name="trash-outline" size={17} color={colors.inkSoft} />
                      </Pressable>
                    ) : null}
                  </View>
                  <TextInput
                    value={step.text}
                    onChangeText={(value) => updateStep(step.id, value)}
                    onFocus={() => setFocusedStep(step.id)}
                    onBlur={() => setFocusedStep(null)}
                    placeholder={t(index === 0 ? 'queCocino.creator.firstStepPlaceholder' : 'queCocino.creator.stepPlaceholder', { n: index + 1 })}
                    placeholderTextColor={colors.inkFaint}
                    accessibilityLabel={t('queCocino.creator.stepTitle', { n: index + 1 })}
                    multiline
                    autoFocus={step.id > 0}
                    textAlignVertical="top"
                    maxLength={600}
                    style={styles.stepInput}
                  />
                  <View style={styles.stepIngredientsSection}>
                    <Text style={styles.stepIngredientsLabel}>
                      {t('queCocino.creator.stepIngredientsLabel')}
                    </Text>
                    {ingredients.length > 0 ? (
                      <>
                        <Text style={styles.stepIngredientsHint}>
                          {t('queCocino.creator.stepIngredientsHint')}
                        </Text>
                        <View style={styles.stepIngredientChips}>
                          {ingredients.map(({ product }) => {
                            const key = recipeProductKey(product);
                            const selected = step.ingredientKeys.includes(key);
                            return (
                              <Pressable
                                key={key}
                                testID={`recipe-step-${step.id}-ingredient-${key}`}
                                onPress={() => toggleStepIngredient(step.id, key)}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: selected }}
                                accessibilityLabel={t(
                                  selected
                                    ? 'queCocino.creator.unlinkStepIngredient'
                                    : 'queCocino.creator.linkStepIngredient',
                                  { name: product.name, n: index + 1 },
                                )}
                                style={({ pressed }) => [
                                  styles.stepIngredientChip,
                                  selected && styles.stepIngredientChipSelected,
                                  pressed && styles.pressed,
                                ]}
                              >
                                <ProductImage product={product} style={styles.stepIngredientImage} />
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.stepIngredientName,
                                    selected && styles.stepIngredientNameSelected,
                                  ]}
                                >
                                  {product.name}
                                </Text>
                                <Ionicons
                                  name={selected ? 'checkmark-circle' : 'add-circle-outline'}
                                  size={17}
                                  color={selected ? colors.accent : colors.inkSoft}
                                />
                              </Pressable>
                            );
                          })}
                        </View>
                      </>
                    ) : (
                      <Text style={styles.stepIngredientsEmpty}>
                        {t('queCocino.creator.stepIngredientsEmpty')}
                      </Text>
                    )}
                  </View>
                  {focusedStep === step.id || step.text.length > 500 ? (
                    <Text style={styles.characterCount}>{step.text.length}/600</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          {steps.length < 30 ? (
            <Pressable
              onPress={() => {
                const id = nextStepId.current++;
                scrollToNewStep.current = true;
                setSteps((current) => [...current, emptyStep(id)]);
                Haptics.selectionAsync();
              }}
              style={({ pressed }) => [styles.addStepButton, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <View style={styles.addStepIcon}>
                <Ionicons name="add" size={20} color={colors.accent} />
              </View>
              <Text style={styles.addStepText}>{t('queCocino.creator.addStep')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
      {pickerOpen && (
        <RecipeIngredientPickerModal
          selectedKeys={selectedIngredientKeys}
          onSelect={addIngredient}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </Modal>
  );
}

function QuantityField({ value, onChangeText, accessibilityLabel }: {
  value: string;
  onChangeText: (value: string) => void;
  accessibilityLabel: string;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.quantityRow}>
      <Text style={styles.quantityLabel}>{t('queCocino.creator.quantityColumn')}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={t('queCocino.creator.quantityPlaceholder')}
        placeholderTextColor={colors.inkFaint}
        maxLength={40}
        style={[styles.quantityInput, focused && styles.fieldFocused]}
        returnKeyType="done"
        selectTextOnFocus
        accessibilityLabel={accessibilityLabel}
      />
    </View>
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
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24 },
  nameInput: { marginBottom: 22 },
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
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  sectionIcon: {
    width: 40, height: 40, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight,
  },
  sectionCopy: { flex: 1, minWidth: 0 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.4 },
  countBadge: {
    minWidth: 24, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 9,
    overflow: 'hidden', textAlign: 'center', color: colors.inkSoft,
    backgroundColor: colors.surfaceAlt, fontSize: 11, fontFamily: fonts.bold,
  },
  sectionHint: { fontSize: 12, lineHeight: 18, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 4 },
  ingredientsList: { gap: 12 },
  numberedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemNumber: {
    width: 32, minHeight: 32, borderRadius: 16, marginTop: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight,
  },
  itemNumberText: { fontSize: 13, fontFamily: fonts.bold, color: colors.accent, paddingVertical: 5 },
  draftNumber: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.accentMid },
  ingredientCard: {
    flex: 1, minWidth: 0, padding: 14, borderRadius: 20,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  draftCard: { borderColor: colors.accentMid },
  ingredientCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -10, marginRight: -10 },
  draftCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  cardLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: fonts.bold, color: colors.inkSoft },
  draftTag: { fontSize: 10, fontFamily: fonts.semibold, color: colors.accent, backgroundColor: colors.accentLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, overflow: 'hidden' },
  ingredientProduct: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12 },
  selectedProductImage: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.photoPlaceholder },
  selectedProductName: { fontSize: 14, lineHeight: 20, fontFamily: fonts.semibold, color: colors.ink },
  productImageFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.photoPlaceholder },
  productCopy: { flex: 1, minWidth: 0 },
  productMeta: { fontSize: 11, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 4 },
  quantityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  quantityLabel: { flexShrink: 1, fontSize: 12, fontFamily: fonts.semibold, color: colors.inkSoft },
  quantityInput: {
    flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 100, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    fontSize: 14, fontFamily: fonts.medium, color: colors.ink,
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border,
  },
  fieldFocused: { borderColor: colors.accent },
  removeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  searchBox: {
    minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 11, marginBottom: 12, borderRadius: 13, backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.border,
  },
  searchPlaceholder: { flex: 1, minWidth: 0, paddingVertical: 12, fontSize: 14, fontFamily: fonts.medium, color: colors.inkFaint },
  stepsHeader: { marginTop: 32 },
  stepRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  stepRail: { width: 32, alignItems: 'center' },
  stepConnector: { flex: 1, width: 1, marginTop: 6, marginBottom: -8, backgroundColor: colors.accentMid },
  activeNumber: { backgroundColor: colors.accent },
  activeNumberText: { color: '#ffffff' },
  stepCard: {
    flex: 1, minWidth: 0, padding: 14, marginBottom: 14, borderRadius: 20,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  stepCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 34, marginTop: -5, marginRight: -9 },
  stepTitle: { flex: 1, fontSize: 13, fontFamily: fonts.bold, color: colors.ink },
  stepInput: {
    minHeight: 90, paddingTop: 8, paddingBottom: 8, paddingHorizontal: 0,
    fontSize: 14, lineHeight: 22, fontFamily: fonts.medium, color: colors.ink,
  },
  stepIngredientsSection: {
    paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  stepIngredientsLabel: { fontSize: 11.5, fontFamily: fonts.bold, color: colors.ink },
  stepIngredientsHint: {
    marginTop: 2, marginBottom: 9, fontSize: 10.5, lineHeight: 15,
    fontFamily: fonts.medium, color: colors.inkSoft,
  },
  stepIngredientsEmpty: {
    marginTop: 5, fontSize: 10.5, lineHeight: 15,
    fontFamily: fonts.medium, color: colors.inkSoft,
  },
  stepIngredientChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  stepIngredientChip: {
    maxWidth: '100%', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 5, paddingLeft: 5, paddingRight: 9, borderRadius: 13,
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border,
  },
  stepIngredientChipSelected: { backgroundColor: colors.accentLight, borderColor: colors.accentMid },
  stepIngredientImage: {
    width: 27, height: 27, borderRadius: 8, backgroundColor: colors.photoPlaceholder,
  },
  stepIngredientName: {
    maxWidth: 170, fontSize: 11, fontFamily: fonts.semibold, color: colors.inkSoft,
  },
  stepIngredientNameSelected: { color: colors.accent },
  characterCount: { textAlign: 'right', fontSize: 10, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 4 },
  addStepButton: {
    minHeight: 54, marginLeft: 42, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: colors.accentLight,
  },
  addStepIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  addStepText: { flexShrink: 1, color: colors.accent, fontSize: 13, fontFamily: fonts.bold },
});
