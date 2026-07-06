import { Position } from '../career/types';

// Normalized pitch coordinates for formation slots
// x: -1 to 1 (left to right from team's attacking perspective)
// y: -1 to 1 (top to bottom of pitch)
// We will flip x for the away team automatically.

export interface FormationSlot {
  pos: Position;
  x: number; // Attack direction is positive X
  y: number; // Center is 0
}

export const FORMATIONS: Record<string, FormationSlot[]> = {
  // 6 players total: GK, 2 DEF, 2 MID, 1 FWD
  '6-ASIDE': [
    { pos: 'GK', x: -0.9, y: 0 },
    { pos: 'DEF', x: -0.5, y: -0.4 },
    { pos: 'DEF', x: -0.5, y: 0.4 },
    { pos: 'MID', x: 0.1, y: -0.3 },
    { pos: 'MID', x: 0.1, y: 0.3 },
    { pos: 'FWD', x: 0.6, y: 0 },
  ]
};

export function getFormationPositions(
  formation: string, 
  isHome: boolean, 
  pitchWidth: number, 
  pitchHeight: number
): { x: number, y: number, pos: Position }[] {
  const slots = FORMATIONS['6-ASIDE']; // Hardcode to 6 aside for now
  
  const centerX = pitchWidth / 2;
  const centerY = pitchHeight / 2;

  return slots.map(slot => {
    // If away team, they defend the right and attack left.
    // So their base positions should be mirrored.
    const dir = isHome ? 1 : -1;
    
    // Convert -1..1 to actual pixel coordinates
    const x = centerX + (slot.x * (pitchWidth / 2 - 50) * dir);
    const y = centerY + (slot.y * (pitchHeight / 2 - 50));

    return { x, y, pos: slot.pos };
  });
}
