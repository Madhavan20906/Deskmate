# DeskMate — Meta VR Start Developer Competition 2026 Submission Package

**Track:** Best New Productivity Experience ($70,000)  
**Eligibility:** Conceived & built on November 13, 2026 (Qualifies as **New Experience**).  
**Platform:** Meta Quest WebXR (IWSDK / Three.js / Horizon UIKitML)  
**Input:** 100% Hands-Only  

---

## 1. Devpost Submission Fields

### Project Title
**DeskMate — Spatial Mixed-Reality Productivity Workspace**

### Elevator Pitch (Tagline)
*Transform your real physical desk into a calm, focused, and rewarding spatial workstation in Mixed Reality — using only your hands.*

### Track & Prizes Targeted
- **Primary:** Best New Productivity Experience ($70,000)
- **Secondary Consideration:**
  - Best First Five Minutes ($25,000)
  - Best Reason to Come Back ($25,000)
  - Best Accessibility Forward Experience ($25,000)

### About the Project

#### Inspiration
Most VR workspaces attempt to replicate 2D desktop computer monitors floating in the sky. But when you are sitting at a physical desk, a headset shouldn't just be an extra monitor — it should transform your physical environment into an intentional, distraction-free sanctuary. 

We asked ourselves: *What if your desk itself could hold your day's work physically, give you gentle co-working company, keep you grounded in real passthrough, and give you an emotional payoff every time you finish a sprint?* That vision became **DeskMate**.

#### What It Does
DeskMate anchors an interactive spatial productivity workstation directly on top of your physical desk using WebXR Plane Detection and persistent anchors.
1. **Spatial Task Management:** Six tactile 3D cards hover directly above your desk surface, placed in comfortable physical reach without blocking your vision.
2. **Hands-Only Quick Capture:** With zero virtual keyboards or browser dialogs, users pinch template chips (*Write report*, *Review brief*, *Team sync*, *Clear inbox*), set durations, and place tasks on their desk in 3 pinches.
3. **Productivity Engine:**
   - **What Next?:** A deterministic recommendation algorithm scans deadlines, in-progress work, priorities, and short-duration momentum to surface the single best task to do next with a 1-line rationale.
   - **Plan My Day:** Automatically packs tasks into working hours (09:00–18:00) with 10-minute restorative breaks between sessions.
   - **Fix Overlaps:** Detects timeline schedule collisions and shifts them cleanly forward with a single pinch.
4. **Gentle Companionship:**
   - **Ghost Deskmate:** A quiet, friendly phantom sitting across your table with subtle procedural floating and spatial HRTF keyboard typing/page-turn sounds.
   - **Pip:** A cheerful on-desk 3D companion that tracks your gaze, wiggles when poked, and guides you through morning and evening rituals.
5. **Evening Reward Jar & Garden:** Every completed sprint drops a clinking glass marble into your daily jar and nurtures a blooming procedural desk plant.
6. **60-Second Demo Mode:** Allows judges and new users to experience the full loop (task selection, sprint countdown, marble reward, and break) in under a minute.

#### How We Built It
- **Framework:** Built entirely on Meta's official **IWSDK (Immersive Web SDK)**, Three.js (`@iwsdk/core`), and Horizon UIKitML.
- **WebXR APIs:** Leverages `immersive-ar`, WebXR Plane Detection (`XRPlane`) for real desk detection, WebXR Persistent Anchors (`XRAnchor`), and WebXR Hand Tracking (`hands`).
- **Spatial Audio:** Procedural Web Audio engine with HRTF 3D spatial panner positioned on the opposite side of the desk, synthesizing mechanical typing, page turns, harmonic marble clinks, and calming chimes.
- **Zero-Allocation Render Loop:** All vector calculations, matrix transforms, and look-at targets are cached to guarantee steady 72–90 FPS without garbage collector hitches on Meta Quest hardware.
- **Pure Logic Testing:** Automated unit test suite using Node.js native test runner (`node:test`) validating all scheduling, packing, overlap resolution, and recommendation algorithms.

