import { posix, win32 } from 'node:path';

export const coreEvents = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'Notification', 'SubagentStart', 'SubagentStop', 'Stop', 'SessionEnd'];
const extraEvents = ['Setup', 'InstructionsLoaded', 'UserPromptExpansion', 'PostToolBatch', 'PermissionDenied', 'TaskCreated', 'TaskCompleted', 'StopFailure', 'TeammateIdle', 'ConfigChange', 'CwdChanged', 'DirectoryAdded', 'PreCompact', 'PostCompact', 'PreModelSwitch', 'PostModelSwitch', 'Elicitation', 'ElicitationResult'];
const shellQuote = value => `'${value.replaceAll("'", "'\"'\"'")}'`;
const powershellQuote = value => `'${value.replaceAll("'", "''")}'`;

/** Exec form avoids shell quoting and a GUI app's possibly incomplete PATH. */
export function createHookConfig({ root, nodePath, platform = process.platform, expanded = false, legacy = false }) {
  const bridge = (platform === 'win32' ? win32 : posix).join(root, 'scripts', 'hook-bridge.mjs');
  const handler = legacy
    ? platform === 'win32'
      ? { type: 'command', shell: 'powershell', command: `& ${powershellQuote(nodePath)} ${powershellQuote(bridge)}`, timeout: 2 }
      : { type: 'command', command: `${shellQuote(nodePath)} ${shellQuote(bridge)}`, timeout: 2 }
    : { type: 'command', command: nodePath, args: [bridge], timeout: 2 };
  return { hooks: Object.fromEntries((expanded ? [...coreEvents, ...extraEvents] : coreEvents).map(name => [name, [{ hooks: [{ ...handler, ...(handler.args ? { args: [...handler.args] } : {}) }] }]])) };
}
const isVillageHook = handler => {
  if (!handler || typeof handler !== 'object') return false;
  const paths = [handler.command, ...(Array.isArray(handler.args) ? handler.args : [])];
  return paths.some(path => typeof path === 'string' && /scripts[/\\]hook-bridge\.mjs/.test(path));
};

/** Preserve unrelated settings/handlers; update old village paths without duplicating hooks. */
export function mergeHookConfig(settings, config) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Settings must be a JSON object.');
  if (settings.hooks !== undefined && (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks))) throw new Error('Existing hooks must be an object.');
  const result = structuredClone(settings);
  result.hooks ??= {};
  for (const [name, additions] of Object.entries(config.hooks)) {
    const existing = result.hooks[name] ?? [];
    if (!Array.isArray(existing)) throw new Error(`Existing ${name} hooks must be an array.`);
    const kept = existing.flatMap(group => {
      if (!group || !Array.isArray(group.hooks)) throw new Error(`Invalid hook group for ${name}; fix it before installing.`);
      const handlers = group.hooks.filter(handler => !isVillageHook(handler));
      return handlers.length ? [{ ...group, hooks: handlers }] : [];
    });
    result.hooks[name] = [...kept, ...structuredClone(additions)];
  }
  return result;
}
