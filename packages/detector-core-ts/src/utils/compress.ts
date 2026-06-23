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

interface ZlibLike {
  deflateSync: (data: Uint8Array, opts: { level: number }) => ArrayLike<number>;
}

let deflate: DeflateFn | null = null;
let warming = false;

function bindZlib(zlib: ZlibLike): DeflateFn {
  // Buffer is an ArrayLike<number>; copy element-wise into a plain Uint8Array.
  deflate = (buf) => Uint8Array.from(zlib.deflateSync(buf, { level: 6 }));
  return deflate;
}

const isNode =
  typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node ===
  "string";

/**
 * Attempt to bind Node's zlib synchronously when possible (CJS interop or a
 * global ``require``), and otherwise kick off an async warm-up that swaps in the
 * real zlib for subsequent calls. Browsers skip all of this and use the
 * dependency-free estimator. Never throws.
 */
function loadNodeDeflate(): DeflateFn | null {
  if (deflate) return deflate;
  if (!isNode) return null;

  // Fast path: a synchronous require (CJS, or globalThis.require).
  const req = (globalThis as { require?: (id: string) => unknown }).require;
  if (typeof req === "function") {
    try {
      return bindZlib(req("node:zlib") as ZlibLike);
    } catch {
      /* fall through */
    }
  }

  // ESM path: warm up createRequire-based zlib asynchronously (sync callers use
  // the estimator until this resolves; results stay within the same contract).
  if (!warming) {
    warming = true;
    void (async () => {
      try {
        // Indirect specifier so the type checker / bundler does not attempt to
        // resolve a Node-only module in browser builds.
        const moduleSpecifier = "node:module";
        const importDynamic = new Function("s", "return import(s)") as (
          s: string,
        ) => Promise<{ createRequire: (url: string) => (id: string) => unknown }>;
        const mod = await importDynamic(moduleSpecifier);
        const require = mod.createRequire(import.meta.url);
        bindZlib(require("node:zlib") as ZlibLike);
      } catch {
        /* stay on the estimator */
      }
    })();
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
