import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ConvergenceState {
  isConverging: boolean;
  mode: 'unified' | 'audio' | 'video';
}

interface ConvergenceContextType {
  isConverging: boolean;
  mode: 'unified' | 'audio' | 'video';
  triggerConvergence: () => void;
  setMode: (mode: 'unified' | 'audio' | 'video') => void;
}

const ConvergenceContext = createContext<ConvergenceContextType | undefined>(undefined);

export function ConvergenceProvider({ children }: { children: ReactNode }) {
  const [isConverging, setIsConverging] = useState(false);
  const [mode, setMode] = useState<'unified' | 'audio' | 'video'>('unified');
  
  const triggerConvergence = useCallback(() => {
    // Trigger convergence animation
  }, []);
  
  const setMode = useCallback((mode: 'unified' | 'audio' | 'video') => {
    // Set mode
  }, []);
  
  return (
    <ConvergenceContext.Provider value={{ 
      isConverging: false, 
      mode: 'unified', 
      triggerConvergence: () => {}, 
      setMode: () => {} 
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