#### Challenges We Overcame
1. **Eliminating the Virtual Keyboard:** Typing in VR with floating keyboards is notoriously frustrating. We solved this by developing a 100% spatial Quick Capture system using preset title templates, steppers, and inline two-tap confirmations — completely removing typing from the core workflow.
2. **Physical Desk Occlusion:** In early prototypes, a virtual table mesh blocked the user's real desk in passthrough. We engineered an automatic state switcher that hides the virtual desk mesh the instant an active XR passthrough session starts, so your real table becomes the actual desk surface.
3. **Pinch Target Sizing:** Ensuring all interactive elements met or exceeded the 4cm equivalent hit-target threshold in spatial coordinates with a 300ms debounce to eliminate accidental double-pinches.

#### What We Are Proud Of
- A completely hands-only, seated experience that works flawlessly from the very first minute.
- Purposeful passthrough where the physical desk is truly the centerpiece of the experience.
- Honest, privacy-first technical architecture: zero cloud AI dependencies, zero telemetry, 100% local on-device rule parsing.

#### What We Learned
Spatial design requires rethinking productivity from the ground up. In mixed reality, physical embodiment, spatial separation of zones, and tangible audio rewards (like the marble clink) produce far more focus and satisfaction than flat 2D dashboards ever could.

#### What's Next for DeskMate
- Integration with external calendar standards (CalDAV / iCal local sync).
- Multi-user quiet co-working rooms via WebRTC where remote friends' Ghost Deskmates can sit across each other's desks.
- Customizable 3D desk plants and collectible token themes.

---

## 2. Video Demonstration Script (2 Minutes 30 Seconds)

**Tone:** Calm, clear, professional, purposeful. Seated at a real desk with Quest 3 in Passthrough.

| Timestamp | Visual on Screen | Voiceover / Narration |
| :--- | :--- | :--- |
| **0:00 - 0:20** | User seated at a real desk putting on Quest 3. Passthrough shows the real room. User opens the browser and pinches "Enter Quest XR". | *"Welcome to DeskMate. We believe the future of spatial computing isn't about floating giant browser windows in your living room — it's about making your real desk an intentional, focused sanctuary."* |
| **0:20 - 0:45** | DeskMate aligns to the table. The virtual table disappears, leaving 3D task cards, Pip, and Ghost Deskmate sitting right on the user's real desk. User shows hands pinching. | *"DeskMate anchors directly to your real desk using WebXR plane detection. Notice how our virtual desk mesh hides automatically so your real tabletop is your actual workstation. And best of all: DeskMate is 100% hands-only. No controllers, no keyboard, no typing."* |
| **0:45 - 1:10** | User pinches "+ Add Task". Quick capture drawer opens. User pinches "Review brief", pinches "HIGH", pinches "25m", and pinches "Confirm & Place on Desk". Card lands in slot. | *"Need to add a task? Forget frustrating virtual keyboards. With our spatial Quick Capture drawer, you pick a template chip, tap a duration, and place it on your desk in three simple pinches. Fast, tactile, and zero dialogs."* |
| **1:10 - 1:35** | User pinches Pip's "What next?" chip. Pip wiggles, displays recommendation badge: *"Pip recommends: 'Plan Q4 roadmap'. High-priority focus item to move the needle!"* Card border highlights in gold. | *"Not sure where to begin? Pip, our on-device assistant, evaluates your day using deterministic priority and momentum rules. One pinch on 'What next?' highlights your top priority milestone and gives a clear one-line rationale."* |
| **1:35 - 2:05** | User pinches "60s Demo". Timer starts, focus lamp lights up, Ghost Deskmate sits across the desk typing softly. Timer completes with a chime, marble drops into the jar (`clink!`), plant blooms. | *"Let's trigger our 60-second demo mode. When a focus sprint begins, the focus lamp pools light across your work, while Ghost Deskmate keeps you company across the table with subtle spatial typing sounds. When you finish, a real glass marble clinks into your evening reward jar, and your desk plant blooms."* |
| **2:05 - 2:20** | 60-second recovery break banner opens. Pip reminds user to breathe and stretch. User taps "+5cm / -5cm" calibration buttons showing desk height micro-tuning. | *"After each sprint, DeskMate offers a gentle 60-second breathing break. And if your desk is unusually high or low, our physical calibration buttons let you nudge the entire workspace by 5 centimeters at any time."* |
| **2:20 - 2:30** | Wide shot showing the clean workspace, Pip nodding, Ghost Deskmate floating gently, and the final title card. | *"DeskMate: Companionship, focus, and tangible daily progress on your real desk, using only your hands. Thank you."* |

---

