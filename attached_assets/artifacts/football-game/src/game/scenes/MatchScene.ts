/**
 * MatchScene.ts — Core gameplay scene.
 *
 * KEY FIXES in this version:
 *  1. Player visuals now use Arc + Text objects instead of Graphics, which are
 *     simpler, can't "lose" their drawn content, and are easier to position.
 *  2. syncVisuals() forces setVisible(true) every frame — eliminates the
 *     "appears for a millisecond then disappears" bug caused by the previous
 *     `if (!sprite.active) return` guard hiding circles permanently.
 *  3. resetPositions() now guards against null body before calling velocity
 *     methods — the old crash was silently aborting the forEach mid-loop,
 *     leaving most players un-reset and off-screen.
 *  4. Player physics sprites now use setCollideWorldBounds(true) as a safety
 *     net — prevents players from ever leaving the pitch bounds.
 *  5. sanitizeBody() called every frame to recover any NaN-position sprite.
 */
import Phaser from 'phaser';
import { Player, Team } from '../../career/types';
import { updateAI } from '../ai';
import { getFormationPositions } from '../formation';
import {
  configureBall, configurePlayer,
  kickBall, applyHaxballCollision,
  sanitizeBody,
  PLAYER_ACCEL, PLAYER_MAX_VEL, PLAYER_RADIUS,
  PASS_FORCE, SHOT_FORCE,
  CONTACT_DIST, CONTACT_SLOWDOWN,
} from '../physics';

// ── Pitch & field geometry ───────────────────────────────────────────────────
const PITCH_W   = 900;
const PITCH_H   = 580;
const FIELD_TOP = 50;
const FIELD_BOT = 550;
const FIELD_X   = 24;
const FIELD_W   = PITCH_W - FIELD_X * 2;
const FIELD_H   = FIELD_BOT - FIELD_TOP;
const CENTER_Y  = PITCH_H / 2;
const GOAL_H    = 120;
const GOAL_TOP  = CENTER_Y - GOAL_H / 2;
const GOAL_BOT  = CENTER_Y + GOAL_H / 2;
const WALL_T    = 8;

const MINI_W = 180;
const MINI_H = Math.round(MINI_W * PITCH_H / PITCH_W);
const MINI_X = (PITCH_W - MINI_W) / 2;
const MINI_Y = FIELD_BOT - MINI_H - 8;

