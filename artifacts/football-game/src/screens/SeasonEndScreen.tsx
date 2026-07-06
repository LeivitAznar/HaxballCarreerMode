import { motion } from 'framer-motion';
import { CareerState } from '../career/types';
import { StandingsTable } from '../components/StandingsTable';

export function SeasonEndScreen({ state, onContinue }: { state: CareerState, onContinue: () => void }) {
  const playerTeam = state.teams.find(t => t.id === state.playerTeamId)!;
  const division = playerTeam.division;
  const standings = state.standings[division];
  const pos = standings.findIndex(s => s.teamId === playerTeam.id) + 1;
  
  let resultMsg = "Mid-table finish. More work needed.";
  if (pos === 1) resultMsg = "CHAMPIONS! Promoted to Division 1.";
  if (pos === standings.length && division === 1) resultMsg = "RELEGATED to Division 2.";

  // Calculate total player goals
  let goals = 0;
  state.fixtures.forEach(f => {
    if ((f.homeTeamId === playerTeam.id || f.awayTeamId === playerTeam.id) && f.result?.userStats) {
      goals += f.result.userStats.goals;
    }
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen p-8 max-w-4xl mx-auto space-y-8">
      <div className="text-center py-12 bg-card border border-border rounded-xl">
        <h1 className="text-4xl font-black uppercase mb-2">Season {state.seasonNumber} Concluded</h1>
        <p className="text-xl text-primary font-bold">{resultMsg}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-card border border-border p-6 rounded-xl">
          <h2 className="text-lg font-bold uppercase mb-4">Player Summary</h2>
          <div className="space-y-4">
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Goals</span>
              <span className="font-bold text-xl">{goals}</span>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Average Rating</span>
              <span className="font-bold text-xl">7.4</span>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Stat Growth</span>
              <span className="font-bold text-xl text-primary">+2 OVR</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border p-6 rounded-xl">
          <h2 className="text-lg font-bold uppercase mb-4">Final Table</h2>
          <StandingsTable standings={standings} teams={state.teams} userTeamId={playerTeam.id} />
        </div>
      </div>

      <button 
        onClick={onContinue}
        className="w-full py-4 bg-primary text-primary-foreground font-bold rounded uppercase hover:bg-primary/90"
      >
        Proceed to Transfer Window
      </button>
    </motion.div>
  );
}
