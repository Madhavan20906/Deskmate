# Deskmate — Mixed Reality Productivity Workspace
### Meta VR Start Developer Competition 2026
**Track:** Productivity  
**Division:** New Experience  
**Technology:** Meta IWSDK (Immersive Web SDK) + TypeScript + WebXR + Three.js  
**Tagline:** *Plan with your hands on your real desk, focus beside a friend or an AI companion, and watch your habit grow.*

---

## 1. Executive Summary

**Deskmate** transforms the user's real physical desk into a calm, hands-only, seated productivity workspace using mixed reality. 

Instead of interacting with conventional flat to-do lists, users manipulate physical-looking task cards in their real environment. Tasks become tactile spatial objects that can be pinched, grabbed, and arranged onto a 3-slot Time Ruler along the desk edge (Morning, Afternoon, Evening). When schedules exceed healthy capacity, cards visibly pile up and physically wobble, helping users intuitively recognize unrealistic workloads.

A spatial AI companion named **Pip** perches on the desk, converting natural spoken thoughts into structured task cards with estimated effort sizes, rebalancing crowded time slots, and giving evening recaps. Users can focus beside a friend using real-time body doubling over a lightweight WebSocket relay, or beside an ambient **Ghost Deskmate** when working solo. Completed tasks drop into a 3D glass Evening Jar, growing a persistent focus garden with forgiving streaks that never punish a missed day.

---

## 2. Key Architectural Features

### 👐 Hands-First & Seated
- Operates 100% hands-only within a comfortable ~2-foot seated radius using natural hand-pinch grabbing and poke/ray interactions.
- Controller support is completely optional: no paired controllers are ever required.

### 🪑 Real-Desk Integration & Spatial Surface Placement
- Mixed reality AR passthrough mode with real-world integration.
- Adaptive desk surface calibration (+ / - 5cm vertical offsets and persistent desk level).
- Built-in tactile executive walnut desk surface and leather desk blotter fallback when in virtual or non-passthrough mode.

### ⏱️ 3-Slot Time Ruler & Physical Overload Wobble
- Three primary daily time slots:
  - **Morning** (08:00 – 12:00, ~4h capacity)
  - **Afternoon** (12:00 – 16:00, ~4h capacity)
  - **Evening** (16:00 – 20:00, ~4h capacity)
- Effort sizes: Small (30m), Medium (60m), Large (120m).
- Overload detection: when a slot exceeds capacity (> 3 cards or > 240m), cards physically tilt and wobble (`wobbleAngleDeg`), slot badges illuminate amber with warning icons, and Pip displays a concerned expression suggesting task rebalancing.

### 🎯 Focus Mode & Active Card Spotlight
- Selecting a card elevates it into the dedicated "One Thing" focal position while inactive cards dim.
- Circular focus timer with configurable work (default 25m) and break (default 5m) intervals.
- Pausing restores normal passthrough visibility; completing a session deposits a reward marble into the Evening Jar and advances garden growth.

### 🏺 Evening Jar & Wind-Down Recap
- 3D glass reward jar with cork lid and colorful reward marbles representing completed work.
- Dropping a card near the jar or completing a focus sprint triggers a satisfying crystal glass token clink.
- Evening recap summarizes completed tasks, carried-over items, and focused minutes with guilt-free carryover or release.

### 🌿 Focus Garden & Forgiving Streaks
- Progressive plant growth stages: Seed, Sprout (20 pts), Sapling (100 pts), Bloom (250 pts), Canopy (500 pts).
- Plant unlocks at milestones: Morning Clover (3 days), Jade Bonsai (7 days), Amber Fern (14 days), Celestial Orchid (30 days).
- **Forgiving Streaks with Rest Leaves:** One missed day freezes the streak with a restful leaf icon instead of resetting to zero. No guilt-based mechanics.

### 🤖 Pip — Spatial Companion with Offline NLP & Optional AI Proxy
- Low-poly companion creature perched on the desk with expressive animations (idle bobbing, listening pulse, thinking tilt, celebration bounce, concerned overload tilt).
- 100% offline rule-based natural language parsing splits compound sentences ("write report and then call mom"), estimates effort sizes, rebalances slots, and delivers recaps.
- Optional backend AI proxy (`server/ai.js`) with a strict 2.8-second timeout that automatically falls back to offline execution.

### 👥 Social Body Doubling & Ghost Deskmate
- **Ghost Deskmate:** Synthetic glowing presence orb with scripted 25m focus / 5m break rhythm.
- **Friend Mode:** Real-time presence over a Node.js WebSocket relay (`server/relay.js`) using short room codes. Synchronizes partner focus/break state and timer. Automatic 30-second idle fallback to Ghost mode.

### 🔊 Procedural Web Audio Sound Synthesizer
- Zero-dependency, offline-first Web Audio sound synthesizer (`src/audio.ts`):
  - Tactile card pickup flutter
  - Wooden placement snap
  - Crystal glass jar ping
  - Warm Tibetan singing bowl focus bell
  - Major triad flower bloom arpeggio
  - Ambient amber overload chime
- No network latency, missing files, or CORS restrictions.

### 💾 Resilient Persistence Layer
- Multi-tier storage (`src/storage.ts`): IndexedDB primary with synchronous memory caching and LocalStorage backup snapshots.
- Versioned schema (v3) ensures data migration, corruption recovery, and restoration across browser restarts.

### ♿ Accessibility-Forward Design
- High-contrast mode, reduce-motion mode, color-blind-safe iconography, voice commands, one-handed interaction alternatives, and workspace recentering.

---

## 3. Getting Started

### Prerequisites
- Node.js >= 20.19.0 (Node 22 LTS recommended)
- `npm` or `pnpm`

### Installation
```bash
# Clone the repository and install dependencies
npm install
```

### Development
```bash
# Launch the managed IWSDK dev server with IWER Quest 3 emulator
npm run dev

# Or run Vite runtime directly
npm run dev:runtime
```

### Typecheck & Test Suite
```bash
# Run TypeScript compilation check
npm run typecheck

# Run the 16 comprehensive automated tests
npm test
```

### Production Build
```bash
# Build the production bundle
npm run build
```

### Optional Relay & AI Proxy Servers
```bash
# Start the WebSocket body-doubling relay (ws://localhost:8080)
node server/relay.js

# Start the optional AI proxy server (http://localhost:8081/api/pip)
node server/ai.js
```

---

## 4. Testing & Verification

The project includes automated verification across:
- `test/pip.test.mjs`: Pip natural language parsing, compound sentence splitting, schedule extraction, and messy phrasing benchmarks.
- `test/deskmate.test.mjs`: 3-slot Time Ruler overload detection, wobble tilt calculation, forgiving streak with rest leaf protection, social presence state management, and schema validation.

All 16 tests pass with 0 errors.

---

## 5. Competition Compliance

- **Competition:** Meta VR Start Developer Competition 2026
- **Track:** Productivity
- **Division:** New Experience (Created within competition timeline)
- **Framework:** Meta IWSDK (`@iwsdk/core` v1.1.0-rc.2) + WebXR + Three.js
- **Controllers:** 100% completable hands-only with hand tracking; no controllers required.
- **Audio & Assets:** Original 3D models (`src/scene-assets/`) and Web Audio procedural synthesizer. Free of third-party branding or logos.
- **Privacy:** Offline-first architecture. No client API keys; no personal room images or sensitive data sent to external servers.
