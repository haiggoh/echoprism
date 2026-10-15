import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ConvergenceState {
  isConverging: boolean;
  mode: 'unified' | 'audio' | 'video';
}

interface ConvergenceContextType {
  state: ConvergenceState;
  triggerConvergence: () => void;
  setMode: (mode: ConvergenceState['mode']) => void;
  setConverging: (converging: boolean) => void;
}

const ConvergenceContext = createContext<ConvergenceContextType | undefined>(undefined);

export function ConvergenceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConvergenceState>({
    isConverging: false,
    mode: 'unified',
  });

  const triggerConvergence = useCallback(() => {
    setState(prev => ({ ...prev, isConverging: true }));
    // Reset after animation completes
    setTimeout(() => {
      setState(prev => ({ ...prev, isConverging: false }));
    }, 800);
  }, []);

  const setMode = useCallback((mode: ConvergenceState['mode']) => {
    setState(prev => ({ ...prev, mode }));
  }, []);

  const setConverging = useCallback((converging: boolean) => {
    setState(prev => ({ ...prev, isConverging: converging }));
  }, []);

  const value = { state, setConverging, setMode, triggerConvergence };

  return (
    <ConvergenceContext.Provider value={value}>
      {children}
    </ConvergenceContext.Provider>
  );
}

export function useConvergence() {
  const context = useContext(ConvergenceContext);
  if (!context) {
    throw new Error('useConvergence must be used within a ConvergenceProvider');
  }
  return context;
}
