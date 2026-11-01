// The render worker, bundled for a browser Worker by scripts/worker-bundle.mjs and embedded in
// main.js. A port of onnx-renderer's dist/worker.js: the same Netron reader, the same ELK build
// in the same in-thread mode, the same `renderModel`, the same warm-up and output limit,
// answering over postMessage instead of shared memory.
import ELK from 'elkjs/lib/elk.bundled.js';
import { renderModel } from '#renderer/dist/render.js';
import type { RenderResult } from '@reonarudo/onnx-renderer';
import { loadNetron } from './netron';
import type { Reply, Request, Started } from '../protocol';

/**
 * ELK's bundled build, laying out in this thread as it does under Node, with elkjs unmodified.
 * Its layout code, loaded on the first `new ELK()`, looks for `document` and `self`: with `self`
 * and no `document` it decides it *is* ELK's web worker, takes over `self.onmessage` and offers
 * no in-thread worker, so the constructor fails. For that one construction a `document` is made
 * to exist, which sends it down the path it takes under Node; it is removed straight after.
 */
function createElk(): InstanceType<typeof ELK> {
  // `self` is the worker's global object, where a free `document` is looked up.
  const global = self as unknown as { document?: unknown };
  const had = 'document' in global;
  if (!had) global.document = {};
  try {
    return new ELK();
  } finally {
    if (!had) delete global.document;
  }
}

interface Scope {
  onmessage: ((event: { data: Request }) => void) | null;
  postMessage(message: Started | Reply): void;
}
const scope = self as unknown as Scope;

type Job = Omit<Request, 'id'>;

const WARM_UP = '<ir_version: 8, opset_import: ["" : 17]>\nwarm (float[1] x) => (float[1] y) { y = Relu (x) }';

async function start(): Promise<(job: Job) => Promise<RenderResult>> {
  const netron = await loadNetron();
  // No `workerUrl`: elk.bundled.js lays out in the calling thread, as the library uses it.
  const elk = createElk();
  const layout = (graph: Parameters<typeof elk.layout>[0]) => elk.layout(graph);

  const render = async ({ source, direction, nodes, outputBytes }: Job): Promise<RenderResult> => {
    const result = await renderModel(source, netron, layout, direction, nodes);
    // UTF-8 bytes, as the library's `Buffer.byteLength` counts them.
    if (result.status === 'success' && new TextEncoder().encode(result.output).length > outputBytes) {
      return { status: 'failure', message: `The drawing exceeds the ${outputBytes}-byte output limit.` };
    }
    return result;
  };

  // The first layout in a fresh worker costs a few hundred milliseconds of warm-up that must not
  // be charged to an author's budget, so it is spent here, before this worker reports ready.
  const warm = await render({ source: WARM_UP, direction: 'down', nodes: Infinity, outputBytes: Infinity });
  if (warm.status !== 'success') throw new Error('the warm-up graph did not draw');
  return render;
}

start().then((render) => {
  scope.onmessage = ({ data: { id, ...job } }) => {
    render(job).then((result) => scope.postMessage({ type: 'reply', id, result }), () => {
      // An unexpected error may leave the reader or ELK in a bad state; the plugin discards this worker.
      const result: RenderResult = { status: 'failure', message: 'The ONNX renderer stopped unexpectedly.' };
      scope.postMessage({ type: 'reply', id, result, discard: true });
    });
  };
  scope.postMessage({ type: 'started' });
}, () => {
  // The error would name bundle internals; the reason stays plain.
  scope.postMessage({ type: 'failed', reason: 'the ONNX layout engine could not start' });
});
