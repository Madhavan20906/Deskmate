/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, defineAssets } from '@iwsdk/core';
import { createPipRobotAsset } from './scene-assets/pip-robot.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const uikitml = (fileName: string, name: string) => ({
  url: publicAssetUrl(`ui/${fileName}`),
  type: AssetType.UIKitML,
  name,
});

export default defineAssets({
  'pip-robot': createPipRobotAsset(),
  'glass-hub': uikitml('glass-hub.uikitml', 'Glass Command Hub'),
  'glass-tasks': uikitml('glass-tasks.uikitml', 'Glass Tasks Panel'),
  'glass-pip': uikitml('glass-pip.uikitml', 'Glass Pip Panel'),
  'glass-focus': uikitml('glass-focus.uikitml', 'Glass Focus Panel'),
  'glass-sheet': uikitml('glass-edit-sheet.uikitml', 'Glass Edit Sheet'),
});
