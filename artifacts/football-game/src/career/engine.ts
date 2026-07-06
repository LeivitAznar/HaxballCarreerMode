import { Team, Fixture, MatchResult, TeamStanding, CareerState, SeasonSeasonHistory } from './types';

export function generateFixtures(teams: Team[]): Fixture[] {
  const fixtures: Fixture[] = [];
  
  [1, 2].forEach(division => {
    const divTeams = teams.filter(t => t.division === division).map(t => t.id);
    const n = divTeams.length;
    
    // Round Robin Algorithm
    for (let round = 0; round < (n - 1) * 2; round++) {
      const matchday = round + 1;
      const isReturn = round >= n - 1;
      const r = round % (n - 1);
      
      for (let i = 0; i < n / 2; i++) {
        let home = divTeams[(r + i) % (n - 1)];
        let away = divTeams[(n - 1 - i + r) % (n - 1)];
        
        if (i === 0) {
          away = divTeams[n - 1];
        }
        
        if (isReturn) {
          const temp = home;
          home = away;
          away = temp;
        }

        fixtures.push({
          matchday,
          homeTeamId: home,
          awayTeamId: away
        });
      }
    }
  });

  return fixtures.sort((a, b) => a.matchday - b.matchday);
}

export function initStandings(teams: Team[]): Record<number, TeamStanding[]> {
  const standings: Record<number, TeamStanding[]> = { 1: [], 2: [] };
  
  teams.forEach(team => {
    standings[team.division].push({
      teamId: team.id,
      played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0
    });
  });

  return standings;
}

export function updateStandings(standings: Record<number, TeamStanding[]>, fixture: Fixture, teams: Team[]) {
  if (!fixture.result) return;
  
  const homeTeam = teams.find(t => t.id === fixture.homeTeamId);
  if (!homeTeam) return;

  const divStandings = standings[homeTeam.division];
  const homeRow = divStandings.find(s => s.teamId === fixture.homeTeamId);
  const awayRow = divStandings.find(s => s.teamId === fixture.awayTeamId);

  if (homeRow && awayRow) {
    const hg = fixture.result.homeScore;
    const ag = fixture.result.awayScore;

    homeRow.played++;
    awayRow.played++;
    
    homeRow.gf += hg;
    homeRow.ga += ag;
    homeRow.gd = homeRow.gf - homeRow.ga;
    
    awayRow.gf += ag;
    awayRow.ga += hg;
    awayRow.gd = awayRow.gf - awayRow.ga;

    if (hg > ag) {
      homeRow.won++;
      homeRow.points += 3;
      awayRow.lost++;
    } else if (hg < ag) {
      awayRow.won++;
      awayRow.points += 3;
      homeRow.lost++;
    } else {
      homeRow.drawn++;
      awayRow.drawn++;
      homeRow.points += 1;
      awayRow.points += 1;
    }
  }

  // Sort
  divStandings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.gf - a.gf;
  });
}

export function simulateMatch(homeTeam: Team, awayTeam: Team): MatchResult {
  const homeAdvantage = 5;
  const ratingDiff = (homeTeam.overallRating + homeAdvantage) - awayTeam.overallRating;
  
  // Base goals around 1.5, adjusted by rating difference
  const homeExpected = Math.max(0, 1.5 + (ratingDiff / 20));
  const awayExpected = Math.max(0, 1.2 - (ratingDiff / 20));

  const poisson = (lambda: number) => {
    let l = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > l);
    return k - 1;
  };

  const homeScore = poisson(homeExpected);
  const awayScore = poisson(awayExpected);

  return {
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    homeScore,
    awayScore,
    events: [],
    played: true
  };
}

export function simulateMatchday(state: CareerState): CareerState {
  const newState = { ...state };
  const currentFixtures = newState.fixtures.filter(f => f.matchday === newState.currentMatchday);
  
  currentFixtures.forEach(fixture => {
    // Don't simulate user's match if they haven't played it
    if (fixture.homeTeamId === newState.playerTeamId || fixture.awayTeamId === newState.playerTeamId) {
      if (!fixture.result) {
        return; // Break out, waiting for user to play
      }
    } else if (!fixture.result) {
      const homeTeam = newState.teams.find(t => t.id === fixture.homeTeamId)!;
      const awayTeam = newState.teams.find(t => t.id === fixture.awayTeamId)!;
      fixture.result = simulateMatch(homeTeam, awayTeam);
    }
    
    // Update standings if just played (we can just rebuild standings up to this matchday)
  });

  // Rebuild standings completely to be safe
  newState.standings = initStandings(newState.teams);
  newState.fixtures.filter(f => f.result).forEach(f => {
    updateStandings(newState.standings, f, newState.teams);
  });

  return newState;
}

export function progressSeasonEnd(state: CareerState): CareerState {
  // Check promotions / relegations
  const div1 = state.standings[1];
  const div2 = state.standings[2];

  const relegated = div1[div1.length - 1]; // Bottom
  const promoted = div2[0]; // Top

  const newState = { ...state };
  
  const relegatedTeam = newState.teams.find(t => t.id === relegated.teamId);
  const promotedTeam = newState.teams.find(t => t.id === promoted.teamId);
  
  if (relegatedTeam) relegatedTeam.division = 2;
  if (promotedTeam) promotedTeam.division = 1;

  // Add history record for player
  if (state.player && state.playerTeamId) {
    const playerTeam = newState.teams.find(t => t.id === state.playerTeamId)!;
    const playerDiv = state.standings[playerTeam.division];
    const pos = playerDiv.findIndex(s => s.teamId === state.playerTeamId) + 1;
    
    // Calculate season stats
    let totalGoals = 0;
    let totalAssists = 0;
    let totalMatches = 0;

    state.fixtures.forEach(f => {
      if (f.homeTeamId === state.playerTeamId || f.awayTeamId === state.playerTeamId) {
        if (f.result?.userStats) {
          totalMatches++;
          totalGoals += f.result.userStats.goals;
          totalAssists += f.result.userStats.assists;
        }
      }
    });

    newState.history.push({
      seasonNumber: state.seasonNumber,
      teamId: state.playerTeamId,
      division: playerTeam.division,
      position: pos,
      goals: totalGoals,
      assists: totalAssists,
      matches: totalMatches
    });
  }

  return newState;
}

export function generateNextSeason(state: CareerState): CareerState {
  const fixtures = generateFixtures(state.teams);
  const standings = initStandings(state.teams);

  return {
    ...state,
    seasonNumber: state.seasonNumber + 1,
    currentMatchday: 1,
    fixtures,
    standings
  };
}