## 3. Five Submission Screenshot Specifications

1. **Screenshot 1 — The Hero Shot (Seated Passthrough Workspace)**
   - **View:** First-person headset perspective looking slightly downward at a real desk in passthrough.
   - **Content:** The three active task cards hover at eye level; Pip sits on the left center; Sprint Dial on the right center; Evening Jar with 3 tokens on the left; Desk Plant in bloom and Focus Lamp on the right; Ghost Deskmate floating gently across the desk.
   - **Caption:** *"DeskMate's seated mixed-reality workstation anchored to a real desk in passthrough. 100% hands-only spatial productivity."*

2. **Screenshot 2 — Hands-Only Quick Capture Drawer**
   - **View:** Close-up of the spatial Quick Capture drawer.
   - **Content:** Shows the 8 template title chips (*Write report*, *Review brief*, etc.), priority chips (*LOW*, *MEDIUM*, *HIGH*), and duration chips (*15m*, *25m*, *45m*, *60m*) with zero virtual keyboards.
   - **Caption:** *"Zero typing, zero dialogs. Create and place tasks on your desk in 3 pinches using spatial template chips."*

3. **Screenshot 3 — The Deterministic Productivity Engine ("What Next?" & "Plan Day")**
   - **View:** Centered view of the Daily Workspace Dashboard and Timeline.
   - **Content:** Timeline showing scheduled slots (08:00–18:00) with 10-minute restorative breaks. Pip displaying the "What Next?" recommendation with a 1-line plain English rationale and the highlighted task card.
   - **Caption:** *"Deterministic 'What Next?' task recommendation and automatic 'Plan My Day' schedule packing with 10-minute restorative breaks."*

4. **Screenshot 4 — Active Focus Sprint & Ghost Deskmate Co-Working Presence**
   - **View:** Medium shot during a focus sprint.
   - **Content:** Task card active timer counting down; focus lamp illuminated; Ghost Deskmate companion sitting across the table with ambient spatial audio enabled.
   - **Caption:** *"Quiet co-working presence. Ghost Deskmate sits across your desk providing gentle spatial typing ambience during sprints."*

5. **Screenshot 5 — Tangible Evening Payoff (Reward Jar & Blooming Garden)**
   - **View:** Left-desk angle looking into the glass Evening Reward Jar.
   - **Content:** 4 glossy colorful marbles resting inside the jar; today's badge showing "4 / 4 TOKENS"; the desk plant fully bloomed in flower stage; 7-day momentum bar chart visible.
   - **Caption:** *"Tangible daily payoff. Completed focus sprints drop physical marbles into your reward jar and grow your desk plant."*

---

## 4. Prepared Competition Q&A

**Q1: Why is DeskMate entered in the "New Experience" division?**  
*Answer:* The DeskMate repository and codebase were conceived and built from scratch on November 13, 2026 (first commit `23bf19b`). The competition rules define "New Experience" as any project conceived and created on or after September 24, 2026, with no pre-existing codebase. DeskMate qualifies 100% as a New Experience.

**Q2: How does DeskMate satisfy Stage One Pass/Fail requirements?**  
*Answer:* DeskMate is strictly in the Productivity category (task management, scheduling, focus sprints, daily morning/evening rituals) and is **100% operable with hand tracking alone**. No controllers, physical keyboard, mouse, or browser modal dialogs are ever required.

**Q3: Is Pip an AI model?**  
*Answer:* No. In strict adherence to competition honesty rules, Pip is an on-device deterministic rule-based command parser using regex intent matching. No external cloud AI API is used, ensuring complete privacy, instant latency, and zero data transmission.

**Q4: How does DeskMate use Mixed Reality passthrough purposefully?**  
*Answer:* DeskMate uses WebXR Plane Detection (`XRPlane`) to find flat horizontal tabletops. Crucially, when entering an active XR passthrough session, the virtual table mesh automatically turns invisible so that the user's real physical desk becomes their actual physical work surface. Manual $\pm 5$cm height calibration buttons guarantee compatibility with any desk in any room.

**Q5: How does DeskMate achieve 60+ FPS on Meta Quest?**  
*Answer:* DeskMate enforces a strict zero-per-frame allocation policy in its ECS `update()` loop. All math vectors, quaternions, and look targets are class properties; meshes and procedural materials are reused; and particle/mesh budgets are tightly controlled.
