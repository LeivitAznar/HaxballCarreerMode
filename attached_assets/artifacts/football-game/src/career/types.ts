export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface PlayerStats {
  speed: number;
  shooting: number;
  passing: number;
  defending: number;
  stamina: number;
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  stats: PlayerStats;
  shirtNumber: number;
  isUser?: boolean;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  primaryColor: number;
  secondaryColor: number;
  overallRating: number;
  division: 1 | 2;
  formation: string;
  roster: Player[];
}

export interface MatchEvent {
  minute: number;
  type: 'goal' | 'yellow' | 'red';
  player: string;
  teamId: string;
}

export interface MatchResult {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  played: boolean;
  userStats?: {
    goals: number;
    assists: number;
    rating: number;
  };
}

export interface Fixture {
  matchday: number;
  homeTeamId: string;
  awayTeamId: string;
  result?: MatchResult;
}

export interface TeamStanding {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export interface SeasonSeasonHistory {
  seasonNumber: number;
  teamId: string;
  division: 1 | 2;
  position: number;
  goals: number;
  assists: number;
  matches: number;
}

export interface CareerState {
  player: Player | null;
  playerTeamId: string | null;
  history: SeasonSeasonHistory[];
  seasonNumber: number;
  currentMatchday: number;
  fixtures: Fixture[];
  teams: Team[];
  standings: Record<number, TeamStanding[]>;
}
