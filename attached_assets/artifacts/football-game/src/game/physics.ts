/**
 * physics.ts — Ball and player physics constants + unified kick + Haxball/Mamoball push system.
 *
 * v3 changes vs v2:
 *  - PLAYER_MAX_VEL raised to 195 (snappier, more Mamoball-like pace)
 *  - BALL_DRAG lowered to 55 (ball rolls further, more realistic)
 *  - BALL_BOUNCE raised to 0.72 (livelier wall rebounds)
 *  - PUSH_TRANSFER raised to 0.92 (stronger body carry feel)
 *  - CONTACT_SLOWDOWN lowered to 0.78 (more penalty for carrying, forces passing)
 *  - KICK_COOLDOWN lowered to 200ms (more responsive)
 *  - SHOT_FORCE raised to 580, PASS_FORCE to 330
 *  - Added lunge effect on kick (player gets brief speed boost toward ball)
 *  - sanitizeBody() exported for NaN recovery
 */
import Phaser from 'phaser';

// ── Player physics ───────────────────────────────────────────────────────────
export const PLAYER_RADIUS  = 13;   // px — slightly larger for better collision feel
export const PLAYER_MASS    = 2.4;
export const PLAYER_MAX_VEL = 195;  // px/s — faster, Mamoball pace
export const PLAYER_ACCEL   = 1300; // px/s²
export const PLAYER_DRAG    = 820;  // px/s²

// ── Ball physics ─────────────────────────────────────────────────────────────
export const BALL_RADIUS  = 8;
export const BALL_MASS    = 1;
export const BALL_MAX_VEL = 920;    // px/s — faster max ball speed
export const BALL_DRAG    = 55;     // px/s² — rolls further, more realistic
export const BALL_BOUNCE  = 0.72;   // livelier rebounds off walls/posts

// ── Kick constants ───────────────────────────────────────────────────────────
export const KICK_RANGE    = 36;    // px
export const PASS_FORCE    = 330;   // px/s base
export const SHOT_FORCE    = 580;   // px/s base
export const KICK_COOLDOWN = 200;   // ms — more responsive
export const AI_KICK_FORCE = 390;

// ── Haxball/Mamoball contact physics ─────────────────────────────────────────
export const CONTACT_DIST     = PLAYER_RADIUS + BALL_RADIUS + 2; // 23px
export const PUSH_TRANSFER    = 0.92;  // stronger carry feel
export const CONTACT_SLOWDOWN = 0.78;  // more penalty when carrying ball

// ── Lunge effect on kick ─────────────────────────────────────────────────────
// When a player kicks, they get a brief velocity boost toward the ball.
// This makes kicks feel physical — the body "commits" to the strike.
export const KICK_LUNGE_SPEED = 60;  // px/s added toward ball on kick
export const KICK_LUNGE_MS    = 100; // duration of lunge boost

// ─────────────────────────────────────────────────────────────────────────────

export function configureBall(ball: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) {
  ball.setCircle(BALL_RADIUS, 0, 0);
  ball.setMass(BALL_MASS);
  ball.setMaxVelocity(BALL_MAX_VEL);
  ball.setDrag(BALL_DRAG);
  ball.setBounce(BALL_BOUNCE);
  ball.setCollideWorldBounds(false);
}

export function configurePlayer(
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  maxVelOverride?: number
) {
  player.setCircle(PLAYER_RADIUS, 0, 0);
  player.setMass(PLAYER_MASS);
  player.setMaxVelocity(maxVelOverride ?? PLAYER_MAX_VEL);
  player.setDrag(PLAYER_DRAG);
  player.setBounce(0.05); // slight bounce for body collision feel
  player.setCollideWorldBounds(false);

  player.setData('facingAngle',       0);
  player.setData('kickCooldownUntil', 0);
  player.setData('lungeUntil',        0);
}

/**
 * Haxball/Mamoball-style contact push.
 * Called inside the player↔ball collider callback every contact frame.
 */
export function applyHaxballCollision(
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  ball:   Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
): void {
  const dx = ball.x - player.x;
  const dy = ball.y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  const pDotN = player.body.velocity.x * nx + player.body.velocity.y * ny;
  const bDotN = ball.body.velocity.x   * nx + ball.body.velocity.y   * ny;

  if (pDotN <= bDotN) return;

  const pushSpeed = pDotN * PUSH_TRANSFER;
  const bVxPerp = ball.body.velocity.x - bDotN * nx;
  const bVyPerp = ball.body.velocity.y - bDotN * ny;

  ball.body.velocity.x = bVxPerp + nx * pushSpeed;
  ball.body.velocity.y = bVyPerp + ny * pushSpeed;
}

/**
 * Kick the ball with a lunge effect — the player gets a brief burst of speed
 * toward the ball at the moment of the kick, making the strike feel physical.
 */
export function kickBall(
  player:   Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  ball:     Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  force:    number,
  statMult: number,
  nowMs:    number
): boolean {
  if (nowMs < ((player.getData('kickCooldownUntil') as number) ?? 0)) return false;

  const dist = Phaser.Math.Distance.Between(player.x, player.y, ball.x, ball.y);
  if (dist > KICK_RANGE) return false;

  const angle      = (player.getData('facingAngle') as number) ?? 0;
  const finalForce = force * Math.max(0.75, Math.min(1.25, statMult));

  // Apply kick to ball
  ball.body.setVelocity(
    Math.cos(angle) * finalForce,
    Math.sin(angle) * finalForce
  );

  // Lunge: brief speed boost toward ball direction for the player
  const lx = player.body.velocity.x + Math.cos(angle) * KICK_LUNGE_SPEED;
  const ly = player.body.velocity.y + Math.sin(angle) * KICK_LUNGE_SPEED;
  player.body.setVelocity(lx, ly);
  player.setData('lungeUntil', nowMs + KICK_LUNGE_MS);

  player.setData('kickCooldownUntil', nowMs + KICK_COOLDOWN);
  return true;
}

/**
 * Safety net: recover any sprite whose position/velocity became NaN/Infinity.
 * Returns true if the sprite was corrupted and had to be reset.
 */
export function sanitizeBody(
  sprite:    Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  fallbackX: number,
  fallbackY: number,
  label      = 'sprite'
): boolean {
  if (!sprite.body) return false;
  const bad =
    !Number.isFinite(sprite.x)              || !Number.isFinite(sprite.y) ||
    !Number.isFinite(sprite.body.velocity.x) || !Number.isFinite(sprite.body.velocity.y);

  if (!bad) return false;

  console.warn(`[sanitizeBody] Recovered "${label}" from NaN position.`);
  sprite.setPosition(fallbackX, fallbackY);
  sprite.body.setVelocity(0, 0);
  sprite.body.setAcceleration(0, 0);
  return true;
}
