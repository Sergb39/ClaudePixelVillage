export interface HookHandler { type: string; command: string; args?: string[]; shell?: string; timeout: number; }
export interface HookConfig { hooks: Record<string, { hooks: HookHandler[] }[]>; }
export const coreEvents: string[];
export function createHookConfig(options: { root: string; nodePath: string; platform?: string; expanded?: boolean; legacy?: boolean }): HookConfig;
export function mergeHookConfig(settings: Record<string, unknown>, config: HookConfig): HookConfig & Record<string, unknown>;
