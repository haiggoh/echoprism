import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ConvergenceState {
  isConverging: boolean;
  mode: 'unified' | 'audio' | 'video';
  setConverging: (converging: boolean) => void;
  setMode: (mode: 'unified' | 'audio' | 'video') => void;
  triggerConvergence: () => void;
}

const ConvergenceContext = createContext<{
  state: ConvergenceState;
  triggerConvergence: () => void;
} | undefined>(undefined);

export function ConvergenceProvider({ children }: { children: React.ReactNode }) {
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

  const setMode = useCallback((mode: 'unified' | 'audio' | 'video') => {
    setState(prev => ({ ...prev, mode: mode }));
  }, []);

  const setConverging = useCallback((converging: boolean) => {
    setState(prev => ({ ...prev, isConverging: converging }));
  }, []);

  const value = {
    state: { isConverging: false, mode: 'unified' as const },
    setConverging,
    setMode,
    triggerConvergence,
  };

  return (
    <ConvergenceContext.Provider value={{
      state: { isConverging: false, mode: 'unified' as const },
      setConverging,
      setMode,
      triggerConvergence,
    }}>
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
