/**
 * Preloaded before anything else (see bunfig.toml).
 *
 * `bson` — pulled in by mongodb, and therefore by mongoose — probes
 * `v8.startupSnapshot.isBuildingSnapshot()` at module scope to decide whether
 * to defer some initialisation. Bun 1.3 exposes the function but throws
 * ERR_NOT_IMPLEMENTED when it's called, which kills the import before the
 * server can start.
 *
 * Returning `false` isn't papering over a failure: we are genuinely not
 * building a V8 startup snapshot, so `false` is the correct answer and bson
 * takes exactly the path it would take under Node. Drop this file once Bun
 * implements the API.
 */
interface StartupSnapshot {
  isBuildingSnapshot?: () => boolean;
}

interface V8Module {
  startupSnapshot?: StartupSnapshot;
}

const getBuiltinModule = (process as NodeJS.Process & {
  getBuiltinModule?: (id: string) => unknown;
}).getBuiltinModule;

const v8 = getBuiltinModule?.("v8") as V8Module | undefined;

if (v8?.startupSnapshot) {
  try {
    v8.startupSnapshot.isBuildingSnapshot?.();
  } catch {
    v8.startupSnapshot.isBuildingSnapshot = () => false;
  }
}

export {};
