import { PlayerStats } from '../career/types';

interface Props {
  stats: PlayerStats;
}

export function PlayerStatCard({ stats }: Props) {
  const statList = [
    { label: 'Speed', value: stats.speed, color: 'bg-blue-500' },
    { label: 'Shooting', value: stats.shooting, color: 'bg-red-500' },
    { label: 'Passing', value: stats.passing, color: 'bg-yellow-500' },
    { label: 'Defending', value: stats.defending, color: 'bg-green-500' },
    { label: 'Stamina', value: stats.stamina, color: 'bg-purple-500' },
  ];

  return (
    <div className="bg-card border border-border p-4 rounded-lg">
      <h3 className="text-lg font-bold mb-4">Player Attributes</h3>
      <div className="space-y-4">
        {statList.map((stat) => (
          <div key={stat.label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">{stat.label}</span>
              <span className="font-bold">{Math.floor(stat.value)}</span>
            </div>
            <div className="w-full bg-background rounded-full h-2">
              <div
                className={`${stat.color} h-2 rounded-full transition-all`}
                style={{ width: `${stat.value}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
