import { useState, useCallback, useMemo } from 'react';
import PhaserGame from '../game/PhaserGame';
import { Fixture, Team, MatchResult, PlayerStats } from '../career/types';

interface Props {
  fixture: Fixture;
  teams: Team[];
  userTeamId: string;
  playerStats?: PlayerStats;
  onMatchComplete: (result: MatchResult) => void;
}

/** Format seconds as MM:SS */
function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/** Convert a numeric hex colour (e.g. 0x1976d2) to CSS hex string */
function hexCss(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export function MatchScreen({ fixture, teams, userTeamId, playerStats, onMatchComplete }: Props) {
  const homeTeam = teams.find(t => t.id === fixture.homeTeamId)!;
  const awayTeam = teams.find(t => t.id === fixture.awayTeamId)!;

  const [score, setScore]     = useState({ home: 0, away: 0 });
  const [time,  setTime]      = useState(0);
  const [flash, setFlash]     = useState<string | null>(null);

  // Memoize so Phaser is never destroyed/recreated on state updates
  const matchData = useMemo(() => ({
    homeTeam,
    awayTeam,
    userTeamId,
    playerStats: playerStats ?? null,
  }), [homeTeam.id, awayTeam.id, userTeamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMatchEvent = useCallback((e: any) => {
    if (e.type === 'tick') {
      setTime(e.time);
    } else if (e.type === 'goal') {
      setScore(e.score);
      setFlash(`⚽ GOL — ${e.scoringTeam}`);
      setTimeout(() => setFlash(null), 2800);
    } else if (e.type === 'match_end') {
      const result: MatchResult = {
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScore: e.score.home,
        awayScore: e.score.away,
        events: [],
        played: true,
        userStats: {
          goals:   e.stats?.goals   ?? 0,
          assists: e.stats?.assists ?? 0,
          rating:  7.0 + (e.stats?.goals ?? 0) * 1.5,
        },
      };
      onMatchComplete(result);
    }
  }, [homeTeam, awayTeam, onMatchComplete]);

  const homeColor = hexCss(homeTeam.primaryColor);
  const awayColor = hexCss(awayTeam.primaryColor);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">

      {/* ── Canvas wrapper (relative so HUD overlays align to it) ───────────── */}
      <div className="relative shadow-2xl ring-2 ring-border rounded overflow-hidden">

        {/* ── STADIUM-STYLE TOP HUD ─────────────────────────────────────────── */}
        {/* Exactly 50px tall — matches FIELD_TOP constant in MatchScene.ts      */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-stretch"
             style={{ height: 50 }}>

          {/* Left sponsor marquee */}
          <div className="flex-1 flex items-center overflow-hidden bg-gray-950 pl-3">
            <span className="text-[10px] font-bold tracking-widest uppercase whitespace-nowrap"
                  style={{ color: '#1e3a1e' }}>
              FOOTBALL CAREER ✦ FOOTBALL CAREER ✦ FOOTBALL CAREER ✦ FOOTBALL CAREER
            </span>
          </div>

          {/* Home team name plate */}
          <div className="flex items-center justify-center px-5 select-none"
               style={{ backgroundColor: homeColor, minWidth: 90 }}>
            <span className="text-white font-black text-base uppercase tracking-wide drop-shadow-md">
              {homeTeam.shortName}
            </span>
          </div>

          {/* Score + clock */}
          <div className="flex flex-col items-center justify-center px-5 bg-gray-950 select-none"
               style={{ minWidth: 110 }}>
            <span className="text-white font-black text-2xl leading-none tabular-nums">
              {score.home} <span className="text-gray-500">-</span> {score.away}
            </span>
            <span className="text-gray-400 font-mono text-xs mt-0.5 tabular-nums">
              {formatTime(time)}
            </span>
          </div>

          {/* Away team name plate */}
          <div className="flex items-center justify-center px-5 select-none"
               style={{ backgroundColor: awayColor, minWidth: 90 }}>
            <span className="text-white font-black text-base uppercase tracking-wide drop-shadow-md">
              {awayTeam.shortName}
            </span>
          </div>

          {/* Right sponsor marquee */}
          <div className="flex-1 flex items-center justify-end overflow-hidden bg-gray-950 pr-3">
            <span className="text-[10px] font-bold tracking-widest uppercase whitespace-nowrap"
                  style={{ color: '#1e3a1e' }}>
              FOOTBALL CAREER ✦ FOOTBALL CAREER ✦ FOOTBALL CAREER ✦ FOOTBALL CAREER
            </span>
          </div>
        </div>

        {/* ── GOAL FLASH ────────────────────────────────────────────────────── */}
        {flash && (
          <div className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none"
               style={{ top: 60 }}>
            <div className="animate-in fade-in zoom-in duration-200">
              <span className="text-3xl font-black uppercase text-white drop-shadow-lg
                               bg-black/70 px-6 py-2 rounded-lg border border-white/20">
                {flash}
              </span>
            </div>
          </div>
        )}

        {/* ── PHASER CANVAS ─────────────────────────────────────────────────── */}
        <PhaserGame onMatchEvent={handleMatchEvent} matchData={matchData} />

      </div>
    </div>
  );
}
