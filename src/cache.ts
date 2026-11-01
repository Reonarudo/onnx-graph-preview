import type { RenderInput, RenderResult } from '@reonarudo/onnx-renderer';

export interface CachedRender {
  render(input: RenderInput): Promise<RenderResult>;
  clear(): void;
}

/**
 * The cache key, as onnx-markdown-preview's `createRenderer` builds it before hashing: the body,
 * a NUL, then `=direction`. An absent direction and an empty one are different inputs: the second
 * is a failure.
 */
export function cacheKey({ source, direction }: RenderInput): string {
  return `${source}\u0000${direction === undefined ? '' : `=${direction}`}`;
}

/**
 * Remember recent results by fence body and direction. Obsidian runs a code block processor again
 * whenever a section is re-rendered (scrolling, switching views, an edit elsewhere in the note), so
 * without this every pass would lay the graph out again. Identical inputs rendered at the same
 * time share one render. Failures and timeouts are cached, since they would only repeat, until
 * the fence changes or the time limit does (which clears the cache); `unavailable` is not, so a
 * restarted renderer gets another chance.
 */
export function createCache(render: (input: RenderInput) => Promise<RenderResult>, max = 96): CachedRender {
  const entries = new Map<string, Promise<RenderResult>>();
  return {
    render(input) {
      const key = cacheKey(input);
      const hit = entries.get(key);
      if (hit) {
        // Most recently used goes last; the first key is evicted first.
        entries.delete(key);
        entries.set(key, hit);
        return hit;
      }
      const pending = render(input);
      entries.set(key, pending);
      if (entries.size > max) entries.delete(entries.keys().next().value!);
      pending.then((result) => {
        if (result.status === 'unavailable' && entries.get(key) === pending) entries.delete(key);
      }, () => {
        if (entries.get(key) === pending) entries.delete(key);
      });
      return pending;
    },
    clear() {
      entries.clear();
    }
  };
}