// ── Helpers ──────────────────────────────────────────────────────────────────
function darken(color: number, factor: number): number {
  const r = Math.max(0, ((color >> 16) & 0xff) * (1 - factor));
  const g = Math.max(0, ((color >>  8) & 0xff) * (1 - factor));
  const b = Math.max(0,  (color        & 0xff) * (1 - factor));
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

// ── Types ────────────────────────────────────────────────────────────────────
interface AIPlayerEntry {
  sprite:  Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  isHome:  boolean;
  basePos: { x: number; y: number };
  role:    'GK' | 'DEF' | 'MID' | 'FWD';
}

// FIX: Use Arc + Text instead of Graphics for player visuals.
// Arc objects retain their appearance without needing to be redrawn,
// and can't "lose" their content the way Graphics objects can when
// the scene is paused/resumed or cameras are reconfigured.
interface PlayerVisual {
  sprite:   Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  circle:   Phaser.GameObjects.Arc;
  numText:  Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
  shadow:   Phaser.GameObjects.Arc;
}

// ─────────────────────────────────────────────────────────────────────────────
export default class MatchScene extends Phaser.Scene {

  private ball!:       Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private userPlayer!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private players!:    Phaser.GameObjects.Group;
  private aiPlayers:   AIPlayerEntry[]  = [];
  private walls!:      Phaser.Physics.Arcade.StaticGroup;
  private playerVisuals: PlayerVisual[] = [];

  private possTriHome!: Phaser.GameObjects.Triangle;
  private possTriAway!: Phaser.GameObjects.Triangle;

  private cursors!:  Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!:     Record<string, Phaser.Input.Keyboard.Key>;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private xKey!:     Phaser.Input.Keyboard.Key;

  private matchData:    any;
  private score       = { home: 0, away: 0 };
  private clockTime   = 0;
  private isSecondHalf = false;
  private matchTimer!: Phaser.Time.TimerEvent;
  private userStats   = { goals: 0, assists: 0, shots: 0 };

  private kickIndicator!: Phaser.GameObjects.Graphics;
  private minimapCam!:    Phaser.Cameras.Scene2D.Camera;
  private uiObjects:      Phaser.GameObjects.GameObject[] = [];
  private frameCount    = 0;

  // Mobile controls
  private isTouchDevice     = false;
  private joyPointerId:       number | null = null;
  private joyBase!:           Phaser.GameObjects.Arc;
  private joyThumb!:          Phaser.GameObjects.Arc;
  private joyBaseX            = 0;
  private joyBaseY            = 0;
  private readonly JOY_RADIUS = 50;
  private joyVector           = { x: 0, y: 0 };
  private mobilePassRequested = false;
  private mobileShotRequested = false;

  constructor() { super('MatchScene'); }

  // ══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ══════════════════════════════════════════════════════════════════════════

  create() {
    this.matchData    = this.game.registry.get('matchData');
    this.score        = { home: 0, away: 0 };
    this.clockTime    = 0;
    this.isSecondHalf = false;
    this.frameCount   = 0;
    this.userStats    = { goals: 0, assists: 0, shots: 0 };
    this.uiObjects    = [];

    this.game.registry.set('scoreState', this.score);
    this.game.registry.set('userStats',  this.userStats);

    this.drawPitch();
    this.createWalls();
    this.createGoalposts();
    this.createBall();
    this.createPlayers();
    this.createGoalZones();
    this.createPossessionTriangles();
    this.createKickIndicator();
    this.setupInputs();
    this.setupColliders();
    this.setupTimer();
    this.setupMinimapAndUI();

    // Multi-touch support: joystick + button simultaneously
    this.input.addPointer(2);
    this.isTouchDevice = this.sys.game.device.input.touch;
    if (this.isTouchDevice) this.setupMobileControls();
  }

  update() {
    this.frameCount++;

    // ── Safety net: recover NaN-position sprites every frame ───────────────
    (this.players.getChildren() as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[])
      .forEach(p => {
        const fx = (p.getData('spawnX') as number) ?? PITCH_W / 2;
        const fy = (p.getData('spawnY') as number) ?? PITCH_H / 2;
        sanitizeBody(p, fx, fy, p.getData('isUser') ? 'userPlayer' : 'aiPlayer');
      });
    sanitizeBody(this.ball, PITCH_W / 2, PITCH_H / 2, 'ball');

    this.updateUserPlayer();
    updateAI(this.aiPlayers, this.ball, PITCH_W, PITCH_H, this.time.now, this.frameCount);
    this.applyContactSpeedPenalty();
    this.syncVisuals();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PITCH
  // ══════════════════════════════════════════════════════════════════════════

  private drawPitch() {
    const g = this.add.graphics().setDepth(0);

    const DARK_BG = 0x0d1117;
    g.fillStyle(DARK_BG, 1);
    g.fillRect(0, 0, PITCH_W, FIELD_TOP);
    g.fillRect(0, FIELD_BOT, PITCH_W, PITCH_H - FIELD_BOT);

    this.add.text(PITCH_W / 2, FIELD_BOT + 15,
      'FOOTBALL CAREER ✦ FOOTBALL CAREER ✦ FOOTBALL CAREER ✦ FOOTBALL CAREER',
      { fontSize: '9px', fontFamily: 'monospace', fontStyle: 'bold', color: '#1a2e1a' }
    ).setOrigin(0.5).setDepth(3);

    g.fillStyle(0xffffff, 0.04);
    g.fillCircle(0, FIELD_TOP, 40); g.fillCircle(PITCH_W, FIELD_TOP, 40);
    g.fillCircle(0, FIELD_BOT, 30); g.fillCircle(PITCH_W, FIELD_BOT, 30);

    const STRIPE_W    = 56;
    const DARK_GREEN  = 0x1a5c1f;
    const LIGHT_GREEN = 0x1f6e26;
    const STRIPES = Math.ceil(PITCH_W / STRIPE_W) + 1;
    for (let i = 0; i < STRIPES; i++) {
      g.fillStyle(i % 2 === 0 ? DARK_GREEN : LIGHT_GREEN, 1);
      g.fillRect(FIELD_X + i * STRIPE_W, FIELD_TOP, STRIPE_W, FIELD_H);
    }

    g.fillStyle(0x164a1a, 1);
    g.fillRect(0,              GOAL_TOP, FIELD_X,                          GOAL_H);
    g.fillRect(FIELD_X + FIELD_W, GOAL_TOP, PITCH_W - (FIELD_X + FIELD_W), GOAL_H);

    g.lineStyle(1, 0xffffff, 0.14);
    const NET_CELL = 9;
    const RX = FIELD_X + FIELD_W;
    for (let y = GOAL_TOP; y <= GOAL_BOT; y += NET_CELL) {
      g.beginPath(); g.moveTo(1, y); g.lineTo(FIELD_X - 1, y); g.strokePath();
      g.beginPath(); g.moveTo(RX + 1, y); g.lineTo(PITCH_W - 1, y); g.strokePath();
    }
    for (let x = 1; x <= FIELD_X - 1; x += NET_CELL) {
      g.beginPath(); g.moveTo(x, GOAL_TOP); g.lineTo(x, GOAL_BOT); g.strokePath();
    }
    for (let x = RX + 1; x <= PITCH_W - 1; x += NET_CELL) {
      g.beginPath(); g.moveTo(x, GOAL_TOP); g.lineTo(x, GOAL_BOT); g.strokePath();
    }

    g.lineStyle(3, 0xffffff, 0.95);
    g.beginPath(); g.moveTo(1,       GOAL_TOP); g.lineTo(FIELD_X,     GOAL_TOP); g.strokePath();
    g.beginPath(); g.moveTo(1,       GOAL_BOT); g.lineTo(FIELD_X,     GOAL_BOT); g.strokePath();
    g.beginPath(); g.moveTo(1,       GOAL_TOP); g.lineTo(1,           GOAL_BOT); g.strokePath();
    g.beginPath(); g.moveTo(RX,      GOAL_TOP); g.lineTo(PITCH_W - 1, GOAL_TOP); g.strokePath();
    g.beginPath(); g.moveTo(RX,      GOAL_BOT); g.lineTo(PITCH_W - 1, GOAL_BOT); g.strokePath();
    g.beginPath(); g.moveTo(PITCH_W - 1, GOAL_TOP); g.lineTo(PITCH_W - 1, GOAL_BOT); g.strokePath();

    g.lineStyle(2, 0xffffff, 0.82);
    g.strokeRect(FIELD_X, FIELD_TOP, FIELD_W, FIELD_H);
    g.beginPath(); g.moveTo(PITCH_W / 2, FIELD_TOP); g.lineTo(PITCH_W / 2, FIELD_BOT); g.strokePath();
    g.strokeCircle(PITCH_W / 2, CENTER_Y, 70);
    g.fillStyle(0xffffff, 0.85); g.fillCircle(PITCH_W / 2, CENTER_Y, 3.5);

    const PA_W = 140, PA_H = 260;
    const PA_TOP = CENTER_Y - PA_H / 2;
    g.strokeRect(FIELD_X, PA_TOP, PA_W, PA_H);
    const SB_W = 56, SB_H = 130;
    g.strokeRect(FIELD_X, CENTER_Y - SB_H / 2, SB_W, SB_H);
    const PS_L_X = FIELD_X + 92;
    g.fillStyle(0xffffff, 0.85); g.fillCircle(PS_L_X, CENTER_Y, 3.5);
    const D_R = 65;
    const D_ANG = Math.acos((FIELD_X + PA_W - PS_L_X) / D_R);
    g.lineStyle(2, 0xffffff, 0.82);
    g.beginPath(); g.arc(PS_L_X, CENTER_Y, D_R, -D_ANG, D_ANG); g.strokePath();

    const PA_R_X = FIELD_X + FIELD_W - PA_W;
    g.strokeRect(PA_R_X, PA_TOP, PA_W, PA_H);
    g.strokeRect(FIELD_X + FIELD_W - SB_W, CENTER_Y - SB_H / 2, SB_W, SB_H);
    const PS_R_X = FIELD_X + FIELD_W - 92;
    g.fillStyle(0xffffff, 0.85); g.fillCircle(PS_R_X, CENTER_Y, 3.5);
    g.beginPath(); g.arc(PS_R_X, CENTER_Y, D_R, Math.PI - D_ANG, Math.PI + D_ANG); g.strokePath();

    const C_R = 10;
    g.beginPath(); g.arc(FIELD_X,           FIELD_TOP, C_R, 0,            Math.PI / 2);   g.strokePath();
    g.beginPath(); g.arc(FIELD_X + FIELD_W, FIELD_TOP, C_R, Math.PI / 2, Math.PI);        g.strokePath();
    g.beginPath(); g.arc(FIELD_X,           FIELD_BOT, C_R, -Math.PI / 2, 0);             g.strokePath();
    g.beginPath(); g.arc(FIELD_X + FIELD_W, FIELD_BOT, C_R, Math.PI,      Math.PI * 1.5); g.strokePath();

    this.add.text(PITCH_W / 2, CENTER_Y, 'FC', {
      fontSize: '56px', fontFamily: 'Arial, sans-serif', fontStyle: 'bold italic', color: '#ffffff',
    }).setOrigin(0.5).setAlpha(0.055).setDepth(1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WALLS & GOALPOSTS
  // ══════════════════════════════════════════════════════════════════════════

  private createWalls() {
    this.walls = this.physics.add.staticGroup();
    const addWall = (cx: number, cy: number, w: number, h: number) => {
      const wall = this.physics.add.staticImage(cx, cy, 'pixel');
      wall.setDisplaySize(w, h).setAlpha(0).setBounce(0.5).refreshBody();
      this.walls.add(wall, true);
    };
    addWall(PITCH_W / 2, FIELD_TOP + WALL_T / 2, PITCH_W, WALL_T);
    addWall(PITCH_W / 2, FIELD_BOT - WALL_T / 2, PITCH_W, WALL_T);
    const leftTopH = GOAL_TOP - FIELD_TOP;
    const leftBotH = FIELD_BOT - GOAL_BOT;
    addWall(WALL_T / 2, (FIELD_TOP + GOAL_TOP) / 2, WALL_T, leftTopH);
    addWall(WALL_T / 2, (GOAL_BOT + FIELD_BOT) / 2, WALL_T, leftBotH);
    addWall(PITCH_W - WALL_T / 2, (FIELD_TOP + GOAL_TOP) / 2, WALL_T, leftTopH);
    addWall(PITCH_W - WALL_T / 2, (GOAL_BOT + FIELD_BOT) / 2, WALL_T, leftBotH);
  }

  private createGoalposts() {
    const addPost = (x: number, y: number) => {
      const post = this.physics.add.staticSprite(x, y, 'post');
      post.setCircle(6, 0, 0).setBounce(0.7).refreshBody();
      this.walls.add(post, true);
    };
    addPost(WALL_T,           GOAL_TOP); addPost(WALL_T,           GOAL_BOT);
    addPost(PITCH_W - WALL_T, GOAL_TOP); addPost(PITCH_W - WALL_T, GOAL_BOT);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BALL
  // ══════════════════════════════════════════════════════════════════════════

  private createBall() {
    this.ball = this.physics.add.sprite(PITCH_W / 2, PITCH_H / 2, 'ball') as
      Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    configureBall(this.ball);
    this.ball.setDepth(10);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYERS — FIX: Arc shapes instead of Graphics for visual circles
  // ══════════════════════════════════════════════════════════════════════════

  private createPlayers() {
    this.players       = this.add.group();
    this.aiPlayers     = [];
    this.playerVisuals = [];

    const homeTeam = this.matchData.homeTeam as Team;
    const awayTeam = this.matchData.awayTeam as Team;

    const homeSlots = getFormationPositions('6-ASIDE', true,  PITCH_W, PITCH_H);
    const awaySlots = getFormationPositions('6-ASIDE', false, PITCH_W, PITCH_H);

    const rosterForSlots = (roster: Player[], slots: { pos: string }[]): Player[] => {
      const pool = [...roster];
      return slots.map(slot => {
        const idx = pool.findIndex(p => p.position === slot.pos);
        if (idx >= 0) return pool.splice(idx, 1)[0];
        return pool.length > 0 ? pool.shift()! : roster[0];
      });
    };

    const homePlayers = rosterForSlots(homeTeam.roster, homeSlots);
    const awayPlayers = rosterForSlots(awayTeam.roster, awaySlots);

    homeSlots.forEach((slot, i) => this.spawnPlayer(slot, homePlayers[i], homeTeam, true));
    awaySlots.forEach((slot, i) => this.spawnPlayer(slot, awayPlayers[i], awayTeam, false));
  }

  private spawnPlayer(
    slot:    { x: number; y: number; pos: string },
    rPlayer: Player,
    team:    Team,
    isHome:  boolean
  ) {
    const isUser = this.matchData.userTeamId === team.id && slot.pos === 'FWD';

    // ── Physics sprite (invisible body) ────────────────────────────────────
    const sprite = this.physics.add.sprite(slot.x, slot.y, 'pixel') as
      Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    sprite.setAlpha(0);
    sprite.setDisplaySize(PLAYER_RADIUS * 2, PLAYER_RADIUS * 2);

    const speedStat = isUser && this.matchData.playerStats?.speed
      ? this.matchData.playerStats.speed : 60;
    const maxVel = PLAYER_MAX_VEL * (0.75 + speedStat / 100 * 0.5);
    configurePlayer(sprite, maxVel);

    sprite.setData('baseMaxVel', maxVel);
    sprite.setData('spawnX',     slot.x);
    sprite.setData('spawnY',     slot.y);
    sprite.setData('isHome',     isHome);
    sprite.setData('pos',        slot.pos);
    sprite.setData('isUser',     isUser);
    sprite.setData('team',       team);

    // ── FIX: Use Arc shape instead of Graphics ─────────────────────────────
    // Arc objects keep their appearance without needing to be redrawn each
    // frame, making them immune to the pause/resume visibility bug.
    const fillColor   = team.primaryColor;
    const strokeColor = darken(fillColor, 0.35);

    // Shadow (slightly offset, low depth)
    const shadow = this.add.arc(slot.x + 2, slot.y + 4, PLAYER_RADIUS * 0.9, 0, 360, false, 0x000000, 0.3)
      .setDepth(7);

    // Main circle
    const circle = this.add.arc(slot.x, slot.y, PLAYER_RADIUS, 0, 360, false, fillColor, 1)
      .setStrokeStyle(2.5, strokeColor, 1)
      .setDepth(8);

    // Shirt number
    const numText = this.add.text(slot.x, slot.y, `${rPlayer.shirtNumber}`, {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5, 0.5).setDepth(9);

    // Player surname
    const displayName = rPlayer.name.split(' ').pop()?.toUpperCase() ?? rPlayer.name.toUpperCase();
    const nameText = this.add.text(slot.x, slot.y + PLAYER_RADIUS + 5, displayName, {
      fontSize: '8px', fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: '#ffffff',
      shadow: { color: '#000000', fill: true, offsetX: 1, offsetY: 1, blur: 2 },
    }).setOrigin(0.5, 0).setDepth(9);

    // User player: add a white ring to highlight
    if (isUser) {
      this.add.arc(slot.x, slot.y, PLAYER_RADIUS + 4, 0, 360, false, 0xffffff, 0)
        .setStrokeStyle(2, 0xffffff, 0.7)
        .setDepth(7)
        .setName('userRing');
    }

    this.playerVisuals.push({ sprite, circle, numText, nameText, shadow });
    this.players.add(sprite);

    if (isUser) {
      this.userPlayer = sprite;
    } else {
      this.aiPlayers.push({ sprite, isHome, basePos: { x: slot.x, y: slot.y }, role: slot.pos as AIPlayerEntry['role'] });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POSSESSION TRIANGLES — use Triangle shape (not Graphics)
  // ══════════════════════════════════════════════════════════════════════════

  private createPossessionTriangles() {
    const homeColor = (this.matchData.homeTeam as Team).primaryColor;
    const awayColor = (this.matchData.awayTeam as Team).primaryColor;
    this.possTriHome = this.makeTri(homeColor);
    this.possTriAway = this.makeTri(awayColor);
  }

  private makeTri(color: number): Phaser.GameObjects.Triangle {
    return this.add.triangle(0, 0, -7, 0, 7, 0, 0, 9, color, 1)
      .setStrokeStyle(1.5, darken(color, 0.4), 1)
      .setDepth(15)
      .setVisible(false);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GOAL ZONES
  // ══════════════════════════════════════════════════════════════════════════

  private createGoalZones() {
    const ZONE_D = 16;
    const lz = this.add.zone(ZONE_D / 2, PITCH_H / 2, ZONE_D, GOAL_H);
    this.physics.add.existing(lz, true);
    this.physics.add.overlap(this.ball, lz, () => this.onGoal('away'), undefined, this);
    const rz = this.add.zone(PITCH_W - ZONE_D / 2, PITCH_H / 2, ZONE_D, GOAL_H);
    this.physics.add.existing(rz, true);
    this.physics.add.overlap(this.ball, rz, () => this.onGoal('home'), undefined, this);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // KICK FEEDBACK
  // ══════════════════════════════════════════════════════════════════════════

  private createKickIndicator() {
    this.kickIndicator = this.add.graphics().setDepth(20).setAlpha(0);
  }

  private showKickFeedback(x: number, y: number, isShot: boolean) {
    const color = isShot ? 0xff6600 : 0x0088ff;
    this.kickIndicator.clear();
    this.kickIndicator.lineStyle(3, color, 1);
    this.kickIndicator.strokeCircle(0, 0, 20);
    this.kickIndicator.setPosition(x, y).setScale(0.5).setAlpha(0.8);
    this.tweens.killTweensOf(this.kickIndicator);
    this.tweens.add({
      targets: this.kickIndicator,
      scale: { from: 0.5, to: 1.5 }, alpha: { from: 0.8, to: 0 },
      duration: 250, ease: 'Cubic.easeOut',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MINIMAP + UI
  // ══════════════════════════════════════════════════════════════════════════

  private setupMinimapAndUI() {
    this.minimapCam = this.cameras.add(MINI_X, MINI_Y, MINI_W, MINI_H);
    this.minimapCam.setZoom(MINI_W / PITCH_W);
    this.minimapCam.setBounds(0, 0, PITCH_W, PITCH_H);
    this.minimapCam.setBackgroundColor(0x0d1a0f);

    const border = this.add.graphics().setDepth(50);
    border.lineStyle(2, 0x2ea043, 1);
    border.strokeRect(MINI_X - 2, MINI_Y - 2, MINI_W + 4, MINI_H + 4);
    const mmLabel = this.add.text(MINI_X + MINI_W / 2, MINI_Y - 10, 'RADAR', {
      fontSize: '8px', fontFamily: 'monospace', color: '#2ea043',
    }).setOrigin(0.5, 1).setDepth(50);
    this.uiObjects.push(border, mmLabel);

    const PX = MINI_X + MINI_W + 12;
    const PY = MINI_Y;
    const PW = 166, PH = MINI_H;
    const panel = this.add.graphics().setDepth(50);
    panel.fillStyle(0x000000, 0.78);
    panel.fillRoundedRect(PX, PY, PW, PH, 8);
    panel.fillStyle(0x101828, 1);
    panel.fillRoundedRect(PX + 10, PY + 14, 32, 28, 4);
    panel.lineStyle(2, 0x00bcd4, 1);
    panel.strokeRoundedRect(PX + 10, PY + 14, 32, 28, 4);
    panel.fillStyle(0x101828, 1);
    panel.fillRoundedRect(PX + 10, PY + 54, 86, 26, 4);
    panel.lineStyle(2, 0x555566, 1);
    panel.strokeRoundedRect(PX + 10, PY + 54, 86, 26, 4);

    const mk = (x: number, y: number, s: string, sz: string, c: string) =>
      this.add.text(x, y, s, { fontSize: sz, fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: c })
        .setOrigin(0.5).setDepth(51);

    const tiro    = mk(PX + 26, PY + 28, 'X',       '13px', '#ffffff');
    const tiroLbl = mk(PX + 88, PY + 28, 'TIRO',    '11px', '#e0e0e0');
    const esp     = mk(PX + 53, PY + 67, 'ESPACIO', '9px',  '#c0c0c0');
    const paseLbl = mk(PX + 125, PY + 67, 'PASE',   '11px', '#e0e0e0');
    const sep = this.add.graphics().setDepth(50);
    sep.lineStyle(1, 0x333344, 1);
    sep.beginPath(); sep.moveTo(PX + 10, PY + 47); sep.lineTo(PX + PW - 10, PY + 47); sep.strokePath();
    this.uiObjects.push(panel, sep, tiro, tiroLbl, esp, paseLbl);

    // Only ignore UI objects from minimap — player circles stay visible in both cameras
    this.minimapCam.ignore([...this.uiObjects, this.kickIndicator]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MOBILE CONTROLS
  // ══════════════════════════════════════════════════════════════════════════

  private setupMobileControls() {
    this.joyBaseX = 90;
    this.joyBaseY = FIELD_BOT - 90;

    this.joyBase = this.add.arc(this.joyBaseX, this.joyBaseY, this.JOY_RADIUS, 0, 360, false, 0xffffff, 0.15)
      .setStrokeStyle(2, 0xffffff, 0.4).setDepth(60);
    this.joyThumb = this.add.arc(this.joyBaseX, this.joyBaseY, 22, 0, 360, false, 0xffffff, 0.35)
      .setStrokeStyle(2, 0xffffff, 0.6).setDepth(61);

    const joyZone = this.add.zone(this.joyBaseX, this.joyBaseY, this.JOY_RADIUS * 2.6, this.JOY_RADIUS * 2.6)
      .setInteractive().setDepth(62);

    joyZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.joyPointerId !== null) return;
      this.joyPointerId = pointer.id;
      this.updateJoystickFromPointer(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.joyPointerId) this.updateJoystickFromPointer(pointer);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.joyPointerId) this.resetJoystick();
    });
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.joyPointerId) this.resetJoystick();
    });

    const btnShotX = PITCH_W - 130, btnShotY = FIELD_BOT - 120;
    const btnPassX = PITCH_W - 60,  btnPassY = FIELD_BOT - 70;

    const shotBtn = this.add.arc(btnShotX, btnShotY, 34, 0, 360, false, 0xff6600, 0.35)
      .setStrokeStyle(2, 0xff6600, 0.9).setDepth(60).setInteractive();
    const shotLbl = this.add.text(btnShotX, btnShotY, 'TIRO', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(61);
    const passBtn = this.add.arc(btnPassX, btnPassY, 30, 0, 360, false, 0x0088ff, 0.35)
      .setStrokeStyle(2, 0x0088ff, 0.9).setDepth(60).setInteractive();
    const passLbl = this.add.text(btnPassX, btnPassY, 'PASE', {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(61);

    shotBtn.on('pointerdown', () => { this.mobileShotRequested = true; this.flashButton(shotBtn); });
    passBtn.on('pointerdown', () => { this.mobilePassRequested = true; this.flashButton(passBtn); });

    this.game.canvas.style.touchAction = 'none';
    this.minimapCam.ignore([this.joyBase, this.joyThumb, joyZone, shotBtn, shotLbl, passBtn, passLbl]);
    this.uiObjects.push(this.joyBase, this.joyThumb, shotBtn, shotLbl, passBtn, passLbl);
  }

  private updateJoystickFromPointer(pointer: Phaser.Input.Pointer) {
    const dx = pointer.x - this.joyBaseX;
    const dy = pointer.y - this.joyBaseY;
    const dist  = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, this.JOY_RADIUS);
    const angle   = Math.atan2(dy, dx);
    this.joyThumb.setPosition(
      this.joyBaseX + Math.cos(angle) * clamped,
      this.joyBaseY + Math.sin(angle) * clamped
    );
    const norm = clamped / this.JOY_RADIUS;
    if (norm < 0.12) { this.joyVector.x = 0; this.joyVector.y = 0; }
    else { this.joyVector.x = Math.cos(angle) * norm; this.joyVector.y = Math.sin(angle) * norm; }
  }

  private resetJoystick() {
    this.joyPointerId = null;
    this.joyVector.x  = 0; this.joyVector.y = 0;
    this.joyThumb.setPosition(this.joyBaseX, this.joyBaseY);
  }

  private flashButton(btn: Phaser.GameObjects.Arc) {
    this.tweens.killTweensOf(btn);
    btn.setScale(1.25);
    this.tweens.add({ targets: btn, scale: 1, duration: 150, ease: 'Cubic.easeOut' });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INPUT & COLLIDERS
  // ══════════════════════════════════════════════════════════════════════════

  private setupInputs() {
    if (!this.input.keyboard) return;
    this.cursors  = this.input.keyboard.createCursorKeys();
    this.wasd     = this.input.keyboard.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.xKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
  }

  private setupColliders() {
    this.physics.add.collider(this.ball, this.walls);
    this.physics.add.collider(this.players, this.ball, (playerObj, ballObj) => {
      applyHaxballCollision(
        playerObj as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
        ballObj   as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
      );
    });
    this.physics.add.collider(this.players, this.players);
    this.physics.add.collider(this.players, this.walls);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIMER
  // ══════════════════════════════════════════════════════════════════════════

  private setupTimer() {
    this.matchTimer = this.time.addEvent({
      delay: 1000, callback: this.tickClock, callbackScope: this, loop: true,
    });
  }

  private tickClock() {
    this.clockTime++;
    this.game.events.emit('match_event', { type: 'tick', time: this.clockTime });
    if (this.clockTime === 120 && !this.isSecondHalf) {
      this.isSecondHalf = true;
      this.scene.pause();
      this.scene.launch('HalfTimeScene');
    } else if (this.clockTime >= 240) {
      this.matchTimer.remove();
      this.scene.pause();
      this.scene.launch('MatchEndScene');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // USER PLAYER UPDATE
  // ══════════════════════════════════════════════════════════════════════════

  private updateUserPlayer() {
    if (!this.userPlayer) return;

    let ax = 0, ay = 0;

    if (this.isTouchDevice && (this.joyVector.x !== 0 || this.joyVector.y !== 0)) {
      ax = this.joyVector.x * PLAYER_ACCEL;
      ay = this.joyVector.y * PLAYER_ACCEL;
    } else if (this.cursors && this.wasd) {
      const L = this.cursors.left.isDown  || this.wasd['A'].isDown;
      const R = this.cursors.right.isDown || this.wasd['D'].isDown;
      const U = this.cursors.up.isDown    || this.wasd['W'].isDown;
      const D = this.cursors.down.isDown  || this.wasd['S'].isDown;
      if (L) ax = -PLAYER_ACCEL; else if (R) ax = PLAYER_ACCEL;
      if (U) ay = -PLAYER_ACCEL; else if (D) ay = PLAYER_ACCEL;
      if (ax !== 0 && ay !== 0) { ax /= Math.SQRT2; ay /= Math.SQRT2; }
    }

    this.userPlayer.body.setAcceleration(ax, ay);
    if (ax !== 0 || ay !== 0) {
      this.userPlayer.setData('facingAngle', Math.atan2(ay, ax));
    }

    const shootStat = this.matchData.playerStats?.shooting ?? 50;
    const passStat  = this.matchData.playerStats?.passing  ?? 50;
    const shotMult  = 0.75 + shootStat / 100 * 0.5;
    const passMult  = 0.75 + passStat  / 100 * 0.5;

    const wantsShot = Phaser.Input.Keyboard.JustDown(this.spaceKey) || this.mobileShotRequested;
    const wantsPass = Phaser.Input.Keyboard.JustDown(this.xKey)     || this.mobilePassRequested;
    this.mobileShotRequested = false;
    this.mobilePassRequested = false;

    if (wantsShot) {
      if (kickBall(this.userPlayer, this.ball, SHOT_FORCE, shotMult, this.time.now)) {
        this.userStats.shots++;
        this.game.registry.set('userStats', this.userStats);
        this.showKickFeedback(this.userPlayer.x, this.userPlayer.y, true);
        this.ball.setData('lastTouchedByUser', true);
      }
    } else if (wantsPass) {
      if (kickBall(this.userPlayer, this.ball, PASS_FORCE, passMult, this.time.now)) {
        this.showKickFeedback(this.userPlayer.x, this.userPlayer.y, false);
        this.ball.setData('lastTouchedByUser', true);
      }
    }

    if (Phaser.Math.Distance.Between(this.userPlayer.x, this.userPlayer.y, this.ball.x, this.ball.y) < 30) {
      this.ball.setData('lastTouchedByUser', true);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GOAL HANDLING
  // ══════════════════════════════════════════════════════════════════════════

  private onGoal(scoring: 'home' | 'away') {
    if (this.ball.getData('goalScoredGuard')) return;
    this.ball.setData('goalScoredGuard', true);
    this.score[scoring]++;
    this.game.registry.set('scoreState', this.score);

    if (this.ball.getData('lastTouchedByUser')) {
      const userIsHome = this.matchData.userTeamId === this.matchData.homeTeam.id;
      const userScored = (scoring === 'home' && userIsHome) || (scoring === 'away' && !userIsHome);
      if (userScored) { this.userStats.goals++; this.game.registry.set('userStats', this.userStats); }
    }

    const teamName = scoring === 'home' ? this.matchData.homeTeam.name : this.matchData.awayTeam.name;
    this.game.events.emit('match_event', { type: 'goal', score: { ...this.score }, scoringTeam: teamName });
    this.cameras.main.shake(350, 0.012);

    this.physics.pause();
    this.time.delayedCall(650, () => {
      this.resetPositions();
      this.ball.setData('goalScoredGuard',   false);
      this.ball.setData('lastTouchedByUser', false);
      this.physics.resume();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SYNC VISUALS — FIX: force setVisible(true) every frame, never skip
  // ══════════════════════════════════════════════════════════════════════════

  private syncVisuals() {
    this.playerVisuals.forEach(({ sprite, circle, numText, nameText, shadow }) => {
      // FIX: Don't skip inactive sprites — force visibility and update position anyway.
      // The old `if (!sprite.active) return` was permanently hiding circles when
      // the scene paused/resumed or physics bodies were temporarily disabled.
      const x = Number.isFinite(sprite.x) ? sprite.x : (sprite.getData('spawnX') ?? PITCH_W / 2);
      const y = Number.isFinite(sprite.y) ? sprite.y : (sprite.getData('spawnY') ?? PITCH_H / 2);

      circle.setPosition(x, y).setVisible(true).setActive(true);
      shadow.setPosition(x + 2, y + 4).setVisible(true);
      numText.setPosition(x, y).setVisible(true);
      nameText.setPosition(x, y + PLAYER_RADIUS + 4).setVisible(true);
    });

    this.updatePossessionTriangles();
  }

  private updatePossessionTriangles() {
    const players   = this.players.getChildren() as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[];
    const POSS_DIST = 72;

    let nearHome: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null = null;
    let nearAway: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null = null;
    let minH = Infinity, minA = Infinity;

    players.forEach(p => {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      const d = Phaser.Math.Distance.Between(p.x, p.y, this.ball.x, this.ball.y);
      if (p.getData('isHome') as boolean) { if (d < minH) { minH = d; nearHome = p; } }
      else                                { if (d < minA) { minA = d; nearAway = p; } }
    });

    if (nearHome && minH < POSS_DIST) {
      this.possTriHome.setPosition((nearHome as any).x, (nearHome as any).y - PLAYER_RADIUS - 14).setVisible(true);
    } else { this.possTriHome.setVisible(false); }

    if (nearAway && minA < POSS_DIST) {
      this.possTriAway.setPosition((nearAway as any).x, (nearAway as any).y - PLAYER_RADIUS - 14).setVisible(true);
    } else { this.possTriAway.setVisible(false); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONTACT SPEED PENALTY
  // ══════════════════════════════════════════════════════════════════════════

  private applyContactSpeedPenalty() {
    (this.players.getChildren() as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[]).forEach(p => {
      if (!p.body) return;
      const baseMaxVel = (p.getData('baseMaxVel') as number) ?? PLAYER_MAX_VEL;
      const dist = Phaser.Math.Distance.Between(p.x, p.y, this.ball.x, this.ball.y);
      p.setMaxVelocity(dist <= CONTACT_DIST ? baseMaxVel * CONTACT_SLOWDOWN : baseMaxVel);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESET — FIX: null-check body before accessing, prevents forEach crash
  // ══════════════════════════════════════════════════════════════════════════

  private resetPositions() {
    // Reset ball
    this.ball.setPosition(PITCH_W / 2, PITCH_H / 2);
    if (this.ball.body) {
      this.ball.body.setVelocity(0, 0);
      this.ball.body.setAcceleration(0, 0);
    }

    const homeSlots = getFormationPositions('6-ASIDE', true,  PITCH_W, PITCH_H);
    const awaySlots = getFormationPositions('6-ASIDE', false, PITCH_W, PITCH_H);
    let hi = 0, ai = 0;

    (this.players.getChildren() as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[]).forEach(p => {
      const isHome = p.getData('isHome') as boolean;
      const slots  = isHome ? homeSlots : awaySlots;
      const idx    = isHome ? hi++ : ai++;

      if (!slots[idx]) return; // skip if formation has fewer slots than players

      p.setPosition(slots[idx].x, slots[idx].y);
      p.setActive(true).setVisible(false); // physics sprite stays invisible, visuals handle display

      // FIX: guard against null body — was crashing here and aborting the loop,
      // leaving remaining players un-reset and off-screen or in wrong positions.
      if (p.body) {
        p.body.setVelocity(0, 0);
        p.body.setAcceleration(0, 0);
        p.body.enable = true; // re-enable in case it was disabled during goal sequence
      }
    });
  }
}
