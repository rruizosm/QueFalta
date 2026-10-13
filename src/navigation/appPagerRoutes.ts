// Inicio remains both the launch destination and the Android Back root.
export const APP_PAGER_ROUTE_OPTIONS = {
  initialRouteName: 'Home',
  backBehavior: 'initialRoute',
} as const;

export function getAppTabBarPageIndices(routes: readonly { name: string }[]) {
  return routes.map((_, index) => index);
}

/** Map page motion to the visible bottom destinations. */
export function pagerToTabBarProgress(progress: number, pageIndices: readonly number[]) {
  'worklet';
  if (pageIndices.length < 2 || progress <= pageIndices[0]) return 0;
  for (let index = 1; index < pageIndices.length; index++) {
    if (progress <= pageIndices[index]) {
      return index - 1 + (progress - pageIndices[index - 1]) / (pageIndices[index] - pageIndices[index - 1]);
    }
  }
  return pageIndices.length - 1;
}
