/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, defineAssets } from '@iwsdk/core';
import { createPipCompanionModel } from './scene-assets/pip-companion.scene-asset.js';
import { createGhostDeskmateModel } from './scene-assets/ghost-deskmate.scene-asset.js';
import { createEveningJarModel } from './scene-assets/evening-jar.scene-asset.js';
import { createDeskSurfaceModel } from './scene-assets/desk-surface.scene-asset.js';
import { createCozyRoomModel } from './scene-assets/cozy-room.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const uikitml = (fileName: string, name: string) => ({
  url: publicAssetUrl(`ui/${fileName}`),
  type: AssetType.UIKitML,
  name,
});

export default defineAssets({
  'workspace-dashboard': uikitml('workspace-dashboard.uikitml', 'Daily Workspace'),
  'task-roadmap': uikitml('task-card.uikitml', 'Task Card'),
  'task-design-review': uikitml('task-card.uikitml', 'Task Card'),
  'task-inbox': uikitml('task-card.uikitml', 'Task Card'),
  'task-slot-4': uikitml('task-card.uikitml', 'Task Card'),
  'task-slot-5': uikitml('task-card.uikitml', 'Task Card'),
  'task-slot-6': uikitml('task-card.uikitml', 'Task Card'),
  'welcome-panel': uikitml('welcome.uikitml', 'Welcome Panel'),
  'pip-companion': createPipCompanionModel(),
  'ghost-deskmate': createGhostDeskmateModel(),
  'evening-jar': createEveningJarModel(),
  'desk-surface': createDeskSurfaceModel(),
  'cozy-room': createCozyRoomModel(),
});
