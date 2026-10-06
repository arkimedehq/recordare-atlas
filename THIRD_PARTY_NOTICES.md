# Third-party notices

No third-party source code is copied into this repository. The built app (`dist/`, and the Docker image) bundles:

## three.js — 3-D rendering (including `examples/jsm` OrbitControls, EffectComposer, RenderPass, UnrealBloomPass)
- Source: https://github.com/mrdoob/three.js, version per `package-lock.json`
- Licence: MIT; copyright © 2010–2026 three.js authors
- Where used: `src/brain.ts` (imported as a dependency, bundled by Vite)
