/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent, defineComponents, Types } from '@iwsdk/core';

export const TaskData = createComponent('TaskData', {
	slot: { type: Types.Int8, default: 0 },
	active: { type: Types.Boolean, default: false },
	id: { type: Types.String, default: '' },
	title: { type: Types.String, default: 'New task' },
	description: { type: Types.String, default: '' },
	priority: { type: Types.String, default: 'medium' },
	category: { type: Types.String, default: '' },
	estimatedMinutes: { type: Types.Float32, default: 30 },
	scheduledStartMinute: { type: Types.Float32, default: -1 },
	status: { type: Types.String, default: 'todo' },
	createdAt: { type: Types.Float64, default: 0 },
	completedAt: { type: Types.Float64, default: 0 },
});

export const DeskmateState = createComponent('DeskmateState', {
	ritualMode: { type: Types.String, default: 'none' }, // 'morning' | 'evening' | 'none'
	breakActive: { type: Types.Boolean, default: false },
	breakSecondsRemaining: { type: Types.Int16, default: 60 },
	pipEmote: { type: Types.String, default: 'greeting' }, // 'greeting' | 'encouragement' | 'celebration' | 'nudge' | 'idle'
	ghostAudioEnabled: { type: Types.Boolean, default: true },
	ghostAudioVolume: { type: Types.Float32, default: 0.15 },
});

export const InteractiveObject = createComponent('InteractiveObject', {
	objectType: { type: Types.String, default: 'generic' },
	homeX: { type: Types.Float32, default: 0 },
	homeY: { type: Types.Float32, default: 0 },
	homeZ: { type: Types.Float32, default: 0 },
	isHovered: { type: Types.Boolean, default: false },
	isGrabbed: { type: Types.Boolean, default: false },
	isReturning: { type: Types.Boolean, default: false },
	returnProgress: { type: Types.Float32, default: 0 },
});

export default defineComponents([TaskData, DeskmateState, InteractiveObject]);
