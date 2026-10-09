import Phaser from 'phaser';
import { COMPANION_RETURN_MS, type ActorState, type Snapshot } from '../shared/types';
import { createActorTextures, animationKey } from './sprites';
import { drawVillage, stations, WORLD_WIDTH, WORLD_HEIGHT, TILE } from './scenery';
import { findPath, nearestOpen, type Point } from './navigation';

type Facing = 'down' | 'up' | 'left' | 'right';
interface Resident {
  data: ActorState; container: Phaser.GameObjects.Container; sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; bubble: Phaser.GameObjects.Text;
  selection: Phaser.GameObjects.Graphics; prefix: string; facing: Facing; path: Point[];
  target: Point; lastRouteAt: number; pendingRoute: boolean; deliverUntil: number; animation: string;
}
const colors = [0x77a682, 0xb18bd1, 0xdf936c, 0x769fc4, 0xdab565, 0x8bb6a9, 0xc28096, 0x9ab86a];
export class VillageScene extends Phaser.Scene {
  residents = new Map<string, Resident>();
  blocked = new Set<string>(); ready = false; latest?: Snapshot; selectedId?: string;
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  zoomLevel = 1;
  onSelect: (id: string) => void = () => {};
  onReady: () => void = () => {};
  private portraitCache = new Map<string, string>();
  private ambient: Phaser.GameObjects.GameObject[] = [];
  private nightOverlay?: Phaser.GameObjects.Rectangle;
  private night = false;
  private milestoneMarkers: Phaser.GameObjects.Container[] = [];
  constructor() { super('village'); }
  create() {
    const village = drawVillage(this);
    this.blocked = village.blocked;
    // Keep feet out of the flame; residents gather in a ring around it.
    for (const tile of ['13,16', '14,16', '14,17']) this.blocked.add(tile);
    this.ambient = village.ambient;
    this.cameras.main.setBackgroundColor('#b8ce8a');
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.addAmbient();
    this.nightOverlay = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x263d68, .32).setDepth(3000).setScrollFactor(0).setVisible(this.night);
    this.setMotion(this.reducedMotion);
    this.ready = true;
    if (this.latest) this.sync(this.latest);
    this.onReady();
  }
  sync(snapshot: Snapshot) {
    this.latest = snapshot; if (!this.ready) return;
    this.updateMilestones(snapshot.completedQuests ?? 0);
    for (const [id, data] of Object.entries(snapshot.actors)) {
      let resident = this.residents.get(id);
      // Historical departures must not briefly respawn at the gate on refresh.
      if (!resident && data.activity === 'leaving') continue;
      if (!resident) { resident = this.spawn(data); this.residents.set(id, resident); }
      const oldEvent = resident.data.lastEvent; const oldUpdated = resident.data.updatedAt;
      const oldActivity = resident.data.activity;
      const changed = oldEvent !== data.lastEvent || oldUpdated !== data.updatedAt;
      resident.data = data;
      const prefix = createActorTextures(this, data.palette, data.kind, data.look);
      if (resident.prefix !== prefix) { resident.prefix = prefix; resident.sprite.setTexture(prefix); resident.animation = ''; }
      if (data.activity === 'leaving') resident.deliverUntil = 0;
      if (changed) {
        if (data.lastEvent === 'SubagentStop' && data.activity === 'celebrating' && oldActivity !== 'celebrating') { resident.deliverUntil = this.time.now + COMPANION_RETURN_MS; this.sparkle(resident.container.x, resident.container.y - 35, '✦'); }
        else if (data.activity === 'celebrating' || data.lastEvent === 'PostToolUse') this.sparkle(resident.container.x, resident.container.y - 38, '✧');
        resident.pendingRoute = true;
      }
      if (data.activity === 'leaving' && this.time.now > resident.deliverUntil) resident.sprite.setAlpha(.8);
      else resident.sprite.setAlpha(1);
      resident.label.setText(data.name);
    }
    for (const [id, resident] of this.residents) {
      if (!snapshot.actors[id]) { resident.container.destroy(true); this.residents.delete(id); }
    }
  }
  private spawn(data: ActorState): Resident {
    const prefix = createActorTextures(this, data.palette, data.kind, data.look);
    const birth = stations.gate;
    const offset = ((this.hash(data.id) % 5) - 2) * 15;
    const container = this.add.container(birth.x + offset, birth.y);
    const shadow = this.add.rectangle(0, -1, data.kind === 'hero' ? 30 : 24, 7, 0x344c31, .2);
    const selection = this.add.graphics();
    const sprite = this.add.sprite(0, 0, prefix, 0).setScale(2).setOrigin(.5, 1).setInteractive({ useHandCursor: true });
    const label = this.add.text(0, 6, data.name, { fontFamily: 'Consolas, monospace', fontSize: data.kind === 'hero' ? '12px' : '10px', color: '#f9fae7', backgroundColor: '#3b563bc9', padding: { x: 5, y: 3 } }).setOrigin(.5, 0);
    const bubble = this.add.text(0, data.kind === 'hero' ? -76 : -51, '', { fontFamily: 'Consolas, monospace', fontSize: '14px', color: '#5c6b44', backgroundColor: '#fffbe9', padding: { x: 6, y: 3 } }).setOrigin(.5, 1).setVisible(false);
    container.add([selection, shadow, sprite, label, bubble]);
    sprite.on('pointerdown', () => this.onSelect(data.id));
    const resident: Resident = { data, container, sprite, label, bubble, shadow, selection, prefix, facing: 'down', path: [], target: birth, lastRouteAt: -2000, pendingRoute: true, deliverUntil: 0, animation: '' };
    this.sparkle(container.x, container.y - 30, '+');
    return resident;
  }
  private destination(resident: Resident): Point {
    const data = resident.data;
    if (resident.deliverUntil > this.time.now && data.agentId) {
      const parent = this.residents.get(data.sessionId);
      if (parent) return { x: parent.container.x + 35, y: parent.container.y + 18 };
    }
    const station = stations[data.station];
    const sorted = [...this.residents.values()].filter(r => r.data.station === data.station).sort((a, b) => a.data.id.localeCompare(b.data.id));
    const index = sorted.findIndex(r => r.data.id === data.id);
    if (data.station === 'campfire') {
      const seats = [[-60, 35], [65, 35], [-60, -8], [65, -8], [-85, 68], [85, 68], [0, 78]];
      const ring = Math.floor(Math.max(0, index) / seats.length);
      const seat = seats[Math.max(0, index) % seats.length];
      return { x: station.x + seat[0] + (seat[0] < 0 ? -ring * 18 : ring * 18), y: station.y + seat[1] + ring * 24 };
    }
    // Stagger station slots so multiple agents remain visible.
    const offsets = [[0, 0], [-43, 10], [43, 10], [-24, 37], [25, 37], [-65, 35], [65, 35], [0, 60]];
    const ring = Math.floor(Math.max(0, index) / offsets.length);
    const slot = offsets[Math.max(0, index) % offsets.length];
    return { x: station.x + slot[0] + (slot[0] < 0 ? -ring * 24 : ring * 24), y: station.y + slot[1] + ring * 24 };
  }
  private route(resident: Resident) {
    const requested = this.destination(resident);
    const cell = nearestOpen({ x: Math.floor(requested.x / TILE), y: Math.floor(requested.y / TILE) }, this.blocked, WORLD_WIDTH / TILE, WORLD_HEIGHT / TILE);
    const target = { x: cell.x * TILE + TILE / 2, y: cell.y * TILE + TILE / 2 };
    resident.target = target;
    const cells = findPath({ x: Math.floor(resident.container.x / TILE), y: Math.floor(resident.container.y / TILE) }, cell, this.blocked, WORLD_WIDTH / TILE, WORLD_HEIGHT / TILE);
    resident.path = cells.map(p => ({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 }));
    if (cells.length || Math.floor(resident.container.x / TILE) === cell.x && Math.floor(resident.container.y / TILE) === cell.y) resident.path.push(target);
    resident.lastRouteAt = this.time.now; resident.pendingRoute = false;
    if (this.reducedMotion) { resident.container.setPosition(target.x, target.y); resident.path = []; }
  }
  update(_time: number, delta: number) {
    if (!this.ready) return;
    for (const [id, r] of this.residents) {
      if (r.pendingRoute && this.time.now - r.lastRouteAt > 1100) this.route(r);
      if (r.deliverUntil) {
        const parent = this.residents.get(r.data.sessionId);
        const arrived = !r.path.length && parent && Math.hypot(parent.container.x - r.container.x, parent.container.y - r.container.y) < 80 && this.time.now - r.lastRouteAt > 250;
        if (arrived || this.time.now > r.deliverUntil) { r.deliverUntil = 0; r.pendingRoute = true; if (arrived) this.sparkle(r.container.x, r.container.y - 35, '♥'); }
        else if (parent && Math.hypot(parent.container.x + 35 - r.target.x, parent.container.y + 18 - r.target.y) > 55) r.pendingRoute = true;
      }
      let walking = false;
      const next = r.path[0];
      if (next && !this.reducedMotion) {
        const dx = next.x - r.container.x; const dy = next.y - r.container.y; const distance = Math.hypot(dx, dy);
        const step = Math.min(delta, 75) / 1000 * (r.data.kind === 'hero' ? 78 : 100);
        if (distance <= step) { r.container.setPosition(next.x, next.y); r.path.shift(); }
        else { r.container.x += dx / distance * step; r.container.y += dy / distance * step; walking = true; }
        if (Math.abs(dx) > Math.abs(dy)) r.facing = dx > 0 ? 'right' : 'left'; else if (Math.abs(dy) > .1) r.facing = dy > 0 ? 'down' : 'up';
      }
      const activity = r.data.activity;
      if (!walking && r.data.station === 'campfire') r.facing = r.container.x < stations.campfire.x ? 'right' : 'left';
      const stationAnimation = { library: 'read', forge: 'forge', observatory: 'gaze', training: 'train', board: 'work', gate: 'idle', campfire: 'idle', beds: 'sleep' } as const;
      const state = walking ? 'walk' : activity === 'sleeping' ? 'sleep' : activity === 'celebrating' ? 'cheer' : activity === 'working' || activity === 'thinking' ? stationAnimation[r.data.station] : 'idle';
      const key = animationKey(r.prefix, state, r.facing);
      if (key !== r.animation) { r.sprite.play(key); r.animation = key; }
      if (this.reducedMotion) r.sprite.anims.pause(); else if (r.sprite.anims.isPaused) r.sprite.anims.resume();
      r.container.setDepth(Math.round(r.container.y) + 20);
      const recent = Date.now() - r.data.updatedAt < 2500;
      const symbol = r.data.stale ? '…' : activity === 'waiting' ? '?' : activity === 'sleeping' ? 'z z' : activity === 'interrupted' ? '!' : activity === 'celebrating' ? '♥' : recent && r.data.lastEvent === 'MessageDisplay' ? '…' : recent && r.data.lastEvent === 'Notification' ? '♪' : recent && /ModelSwitch/.test(r.data.lastEvent) ? '✦' : '';
      r.bubble.setText(symbol).setVisible(!!symbol && !walking);
      r.bubble.y = (r.data.kind === 'hero' ? -76 : -51) + (this.reducedMotion ? 0 : Math.round(Math.sin(this.time.now / 550 + this.hash(id)) * 2));
      r.selection.clear();
      if (id === this.selectedId) {
        const tint = colors[r.data.palette % colors.length];
        r.selection.lineStyle(2, tint, .9).strokeRect(-21, -6, 42, 11);
        r.selection.fillStyle(tint, 1).fillRect(-3, r.data.kind === 'hero' ? -81 : -53, 6, 4);
      }
      r.shadow.setAlpha(activity === 'sleeping' ? .12 : .2);
      // Departure finishes visually while retaining state for session inspection.
      r.container.setVisible(!(activity === 'leaving' && !r.path.length && this.time.now - r.lastRouteAt > 2000));
    }
  }
  select(id?: string) { this.selectedId = id; }
  setNight(value: boolean) { this.night = value; this.nightOverlay?.setVisible(value); }
  private updateMilestones(completed: number) {
    const count = Math.min(6, Math.floor(completed / 3));
    while (this.milestoneMarkers.length < count) {
      const index = this.milestoneMarkers.length;
      const x = 290 + index * 62; const y = 107;
      const marker = this.add.container(x, y).setDepth(y);
      marker.add([this.add.rectangle(0, 8, 3, 25, 0x705642), this.add.rectangle(8, 0, 17, 11, [0xe9b97b, 0xb9a7db, 0x9ed4b8][index % 3]), this.add.rectangle(8, 2, 12, 3, 0xf7e5bd)]);
      this.milestoneMarkers.push(marker);
    }
  }
  setMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    for (const object of this.ambient) {
      for (const tween of this.tweens.getTweensOf(object)) { if (reduced) tween.pause(); else tween.resume(); }
    }
    if (reduced) for (const r of this.residents.values()) { r.pendingRoute = true; r.lastRouteAt = -2000; }
  }
  setZoom(value: number) {
    this.zoomLevel = Phaser.Math.Clamp(value, 1, 2);
    this.cameras.main.setZoom(this.zoomLevel);
    this.cameras.main.stopFollow();
    if (this.zoomLevel === 1) this.cameras.main.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    else if (this.selectedId) {
      const r = this.residents.get(this.selectedId);
      if (r) this.cameras.main.startFollow(r.container, true, this.reducedMotion ? 1 : .08, this.reducedMotion ? 1 : .08, 0, 35);
    }
  }
  portrait(data: ActorState): string {
    if (!this.ready) return '';
    const prefix = createActorTextures(this, data.palette, data.kind, data.look); const cached = this.portraitCache.get(prefix); if (cached) return cached;
    const width = data.kind === 'hero' ? 24 : 16; const height = data.kind === 'hero' ? 32 : 20;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const source = this.textures.get(prefix).getSourceImage() as HTMLCanvasElement;
    canvas.getContext('2d')!.drawImage(source, 0, 0, width, height, 0, 0, width, height);
    const url = canvas.toDataURL(); this.portraitCache.set(prefix, url); return url;
  }
  private sparkle(x: number, y: number, text: string) {
    if (this.reducedMotion) return;
    const mark = this.add.text(x, y, text, { fontSize: '18px', fontFamily: 'Consolas, monospace', color: text === '♥' ? '#bf736a' : '#fff8c9', stroke: '#8b9a58', strokeThickness: 2 }).setOrigin(.5).setDepth(2000);
    this.tweens.add({ targets: mark, y: y - 30, alpha: 0, duration: 1300, onComplete: () => mark.destroy() });
  }
  private addAmbient() {
    for (let i = 0; i < 7; i++) {
      const bug = this.add.container(220 + (i * 113) % 540, 250 + (i * 79) % 270).setDepth(900);
      const tint = i % 2 ? 0xffeb98 : 0xf8d2a8;
      bug.add([this.add.rectangle(-3, 0, 4, 4, tint), this.add.rectangle(3, 0, 4, 4, tint), this.add.rectangle(0, 1, 2, 5, 0x81744f)]);
      this.ambient.push(bug);
      this.tweens.add({ targets: bug, x: bug.x + 36, y: bug.y - 15, duration: 2400 + i * 310, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }
  private hash(value: string) { let n = 0; for (const c of value) n = (n * 31 + c.charCodeAt(0)) >>> 0; return n; }
}
export function createWorld() {
  const scene = new VillageScene();
  const game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: WORLD_WIDTH, height: WORLD_HEIGHT, pixelArt: true, roundPixels: true, backgroundColor: '#b8ce8a', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [scene], render: { antialias: false }, audio: { noAudio: true } });
  return { scene, game };
}
