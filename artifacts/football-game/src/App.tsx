import { useState, useEffect } from 'react';
import { MainMenuScreen } from './screens/MainMenuScreen';
import { CreatePlayerScreen } from './screens/CreatePlayerScreen';
import { ChooseTeamScreen } from './screens/ChooseTeamScreen';
import { CareerHubScreen } from './screens/CareerHubScreen';
import { MatchLoadingScreen } from './screens/MatchLoadingScreen';
import { MatchScreen } from './screens/MatchScreen';
import { SeasonEndScreen } from './screens/SeasonEndScreen';
import { TransferScreen } from './screens/TransferScreen';

import { loadCareer, saveCareer, createNewCareer } from './career/storage';
import { simulateMatchday, progressSeasonEnd, generateNextSeason } from './career/engine';
import { CareerState, MatchResult } from './career/types';

type AppScreen = 
  | 'MAIN_MENU' 
  | 'CREATE_PLAYER' 
  | 'CHOOSE_TEAM' 
  | 'HUB' 
  | 'MATCH_LOAD' 
  | 'MATCH' 
  | 'SEASON_END' 
  | 'TRANSFER';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('MAIN_MENU');
  const [state, setState] = useState<CareerState | null>(null);

  useEffect(() => {
    const saved = loadCareer();
    if (saved) {
      setState(saved);
    }
  }, []);

  const handleNewCareer = () => {
    setState(createNewCareer());
    setScreen('CREATE_PLAYER');
  };

  const handleContinue = () => {
    setScreen('HUB');
  };

  const handlePlayerCreated = (name: string, num: number) => {
    if (!state) return;
    setState({
      ...state,
      player: {
        id: 'user_1',
        name,
        shirtNumber: num,
        position: 'FWD',
        stats: { speed: 55, shooting: 60, passing: 50, defending: 30, stamina: 60 },
        isUser: true
      }
    });
    setScreen('CHOOSE_TEAM');
  };

  const handleTeamChosen = (teamId: string) => {
    if (!state) return;
    const newState = { ...state, playerTeamId: teamId };
    setState(newState);
    saveCareer(newState);
    setScreen('HUB');
  };

  const handlePlayMatch = () => {
    setScreen('MATCH_LOAD');
  };

  const handleMatchComplete = (result: MatchResult) => {
    if (!state) return;
    
    // Apply result
    const currentFixture = state.fixtures.find(
      f => f.matchday === state.currentMatchday && 
      (f.homeTeamId === state.playerTeamId || f.awayTeamId === state.playerTeamId)
    );
    
    if (currentFixture) {
      currentFixture.result = result;
    }

    // Improve player stats slightly based on performance
    const newStats = { ...state.player!.stats };
    if (result.userStats) {
      newStats.shooting = Math.min(99, newStats.shooting + result.userStats.goals * 0.5);
      newStats.passing = Math.min(99, newStats.passing + result.userStats.assists * 0.3);
      newStats.stamina = Math.min(99, newStats.stamina + 0.1);
    }

    let newState: CareerState = {
      ...state,
      player: {
        ...state.player!,
        stats: newStats
      }
    };

    // Simulate rest of matchday
    newState = simulateMatchday(newState);
    newState.currentMatchday++;
    
    setState(newState);
    saveCareer(newState);
    setScreen('HUB');
  };

  const handleSimulateRemaining = () => {
    if (!state) return;
    setScreen('SEASON_END');
  };

  const handleSeasonEndContinue = () => {
    if (!state) return;
    const newState = progressSeasonEnd(state);
    setState(newState);
    setScreen('TRANSFER');
  };

  const handleTransferComplete = (newTeamId: string) => {
    if (!state) return;
    let newState: CareerState = { ...state, playerTeamId: newTeamId };
    newState = generateNextSeason(newState);
    setState(newState);
    saveCareer(newState);
    setScreen('HUB');
  };

  if (screen === 'MAIN_MENU') {
    return <MainMenuScreen onNewCareer={handleNewCareer} onContinue={handleContinue} hasSave={!!state?.playerTeamId} />;
  }

  if (!state) return null;

  if (screen === 'CREATE_PLAYER') return <CreatePlayerScreen onComplete={handlePlayerCreated} />;
  if (screen === 'CHOOSE_TEAM') return <ChooseTeamScreen teams={state.teams} onChoose={handleTeamChosen} />;
  
  if (screen === 'HUB') {
    return <CareerHubScreen state={state} onPlayMatch={handlePlayMatch} onSimulateRemaining={handleSimulateRemaining} />;
  }

  if (screen === 'MATCH_LOAD') {
    const fixture = state.fixtures.find(f => f.matchday === state.currentMatchday && (f.homeTeamId === state.playerTeamId || f.awayTeamId === state.playerTeamId))!;
    return <MatchLoadingScreen fixture={fixture} teams={state.teams} onLoaded={() => setScreen('MATCH')} />;
  }

  if (screen === 'MATCH') {
    const fixture = state.fixtures.find(f => f.matchday === state.currentMatchday && (f.homeTeamId === state.playerTeamId || f.awayTeamId === state.playerTeamId))!;
    return <MatchScreen fixture={fixture} teams={state.teams} userTeamId={state.playerTeamId!} onMatchComplete={handleMatchComplete} />;
  }

  if (screen === 'SEASON_END') return <SeasonEndScreen state={state} onContinue={handleSeasonEndContinue} />;
  if (screen === 'TRANSFER') return <TransferScreen state={state} onComplete={handleTransferComplete} />;

  return null;
}
