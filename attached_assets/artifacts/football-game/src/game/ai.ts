/**
 * ai.ts — AI decision-making for CPU-controlled players.
 *
 * All AI players have proper Arcade Physics bodies (mass, drag, bounce) so
 * collisions with the ball and each other are physically correct.
 * AI movement uses setVelocity() for deterministic targeting; the physics
 * engine still applies mass, friction, and bounce on collisions.
 *
 * AI kicking: when an AI player has possession (within KICK_RANGE of ball),
 * it shoots toward goal using kickBall() — same cooldown system as the human.
 */
import Phaser from 'phaser';
import { kickBall, KICK_RANGE, AI_KICK_FORCE } from './physics';

interface AIPlayer {
  sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  isHome: boolean;
  basePos: { x: number; y: number };
  role: 'GK' | 'DEF' | 'MID' | 'FWD';
}

/**
 * Update all AI players for this frame.
 *
 * @param aiPlayers  Array of AI player descriptors.
 * @param ball       The ball sprite.
 * @param pitchW     Pitch width in pixels.
 * @param pitchH     Pitch height in pixels.
 * @param nowMs      Current scene time in ms (scene.time.now).
 * @param frame      Current update frame counter (for throttling).
 */
export function updateAI(
  aiPlayers: AIPlayer[],
  ball: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  pitchW: number,
  pitchH: number,
  nowMs: number,
  frame: number
) {
  // Throttle AI logic to every 6 frames — reduces CPU cost, feels slightly human
  if (frame % 6 !== 0) return;

  const ballX = ball.x;
  const ballY = ball.y;

  aiPlayers.forEach(ai => {
    if (!ai.sprite.active) return;

    // Subtle jitter so players don't all converge on identical points
    const jitter = Math.sin(nowMs / 400 + ai.basePos.x * 0.1) * 8;

    // Goal positions: attacking goal X and own goal X
    const ownGoalX  = ai.isHome ? 0        : pitchW;
    const goalX     = ai.isHome ? pitchW   : 0;

    const distToBall = Phaser.Math.Distance.Between(
      ai.sprite.x, ai.sprite.y, ballX, ballY
    );

    // Determine if this AI is the nearest teammate to the ball
    let nearestDist = Infinity;
    aiPlayers
      .filter(p => p.isHome === ai.isHome)
      .forEach(p => {
        const d = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, ballX, ballY);
        if (d < nearestDist) nearestDist = d;
      });
    const isNearest = distToBall <= nearestDist + 12;

    let targetX = ai.basePos.x;
    let targetY = ai.basePos.y;
    let speed   = 110;

    // ── Role-based behaviour ─────────────────────────────────────────────────
    if (ai.role === 'GK') {
      // Goalkeeper: track ball Y near their goal line, never stray too far
      targetX = ownGoalX + (ai.isHome ? 45 : -45);
      if (Math.abs(ballX - ownGoalX) < 280) {
        // Ball is threatening — track ball height
        targetY = Phaser.Math.Clamp(
          ballY,
          pitchH / 2 - 48,
          pitchH / 2 + 48
        );
      } else {
        targetY = pitchH / 2;
      }
      speed = 100;

      // GK clears ball if very close
      if (distToBall < KICK_RANGE) {
        // Face toward center of pitch (clearing kick)
        ai.sprite.setData('facingAngle',
          Phaser.Math.Angle.Between(ai.sprite.x, ai.sprite.y, pitchW / 2, pitchH / 2)
        );
        kickBall(ai.sprite, ball, AI_KICK_FORCE * 1.2, 1.0, nowMs);
      }

    } else if (isNearest) {
      // Nearest outfield player chases ball
      targetX = ballX + jitter;
      targetY = ballY + jitter;
      speed   = 130;

      if (distToBall < KICK_RANGE) {
        // In possession — shoot toward goal
        ai.sprite.setData('facingAngle',
          Phaser.Math.Angle.Between(ai.sprite.x, ai.sprite.y, goalX, pitchH / 2)
        );
        kickBall(ai.sprite, ball, AI_KICK_FORCE, 1.0, nowMs);
      } else if (distToBall < 80) {
        // Close to ball — point toward goal as facing angle (pre-aim)
        ai.sprite.setData('facingAngle',
          Phaser.Math.Angle.Between(ai.sprite.x, ai.sprite.y, goalX, pitchH / 2)
        );
      }

    } else {
      // Off-ball players: float between base position and ball influence
      const ballWeight = 0.25;
      targetX = ai.basePos.x + (ballX - pitchW / 2) * ballWeight;
      targetY = ai.basePos.y + (ballY - pitchH / 2) * ballWeight + jitter;

      // DEF: bias strongly toward own half
      if (ai.role === 'DEF') {
        targetX = (targetX * 0.5 + ownGoalX * 0.5);
      }
      // FWD: bias toward attacking half when team has ball
      if (ai.role === 'FWD') {
        targetX = (targetX * 0.6 + goalX * 0.4);
      }
      speed = 110;
    }

    // Clamp targets inside pitch with some margin
    targetX = Phaser.Math.Clamp(targetX, 30, pitchW - 30);
    targetY = Phaser.Math.Clamp(targetY, 20, pitchH - 20);

    // Move toward target
    // Move toward target (usando aceleración en vez de velocidad directa)
const dx = targetX - ai.sprite.x;
const dy = targetY - ai.sprite.y;
const distToTgt = Math.sqrt(dx * dx + dy * dy);

if (distToTgt > 12) {
  const nx = dx / distToTgt;
  const ny = dy / distToTgt;

  ai.sprite.body.setAcceleration(nx * 500, ny * 500);

  if (ai.role !== 'GK') {
    ai.sprite.setData('facingAngle', Math.atan2(ny, nx));
  }
} else {
  ai.sprite.body.setAcceleration(0, 0);
}
  });
}
