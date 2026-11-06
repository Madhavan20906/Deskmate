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
	estimatedMinutes: { type: Types.Float32, default: 30 },
	scheduledStartMinute: { type: Types.Float32, default: -1 },
	status: { type: Types.String, default: 'todo' },
});

export default defineComponents([TaskData]);
