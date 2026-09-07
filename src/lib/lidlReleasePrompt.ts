import AsyncStorage from '@react-native-async-storage/async-storage';

export const LIDL_RELEASE_PROMPT_VERSION = '1.3.1';
const LIDL_RELEASE_ANSWER_PREFIX = '@lidl_release_answer:';

export type LidlReleaseAnswer = 'yes' | 'no';

export function lidlReleaseAnswerKey(userId: string): string {
  return `${LIDL_RELEASE_ANSWER_PREFIX}${LIDL_RELEASE_PROMPT_VERSION}:${userId}`;
}

export async function readLidlReleaseAnswer(userId: string): Promise<LidlReleaseAnswer | null> {
  const answer = await AsyncStorage.getItem(lidlReleaseAnswerKey(userId));
  return answer === 'yes' || answer === 'no' ? answer : null;
}

export async function writeLidlReleaseAnswer(
  userId: string,
  answer: LidlReleaseAnswer,
): Promise<void> {
  await AsyncStorage.setItem(lidlReleaseAnswerKey(userId), answer);
}
