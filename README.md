# DeskMate — Mixed-Reality Spatial Productivity Workspace

> **Meta VR Start Developer Competition 2026 Submission**  
> **Track:** Best New Productivity Experience ($70,000)  
> **Division Qualification:** New Experience (Conceived and built on November 13, 2026; no pre-existing codebase).  
> **Platform:** Meta Quest WebXR (IWSDK / Three.js / UIKitML)  
> **Input Model:** 100% Hands-Only (Pinch, Grab, Poke; Zero Controllers or Physical Keyboards Required)

---

## 🌟 Executive Summary

**DeskMate** transforms any real physical table into a calm, focused, and rewarding spatial productivity workstation in Mixed Reality. 

A user puts on their Meta Quest headset, looks at their real desk, and pins the spatial workspace. Within 60 seconds:
- **Spatial Task Management:** Interactive 3D cards hover comfortably in reach without occluding the dashboard or physical workspace.
- **Hands-Only Quick Capture:** Fast 3-pinch task creation using spatial title chips, priority toggles, and duration steppers — zero typing, zero browser dialogs.
- **Deterministic Productivity Engine:** "What Next?" recommendation algorithm surfaces the highest-impact task with a one-line rationale; "Plan My Day" automatically packs tasks into working hours (09:00–18:00) with 10-minute recovery breaks; "Fix Overlaps" auto-shifts conflicting slots.
- **Gentle Co-Working Presence:** **Ghost Deskmate** sits across your desk providing ambient spatial keyboard clicks and companionship; **Pip** (an on-device rule-based assistant) wiggles, gives feedback, and celebrates wins.
- **Tangible Daily Rewards:** Focus sprints fill the **Evening Reward Jar** with clinking marbles, blooming a procedural desk plant as tokens accumulate.
- **60-Second Demo Mode:** Judges can evaluate the complete product loop (Tasks → Sprint → Marble Reward → Break) in under 60 seconds via the dedicated `60s Demo` button.

---

## 🎯 Competition Division & Track Alignment

### Best New Productivity Experience ($70,000)
- **First Commit Date:** November 13, 2026 (`23bf19b`). The competition rules specify that "New Experience" entries must be conceived and built on or after September 24, 2026. DeskMate qualifies 100% as a New Experience.
- **Stage One Pass/Fail:** DeskMate is completely operable using **hands only**. Every action (creation, status advance, duration adjustment, timer start/pause, scheduling, rituals, deletion) is executable with spatial pinch, grab, or poke gestures without pairing a controller or using a physical keyboard.
- **Purposeful Passthrough:** Anchors directly to real-world desk planes detected via WebXR Plane Detection. When entering an active XR passthrough session, the virtual desk table automatically disappears so your physical tabletop becomes your actual work surface. Manual $\pm 5$cm height calibration buttons provide an instant fallback in uncalibrated or dim rooms.

---

## 🚀 Key Architectural Capabilities

### 1. Hands-Only Quick Capture (Zero Dialogs, Zero Typing)
- **Problem in VR:** Virtual keyboard typing in headsets is slow, frustrating, and prone to error. Traditional web `window.prompt` or text inputs break immersion and cause modal lockups.
- **DeskMate Solution:** A dedicated spatial Quick Capture drawer with:
  - 8 instant title chips: *Write report*, *Review brief*, *Team sync*, *Clear inbox*, *Deep study*, *Plan roadmap*, *Design sprint*, *Admin tasks*.
  - Priority toggles: *LOW*, *MEDIUM*, *HIGH*.
  - Duration quick chips (*15m*, *25m*, *45m*, *60m*) and $\pm 5$m/$\pm 15$m steppers.
  - Two-tap inline delete confirmation with 3.5s timeout (zero `window.confirm`).

### 2. Deterministic Productivity Engine
- **"What Next?" Recommendation:** Evaluates pending tasks based on active sprint status, schedule proximity, priority weighting, and short-duration momentum bonus (under 25 min) to return an optimal next action with a 1-line plain English rationale.
- **"Plan My Day" Schedule Packing:** Orders tasks by priority and duration, packing them contiguously into working hours (09:00–18:00) with 10-minute restorative breaks between sessions.
- **Conflict & Overlap Resolution:** Detects timeline collisions in real time and offers a 1-tap "Fix Overlaps" button that shifts conflicting tasks forward cleanly.
- **Overflow Backlog Drawer:** Tasks created beyond the 6 physical desk slots are held safely in a Backlog drawer and can be swapped onto the desk at any time.

### 3. Purposeful Passthrough & Anchoring
- **WebXR Plane Detection:** Scans horizontal room surfaces, scoring candidate planes based on semantic tags (`table`, `desk`), surface area, and height (0.4m–1.4m).
- **Auto-Hide Virtual Desk:** The virtual wooden table mesh renders on desktop preview / 2D fallback, but hides automatically in real XR passthrough so your physical desk is your actual desk.
- **Manual $\pm 5$cm Calibration:** Nudge buttons allow instant height micro-adjustments that persist across sessions via `localStorage`.

