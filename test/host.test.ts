// The host's behaviour against scripted workers: start-up, timeouts, a discarded engine, the
// queue, the checks made before the worker sees a fence, and dispose. The real worker is
// exercised in worker.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RenderResult } from '@reonarudo/onnx-renderer';
import { createHost, type WorkerLike } from '../src/host';
import type { Reply, Request, WorkerMessage } from '../src/protocol';

type Answer = Omit<Reply, 'type' | 'id'> | 'hang';
interface Script {
  start?: 'ok' | 'fail' | 'silent';
  answer?: (source: string) => Answer;
}

/** Workers that start and answer as scripted, recording what they were asked and whether they were stopped. */
function workers(script: Script = {}) {
  const spawned: { requests: Request[]; terminated: boolean }[] = [];
  const spawn = (): WorkerLike => {
    const record = { requests: [] as Request[], terminated: false };
    spawned.push(record);
    const worker: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(request) {
        record.requests.push(request);
        const answer = (script.answer ?? ((source) => ({ result: { status: 'success', output: `<svg>${source}</svg>`, notes: [] } })))(request.source);
        if (answer === 'hang') return;
        setTimeout(() => { if (!record.terminated) send({ type: 'reply', id: request.id, ...answer }); }, 1);
      },
      terminate() { record.terminated = true; }
    };
    const send = (message: WorkerMessage) => worker.onmessage?.({ data: message });
    const start = script.start ?? 'ok';
    if (start !== 'silent') setTimeout(() => send(start === 'ok' ? { type: 'started' } : { type: 'failed', reason: 'the ONNX layout engine could not start' }), 1);
    return worker;
  };
  return { spawn, spawned };
}

test('renders through the worker, starting one engine eagerly, with the library defaults', async () => {
  const { spawn, spawned } = workers();
  const host = createHost(spawn);
  assert.equal(spawned.length, 1);
  assert.deepEqual(await host.render({ source: 'm' }), { status: 'success', output: '<svg>m</svg>', notes: [] });
  const { id, ...request } = spawned[0]!.requests[0]!;
  assert.equal(typeof id, 'number');
  assert.deepEqual(request, { source: 'm', direction: 'down', nodes: 1000, outputBytes: 4 * 1024 * 1024 });
  host.dispose();
});

test('the direction reaches the worker; anything but down or right fails before it, as the library words it', async () => {
  const { spawn, spawned } = workers();
  const host = createHost(spawn);
  await host.render({ source: 'm', direction: 'right' });
  assert.equal(spawned[0]!.requests[0]!.direction, 'right');
  for (const direction of ['RIGHT', '', 'up', '<up>']) {
    assert.deepEqual(await host.render({ source: 'm', direction }), { status: 'failure', message: `Unknown direction "${direction}": use down or right.` });
  }
  assert.equal(spawned[0]!.requests.length, 1);
  host.dispose();
});

test('renders run one at a time, in order', async () => {
  let active = 0;
  let most = 0;
  const { spawn } = workers({
    answer: (source) => {
      active++;
      most = Math.max(most, active);
      setTimeout(() => { active--; }, 1);
      return { result: { status: 'success', output: source, notes: [] } };
    }
  });
  const host = createHost(spawn);
  const sources = Array.from({ length: 10 }, (_, i) => `m${i}`);
  const results = await Promise.all(sources.map((source) => host.render({ source })));
  assert.deepEqual(results.map((result) => result.status === 'success' && result.output), sources);
  assert.equal(most, 1);
  host.dispose();
});

test('a render past the budget times out, stops the worker, and the next render starts a fresh one', async () => {
  const { spawn, spawned } = workers({ answer: (source) => source === 'slow' ? 'hang' : { result: { status: 'success', output: 'ok', notes: [] } } });
  const host = createHost(spawn, { timeout: 200 });
  assert.deepEqual(await host.render({ source: 'slow' }), { status: 'timeout', budget: 200 });
  assert.equal(spawned[0]!.terminated, true);
  assert.equal((await host.render({ source: 'fast' })).status, 'success');
  assert.equal(spawned.length, 2);
  host.dispose();
});

