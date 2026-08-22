import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canSubmitUsername,
  normalizeOnboardingStep,
  onboardingRouteForStep,
} from '../../src/lib/onboardingProgress.ts';

test('onboarding resumes at the persisted safe route', () => {
  assert.equal(onboardingRouteForStep(0), 'Username');
  assert.equal(onboardingRouteForStep(1), 'Stores');
  assert.equal(onboardingRouteForStep(2), 'Avatar');
  assert.equal(onboardingRouteForStep(3), 'Friends');
  assert.equal(onboardingRouteForStep(4), 'Group');
  assert.equal(onboardingRouteForStep(5), 'Group');
});

test('invalid onboarding progress is clamped safely', () => {
  assert.equal(normalizeOnboardingStep(undefined), 0);
  assert.equal(normalizeOnboardingStep(Number.NaN), 0);
  assert.equal(normalizeOnboardingStep(-4), 0);
  assert.equal(normalizeOnboardingStep(99), 5);
});

test('username submit requires the validation to match the current input', () => {
  assert.equal(canSubmitUsername('ok', 'ana', 'ana', true), true);
  assert.equal(canSubmitUsername('ok', 'ana', 'ana2', true), false);
  assert.equal(canSubmitUsername('checking', 'ana', 'ana', true), false);
  assert.equal(canSubmitUsername('ok', 'ana', 'ana', false), false);
});
