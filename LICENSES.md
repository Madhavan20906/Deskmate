# Deskmate — Third-Party Licenses & Attributions
### Meta VR Start Developer Competition 2026

All code, 3D geometry, visual design, and audio synthesizer code in **Deskmate** are original or licensed under permissive open-source licenses compatible with the competition terms.

---

## 1. Project License

Deskmate is licensed under the MIT License:

```
MIT License

Copyright (c) 2026 Deskmate Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. Framework & Dependencies

| Dependency | License | Purpose |
|---|---|---|
| `@iwsdk/core` | MIT | Meta Immersive Web SDK runtime & WebXR integration |
| `@iwsdk/cli` | MIT | Developer tooling & IWER emulator management |
| `@pmndrs/uikit` | MIT | Spatial UI rendering engine |
| `@pmndrs/uikit-horizon` | MIT | Horizon design system UI kit |
| `@pmndrs/uikit-lucide` | ISC | Accessible vector interface icons |
| `three` (super-three) | MIT | WebGL / 3D graphics rendering |
| `ws` | MIT | WebSocket relay connection |
| `typescript` | Apache 2.0 | Language compiler and type checking |
| `vite` | MIT | Application bundling & development server |

---

## 3. Original Assets

- **3D Procedural Models (`src/scene-assets/`)**: All 3D assets (`desk-surface.scene-asset.ts`, `pip-companion.scene-asset.ts`, `ghost-deskmate.scene-asset.ts`, `evening-jar.scene-asset.ts`) were authored originally in procedural Three.js geometry.
- **Audio Synthesizer (`src/audio.ts`)**: All sound effects (card pickup, placement, chime bell, crystal jar ping, flower bloom, overload warning) are procedurally synthesized using the Web Audio API. No copyrighted sample packs, third-party logos, or commercial audio files are used.
