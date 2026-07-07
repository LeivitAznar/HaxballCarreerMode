/**
 * physics.ts — Ball and player physics constants + unified kick + Haxball push system.
 *
 * Design rules:
 *  - All movement uses velocity/acceleration from Arcade Physics (no manual x/y assignment).
 *  - Ball-player collision uses applyHaxballCollision() (called in collider callback) for
 *    continuous push feel rather than elastic bounce.
 *  - kickBall() is the ONLY place that intentionally sets ball velocity for passes/shots.
 */
import Phaser from 'phaser';

// ── Player physics ───────────────────────────────────────────────────────────
export const PLAYER_RADIUS  = 12;   // px  — visual circle radius; also used for physics body
export const PLAYER_MASS    = 5;    // heavier than ball so player dominates on collision
export const PLAYER_MAX_VEL = 130;  // px/s base — scaled by speed stat at runtime
export const PLAYER_ACCEL   = 900;  // px/s² — how fast player reaches max velocity
export const PLAYER_DRAG    = 600;  // px/s² — braking when no input

// ── Ball physics ─────────────────────────────────────────────────────────────
export const BALL_RADIUS  = 8;    // px  — match BootScene 'ball' texture radius (16x16 → r=8)
export const BALL_MASS    = 1;
export const BALL_MAX_VEL = 850;  // px/s
export const BALL_DRAG    = 80;   // px/s² — grass friction (ball rolls to a stop)
export const BALL_BOUNCE  = 0.65; // coefficient — applied against walls and goalposts

// ── Kick constants ───────────────────────────────────────────────────────────
export const KICK_RANGE    = 34;   // px center-to-center to trigger a kick
export const PASS_FORCE    = 260;  // px/s base
export const SHOT_FORCE    = 460;  // px/s base
export const KICK_COOLDOWN = 300;  // ms between kicks for human player
export const AI_KICK_FORCE = 320;  // AI uses a single mid-range force

// ── Haxball-style contact physics ────────────────────────────────────────────

/** Distance at which a player body is considered touching the ball. */
export const CONTACT_DIST = PLAYER_RADIUS + BALL_RADIUS + 2; // 22 px

/**
 * Fraction of the player's toward-ball velocity that transfers to the ball
 * on each contact frame.  0.88 feels close to Haxball — strong enough to
 * sustain a push at speed, loose enough for the ball to drift away.
 */
export const PUSH_TRANSFER = 0.88;

/**
 * Fraction of normal max-velocity while a player is in contact with the ball.
 * Simulates the weight penalty of pushing the ball.  0.82 = ~18% slower.
 */
export const CONTACT_SLOWDOWN = 0.82;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply physics properties to the ball body.
 * Called once after the ball sprite is created.
 */
export function configureBall(ball: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) {
  ball.setCircle(BALL_RADIUS, 0, 0);
  ball.setMass(BALL_MASS);
  ball.setMaxVelocity(BALL_MAX_VEL);
  ball.setDrag(BALL_DRAG);
  ball.setBounce(BALL_BOUNCE);
  ball.setCollideWorldBounds(false); // walls handled by static bodies
}

/**
 * Apply physics properties to a player body (human or AI).
 * Called once per player after the sprite is created.
 *
 * @param maxVelOverride  Optional speed cap override (e.g. scaled by speed stat).
 */
export function configurePlayer(
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  maxVelOverride?: number
) {
  player.setCircle(PLAYER_RADIUS, 0, 0);
  player.setMass(PLAYER_MASS);
  player.setMaxVelocity(maxVelOverride ?? PLAYER_MAX_VEL);
  player.setDrag(PLAYER_DRAG);
  // Very small player bounce — Haxball-style push is handled by applyHaxballCollision()
  player.setBounce(0.02);
  player.setCollideWorldBounds(false); // walls handled by static bodies

  // Kick state
  player.setData('facingAngle',       0);
  player.setData('kickCooldownUntil', 0);
}

/**
 * Haxball-style contact push — called inside the player↔ball collider callback.
 *
 * After Phaser's Arcade resolver has separated the bodies, this function
 * REPLACES the ball's normal-direction velocity with a value proportional to
 * how fast (and how directly) the player was moving into the ball.
 *
 * Rules:
 *  - Only fires when the player is chasing the ball (pDotN > bDotN).
 *  - The ball's tangential (sideways) velocity is preserved — spin is maintained.
 *  - The transferred speed is capped by BALL_MAX_VEL automatically via Arcade.
 */
export function applyHaxballCollision(
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  ball:   Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
): void {
  // Unit normal from player centre to ball centre
  const dx = ball.x - player.x;
  const dy = ball.y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  // Velocity components along the normal (positive = moving away from player)
  const pDotN = player.body.velocity.x * nx + player.body.velocity.y * ny;
  const bDotN = ball.body.velocity.x   * nx + ball.body.velocity.y   * ny;

  // Only push if player is driving into the ball faster than the ball is leaving
  if (pDotN <= bDotN) return;

  const pushSpeed = pDotN * PUSH_TRANSFER;

  // Decompose ball velocity: normal part (we replace) + perpendicular (we keep)
  const bVxPerp = ball.body.velocity.x - bDotN * nx;
  const bVyPerp = ball.body.velocity.y - bDotN * ny;

  ball.body.velocity.x = bVxPerp + nx * pushSpeed;
  ball.body.velocity.y = bVyPerp + ny * pushSpeed;
}

/**
 * Attempt to kick the ball from a player.
 *
 * @param player     The kicking player sprite.
 * @param ball       The ball sprite.
 * @param force      Base kick force (PASS_FORCE or SHOT_FORCE).
 * @param statMult   Stat multiplier (0.75–1.25) from player.stats.
 * @param nowMs      Current scene time in ms (scene.time.now).
 * @returns          true if the kick connected, false if out of range or on cooldown.
 */
export function kickBall(
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  ball:   Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  force:  number,
  statMult: number,
  nowMs:  number
): boolean {
  if (nowMs < (player.getData('kickCooldownUntil') as number ?? 0)) return false;

  const dist = Phaser.Math.Distance.Between(player.x, player.y, ball.x, ball.y);
  if (dist > KICK_RANGE) return false;

  const angle      = (player.getData('facingAngle') as number) ?? 0;
  const finalForce = force * Math.max(0.75, Math.min(1.25, statMult));

  ball.body.setVelocity(
    Math.cos(angle) * finalForce,
    Math.sin(angle) * finalForce
  );

  player.setData('kickCooldownUntil', nowMs + KICK_COOLDOWN);
  return true;
}
