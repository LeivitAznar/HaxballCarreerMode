import Phaser from 'phaser';

export function applyBallPhysics(ball: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) {
  ball.setCircle(6); // Collision radius
  ball.setBounce(0.6);
  ball.setDrag(0.97); // Frictive deceleration
  ball.setMass(1);
  ball.setMaxVelocity(800);
}

export function bumpBall(player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody, ball: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody, force = 250) {
  const angle = Phaser.Math.Angle.Between(player.x, player.y, ball.x, ball.y);
  
  // Add velocity rather than setting it, allows for accumulated speed
  const vx = Math.cos(angle) * force;
  const vy = Math.sin(angle) * force;
  
  ball.setVelocity(ball.body.velocity.x + vx, ball.body.velocity.y + vy);
}

export function shootBall(player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody, ball: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody, targetX?: number, targetY?: number, force = 550) {
  let angle;
  
  if (targetX !== undefined && targetY !== undefined) {
    angle = Phaser.Math.Angle.Between(player.x, player.y, targetX, targetY);
  } else {
    // Use player's current velocity direction or face direction
    if (player.body.velocity.lengthSq() > 10) {
      angle = Math.atan2(player.body.velocity.y, player.body.velocity.x);
    } else {
      angle = player.data.get('facingAngle') || 0;
    }
  }

  ball.setVelocity(Math.cos(angle) * force, Math.sin(angle) * force);
}
