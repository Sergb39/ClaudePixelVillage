import { posix, win32 } from 'node:path';

/** Remove only this checkout's former bridge handlers; preserve unrelated Claude settings. */
export function removeVillageHooks(settings, root, platform = process.platform) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Settings must be a JSON object.');
  if (settings.hooks === undefined) return structuredClone(settings);
  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) throw new Error('Existing hooks must be an object.');
  const bridge = (platform === 'win32' ? win32 : posix).join(root, 'scripts', 'hook-bridge.mjs').replaceAll('\\', '/');
  const result = structuredClone(settings);
  for (const [name, groups] of Object.entries(result.hooks)) {
    if (!Array.isArray(groups)) throw new Error(`Existing ${name} hooks must be an array.`);
    const retained = groups.flatMap(group => {
      if (!group || !Array.isArray(group.hooks)) throw new Error(`Invalid hook group for ${name}; fix it before uninstalling.`);
      const handlers = group.hooks.filter(handler => {
        const values = [handler?.command, ...(Array.isArray(handler?.args) ? handler.args : [])];
        return !values.some(value => typeof value === 'string' && value.replaceAll('\\', '/').includes(bridge));
      });
      return handlers.length ? [{ ...group, hooks: handlers }] : [];
    });
    if (retained.length) result.hooks[name] = retained;
    else delete result.hooks[name];
  }
  if (!Object.keys(result.hooks).length) delete result.hooks;
  return result;
}
