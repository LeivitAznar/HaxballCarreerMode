/**
 * MatchScene.ts — Core gameplay scene.
 *
 * Physics (points 1–5 from previous task):
 *   Acceleration-based player movement · real Arcade collider ball physics ·
 *   kickBall() with range/cooldown · static wall boundaries with goal gaps.
 *
 * Visuals (reference image replication):
 *   1. Vertical striped grass + full field markings (D-arcs, corner arcs,
 *      penalty areas, 6-yard boxes, centre circle + watermark).
 *   2. Goal frames and net grid visible from top-down.
 *   3. Player circles: filled colour circle + shirt number (bold white) +
 *      player name below.  Physics sprite is invisible; Graphics carry the look.
 *   4. Possession triangle indicator (team-coloured ▼) over nearest player to ball.
 *   5. Ball with pentagon-patch texture (generated in BootScene).
 *   6. Minimap (second camera) at bottom centre.
 *   7. Controls panel (Phaser Graphics) at bottom right.
 *   8. Stadium dark border strips at top and bottom.
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
const PITCH_W    = 900;
const PITCH_H    = 580;
const FIELD_TOP  = 50;          // top of playing field — matches React HUD height
const FIELD_BOT  = 550;         // bottom of playing field
const FIELD_X    = 24;          // left touchline
const FIELD_W    = PITCH_W - FIELD_X * 2; // 852
const FIELD_H    = FIELD_BOT - FIELD_TOP; // 500
const CENTER_Y   = PITCH_H / 2; // 290
const GOAL_H     = 120;
const GOAL_TOP   = CENTER_Y - GOAL_H / 2; // 230
const GOAL_BOT   = CENTER_Y + GOAL_H / 2; // 350
const WALL_T     = 8;

// Minimap (bottom centre, inside playing area)
const MINI_W = 180;
const MINI_H = Math.round(MINI_W * PITCH_H / PITCH_W); // 116
const MINI_X = (PITCH_W - MINI_W) / 2;                 // 360
const MINI_Y = FIELD_BOT - MINI_H - 8;                 // 426

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Darken a packed RGB colour by `factor` (0 = unchanged, 1 = black). */
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

interface PlayerVisual {
  sprite:   Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  circle:   Phaser.GameObjects.Graphics;
  numText:  Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
}

// ─────────────────────────────────────────────────────────────────────────────
export default class MatchScene extends Phaser.Scene {

  // ── Physics objects
  private ball!:       Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private userPlayer!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private players!:    Phaser.GameObjects.Group;
  private aiPlayers:   AIPlayerEntry[]   = [];
  private walls!:      Phaser.Physics.Arcade.StaticGroup;

  // ── Player visuals (circle + texts drawn separately from physics sprite)
  private playerVisuals: PlayerVisual[]  = [];

  // ── Possession indicators
  private possTriHome!: Phaser.GameObjects.Graphics;
  private possTriAway!: Phaser.GameObjects.Graphics;

  // ── Input
  private cursors!:  Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!:     Record<string, Phaser.Input.Keyboard.Key>;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private xKey!:     Phaser.Input.Keyboard.Key;

  // ── Match state
  private matchData:  any;
  private score      = { home: 0, away: 0 };
  private clockTime  = 0;
  private isSecondHalf = false;
  private matchTimer!: Phaser.Time.TimerEvent;
  private userStats  = { goals: 0, assists: 0, shots: 0 };

  // ── Kick feedback
  private kickIndicator!: Phaser.GameObjects.Graphics;

  // ── Cameras
  private minimapCam!: Phaser.Cameras.Scene2D.Camera;

  // ── Objects to hide from minimap camera (UI overlays)
  private uiObjects: Phaser.GameObjects.GameObject[] = [];

  // ── Frame counter for AI throttle
  private frameCount = 0;

  // ── Mobile controls (virtual joystick + action buttons) ──────────────────
  private isTouchDevice = false;
  private joyPointerId: number | null = null;
  private joyBase!:  Phaser.GameObjects.Arc;
  private joyThumb!: Phaser.GameObjects.Arc;
  private joyBaseX  = 0;
  private joyBaseY  = 0;
  private readonly JOY_RADIUS = 50;
  private joyVector = { x: 0, y: 0 }; // normalised -1..1, {0,0} when idle
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

    // Build layers in depth order
    this.drawPitch();             // depth 0–4  : grass, markings, goals, border
    this.createWalls();           // static physics bodies (invisible)
    this.createGoalposts();       // static post bodies
    this.createBall();            // depth 10
    this.createPlayers();         // depth 8–9  : circles & text
    this.createGoalZones();       // overlap zones
    this.createPossessionTriangles(); // depth 15
    this.createKickIndicator();   // depth 20
    this.setupInputs();
    this.setupColliders();
    this.setupTimer();
    this.setupMinimapAndUI();     // minimap camera + controls panel + border

