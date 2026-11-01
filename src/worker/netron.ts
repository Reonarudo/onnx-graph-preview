// The vendored Netron modules, as onnx-renderer's dist/netron.js gathers them, but imported
// statically so esbuild bundles them into the worker. The library reaches them by URL from its
// own directory (`import()` of vendor/netron/*.js, `readFile` of the metadata), which a worker
// started from a blob URL has no way to do; only that file-location code is replaced here.
// The metadata arrives as text (esbuild's text loader), as the reader parses it itself.
import * as onnx from '#renderer/vendor/netron/onnx.js';
import * as proto from '#renderer/vendor/netron/onnx-proto.js';
import * as protobuf from '#renderer/vendor/netron/protobuf.js';
import * as text from '#renderer/vendor/netron/text.js';
import * as json from '#renderer/vendor/netron/json.js';
import metadata from '#renderer/vendor/netron/onnx-metadata.json';
import type { Netron } from '#renderer/dist/netron.js';

export async function loadNetron(): Promise<Netron> {
  // The same object the library's loader returns: each module's namespace, and the metadata text.
  const netron: Netron = { onnx, proto, protobuf, text, json, metadata };
  return netron;
}
