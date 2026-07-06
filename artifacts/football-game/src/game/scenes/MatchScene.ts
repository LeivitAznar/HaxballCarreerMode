import Phaser from 'phaser';
import { applyBallPhysics, bumpBall, shootBall } from '../physics';
import { updateAI } from '../ai';
import { getFormationPositions } from '../formation';

export default class MatchScene extends Phaser.Scene {
  private ball!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private players!: Phaser.GameObjects.Group;
  private aiPlayers: any[] = [];
  private userPlayer!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: any;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  private matchData: any;
  private score = { home: 0, away: 0 };
  private clockTime = 0; // in seconds
  private isHalfTime = false;
  private matchTimer!: Phaser.Time.TimerEvent;
  private userStats = { goals: 0, assists: 0, passes: 0, shots: 0 };

  // Pitch settings
  private pitchW = 900;
  private pitchH = 580;
  private goalW = 16;
  private goalH = 120;

  constructor() {
    super('MatchScene');
  }

  create(data?: { halfChanged?: boolean }) {
    this.matchData = this.game.registry.get('matchData');
    
    if (data?.halfChanged) {
      this.isHalfTime = true;
      this.resetPositions();
    } else {
      this.score = { home: 0, away: 0 };
      this.clockTime = 0;
      this.game.registry.set('scoreState', this.score);
      this.game.registry.set('userStats', this.userStats);
    }

    this.drawPitch();
    this.createBall();
    this.createPlayers();
    
    // Inputs
    if (this.input.keyboard) {
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys('W,A,S,D');
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }

    // Collisions
    this.physics.add.collider(this.players, this.players);
    this.physics.add.overlap(this.players, this.ball, this.handlePlayerBallCollision, undefined, this);

    // Timer (1 min per half for arcade feel)
    const secondsPerHalf = 120;
    this.matchTimer = this.time.addEvent({
      delay: 1000,
      callback: this.tickClock,
      callbackScope: this,
      loop: true
    });
  }

  private drawPitch() {
    const g = this.add.graphics();
    
    // Grass
    g.fillStyle(0x2ea043, 1);
    g.fillRect(0, 0, this.pitchW, this.pitchH);
    
    // Lines
    g.lineStyle(2, 0xffffff, 0.6);
    g.strokeRect(40, 20, this.pitchW - 80, this.pitchH - 40); // Outer bounds
    g.beginPath();
    g.moveTo(this.pitchW / 2, 20);
    g.lineTo(this.pitchW / 2, this.pitchH - 20); // Halfway line
    g.strokePath();
    g.strokeCircle(this.pitchW / 2, this.pitchH / 2, 60); // Center circle

    // Goals (Left)
    g.fillStyle(0xffffff, 0.3);
    g.fillRect(24, this.pitchH / 2 - this.goalH / 2, 16, this.goalH);
    g.strokeRect(24, this.pitchH / 2 - this.goalH / 2, 16, this.goalH);
    
    // Goals (Right)
    g.fillRect(this.pitchW - 40, this.pitchH / 2 - this.goalH / 2, 16, this.goalH);
    g.strokeRect(this.pitchW - 40, this.pitchH / 2 - this.goalH / 2, 16, this.goalH);
  }

  private createBall() {
    this.ball = this.physics.add.sprite(this.pitchW / 2, this.pitchH / 2, 'ball') as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    applyBallPhysics(this.ball);
    this.ball.setCollideWorldBounds(true);
    this.ball.setBounce(0.8, 0.8);
  }

  private createPlayers() {
    this.players = this.add.group();
    this.aiPlayers = [];

    const homeFormation = getFormationPositions('6-ASIDE', true, this.pitchW, this.pitchH);
    const awayFormation = getFormationPositions('6-ASIDE', false, this.pitchW, this.pitchH);

    // Create Home Players
    homeFormation.forEach((slot, i) => {
      const isUser = this.matchData.userTeamId === this.matchData.homeTeam.id && slot.pos === 'FWD';
      this.spawnPlayer(slot, this.matchData.homeTeam, true, isUser);
    });

    // Create Away Players
    awayFormation.forEach((slot, i) => {
      const isUser = this.matchData.userTeamId === this.matchData.awayTeam.id && slot.pos === 'FWD';
      this.spawnPlayer(slot, this.matchData.awayTeam, false, isUser);
    });
  }

