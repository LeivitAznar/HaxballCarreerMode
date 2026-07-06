import { CareerState } from './types';
import { generateTeams } from './teams';
import { generateFixtures, initStandings } from './engine';

const STORAGE_KEY = 'futbol_carrera_save';

export function loadCareer(): CareerState | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    return JSON.parse(data) as CareerState;
  } catch (e) {
    console.error("Failed to load career data", e);
    return null;
  }
}

export function saveCareer(state: CareerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save career data", e);
  }
}

export function clearCareer(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function createNewCareer(): CareerState {
  const teams = generateTeams();
  const fixtures = generateFixtures(teams);
  const standings = initStandings(teams);

  return {
    player: null,
    playerTeamId: null,
    history: [],
    seasonNumber: 1,
    currentMatchday: 1,
    fixtures,
    teams,
    standings,
  };
}
