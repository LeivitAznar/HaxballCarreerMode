import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Create simple textures programmatically
    const graphics = this.make.graphics({x: 0, y: 0});
    
    // Ball texture
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(6, 6, 6);
    graphics.lineStyle(1, 0x000000, 0.5);
    graphics.strokeCircle(6, 6, 6);
    graphics.generateTexture('ball', 12, 12);
    graphics.clear();

    // Player base texture (we'll tint this)
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(12, 12, 12);
    graphics.generateTexture('player_base', 24, 24);
    graphics.clear();
    
    // User highlight ring
    graphics.lineStyle(2, 0xffff00, 1);
    graphics.strokeCircle(14, 14, 13);
    graphics.generateTexture('user_ring', 28, 28);
    graphics.clear();
  }

  create() {
    this.scene.start('MatchScene');
  }
}
