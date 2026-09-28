import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { RootTabParamList } from '../types';
import type { RecipeButtonBounds } from '../context/RecipeCreatorContext';
import type { CommunityRecipe } from '../api/recipes';

export type AppStackParamList = {
  Tabs: NavigatorScreenParams<RootTabParamList> | undefined;
  NewRecipe: { origin: RecipeButtonBounds | null };
  EditRecipe: { recipe: CommunityRecipe };
  RecipeDetail: undefined;
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

export const recipeEditorOptions: NativeStackNavigationOptions = {
  headerShown: false,
  presentation: 'card',
  animation: 'slide_from_right',
  gestureEnabled: false,
};
