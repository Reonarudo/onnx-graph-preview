// The embedded worker bundle, built exactly as main.js embeds it, run under Node through the
// plugin's host. A small prelude gives the bundle the `self` a browser Worker would have, which is
// also what would send elkjs down its own-worker branch (worker-bundle.mjs). These pin the
// plugin's assumptions about the library's output; drawing itself is onnx-renderer's to test.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { bundleWorker } from '../scripts/worker-bundle.mjs';
import { createHost, type Host, type WorkerLike } from '../src/host';
import { describe } from '../src/fence';
import { DARK_PAGE, DARK_TEXT, LINE_CONTRAST, TEXT_CONTRAST, contrast, parseColor, type Rgb } from '../src/theme';
import { DENSE, fence } from './helpers';

const PRELUDE = `
const { parentPort } = require('node:worker_threads');
globalThis.self = {
  postMessage: (message) => parentPort.postMessage(message),
  set onmessage(handler) {
    parentPort.removeAllListeners('message');
    if (handler) parentPort.on('message', (data) => handler({ data }));
  }
};
`;

const MODEL = 'g (float[N, 3, 32, 32] x) => (float[N, 10] y) {\n  c = Conv <kernel_shape = [3, 3]> (x, w)\n  r = Relu (c)\n  y = Gemm <transB = 1> (r, fc_w, fc_b)\n}';

let source: string;
let host: Host;

function spawn(): WorkerLike {
  const worker = new Worker(PRELUDE + source, { eval: true });
  const like: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (message) => worker.postMessage(message),
    terminate: () => void worker.terminate()
  };
  worker.on('message', (data) => like.onmessage?.({ data }));
  worker.on('error', (error) => like.onerror?.(error));
  return like;
}

before(async () => {
  source = await bundleWorker();
  host = createHost(spawn);
});
after(() => host.dispose());

