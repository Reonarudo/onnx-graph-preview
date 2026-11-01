# Release verification: 0.1.0 (pre-release)

Date: 2026-11-01. Tag `0.1.0` on commit 5f634f8. GitHub pre-release:
https://github.com/Reonarudo/onnx-graph-preview/releases/tag/0.1.0

## Assets

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `main.js` | 2016544 | `7e0cb89e230f4a13507b8ca6e1f88e59394d8c652301ae5d4ff85538e162eacc` |
| `manifest.json` | 382 | `5f626785eebb92b1a11105a736b5b2d00be8de1e0d786144deff7c27f3518983` |
| `styles.css` | 5144 | `e6a7563e43d3a4cc93a8ead72d7a07f08f2ba18e39a3af3142c8dfa2b985c11a` |

Desktop only: no (desktop and mobile). Minimum Obsidian version: 1.5.0.

## Checks on the tagged tree

- `npm run lint` (tsc): clean.
- Obsidian's review linter (`eslint-plugin-obsidianmd` 0.4.2, recommended config) on `src/`: no errors, no warnings.
- `npm test`: 83 passed, 0 failed.
- `npm run test:live` against Obsidian 1.14.4: 23 live checks passed.

## The published assets

- Downloaded with `gh release download 0.1.0` into an empty directory; `shasum -a 256 -c SHA256SUMS`: all OK; `main.js`
  byte-identical to the build from the tagged tree.
- Installed into a throwaway vault in Obsidian 1.14.4 with a throwaway profile: blocks draw, with captions, in an embedded
  note (Reading view and Live Preview) and in Canvas text and note cards.

## Not yet verified

- On real phones (iOS, Android) through BRAT.

## Promotion

2026-11-01: promoted from pre-release to release, same tag and the same assets (no rebuild).
