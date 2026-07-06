import Phaser from 'phaser';

/**
 * BootScene: generates all programmatic textures used by the game.
 * Textures are created in preload() so they're available immediately in create().
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    const g = this.make.graphics({ x: 0, y: 0 });

    // ── Ball: white circle with black pentagon hint ──────────────────
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.lineStyle(1, 0x222222, 0.8);
    g.strokeCircle(8, 8, 8);
    // Simple pentagon pattern on ball
    g.fillStyle(0x111111, 0.6);
    g.fillCircle(8, 8, 3);
    g.generateTexture('ball', 16, 16);
    g.clear();

    // ── Player base: solid circle (tinted per team at runtime) ───────
    g.fillStyle(0xffffff, 1);
    g.fillCircle(12, 12, 12);
    g.lineStyle(1, 0x000000, 0.3);
    g.strokeCircle(12, 12, 12);
    g.generateTexture('player_base', 24, 24);
    g.clear();

    // ── User highlight ring: yellow outline around user player ───────
    g.lineStyle(3, 0xffd700, 1);
    g.strokeCircle(14, 14, 13);
    g.generateTexture('user_ring', 28, 28);
    g.clear();

    // ── Pixel: 1x1 white pixel used for static wall bodies ───────────
    // The actual rendering is invisible (setAlpha(0) at runtime)
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 1, 1);
    g.generateTexture('pixel', 1, 1);
    g.clear();

    // ── Goalpost: solid white circle for post collision bodies ───────
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6, 6, 6);
    g.lineStyle(1, 0xcccccc, 1);
    g.strokeCircle(6, 6, 6);
    g.generateTexture('post', 12, 12);
    g.clear();

    g.destroy();
  }

  create() {
    this.scene.start('MatchScene');
  }
}
