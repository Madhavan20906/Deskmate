/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, defineAssets } from '@iwsdk/core';
import { createDeskAsset } from './scene-assets/desk.scene-asset.js';
import { createPipAsset } from './scene-assets/pip.scene-asset.js';
import { createSprintDialAsset } from './scene-assets/sprint-dial.scene-asset.js';
import { createDeskPlantAsset } from './scene-assets/desk-plant.scene-asset.js';
import { createFocusLampAsset } from './scene-assets/focus-lamp.scene-asset.js';
import { createMarblesJarAsset } from './scene-assets/jar.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const uikitml = (fileName: string, name: string) => ({
  url: publicAssetUrl(`ui/${fileName}`),
  type: AssetType.UIKitML,
  name,
});

export default defineAssets({
  'workspace-desk': createDeskAsset(),
  'pip-companion': createPipAsset(),
  'sprint-dial': createSprintDialAsset(),
  'desk-plant': createDeskPlantAsset(),
  'focus-lamp': createFocusLampAsset(),
  'marbles-jar': createMarblesJarAsset(),
  'workspace-dashboard': uikitml('workspace-dashboard.uikitml', 'Daily Workspace'),
  'task-roadmap': uikitml('task-card.uikitml', 'Task Card'),
  'task-design-review': uikitml('task-card.uikitml', 'Task Card'),
  'task-inbox': uikitml('task-card.uikitml', 'Task Card'),
  'task-slot-4': uikitml('task-card.uikitml', 'Task Card'),
  'task-slot-5': uikitml('task-card.uikitml', 'Task Card'),
  'task-slot-6': uikitml('task-card.uikitml', 'Task Card'),
  'welcome-panel': uikitml('welcome.uikitml', 'Welcome Panel'),
});
