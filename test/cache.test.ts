import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RenderInput, RenderResult } from '@reonarudo/onnx-renderer';
import { cacheKey, createCache } from '../src/cache';

const ok = (source: string): RenderResult => ({ status: 'success', output: `<svg>${source}</svg>`, notes: [] });
const src = (source: string): RenderInput => ({ source });

test('renders once per input, sharing a render still in flight', async () => {
  const calls: string[] = [];
  const cache = createCache(async ({ source }) => { calls.push(source); return ok(source); });
  const [a, b] = await Promise.all([cache.render(src('m')), cache.render(src('m'))]);
  assert.deepEqual(a, b);
  await cache.render(src('m'));
  assert.deepEqual(calls, ['m']);
});

test('the key is the body, a NUL, then =direction; absent and empty directions differ', async () => {
  assert.equal(cacheKey({ source: 'm' }), 'm\u0000');
  assert.equal(cacheKey({ source: 'm', direction: '' }), 'm\u0000=');
  assert.equal(cacheKey({ source: 'm', direction: 'right' }), 'm\u0000=right');
  const calls: RenderInput[] = [];
  const cache = createCache(async (input) => { calls.push(input); return ok(input.source); });
  for (const input of [{ source: 'm' }, { source: 'm', direction: '' }, { source: 'm', direction: 'right' }, { source: 'm', direction: 'down' }]) {
    await cache.render(input);
    await cache.render({ ...input });
  }
  assert.deepEqual(calls, [{ source: 'm' }, { source: 'm', direction: '' }, { source: 'm', direction: 'right' }, { source: 'm', direction: 'down' }]);
});

test('failures and timeouts are cached, unavailable and rejections are not', async () => {
  const calls: string[] = [];
  const results: Record<string, RenderResult> = {
    f: { status: 'failure', message: 'no' },
    t: { status: 'timeout', budget: 1 },
    u: { status: 'unavailable', reason: 'down' }
  };
  const cache = createCache(async ({ source }) => {
    calls.push(source);
    if (source === 'x') throw new Error('bug');
    return results[source]!;
  });
  for (const source of ['f', 't', 'u', 'f', 't', 'u']) await cache.render(src(source));
  await assert.rejects(cache.render(src('x')));
  await assert.rejects(cache.render(src('x')));
  assert.deepEqual(calls, ['f', 't', 'u', 'u', 'x', 'x']);
});

test('the least recently used input is evicted first', async () => {
  const calls: string[] = [];
  const cache = createCache(async ({ source }) => { calls.push(source); return ok(source); }, 2);
  for (const source of ['a', 'b', 'a', 'c', 'a', 'b']) await cache.render(src(source));
  assert.deepEqual(calls, ['a', 'b', 'c', 'b']);
});

test('clear forgets everything, cached timeouts included', async () => {
  const calls: string[] = [];
  const cache = createCache(async ({ source }) => { calls.push(source); return { status: 'timeout', budget: 3000 }; });
  await cache.render(src('a'));
  cache.clear();
  await cache.render(src('a'));
  assert.deepEqual(calls, ['a', 'a']);
});
