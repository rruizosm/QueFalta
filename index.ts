import { registerRootComponent } from 'expo';

// The demo has its own providers and never mounts the authenticated application.
// Metro inlines EXPO_PUBLIC_*; __DEV__ prevents a release from entering the demo.
const App = __DEV__ && process.env.EXPO_PUBLIC_BOTTOM_TABS_DEMO === '1'
  ? require('./src/examples/bottom-tabs-pager/BottomTabsDemo').default
  : require('./App').default;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
