import Phaser from 'phaser';
import type { AgentRole } from '../shared/types';

export type ActorAnimation = 'idle' | 'walk' | 'work' | 'read' | 'forge' | 'gaze' | 'train' | 'sleep' | 'cheer';
export type ActorFacing = 'down' | 'up' | 'left' | 'right';
const states: ActorAnimation[] = ['idle', 'walk', 'work', 'read', 'forge', 'gaze', 'train', 'sleep', 'cheer'];
const directions: ActorFacing[] = ['down', 'up', 'left', 'right'];
const palettes = [
  ['#66ad70', '#a5e38d', '#355940'], ['#679acc', '#b0daf0', '#354a74'],
  ['#be79ba', '#edb5d9', '#70476f'], ['#d99b51', '#ffe1a0', '#865538'],
  ['#d16f77', '#ffbca0', '#81454e'], ['#69b8ad', '#adedd2', '#346c69'],
  ['#9690d4', '#d9ccff', '#535081'], ['#c1ad70', '#f5edb4', '#76663f'],
];
const ink = '#293342';

export function animationKey(prefix: string, state: ActorAnimation, facing: ActorFacing): string {
  return `${prefix}-${state}-${facing}`;
}

/** Original pixel templates, authored directly at native resolution. Feet anchor: (width/2,height). */
export function createActorTextures(scene: Phaser.Scene, palette: number, kind: 'hero' | 'companion', look = 0, role: AgentRole = 'general'): string {
  const index = ((Math.floor(palette) % palettes.length) + palettes.length) % palettes.length;
  const variant = Math.max(0, Math.min(3, Math.floor(look) || 0));
  const prefix = `actor-${kind}-${index}-${variant}-${kind === 'companion' ? role : 'lead'}`;
  if (scene.textures.exists(prefix)) return prefix;
  const width = kind === 'hero' ? 24 : 16;
  const height = kind === 'hero' ? 32 : 20;
  const canvas = document.createElement('canvas');
  canvas.width = width * 4;
  canvas.height = height * states.length * directions.length;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Pixel sprite canvas is unavailable');
  context.imageSmoothingEnabled = false;
  const colors = palettes[index]!;
  for (let s = 0; s < states.length; s++) {
    for (let d = 0; d < directions.length; d++) {
      for (let frame = 0; frame < 4; frame++) {
        context.save();
        context.translate(frame * width, (s * 4 + d) * height);
        if (kind === 'hero') drawHero(context, colors, states[s]!, directions[d]!, frame, variant);
        else drawCompanion(context, colors, states[s]!, directions[d]!, frame, variant, role);
        context.restore();
      }
    }
  }
  const texture = scene.textures.addCanvas(prefix, canvas);
  if (!texture) throw new Error(`Could not create sprite texture ${prefix}`);
  for (let row = 0; row < states.length * directions.length; row++) {
    for (let frame = 0; frame < 4; frame++) {
      texture.add(row * 4 + frame, 0, frame * width, row * height, width, height);
    }
  }
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  for (let s = 0; s < states.length; s++) {
    for (let d = 0; d < directions.length; d++) {
      const start = (s * 4 + d) * 4;
      scene.anims.create({
        key: animationKey(prefix, states[s]!, directions[d]!),
        frames: scene.anims.generateFrameNumbers(prefix, { start, end: start + 3 }),
        frameRate: states[s] === 'walk' ? 8 : states[s] === 'work' || states[s] === 'cheer' ? 6 : 3,
        repeat: -1,
      });
    }
  }
  return prefix;
}

function painter(context: CanvasRenderingContext2D) {
  return (color: string, x: number, y: number, w: number, h: number) => {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  };
}

