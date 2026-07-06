/**
 * MatchScene.ts — Core gameplay scene.
 *
 * Implements (in order):
 *  1. Player movement via setAcceleration() — smooth start/stop, circular body, mass.
 *  2. Ball physics — Arcade collider (no overlap/magnet), mass ratio, drag, bounce.
 *  3. kickBall() — unified pass (X) / shoot (SPACE) with range check, cooldown, stat mult.
 *  4. Visual kick feedback — tween circle (blue = pass, orange = shot).
 *  5. Pitch boundaries via staticGroup walls with exact goal gaps + goalpost static bodies.
 *  6. Pitch visuals — striped grass, full field markings, net, corner flags.
 *  7. Minimap — second Phaser camera, auto-scaled, shows full pitch.
 */
import Phaser from 'phaser';
import { updateAI } from '../ai';
import { getFormationPositions } from '../formation';
import {
  configureBall, configurePlayer,
  kickBall,
  PLAYER_ACCEL, PLAYER_MAX_VEL,
  PASS_FORCE, SHOT_FORCE,
} from '../physics';

// ── Pitch geometry ──────────────────────────────────────────────────────────
const PITCH_W   = 900;
const PITCH_H   = 580;
const GOAL_H    = 120;
const GOAL_TOP  = (PITCH_H - GOAL_H) / 2;   // 230
const GOAL_BOT  = (PITCH_H + GOAL_H) / 2;   // 350
const WALL_T    = 8;                          // static wall thickness (px)

// Minimap
const MINI_W = 180;
const MINI_H = Math.round(MINI_W * PITCH_H / PITCH_W); // ~116 — same aspect ratio
const MINI_X = PITCH_W - MINI_W - 8;
const MINI_Y = PITCH_H - MINI_H - 8;

// ── Types ───────────────────────────────────────────────────────────────────
interface AIPlayerEntry {
  sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  isHome: boolean;
  basePos: { x: number; y: number };
  role: 'GK' | 'DEF' | 'MID' | 'FWD';
}

export default class MatchScene extends Phaser.Scene {
  // Physics objects
  private ball!:       Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private userPlayer!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private players!:    Phaser.GameObjects.Group;
  private aiPlayers:   AIPlayerEntry[] = [];
  private walls!:      Phaser.Physics.Arcade.StaticGroup;

  // Input
  private cursors!:  Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!:     Record<string, Phaser.Input.Keyboard.Key>;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private xKey!:     Phaser.Input.Keyboard.Key;

  // Match state
  private matchData:  any;
  private score =     { home: 0, away: 0 };
  private clockTime = 0;          // seconds elapsed
  private isSecondHalf = false;
  private matchTimer!: Phaser.Time.TimerEvent;
  private userStats =  { goals: 0, assists: 0, shots: 0 };

  // Kick feedback
  private kickIndicator!: Phaser.GameObjects.Graphics;

  // Minimap camera
  private minimapCam!: Phaser.Cameras.Scene2D.Camera;

  // Frame counter for AI throttle
  private frameCount = 0;

