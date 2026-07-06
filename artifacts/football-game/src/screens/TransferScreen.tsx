import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CareerState, Team } from '../career/types';

export function TransferScreen({ state, onComplete }: { state: CareerState, onComplete: (newTeamId: string) => void }) {
  const [offers, setOffers] = useState<Team[]>([]);
  const currentTeam = state.teams.find(t => t.id === state.playerTeamId)!;

  useEffect(() => {
    // Generate 1-2 random offers from teams slightly better or similar to current team
    const possibleTeams = state.teams.filter(t => t.id !== currentTeam.id && t.overallRating >= currentTeam.overallRating - 5);
    const shuffled = possibleTeams.sort(() => 0.5 - Math.random());
    setOffers(shuffled.slice(0, Math.floor(Math.random() * 2) + 1));
  }, [state, currentTeam]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen p-8 max-w-4xl mx-auto flex flex-col justify-center">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-black uppercase tracking-tight mb-2">Transfer Window</h2>
        <p className="text-muted-foreground">Review your contract offers for the upcoming season.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {/* Current Club */}
        <div className="bg-card border-2 border-primary/50 p-6 rounded-xl text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 px-3 py-1 bg-primary text-primary-foreground text-xs font-bold uppercase rounded-bl-lg">Current Club</div>
          <div className="w-16 h-16 mx-auto rounded-full mb-4" style={{ backgroundColor: `#${currentTeam.primaryColor.toString(16).padStart(6, '0')}` }} />
          <h3 className="font-bold text-xl mb-1">{currentTeam.name}</h3>
          <p className="text-sm text-muted-foreground mb-6">Division {currentTeam.division}</p>
          <button 
            onClick={() => onComplete(currentTeam.id)}
            className="px-6 py-2 bg-muted text-foreground font-bold rounded uppercase hover:bg-muted/80"
          >
            Stay Here
          </button>
        </div>

        {/* Offers */}
        {offers.map(offer => (
          <div key={offer.id} className="bg-card border border-border hover:border-primary/50 transition-colors p-6 rounded-xl text-center">
            <div className="w-16 h-16 mx-auto rounded-full mb-4" style={{ backgroundColor: `#${offer.primaryColor.toString(16).padStart(6, '0')}` }} />
            <h3 className="font-bold text-xl mb-1">{offer.name}</h3>
            <p className="text-sm text-muted-foreground mb-6">Division {offer.division}</p>
            <button 
              onClick={() => onComplete(offer.id)}
              className="px-6 py-2 bg-primary text-primary-foreground font-bold rounded uppercase hover:bg-primary/90"
            >
              Sign Contract
            </button>
          </div>
        ))}

        {offers.length === 0 && (
          <div className="bg-card border border-dashed border-border p-6 rounded-xl text-center flex flex-col items-center justify-center">
            <p className="text-muted-foreground italic mb-2">No external offers received.</p>
            <p className="text-sm">You must stay with your current club.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
