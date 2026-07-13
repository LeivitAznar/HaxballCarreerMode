/**
 * ai.ts — AI decision-making for CPU-controlled players.
 *
 * v3 changes:
 *  - Fixed isNearest logic (was broken — all players thought they were nearest)
 *  - NaN guards on every angle/distance calculation
 *  - AI speed raised to match new faster player physics
 *  - GK behaviour improved: rushes ball when it enters the box
 *  - Off-ball positioning more dynamic (wider spread, less clustering)
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
  if (frame % 4 !== 0) return; // throttle to every 4 frames (was 6 — more reactive)

  if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y)) return;

  const ballX = ball.x;
  const ballY = ball.y;

  // Pre-compute nearest player per team correctly (FIXED)
  const nearestPerTeam = new Map<boolean, { ai: AIPlayer; dist: number }>();
  aiPlayers.forEach(ai => {
    if (!ai.sprite.active || !ai.sprite.body) return;
    if (!Number.isFinite(ai.sprite.x) || !Number.isFinite(ai.sprite.y)) return;
    const d = Phaser.Math.Distance.Between(ai.sprite.x, ai.sprite.y, ballX, ballY);
    const cur = nearestPerTeam.get(ai.isHome);
    if (!cur || d < cur.dist) nearestPerTeam.set(ai.isHome, { ai, dist: d });
  });

  aiPlayers.forEach(ai => {
    if (!ai.sprite.active || !ai.sprite.body) return;
    if (!Number.isFinite(ai.sprite.x) || !Number.isFinite(ai.sprite.y)) return;

    const jitter   = Math.sin(nowMs / 350 + ai.basePos.x * 0.07) * 10;
    const ownGoalX = ai.isHome ? 0      : pitchW;
    const goalX    = ai.isHome ? pitchW : 0;
    const distToBall = Phaser.Math.Distance.Between(ai.sprite.x, ai.sprite.y, ballX, ballY);
    const isNearest  = nearestPerTeam.get(ai.isHome)?.ai === ai;

    let targetX = ai.basePos.x;
    let targetY = ai.basePos.y;
    let speed   = 140; // raised from 110/130

    if (ai.role === 'GK') {
      targetX = ownGoalX + (ai.isHome ? 50 : -50);

      // GK rushes ball if it's close to goal — more aggressive
      const ballThreatening = Math.abs(ballX - ownGoalX) < 200;
      if (ballThreatening) {
        targetX = ownGoalX + (ai.isHome ? 35 : -35);
        targetY = Phaser.Math.Clamp(ballY, pitchH / 2 - 55, pitchH / 2 + 55);
        speed   = 160;
      } else {
        targetY = pitchH / 2;
        speed   = 110;
      }

      if (distToBall < KICK_RANGE) {
        const clearAngle = Phaser.Math.Angle.Between(ai.sprite.x, ai.sprite.y, pitchW / 2, pitchH / 2);
        if (Number.isFinite(clearAngle)) ai.sprite.setData('facingAngle', clearAngle);
        kickBall(ai.sprite, ball, AI_KICK_FORCE * 1.3, 1.0, nowMs);
      }

    } else if (isNearest) {
      // Chase ball
      targetX = ballX + jitter * 0.4;
      targetY = ballY + jitter * 0.4;
      speed   = 155;

      if (distToBall < KICK_RANGE) {
        // Shoot toward goal with slight randomization (not perfectly centered every time)
        const goalY = pitchH / 2 + (Math.random() - 0.5) * 80;
        const shootAngle = Phaser.Math.Angle.Between(ai.sprite.x, ai.sprite.y, goalX, goalY);
        if (Number.isFinite(shootAngle)) ai.sprite.setData('facingAngle', shootAngle);
        kickBall(ai.sprite, ball, AI_KICK_FORCE, 1.0, nowMs);
      } else if (distToBall < 100) {
        const aimAngle = Phaser.Math.Angle.Between(ai.sprite.x, ai.sprite.y, goalX, pitchH / 2);
        if (Number.isFinite(aimAngle)) ai.sprite.setData('facingAngle', aimAngle);
      }

    } else {
      // Off-ball: dynamic positioning based on role
      const ballInfluence = 0.22;
      targetX = ai.basePos.x + (ballX - pitchW / 2) * ballInfluence;
      targetY = ai.basePos.y + (ballY - pitchH / 2) * ballInfluence + jitter;

      if (ai.role === 'DEF') {
        // DEF: stay back, track ball laterally
        targetX = targetX * 0.45 + ownGoalX * 0.55;
      } else if (ai.role === 'MID') {
        // MID: cover the width, support attack and defense
        targetX = Phaser.Math.Clamp(targetX, pitchW * 0.2, pitchW * 0.8);
        targetY = Phaser.Math.Clamp(targetY + jitter * 0.5, pitchH * 0.15, pitchH * 0.85);
      } else if (ai.role === 'FWD') {
        // FWD: push high when team has ball
        targetX = targetX * 0.5 + goalX * 0.5;
        targetY = Phaser.Math.Clamp(targetY, pitchH * 0.2, pitchH * 0.8);
      }
      speed = 125;
    }

    targetX = Phaser.Math.Clamp(targetX, 30, pitchW - 30);
    targetY = Phaser.Math.Clamp(targetY, 20, pitchH - 20);

    const distToTgt = Phaser.Math.Distance.Between(ai.sprite.x, ai.sprite.y, targetX, targetY);

    if (distToTgt > 10) {
      const angle = Phaser.Math.Angle.Between(ai.sprite.x, ai.sprite.y, targetX, targetY);
      if (Number.isFinite(angle)) {
        ai.sprite.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        if (ai.role !== 'GK') ai.sprite.setData('facingAngle', angle);
      }
    } else {
      ai.sprite.setVelocity(0, 0);
    }
  });
}
