import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { gameConfig } from './config';

interface PhaserGameProps {
  onMatchEvent: (event: any) => void;
  matchData: any;
}

export default function PhaserGame({ onMatchEvent, matchData }: PhaserGameProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  // Keep a stable ref to the latest event handler so Phaser never needs to re-subscribe
  const onMatchEventRef = useRef(onMatchEvent);
  onMatchEventRef.current = onMatchEvent;

  useEffect(() => {
    // Create the Phaser game exactly once per mount
    const config = {
      ...gameConfig,
      callbacks: {
        preBoot: (game: Phaser.Game) => {
          game.registry.set('matchData', matchData);
        }
      }
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Use a stable wrapper that always calls the latest handler via ref
    const stableHandler = (event: any) => onMatchEventRef.current(event);
    game.events.on('match_event', stableHandler);

    return () => {
      game.events.off('match_event', stableHandler);
      game.destroy(true);
      gameRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps: game created once, handler updated via ref

  return (
    <div
      id="phaser-container"
      className="rounded-lg overflow-hidden shadow-2xl border border-border"
    />
  );
}
