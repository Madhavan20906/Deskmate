import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

const rootDir = process.cwd();

// 1. iwsdk.config.json environment & camera configuration
const iwsdkConfigRaw = fs.readFileSync(path.join(rootDir, 'iwsdk.config.json'), 'utf8');
const iwsdkConfig = JSON.parse(iwsdkConfigRaw);
const configEnvLock = {
  xr: iwsdkConfig.world?.xr,
  render: iwsdkConfig.world?.render,
  emulator: iwsdkConfig.dev?.emulator,
};
const configEnvHash = sha256(JSON.stringify(configEnvLock));

// 2. Scene JSON environment & lighting nodes
const sceneRaw = fs.readFileSync(path.join(rootDir, 'public/scenes/main.iwsdk.scene.json'), 'utf8');
const scene = JSON.parse(sceneRaw);
const sceneEnvLock = {
  authoring: scene.authoring,
  components: scene.components,
  environment: scene.environment,
  lightingNodes: scene.nodes.filter(n => ['key-light', 'front-light', 'fill-light'].includes(n.id)),
  units: scene.units,
  version: scene.version,
};
const sceneEnvHash = sha256(JSON.stringify(sceneEnvLock));

// 3. index.html toolbar & container
const indexHtmlRaw = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const indexHtmlHash = sha256(indexHtmlRaw);

const currentHashes = {
  configEnvHash,
  configEnvLock,
  sceneEnvHash,
  sceneEnvLock,
  indexHtmlHash,
  timestamp: new Date().toISOString()
};

const hashesFile = path.join(rootDir, 'artifacts/environment-hashes.json');

if (process.argv.includes('--save')) {
  fs.writeFileSync(hashesFile, JSON.stringify(currentHashes, null, 2), 'utf8');
  console.log('ENVIRONMENT LOCK HASHES SAVED:');
  console.log(`- Config Env Hash: ${configEnvHash}`);
  console.log(`- Scene Env Hash:  ${sceneEnvHash}`);
  console.log(`- Index HTML Hash: ${indexHtmlHash}`);
  process.exit(0);
}

if (!fs.existsSync(hashesFile)) {
  console.error(`Hash file not found at ${hashesFile}. Run with --save first.`);
  process.exit(1);
}

const saved = JSON.parse(fs.readFileSync(hashesFile, 'utf8'));
let diffs = [];
if (saved.configEnvHash !== configEnvHash) diffs.push('iwsdk.config.json environment/camera/emulator changed');
if (saved.sceneEnvHash !== sceneEnvHash) diffs.push('main.iwsdk.scene.json environment/authoring/lighting changed');
if (saved.indexHtmlHash !== indexHtmlHash) diffs.push('index.html toolbar/markup changed');

if (diffs.length === 0) {
  console.log('ENVIRONMENT UNCHANGED');
  console.log(`- Config Env Hash: ${configEnvHash} [MATCH]`);
  console.log(`- Scene Env Hash:  ${sceneEnvHash} [MATCH]`);
  console.log(`- Index HTML Hash: ${indexHtmlHash} [MATCH]`);
  process.exit(0);
} else {
  console.error('ENVIRONMENT CHANGED:');
  for (const diff of diffs) {
    console.error(`- ${diff}`);
  }
  process.exit(1);
}
