import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, ReduceMotion, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { StackActions, usePreventRemove, type NavigationAction } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/recipeCreator';
import { recipeFeed } from '../lib/recipeFeed';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createCommunityRecipe } from '../api/recipes';
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
import { useRecipeCreatorTransition } from '../hooks/useRecipeCreatorTransition';

interface SelectedIngredient {
  product: UIProduct;
  quantity: string;
}

interface RecipeStepDraft {
  id: number;
  text: string;
  ingredientKeys: string[];
  imageUri?: string | null;
}

const emptyStep = (id: number): RecipeStepDraft => ({ id, text: '', ingredientKeys: [] });
const MIN_RECIPE_SERVINGS = 1;
const MAX_RECIPE_SERVINGS = 99;
const RECIPE_FORM_SECTION_COUNT = 5;

export default function CreateRecipeModal({ navigation, route }: NativeStackScreenProps<AppStackParamList, 'NewRecipe'>) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useToast();
  const { session } = useAuth();
  const { profile } = useProfile();
  const [title, setTitle] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [servings, setServings] = useState(2);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ingredients, setIngredients] = useState<SelectedIngredient[]>([]);
  const [draftQuantity, setDraftQuantity] = useState('');
  const [steps, setSteps] = useState<RecipeStepDraft[]>([emptyStep(0)]);
  const nextStepId = useRef(1);
  const scrollRef = useRef<ScrollView>(null);
  const scrollToNewStep = useRef(false);
  const [focusedStep, setFocusedStep] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const pendingRemoval = useRef<NavigationAction | null>(null);
  const [allowRemoval, setAllowRemoval] = useState(false);
  const completeClose = useCallback(() => setAllowRemoval(true), []);
  const transition = useRecipeCreatorTransition(route.params.origin, completeClose, saving || pickerOpen);
  const onPresented = transition.onPresented;
  useLayoutEffect(() => navigation.addListener('transitionEnd', ({ data }) => {
    if (!data.closing) onPresented();
  }), [navigation, onPresented]);
  usePreventRemove(!allowRemoval, ({ data }) => {
    if (saving) return;
    pendingRemoval.current = data.action;
    void transition.close();
  });
  useEffect(() => {
    if (allowRemoval) navigation.dispatch(pendingRemoval.current ?? StackActions.pop());
  }, [allowRemoval, navigation]);
  const requestClose = () => {
    if (!saving) transition.close();
  };

  const selectedIngredientKeys = useMemo(
    () => new Set(ingredients.map(({ product }) => recipeProductKey(product))),
    [ingredients],
  );

  const pickImage = async (stepId?: number) => {
    if (saving) return;
    Keyboard.dismiss();
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        const uri = result.assets[0].uri;
        if (stepId === undefined) setImageUri(uri);
        else setSteps((current) => current.map((step) => (
          step.id === stepId ? { ...step, imageUri: uri } : step
        )));
      }
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

  const adjustServings = (delta: number) => {
    setServings((current) => Math.min(
      MAX_RECIPE_SERVINGS,
      Math.max(MIN_RECIPE_SERVINGS, current + delta),
    ));
    void Haptics.selectionAsync();
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
    if (saving) return;
    if (steps.some((step) => step.imageUri && !step.text.trim())) {
      toast.show(t('queCocino.creator.stepImageNeedsText'), 'error');
      return;
    }
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
        servings,
        ingredients,
        steps: cleanSteps,
        profile,
      });
      recipeFeed.update(userId, (current) => [recipe, ...current.filter((item) => item.id !== recipe.id)]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('queCocino.creator.created'));
      transition.close();
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
    <View
      ref={transition.rootRef} collapsable={false} style={styles.screen}
      onLayout={transition.onLayout} accessibilityViewIsModal
      onAccessibilityEscape={requestClose}
      onStartShouldSetResponder={() => transition.closing}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, transition.backdropStyle]} />
      <Animated.View style={[StyleSheet.absoluteFill, styles.transitionSurface, transition.surfaceStyle]}>
      {transition.started && <>
      <View
        style={styles.root}
        pointerEvents={transition.closing ? 'none' : 'auto'}
        accessibilityElementsHidden={pickerOpen}
        importantForAccessibility={pickerOpen ? 'no-hide-descendants' : 'auto'}
      >
        <GestureDetector gesture={transition.dismissGesture}>
        <Animated.View entering={sectionEntering(0, transition.reducedMotion)}
          style={[styles.header, { paddingTop: insets.top + 8 }]}>

          <Pressable
            onPress={requestClose} hitSlop={5}
            disabled={saving}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('queCocino.creator.title')}</Text>
          <Animated.View collapsable={false} onLayout={transition.onPublishLayout} style={transition.publishStyle}>
          <Pressable
            onPress={save} hitSlop={4}
            disabled={!canSave}
            style={({ pressed }) => [styles.saveButton, !canSave && styles.saveButtonDisabled, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave, busy: saving }}
          >
            {saving ? <ActivityIndicator size="small" color="#ffffff" /> : (
              <Text style={styles.saveButtonText}>{t('queCocino.creator.save')}</Text>
            )}
          </Pressable>
          </Animated.View>
        </Animated.View>
        </GestureDetector>

        <ScrollView
          contentInsetAdjustmentBehavior="never"
          ref={scrollRef}
          automaticallyAdjustKeyboardInsets
          onContentSizeChange={() => {
            if (!scrollToNewStep.current) return;
            scrollToNewStep.current = false;
            scrollRef.current?.scrollToEnd({ animated: true });
          }}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 32 }]}
          pointerEvents={saving ? 'none' : 'auto'}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <RecipeFormSection index={1} transition={transition}>
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

          </RecipeFormSection>
          <RecipeFormSection index={2} transition={transition}>
          <Text style={styles.fieldLabel}>{t('queCocino.creator.resultImage')}</Text>
          <Pressable
            onPress={() => pickImage()}
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

          </RecipeFormSection>
          <RecipeFormSection index={3} transition={transition}>
          <Text style={styles.fieldLabel} accessibilityRole="header">
            {t('queCocino.creator.servings')}
          </Text>
          <View style={styles.servingsCard}>
            <View style={styles.servingsIcon}>
              <Ionicons name="people-outline" size={22} color={colors.accent} />
            </View>
            <View style={styles.servingsCopy}>
              <Text style={styles.servingsValue} accessibilityLiveRegion="polite">
                {t(servings === 1
                  ? 'queCocino.creator.servingsOne'
                  : 'queCocino.creator.servingsMany', { n: servings })}
              </Text>
              <Text style={styles.servingsHint}>{t('queCocino.creator.servingsHint')}</Text>
            </View>
            <View style={styles.servingsControls}>
              <Pressable
                testID="recipe-servings-decrease"
                onPress={() => adjustServings(-1)}
                disabled={servings === MIN_RECIPE_SERVINGS}
                accessibilityRole="button"
                accessibilityLabel={t('queCocino.creator.decreaseServings')}
                accessibilityState={{ disabled: servings === MIN_RECIPE_SERVINGS }}
                style={({ pressed }) => [
                  styles.servingsButton,
                  servings === MIN_RECIPE_SERVINGS && styles.servingsButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="remove" size={20} color={colors.accent} />
              </Pressable>
              <Pressable
                testID="recipe-servings-increase"
                onPress={() => adjustServings(1)}
                disabled={servings === MAX_RECIPE_SERVINGS}
                accessibilityRole="button"
                accessibilityLabel={t('queCocino.creator.increaseServings')}
                accessibilityState={{ disabled: servings === MAX_RECIPE_SERVINGS }}
                style={({ pressed }) => [
                  styles.servingsButton,
                  servings === MAX_RECIPE_SERVINGS && styles.servingsButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="add" size={20} color={colors.accent} />
              </Pressable>
            </View>
          </View>

          </RecipeFormSection>
          <RecipeFormSection index={4} transition={transition}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <View style={styles.sectionTitleRow}>
                <Text style={[styles.fieldLabel, styles.sectionTitle]} accessibilityRole="header">{t('queCocino.creator.ingredients')}</Text>
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

          </RecipeFormSection>
          <RecipeFormSection index={5} transition={transition}>
          <View style={[styles.sectionHeader, styles.stepsHeader]}>
            <View style={styles.sectionCopy}>
              <View style={styles.sectionTitleRow}>
                <Text style={[styles.fieldLabel, styles.sectionTitle]} accessibilityRole="header">{t('queCocino.creator.steps')}</Text>
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
                  <View style={styles.stepPhotoSection}>
                    {step.imageUri ? (
                      <Image
                        source={{ uri: step.imageUri }} style={styles.stepPhoto} resizeMode="contain"
                        accessibilityLabel={t('queCocino.creator.stepImage', { n: index + 1 })}
                      />
                    ) : null}
                    <View style={styles.stepPhotoActions}>
                      <Pressable
                        onPress={() => pickImage(step.id)} disabled={saving}
                        style={({ pressed }) => [styles.stepPhotoButton, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel={t(step.imageUri
                          ? 'queCocino.creator.changeStepImage' : 'queCocino.creator.addStepImage', { n: index + 1 })}
                      >
                        <Ionicons name="image-outline" size={17} color={colors.accent} />
                        <Text style={styles.stepPhotoButtonText}>
                          {t(step.imageUri ? 'queCocino.creator.changeImage' : 'queCocino.creator.optionalStepImage')}
                        </Text>
                      </Pressable>
                      {step.imageUri ? (
                        <Pressable
                          onPress={() => setSteps((current) => current.map((item) => (
                            item.id === step.id ? { ...item, imageUri: null } : item
                          )))}
                          disabled={saving}
                          style={({ pressed }) => [styles.stepPhotoButton, pressed && styles.pressed]}
                          accessibilityRole="button"
                          accessibilityLabel={t('queCocino.creator.removeStepImage', { n: index + 1 })}
                        >
                          <Ionicons name="trash-outline" size={17} color={colors.inkSoft} />
                          <Text style={styles.stepPhotoRemoveText}>{t('queCocino.creator.removeImage')}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
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
          </RecipeFormSection>
        </ScrollView>
      </View>
      </>}
      </Animated.View>
      <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.transitionButton, transition.pillStyle]}>
        <Animated.View style={[styles.transitionButtonLabel, transition.pillLabelStyle]}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.transitionButtonText}>{t('queCocino.createRecipe')}</Text>
        </Animated.View>
      </Animated.View>
      {pickerOpen && (
        <RecipeIngredientPickerModal
          selectedKeys={selectedIngredientKeys}
          onSelect={addIngredient}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </View>
  );
}

function sectionEntering(index: number, reducedMotion: boolean) {
  return reducedMotion
    ? FadeIn.duration(200).reduceMotion(ReduceMotion.Never)
    : FadeInDown.withInitialValues({ opacity: 0, transform: [{ translateY: 14 }] })
      .duration(200).delay(35 + index * 50);
}

function RecipeFormSection({ children, index, transition }: {
  children: ReactNode;
  index: number;
  transition: { progress: SharedValue<number>; closing: boolean; reducedMotion: boolean };
}) {
  const { progress, closing, reducedMotion } = transition;
  const exitStyle = useAnimatedStyle(() => {
    const exit = closing ? 1 - progress.value : 0;
    const amount = reducedMotion ? 0 : interpolate(exit,
      [(RECIPE_FORM_SECTION_COUNT - index) * 0.035,
        0.4 + (RECIPE_FORM_SECTION_COUNT - index) * 0.035], [0, 1], 'clamp');
    return { opacity: 1 - amount, transform: [{ translateY: 14 * amount }] };
  });
  return <Animated.View entering={sectionEntering(index, reducedMotion)}>
    <Animated.View style={exitStyle}>{children}</Animated.View>
  </Animated.View>;
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
  screen: { flex: 1, backgroundColor: 'transparent' },
  backdrop: { backgroundColor: '#000000' },
  transitionSurface: { backgroundColor: colors.paper, position: 'absolute', overflow: 'hidden' },
  transitionButton: {
    position: 'absolute', backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  transitionButtonLabel: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  transitionButtonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 13 },
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
  servingsCard: {
    minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, marginBottom: 26, borderRadius: 20,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  servingsIcon: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight,
  },
  servingsCopy: { flex: 1, minWidth: 0 },
  servingsValue: { fontSize: 15, lineHeight: 20, fontFamily: fonts.bold, color: colors.ink },
  servingsHint: { marginTop: 3, fontSize: 11, lineHeight: 16, fontFamily: fonts.medium, color: colors.inkSoft },
  servingsControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  servingsButton: {
    width: 44, height: 44, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentMid,
  },
  servingsButtonDisabled: { opacity: 0.38 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  sectionCopy: { flex: 1, minWidth: 0 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sectionTitle: { marginBottom: 0 },
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
  stepPhotoSection: { marginBottom: 12, gap: 6 },
  stepPhoto: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: colors.photoPlaceholder },
  stepPhotoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepPhotoButton: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.paper,
  },
  stepPhotoButtonText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.accent },
  stepPhotoRemoveText: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft },
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
