// Modules that exist only at build time (scripts/worker-bundle.mjs and scripts/build.mjs).

/** The render worker's bundled source, embedded as a string. */
declare module 'virtual:render-worker' {
  const source: string;
  export default source;
}

/** Files inside the installed onnx-renderer package, outside its public `exports`. */
declare module '#renderer/dist/netron.js' {
  /** What the library's reader needs from the vendored Netron modules (its dist/netron.d.ts). */
  export interface Netron {
    onnx: unknown;
    proto: unknown;
    protobuf: unknown;
    text: unknown;
    json: unknown;
    metadata: string;
  }
}
declare module '#renderer/dist/render.js' {
  import type { RenderResult } from '@reonarudo/onnx-renderer';
  import type { ElkNode } from 'elkjs/lib/elk-api.js';
  import type { Netron } from '#renderer/dist/netron.js';
  export function renderModel(
    source: string,
    netron: Netron,
    layout: (graph: ElkNode) => Promise<ElkNode>,
    direction?: 'down' | 'right',
    nodes?: number
  ): Promise<RenderResult>;
}
/** The vendored Netron modules: only their exports matter here, and the reader alone uses them. */
declare module '#renderer/vendor/netron/onnx.js' {
  export const ModelFactory: unknown;
}
declare module '#renderer/vendor/netron/onnx-proto.js' {
  export const onnx: unknown;
}
declare module '#renderer/vendor/netron/protobuf.js' {
  export const BinaryReader: unknown;
  export const TextReader: unknown;
}
declare module '#renderer/vendor/netron/text.js' {
  export const Decoder: unknown;
  export const Reader: unknown;
}
declare module '#renderer/vendor/netron/json.js' {
  export const TextReader: unknown;
  export const BinaryReader: unknown;
}
declare module '#renderer/vendor/netron/onnx-metadata.json' {
  const text: string;
  export default text;
}
