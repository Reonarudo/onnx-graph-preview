# 0001: Render in a browser Worker built from the renderer's worker code

Status: accepted, 2026-10-31.

## Context

onnx-renderer is a Node library: `createRuntime()` starts a `node:worker_threads` Worker and
`render()` blocks on it with `Atomics.wait`. Its worker loads the vendored Netron modules by URL
(`import()` of `vendor/netron/*.js`, `readFile` of the operator metadata) and elkjs through
`createRequire`, then spends one warm-up layout before reporting ready. The VS Code extension
calls it from a synchronous markdown-it rule. An Obsidian plugin runs on the window's main thread
of Electron's renderer process.

The pikchr pilot's spike (`docs/spike-worker-threads.md` in
[pikchr-diagram-preview](../../../pikchr-diagram-preview/docs/spike-worker-threads.md)) measured,
in Obsidian 1.14.4 (Electron 43.7.7, Node 24.21.0):

- `worker_threads` loads but cannot create a Worker ("The V8 platform used by this instance of
  Node does not support creating Workers"), so the library's runtime cannot start.
- `ELECTRON_RUN_AS_NODE` is fused off, so the plugin cannot fork Obsidian as a Node host.
- A browser `Worker` started from a blob URL runs an esbuild bundle of a renderer's worker code.

The spike found the other renderers' worker-side Node use to be asset location only, which
bundling resolves by embedding. For onnx-renderer that held, with one surprise (below). The
alternatives were a system Node 22+ spawned as a host process (every user must install Node) and
adding a browser entry to each renderer package. The user chose the browser Worker bundle, built
by the plugin, for all plugins.

## Decision

- `src/worker/entry.ts` ports the renderer's `dist/worker.js`: the same `renderModel`
  (imported from the installed package's `dist/render.js`), the same ELK build constructed the
  same way, the same warm-up graph before reporting ready, the same output limit and wording.
  `Buffer.byteLength` becomes a `TextEncoder` byte count.
- `src/worker/netron.ts` replaces only the renderer's `loadNetron`: the five Netron modules are
  imported statically and the metadata JSON is embedded as text (esbuild's text loader), giving
  the reader the same object. Netron's code is untouched.
- elkjs is resolved from the renderer package, whose dependency it is; the plugin lists it too, at
  the exact version the renderer pins, so npm keeps one copy (a test checks they agree).
  `elk.bundled.js` contains
  ELK's own worker script, which, seeing `self` and no `document`, claims `self.onmessage` as if
  it were a dedicated ELK worker and exports no in-thread worker, so `new ELK()` fails ("the ONNX
  layout engine could not start"; checked by bundling without the fix). `src/worker/entry.ts`
  makes a `document` exist on the worker's global object (`self`) only while it constructs ELK, which sends ELK down the branch
  it takes in Node (the in-thread fake worker the library uses), and removes it straight after.
  elkjs itself ships unmodified, as the SPICE plugin does it.
- `scripts/build.mjs` embeds the minified bundle in `main.js` as a string, started from a blob
  URL. The worker answers with `postMessage` instead of the library's SharedArrayBuffer protocol:
  rendering is asynchronous in Obsidian, so the shared buffer bought nothing.
- `src/host.ts` ports `createRuntime` with the library's option and input validation, defaults
  (3 s per layout, 10 s start-up including the warm-up, 1 000 000 characters, 1000 nodes,
  4 MiB output), its `direction` and source-length checks before the worker sees a fence, its
  wording and its recovery (terminate on timeout or a discarded engine, fresh worker on the next
  render). Renders are queued, one at a time, on one worker.
- The host, and with it the worker and its blob URL, is created by the first graph drawn, not
  when the plugin loads. The layout timeout is taken once per host, as the library takes it once
  per runtime; changing the setting disposes the host and its cache, and the next graph starts a
  fresh one.
- The renderer package stays untouched and is still the dependency, pinned to its release
  tarball; its version in `package.json` decides the reader, layout and drawing that ship.

## Consequences

- No Node, no files written, nothing extracted: `main.js`, `manifest.json` and `styles.css` are
  the whole plugin, as Obsidian's community install expects. The cost is size: `main.js` is about
  2.0 MB (530 KB gzipped), of which elkjs is about 1.6 MB.
- Measured in Obsidian 1.14.4: a fresh worker reports ready (Netron loaded, ELK constructed, one
  warm-up layout) in about 180 to 250 ms; small graphs then lay out in under 70 ms.
- A browser Worker has no heap cap like the library's `resourceLimits` (256 MB); a runaway layout
  is stopped only by the time limit.
- Unlike the VS Code extension, a setting change does not keep the old worker drawing until the
  new one is ready; blocks drawn in that quarter second wait for the new worker instead.
- The plugin's worker entry must be kept in step with the renderer's `worker.ts` and
  `netron.ts` when the renderer changes, and the ELK construction with the elkjs version it brings;
  `test/worker.test.ts` runs the embedded bundle (under a prelude that makes `self` the global
  object, as in a browser Worker, which reproduces the elkjs trap) against the real reader and layout.
- `isDesktopOnly` stays `true` until the plugin is tried on mobile, although nothing in it
  needs Node or Electron.
