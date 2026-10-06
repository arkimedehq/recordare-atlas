# Third-party notices

No third-party source code is copied into this repository; one interface definition is followed (below). The built app (`dist/`, and the Docker image) bundles:

## three.js — 3-D rendering (including `examples/jsm` OrbitControls, EffectComposer, RenderPass, UnrealBloomPass)
- Source: https://github.com/mrdoob/three.js, version per `package-lock.json`
- Licence: MIT; copyright © 2010–2026 three.js authors
- Where used: `src/brain.ts` (imported as a dependency, bundled by Vite)

## opentelemetry-proto — OTLP field numbers
- Source: https://github.com/open-telemetry/opentelemetry-proto (`trace/v1/trace.proto`, `common/v1/common.proto`,
  `resource/v1/resource.proto`)
- Licence: Apache-2.0; copyright The OpenTelemetry Authors
- Where used: `server/otlp.mjs` — our own minimal decoder reads a subset of the messages using the published field
  numbers (no proto text or generated code copied)
