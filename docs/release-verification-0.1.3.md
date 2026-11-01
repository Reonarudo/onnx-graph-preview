# Release verification: 0.1.3

Date: 2026-11-01. Tag `0.1.3` on commit 9579ab7, built and published by the release workflow:
https://github.com/Reonarudo/onnx-graph-preview/actions/runs/41311538658

## Assets

| File | Bytes | SHA-256 | Attestation |
| --- | --- | --- | --- |
| `main.js` | 2015336 | `bd5ab5163513535caa7483dcbf6c7d9f1550de12f6bf054bf53ab4dc7f96d8f4` | verified with `gh attestation verify` |
| `manifest.json` | 383 | `864c84750f323c6ec664ec6b8b7dcc67a984fa161d4a183077eb207915051b16` | verified with `gh attestation verify` |
| `styles.css` | 5144 | `e6a7563e43d3a4cc93a8ead72d7a07f08f2ba18e39a3af3142c8dfa2b985c11a` | verified with `gh attestation verify` |

## Checks

- In the workflow: tag matches `manifest.json` and `versions.json`; `npm ci`; `tsc --noEmit`; `npm test` (83 passed,
  0 failed); `npm run build`.
- Obsidian's review linter on `src/`: no findings. No `display()` method and no `!important` remain, the two
  community directory warnings on 0.1.2.
- `npm run test:live` against Obsidian 1.14.4 on the tagged tree: all checks passed.
- Downloaded assets installed in a throwaway vault in Obsidian 1.14.4: blocks draw in an embedded note.
