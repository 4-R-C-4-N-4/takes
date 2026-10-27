// Tiny ESM resolve hook: when a relative "./foo.js" specifier doesn't exist,
// fall back to "./foo.ts". Lets `node --experimental-strip-types` run scripts
// that import workspace TS packages whose source uses ".js"-suffixed relative
// imports (NodeNext convention) without a compiled dist/ output.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.js') && (specifier.startsWith('./') || specifier.startsWith('../'))) {
    const tsSpecifier = specifier.slice(0, -3) + '.ts';
    try {
      const parentPath = fileURLToPath(context.parentURL);
      const tsUrl = new URL(tsSpecifier, pathToFileURL(parentPath));
      if (existsSync(fileURLToPath(tsUrl))) {
        return nextResolve(tsSpecifier, context);
      }
    } catch {
      // fall through to default resolution
    }
  }
  return nextResolve(specifier, context);
}
