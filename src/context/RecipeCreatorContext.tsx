import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

export type RecipeButtonBounds = { x: number; y: number; width: number; height: number };

const RecipeCreatorContext = createContext<{
  sourceRef: RefObject<View | null>;
  sourceHidden: SharedValue<boolean>;
} | null>(null);

/** Only transient geometry lives here; recipe drafts remain inside the screen. */
export function RecipeCreatorProvider({ children }: { children: ReactNode }) {
  const sourceRef = useRef<View>(null);
  const sourceHidden = useSharedValue(false);
  return <RecipeCreatorContext.Provider value={{ sourceRef, sourceHidden }}>
    {children}
  </RecipeCreatorContext.Provider>;
}

export function useRecipeCreatorSource() {
  const context = useContext(RecipeCreatorContext);
  if (!context) throw new Error('RecipeCreatorProvider is missing');
  return context;
}
