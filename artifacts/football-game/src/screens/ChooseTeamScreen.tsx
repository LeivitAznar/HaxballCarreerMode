import { motion } from 'framer-motion';
import { Team } from '../career/types';

export function ChooseTeamScreen({ teams, onChoose }: { teams: Team[], onChoose: (teamId: string) => void }) {
  const div2Teams = teams.filter(t => t.division === 2);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen p-8 max-w-5xl mx-auto"
    >
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-black uppercase tracking-tight mb-2">Select Your Club</h2>
        <p className="text-muted-foreground">Division 2 clubs are willing to take a chance on an amateur.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {div2Teams.map((team) => (
          <button
            key={team.id}
            onClick={() => onChoose(team.id)}
            className="group relative overflow-hidden bg-card border border-border rounded-xl p-6 text-left hover:border-primary transition-colors duration-300"
          >
            <div 
              className="absolute top-0 right-0 w-16 h-16 opacity-20 rounded-bl-full group-hover:scale-110 transition-transform duration-500"
              style={{ backgroundColor: `#${team.primaryColor.toString(16).padStart(6, '0')}` }}
            />
            <h3 className="font-bold text-xl mb-1 group-hover:text-primary transition-colors">{team.name}</h3>
            <p className="text-sm text-muted-foreground mb-4">{team.shortName}</p>
            
            <div className="flex justify-between items-center text-xs border-t border-border/50 pt-4 mt-auto">
              <span className="text-muted-foreground uppercase">Rating</span>
              <span className="font-bold">{team.overallRating} OVR</span>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