test('a reply marked discard is returned, and its engine is not used again', async () => {
  const { spawn, spawned } = workers({ answer: (source) => source === 'boom'
    ? { result: { status: 'failure', message: 'The ONNX renderer stopped unexpectedly.' }, discard: true }
    : { result: { status: 'success', output: 'ok', notes: [] } } });
  const host = createHost(spawn);
  assert.deepEqual(await host.render({ source: 'boom' }), { status: 'failure', message: 'The ONNX renderer stopped unexpectedly.' });
  assert.equal(spawned[0]!.terminated, true);
  assert.equal((await host.render({ source: 'm' })).status, 'success');
  assert.equal(spawned.length, 2);
  host.dispose();
});

test('an engine that fails or never starts makes the render unavailable, and is retried next time', async () => {
  const failing = workers({ start: 'fail' });
  const host = createHost(failing.spawn);
  assert.deepEqual(await host.render({ source: 'm' }), { status: 'unavailable', reason: 'the ONNX layout engine could not start' });
  assert.equal(failing.spawned[0]!.terminated, true);
  await host.render({ source: 'm' });
  assert.equal(failing.spawned.length, 2);
  host.dispose();

  const silent = workers({ start: 'silent' });
  const stuck = createHost(silent.spawn, { startupTimeout: 20 });
  assert.deepEqual(await stuck.render({ source: 'm' }), { status: 'unavailable', reason: 'the ONNX layout worker did not start within 20 ms' });
  stuck.dispose();
});

test('the source limit is checked before the worker sees the source; the node limit is passed to it', async () => {
  const { spawn, spawned } = workers();
  const host = createHost(spawn, { limits: { sourceChars: 5, nodes: 7, outputBytes: 9 } });
  assert.deepEqual(await host.render({ source: 'longer' }), { status: 'failure', message: 'ONNX source exceeds the 5-character limit.' });
  assert.equal(spawned[0]!.requests.length, 0);
  assert.equal((await host.render({ source: 'm' })).status, 'success');
  assert.equal(spawned[0]!.requests[0]!.nodes, 7);
  assert.equal(spawned[0]!.requests[0]!.outputBytes, 9);
  host.dispose();
});

test('dispose stops the worker and settles renders in flight and queued as unavailable', async () => {
  const { spawn, spawned } = workers({ answer: () => 'hang' });
  const host = createHost(spawn, { timeout: 60000 });
  const pending: Promise<RenderResult>[] = [host.render({ source: 'a' }), host.render({ source: 'b' })];
  await new Promise((resolve) => setTimeout(resolve, 10));
  host.dispose();
  const stopped = { status: 'unavailable', reason: 'the renderer was stopped' };
  assert.deepEqual(await Promise.all(pending), [stopped, stopped]);
  assert.equal(spawned[0]!.terminated, true);
  assert.deepEqual(await host.render({ source: 'c' }), stopped);
  assert.equal(spawned.length, 1);
});

test('options and inputs are validated as the library validates them', () => {
  const { spawn } = workers();
  for (const options of [{ timeout: 0 }, { timeout: Number.NaN }, { startupTimeout: -1 }, { limits: { sourceChars: Infinity } }, { limits: { outputBytes: 0 } }, { limits: { nodes: -1 } }]) {
    assert.throws(() => createHost(spawn, options), TypeError, JSON.stringify(options));
  }
  assert.throws(() => createHost(spawn, null as never), /options must be an object/);
  assert.throws(() => createHost(spawn, { limits: null as never }), /limits must be an object/);
  const host = createHost(spawn);
  for (const input of [42, null, 'm', { source: 1 }, { source: 'm', direction: 2 }]) {
    assert.throws(() => host.render(input as never), /^TypeError: render\(\) takes \{ source: string, direction\?: string \}$/);
  }
  host.dispose();
});

test('dispose while the engine is still starting settles the waiting render at once', async () => {
  const { spawn, spawned } = workers({ start: 'silent' });
  const host = createHost(spawn, { startupTimeout: 60000 });
  const pending = host.render({ source: 'm' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const before = Date.now();
  host.dispose();
  assert.deepEqual(await pending, { status: 'unavailable', reason: 'the renderer was stopped' });
  assert.ok(Date.now() - before < 1000);
  assert.equal(spawned[0]!.terminated, true);
});