  constructor() {
    super('MatchScene');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ──────────────────────────────────────────────────────────────────────────

  create() {
    this.matchData  = this.game.registry.get('matchData');
    this.score      = { home: 0, away: 0 };
    this.clockTime  = 0;
    this.isSecondHalf = false;
    this.frameCount = 0;
    this.userStats  = { goals: 0, assists: 0, shots: 0 };

    this.game.registry.set('scoreState', this.score);
    this.game.registry.set('userStats',  this.userStats);

    // Layered construction order matters for depth
    this.drawPitch();          // 1. Background graphics (bottom layer)
    this.createWalls();        // 2. Invisible static wall bodies
    this.createGoalposts();    // 3. Static goalpost bodies (with bounce)
    this.createBall();         // 4. Ball
    this.createPlayers();      // 5. Player sprites
    this.createGoalZones();    // 6. Overlap zones behind goal lines
    this.createKickIndicator();// 7. Kick visual feedback overlay
    this.setupInputs();
    this.setupColliders();
    this.setupTimer();
    this.setupMinimap();       // 8. Second camera (top of creation stack)
  }

  update(_time: number, _delta: number) {
    this.frameCount++;
    this.updateUserPlayer();
    updateAI(
      this.aiPlayers, this.ball,
      PITCH_W, PITCH_H,
      this.time.now,
      this.frameCount
    );
    this.syncLabels();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. PITCH VISUALS — striped grass + full field markings + net
  // ──────────────────────────────────────────────────────────────────────────

  private drawPitch() {
    const g = this.add.graphics();

    // ── Striped grass (alternating dark/light green bands) ─────────────────
    const STRIPE_W   = 60;
    const DARK_GREEN  = 0x1a5c2a;
    const LIGHT_GREEN = 0x1e6b30;
    const stripes = Math.ceil(PITCH_W / STRIPE_W);
    for (let i = 0; i < stripes; i++) {
      g.fillStyle(i % 2 === 0 ? DARK_GREEN : LIGHT_GREEN, 1);
      g.fillRect(i * STRIPE_W, 0, STRIPE_W, PITCH_H);
    }

    // ── White field lines ───────────────────────────────────────────────────
    g.lineStyle(2, 0xffffff, 0.75);

    // Outer touchline
    g.strokeRect(8, 8, PITCH_W - 16, PITCH_H - 16);

    // Halfway line
    g.beginPath();
    g.moveTo(PITCH_W / 2, 8);
    g.lineTo(PITCH_W / 2, PITCH_H - 8);
    g.strokePath();

    // Centre circle + centre dot
    g.strokeCircle(PITCH_W / 2, PITCH_H / 2, 70);
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(PITCH_W / 2, PITCH_H / 2, 4);

    // Left penalty area (large)
    g.strokeRect(8, 160, 130, 260);
    // Left 6-yard box
    g.strokeRect(8, 225, 65, 130);
    // Left penalty spot
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(100, PITCH_H / 2, 3);

    // Right penalty area
    g.lineStyle(2, 0xffffff, 0.75);
    g.strokeRect(PITCH_W - 138, 160, 130, 260);
    // Right 6-yard box
    g.strokeRect(PITCH_W - 73, 225, 65, 130);
    // Right penalty spot
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(PITCH_W - 100, PITCH_H / 2, 3);

    // Corner arcs (quarter-circles at each corner)
    g.lineStyle(2, 0xffffff, 0.6);
    g.beginPath(); g.arc(8,           8,           10, 0, Math.PI / 2); g.strokePath();
    g.beginPath(); g.arc(PITCH_W - 8, 8,           10, Math.PI / 2, Math.PI); g.strokePath();
    g.beginPath(); g.arc(8,           PITCH_H - 8, 10, -Math.PI / 2, 0); g.strokePath();
    g.beginPath(); g.arc(PITCH_W - 8, PITCH_H - 8, 10, Math.PI, Math.PI * 1.5); g.strokePath();

    // Corner flag poles (small yellow circle markers)
    g.fillStyle(0xffd700, 0.9);
    [[8,8],[PITCH_W-8,8],[8,PITCH_H-8],[PITCH_W-8,PITCH_H-8]].forEach(([x,y]) => {
      g.fillCircle(x, y, 3);
    });

    // ── Goal outlines & net texture ─────────────────────────────────────────
    const GOAL_DEPTH = 36;   // how far the net extends behind the goal line

    // Left goal frame
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeRect(8 - GOAL_DEPTH, GOAL_TOP, GOAL_DEPTH, GOAL_H);

    // Right goal frame
    g.strokeRect(PITCH_W - 8, GOAL_TOP, GOAL_DEPTH, GOAL_H);

    // Net grid (left) — semi-transparent white cross-hatch
    g.lineStyle(1, 0xffffff, 0.18);
    const NET_CELL = 12;
    // Vertical lines
    for (let nx = 8 - GOAL_DEPTH; nx <= 8; nx += NET_CELL) {
      g.beginPath();
      g.moveTo(nx, GOAL_TOP);
      g.lineTo(nx, GOAL_BOT);
      g.strokePath();
    }
    // Horizontal lines
    for (let ny = GOAL_TOP; ny <= GOAL_BOT; ny += NET_CELL) {
      g.beginPath();
      g.moveTo(8 - GOAL_DEPTH, ny);
      g.lineTo(8, ny);
      g.strokePath();
    }

    // Net grid (right)
    for (let nx = PITCH_W - 8; nx <= PITCH_W - 8 + GOAL_DEPTH; nx += NET_CELL) {
      g.beginPath();
      g.moveTo(nx, GOAL_TOP);
      g.lineTo(nx, GOAL_BOT);
      g.strokePath();
    }
    for (let ny = GOAL_TOP; ny <= GOAL_BOT; ny += NET_CELL) {
      g.beginPath();
      g.moveTo(PITCH_W - 8, ny);
      g.lineTo(PITCH_W - 8 + GOAL_DEPTH, ny);
      g.strokePath();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. STATIC WALLS — goal gaps + static goalpost bodies
  // ──────────────────────────────────────────────────────────────────────────

  private createWalls() {
    this.walls = this.physics.add.staticGroup();

    /**
     * Helper: create an invisible static physics rectangle.
     * Using 'pixel' texture (1×1 white) scaled to desired size.
     */
    const addWall = (cx: number, cy: number, w: number, h: number) => {
      const wall = this.physics.add.staticImage(cx, cy, 'pixel');
      wall.setDisplaySize(w, h);
      wall.setAlpha(0);        // invisible
      wall.setBounce(0.5);     // slight bounce off walls
      wall.refreshBody();
      this.walls.add(wall, true);
      return wall;
    };

    // Top wall — full width
    addWall(PITCH_W / 2, WALL_T / 2,       PITCH_W, WALL_T);
    // Bottom wall — full width
    addWall(PITCH_W / 2, PITCH_H - WALL_T / 2, PITCH_W, WALL_T);

    // Left wall — TOP section (above goal gap)
    addWall(WALL_T / 2, GOAL_TOP / 2,              WALL_T, GOAL_TOP);
    // Left wall — BOTTOM section (below goal gap)
    addWall(WALL_T / 2, (GOAL_BOT + PITCH_H) / 2, WALL_T, PITCH_H - GOAL_BOT);

    // Right wall — TOP section
    addWall(PITCH_W - WALL_T / 2, GOAL_TOP / 2,              WALL_T, GOAL_TOP);
    // Right wall — BOTTOM section
    addWall(PITCH_W - WALL_T / 2, (GOAL_BOT + PITCH_H) / 2, WALL_T, PITCH_H - GOAL_BOT);
  }

  private createGoalposts() {
    /**
     * Static posts with real bounce — ball rebounds off the post when it
     * hits a corner of the goal opening.
     */
    const addPost = (x: number, y: number) => {
      const post = this.physics.add.staticSprite(x, y, 'post');
      post.setCircle(6, 0, 0);
      post.setBounce(0.7);
      post.refreshBody();
      this.walls.add(post, true);
    };

    addPost(WALL_T,         GOAL_TOP);          // left  top post
    addPost(WALL_T,         GOAL_BOT);          // left  bottom post
    addPost(PITCH_W - WALL_T, GOAL_TOP);        // right top post
    addPost(PITCH_W - WALL_T, GOAL_BOT);        // right bottom post
  }

  /**
   * 5c. Goal detection zones — narrow overlap zones just behind each goal line.
   * They sit inside the gap where there is NO wall, so the ball physically
   * enters before the overlap fires.
   */
  private createGoalZones() {
    const ZONE_DEPTH = 16;

    // Left goal zone: just inside x=0 to x=WALL_T gap
    const leftZone = this.add.zone(ZONE_DEPTH / 2, PITCH_H / 2, ZONE_DEPTH, GOAL_H);
    this.physics.add.existing(leftZone, true); // static
    this.physics.add.overlap(this.ball, leftZone, () => this.onGoal('away'), undefined, this);

    // Right goal zone: just inside x=PITCH_W-WALL_T gap
    const rightZone = this.add.zone(PITCH_W - ZONE_DEPTH / 2, PITCH_H / 2, ZONE_DEPTH, GOAL_H);
    this.physics.add.existing(rightZone, true);
    this.physics.add.overlap(this.ball, rightZone, () => this.onGoal('home'), undefined, this);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BALL — point 2
  // ──────────────────────────────────────────────────────────────────────────

  private createBall() {
    this.ball = this.physics.add.sprite(PITCH_W / 2, PITCH_H / 2, 'ball') as
      Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    configureBall(this.ball);
    this.ball.setDepth(10);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PLAYERS — point 1
  // ──────────────────────────────────────────────────────────────────────────

  private createPlayers() {
    this.players   = this.add.group();
    this.aiPlayers = [];

    const homeSlots = getFormationPositions('6-ASIDE', true,  PITCH_W, PITCH_H);
    const awaySlots = getFormationPositions('6-ASIDE', false, PITCH_W, PITCH_H);

    homeSlots.forEach(slot => this.spawnPlayer(slot, this.matchData.homeTeam, true));
    awaySlots.forEach(slot => this.spawnPlayer(slot, this.matchData.awayTeam, false));
  }

  private spawnPlayer(
    slot:   { x: number; y: number; pos: string },
    team:   any,
    isHome: boolean
  ) {
    const isUser =
      this.matchData.userTeamId === team.id && slot.pos === 'FWD';

    // ── Sprite ──────────────────────────────────────────────────────────────
    const sprite = this.physics.add.sprite(slot.x, slot.y, 'player_base') as
      Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    sprite.setTint(team.primaryColor);
    sprite.setDepth(8);

    // ── Physics body — point 1 ───────────────────────────────────────────────
    // Scale max velocity by speed stat for the user player; AI uses fixed speed.
    const speedStat = isUser && this.matchData.userStats?.speed
      ? this.matchData.userStats.speed
      : 60; // default AI speed stat (mid-range)
    const maxVel = PLAYER_MAX_VEL * (0.75 + speedStat / 100 * 0.5); // range ~97–163 px/s
    configurePlayer(sprite, maxVel);

    // Data attributes
    sprite.setData('isHome', isHome);
    sprite.setData('pos',    slot.pos);
    sprite.setData('team',   team);
    sprite.setData('isUser', isUser);

    // ── Position label ───────────────────────────────────────────────────────
    const labelColor = '#' + (team.secondaryColor as number).toString(16).padStart(6, '0');
    const label = this.add.text(slot.x, slot.y, slot.pos.charAt(0), {
      fontSize: '11px',
      color: labelColor,
      fontStyle: 'bold',
      fontFamily: 'system-ui',
    }).setOrigin(0.5).setDepth(9);
    sprite.setData('label', label);

    this.players.add(sprite);

    if (isUser) {
      this.userPlayer = sprite;
      // User ring (drawn above label)
      const ring = this.add.sprite(slot.x, slot.y, 'user_ring').setDepth(11);
      sprite.setData('ring', ring);
    } else {
      this.aiPlayers.push({
        sprite,
        isHome,
        basePos: { x: slot.x, y: slot.y },
        role: slot.pos as AIPlayerEntry['role'],
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. KICK VISUAL FEEDBACK
  // ──────────────────────────────────────────────────────────────────────────

  private createKickIndicator() {
    this.kickIndicator = this.add.graphics();
    this.kickIndicator.setDepth(20);
    this.kickIndicator.setAlpha(0);
  }

  /**
   * Trigger a quick expanding ring at the kick position.
   * @param isShot  true = shot (orange), false = pass (blue)
   */
  private showKickFeedback(x: number, y: number, isShot: boolean) {
    const color = isShot ? 0xff6600 : 0x0088ff;
    this.kickIndicator.clear();
    this.kickIndicator.lineStyle(3, color, 1);
    this.kickIndicator.strokeCircle(0, 0, 20);
    this.kickIndicator.setPosition(x, y);
    this.kickIndicator.setScale(0.5);
    this.kickIndicator.setAlpha(0.8);

    // Kill any running tween before starting a new one
    this.tweens.killTweensOf(this.kickIndicator);
    this.tweens.add({
      targets:  this.kickIndicator,
      scale:    { from: 0.5, to: 1.5 },
      alpha:    { from: 0.8, to: 0 },
      duration: 250,
      ease:     'Cubic.easeOut',
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // INPUT & COLLIDERS
  // ──────────────────────────────────────────────────────────────────────────

  private setupInputs() {
    if (!this.input.keyboard) return;
    this.cursors  = this.input.keyboard.createCursorKeys();
    this.wasd     = this.input.keyboard.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.xKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
  }

  private setupColliders() {
    // Ball bounces off static walls and goalposts (handled via staticGroup)
    this.physics.add.collider(this.ball, this.walls);

    // Players bump ball via real physics collision (mass ratio: player=5, ball=1)
    this.physics.add.collider(this.players, this.ball);

    // Players collide with each other
    this.physics.add.collider(this.players, this.players);

    // Players collide with walls (stay inside pitch)
    this.physics.add.collider(this.players, this.walls);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. MINIMAP — second camera, auto-zoom, shows full pitch
  // ──────────────────────────────────────────────────────────────────────────

  private setupMinimap() {
    // Create a second camera viewport at bottom-right corner
    this.minimapCam = this.cameras.add(MINI_X, MINI_Y, MINI_W, MINI_H);
    this.minimapCam.setZoom(MINI_W / PITCH_W);  // scales everything to fit pitch
    this.minimapCam.setBounds(0, 0, PITCH_W, PITCH_H);
    this.minimapCam.setBackgroundColor(0x0d2010);

    // Draw a border frame around the minimap viewport.
    // setScrollFactor(0) pins it to screen space in the main camera.
    const border = this.add.graphics();
    border.setScrollFactor(0);
    border.lineStyle(2, 0x4a9060, 1);
    border.strokeRect(MINI_X - 2, MINI_Y - 2, MINI_W + 4, MINI_H + 4);
    border.setDepth(50);

    // Ignore the border in the minimap camera so it doesn't show doubled
    this.minimapCam.ignore(border);
    // Also ignore the kick indicator in the minimap
    this.minimapCam.ignore(this.kickIndicator);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TIMER
  // ──────────────────────────────────────────────────────────────────────────

  private setupTimer() {
    this.matchTimer = this.time.addEvent({
      delay:         1000,
      callback:      this.tickClock,
      callbackScope: this,
      loop:          true,
    });
  }

  private tickClock() {
    this.clockTime++;
    this.game.events.emit('match_event', { type: 'tick', time: this.clockTime });

    if (this.clockTime === 120 && !this.isSecondHalf) {
      // Half time
      this.scene.pause();
      this.scene.launch('HalfTimeScene');
    } else if (this.clockTime >= 240) {
      // Full time
      this.matchTimer.remove();
      this.scene.pause();
      this.scene.launch('MatchEndScene');
    }
  }

  // Phaser calls this when the scene is resumed (after HalfTimeScene)
  init() {
    // no-op needed — actual state carry-over handled by tickClock check
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1 & 3. USER PLAYER UPDATE — acceleration-based movement + kick
  // ──────────────────────────────────────────────────────────────────────────

  private updateUserPlayer() {
    if (!this.userPlayer) return;

    // ── Directional input → acceleration ─────────────────────────────────
    let ax = 0;
    let ay = 0;

    const leftDown  = this.cursors.left.isDown  || this.wasd['A'].isDown;
    const rightDown = this.cursors.right.isDown || this.wasd['D'].isDown;
    const upDown    = this.cursors.up.isDown    || this.wasd['W'].isDown;
    const downDown  = this.cursors.down.isDown  || this.wasd['S'].isDown;

    if (leftDown)  ax = -PLAYER_ACCEL;
    else if (rightDown) ax = PLAYER_ACCEL;

    if (upDown)    ay = -PLAYER_ACCEL;
    else if (downDown)  ay = PLAYER_ACCEL;

    // Diagonal normalisation (prevent faster diagonal movement)
    if (ax !== 0 && ay !== 0) {
      const norm = Math.SQRT2;
      ax /= norm;
      ay /= norm;
    }

    this.userPlayer.body.setAcceleration(ax, ay);

    // Track facingAngle — only update when moving
    if (ax !== 0 || ay !== 0) {
      const angle = Math.atan2(ay, ax);
      this.userPlayer.setData('facingAngle', angle);
    }

    // ── Kicking — point 3 ───────────────────────────────────────────────────
    // Stat multiplier from career player stats
    const shootStat   = this.matchData.playerStats?.shooting ?? 50;
    const passStat    = this.matchData.playerStats?.passing  ?? 50;
    const shotMult    = 0.75 + shootStat / 100 * 0.5;  // 0.75–1.25
    const passMult    = 0.75 + passStat  / 100 * 0.5;

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      // SHOOT
      const kicked = kickBall(this.userPlayer, this.ball, SHOT_FORCE, shotMult, this.time.now);
      if (kicked) {
        this.userStats.shots++;
        this.game.registry.set('userStats', this.userStats);
        this.showKickFeedback(this.userPlayer.x, this.userPlayer.y, true);
        // Track last toucher for goal attribution
        this.ball.setData('lastTouchedByUser', true);
      }
    } else if (Phaser.Input.Keyboard.JustDown(this.xKey)) {
      // PASS
      const kicked = kickBall(this.userPlayer, this.ball, PASS_FORCE, passMult, this.time.now);
      if (kicked) {
        this.showKickFeedback(this.userPlayer.x, this.userPlayer.y, false);
        this.ball.setData('lastTouchedByUser', true);
      }
    }

    // Regular collision with ball: update last-toucher
    const distToBall = Phaser.Math.Distance.Between(
      this.userPlayer.x, this.userPlayer.y, this.ball.x, this.ball.y
    );
    if (distToBall < 30) {
      this.ball.setData('lastTouchedByUser', true);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GOAL HANDLING
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Called by goal zone overlaps.
   * @param scoringTeam 'home' | 'away'
   */
  private onGoal(scoringTeam: 'home' | 'away') {
    // Guard: ignore if ball is moving away from the goal (can re-enter zone after reset)
    // Use a flag to debounce repeated firings in the same frame
    if (this.ball.getData('goalScoredGuard')) return;
    this.ball.setData('goalScoredGuard', true);

    // Update score
    this.score[scoringTeam]++;
    this.game.registry.set('scoreState', this.score);

    // User goal attribution
    if (this.ball.getData('lastTouchedByUser')) {
      const userIsHome = this.matchData.userTeamId === this.matchData.homeTeam.id;
      const userScored = (scoringTeam === 'home' && userIsHome) ||
                         (scoringTeam === 'away' && !userIsHome);
      if (userScored) {
        this.userStats.goals++;
        this.game.registry.set('userStats', this.userStats);
      }
    }

    const teamName = scoringTeam === 'home'
      ? this.matchData.homeTeam.name
      : this.matchData.awayTeam.name;

    this.game.events.emit('match_event', {
      type:        'goal',
      score:       { ...this.score },
      scoringTeam: teamName,
    });

    // Camera shake celebration
    this.cameras.main.shake(350, 0.012);

    // Brief pause then reset positions
    this.physics.pause();
    this.time.delayedCall(600, () => {
      this.resetPositions();
      this.ball.setData('goalScoredGuard', false);
      this.ball.setData('lastTouchedByUser', false);
      this.physics.resume();
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────────────────────

  private resetPositions() {
    // Ball to centre
    this.ball.setPosition(PITCH_W / 2, PITCH_H / 2);
    this.ball.body.setVelocity(0, 0);
    this.ball.body.setAcceleration(0, 0);

    // Players to formation
    const homeSlots = getFormationPositions('6-ASIDE', true,  PITCH_W, PITCH_H);
    const awaySlots = getFormationPositions('6-ASIDE', false, PITCH_W, PITCH_H);
    let hi = 0, ai = 0;

    (this.players.getChildren() as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[])
      .forEach(p => {
        const slots = p.getData('isHome') ? homeSlots : awaySlots;
        const idx   = p.getData('isHome') ? hi++      : ai++;
        if (slots[idx]) {
          p.setPosition(slots[idx].x, slots[idx].y);
          p.body.setVelocity(0, 0);
          p.body.setAcceleration(0, 0);
        }
      });
  }

  /** Keep text labels and user ring positioned on top of their sprites each frame. */
  private syncLabels() {
    (this.players.getChildren() as Phaser.GameObjects.Sprite[]).forEach((p: any) => {
      const label: Phaser.GameObjects.Text = p.getData('label');
      if (label) label.setPosition(p.x, p.y);

      const ring: Phaser.GameObjects.Sprite = p.getData('ring');
      if (ring) ring.setPosition(p.x, p.y);
    });
  }
}
