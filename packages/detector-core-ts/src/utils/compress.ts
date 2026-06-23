/**
 * Small adapter that isolates the only Node-only bit of the engine: zlib.
 *
 * In Node we use the built-in synchronous deflate to mirror the Python
 * ``zlib.compress`` proxy exactly. In a browser (or any environment without
 * ``node:zlib``) we fall back to a dependency-free RLE-style estimator that
 * still satisfies the contract: highly repetitive text yields a *smaller*
 * ratio than varied text, which is all the structure detector relies on.
 *
 * The function is synchronous and never throws.
 */

type DeflateFn = (buf: Uint8Array) => Uint8Array;

let deflate: DeflateFn | null = null;

// Attempt to bind Node's zlib once, lazily, without making it a hard dependency.
function loadNodeDeflate(): DeflateFn | null {
  if (deflate) return deflate;
  // `require` exists in CJS interop and in Node ESM via createRequire; guard it.
  const req = (globalThis as { require?: (id: string) => unknown }).require;
  const proc = (globalThis as { process?: { versions?: { node?: string } } }).process;
  if (typeof req === "function" && proc?.versions?.node) {
    try {
      const zlib = req("node:zlib") as {
        deflateSync: (data: Uint8Array, opts: { level: number }) => Buffer;
      };
      deflate = (buf) => new Uint8Array(zlib.deflateSync(buf, { level: 6 }));
      return deflate;
    } catch {
      /* fall through to the browser estimator */
    }
  }
  return null;
}

const encoder = new TextEncoder();

/** Browser-safe estimator of compressed length using byte run-length + dictionary. */
function estimateCompressedLength(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  // Count distinct 3-byte windows; fewer distinct windows => more compressible.
  const seen = new Set<number>();
  let runReduction = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (i > 0 && bytes[i] === bytes[i - 1]) {
      runReduction += 1; // repeated bytes compress to almost nothing
    }
    if (i + 2 < bytes.length) {
      const key = bytes[i]! * 65536 + bytes[i + 1]! * 256 + bytes[i + 2]!;
      seen.add(key);
    }
  }
  const distinctRatio = seen.size / Math.max(1, bytes.length);
  // Blend the two cheap signals into an estimated compressed size.
  const base = bytes.length * (0.2 + 0.6 * distinctRatio);
  return Math.max(8, base - runReduction * 0.4);
}

/**
 * Ratio of compressed to original byte length (0..1). Highly repetitive text
 * compresses well (low ratio). Mirrors Python ``utils.text.compressibility``.
 */
export function compressionRatio(text: string): number {
  const raw = encoder.encode(text);
  if (raw.length === 0) return 1.0;
  const fn = loadNodeDeflate();
  const compressedLen = fn ? fn(raw).length : estimateCompressedLength(raw);
  return Math.min(1.0, compressedLen / raw.length);
}
