/**
 * physics.ts — Ball and player physics constants + unified kick system.
 *
 * Design rules:
 *  - All movement uses velocity/acceleration from Arcade Physics (no manual x/y assignment).
 *  - Ball bumping when a player runs into it is handled by Arcade collider (mass ratio).
 *  - kickBall() is the ONLY place that sets ball velocity intentionally (pass / shoot).
 */
import Phaser from 'phaser';

// ── Player physics ───────────────────────────────────────────────────────────
export const PLAYER_RADIUS  = 12;   // px  — match BootScene 'player_base' texture radius
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

/**
 * Apply physics properties to the ball body.
 * Called once after the ball sprite is created.
 */
export function configureBall(ball: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) {
  // Circular body centered on sprite (sprite is 16×16, origin 0.5)
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
  // Circular body: sprite is 24×24, origin 0.5 → circle fits exactly
  player.setCircle(PLAYER_RADIUS, 0, 0);
  player.setMass(PLAYER_MASS);
  player.setMaxVelocity(maxVelOverride ?? PLAYER_MAX_VEL);
  player.setDrag(PLAYER_DRAG);
  player.setBounce(0.05); // small bounce so players don't ricochet off each other
  player.setCollideWorldBounds(false); // walls handled by static bodies

  // Initialise kick state
  player.setData('facingAngle', 0);       // radians — last non-zero movement direction
  player.setData('canKick', true);        // whether kick cooldown has expired
  player.setData('kickCooldownUntil', 0); // scene time (ms) when kick is available again
}

/**
 * Attempt to kick the ball from a player.
 *
 * @param player     The kicking player sprite.
 * @param ball       The ball sprite.
 * @param force      Base kick force (PASS_FORCE or SHOT_FORCE).
 * @param statMult   Stat multiplier (0.75–1.25) from player.stats.shooting/passing.
 * @param nowMs      Current scene time in ms (scene.time.now).
 * @returns          true if the kick connected, false if out of range or on cooldown.
 */
export function kickBall(
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  ball: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  force: number,
  statMult: number,
  nowMs: number
): boolean {
  // Cooldown check
  if (nowMs < (player.getData('kickCooldownUntil') as number ?? 0)) return false;

  // Range check — only kick if ball center is within KICK_RANGE of player center
  const dist = Phaser.Math.Distance.Between(player.x, player.y, ball.x, ball.y);
  if (dist > KICK_RANGE) return false;

  // Direction from player's last known facing angle
  const angle = (player.getData('facingAngle') as number) ?? 0;
  const finalForce = force * Math.max(0.75, Math.min(1.25, statMult));

  const vx = Math.cos(angle) * finalForce;
  const vy = Math.sin(angle) * finalForce;

  // Replace ball velocity entirely (no accumulation)
  ball.body.setVelocity(vx, vy);

  // Apply cooldown
  player.setData('kickCooldownUntil', nowMs + KICK_COOLDOWN);

  return true;
}
