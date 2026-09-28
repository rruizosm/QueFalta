import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/recipeCreator';
import { useRecipeCreatorTransition } from '../hooks/useRecipeCreatorTransition';
import RecipeForm from './RecipeForm';

export default function CreateRecipeModal({ navigation, route }: NativeStackScreenProps<AppStackParamList, 'NewRecipe'>) {
  return <RecipeForm navigation={navigation} origin={route.params.origin} useTransition={useRecipeCreatorTransition} />;
}
