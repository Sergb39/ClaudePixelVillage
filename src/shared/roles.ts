import type { AgentRole } from './types';

export const ROLE_LABELS: Record<AgentRole, string> = {
  lead: 'Lead adventurer', designer: 'Designer', developer: 'Developer',
  'project-manager': 'Project manager', explorer: 'Explorer', planner: 'Planner',
  tester: 'Tester', general: 'Companion',
};
export const ROLE_NAMES: Record<AgentRole, string> = {
  lead: 'Willow', designer: 'Muse', developer: 'Tinker', 'project-manager': 'Steward',
  explorer: 'Scout', planner: 'Sage', tester: 'Glint', general: 'Sprout',
};
export const ROLE_PALETTES: Record<AgentRole, number> = {
  lead: 0, designer: 2, developer: 1, 'project-manager': 3,
  explorer: 0, planner: 6, tester: 4, general: 5,
};
export function isAgentRole(value: unknown): value is AgentRole {
  return typeof value === 'string' && Object.hasOwn(ROLE_LABELS, value);
}
export function agentRole(agentType?: string): AgentRole {
  if (!agentType) return 'general';
  const type = agentType.toLowerCase().replace(/[\s_]+/g, '-');
  if (/(design|visual|artist|(?:^|-)ux(?:-|$)|(?:^|-)ui(?:-|$))/.test(type)) return 'designer';
  if (/(project-manager|product-manager|coordinat|project-lead|product-lead|scrum)/.test(type)) return 'project-manager';
  if (/(develop|engineer|implement|cod|build)/.test(type)) return 'developer';
  if (/(test|qa|review|debug|audit)/.test(type)) return 'tester';
  if (/(plan|architect|strateg)/.test(type)) return 'planner';
  if (/(explor|research|search|analys|scout)/.test(type)) return 'explorer';
  return 'general';
}
