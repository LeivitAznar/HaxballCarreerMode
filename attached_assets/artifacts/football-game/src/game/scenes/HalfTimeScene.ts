import Phaser from 'phaser';

export default class HalfTimeScene extends Phaser.Scene {
  constructor() {
    super('HalfTimeScene');
  }

  create() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Dim background
    const bg = this.add.rectangle(0, 0, width, height, 0x000000, 0.7);
    bg.setOrigin(0);

    const text = this.add.text(width / 2, height / 2, 'HALF TIME', {
      fontFamily: 'system-ui',
      fontSize: '48px',
      color: '#ffffff',
      fontStyle: 'bold'
    });
    text.setOrigin(0.5);

    // Automatically resume after 3 seconds
    this.time.delayedCall(3000, () => {
      this.scene.stop();
      this.scene.resume('MatchScene', { halfChanged: true });
    });
  }
}