  private spawnPlayer(slot: any, team: any, isHome: boolean, isUser: boolean) {
    const sprite = this.physics.add.sprite(slot.x, slot.y, 'player_base') as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    sprite.setTint(team.primaryColor);
    sprite.setCircle(12);
    sprite.setCollideWorldBounds(true);
    sprite.setBounce(0.2);
    sprite.setDrag(0.8);
    
    // Add text number
    const numText = this.add.text(0, 0, slot.pos.charAt(0), { fontSize: '10px', color: '#' + team.secondaryColor.toString(16).padStart(6, '0'), fontStyle: 'bold' });
    numText.setOrigin(0.5);

    sprite.setData('text', numText);
    sprite.setData('isHome', isHome);
    
    this.players.add(sprite);

    if (isUser) {
      this.userPlayer = sprite;
      const ring = this.add.sprite(0, 0, 'user_ring');
      sprite.setData('ring', ring);
    } else {
      this.aiPlayers.push({
        sprite,
        isHome,
        basePos: { x: slot.x, y: slot.y },
        role: slot.pos
      });
    }
  }

  private handlePlayerBallCollision(player: any, ball: any) {
    bumpBall(player, ball, 300);
    ball.setData('lastTouchedBy', player.getData('isHome') ? 'home' : 'away');
    if (player === this.userPlayer) {
      ball.setData('lastTouchedByUser', true);
    } else {
      ball.setData('lastTouchedByUser', false);
    }
  }

  private tickClock() {
    this.clockTime += 1;
    this.game.events.emit('match_event', { type: 'tick', time: this.clockTime });

    if (this.clockTime === 120 && !this.isHalfTime) { // 2 min half
      this.scene.pause();
      this.scene.launch('HalfTimeScene');
    } else if (this.clockTime >= 240) { // Full time
      this.scene.pause();
      this.scene.launch('MatchEndScene');
    }
  }

  update(time: number, delta: number) {
    this.updateUserPlayer();
    
    if (time % 6 < 2) {
      updateAI(this.aiPlayers, this.ball, this.pitchW, this.pitchH, time);
    }

    // Keep text/rings attached to players
    this.players.getChildren().forEach((p: any) => {
      const text = p.getData('text');
      if (text) {
        text.setPosition(p.x, p.y);
      }
      const ring = p.getData('ring');
      if (ring) {
        ring.setPosition(p.x, p.y);
        ring.rotation += 0.05;
      }
    });

    this.checkGoals();
  }

  private updateUserPlayer() {
    if (!this.userPlayer) return;

    let vx = 0;
    let vy = 0;
    const speed = 180;

    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -speed;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = speed;
    
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -speed;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = speed;

    this.userPlayer.setVelocity(vx, vy);

    if (vx !== 0 || vy !== 0) {
      this.userPlayer.setData('facingAngle', Math.atan2(vy, vx));
    }

    // Shooting
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      const dist = Phaser.Math.Distance.Between(this.userPlayer.x, this.userPlayer.y, this.ball.x, this.ball.y);
      if (dist < 40) {
        shootBall(this.userPlayer, this.ball, undefined, undefined, 600);
        this.userStats.shots++;
        this.game.registry.set('userStats', this.userStats);
      }
    }
  }

  private checkGoals() {
    const isGoalLeft = this.ball.x < 30 && this.ball.y > this.pitchH / 2 - this.goalH / 2 && this.ball.y < this.pitchH / 2 + this.goalH / 2;
    const isGoalRight = this.ball.x > this.pitchW - 30 && this.ball.y > this.pitchH / 2 - this.goalH / 2 && this.ball.y < this.pitchH / 2 + this.goalH / 2;

    if (isGoalLeft || isGoalRight) {
      if (isGoalLeft) {
        this.score.away++;
      } else {
        this.score.home++;
      }

      this.game.registry.set('scoreState', this.score);
      
      const lastTouchedByUser = this.ball.getData('lastTouchedByUser');
      if (lastTouchedByUser) {
        // Did user score for their team?
        const userIsHome = this.matchData.userTeamId === this.matchData.homeTeam.id;
        if ((isGoalRight && userIsHome) || (isGoalLeft && !userIsHome)) {
            this.userStats.goals++;
            this.game.registry.set('userStats', this.userStats);
        }
      }

      this.game.events.emit('match_event', { 
        type: 'goal', 
        score: this.score,
        scoringTeam: isGoalLeft ? this.matchData.awayTeam.name : this.matchData.homeTeam.name 
      });

      this.cameras.main.shake(300, 0.01);
      this.resetPositions();
    }
  }

  private resetPositions() {
    this.ball.setPosition(this.pitchW / 2, this.pitchH / 2);
    this.ball.setVelocity(0, 0);

    const homeFormation = getFormationPositions('6-ASIDE', true, this.pitchW, this.pitchH);
    const awayFormation = getFormationPositions('6-ASIDE', false, this.pitchW, this.pitchH);

    let hIdx = 0, aIdx = 0;
    this.players.getChildren().forEach((p: any) => {
      if (p.getData('isHome')) {
        p.setPosition(homeFormation[hIdx].x, homeFormation[hIdx].y);
        hIdx++;
      } else {
        p.setPosition(awayFormation[aIdx].x, awayFormation[aIdx].y);
        aIdx++;
      }
      p.setVelocity(0, 0);
    });
  }
}