    // Allow at least 3 simultaneous touch pointers (joystick + a button at once).
    // Without this, Phaser only tracks 1 pointer by default and mobile controls
    // will randomly "eat" one of the two simultaneous touches.
    this.input.addPointer(2);
    this.isTouchDevice = this.sys.game.device.input.touch;
    if (this.isTouchDevice) this.setupMobileControls();
  }

  update() {
    this.frameCount++;

    // ── Safety net: recover any player/ball corrupted by a NaN position ────
    // (root cause is almost always a division-by-zero upstream in AI steering
    // logic — this keeps the match playable even if that's not fully fixed yet)
    (this.players.getChildren() as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[])
      .forEach(p => {
        const fx = (p.getData('spawnX') as number) ?? PITCH_W / 2;
        const fy = (p.getData('spawnY') as number) ?? PITCH_H / 2;
        sanitizeBody(p, fx, fy, (p.getData('isUser') ? 'userPlayer' : 'aiPlayer'));
      });
    sanitizeBody(this.ball, PITCH_W / 2, PITCH_H / 2, 'ball');

    this.updateUserPlayer();
    updateAI(this.aiPlayers, this.ball, PITCH_W, PITCH_H, this.time.now, this.frameCount);
    // Apply speed penalty to any player currently in contact with the ball
    this.applyContactSpeedPenalty();
    this.syncVisuals();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1–2. PITCH DRAWING  (all generated once, never re-drawn each frame)
  // ══════════════════════════════════════════════════════════════════════════

  private drawPitch() {
    const g = this.add.graphics().setDepth(0);

    // ── 8. Stadium dark border strips (top / bottom) ──────────────────────
    const DARK_BG = 0x0d1117;
    g.fillStyle(DARK_BG, 1);
    g.fillRect(0, 0, PITCH_W, FIELD_TOP);          // covered by React HUD
    g.fillRect(0, FIELD_BOT, PITCH_W, PITCH_H - FIELD_BOT);

    // Bottom sponsor text
    const sponsorStyle = {
      fontSize: '9px', fontFamily: 'monospace',
      fontStyle: 'bold', color: '#1a2e1a',
    };
    this.add.text(PITCH_W / 2, FIELD_BOT + 15,
      'FOOTBALL CAREER ✦ FOOTBALL CAREER ✦ FOOTBALL CAREER ✦ FOOTBALL CAREER',
      sponsorStyle).setOrigin(0.5).setDepth(3);

    // Corner spotlights (subtle)
    g.fillStyle(0xffffff, 0.04);
    g.fillCircle(0,       FIELD_TOP,    40);
    g.fillCircle(PITCH_W, FIELD_TOP,    40);
    g.fillCircle(0,       FIELD_BOT,    30);
    g.fillCircle(PITCH_W, FIELD_BOT,    30);

    // ── 1. Vertical grass stripes ─────────────────────────────────────────
    const STRIPE_W   = 56;
    const DARK_GREEN  = 0x1a5c1f;
    const LIGHT_GREEN = 0x1f6e26;
    const STRIPES = Math.ceil(PITCH_W / STRIPE_W) + 1;
    for (let i = 0; i < STRIPES; i++) {
      g.fillStyle(i % 2 === 0 ? DARK_GREEN : LIGHT_GREEN, 1);
      g.fillRect(FIELD_X + i * STRIPE_W, FIELD_TOP, STRIPE_W, FIELD_H);
    }

    // ── 2. Goal net area background (slightly darker) ─────────────────────
    g.fillStyle(0x164a1a, 1);
    g.fillRect(0,              GOAL_TOP, FIELD_X,              GOAL_H); // left net
    g.fillRect(FIELD_X + FIELD_W, GOAL_TOP, PITCH_W - (FIELD_X + FIELD_W), GOAL_H); // right net

    // ── Net grid — left ───────────────────────────────────────────────────
    g.lineStyle(1, 0xffffff, 0.14);
    const NET_CELL = 9;
    for (let y = GOAL_TOP; y <= GOAL_BOT; y += NET_CELL) {
      g.beginPath(); g.moveTo(1, y); g.lineTo(FIELD_X - 1, y); g.strokePath();
    }
    for (let x = 1; x <= FIELD_X - 1; x += NET_CELL) {
      g.beginPath(); g.moveTo(x, GOAL_TOP); g.lineTo(x, GOAL_BOT); g.strokePath();
    }
    // ── Net grid — right ──────────────────────────────────────────────────
    const RX = FIELD_X + FIELD_W;
    for (let y = GOAL_TOP; y <= GOAL_BOT; y += NET_CELL) {
      g.beginPath(); g.moveTo(RX + 1, y); g.lineTo(PITCH_W - 1, y); g.strokePath();
    }
    for (let x = RX + 1; x <= PITCH_W - 1; x += NET_CELL) {
      g.beginPath(); g.moveTo(x, GOAL_TOP); g.lineTo(x, GOAL_BOT); g.strokePath();
    }

    // ── Goal frames (white lines: crossbar top, crossbar bottom, back wall) ─
    g.lineStyle(3, 0xffffff, 0.95);
    // Left goal
    g.beginPath(); g.moveTo(1,       GOAL_TOP); g.lineTo(FIELD_X, GOAL_TOP); g.strokePath();
    g.beginPath(); g.moveTo(1,       GOAL_BOT); g.lineTo(FIELD_X, GOAL_BOT); g.strokePath();
    g.beginPath(); g.moveTo(1,       GOAL_TOP); g.lineTo(1,       GOAL_BOT); g.strokePath();
    // Right goal
    g.beginPath(); g.moveTo(RX,      GOAL_TOP); g.lineTo(PITCH_W - 1, GOAL_TOP); g.strokePath();
    g.beginPath(); g.moveTo(RX,      GOAL_BOT); g.lineTo(PITCH_W - 1, GOAL_BOT); g.strokePath();
    g.beginPath(); g.moveTo(PITCH_W - 1, GOAL_TOP); g.lineTo(PITCH_W - 1, GOAL_BOT); g.strokePath();

    // ── 1. Field markings ─────────────────────────────────────────────────
    g.lineStyle(2, 0xffffff, 0.82);

    // Outer touchline
    g.strokeRect(FIELD_X, FIELD_TOP, FIELD_W, FIELD_H);

    // Halfway line
    g.beginPath(); g.moveTo(PITCH_W / 2, FIELD_TOP); g.lineTo(PITCH_W / 2, FIELD_BOT); g.strokePath();

    // Centre circle (r=70) + centre dot
    g.strokeCircle(PITCH_W / 2, CENTER_Y, 70);
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(PITCH_W / 2, CENTER_Y, 3.5);

    // ── Penalty areas ─────────────────────────────────────────────────────
    const PA_W = 140, PA_H = 260;
    const PA_TOP = CENTER_Y - PA_H / 2;    // 160
    // Left PA
    g.lineStyle(2, 0xffffff, 0.82);
    g.strokeRect(FIELD_X, PA_TOP, PA_W, PA_H);
    // Left 6-yard box
    const SB_W = 56, SB_H = 130;
    const SB_TOP = CENTER_Y - SB_H / 2;   // 225
    g.strokeRect(FIELD_X, SB_TOP, SB_W, SB_H);
    // Left penalty spot
    const PS_L_X = FIELD_X + 92; // 116
    g.fillStyle(0xffffff, 0.85); g.fillCircle(PS_L_X, CENTER_Y, 3.5);
    // Left D-arc (arc of r=65 centred on penalty spot, outside PA)
    const PA_L_EDGE = FIELD_X + PA_W; // 164
    const D_R = 65;
    const D_ANG = Math.acos((PA_L_EDGE - PS_L_X) / D_R); // ~0.740 rad
    g.lineStyle(2, 0xffffff, 0.82);
    g.beginPath(); g.arc(PS_L_X, CENTER_Y, D_R, -D_ANG, D_ANG); g.strokePath();

    // Right PA (mirror)
    const PA_R_X = FIELD_X + FIELD_W - PA_W; // 736
    g.strokeRect(PA_R_X, PA_TOP, PA_W, PA_H);
    // Right 6-yard box
    g.strokeRect(FIELD_X + FIELD_W - SB_W, SB_TOP, SB_W, SB_H);
    // Right penalty spot
    const PS_R_X = FIELD_X + FIELD_W - 92; // 784
    g.fillStyle(0xffffff, 0.85); g.fillCircle(PS_R_X, CENTER_Y, 3.5);
    // Right D-arc
    g.lineStyle(2, 0xffffff, 0.82);
    g.beginPath(); g.arc(PS_R_X, CENTER_Y, D_R, Math.PI - D_ANG, Math.PI + D_ANG); g.strokePath();

    // ── Corner arcs (quarter-circles at each touchline corner) ────────────
    const C_R = 10;
    g.beginPath(); g.arc(FIELD_X,            FIELD_TOP, C_R, 0,              Math.PI / 2); g.strokePath();
    g.beginPath(); g.arc(FIELD_X + FIELD_W,  FIELD_TOP, C_R, Math.PI / 2,   Math.PI);     g.strokePath();
    g.beginPath(); g.arc(FIELD_X,            FIELD_BOT, C_R, -Math.PI / 2,  0);            g.strokePath();
    g.beginPath(); g.arc(FIELD_X + FIELD_W,  FIELD_BOT, C_R, Math.PI,       Math.PI * 1.5); g.strokePath();

    // ── Centre watermark (game logo, very low opacity) ────────────────────
    this.add.text(PITCH_W / 2, CENTER_Y, 'FC', {
      fontSize: '56px', fontFamily: 'Arial, sans-serif', fontStyle: 'bold italic',
      color: '#ffffff',
    }).setOrigin(0.5).setAlpha(0.055).setDepth(1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WALLS & GOALPOSTS (static bodies)
  // ══════════════════════════════════════════════════════════════════════════

  private createWalls() {
    this.walls = this.physics.add.staticGroup();

    const addWall = (cx: number, cy: number, w: number, h: number) => {
      const wall = this.physics.add.staticImage(cx, cy, 'pixel');
      wall.setDisplaySize(w, h);
      wall.setAlpha(0);
      wall.setBounce(0.5);
      wall.refreshBody();
      this.walls.add(wall, true);
    };

    // Top & bottom field boundaries
    addWall(PITCH_W / 2, FIELD_TOP + WALL_T / 2,    PITCH_W, WALL_T);
    addWall(PITCH_W / 2, FIELD_BOT - WALL_T / 2,    PITCH_W, WALL_T);

    // Left side — above goal gap
    const leftTopH = GOAL_TOP - FIELD_TOP;       // 180
    addWall(WALL_T / 2, (FIELD_TOP + GOAL_TOP) / 2, WALL_T, leftTopH);
    // Left side — below goal gap
    const leftBotH = FIELD_BOT - GOAL_BOT;       // 200
    addWall(WALL_T / 2, (GOAL_BOT + FIELD_BOT) / 2, WALL_T, leftBotH);

    // Right side — above goal gap
    addWall(PITCH_W - WALL_T / 2, (FIELD_TOP + GOAL_TOP) / 2, WALL_T, leftTopH);
    // Right side — below goal gap
    addWall(PITCH_W - WALL_T / 2, (GOAL_BOT + FIELD_BOT) / 2, WALL_T, leftBotH);
  }

  private createGoalposts() {
    const addPost = (x: number, y: number) => {
      const post = this.physics.add.staticSprite(x, y, 'post');
      post.setCircle(6, 0, 0);
      post.setBounce(0.7);
      post.refreshBody();
      this.walls.add(post, true);
    };
    addPost(WALL_T,             GOAL_TOP);
    addPost(WALL_T,             GOAL_BOT);
    addPost(PITCH_W - WALL_T,   GOAL_TOP);
    addPost(PITCH_W - WALL_T,   GOAL_BOT);
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
  // 3. PLAYERS — invisible physics sprite + visual circle + texts
  // ══════════════════════════════════════════════════════════════════════════

  private createPlayers() {
    this.players      = this.add.group();
    this.aiPlayers    = [];
    this.playerVisuals = [];

    const homeTeam = this.matchData.homeTeam as Team;
    const awayTeam = this.matchData.awayTeam as Team;

    const homeSlots = getFormationPositions('6-ASIDE', true,  PITCH_W, PITCH_H);
    const awaySlots = getFormationPositions('6-ASIDE', false, PITCH_W, PITCH_H);

    // Match roster players to formation slots (by position, greedy)
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

    // ── Physics sprite (invisible — only the body matters for collision) ───
    const sprite = this.physics.add.sprite(slot.x, slot.y, 'pixel') as
      Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    sprite.setAlpha(0);
    sprite.setDisplaySize(PLAYER_RADIUS * 2, PLAYER_RADIUS * 2);

    const speedStat = isUser && this.matchData.playerStats?.speed
      ? this.matchData.playerStats.speed : 60;
    const maxVel = PLAYER_MAX_VEL * (0.75 + speedStat / 100 * 0.5);
    configurePlayer(sprite, maxVel);
    // Store base max velocity so the contact-slowdown system can restore it later
    sprite.setData('baseMaxVel', maxVel);
    // Store spawn slot so sanitizeBody() has a safe fallback to recover to
    sprite.setData('spawnX', slot.x);
    sprite.setData('spawnY', slot.y);

    sprite.setData('isHome',  isHome);
    sprite.setData('pos',     slot.pos);
    sprite.setData('isUser',  isUser);
    sprite.setData('team',    team);

    // ── Visual circle ──────────────────────────────────────────────────────
    const fillColor   = team.primaryColor;
    const strokeColor = darken(fillColor, 0.35);

    const circle = this.add.graphics().setDepth(8);
    circle.fillStyle(fillColor, 1);
    circle.fillCircle(0, 0, PLAYER_RADIUS);
    circle.lineStyle(2.5, strokeColor, 1);
    circle.strokeCircle(0, 0, PLAYER_RADIUS);
    circle.setPosition(slot.x, slot.y);

    // ── Shirt number (inside circle) ──────────────────────────────────────
    const numText = this.add.text(slot.x, slot.y, `${rPlayer.shirtNumber}`, {
      fontSize:   '11px',
      fontFamily: 'Arial, sans-serif',
      fontStyle:  'bold',
      color:      '#ffffff',
    }).setOrigin(0.5, 0.5).setDepth(9);

    // ── Player name (below circle) ────────────────────────────────────────
    // Use last word of name as surname (avoids "DEF 2" → show "2" or use full name)
    const displayName = rPlayer.name.split(' ').pop()?.toUpperCase() ?? rPlayer.name.toUpperCase();
    const nameText = this.add.text(slot.x, slot.y + PLAYER_RADIUS + 5, displayName, {
      fontSize:   '8px',
      fontFamily: 'Arial, sans-serif',
      fontStyle:  'bold',
      color:      '#ffffff',
      shadow:     { color: '#000000', fill: true, offsetX: 1, offsetY: 1, blur: 2 },
    }).setOrigin(0.5, 0).setDepth(9);

    this.playerVisuals.push({ sprite, circle, numText, nameText });
    this.players.add(sprite);

    if (isUser) {
      this.userPlayer = sprite;
    } else {
      this.aiPlayers.push({
        sprite, isHome,
        basePos: { x: slot.x, y: slot.y },
        role:    slot.pos as AIPlayerEntry['role'],
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. POSSESSION TRIANGLES  (▼ above nearest player to ball, per team)
  // ══════════════════════════════════════════════════════════════════════════

  private createPossessionTriangles() {
    const homeColor = (this.matchData.homeTeam as Team).primaryColor;
    const awayColor = (this.matchData.awayTeam as Team).primaryColor;

    this.possTriHome = this.makeTri(homeColor);
    this.possTriAway = this.makeTri(awayColor);
  }

  private makeTri(color: number): Phaser.GameObjects.Graphics {
    const t = this.add.graphics().setDepth(15);
    t.fillStyle(color, 1);
    t.lineStyle(1.5, darken(color, 0.4), 1);
    // Downward-pointing ▼: vertices top-left, top-right, bottom-centre
    t.fillTriangle(-7, 0, 7, 0, 0, 9);
    t.strokeTriangle(-7, 0, 7, 0, 0, 9);
    t.setVisible(false);
    return t;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GOAL DETECTION ZONES
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
      targets:  this.kickIndicator,
      scale:    { from: 0.5, to: 1.5 },
      alpha:    { from: 0.8, to: 0 },
      duration: 250,
      ease:     'Cubic.easeOut',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6–7. MINIMAP + CONTROLS PANEL
  // ══════════════════════════════════════════════════════════════════════════

  private setupMinimapAndUI() {
    // ── Minimap camera ─────────────────────────────────────────────────────
    this.minimapCam = this.cameras.add(MINI_X, MINI_Y, MINI_W, MINI_H);
    this.minimapCam.setZoom(MINI_W / PITCH_W);   // 0.2 — shows full 900×580 scene
    this.minimapCam.setBounds(0, 0, PITCH_W, PITCH_H);
    this.minimapCam.setBackgroundColor(0x0d1a0f);

    // ── Minimap border ─────────────────────────────────────────────────────
    const border = this.add.graphics().setDepth(50);
    border.lineStyle(2, 0x2ea043, 1);
    border.strokeRect(MINI_X - 2, MINI_Y - 2, MINI_W + 4, MINI_H + 4);
    // Label
    const mmLabel = this.add.text(MINI_X + MINI_W / 2, MINI_Y - 10, 'RADAR', {
      fontSize: '8px', fontFamily: 'monospace', color: '#2ea043',
    }).setOrigin(0.5, 1).setDepth(50);

    this.uiObjects.push(border, mmLabel);

    // ── Controls panel ─────────────────────────────────────────────────────
    const PX = MINI_X + MINI_W + 12;  // 552
    const PY = MINI_Y;                  // 426
    const PW = 166, PH = MINI_H;       // same height as minimap

    const panel = this.add.graphics().setDepth(50);
    // Background
    panel.fillStyle(0x000000, 0.78);
    panel.fillRoundedRect(PX, PY, PW, PH, 8);

    // Row 1 — X = TIRO
    panel.fillStyle(0x101828, 1);
    panel.fillRoundedRect(PX + 10, PY + 14, 32, 28, 4);
    panel.lineStyle(2, 0x00bcd4, 1);
    panel.strokeRoundedRect(PX + 10, PY + 14, 32, 28, 4);

    // Row 2 — ESPACIO = PASE
    panel.fillStyle(0x101828, 1);
    panel.fillRoundedRect(PX + 10, PY + 54, 86, 26, 4);
    panel.lineStyle(2, 0x555566, 1);
    panel.strokeRoundedRect(PX + 10, PY + 54, 86, 26, 4);

    // Key labels & action labels
    const mkText = (x: number, y: number, str: string, size: string, col: string) =>
      this.add.text(x, y, str, {
        fontSize: size, fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold', color: col,
      }).setOrigin(0.5).setDepth(51);

    const tiro    = mkText(PX + 26,      PY + 28,  'X',       '13px', '#ffffff');
    const tiroLbl = mkText(PX + 88,      PY + 28,  'TIRO',    '11px', '#e0e0e0');
    const esp     = mkText(PX + 53,      PY + 67,  'ESPACIO', '9px',  '#c0c0c0');
    const paseLbl = mkText(PX + 125,     PY + 67,  'PASE',    '11px', '#e0e0e0');

    // Separator
    const sep = this.add.graphics().setDepth(50);
    sep.lineStyle(1, 0x333344, 1);
    sep.beginPath();
    sep.moveTo(PX + 10,  PY + 47);
    sep.lineTo(PX + PW - 10, PY + 47);
    sep.strokePath();

    this.uiObjects.push(panel, sep, tiro, tiroLbl, esp, paseLbl);

    // ── Tell minimap camera to ignore all UI overlays ──────────────────────
    this.minimapCam.ignore([...this.uiObjects, this.kickIndicator]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MOBILE CONTROLS — virtual joystick (left) + pass/shot buttons (right)
  // ══════════════════════════════════════════════════════════════════════════

  private setupMobileControls() {
    // ── Virtual joystick (bottom-left) ──────────────────────────────────────
    this.joyBaseX = 90;
    this.joyBaseY = FIELD_BOT - 90;

    this.joyBase = this.add.circle(this.joyBaseX, this.joyBaseY, this.JOY_RADIUS, 0xffffff, 0.15)
      .setStrokeStyle(2, 0xffffff, 0.4)
      .setDepth(60)
      .setScrollFactor(0);
    this.joyThumb = this.add.circle(this.joyBaseX, this.joyBaseY, 22, 0xffffff, 0.35)
      .setStrokeStyle(2, 0xffffff, 0.6)
      .setDepth(61)
      .setScrollFactor(0);

    this.uiObjects.push(this.joyBase, this.joyThumb);

    // Enlarged invisible hit-zone so the joystick is easy to grab with a thumb
    const joyZone = this.add.zone(this.joyBaseX, this.joyBaseY, this.JOY_RADIUS * 2.6, this.JOY_RADIUS * 2.6)
      .setInteractive()
      .setDepth(62);
    this.uiObjects.push(joyZone);

    joyZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.joyPointerId !== null) return; // joystick already claimed by another finger
      this.joyPointerId = pointer.id;
      this.updateJoystickFromPointer(pointer);
    });

    // Track movement/release globally (finger can slide outside the small zone)
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.joyPointerId) this.updateJoystickFromPointer(pointer);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.joyPointerId) this.resetJoystick();
    });
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.joyPointerId) this.resetJoystick();
    });

    // ── Action buttons (bottom-right, above the existing controls panel) ───
    const btnShotX = PITCH_W - 130, btnShotY = FIELD_BOT - 120;
    const btnPassX = PITCH_W - 60,  btnPassY = FIELD_BOT - 70;

    const shotBtn = this.add.circle(btnShotX, btnShotY, 34, 0xff6600, 0.35)
      .setStrokeStyle(2, 0xff6600, 0.9).setDepth(60).setInteractive();
    const shotLbl = this.add.text(btnShotX, btnShotY, 'TIRO', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(61);

    const passBtn = this.add.circle(btnPassX, btnPassY, 30, 0x0088ff, 0.35)
      .setStrokeStyle(2, 0x0088ff, 0.9).setDepth(60).setInteractive();
    const passLbl = this.add.text(btnPassX, btnPassY, 'PASE', {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(61);

    this.uiObjects.push(shotBtn, shotLbl, passBtn, passLbl);

    // Use pointerdown for instant response (not pointerup)
    shotBtn.on('pointerdown', () => { this.mobileShotRequested = true; this.flashButton(shotBtn); });
    passBtn.on('pointerdown', () => { this.mobilePassRequested = true; this.flashButton(passBtn); });

    // Prevent the browser from scrolling/zooming while playing on touch
    const canvas = this.game.canvas;
    canvas.style.touchAction = 'none';

    // Keep mobile UI out of the minimap camera
    this.minimapCam.ignore([this.joyBase, this.joyThumb, joyZone, shotBtn, shotLbl, passBtn, passLbl]);
  }

  private updateJoystickFromPointer(pointer: Phaser.Input.Pointer) {
    const dx = pointer.x - this.joyBaseX;
    const dy = pointer.y - this.joyBaseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, this.JOY_RADIUS);
    const angle = Math.atan2(dy, dx);

    const tx = this.joyBaseX + Math.cos(angle) * clamped;
    const ty = this.joyBaseY + Math.sin(angle) * clamped;
    this.joyThumb.setPosition(tx, ty);

    // Normalised vector, dead-zone under 12% to avoid drift from a shaky thumb
    const norm = clamped / this.JOY_RADIUS;
    if (norm < 0.12) {
      this.joyVector.x = 0;
      this.joyVector.y = 0;
    } else {
      this.joyVector.x = Math.cos(angle) * norm;
      this.joyVector.y = Math.sin(angle) * norm;
    }
  }

  private resetJoystick() {
    this.joyPointerId = null;
    this.joyVector.x = 0;
    this.joyVector.y = 0;
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
    this.physics.add.collider(this.ball,    this.walls);

    // ── Haxball-style player↔ball collision ───────────────────────────────
    // Phaser's Arcade resolver handles separation (bodies don't overlap).
    // Our callback fires every frame of contact and REPLACES the normal-axis
    // velocity with a proportional push — continuous "carrying" feel.
    this.physics.add.collider(
      this.players, this.ball,
      (playerObj, ballObj) => {
        applyHaxballCollision(
          playerObj as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
          ballObj   as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
        );
      }
    );

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
  // 1. USER PLAYER UPDATE — acceleration-based movement + kick
  // ══════════════════════════════════════════════════════════════════════════

  private updateUserPlayer() {
    if (!this.userPlayer) return;

    let ax = 0, ay = 0;

    if (this.isTouchDevice && (this.joyVector.x !== 0 || this.joyVector.y !== 0)) {
      // ── Mobile: joystick vector drives acceleration directly ────────────
      ax = this.joyVector.x * PLAYER_ACCEL;
      ay = this.joyVector.y * PLAYER_ACCEL;
    } else if (this.cursors && this.wasd) {
      // ── Desktop: keyboard ────────────────────────────────────────────────
      const L = this.cursors.left.isDown  || this.wasd['A'].isDown;
      const R = this.cursors.right.isDown || this.wasd['D'].isDown;
      const U = this.cursors.up.isDown    || this.wasd['W'].isDown;
      const D = this.cursors.down.isDown  || this.wasd['S'].isDown;

      if (L) ax = -PLAYER_ACCEL; else if (R) ax = PLAYER_ACCEL;
      if (U) ay = -PLAYER_ACCEL; else if (D) ay = PLAYER_ACCEL;

      // Normalise diagonal (joystick vector is already normalised, keyboard isn't)
      if (ax !== 0 && ay !== 0) { ax /= Math.SQRT2; ay /= Math.SQRT2; }
    }

    this.userPlayer.body.setAcceleration(ax, ay);
    if (ax !== 0 || ay !== 0) {
      this.userPlayer.setData('facingAngle', Math.atan2(ay, ax));
    }

    // Stat multipliers from career player stats
    const shootStat = this.matchData.playerStats?.shooting ?? 50;
    const passStat  = this.matchData.playerStats?.passing  ?? 50;
    const shotMult  = 0.75 + shootStat / 100 * 0.5;
    const passMult  = 0.75 + passStat  / 100 * 0.5;

    const wantsShot = Phaser.Input.Keyboard.JustDown(this.spaceKey) || this.mobileShotRequested;
    const wantsPass = Phaser.Input.Keyboard.JustDown(this.xKey)     || this.mobilePassRequested;
    this.mobileShotRequested = false;
    this.mobilePassRequested = false;

    if (wantsShot) {
      const kicked = kickBall(this.userPlayer, this.ball, SHOT_FORCE, shotMult, this.time.now);
      if (kicked) {
        this.userStats.shots++;
        this.game.registry.set('userStats', this.userStats);
        this.showKickFeedback(this.userPlayer.x, this.userPlayer.y, true);
        this.ball.setData('lastTouchedByUser', true);
      }
    } else if (wantsPass) {
      const kicked = kickBall(this.userPlayer, this.ball, PASS_FORCE, passMult, this.time.now);
      if (kicked) {
        this.showKickFeedback(this.userPlayer.x, this.userPlayer.y, false);
        this.ball.setData('lastTouchedByUser', true);
      }
    }

    // Track last toucher via natural collision range
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

    // User goal attribution
    if (this.ball.getData('lastTouchedByUser')) {
      const userIsHome = this.matchData.userTeamId === this.matchData.homeTeam.id;
      const userScored = (scoring === 'home' && userIsHome) || (scoring === 'away' && !userIsHome);
      if (userScored) {
        this.userStats.goals++;
        this.game.registry.set('userStats', this.userStats);
      }
    }

    const teamName = scoring === 'home'
      ? this.matchData.homeTeam.name
      : this.matchData.awayTeam.name;

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
  // SYNC VISUALS (called every frame from update)
  // ══════════════════════════════════════════════════════════════════════════

  private syncVisuals() {
    // Update circle + text positions to match physics sprite
    this.playerVisuals.forEach(({ sprite, circle, numText, nameText }) => {
      if (!sprite.active) return;
      circle.setPosition(sprite.x, sprite.y);
      numText.setPosition(sprite.x, sprite.y);
      nameText.setPosition(sprite.x, sprite.y + PLAYER_RADIUS + 4);
    });

    // Possession triangles — nearest player to ball per team
    this.updatePossessionTriangles();
  }

  private updatePossessionTriangles() {
    const players = this.players.getChildren() as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[];
    const POSS_DIST = 72;

    let nearHome: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null = null;
    let nearAway: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null = null;
    let minH = Infinity, minA = Infinity;

    players.forEach(p => {
      const d = Phaser.Math.Distance.Between(p.x, p.y, this.ball.x, this.ball.y);
      if (p.getData('isHome') as boolean) {
        if (d < minH) { minH = d; nearHome = p; }
      } else {
        if (d < minA) { minA = d; nearAway = p; }
      }
    });

    if (nearHome && minH < POSS_DIST) {
      this.possTriHome.setPosition((nearHome as any).x, (nearHome as any).y - PLAYER_RADIUS - 14);
      this.possTriHome.setVisible(true);
    } else {
      this.possTriHome.setVisible(false);
    }

    if (nearAway && minA < POSS_DIST) {
      this.possTriAway.setPosition((nearAway as any).x, (nearAway as any).y - PLAYER_RADIUS - 14);
      this.possTriAway.setVisible(true);
    } else {
      this.possTriAway.setVisible(false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HAXBALL CONTACT SPEED PENALTY
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Every frame, reduce a player's max-velocity to CONTACT_SLOWDOWN × base
   * while they are physically touching the ball (within CONTACT_DIST), and
   * restore it immediately when they're no longer in contact.
   *
   * This is a separate concern from applyHaxballCollision() (which runs
   * inside the Arcade collider callback during the physics step).  Checking
   * distance here — in our own update loop — avoids the Phaser callback
   * ordering problem and gives a clean per-frame reading.
   */
  private applyContactSpeedPenalty() {
    const players = this.players.getChildren() as
      Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[];

    players.forEach(p => {
      const baseMaxVel = (p.getData('baseMaxVel') as number) ?? PLAYER_MAX_VEL;
      const dist = Phaser.Math.Distance.Between(p.x, p.y, this.ball.x, this.ball.y);

      if (dist <= CONTACT_DIST) {
        // Touching ball → cap speed at 82 % of normal
        p.setMaxVelocity(baseMaxVel * CONTACT_SLOWDOWN);
      } else {
        // Not touching → restore full speed cap
        p.setMaxVelocity(baseMaxVel);
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESET
  // ══════════════════════════════════════════════════════════════════════════

  private resetPositions() {
  // Ball
  this.ball.setPosition(PITCH_W / 2, PITCH_H / 2);

  if (this.ball.body) {
    this.ball.body.enable = true;
    this.ball.body.setVelocity(0, 0);
    this.ball.body.setAcceleration(0, 0);
  }

  const homeSlots = getFormationPositions('6-ASIDE', true, PITCH_W, PITCH_H);
  const awaySlots = getFormationPositions('6-ASIDE', false, PITCH_W, PITCH_H);

  let hi = 0;
  let ai = 0;

  (this.players.getChildren() as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[]).forEach((p) => {
    const slots = p.getData('isHome') ? homeSlots : awaySlots;
    const idx = p.getData('isHome') ? hi++ : ai++;

    if (!slots[idx]) return;

    p.setPosition(slots[idx].x, slots[idx].y);

    // Si por alguna razón el body está deshabilitado,
    // lo volvemos a activar antes de tocar la física.
    if (p.body) {
      p.body.enable = true;
      p.body.setVelocity(0, 0);
      p.body.setAcceleration(0, 0);
    }
  });
}
}
