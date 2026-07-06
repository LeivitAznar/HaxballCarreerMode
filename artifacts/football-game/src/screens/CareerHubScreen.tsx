import { CareerState } from '../career/types';
import { StandingsTable } from '../components/StandingsTable';
import { FixtureCard } from '../components/FixtureCard';
import { PlayerStatCard } from '../components/PlayerStatCard';

interface Props {
  state: CareerState;
  onPlayMatch: () => void;
  onSimulateRemaining: () => void;
}

export function CareerHubScreen({ state, onPlayMatch, onSimulateRemaining }: Props) {
  const playerTeam = state.teams.find(t => t.id === state.playerTeamId)!;
  const currentFixtures = state.fixtures.filter(f => f.matchday === state.currentMatchday);
  const playerFixture = currentFixtures.find(f => f.homeTeamId === state.playerTeamId || f.awayTeamId === state.playerTeamId);
  const division = playerTeam.division;
  
  // Is the season over?
  const isSeasonEnd = state.currentMatchday > (state.teams.filter(t=>t.division===division).length - 1) * 2;

  return (
    <div className="min-h-screen bg-background p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter">Season {state.seasonNumber}</h1>
          <p className="text-muted-foreground flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: `#${playerTeam.primaryColor.toString(16).padStart(6, '0')}` }} />
            {playerTeam.name} — Division {division}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-muted-foreground uppercase mb-1">Player</p>
          <p className="text-xl font-bold text-primary">{state.player?.name} <span className="text-foreground opacity-50">#{state.player?.shirtNumber}</span></p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Next Match */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border p-6 rounded-xl relative overflow-hidden">
            <h2 className="text-xl font-bold uppercase mb-4 z-10 relative">
              {isSeasonEnd ? "Season Complete" : `Matchday ${state.currentMatchday}`}
            </h2>
            
            {isSeasonEnd ? (
              <div className="text-center py-8">
                <button 
                  onClick={onSimulateRemaining}
                  className="px-8 py-4 bg-primary text-primary-foreground font-bold rounded uppercase hover:bg-primary/90"
                >
                  End Season
                </button>
              </div>
            ) : (
              <div className="space-y-6 z-10 relative">
                {playerFixture && (
                  <div className="p-4 border border-primary/30 bg-primary/5 rounded-lg">
                    <p className="text-sm font-bold text-primary uppercase mb-2">Your Match</p>
                    <FixtureCard fixture={playerFixture} teams={state.teams} userTeamId={state.playerTeamId!} />
                  </div>
                )}
                
                <button 
                  onClick={onPlayMatch}
                  className="w-full py-4 bg-primary text-primary-foreground font-bold rounded uppercase hover:bg-primary/90"
                >
                  Play Match
                </button>
              </div>
            )}
          </div>

          <div className="bg-card border border-border p-6 rounded-xl">
            <h2 className="text-sm font-bold uppercase text-muted-foreground mb-4">League Table</h2>
            <StandingsTable standings={state.standings[division]} teams={state.teams} userTeamId={state.playerTeamId!} />
          </div>
        </div>

        {/* Right Col: Stats */}
        <div className="space-y-6">
          {state.player && <PlayerStatCard stats={state.player.stats} />}
          
          <div className="bg-card border border-border p-6 rounded-xl">
            <h2 className="text-sm font-bold uppercase text-muted-foreground mb-4">Recent Form</h2>
            <div className="space-y-2">
              {state.fixtures
                .filter(f => (f.homeTeamId === state.playerTeamId || f.awayTeamId === state.playerTeamId) && f.result)
                .slice(-5)
                .reverse()
                .map(f => {
                  const isHome = f.homeTeamId === state.playerTeamId;
                  const pf = isHome ? f.result!.homeScore : f.result!.awayScore;
                  const pa = isHome ? f.result!.awayScore : f.result!.homeScore;
                  let color = 'bg-muted text-muted-foreground';
                  let char = 'D';
                  if (pf > pa) { color = 'bg-primary text-primary-foreground'; char = 'W'; }
                  if (pf < pa) { color = 'bg-destructive text-destructive-foreground'; char = 'L'; }
                  
                  return (
                    <div key={f.matchday} className="flex items-center gap-3 text-sm">
                      <div className={`w-6 h-6 rounded font-bold flex items-center justify-center text-xs ${color}`}>
                        {char}
                      </div>
                      <span className="flex-1 text-muted-foreground truncate">vs {isHome ? state.teams.find(t=>t.id===f.awayTeamId)?.name : state.teams.find(t=>t.id===f.homeTeamId)?.name}</span>
                      <span className="font-mono">{f.result!.homeScore}-{f.result!.awayScore}</span>
                    </div>
                  );
              })}
              {state.currentMatchday === 1 && <p className="text-sm text-muted-foreground text-center py-4">No matches played yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
