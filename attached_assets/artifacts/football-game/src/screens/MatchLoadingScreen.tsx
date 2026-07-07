import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Fixture, Team } from '../career/types';

export function MatchLoadingScreen({ fixture, teams, onLoaded }: { fixture: Fixture, teams: Team[], onLoaded: () => void }) {
  const [progress, setProgress] = useState(0);
  
  const home = teams.find(t => t.id === fixture.homeTeamId)!;
  const away = teams.find(t => t.id === fixture.awayTeamId)!;

  useEffect(() => {
    const i = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(i);
          setTimeout(onLoaded, 500);
          return 100;
        }
        return p + 5;
      });
    }, 50);
    return () => clearInterval(i);
  }, [onLoaded]);

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center"
    >
      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-12">Matchday {fixture.matchday}</p>
      
      <div className="flex items-center gap-12 mb-16">
        <div className="text-center">
          <div className="w-24 h-24 rounded-2xl mb-4 mx-auto rotate-12" style={{ backgroundColor: `#${home.primaryColor.toString(16).padStart(6, '0')}` }} />
          <h2 className="text-2xl font-black">{home.name}</h2>
        </div>
        
        <div className="text-4xl font-black text-muted-foreground italic">VS</div>
        
        <div className="text-center">
          <div className="w-24 h-24 rounded-2xl mb-4 mx-auto -rotate-12" style={{ backgroundColor: `#${away.primaryColor.toString(16).padStart(6, '0')}` }} />
          <h2 className="text-2xl font-black">{away.name}</h2>
        </div>
      </div>

      <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all duration-75" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-4 text-xs text-muted-foreground uppercase">Preparing Pitch...</p>
    </motion.div>
  );
}