test('the bundle carries no Node module imports and no file loading', () => {
  assert.doesNotMatch(source, /require\(["']node:|from["']node:|\bimport\(/);
  assert.doesNotMatch(source, /readFile|import\.meta/);
});

test('a model draws as one <svg class="onnx"> in the SVG namespace, with a viewBox and no size', async () => {
  const result = await host.render({ source: MODEL });
  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  const root = /^<svg [^>]*>/.exec(result.output)![0];
  assert.match(root, /\sclass="onnx"/);
  assert.match(root, /\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(root, /\sviewBox="[^"]+"/);
  assert.doesNotMatch(root, /\swidth=|\sheight=/);
  // Netron's metadata reached the reader: Conv is headed in its category's colour.
  assert.match(result.output, /class="header category-layer"[^>]*>(?:<\/path>)?<text[^>]*>Conv</);
  const wrapper = fence('onnx', MODEL, result);
  assert.match(wrapper.querySelector('.onnx-rendering > svg')!.getAttribute('width')!, /^[0-9.]+px$/);
});

test('direction right lays the graph out sideways', async () => {
  const size = async (direction?: string) => {
    const result = await host.render(direction === undefined ? { source: MODEL } : { source: MODEL, direction });
    if (result.status !== 'success') assert.fail(JSON.stringify(result));
    const [, , width, height] = /viewBox="([^"]+)"/.exec(result.output)![1]!.split(/\s+/).map(Number);
    return { width: width!, height: height! };
  };
  const down = await size();
  assert.deepEqual(await size('down'), down);
  const right = await size('right');
  assert.ok(down.height > down.width, JSON.stringify(down));
  assert.ok(right.width > right.height, JSON.stringify(right));
});

test('the protobuf text form reads too', async () => {
  const pbtxt = 'ir_version: 7\ngraph {\n  name: "g"\n  node { input: "x" output: "y" op_type: "Sigmoid" }\n  input { name: "x" }\n  output { name: "y" }\n}';
  const result = await host.render({ source: pbtxt });
  assert.equal(result.status, 'success');
  assert.match(result.status === 'success' ? result.output : '', />Sigmoid</);
});

test('a parse error is reported with its line and column, quoted with a caret', async () => {
  const body = 'g (float[1] x) => (float[1] y) {\n  y = Relu (x\n}';
  const result = await host.render({ source: body });
  if (result.status !== 'failure') assert.fail(JSON.stringify(result));
  assert.equal(result.line !== undefined && result.column !== undefined, true);
  assert.match(describe(result, body), /\n\n\d+ │ .*\n *\^$/);
});

test('text that is not a model fails in a sentence; a nested graph is a note', async () => {
  const failure = await host.render({ source: 'hello world' });
  assert.equal(failure.status, 'failure');
  const nested = 'g (bool c, float[1] x) => (float[1] y) {\n  y = If <then_branch = a () => (float[1] t) { t = Identity (x) }, else_branch = b () => (float[1] e) { e = Identity (x) }> (c)\n}';
  const result = await host.render({ source: nested });
  if (result.status !== 'success') assert.fail(JSON.stringify(result));
  assert.ok(result.notes.length > 0);
});

test('author text in a model or its error stays text', async () => {
  for (const body of [
    'g (float[1] x) => (float[1] y) { y = Relu (x <img src=x onerror=alert(1)>',
    'g (float[1] x) => (float[1] y) { y = Relu (x) }\n<script>alert(1)</script>',
    'g (float[1] x) => (float[1] y) { y = Relu <alpha = "<img src=x onerror=alert(1)>"> (x) }'
  ]) {
    const wrapper = fence('onnx', body, await host.render({ source: body }));
    assert.equal(wrapper.querySelectorAll('.onnx-rendering img, .onnx-rendering script').length, 0, body);
  }
});

test('ten concurrent renders each get their own graph', async () => {
  const bodies = Array.from({ length: 10 }, (_, i) => `g${i} (float[1] x) => (float[1] y) { y = Relu (x) }`);
  const results = await Promise.all(bodies.map((body) => host.render({ source: body })));
  results.forEach((result, i) => {
    assert.equal(result.status, 'success');
    assert.match(result.status === 'success' ? result.output : '', new RegExp(`>g${i}<|>x<`));
  });
});

test('the node and output limits are applied in the worker', async () => {
  const limited = createHost(spawn, { limits: { nodes: 3, outputBytes: 100 } });
  try {
    assert.deepEqual(await limited.render({ source: MODEL }), { status: 'failure', message: 'The graph has 8 nodes, over the 3-node limit.' });
    assert.deepEqual(await limited.render({ source: 'g (float[1] x) => (float[1] y) { y = Relu (x) }' }),
      { status: 'failure', message: 'The drawing exceeds the 100-byte output limit.' });
  } finally {
    limited.dispose();
  }
});

test('a layout past the budget times out, and a fresh worker draws the next fence', async () => {
  const tight = createHost(spawn, { timeout: 50 });
  try {
    assert.deepEqual(await tight.render({ source: DENSE }), { status: 'timeout', budget: 50 });
    assert.equal((await tight.render({ source: MODEL })).status, 'success');
  } finally {
    tight.dispose();
  }
});

test('in dark colours every text of a real graph reads on what it sits on, and every line on the page', async () => {
  const dark = (element: Element, property: string): Rgb | undefined => {
    const declaration = (element.getAttribute('style') ?? '').split(';').find((part) => part.startsWith(`${property}:`));
    const value = declaration && /, ((?:rgb\([^)]*\))|var\([^)]*\))\)$/.exec(declaration)?.[1];
    return value === undefined ? undefined : value === 'var(--text-normal)' ? DARK_TEXT : parseColor(value);
  };
  const body = 'g (float[N, 3, 32, 32] x) => (float[N, 10] y) {\n  c = Conv <kernel_shape = [3, 3]> (x, w)\n  b = BatchNormalization (c, s, bias, m, v)\n' +
    '  r = Relu (b)\n  p = MaxPool <kernel_shape = [2, 2]> (r)\n  f = Flatten (p)\n  t = Transpose <perm = [1, 0]> (f)\n  y = Gemm <transB = 1> (t, fc_w, fc_b)\n}';
  const result = await host.render({ source: body });
  if (result.status !== 'success') assert.fail(JSON.stringify(result));
  const svg = fence('onnx', body, result).querySelector('svg.onnx')!;
  let texts = 0;
  for (const text of svg.querySelectorAll('text, tspan')) {
    const group = text.closest('g')!;
    const under = group.matches('.node.input, .node.output') ? group.querySelector('.pill')
      : group.matches('.node') ? group.querySelector(text.matches('.type') ? '.header' : '.box')
        : group.querySelector('.label-box');
    const background = under ? dark(under, 'fill')! : DARK_PAGE;
    const fill = dark(text, 'fill');
    if (!fill) continue;
    texts++;
    assert.ok(contrast(fill, background) >= TEXT_CONTRAST, `${text.getAttribute('class')} "${text.textContent}" ${JSON.stringify(fill)} on ${JSON.stringify(background)}`);
  }
  assert.ok(texts > 20, `${texts} texts checked`);
  for (const line of svg.querySelectorAll('path.wire, rect.box, rect.pill')) {
    assert.ok(contrast(dark(line, 'stroke')!, DARK_PAGE) >= LINE_CONTRAST, line.getAttribute('class')!);
  }
  for (const arrow of svg.querySelectorAll('path.arrow')) assert.ok(contrast(dark(arrow, 'fill')!, DARK_PAGE) >= LINE_CONTRAST);
});