function drawHero(context: CanvasRenderingContext2D, colors: string[], state: ActorAnimation, direction: ActorFacing, frame: number, look: number) {
  const r = painter(context);
  const [coat, light, dark] = look === 3 ? ['#4e986d', '#a9d685', '#345d49'] : colors as [string, string, string];
  const skin = '#efbf91';
  const hair = '#79523b';
  const side = direction === 'left' || direction === 'right';
  if (direction === 'left') { context.translate(24, 0); context.scale(-1, 1); }
  if (state === 'sleep') {
    r(ink, 3, 22, 18, 8); r(dark, 4, 23, 16, 6); r(coat, 10, 23, 10, 5);
    r(hair, 3, 20, 8, 8); r(skin, 4, 22, 6, 5); r(ink, 5, 24, 3, 1);
    r(light, 12, 23, 7, 1); r('#c7dce2', 1, 28, 21, 2);
    if (frame >= 2) { r('#e2f4e2', 17, 12, 4, 1); r('#e2f4e2', 19, 13, 1, 2); r('#e2f4e2', 17, 15, 4, 1); }
    return;
  }
  const bob = ((state === 'walk' || state === 'cheer') && frame % 2 === 1) || (state === 'idle' && frame >= 2) ? -1 : 0;
  const stride = state === 'walk' ? [0, -1, 0, 1][frame]! : 0;
  // Boots retain a stable bottom anchor while the body bobs above them.
  r(ink, 7 + stride, 27, 5, 5); r(ink, 13 - stride, 27, 5, 5);
  r('#74513e', 8 + stride, 28, 3, 3); r('#74513e', 14 - stride, 28, 3, 3);
  r(ink, 6, 17 + bob, 13, 11); r(dark, 7, 18 + bob, 11, 9);
  r(coat, 8, 18 + bob, 9, 7); r(light, 8, 18 + bob, 2, 6);
  r('#bfa16b', 7, 25 + bob, 11, 2); r('#f5dc8e', 11, 25 + bob, 2, 2);
  const hands = state === 'cheer' ? 12 + bob : ['work', 'forge', 'train'].includes(state) ? 18 + bob + (frame % 2) : 21 + bob;
  r(ink, 4, hands, 3, 5); r(skin, 5, hands, 2, 4);
  r(ink, 18, hands, 3, 5); r(skin, 18, hands, 2, 4);
  if (state === 'work' || state === 'forge' || state === 'train') {
    r(ink, 20, 12 + frame % 2, 1, 10); r('#b4c6c8', 18, 11 + frame % 2, 5, 3);
  }
  r(ink, 7, 7 + bob, 11, 12); r(hair, 8, 8 + bob, 9, 10);
  if (direction !== 'up') {
    r(skin, side ? 11 : 8, 11 + bob, side ? 7 : 9, 7);
    r('#ffe0b0', side ? 14 : 9, 11 + bob, 3, 2);
    r(ink, side ? 16 : 9, 13 + bob, 1, 2);
    if (!side) r(ink, 14, 13 + bob, 1, 2);
    r('#bd7e72', side ? 16 : 11, 16 + bob, 2, 1);
  } else {
    r('#976447', 9, 11 + bob, 2, 6); r(dark, 8, 19 + bob, 9, 5);
    r(light, 10, 20 + bob, 5, 1);
  }
  // Soft pointed cap and a contrasting feather: an original village adventurer.
  r(ink, 6, 8 + bob, 13, 3); r(ink, 8, 4 + bob, 10, 5);
  r(ink, 15, 2 + bob, 5, 4); r(coat, 9, 5 + bob, 8, 4);
  r(coat, 16, 3 + bob, 3, 3); r(light, 9, 5 + bob, 5, 1);
  r(dark, 7, 9 + bob, 11, 1); r('#f9d994', 6, 3 + bob, 2, 5); r('#fff0c8', 6, 2 + bob, 1, 3);
  if (look === 1) { r('#735239', 5, 7 + bob, 15, 3); r(light, 10, 4 + bob, 7, 3); }
  if (look === 2) { r('#72a46d', 5, 7 + bob, 15, 3); r('#f4b5c3', 8, 4 + bob, 3, 3); r('#e6df8c', 15, 3 + bob, 3, 3); }
  if (look === 3) { r('#355d45', 5, 8 + bob, 15, 3); r('#73b779', 7, 4 + bob, 13, 5); r('#73b779', 15, 2 + bob, 7, 4); r('#a8ce89', 18, 2 + bob, 3, 2); r('#bd8b51', 2, 20 + bob, 3, 8); }
  if (state === 'read') { r(ink, 2, 19, 11, 8); r('#f2e6bf', 3, 20, 9, 6); r('#d3a96d', 7, 20, 1, 6); }
  if (state === 'forge') { r('#f4ae53', 2 + frame % 2, 14, 3, 4); r('#ffe4a2', 3 + frame % 2, 13, 1, 3); }
  if (state === 'gaze') { r('#b6d7db', 18, 17, 5, 3); r(ink, 20, 16, 2, 10); r('#f6e9af', 21, 12 + frame % 2, 2, 2); }
  if (state === 'train') { r('#c7bdb0', 2, 24, 6, 2); r('#f8e29a', 2 + frame % 2, 13, 2, 2); }
}

