import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import MatchScene from './scenes/MatchScene';
import HalfTimeScene from './scenes/HalfTimeScene';
import MatchEndScene from './scenes/MatchEndScene';

export const GAME_WIDTH = 900;
export const GAME_HEIGHT = 580;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'phaser-container',
  backgroundColor: '#0d1117',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scene: [BootScene, MatchScene, HalfTimeScene, MatchEndScene]
};
