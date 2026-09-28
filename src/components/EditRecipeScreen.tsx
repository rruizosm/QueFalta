import { useRef } from 'react';
import { Keyboard, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/recipeCreator';
import type { useRecipeCreatorTransition } from '../hooks/useRecipeCreatorTransition';
import RecipeForm from './RecipeForm';

// The modal stack owns the horizontal transition. The form stays at its final
// position and does not run the creator's separate animation timeline.
const useEditorPresentation: typeof useRecipeCreatorTransition = (_origin, onClose) => {
  const rootRef = useRef<View>(null);
  const progress = useSharedValue(1);
  const surfaceStyle = useAnimatedStyle(() => ({ opacity: 1, borderRadius: 0, transform: [{ translateY: 0 }] }));
  const hiddenStyle = useAnimatedStyle(() => ({ opacity: 0 }));
  const publishStyle = useAnimatedStyle(() => ({ opacity: 1, transform: [{ scale: 1 }] }));
  return {
    rootRef, progress, started: true, closing: false, horizontal: true,
    reducedMotion: true,
    onLayout: async () => {}, onPresented: () => {}, onPublishLayout: () => {},
    close: async () => { Keyboard.dismiss(); onClose(); },
    surfaceStyle, backdropStyle: hiddenStyle, pillStyle: hiddenStyle,
    pillLabelStyle: hiddenStyle, publishStyle,
    dismissGesture: Gesture.Pan().enabled(false),
  };
};

export default function EditRecipeScreen({ navigation, route }: NativeStackScreenProps<AppStackParamList, 'EditRecipe'>) {
  return <RecipeForm navigation={navigation} editingRecipe={route.params.recipe} useTransition={useEditorPresentation} />;
}
