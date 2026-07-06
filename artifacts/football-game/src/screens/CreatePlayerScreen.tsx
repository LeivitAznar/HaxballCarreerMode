import { useState } from 'react';
import { motion } from 'framer-motion';

export function CreatePlayerScreen({ onComplete }: { onComplete: (name: string, num: number) => void }) {
  const [name, setName] = useState('');
  const [num, setNum] = useState(9);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen flex items-center justify-center p-6"
    >
      <div className="w-full max-w-md bg-card border border-border rounded-xl p-8 shadow-2xl">
        <h2 className="text-2xl font-black mb-6 uppercase tracking-tight">Create Player</h2>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-2 uppercase">Player Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-background border border-input rounded p-3 text-foreground focus:border-primary focus:outline-none"
              placeholder="e.g. L. Messi"
              maxLength={20}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-2 uppercase">Shirt Number</label>
            <input 
              type="number" 
              value={num}
              onChange={(e) => setNum(parseInt(e.target.value) || 1)}
              className="w-full bg-background border border-input rounded p-3 text-foreground focus:border-primary focus:outline-none"
              min={1}
              max={99}
            />
          </div>

          {/* Position is fixed to FWD for simplicity in this build, but we could add choice */}
          <div className="p-4 bg-muted/50 rounded border border-border">
            <p className="text-sm text-muted-foreground text-center">
              You will start as a <span className="font-bold text-foreground">Forward (FWD)</span> in the reserves of a Division 2 club. Prove your worth.
            </p>
          </div>

          <button 
            disabled={!name.trim()}
            onClick={() => onComplete(name, num)}
            className="w-full py-4 bg-primary text-primary-foreground font-bold rounded hover:bg-primary/90 transition-colors uppercase disabled:opacity-50"
          >
            Sign Contract
          </button>
        </div>
      </div>
    </motion.div>
  );
}
