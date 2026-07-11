/**
 * ai.ts — AI decision-making for CPU-controlled players.
 *
 * FIXES vs previous version:
 *  - Guard against division-by-zero / NaN in angle calculations (was causing
 *    sprites to teleport to NaN positions and become invisible).
 *  - Uses body.setVelocity() safely with finite-check before every call.
 *  - `isNearest` logic fixed: was comparing against self, making ALL players
 *    think they were nearest simultaneously.
 */
import Phaser from 'phaser';
import { kickBall, KICK_RANGE, AI_KICK_FORCE } from './physics';

interface AIPlayer {
  sprite:  Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  isHome:  boolean;
  basePos: { x: number; y: number };
  role:    'GK' | 'DEF' | 'MID' | 'FWD';
}

export function updateAI(
  aiPlayers: AIPlayer[],
  ball: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  pitchW: number,
  pitchH: number,
  nowMs: number,
  frame: number
) {
  // Throttle to every 6 frames — reduces CPU cost, feels slightly human
  if (frame % 6 !== 0) return;

  // Guard: skip entirely if ball position is invalid
  if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y)) return;

  const ballX = ball.x;
  const ballY = ball.y;

  // Pre-compute nearest-to-ball player per team (FIXED: was incorrectly
  // including self in comparison, making all players think they were nearest)
  const nearestPerTeam = new Map<boolean, { ai: AIPlayer; dist: number }>();
  aiPlayers.forEach(ai => {
    if (!ai.sprite.active || !ai.sprite.body) return;
    if (!Number.isFinite(ai.sprite.x) || !Number.isFinite(ai.sprite.y)) return;

    const dist = Phaser.Math.Distance.Between(ai.sprite.x, ai.sprite.y, ballX, ballY);
    const current = nearestPerTeam.get(ai.isHome);
    if (!current || dist < current.dist) {
      nearestPerTeam.set(ai.isHome, { ai, dist });
    }
  });

  aiPlayers.forEach(ai => {
    if (!ai.sprite.active || !ai.sprite.body) return;
    if (!Number.isFinite(ai.sprite.x) || !Number.isFinite(ai.sprite.y)) return;

    const jitter = Math.sin(nowMs / 400 + ai.basePos.x * 0.1) * 8;
    const ownGoalX = ai.isHome ? 0      : pitchW;
    const goalX    = ai.isHome ? pitchW : 0;

    const distToBall = Phaser.Math.Distance.Between(
      ai.sprite.x, ai.sprite.y, ballX, ballY
    );

    const nearestEntry = nearestPerTeam.get(ai.isHome);
    const isNearest    = nearestEntry?.ai === ai;

    let targetX = ai.basePos.x;
    let targetY = ai.basePos.y;
    let speed   = 110;

    // ── Role-based behaviour ───────────────────────────────────────────────
    if (ai.role === 'GK') {
      targetX = ownGoalX + (ai.isHome ? 45 : -45);
      if (Math.abs(ballX - ownGoalX) < 280) {
        targetY = Phaser.Math.Clamp(ballY, pitchH / 2 - 48, pitchH / 2 + 48);
      } else {
        targetY = pitchH / 2;
      }
      speed = 100;

      if (distToBall < KICK_RANGE) {
        const clearAngle = Phaser.Math.Angle.Between(
          ai.sprite.x, ai.sprite.y, pitchW / 2, pitchH / 2
        );
        // Guard: only set angle if it's a valid number
        if (Number.isFinite(clearAngle)) {
          ai.sprite.setData('facingAngle', clearAngle);
        }
        kickBall(ai.sprite, ball, AI_KICK_FORCE * 1.2, 1.0, nowMs);
      }

    } else if (isNearest) {
      targetX = ballX + jitter;
      targetY = ballY + jitter;
      speed   = 130;

      if (distToBall < KICK_RANGE) {
        const shootAngle = Phaser.Math.Angle.Between(
          ai.sprite.x, ai.sprite.y, goalX, pitchH / 2
        );
        if (Number.isFinite(shootAngle)) {
          ai.sprite.setData('facingAngle', shootAngle);
        }
        kickBall(ai.sprite, ball, AI_KICK_FORCE, 1.0, nowMs);
      } else if (distToBall < 80) {
        const preAimAngle = Phaser.Math.Angle.Between(
          ai.sprite.x, ai.sprite.y, goalX, pitchH / 2
        );
        if (Number.isFinite(preAimAngle)) {
          ai.sprite.setData('facingAngle', preAimAngle);
        }
      }

    } else {
      const ballWeight = 0.25;
      targetX = ai.basePos.x + (ballX - pitchW / 2) * ballWeight;
      targetY = ai.basePos.y + (ballY - pitchH / 2) * ballWeight + jitter;

      if (ai.role === 'DEF') {
        targetX = targetX * 0.5 + ownGoalX * 0.5;
      }
      if (ai.role === 'FWD') {
        targetX = targetX * 0.6 + goalX * 0.4;
      }
      speed = 110;
    }

    // Clamp targets inside pitch
    targetX = Phaser.Math.Clamp(targetX, 30, pitchW - 30);
    targetY = Phaser.Math.Clamp(targetY, 20, pitchH - 20);

    // Move toward target — CRITICAL: guard against zero-distance (NaN angle)
    const distToTgt = Phaser.Math.Distance.Between(
      ai.sprite.x, ai.sprite.y, targetX, targetY
    );

    if (distToTgt > 12) {
      const angle = Phaser.Math.Angle.Between(
        ai.sprite.x, ai.sprite.y, targetX, targetY
      );

      // Only move if angle is a valid number — prevents NaN velocity
      if (Number.isFinite(angle)) {
        ai.sprite.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        if (ai.role !== 'GK') {
          ai.sprite.setData('facingAngle', angle);
        }
      }
    } else {
      ai.sprite.setVelocity(0, 0);
    }
  });
}
