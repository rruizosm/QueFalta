import { useEffect, type ComponentProps } from 'react';
import { Modal } from 'react-native';
import { NavigationContainer, NavigationIndependentTree, useTheme } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LayoutAnimationConfig } from 'react-native-reanimated';
import { createRecipeModalStack } from '../navigation/RecipeModalStack';
import { useAuth } from '../context/AuthContext';
import { useRecipeFeed } from '../hooks/useRecipeFeed';
import { recipeEditorOptions } from '../navigation/recipeCreator';
import CommunityRecipeDetailModal from './CommunityRecipeDetailModal';
import EditRecipeScreen from './EditRecipeScreen';
import { PagerGestureContext, PagerMotionContext } from './bottom-tabs-pager/PagerGestureContext';

const Stack = createRecipeModalStack();
type Props = Omit<ComponentProps<typeof CommunityRecipeDetailModal>, 'embedded' | 'onEdit'>;

// Detail and editor share one modal window. Pushing the editor never dismisses
// the recipe, so both opening and closing reveal the actual detail underneath.
export default function RecipeFlowModal(props: Props) {
  const theme = useTheme();
  const { onClose } = props;
  const { session } = useAuth();
  const feed = useRecipeFeed(session?.user.id ?? '');
  const recipe = feed.recipes?.find((item) => item.id === props.recipe?.id) ?? props.recipe;
  const deleted = !!props.recipe && feed.recipes !== null
    && !feed.recipes.some((item) => item.id === props.recipe?.id);
  useEffect(() => { if (deleted) onClose(); }, [deleted, onClose]);
  if (!recipe) return null;
  return (
    <Modal visible transparent animationType="none" presentationStyle="overFullScreen" onRequestClose={props.onClose}>
      <LayoutAnimationConfig skipExiting>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <PagerGestureContext.Provider value={null}>
      <PagerMotionContext.Provider value={null}>
      <NavigationIndependentTree>
      <NavigationContainer theme={{ ...theme, colors: { ...theme.colors, background: 'transparent' } }}>
      <Stack.Navigator initialRouteName="RecipeDetail" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="RecipeDetail" listeners={({ navigation }) => ({
          focus: () => {
            if (recipe.authorId === session?.user.id) navigation.preload('EditRecipe', { recipe });
          },
        })}>
          {({ navigation }) => (
            <CommunityRecipeDetailModal {...props} recipe={recipe} embedded
              onEdit={recipe.authorId === session?.user.id
                ? (current) => navigation.navigate('EditRecipe', { recipe: current }) : undefined} />
          )}
        </Stack.Screen>
        <Stack.Screen name="EditRecipe" component={EditRecipeScreen} options={recipeEditorOptions} />
      </Stack.Navigator>
      </NavigationContainer>
      </NavigationIndependentTree>
      </PagerMotionContext.Provider>
      </PagerGestureContext.Provider>
      </GestureHandlerRootView>
      </LayoutAnimationConfig>
    </Modal>
  );
}