### 4. Co-Working Presence & Spatial Audio
- **Ghost Deskmate:** Sits peacefully across the desk with gentle procedural breathing/floating animation and subtle spatial HRTF mechanical keyboard clicks and page turns.
- **Pip Companion:** An interactive on-desk orb with eye-tracking, antenna follow, hop animations, and reactive emotional badges (*greeting*, *encouragement*, *celebration*, *nudge*).
- **Marble Reward Jar:** Focus sprints drop physical-sounding marbles (Web Audio synthesized harmonic clinks) into the jar, building tangible momentum throughout the day.
- **Desk Plant & Focus Lamp:** The focus lamp casts a focused light pool during sprints; the plant perks up and blooms as daily milestones are achieved.

---

## 🧪 Automated Testing

All pure business logic, scheduling algorithms, and recommendation heuristics are covered by automated unit tests using the native Node.js test runner (`node:test`):

```bash
npm test
```

### Test Suite Coverage:
- `formatMinuteTime`: verifies time formatting (09:00, 14:30, 00:00).
- `recommendWhatNext`: verifies completion state, active in-progress prioritization, current-hour schedule matching, and priority/momentum ranking.
- `planDaySchedule`: verifies contiguous packing, break insertion, and 18:00 capacity cutoff.
- `detectOverlaps`: identifies timeline collisions.
- `fixScheduleOverlaps`: resolves overlaps with safety buffers.

---

## 🔒 Honest Technical Disclosures (Rule R3)

- **On-Device Command Parsing:** Pip is an on-device, rule-based deterministic command parser using regular expressions and keyword intent mapping. Pip is **NOT an AI model** and does **NOT** connect to any external cloud AI provider (e.g. OpenAI, Anthropic, Gemini).
- **Privacy First:** All tasks, focus logs, and calibration data are stored exclusively in the local browser's `localStorage`. No user data, task titles, or audio transcripts are transmitted over the network.
- **WebXR APIs Used:**
  - WebXR Device API (`immersive-ar` / `immersive-vr` sessions)
  - WebXR Plane Detection Module (`XRPlane`)
  - WebXR Anchors Module (`XRAnchor`)
  - WebXR Hand Input (`hands`)
- **Speech Recognition:** Voice input uses the standard browser Web Speech API when available. When speech recognition is unavailable or denied, DeskMate smoothly guides the user to the 1-pinch quick action chips without popping up browser dialogs.
- **Testing Disclosure:** End-to-end functionality, layout geometry, hand tracking, and spatial UI have been verified in the IWSDK XR emulator and Chromium dev environment. Physical Quest 3 hardware validation should be performed by competition judges using the live deployment URL (`HUMAN-VERIFY`).

---

## 🛠️ Development & Build

### Prerequisites
- Node.js $\ge 20.19.0$
- `pnpm` $\ge 9.0.0$

---

## 🥽 Meta Quest Judge Quick-Start (100% Hands-Only)

Judges can run the entire experience on a Meta Quest 2, 3, or Pro without ever pairing or turning on controllers:

1. **Meta Quest Headset Setup:**
   - Go to **Settings → Movement tracking**.
   - Turn **Hand tracking** **ON**.
   - Put your controllers down on another table or remove their batteries.
2. **Launch DeskMate:**
   - Open **Meta Quest Browser**.
   - Navigate to the deployment URL.
   - Tap **"🥽 Enter Quest XR"** with your hand-ray pinch.
3. **60-Second Instant Evaluation:**
   - Tap **"Try 60-Second Demo"** on the Welcome panel.
   - DeskMate will immediately load tasks, pin to your desk, start an accelerated 20-second focus sprint, clink a marble into the jar, and transition into seated breathing recovery.
4. **Hands-Only Gesture Guide:**
   - **👉 Poke:** Touch any button directly with your index fingertip.
   - **🤏 Hand Ray + Pinch:** Point your hand ray at distant panels and pinch index + thumb to click.
   - **✋ Move Task Card:** Pinch and drag a card to a timeline slot (Morning, Midday, Evening) with magnetic drop.
   - **👋 Companion Touch:** Poke Pip to wiggle, or poke the Focus Lamp to toggle focus sprints.

---

### Setup & Run (Fresh Clone)
```bash
# Install dependencies
pnpm install

# Run automated unit tests
npm test

# Run TypeScript type check
pnpm run typecheck

# Build production bundle
pnpm run build

# Start local development server with managed IWER emulator
pnpm run dev
```

---

## 📄 License
This project is open-source under the MIT License.
