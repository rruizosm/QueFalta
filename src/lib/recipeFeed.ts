import { fetchCommunityRecipes } from '../api/recipes';
import { createRecipeFeedCache } from './recipeFeedCache';
import { peekStartupCache, readStartupCache, startupKeys, writeStartupCache } from './startupCache';

export const recipeFeed = createRecipeFeedCache({
  load: fetchCommunityRecipes,
  peek: (userId) => peekStartupCache(startupKeys.recipes(userId)),
  read: (userId) => readStartupCache(startupKeys.recipes(userId)),
  write: (userId, snapshot) => writeStartupCache(startupKeys.recipes(userId), snapshot),
});
