// Pure worklets: also executed by the Node regression tests.
export function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

export function releaseTarget(
  progress: number,
  origin: number,
  velocity: number,
  count: number,
  distanceThreshold: number,
  velocityThreshold: number,
) {
  'worklet';
  let target = origin;
  if (Math.abs(velocity) >= velocityThreshold) {
    // A reversal selects in the release direction, even after a long drag.
    target = velocity > 0 ? Math.floor(progress + 0.001) + 1 : Math.ceil(progress - 0.001) - 1;
  } else {
    const distance = progress - origin;
    if (Math.abs(distance) >= distanceThreshold) {
      target = origin + Math.sign(distance) * Math.floor(Math.abs(distance) + 1 - distanceThreshold);
    }
  }
  return clamp(target, 0, count - 1);
}

export function fastMotion(speed: number, threshold: number, fullSpeed: number) {
  'worklet';
  if (speed <= threshold) return 0;
  return 0.65 + 0.35 * clamp((speed - threshold) / (fullSpeed - threshold), 0, 1);
}
