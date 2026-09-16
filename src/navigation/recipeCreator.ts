import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { RootTabParamList } from '../types';
import type { RecipeButtonBounds } from '../context/RecipeCreatorContext';

export type AppStackParamList = {
  Tabs: NavigatorScreenParams<RootTabParamList> | undefined;
  NewRecipe: { origin: RecipeButtonBounds | null };
};

export const recipeCreatorOptions: NativeStackNavigationOptions = {
  headerShown: false,
  presentation: 'transparentModal',
  animation: 'none',
  contentStyle: { backgroundColor: 'transparent' },
  // One interactive spring on both OSes; avoid a second UIKit transition.
  gestureEnabled: false,
  freezeOnBlur: false,
};
