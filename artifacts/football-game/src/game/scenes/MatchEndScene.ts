import Phaser from 'phaser';

export default class MatchEndScene extends Phaser.Scene {
  constructor() {
    super('MatchEndScene');
  }

  create() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const bg = this.add.rectangle(0, 0, width, height, 0x000000, 0.8);
    bg.setOrigin(0);

    const matchData = this.game.registry.get('matchData');
    const scoreState = this.game.registry.get('scoreState');

    const text = this.add.text(width / 2, height / 2 - 50, 'FULL TIME', {
      fontFamily: 'system-ui',
      fontSize: '48px',
      color: '#ffffff',
      fontStyle: 'bold'
    });
    text.setOrigin(0.5);

    const scoreText = this.add.text(width / 2, height / 2 + 20, `${scoreState.home} - ${scoreState.away}`, {
      fontFamily: 'system-ui',
      fontSize: '64px',
      color: '#2ea043',
      fontStyle: 'bold'
    });
    scoreText.setOrigin(0.5);

    const continueBtn = this.add.text(width / 2, height / 2 + 120, 'Press SPACE to Continue', {
      fontFamily: 'system-ui',
      fontSize: '24px',
      color: '#8b949e'
    });
    continueBtn.setOrigin(0.5);

    this.input.keyboard?.once('keydown-SPACE', () => {
      this.game.events.emit('match_event', {
        type: 'match_end',
        score: scoreState,
        stats: this.game.registry.get('userStats')
      });
    });
  }
}
