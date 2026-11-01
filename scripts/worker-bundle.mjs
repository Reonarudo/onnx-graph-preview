// Bundles src/worker/entry.ts for a browser Worker and returns its source, which build.mjs embeds
// in main.js. The renderer package's reader, layout and drawing (dist/*.js), its vendored Netron
// modules and their metadata are reached through `#renderer/...`, since its public `exports` name
// only the Node entry point; elkjs is resolved from the renderer package, whose dependency it is.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, 'package.json'));
export const rendererDir = dirname(require.resolve('@reonarudo/onnx-renderer/package.json'));
const rendererRequire = createRequire(join(rendererDir, 'package.json'));
export const elkPath = rendererRequire.resolve('elkjs/lib/elk.bundled.js');

const renderer = {
  name: 'renderer-files',
  setup(context) {
    context.onResolve({ filter: /^#renderer\// }, (args) => ({ path: join(rendererDir, args.path.slice('#renderer/'.length)) }));
    context.onResolve({ filter: /^elkjs\// }, (args) => ({ path: rendererRequire.resolve(args.path) }));
  }
};

export async function bundleWorker({ minify = true } = {}) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['src/worker/entry.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    minify,
    legalComments: 'none',
    loader: { '.json': 'text' },
    plugins: [renderer],
    logLevel: 'warning'
  });
  return result.outputFiles[0].text;
}
