# Release verification: 0.1.2

Date: 2026-11-01. Tag `0.1.2` on commit 8537646, built and published by the release workflow:
https://github.com/Reonarudo/onnx-graph-preview/actions/runs/41310105255

## Assets

| File | Bytes | SHA-256 | Attestation |
| --- | --- | --- | --- |
| `main.js` | 2016454 | `44e3d84ad8df1ba155c2b8dbffffc199c8f03f4987f3d266cd5b8e40b0fc10a9` | verified with `gh attestation verify` |
| `manifest.json` | 383 | `7aa88263b6af9e0b1cdf2c5f89f325f58d8f9042efe3198eb768a1f0584f8a72` | verified with `gh attestation verify` |
| `styles.css` | 5144 | `e6a7563e43d3a4cc93a8ead72d7a07f08f2ba18e39a3af3142c8dfa2b985c11a` | verified with `gh attestation verify` |

The release carries only these three files.

## Checks

- In the workflow: tag matches `manifest.json` and `versions.json`; `npm ci`; `tsc --noEmit`; `npm test`
  (83 passed, 0 failed); `npm run build`.
- Downloaded assets installed in a throwaway vault in Obsidian 1.14.4: blocks draw in an embedded note (Reading view and
  Live Preview) and in Canvas text and note cards.
- `main.js` differs from 0.1.1 only in the embedded copy of this repository's `LICENSE`, which lost a trailing
  sentence so GitHub recognises it as MIT.
