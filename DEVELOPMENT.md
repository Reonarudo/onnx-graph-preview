# Developing ONNX Graph Preview

How the plugin works inside, and how to build, test and release it. For using the plugin, see
[README.md](README.md).

## How it renders

Rendering runs in a Web Worker inside Obsidian, built from
[onnx-renderer](https://github.com/Reonarudo/onnx-renderer): Netron's ONNX reader, the
[Eclipse Layout Kernel](https://github.com/kieler/elkjs) (elkjs) for placement and routing, and
the renderer's drawing. Nothing is downloaded, installed or written to disk; the worker is
embedded in `main.js`, which is why `main.js` is about 2 MB (about 530 KB gzipped), most of it
ELK.

The worker starts with the first graph drawn, so a vault without onnx blocks never loads Netron
or ELK. Graphs also draw in embedded notes, hover previews, Canvas cards and exported PDFs (in
light colours). Settings appear in Obsidian's settings search. On an Obsidian
whose built-in Chromium predates `light-dark()`, graphs keep the white card in dark themes.

Works on desktop and on Obsidian's mobile apps, where the source button stays visible (there is
no hover to reveal it). Nothing in the plugin needs Node or Electron. On a phone a graph wider than
the screen keeps its natural size and scrolls sideways, so its labels stay legible. The first graph
in a session loads Netron and ELK (about 2 MB of script) into the worker, which takes a moment longer on a phone;
a large model also needs memory for ELK's layout, and the layout timeout applies as on desktop.

## Development

Requires Node 22 or newer (see `.nvmrc`).

~~~sh
npm ci
npm run lint        # tsc --noEmit
npm test            # node --test: attributes, toggle, scanner, DOM, cache, host, and the real worker bundle
npm run build       # main.js, with the worker bundle embedded
npm run vault       # link this repo into ../test-vault as an enabled plugin
npm run test:live   # a real Obsidian with a throwaway profile and vault, driven over CDP
~~~

`npm run test:live` needs Obsidian installed (`OBSIDIAN_EXECUTABLE` overrides the path); it
prints where it saved light and dark screenshots.

The renderer is pinned to a release tarball in `package.json` (`.npmrc` sets
`allow-remote=root` for npm 12). To take a new release, edit the URL, run `npm install`, check
`src/worker/entry.ts` and `src/worker/netron.ts` against the release's `src/worker.ts` and
`src/netron.ts`, check that `scripts/worker-bundle.mjs`'s note on elkjs still holds for the
elkjs version it brings, and run the tests.


## Releasing

Push a version tag (`x.y.z`, equal to the version in `manifest.json`). The release workflow in
`.github/workflows/release.yml` checks, tests and builds that commit, attests `main.js`,
`manifest.json` and `styles.css`, and publishes them as the release.
