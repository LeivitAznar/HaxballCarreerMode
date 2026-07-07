import Phaser from 'phaser';

/**
 * BootScene: generates all programmatic textures used by the game.
 * Every texture is created ONCE here — never recreated per frame.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    const g = this.make.graphics({ x: 0, y: 0 });

    // ── Soccer ball (16×16): white circle + classic pentagon patches ─────────
    // Base white circle
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    // Edge shadow for volume
    g.lineStyle(1, 0xcccccc, 0.9);
    g.strokeCircle(8, 8, 8);
    // Pentagon patches — 1 center + 5 outer arranged in regular pentagon
    // Outer patch positions (radius 5 from center, starting top, going clockwise):
    // k=0: (8, 3)  k=1: (13, 6)  k=2: (11, 12)  k=3: (5, 12)  k=4: (3, 6)
    g.fillStyle(0x111111, 0.88);
    g.fillCircle(8,  8,  2.2); // center
    g.fillCircle(8,  3,  1.8); // top
    g.fillCircle(13, 6,  1.8); // top-right
    g.fillCircle(11, 12, 1.8); // bottom-right
    g.fillCircle(5,  12, 1.8); // bottom-left
    g.fillCircle(3,  6,  1.8); // top-left
    g.generateTexture('ball', 16, 16);
    g.clear();

    // ── Pixel: 1×1 white pixel — used for static wall bodies ────────────────
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 1, 1);
    g.generateTexture('pixel', 1, 1);
    g.clear();

    // ── Goalpost: small circle — static body with bounce ─────────────────────
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6, 6, 6);
    g.lineStyle(1, 0xdddddd, 1);
    g.strokeCircle(6, 6, 6);
    g.generateTexture('post', 12, 12);
    g.clear();

    g.destroy();
  }

  create() {
    this.scene.start('MatchScene');
  }
}
