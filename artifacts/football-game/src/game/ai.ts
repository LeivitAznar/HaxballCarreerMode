import Phaser from 'phaser';

interface AIPlayer {
  sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  isHome: boolean;
  basePos: { x: number, y: number };
  role: 'GK' | 'DEF' | 'MID' | 'FWD';
}

export function updateAI(
  aiPlayers: AIPlayer[], 
  ball: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  pitchWidth: number,
  pitchHeight: number,
  time: number
) {
  // AI Updates every 6 frames to save perf and feel slightly human
  
  const ballX = ball.x;
  const ballY = ball.y;

  aiPlayers.forEach(ai => {
    // Skip dead or disabled players
    if (!ai.sprite.active) return;
    
    // Random jitter so they don't move too perfectly
    const jitter = Math.sin(time / 200 + ai.sprite.x) * 10;
    
    const goalX = ai.isHome ? pitchWidth : 0; // Where they want to score
    const ownGoalX = ai.isHome ? 0 : pitchWidth; // Where they defend
    
    const distToBall = Phaser.Math.Distance.Between(ai.sprite.x, ai.sprite.y, ballX, ballY);
    
    // Find nearest teammate to ball
    let nearestTeammateToBallDist = 9999;
    aiPlayers.filter(p => p.isHome === ai.isHome).forEach(p => {
      const d = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, ballX, ballY);
      if (d < nearestTeammateToBallDist) nearestTeammateToBallDist = d;
    });

    const isNearest = distToBall <= nearestTeammateToBallDist + 10;

    let targetX = ai.basePos.x;
    let targetY = ai.basePos.y;
    let speed = 120; // Default run speed

    if (ai.role === 'GK') {
      // GK tracks ball vertically, stays near goal line
      targetX = ownGoalX + (ai.isHome ? 40 : -40);
      
      if (Math.abs(ballX - targetX) < 300) {
        targetY = Math.max(pitchHeight / 2 - 40, Math.min(pitchHeight / 2 + 40, ballY));
      } else {
        targetY = pitchHeight / 2;
      }
      speed = 100;
    } else if (isNearest) {
      // Nearest player chases ball
      targetX = ballX + jitter;
      targetY = ballY + jitter;
      speed = 150;
      
      // If we have the ball
      if (distToBall < 30) {
        targetX = goalX;
        targetY = pitchHeight / 2;
        // Occasional pass/shoot logic could go here
      }
    } else {
      // Move to base position relative to ball
      const ballWeight = 0.3; // How much ball pulls them from formation
      targetX = ai.basePos.x + (ballX - pitchWidth/2) * ballWeight;
      targetY = ai.basePos.y + (ballY - pitchHeight/2) * ballWeight;
      
      // DEFs stay back more
      if (ai.role === 'DEF') {
         targetX = (targetX + ownGoalX) / 2;
      }
    }

    // Apply movement
    const angle = Phaser.Math.Angle.Between(ai.sprite.x, ai.sprite.y, targetX, targetY);
    const distToTarget = Phaser.Math.Distance.Between(ai.sprite.x, ai.sprite.y, targetX, targetY);

    if (distToTarget > 10) {
      ai.sprite.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      ai.sprite.setData('facingAngle', angle);
    } else {
      ai.sprite.setVelocity(0, 0);
    }
  });
}
