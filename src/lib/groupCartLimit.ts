import type { GroupSummary } from '../api/groups';
import { FREE_GROUP_CART_LIMIT, limitsApply } from '../constants/limits';
import { GROUP_CART_LIMIT_RELEASE_ENABLED } from './groupCartRelease';

type MemberGroup = Pick<GroupSummary, 'id' | 'joinedAt'>;

/** Los tres primeros grupos a los que se incorporó esta cuenta conservan su cesta. */
export function freeGroupCartIds(groups: MemberGroup[]): Set<string> {
  if (groups.some((group) => !group.joinedAt)) return new Set();
  return new Set(groups
    .filter((group): group is MemberGroup & { joinedAt: string } => Boolean(group.joinedAt))
    .sort((a, b) => {
      return a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id);
    })
    .slice(0, FREE_GROUP_CART_LIMIT)
    .map((group) => group.id));
}

export function groupCartIsLocked(
  groups: MemberGroup[], groupId: string, isPremium: boolean,
): boolean {
  if (!GROUP_CART_LIMIT_RELEASE_ENABLED || !limitsApply(isPremium)) return false;
  if (!groups.some((group) => group.id === groupId)) return false;
  return !freeGroupCartIds(groups).has(groupId);
}

export class GroupCartLimitError extends Error {
  constructor() {
    super('Group cart requires QuéFalta Plus');
    this.name = 'GroupCartLimitError';
  }
}
