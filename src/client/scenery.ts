import Phaser from 'phaser';
import type { Station } from '../shared/types';

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 640;
export const TILE = 32;
export const stations: Record<Station, { x: number; y: number; label: string }> = {
  library: { x: 180, y: 238, label: 'THE READING ROOM' },
  forge: { x: 770, y: 238, label: 'LITTLE FORGE' },
  training: { x: 480, y: 228, label: 'TRAINING YARD' },
  board: { x: 480, y: 350, label: 'QUEST BOARD' },
  beds: { x: 180, y: 475, label: 'DREAM COTTAGE' },
  campfire: { x: 460, y: 525, label: 'CAMPFIRE' },
  observatory: { x: 790, y: 495, label: 'STAR WATCH' },
  gate: { x: 480, y: 605, label: 'VILLAGE GATE' },
};

type Paint = (ctx: CanvasRenderingContext2D) => void;
const box = (c: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) => {
  c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h);
};
const palette = { ink: '#365449', grass: '#86b873', light: '#a2c987', dark: '#6aa66a', path: '#dec793', edge: '#c4b27f', cream: '#f6dfac', wood: '#9a6949', roof: '#738f9b' };

/** Original village art: tiny square brush strokes, no external image assets. */
export function drawVillage(scene: Phaser.Scene): { blocked: Set<string>; ambient: Phaser.GameObjects.GameObject[]; trees: Phaser.GameObjects.Image[] } {
  const blocked = new Set<string>();
  const ambient: Phaser.GameObjects.GameObject[] = [];
  const trees: Phaser.GameObjects.Image[] = [];
  let serial = 0;
  const texture = (name: string, w: number, h: number, paint: Paint) => {
    const key = `village-${name}-${serial++}`;
    const canvas = scene.textures.createCanvas(key, w, h)!;
    paint(canvas.context); canvas.refresh(); return key;
  };
  const prop = (name: string, x: number, y: number, w: number, h: number, paint: Paint) =>
    scene.add.image(x, y, texture(name, w, h, paint)).setOrigin(0.5, 1).setDepth(y);
  const block = (x: number, y: number, w: number, h: number) => {
    for (let ty = Math.floor(y / TILE); ty <= Math.floor((y + h - 1) / TILE); ty++)
      for (let tx = Math.floor(x / TILE); tx <= Math.floor((x + w - 1) / TILE); tx++) blocked.add(`${tx},${ty}`);
  };
  const ground = texture('ground', WORLD_WIDTH, WORLD_HEIGHT, c => {
    box(c, palette.grass, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    let seed = 457;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 2400; i++) {
      const x = Math.floor(random() * 480) * 2, y = Math.floor(random() * 320) * 2;
      box(c, i % 3 === 0 ? '#98c47e' : '#7db16f', x, y, 2 + (i % 2) * 2, 2);
    }
    const path = (x: number, y: number, w: number, h: number) => {
      box(c, palette.edge, x - 4, y - 4, w + 8, h + 8);
      box(c, palette.path, x, y, w, h);
    };
    path(446, 210, 68, 430); path(148, 222, 662, 48);
    path(156, 244, 48, 248); path(188, 456, 300, 48);
    path(478, 454, 332, 48); path(750, 250, 48, 244);
    // A generous rounded clearing around the quest board.
    path(400, 294, 164, 90); path(422, 280, 120, 118);
    for (let i = 0; i < 420; i++) {
      const x = Math.floor(random() * 480) * 2, y = Math.floor(random() * 320) * 2;
      if (c.getImageData(x, y, 1, 1).data[0] === 222) box(c, i % 2 ? '#d0ba88' : '#ebd4a1', x, y, 4, 2);
    }
    // Pond, stepped bank, lily pads, and square ripples.
    box(c, '#699965', 28, 320, 94, 106); box(c, '#d1bd89', 36, 326, 86, 96);
    box(c, '#579a9a', 42, 332, 74, 86); box(c, '#73b6b6', 48, 338, 62, 72);
    box(c, '#82c5bf', 52, 342, 54, 6);
    [[54, 364], [82, 390], [64, 406]].forEach(([x,y]) => { box(c, '#a1ddd0', x, y, 20, 2); box(c, '#a1ddd0', x+4, y+6, 10, 2); });
    box(c, '#528c60', 86, 354, 16, 8); box(c, '#a5c273', 86, 352, 12, 6); box(c, '#f4c3c4', 90, 348, 4, 4);
    // Stone fire circle and telescope deck.
    box(c, '#6a9364', 410, 496, 96, 70); box(c, '#c7b28b', 418, 502, 80, 56);
    box(c, '#b9986d', 738, 432, 108, 48);
    for (let y = 436; y < 480; y += 8) box(c, '#d1af7c', 740, y, 104, 4);
    // Flowers cluster near the edge so actors have room to roam.
    for (let i = 0; i < 95; i++) {
      const x = 34 + Math.floor(random() * 440) * 2, y = 72 + Math.floor(random() * 250) * 2;
      if (c.getImageData(x, y, 1, 1).data[0] !== 134) continue;
      box(c, '#528b59', x+2, y, 2, 8);
      box(c, ['#f3cc88','#f1b5aa','#f7e8b7'][i%3], x, y, 6, 4);
      box(c, '#d69770', x+2, y+2, 2, 2);
    }
  });
  scene.add.image(0, 0, ground).setOrigin(0).setDepth(-1000);
  block(28, 320, 94, 106);

  const cottage = (name: string, x: number, base: number, roofColor: string, library: boolean) => {
    prop(name, x, base, 184, 156, c => {
      box(c, '#6b9867', 10, 146, 166, 8);
      box(c, palette.ink, 24, 54, 138, 94); box(c, palette.cream, 28, 58, 130, 84);
      box(c, '#d5b783', 28, 126, 130, 16);
      for (const bx of [30, 88, 152]) box(c, palette.wood, bx, 60, 6, 82);
      box(c, palette.wood, 28, 102, 130, 6);
      box(c, palette.ink, 12, 44, 162, 22); box(c, palette.ink, 24, 30, 138, 20);
      box(c, palette.ink, 38, 16, 110, 18); box(c, palette.ink, 52, 4, 82, 16);
      box(c, roofColor, 16, 44, 154, 16); box(c, roofColor, 28, 30, 130, 16);
      box(c, roofColor, 42, 16, 102, 16); box(c, roofColor, 56, 8, 74, 10);
      for (let row = 0; row < 4; row++) for (let n = 0; n < 6-row; n++) box(c, '#ffffff30', 28+n*24+row*12, 50-row*12, 18, 2);
      box(c, palette.ink, 78, 108, 30, 40); box(c, '#705b44', 82, 112, 22, 36); box(c, '#c8a568', 98, 128, 4, 4);
      for (const wx of [42, 120]) {
        box(c, palette.ink, wx, 76, 26, 24); box(c, '#8bbab7', wx+4, 80, 18, 16);
        box(c, '#f6dc9d', wx+12, 80, 2, 16); box(c, '#f6dc9d', wx+4, 86, 18, 2);
        box(c, palette.wood, wx-2, 100, 30, 6);
      }
      box(c, '#e2c698', 76, 146, 36, 6);
      if (library) {
        box(c, palette.ink, 76, 68, 34, 24); box(c, '#f4e6bc', 80, 72, 12, 16); box(c, '#e9d29d', 94, 72, 12, 16); box(c, '#b68d61', 92, 74, 2, 16);
      } else {
        box(c, '#e6c371', 85, 72, 14, 14); box(c, palette.cream, 90, 70, 12, 12);
        box(c, palette.wood, 4, 124, 18, 20); box(c, '#a8c584', 2, 120, 22, 8);
      }
    });
    block(x-68, base-90, 136, 78);
  };
  cottage('library', 180, 218, '#728fa0', true);
  cottage('beds', 180, 454, '#b8868e', false);

  prop('forge', 770, 218, 190, 152, c => {
    box(c, '#709566', 8, 142, 174, 8);
    box(c, palette.ink, 20, 60, 154, 84); box(c, '#c7b79c', 24, 64, 146, 76);
    for (let y=68; y<138; y+=14) for (let x=26; x<166; x+=26) box(c, '#a59380', x+(y%28?0:10), y, 18, 2);
    box(c, palette.ink, 12, 44, 168, 22); box(c, '#b97d60', 16, 48, 160, 14);
    box(c, palette.ink, 26, 28, 140, 20); box(c, '#c98d69', 30, 32, 132, 14);
    box(c, palette.ink, 40, 14, 110, 18); box(c, '#dba577', 44, 18, 102, 12);
    box(c, palette.ink, 134, 0, 24, 40); box(c, '#a69382', 138, 4, 16, 34); box(c, '#756d68', 130, 0, 32, 6);
    box(c, palette.ink, 114, 88, 40, 52); box(c, '#674b43', 118, 92, 32, 48);
    box(c, '#e79457', 120, 120, 28, 18); box(c, '#f3c871', 126, 114, 16, 24);
    box(c, palette.ink, 44, 92, 34, 34); box(c, '#8fb4af', 48, 96, 26, 26);
    box(c, palette.wood, 30, 132, 76, 8); box(c, palette.wood, 36, 138, 6, 12); box(c, palette.wood, 94, 138, 6, 12);
    box(c, '#465a60', 52, 124, 34, 8); box(c, '#637b7b', 46, 118, 44, 8); box(c, '#a4b6a5', 50, 116, 26, 4);
  });
  block(698, 132, 140, 80);

  prop('dummy', 480, 204, 64, 92, c => {
    box(c, '#689b64', 4, 84, 56, 6); box(c, '#77583e', 30, 38, 6, 50);
    box(c, palette.ink, 20, 12, 26, 26); box(c, '#d1ae72', 24, 16, 18, 18);
    box(c, '#a98455', 24, 28, 18, 2); box(c, '#65543d', 26, 22, 4, 4); box(c, '#65543d', 36, 22, 4, 4);
    box(c, palette.ink, 18, 40, 30, 32); box(c, '#bca375', 22, 44, 22, 24);
    box(c, '#997b54', 4, 44, 56, 8); box(c, '#e4c790', 22, 48, 22, 4); box(c, '#e4c790', 30, 44, 4, 24);
  });
  block(462, 166, 36, 40);
  prop('board', 480, 324, 98, 76, c => {
    box(c, '#75573f', 18, 32, 8, 42); box(c, '#75573f', 74, 32, 8, 42);
    box(c, palette.ink, 8, 16, 84, 42); box(c, '#966c49', 12, 20, 76, 34);
    box(c, palette.ink, 2, 10, 96, 12); box(c, '#b78554', 6, 8, 88, 10); box(c, '#c89b61', 16, 2, 68, 8);
    [[20,26],[42,24],[64,28]].forEach(([x,y],i) => { box(c, '#f7e3af', x, y, 16, 22-i*2); box(c, '#ad946b', x+4,y+6,8,2); box(c, '#ad946b',x+4,y+12,6,2); box(c, '#df976b', x+6,y,4,4); });
  });
  block(440, 274, 80, 46);
  prop('telescope', 790, 470, 84, 84, c => {
    box(c, '#65533f', 38, 42, 8, 40); box(c, '#65533f', 18, 74, 24, 6); box(c, '#65533f', 44, 74, 22, 6);
    box(c, '#8f7652', 24, 58, 8, 18); box(c, '#8f7652', 54, 58, 8, 18);
    box(c, palette.ink, 18, 24, 40, 20); box(c, '#dfb56d', 22, 28, 32, 12);
    box(c, palette.ink, 48, 14, 24, 22); box(c, '#efc980', 50, 18, 18, 14);
    box(c, palette.ink, 64, 10, 12, 28); box(c, '#9bd0c5', 68, 14, 4, 20);
    box(c, '#f9e4a6', 24, 28, 28, 4); box(c, '#667d78', 10, 36, 12, 12);
  });
  block(766, 440, 48, 32);
  prop('firewood', 460, 552, 68, 48, c => {
    box(c, '#77796a', 2, 30, 12, 10); box(c, '#77796a', 54, 28, 12, 12); box(c, '#a6a690', 4, 26, 10, 6); box(c, '#a6a690', 54, 24, 10, 6);
    box(c, '#78513d', 12, 28, 44, 10); box(c, '#ac8054', 16, 28, 36, 4);
    box(c, '#78513d', 24, 18, 20, 26); box(c, '#ac8054', 28, 22, 4, 20);
  });
  const flame = prop('flame', 460, 540, 36, 44, c => {
    box(c, '#cd7650', 6, 20, 24, 22); box(c, '#ef9f56', 10, 10, 20, 28); box(c, '#ef9f56', 4, 24, 26, 14);
    box(c, '#f7c870', 12, 4, 8, 32); box(c, '#ffe4a0', 14, 24, 10, 16); box(c, '#ffe4a0', 18, 18, 4, 10);
  });
  ambient.push(flame);
  scene.tweens.add({ targets: flame, scaleY: 0.86, alpha: 0.85, duration: 350, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });

  // Forest canopy frames the village; trunks determine character occlusion.
  const treeTexture = texture('tree', 68, 88, c => {
    box(c, '#65965e', 6, 80, 58, 6); box(c, palette.ink, 28, 48, 14, 36); box(c, '#9a754e', 32, 50, 6, 32);
    box(c, '#365f49', 8, 30, 54, 34); box(c, '#365f49', 16, 14, 38, 46); box(c, '#365f49', 26, 2, 18, 60);
    box(c, '#4b8657', 12, 30, 46, 28); box(c, '#4b8657', 20, 14, 30, 42); box(c, '#4b8657', 28, 6, 14, 46);
    box(c, '#76a76b', 20, 26, 14, 8); box(c, '#76a76b', 28, 12, 10, 10); box(c, '#619a61', 14, 38, 20, 10); box(c, '#619a61', 34, 44, 20, 10);
    box(c, '#9abd7b', 24, 26, 6, 4);
  });
  const tree = (x: number, y: number) => { trees.push(scene.add.image(x,y,treeTexture).setOrigin(.5,1).setDepth(y)); block(x-12,y-20,24,20); };
  for (let x=26;x<960;x+=52) tree(x, 82+(x%3)*4);
  for (let y=154;y<640;y+=76) { tree(20,y); tree(942,y+16); }
  [80, 304, 358, 620, 678, 878].forEach((x,i) => tree(x, i%2 ? 166 : 132));
  [82, 282, 336, 620, 680, 872].forEach((x,i) => tree(x, 624-(i%2)*18));

  // Small props give each clearing a lived-in feel.
  [[306,252],[652,254],[290,486]].forEach(([x,y],i) => prop(`crate-${i}`,x,y,32,34,c => {
    box(c,palette.ink,2,4,28,28); box(c,'#ad8459',4,6,24,24); box(c,'#d0a570',6,8,20,4);
    box(c,'#76583f',8,12,4,16); box(c,'#76583f',20,12,4,16); box(c,'#d0a570',4,26,24,4);
  }));
  [[348,422],[650,380],[852,330],[298,342]].forEach(([x,y],i) => prop(`rock-${i}`,x,y,28,20,c => {
    box(c,'#5f8268',2,14,24,4); box(c,'#778b7c',4,6,20,10); box(c,'#94a595',8,2,12,12); box(c,'#bdc5a8',10,4,8,4);
  }));
  [[98,284],[864,286],[304,540],[674,550]].forEach(([x,y],i) => prop(`mushroom-${i}`,x,y,18,20,c => {
    box(c,'#e7d6ac',8,8,4,10); box(c,'#965945',2,6,14,6); box(c,'#d58e72',4,2,10,8); box(c,'#f1d7a4',6,4,4,2);
  }));
  for (const [key, station] of Object.entries(stations)) {
    const labelY = key === 'gate' ? 628 : key === 'campfire' ? 582 : station.y + 20;
    scene.add.text(station.x, labelY, station.label, { fontFamily: 'monospace', fontSize: '9px', color: '#52664e', backgroundColor: '#e7d5a4', padding: { x: 4, y: 2 } }).setOrigin(.5).setDepth(-900);
    blocked.delete(`${Math.floor(station.x/TILE)},${Math.floor(station.y/TILE)}`);
  }
  return { blocked, ambient, trees };
}
