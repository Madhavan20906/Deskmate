# DeskMate — Mixed-Reality Spatial Productivity Workspace

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Platform: Meta Quest WebXR](https://img.shields.io/badge/Platform-Meta%20Quest%203%20%7C%20WebXR-brightgreen.svg)](https://www.meta.com/quest/)
[![Framework: IWSDK + Three.js](https://img.shields.io/badge/Engine-IWSDK%20%7C%20Three.js%20%7C%20elics-blueviolet.svg)](https://iwsdk.dev/)
[![Tests: 76 Passing Suite](https://img.shields.io/badge/Tests-76%20Passing%20(100%25)-success.svg)](./tests)
[![Golden Benchmarks: 275 Tests](https://img.shields.io/badge/Golden%20Tests-275%20Passing-success.svg)](./tests/brain-golden.test.ts)
[![Meta VR Start: Competition 2026](https://img.shields.io/badge/Meta%20VR%20Start-Developer%20Competition%202026-orange.svg)](https://start-developer-competition-26.devpost.com/)

> **The Premier Spatial Productivity Workstation in Mixed Reality**  
> Built for **Meta Quest 3**, **Meta Quest Pro**, and **Meta VR Glasses** via WebXR.  
> Engineered from the ground up for the **Meta VR Start Developer Competition 2026 (Productivity Track — New Experience Division)** with a **Dual-Mode Interaction Model**: **100% Hands-First Direct Physical Manipulation** paired with an ambient **Hands-Off Voice AI & Autonomous Companion System**.

---

## 🏆 Meta VR Start Developer Competition 2026 Alignment

| Category | Specification |
|---|---|
| **Track** | **Productivity** (Spatial multi-panel workspace, task management, focus sprint studio, workload capacity analyzer) |
| **Division** | **New Experience** (Conceived and built cleanly from a blank slate during the competition window) |
| **Primary Interaction** | **Hands-First** (Zero controller dependency; hands tracking engaged automatically on session launch) |
| **Ergonomic Design** | **Seated Desk Ergonomics** (Seated reach envelope $\le 0.65$m; real tabletop plane alignment; passthrough-native) |
| **AI Tooling & Platform** | **Multimodal Gemini 3.5 AI + Meta VR CLI + IWSDK (Immersive Web SDK)** |
| **Verification & Quality** | **76 Automated Tests (100% Passing)** + **275 Golden Brain Utterance Benchmarks** + **18-Step Walkthrough Harness** |

---

## 📑 Table of Contents

1. [Executive Summary & Product Vision](#-executive-summary--product-vision)
2. [Dual-Mode Architecture: Hands-First & Hands-Off](#-dual-mode-architecture-hands-first--hands-off)
   - [Hands-First Architecture: Direct Spatial Manipulation](#1-hands-first-architecture-direct-spatial-manipulation)
   - [Hands-Off Architecture: Ambient Voice & Autonomous Action](#2-hands-off-architecture-ambient-voice--autonomous-action)
3. [System Architecture & Data Flow](#-system-architecture--data-flow)
   - [Architectural Topology Diagram](#architectural-topology-diagram)
   - [Hands-First Spatial Interaction Pipeline](#hands-first-spatial-interaction-pipeline)
   - [Hands-Off Voice Action Pipeline](#hands-off-voice-action-pipeline)
4. [In-Depth Feature Catalog (All Modules)](#-in-depth-feature-catalog-all-modules)
   - [1. Spatial Glass Command Center (Central Hub)](#1-spatial-glass-command-center-central-hub)
   - [2. Interactive Tasks & Multi-Week Calendar Navigation](#2-interactive-tasks--multi-week-calendar-navigation)
   - [3. Focus Sprint Studio & Pomodoro Timer](#3-focus-sprint-studio--pomodoro-timer)
   - [4. Today's Schedule & 15-Minute Snapping Timeline Track](#4-todays-schedule--15-minute-snapping-timeline-track)
   - [5. Workload Capacity Donut & Cognitive Load Analyzer](#5-workload-capacity-donut--cognitive-load-analyzer)
   - [6. Pip 3D Robot Companion & Productivity Garden](#6-pip-3d-robot-companion--productivity-garden)
   - [7. In-Place Task Editor & Priority Matrix](#7-in-place-task-editor--priority-matrix)
   - [8. Spatial Notes Scratchpad & Quick Capture](#8-spatial-notes-scratchpad--quick-capture)
   - [9. Spatial Desk Ruler & Tabletop Physics](#9-spatial-desk-ruler--tabletop-physics)
   - [10. Dual Active Ray Pointers & Reticle Indicators](#10-dual-active-ray-pointers--reticle-indicators)
   - [11. Multi-Day Task Distribution & Cross-Day Scheduling](#11-multi-day-task-distribution--cross-day-scheduling)
   - [12. Multi-Step Undo Engine & Transaction Reversibility](#12-multi-step-undo-engine--transaction-reversibility)
   - [13. Ambient Procedural Co-Working Audio (Ghost Deskmate)](#13-ambient-procedural-co-working-audio-ghost-deskmate)
5. [Resilience & Tab-Switching Architecture](#-resilience--tab-switching-architecture)
6. [Technical Stack & Design Decisions](#-technical-stack--design-decisions)
7. [Automated Testing & Golden Verification Suites](#-automated-testing--golden-verification-suites)
8. [Installation & Development Guide](#-installation--development-guide)
9. [Deployment & Production PWA Packaging](#-deployment--production-pwa-packaging)
10. [License](#-license)

---

## 🌟 Executive Summary & Product Vision

**DeskMate** transforms any physical desk or tabletop into an ergonomic, distraction-free spatial productivity operating system in Mixed Reality.

Traditional VR productivity applications consistently suffer from two major friction points:
1. **Controller Clutter & Fatigue:** Requiring bulky handheld controllers forces users to put down physical pens, notebooks, coffee mugs, and keyboards every time they need to interact with a virtual panel.
2. **Virtual Keyboard Frustration:** Floating air-typing keyboards in 3D space are notoriously sluggish, prone to phantom clicks, physically tiring, and break mental concentration.

DeskMate solves both bottlenecks through an integrated **Dual-Mode Ergonomic Philosophy**:

```
+-----------------------------------------------------------------------------+
|                            DESKMATE WORKSPACE                               |
|                                                                             |
|      [HANDS-FIRST]                             [HANDS-OFF]                  |
|   Direct Physical Spatial Touch            Ambient Voice & Autonomy         |
|   - Zero controller dependency             - Multimodal Gemini 3.5 voice AI |
|   - Automatic hands mode on launch         - Multi-day task scheduling      |
|   - Tabletop physical ruler snap           - Autonomous Pip 3D companion    |
|   - 15-minute magnetic timeline grid       - Proactive "Plan My Day" engine |
|   - Zero virtual keyboard typing           - Hands-free task edits & deletes|
|   - High-contrast, scalable glass UI       - Ambient co-working audio       |
+-----------------------------------------------------------------------------+
```

When users want to touch, browse, and organize their desk, **Hands-First** delivers immediate, haptic-feeling direct spatial interactions. When users are engrossed in physical deep work, sketching, or typing, **Hands-Off** provides seamless voice-driven agenda planning, task completion, schedule adjustments, and timer manipulation without moving their hands from their keyboard or desk.

---

## 🖐️ Dual-Mode Architecture: Hands-First & Hands-Off

### 1. Hands-First Architecture: Direct Spatial Manipulation

DeskMate’s Hands-First architecture is engineered around **zero-controller direct spatial touch**:

- **Automatic Hands-First Launch:** When opened on Meta Quest or desktop emulation, DeskMate defaults straight into hand tracking mode with visible hand models, cleanly tucking away virtual controllers so your real hands are ready immediately.
- **Seated Reach Envelope ($\le 0.65$m Radius):** Every interactive button, stepper, panel handle, task row, and slider is mathematically constrained within comfortable seated reach without requiring torso leaning or standing up.
- **Physical Desk Alignment (WebXR Passthrough & Plane Detection):** Detects real-world horizontal tabletop planes (`table`, `desk`). When entering XR passthrough, the virtual wooden table mesh automatically hides, making your actual physical desk the natural anchor for the workspace.
- **Magnetic Snapping (15-Minute Grid):** Task tiles and schedule blocks snap magnetically to 15-minute intervals ($09:00, 09:15, 09:30, \dots$) with subtle audio tick feedback and translucent preview landing ghosts.
- **Dual Visual Pointer Beams & Reticles:** Both left and right hands project soft laser guide beams (Cylinder geometry with 8-segment tessellation) terminating in clean circular reticle rings on glass panels, enabling simultaneous dual-hand interaction.
- **Spatial Panel Dragging & Billboard Yaw:** Users can grab any glass panel by its top handle bar to freely reposition it in 3D space. As panels move, they smoothly billboard their yaw angle toward the user’s eyes for optimal legibility.
- **High-Contrast Typography & Sizing:** Clean, high-legibility font sizes (14px–22px) ensure crisp, effortless reading both inside Quest VR optics and on desktop preview screens.

### 2. Hands-Off Architecture: Ambient Voice & Autonomous Action

The Hands-Off architecture eliminates the need to reach out or touch screens during deep focus sessions:

- **Multimodal Gemini 3.5 Flash Lite Assistant:** Integrated with the Gemini API to interpret natural conversational voice commands into structured JSON workspace mutations (`add_task`, `delete_task`, `edit_task`, `complete_task`, `start_focus_timer`, `plan_day`, `navigate_view`).
- **Autonomous Pip 3D Robot Avatar:** Floats smoothly beside the Command Center with a 60fps physical bobbing animation, counter-rotating metallic rings, and emotive state transitions (*idle*, *thinking*, *celebrating*).
- **Proactive Day Planning ("Plan My Day"):** Automatically sorts unscheduled tasks by priority and duration, packing them contiguously into working hours ($08:00\text{--}18:00$) with mandatory 10-minute restorative buffers.
- **Conflict & Overlap Healing ("Fix Overlaps"):** Analyzes the timeline in real time; when overlapping tasks are detected, conflicting items are automatically pushed to the nearest free time slot.
- **Natural Spoken Feedback (TTS):** Responses are delivered through the browser Speech Synthesis API using natural, high-clarity human-like voices, confirming actions aloud without requiring visual verification.
- **Deterministic Offline Fallback:** If offline or if cloud APIs are unreachable, DeskMate seamlessly switches to its local deterministic regex parser and RuleBrain engine without dropping user commands.

---

## 🏛️ System Architecture & Data Flow

### Architectural Topology Diagram

```mermaid
graph TD
    subgraph Client [WebXR Runtime Client]
        HTML[index.html & Canvas Container]
        IWER[IWER WebXR Emulator / Meta Quest Browser]
        Three[super-three WebGL Renderer]
    end

    subgraph Core [DeskMate Core ECS Engine]
        World[IWSDK World Instance]
        PanelSys[PanelSystem: Spatial UI & Event Dispatch]
        WorkSys[WorkspaceSystem: Plane Alignment & Anchors]
    end

    subgraph UI [UIKitML Glass Panels]
        HubUI[glass-hub.uikitml: Command Center]
        TasksUI[glass-tasks.uikitml: Calendar & Agenda]
        PipUI[glass-pip.uikitml: AI Companion & Garden]
        FocusUI[glass-focus.uikitml: Timer & Habits]
    end

    subgraph State [Reactive State & Persistence]
        TaskStore[Task State: GlassTask Collections]
        UndoEngine[Transactional UndoStack: 8s Window]
        LocalStorage[Local Browser Storage: deskmate.tasks.v1]
    end

    subgraph VoiceAI [Hands-Off Voice Pipeline]
        SpeechRec[Web Speech API: SpeechRecognition]
        Gemini[Gemini 3.5 Flash Lite API: Action Formulation]
        RuleBrain[RuleBrain Deterministic Planner: Fallback Engine]
        TTS[SpeechSynthesis Engine: Audio Spoken Feedback]
    end

    IWER --> World
    World --> PanelSys
    World --> WorkSys
    PanelSys --> HubUI
    PanelSys --> TasksUI
    PanelSys --> PipUI
    PanelSys --> FocusUI
    PanelSys <--> TaskStore
    TaskStore <--> UndoEngine
    TaskStore <--> LocalStorage
    SpeechRec --> Gemini
    Gemini -.->|Cloud API| TaskStore
    SpeechRec -.->|Offline Fallback| RuleBrain
    RuleBrain --> TaskStore
    TaskStore --> TTS
```

### Hands-First Spatial Interaction Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor User as User Hand / Ray
    participant Ray as PointerRaycaster
    participant UI as UIKitML Element
    participant Panel as PanelSystem
    participant Store as Task State Store
    participant Audio as Web Audio Synthesizer

    User->>Ray: Direct Touch or Pinch Target
    Ray->>UI: Intersect Element Boundary
    UI->>Panel: Trigger Action Callback
    Panel->>Audio: Play Hover Hum / Pinch Tick
    Panel->>Store: Mutate Task / Timeline State
    Store->>Store: Record Undo Snapshot (8s Window)
    Panel->>UI: Reactive setProperties Update (Color, Width, Margin)
```

### Hands-Off Voice Action Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor User as User Voice
    participant Mic as SpeechRecognition
    participant Panel as PanelSystem
    participant Cloud as Gemini 3.5 Flash Lite
    participant Brain as RuleBrain Fallback
    participant Store as State Store
    participant TTS as SpeechSynthesis Utterance

    User->>Mic: "Pip, schedule Team Sync on Thursday at 2 PM for 45 minutes"
    Mic->>Panel: Stream Transcript
    alt Gemini API Available
        Panel->>Cloud: System Prompt + Workspace State + Transcript
        Cloud-->>Panel: JSON { actions: [add_task], reply: "Scheduled Team Sync..." }
    else Offline / Fallback
        Panel->>Brain: parseVoiceTaskCommand(transcript)
        Brain-->>Panel: Parsed Task Mutation Object
    end
    Panel->>Store: Commit Task Mutation
    Panel->>Panel: Refresh Hub, Timeline & Tasks UI
    Panel->>TTS: Speak Natural Confirmation Aloud
    TTS-->>User: Spoken Audio Response
```

---

## 📦 In-Depth Feature Catalog (All Modules)

### 1. Spatial Glass Command Center (Central Hub)
- **Architectural Dimensions:** $780\text{px} \times 720\text{px}$ curved translucent glass panel with $24\text{px}$ border radius and subtle specular borders (`rgba(255, 255, 255, 0.18)`).
- **Navigation Tabs:** Overview, Schedule, Notes, and Goals subviews with instantaneous in-place switching.
- **Dynamic Header:** Displays live digital clock, formatted calendar date, anonymous personalized greetings based on time of day, and workload summary metrics.
- **Unified Section Zoom:** Any widget card can be zoomed in-place to occupy the primary viewing area, with an instant "Back to Overview" pill button.

### 2. Interactive Tasks & Multi-Week Calendar Navigation
- **Multi-Week Date Strip & Full 31-Day Month Picker:** 7-day responsive calendar picker with dedicated navigation buttons ($\ll, \gg$) and active date highlighting, plus an interactive 31-day Monthly Calendar subview.
- **Instant Day Synchronization:** Clicking any date in the calendar immediately updates the Main Dashboard schedule, timeline blocks, workload donut, and tasks to that specific date.
- **Task Filtering:** Instant 1-tap categorization by priority (*All*, *High*, *Med*, *Low*).
- **Clean Task Rows & Empty States:** Clean text rows with priority badges, checkmarks, and instant Delete buttons. When a day has no tasks, a clean "No tasks scheduled for this day" state is displayed with zero placeholder clutter.

### 3. Focus Sprint Studio & Pomodoro Timer
- **Dedicated Sprint Controls:** Features dedicated **Start**, **Stop** (pause), and **Reset** buttons. Clicking Reset cleanly restores the timer to its set duration.
- **Instant Access:** One-tap launch directly from the **Settings** gear on the Focus Session card, or via the `> Focus` button under Quick Add.
- **Ring Visualization:** Mathematical progress ring displaying remaining sprint time with dynamic color shifts.
- **Quick Preset Chips:** Instant sprint duration chips ($5\text{m}, 15\text{m}, 25\text{m}, 45\text{m}, 60\text{m}$).
- **Fine-Grained Adjustments:** Incremental $\pm 1\text{m}$ and $\pm 5\text{m}$ steppers for precise session tuning.
- **Sprint Modes:** Seamless toggling between *Focus Sprint*, *Short Break* ($5\text{m}$), and *Long Break* ($15\text{m}$).
- **Completion Rewards:** Completing a sprint awards $+30\text{ XP}$ to the Productivity Garden and triggers Pip’s celebratory dance.

### 4. Today's Schedule & 15-Minute Snapping Timeline Track
- **10-Hour Timeline Axis:** Accurately graduated axis spanning $08:00\text{ to }18:00$ with 11 clear hourly ticks ($8\text{ AM}, 9\text{ AM}, 10\text{ AM}, 11\text{ AM}, 12\text{ PM}, 1\text{ PM}, 2\text{ PM}, 3\text{ PM}, 4\text{ PM}, 5\text{ PM}, 6\text{ PM}$).
- **True Time-Slot Placement:** Schedule blocks are positioned along the track corresponding strictly to their scheduled start time on the active day, preventing artificial overlapping or stacked trains.
- **Enlarged High-Contrast Block Typography:** Generous 50px-high blocks with 13px bold titles and 11px time indicators, ensuring easy legibility inside headsets.
- **Real-Time Sun "Now" Marker:** An animated purple badge indicating the exact current time of day, positioned dynamically along the timeline track.
- **Direct Block Interaction:** Touching any schedule block triggers the in-place editor, allowing start time and duration adjustments on the fly.

### 5. Workload Capacity Donut & Cognitive Load Analyzer
- **Multi-Segment Capacity Ring:** Visualizes the distribution of scheduled hours versus available daily capacity ($480\text{ minutes / 8 hours}$).
- **Capacity Metric Calculation:**
  $$\text{capacityPercentage} = \text{round}\left(\frac{\sum \text{scheduledMinutes}}{\text{dailyCapacityMinutes}} \times 100\right)$$
- **Cognitive Overload Warning:** Automatically detects when scheduled work exceeds 100% capacity and displays visual warning badges with recommendations to reschedule non-critical items.

### 6. Pip 3D Robot Companion & Productivity Garden
- **Procedural 3D Robot Mesh:**
  - Torso sphere and hovering head with continuous $60\text{fps}$ sinusoidal bobbing.
  - Dual counter-rotating metallic gimbal rings ($0.8\text{ rad/s}$ outer ring, $-1.1\text{ rad/s}$ inner ring).
  - Glowing emissive cyan eye visor.
- **Reactive Emotional States:**
  - `idle`: Calm breathing movement.
  - `thinking`: Antenna tilt and accelerated ring rotation during voice processing.
  - `celebrate`: Joyful vertical hops and high-speed counter-rotation upon task completion.
- **Productivity Garden:** Gamified progression track awarding XP for completed sprints and tasks, advancing through developmental milestones (*Sprout*, *Seedling*, *Flowering Plant*, *Productivity Tree*).

### 7. In-Place Task Editor & Priority Matrix
- **Zero-Modal Architecture:** The editor expands seamlessly within the Command Center, avoiding detached floating dialogs.
- **Duration Sliders & Steppers:** Real-time visual steppers with $\pm 5\text{m}$ and $\pm 15\text{m}$ increments.
- **Priority Matrix:** 3-state selector (*High* in crimson, *Medium* in amber, *Low* in azure blue).
- **Scheduled Time Picker:** Fine-tuning of scheduled start minutes snapped to the 15-minute grid.
- **Two-Tap Deletion:** Built-in safety confirmation requiring a second tap within $3.5\text{ seconds}$ to prevent accidental task loss.

### 8. Spatial Notes Scratchpad & Quick Capture
- **Rapid Spatial Capture:** Instant "+ Quick Note" addition for fleeting thoughts, architecture reminders, and deep work ideas.
- **Clean Note Rows:** Solid, readable typography with dedicated Delete buttons per note.
- **Persistent Scratchpad:** Full localStorage persistence keeping notes synced across app reloads and headset sessions.

### 9. Spatial Desk Ruler & Tabletop Physics
- **Physical 3D Ruler Model:** Modeled in Three.js and rendered directly on the detected tabletop surface.
- **Translucent Placement Ghosts:** Grabbing a task tile displays a semi-transparent ghost at the nearest valid 15-minute slot before release.
- **Push-to-Make-Room Algorithm:** Dropping a task into an occupied slot shifts subsequent tasks forward cleanly, preserving scheduled durations without collisions.

### 10. Dual Active Ray Pointers & Reticle Indicators
- **Left & Right Ray Parity:** Simultaneous raycasting enabled for both hands.
- **Pointer Beam Visuals:** Laser cylinder meshes scaled along the pointer axis to terminate precisely at panel collision points.
- **Specular Reticles:** Flat circular ring cursors aligned parallel to the panel surface, expanding slightly upon hover.
- **Desktop Emulation Switcher:** Complete pointer parity in desktop browsers via Tab key, on-screen HUD toggle, or automatic screen-half pointer routing.

### 11. Multi-Day Task Distribution & Cross-Day Scheduling
- **Month-Wide Task Management:** Tasks can be assigned to any date in the calendar month ($1\text{st}\text{--}31\text{st}$).
- **Conversational Voice Multi-Day Routing:** Commands such as *"Pip, add team sync on Thursday at 2 PM"* or *"Schedule gym tomorrow for 45 minutes"* are intelligently parsed and routed to their respective calendar days.
- **Week-At-A-Glance Aggregation:** The Week view summarizes daily task counts and total scheduled hours across all 7 days of the active week.

### 12. Multi-Step Undo Engine & Transaction Reversibility
- **Snapshot-Based Undo Stack:** Stores full serialized workspace state snapshots up to 5 levels deep.
- **8-Second Grace Window:** An ambient undo banner appears at the bottom of the Command Center with an animated countdown after every destructive action.
- **Complete Reversibility:** Tapping "Undo" instantly restores the previous state, re-synchronizes the UI, and persists the reversal to `localStorage`.

### 13. Ambient Procedural Co-Working Audio (Ghost Deskmate)
- **Spatial Audio Panning:** Positioned at $+0.7\text{m}$ right and $-0.6\text{m}$ forward using Web Audio API HRTF spatial panners.
- **Procedural Sound Generation:** Periodic randomized mechanical keyboard clicks (clusters of $3\text{--}7$ keypresses) and gentle paper page turns.
- **Dynamic Volume Ducking:** Ambient volume automatically reduces by 75% during active focus sprints to preserve concentration.

---

## 🛡️ Resilience & Tab-Switching Architecture

In browser-based WebXR applications, switching browser tabs frequently causes WebGL contexts and Web Speech APIs to lock up. DeskMate implements an **Enterprise-Grade Visibility Recovery Lifecycle**:

```
[User Switches Tab Away (document.hidden = true)]
   │
   ├── 1. Speech Recognition cleanly stops without throwing unhandled abort errors.
   ├── 2. Active panel dragging is terminated; coordinates persist safely.
   ├── 3. Controller button values on IWER devices are re-zeroed to prevent stuck clicks.
   └── 4. Timers and clock tickers pause gracefully.
   
[User Returns to Tab (document.visibilityState = visible)]
   │
   ├── 1. AudioContext checks its state and calls resume() safely.
   ├── 2. WebGL renderer re-evaluates device pixel ratio and forces clean frame draw.
   ├── 3. Stuck SpeechSynthesis utterances are cancelled with cancel().
   ├── 4. Seated tabletop XR pose and hand ray orientations are re-enforced.
   └── 5. Immediate tickSecond() invocation re-synchronizes clock and task timers.
```

---

## 💻 Technical Stack & Design Decisions

| Layer | Technology | Purpose |
|---|---|---|
| **Core Framework** | `@iwsdk/core` (1.1.0-rc.2) | WebXR scene management, lifecycle, and component architecture |
| **3D Graphics Engine** | `super-three` (0.185.0) | WebGL rendering, custom materials, lighting, and spatial transforms |
| **UI Component System** | `@pmndrs/uikit` + `@drawcall/uikitml` | Flexbox-backed 3D spatial user interface panels |
| **ECS Runtime** | `elics` (3.4.1) | Entity-Component-System architecture for high-frequency updates |
| **Language** | TypeScript 5.5 | Strictly typed codebase with zero-warning compilation |
| **Bundler & Dev Server** | Vite 7.3 | Ultra-fast HMR and optimized production asset chunking |
| **Voice Intelligence** | Google Gemini 3.5 Flash Lite | High-speed multimodal voice utterance parsing and action dispatch |
| **Audio Synthesis** | Web Audio API + HRTF Panners | Spatialized procedural mechanical keyboard clicks and haptic ticks |

---

## 🧪 Automated Testing & Golden Verification Suites

DeskMate features a comprehensive automated test suite executed with Node.js native test runner:

```bash
npm test
```

### Test Suite Summary: 76 Passing Tests (100% Pass Rate)

1. **Action Layer Tests (5 Tests):**
   - Create, update, complete, and undo roundtrip validation.
   - Schedule move, resize, swap, and boundary clamping.
   - Transaction atomicity and inverse mutation generation.
   - Audit event logging with actors and timestamps.
   - Property-based fuzzing across 1,000 random action sequences.

2. **Phase 2 Golden Brain Suite (275 Golden Tests):**
   - 40 Query intents.
   - 25 Meta & settings commands.
   - 35 Focus timer commands.
   - 40 Bulk task actions.
   - 40 Move and reschedule commands.
   - 40 Task creation utterances.
   - 20 UI section navigation requests.
   - 35 Adversarial utterances.

3. **Spatial UI & Ergonomics Suite (15 Tests):**
   - Panel grab, move, and arc magnetic snapping parity.
   - Poke & select parity across all controls.
   - In-place task editing and 2-tap deletion confirmation.
   - Drag-and-drop task scheduling with 15-minute snapping.
   - Schedule block resize with push-to-make-room collision handling.
   - Focus timer controls and animation states.
   - Dual active pointer beams and white reticle tracking.
   - Anonymous greeting and interactive modules.
   - Multi-week calendar picker and header subviews.
   - Pip robot voice command parser and spatial avatar interactions.

4. **Pure View-Model & Heuristic Tests (11 Tests):**
   - `tasksToRowViewModels`: formatting and priority badge generation.
   - `tasksToScheduleBlocks`: proportional positioning and minimum touch width.
   - `calculateWorkloadDonut`: capacity utilization and overload detection.
   - `calculateGardenProgress`: XP thresholds and milestone unlocking.
   - `greeting`, `clock`, `now-marker`, and `focus ring` view-models.
   - `snapTo15` and `clampWorkdayRange` mathematical logic.
   - `UndoStack` 5-step depth and persistence roundtrip.

5. **18-Step Hands-Only Walkthrough Harness:**
   - Full end-to-end simulation covering session entry, tabletop calibration, Pip query, Quick Capture, schedule packing, focus sprint, pause/resume, reward marble drop, guided break, evening shutdown recap, tile drag & snap, tile resize, conflict resolution, overflow partitioning, and reload persistence.

---

## 🚀 Installation & Development Guide

### Prerequisites
- Node.js $\ge 20.0.0$
- pnpm or npm

### Installation
```bash
# Clone the repository
git clone https://github.com/your-username/deskmate.git
cd deskmate

# Install dependencies
npm install
```

### Running Locally
```bash
# Start the IWSDK development server with managed browser and XR emulation
npm run dev
```

### Type Checking & Testing
```bash
# Verify TypeScript compilation (0 errors)
npm run typecheck

# Run complete automated test suite (76 tests pass)
npm test
```

---

## 🌐 Deployment & Production PWA Packaging

DeskMate is production-optimized for deployment on **Vercel** and direct execution inside the **Meta Quest Browser**:

```bash
# Build optimized production bundle
npm run build
```

### Meta Quest Browser Launch Instructions
1. Open the **Meta Quest Browser** on your Meta Quest 3, Quest Pro, or Meta VR Glasses.
2. Navigate to your deployed production URL (e.g. `https://deskmate.vercel.app`).
3. Tap the **🥽 Enter Quest XR** button at the bottom of the screen.
4. Set down your physical controllers on your desk.
5. Hand tracking engages automatically — interact directly using natural hand touch, pinch, and voice!

---

## 📄 License

This project is licensed under the terms of the **MIT License**.  
See the [LICENSE](./LICENSE) file for full details.

Copyright © 2026 DeskMate Project Contributors. All rights reserved.
