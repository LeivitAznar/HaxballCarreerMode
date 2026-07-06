import { useState, useCallback, useMemo } from 'react';
import PhaserGame from '../game/PhaserGame';
import { Fixture, Team, MatchResult } from '../career/types';

interface Props {
  fixture: Fixture;
  teams: Team[];
  userTeamId: string;
  onMatchComplete: (result: MatchResult) => void;
}

export function MatchScreen({ fixture, teams, userTeamId, onMatchComplete }: Props) {
  const homeTeam = teams.find(t => t.id === fixture.homeTeamId)!;
  const awayTeam = teams.find(t => t.id === fixture.awayTeamId)!;

  const [score, setScore] = useState({ home: 0, away: 0 });
  const [time, setTime] = useState(0);
  const [eventMsg, setEventMsg] = useState<{msg: string, color: string} | null>(null);

  // Memoize matchData so the Phaser game is never destroyed/recreated on score/clock state updates
  const matchData = useMemo(() => ({
    homeTeam,
    awayTeam,
    userTeamId
  }), [homeTeam.id, awayTeam.id, userTeamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMatchEvent = useCallback((e: any) => {
    if (e.type === 'tick') {
      setTime(e.time);
    } else if (e.type === 'goal') {
      setScore(e.score);
      setEventMsg({ msg: `GOAL! ${e.scoringTeam}`, color: 'text-primary' });
      setTimeout(() => setEventMsg(null), 3000);
    } else if (e.type === 'match_end') {
      const result: MatchResult = {
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScore: e.score.home,
        awayScore: e.score.away,
        events: [],
        played: true,
        userStats: {
          goals: e.stats.goals || 0,
          assists: e.stats.assists || 0,
          rating: 7.0 + (e.stats.goals * 1.5) // Simple rating calc
        }
      };
      onMatchComplete(result);
    }
  }, [homeTeam, awayTeam, onMatchComplete]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    // Map our 4 minute total match to 90 minutes
    const mappedMinute = Math.floor((seconds / 240) * 90);
    return `${mappedMinute.toString().padStart(2, '0')}'`;
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center relative">
      
      {/* HUD */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex gap-4 bg-card/90 backdrop-blur border border-border p-2 rounded-lg shadow-2xl items-center">
        <div className="flex items-center gap-2 px-4">
          <span className="font-bold uppercase text-lg">{homeTeam.shortName}</span>
          <span className="text-2xl font-black text-primary">{score.home}</span>
        </div>
        <div className="w-px h-8 bg-border"></div>
        <div className="flex items-center gap-2 px-4">
          <span className="text-2xl font-black text-primary">{score.away}</span>
          <span className="font-bold uppercase text-lg">{awayTeam.shortName}</span>
        </div>
        <div className="bg-muted px-3 py-1 rounded text-muted-foreground font-mono font-bold">
          {formatTime(time)}
        </div>
      </div>

      {eventMsg && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 animate-in fade-in zoom-in duration-300">
          <h2 className={`text-4xl font-black uppercase ${eventMsg.color} drop-shadow-lg`}>
            {eventMsg.msg}
          </h2>
        </div>
      )}

      {/* Phaser Canvas Container */}
      <div className="relative z-0 ring-4 ring-border rounded-lg overflow-hidden shadow-2xl">
        <PhaserGame onMatchEvent={handleMatchEvent} matchData={matchData} />
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-muted-foreground text-sm flex gap-6">
        <span><kbd className="bg-muted px-1 rounded border border-border">WASD</kbd> Move</span>
        <span><kbd className="bg-muted px-1 rounded border border-border">SPACE</kbd> Shoot/Pass</span>
      </div>
    </div>
  );
}
