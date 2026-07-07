import { Fixture, Team } from '../career/types';

interface Props {
  fixture: Fixture;
  teams: Team[];
  userTeamId?: string;
}

export function FixtureCard({ fixture, teams, userTeamId }: Props) {
  const homeTeam = teams.find(t => t.id === fixture.homeTeamId);
  const awayTeam = teams.find(t => t.id === fixture.awayTeamId);

  const isUserMatch = homeTeam?.id === userTeamId || awayTeam?.id === userTeamId;

  return (
    <div className={`flex items-center justify-between p-3 rounded-md border ${isUserMatch ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
      <div className="flex-1 flex justify-end items-center gap-2">
        <span className={homeTeam?.id === userTeamId ? 'font-bold text-primary' : ''}>
          {homeTeam?.name}
        </span>
        <div 
          className="w-4 h-4 rounded-sm" 
          style={{ backgroundColor: `#${homeTeam?.primaryColor.toString(16).padStart(6, '0')}` }} 
        />
      </div>
      
      <div className="px-4 font-mono font-bold text-center w-24">
        {fixture.result ? (
          <span className="text-lg">{fixture.result.homeScore} - {fixture.result.awayScore}</span>
        ) : (
          <span className="text-muted-foreground text-sm">vs</span>
        )}
      </div>

      <div className="flex-1 flex justify-start items-center gap-2">
        <div 
          className="w-4 h-4 rounded-sm" 
          style={{ backgroundColor: `#${awayTeam?.primaryColor.toString(16).padStart(6, '0')}` }} 
        />
        <span className={awayTeam?.id === userTeamId ? 'font-bold text-primary' : ''}>
          {awayTeam?.name}
        </span>
      </div>
    </div>
  );
}
