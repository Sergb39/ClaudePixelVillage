export type Activity = 'arriving' | 'thinking' | 'working' | 'waiting' | 'celebrating' | 'resting' | 'sleeping' | 'leaving' | 'interrupted';
export type Station = 'gate' | 'board' | 'library' | 'forge' | 'observatory' | 'training' | 'campfire' | 'beds';
export interface VillageEvent {
  hook_event_name: string;
  session_id: string;
  agent_id?: string;
  agent_type?: string;
  tool_name?: string;
  tool_use_id?: string;
  notification_type?: string;
  source?: string;
  label?: string;
}
export interface ActorState {
  id: string;
  sessionId: string;
  agentId?: string;
  name: string;
  kind: 'hero' | 'companion';
  palette: number;
  activity: Activity;
  station: Station;
  toolName?: string;
  activeTools: Record<string, string>;
  lastEvent: string;
  updatedAt: number;
  finishedAt?: number;
}
export interface ClosedActor { event: 'SubagentStop' | 'SessionEnd'; at: number; }
export interface JournalEvent extends VillageEvent { sequence: number; receivedAt: number; }
export interface Snapshot {
  sequence: number;
  actors: Record<string, ActorState>;
  journal: JournalEvent[];
  closedActors?: Record<string, ClosedActor>;
}
export const COMPANION_RETURN_MS = 12000;
export const DEPARTURE_MS = 12000;
export const actorKey = (sessionId: string, agentId?: string) => `${sessionId}${agentId ? `::${agentId}` : ''}`;
