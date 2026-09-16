/** Distances are logical pixels (pt/dp), velocities logical pixels/second. */
export const TAB_MOTION = {
  horizontalActivation: 16,
  verticalFailure: 12,
  distanceThreshold: 0.22,
  releaseVelocity: 650,
  blurVelocity: 1050,
  fullBlurVelocity: 2400,
  maxBlurSigma: 5,
  blurAttackMs: 45,
  blurReleaseMs: 90,
  staleVelocityMs: 70,
  maxStretch: 0.24,
  maxPillLead: 0.075,
  pageSpring: { stiffness: 280, damping: 30, mass: 1, overshootClamping: true },
  pillSpring: { stiffness: 340, damping: 18, mass: 0.7 },
} as const;

export const TAB_LAYOUT = {
  height: 64,
  margin: 18,
  bottomGap: 10,
  maxWidth: 460,
  padding: 8,
  pillHeight: 48,
  pillMaxWidth: 64,
} as const;
