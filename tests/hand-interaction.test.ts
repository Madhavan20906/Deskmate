import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMatchingTimelineZone,
  PinchHysteresis,
  ActionDebouncer,
  HandTrackingMonitor,
  calculateSeatedDistance,
  TIMELINE_ZONES,
} from '../src/hand-interaction-engine.ts';

test('findMatchingTimelineZone: snaps to correct zone within magnetic radius', () => {
  // Morning zone is at [-0.25, 1.45, -1.02] with radius 0.22
  const morningDrop = { x: -0.22, y: 1.46, z: -1.03 };
  const matchedMorning = findMatchingTimelineZone(morningDrop);
  assert.ok(matchedMorning !== null);
  assert.equal(matchedMorning?.name, 'morning');
  assert.equal(matchedMorning?.startMinute, 9 * 60);

  // Midday zone is at [0.0, 1.45, -1.02]
  const middayDrop = { x: 0.05, y: 1.44, z: -1.01 };
  const matchedMidday = findMatchingTimelineZone(middayDrop);
  assert.ok(matchedMidday !== null);
  assert.equal(matchedMidday?.name, 'midday');

  // Evening zone is at [0.25, 1.45, -1.02]
  const eveningDrop = { x: 0.28, y: 1.42, z: -1.00 };
  const matchedEvening = findMatchingTimelineZone(eveningDrop);
  assert.ok(matchedEvening !== null);
  assert.equal(matchedEvening?.name, 'evening');

  // Point far away from all zones returns null
  const farDrop = { x: -0.80, y: 0.75, z: -0.40 };
  const matchedFar = findMatchingTimelineZone(farDrop);
  assert.equal(matchedFar, null);
});

test('PinchHysteresis: requires higher threshold to engage and lower to release', () => {
  const hysteresis = new PinchHysteresis(0.85, 0.65);

  assert.equal(hysteresis.state, false);

  // Strength 0.80 is below enterThreshold 0.85 -> stays unpinched
  assert.equal(hysteresis.update(0.80), false);

  // Strength 0.86 crosses enterThreshold 0.85 -> pinches
  assert.equal(hysteresis.update(0.86), true);

  // Dip to 0.75 is above exitThreshold 0.65 -> stays pinched despite being below 0.85!
  assert.equal(hysteresis.update(0.75), true);

  // Dip to 0.70 still stays pinched
  assert.equal(hysteresis.update(0.70), true);

  // Dip to 0.60 drops below exitThreshold 0.65 -> releases pinch!
  assert.equal(hysteresis.update(0.60), false);

  // Rise back to 0.75 does not re-engage until 0.85 is reached
  assert.equal(hysteresis.update(0.75), false);
  assert.equal(hysteresis.update(0.88), true);
});

test('ActionDebouncer: filters rapid repeated activations within cooldown window', () => {
  const debouncer = new ActionDebouncer(300);

  // First action at t=1000 succeeds
  assert.equal(debouncer.canExecute(1000), true);

  // Second action 100ms later (t=1100) is rejected
  assert.equal(debouncer.canExecute(1100), false);

  // Third action 250ms later (t=1250) is still rejected (< 300ms)
  assert.equal(debouncer.canExecute(1250), false);

  // Fourth action 305ms after first (t=1305) succeeds!
  assert.equal(debouncer.canExecute(1305), true);
});

test('HandTrackingMonitor: signals hint after 3 seconds of lost tracking and resumes on return', () => {
  const monitor = new HandTrackingMonitor(3.0);

  // 1s with no hands
  let res = monitor.update(1.0, false);
  assert.equal(res.shouldShowHint, false);
  assert.equal(res.becameVisible, false);

  // another 1.5s with no hands (total 2.5s)
  res = monitor.update(1.5, false);
  assert.equal(res.shouldShowHint, false);

  // another 0.6s with no hands (total 3.1s -> exceeds 3.0s)
  res = monitor.update(0.6, false);
  assert.equal(res.shouldShowHint, true);
  assert.equal(res.becameVisible, false);

  // hands return!
  res = monitor.update(0.1, true);
  assert.equal(res.shouldShowHint, false);
  assert.equal(res.becameVisible, true);
  assert.equal(monitor.lostDuration, 0);
});

test('calculateSeatedDistance: accurately computes 3D Euclidean seated distance from torso', () => {
  const torso = { x: 0, y: 1.30, z: 0 };

  // Task card at [-0.42, 1.06, -0.75]
  const cardDistance = calculateSeatedDistance({ x: -0.42, y: 1.06, z: -0.75 }, torso);
  assert.ok(cardDistance >= 0.85 && cardDistance <= 0.95);

  // Tabletop prop at [0, 0.74, -0.56]
  const propDistance = calculateSeatedDistance({ x: 0, y: 0.74, z: -0.56 }, torso);
  assert.ok(propDistance >= 0.75 && propDistance <= 0.85);
});
