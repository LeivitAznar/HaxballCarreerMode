import { Team, Player, Position } from './types';

const DIV1_TEAMS = [
  { name: "Atlético Norte", shortName: "ATN", p: 0xd32f2f, s: 0xffffff, r: 85 },
  { name: "Boca Central", shortName: "BOC", p: 0x1976d2, s: 0xfbc02d, r: 84 },
  { name: "Club Rojo", shortName: "CRO", p: 0xc62828, s: 0x000000, r: 80 },
  { name: "Real Plata", shortName: "RPL", p: 0xffffff, s: 0x1565c0, r: 82 },
  { name: "Deportivo Sur", shortName: "DSU", p: 0x388e3c, s: 0xffffff, r: 78 },
  { name: "FC Dorado", shortName: "FCD", p: 0xfbc02d, s: 0x000000, r: 76 },
  { name: "Unión Capital", shortName: "UNC", p: 0x4527a0, s: 0xffffff, r: 74 },
  { name: "Racing Azul", shortName: "RAZ", p: 0x0288d1, s: 0xffffff, r: 72 },
];

const DIV2_TEAMS = [
  { name: "Estudiantes del Puerto", shortName: "EST", p: 0xd32f2f, s: 0xffffff, r: 65 },
  { name: "Club Verona", shortName: "VER", p: 0x1565c0, s: 0xffffff, r: 63 },
  { name: "Ferro Oeste", shortName: "FER", p: 0x2e7d32, s: 0xffffff, r: 60 },
  { name: "Tigres del Valle", shortName: "TIG", p: 0xf57f17, s: 0x000000, r: 58 },
  { name: "Atlético Moderno", shortName: "AMO", p: 0x000000, s: 0xffffff, r: 55 },
  { name: "San Martín FC", shortName: "SMF", p: 0x0277bd, s: 0xffffff, r: 52 },
  { name: "Deportivo Litoral", shortName: "DLI", p: 0x00695c, s: 0xffffff, r: 48 },
  { name: "Club Estrella", shortName: "CEL", p: 0xc2185b, s: 0xffffff, r: 45 },
];

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function generateRoster(rating: number): Player[] {
  const positions: Position[] = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD'];
  const players: Player[] = [];
  
  for (let i = 0; i < 10; i++) { // We only need 6 on pitch but let's make 10
    const pos = positions[i];
    const baseStat = rating - 10 + Math.random() * 20;
    
    players.push({
      id: generateId(),
      name: `${pos} ${i+1}`,
      position: pos,
      shirtNumber: i + 1,
      stats: {
        speed: Math.max(10, Math.min(99, Math.round(baseStat + (pos === 'FWD' ? 10 : 0) - (pos === 'GK' ? 20 : 0)))),
        shooting: Math.max(10, Math.min(99, Math.round(baseStat + (pos === 'FWD' ? 15 : 0) - (pos === 'DEF' ? 15 : 0)))),
        passing: Math.max(10, Math.min(99, Math.round(baseStat + (pos === 'MID' ? 10 : 0)))),
        defending: Math.max(10, Math.min(99, Math.round(baseStat + (pos === 'DEF' ? 15 : 0) - (pos === 'FWD' ? 20 : 0)))),
        stamina: Math.max(10, Math.min(99, Math.round(baseStat))),
      }
    });
  }
  return players;
}

export function generateTeams(): Team[] {
  const teams: Team[] = [];
  
  DIV1_TEAMS.forEach(t => {
    teams.push({
      id: generateId(),
      name: t.name,
      shortName: t.shortName,
      primaryColor: t.p,
      secondaryColor: t.s,
      overallRating: t.r,
      division: 1,
      formation: '4-4-2',
      roster: generateRoster(t.r)
    });
  });

  DIV2_TEAMS.forEach(t => {
    teams.push({
      id: generateId(),
      name: t.name,
      shortName: t.shortName,
      primaryColor: t.p,
      secondaryColor: t.s,
      overallRating: t.r,
      division: 2,
      formation: '4-4-2',
      roster: generateRoster(t.r)
    });
  });

  return teams;
}
