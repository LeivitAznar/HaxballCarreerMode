import { TeamStanding, Team } from '../career/types';

interface Props {
  standings: TeamStanding[];
  teams: Team[];
  userTeamId?: string;
}

export function StandingsTable({ standings, teams, userTeamId }: Props) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm text-left">
        <thead className="bg-muted text-muted-foreground uppercase text-xs">
          <tr>
            <th className="px-4 py-3 w-10 text-center">#</th>
            <th className="px-4 py-3">Team</th>
            <th className="px-2 py-3 text-center">P</th>
            <th className="px-2 py-3 text-center">W</th>
            <th className="px-2 py-3 text-center">D</th>
            <th className="px-2 py-3 text-center">L</th>
            <th className="px-2 py-3 text-center">GD</th>
            <th className="px-4 py-3 text-center font-bold">Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {standings.map((row, index) => {
            const team = teams.find(t => t.id === row.teamId);
            const isUser = team?.id === userTeamId;
            return (
              <tr key={row.teamId} className={`${isUser ? 'bg-primary/20' : 'hover:bg-muted/50'}`}>
                <td className="px-4 py-3 text-center font-medium text-muted-foreground">{index + 1}</td>
                <td className="px-4 py-3 font-medium flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: `#${team?.primaryColor.toString(16).padStart(6, '0')}` }} 
                  />
                  <span className={isUser ? 'text-primary font-bold' : 'text-foreground'}>
                    {team?.name}
                  </span>
                </td>
                <td className="px-2 py-3 text-center">{row.played}</td>
                <td className="px-2 py-3 text-center">{row.won}</td>
                <td className="px-2 py-3 text-center">{row.drawn}</td>
                <td className="px-2 py-3 text-center">{row.lost}</td>
                <td className="px-2 py-3 text-center">{row.gd}</td>
                <td className="px-4 py-3 text-center font-bold text-foreground">{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
