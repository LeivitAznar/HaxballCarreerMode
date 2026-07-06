import { useState } from 'react';
import { motion } from 'framer-motion';

export function MainMenuScreen({ onNewCareer, onContinue, hasSave }: { onNewCareer: () => void, onContinue: () => void, hasSave: boolean }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-background to-background z-0" />
      
      <div className="z-10 text-center mb-12">
        <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-500 mb-2">
          FUTBOL <span className="text-primary">CARRERA</span>
        </h1>
        <p className="text-muted-foreground uppercase tracking-widest text-sm">The Solo Player Experience</p>
      </div>

      <div className="z-10 flex flex-col gap-4 w-full max-w-xs">
        {hasSave && (
          <button 
            onClick={onContinue}
            className="w-full py-4 bg-primary text-primary-foreground font-bold rounded hover:bg-primary/90 transition-colors uppercase tracking-wider"
          >
            Continue Career
          </button>
        )}
        <button 
          onClick={onNewCareer}
          className={`w-full py-4 font-bold rounded transition-colors uppercase tracking-wider ${hasSave ? 'bg-card border border-border hover:bg-muted text-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
        >
          New Career
        </button>
      </div>
    </motion.div>
  );
}
