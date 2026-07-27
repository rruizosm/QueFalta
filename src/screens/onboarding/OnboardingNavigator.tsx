/** Asistente de bienvenida (primera vez). Se monta desde navigation/index.tsx
 *  cuando hay sesión pero el perfil aún no tiene onboarded_at. */
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../types';
import LanguageStepScreen from './LanguageStepScreen';
import NameScreen from './NameScreen';
import UsernameScreen from './UsernameScreen';
import RegionScreen from './RegionScreen';
import StoresScreen from './StoresScreen';
import AvatarScreen from './AvatarScreen';
import FriendsScreen from './FriendsScreen';
import GroupScreen from './GroupScreen';
import DoneScreen from './DoneScreen';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OnboardingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, gestureEnabled: false, animation: 'slide_from_right' }}
    >
      <Stack.Screen name="Language" component={LanguageStepScreen} />
      <Stack.Screen name="Name"     component={NameScreen} />
      <Stack.Screen name="Username" component={UsernameScreen} />
      <Stack.Screen name="Region"   component={RegionScreen} />
      <Stack.Screen name="Stores"   component={StoresScreen} />
      <Stack.Screen name="Avatar"   component={AvatarScreen} />
      <Stack.Screen name="Friends"  component={FriendsScreen} />
      <Stack.Screen name="Group"    component={GroupScreen} />
      <Stack.Screen name="Done"     component={DoneScreen} />
    </Stack.Navigator>
  );
}