function drawCompanion(context: CanvasRenderingContext2D, colors: string[], state: ActorAnimation, direction: ActorFacing, frame: number, look: number, role: AgentRole) {
  const r = painter(context);
  const [fur, light, dark] = look === 3 ? ['#e0b85e', '#fff0ac', '#956d53'] : colors as [string, string, string];
  if (direction === 'left') { context.translate(16, 0); context.scale(-1, 1); }
  if (state === 'sleep') {
    r(ink, 2, 12, 12, 7); r(fur, 3, 13, 10, 5); r(light, 4, 14, 6, 3);
    r(ink, 4, 15, 2, 1); r(ink, 8, 15, 2, 1); r(dark, 11, 11, 3, 5);
    if (frame > 1) r('#e5f4e0', 12, 7, 2, 2);
    return;
  }
  const bob = ((state === 'walk' || state === 'cheer') && frame % 2 === 1) || (state === 'idle' && frame >= 2) ? -1 : 0;
  const side = direction === 'right' || direction === 'left';
  const stride = state === 'walk' ? [0, -1, 0, 1][frame]! : 0;
  r(ink, 3 + stride, 17, 4, 3); r(ink, 9 - stride, 17, 4, 3);
  r(dark, 4 + stride, 18, 2, 1); r(dark, 10 - stride, 18, 2, 1);
  // Sprout-eared woodland creature with rounded cheeks, tail, and neck scarf.
  if (look === 1) { r(ink, 1, 3 + bob, 5, 6); r(ink, 10, 2 + bob, 5, 7); r(dark, 2, 4 + bob, 3, 4); r(dark, 11, 3 + bob, 3, 5); }
  else if (look === 2) { r(ink, 2, 2 + bob, 4, 7); r(ink, 10, 2 + bob, 4, 7); r(light, 3, 3 + bob, 2, 4); r(light, 11, 3 + bob, 2, 4); }
  else if (look === 3) { r(ink, 3, 0 + bob, 2, 8); r(ink, 11, 1 + bob, 2, 7); r('#ffe4a0', 3, 1 + bob, 2, 6); r('#ffe4a0', 11, 2 + bob, 2, 5); }
  else { r(ink, 3, 3 + bob, 3, 6); r(ink, 10, 2 + bob, 3, 7); }
  r(light, 4, 4 + bob, 1, 4); r(light, 11, 3 + bob, 1, 5);
  r(ink, 3, 7 + bob, 10, 10); r(ink, 2, 9 + bob, 12, 6);
  r(fur, 4, 7 + bob, 8, 10); r(fur, 3, 9 + bob, 10, 6);
  r(light, 4, 11 + bob, 8, 5);
  if (direction === 'up') {
    r(dark, 5, 8 + bob, 6, 1); r(light, 6, 14 + bob, 4, 2);
  } else {
    const eyeY = 10 + bob;
    r(ink, side ? 11 : 5, eyeY, 1, state === 'cheer' ? 1 : 2);
    if (!side) r(ink, 10, eyeY, 1, state === 'cheer' ? 1 : 2);
    r('#fef4d5', side ? 11 : 5, eyeY, 1, 1);
    r(ink, side ? 12 : 7, 13 + bob, 2, 1);
    r('#d68d8f', 4, 13 + bob, 2, 1);
  }
  r('#e7c27b', 4, 16 + bob, 8, 1); r('#c47f48', 10, 17 + bob, 2, 2);
  r(ink, side ? 0 : 13, 12 + bob, 2, 5); r(dark, side ? 1 : 13, 13 + bob, 1, 3);
  if (look === 1) { r(dark, 13, 8 + bob, 3, 2); r(light, 14, 6 + bob, 2, 2); }
  if (look === 3) { r(ink, 13, 8 + bob, 3, 5); r('#ffe4a0', 14, 8 + bob, 2, 3); r('#ffe4a0', 12, 11 + bob, 2, 2); }
  if (['work', 'read', 'forge', 'gaze', 'train'].includes(state)) { r('#eed891', 12, 9 + frame % 2, 3, 3); r('#fff2b1', 13, 8 + frame % 2, 1, 5); }
  if (state === 'cheer') { r(light, 1, 7 + bob, 2, 2); r(light, 13, 7 + bob, 2, 2); }
  // Small role props keep companion identity recognizable even when species changes.
  if (role === 'designer') { r('#c06d95', 3, 3 + bob, 10, 3); r('#f8d5a0', 11, 2 + bob, 3, 3); r('#e17b75', 1, 15 + bob, 3, 2); }
  if (role === 'developer') { r(ink, 4, 9 + bob, 4, 1); r(ink, 9, 9 + bob, 4, 1); r('#b6dded', 4, 10 + bob, 3, 1); r('#b6dded', 10, 10 + bob, 3, 1); r('#567389', 1, 14 + bob, 4, 4); }
  if (role === 'project-manager') { r('#e5bb67', 3, 3 + bob, 10, 3); r('#f2dd9b', 12, 11 + bob, 4, 7); r('#8d6649', 13, 12 + bob, 2, 3); }
  if (role === 'explorer') { r('#83ad74', 2, 5 + bob, 12, 3); r('#f8e0aa', 11, 4 + bob, 3, 2); }
  if (role === 'planner') { r('#a8a2d8', 4, 4 + bob, 8, 3); r('#f1dfb3', 12, 11 + bob, 4, 6); r('#9274a3', 13, 12 + bob, 2, 4); }
  if (role === 'tester') { r('#b8d5d5', 3, 8 + bob, 10, 3); r(ink, 6, 9 + bob, 1, 1); r(ink, 10, 9 + bob, 1, 1); r('#d27672', 12, 14 + bob, 3, 3); }
}
