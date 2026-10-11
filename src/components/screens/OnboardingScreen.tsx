import { useState } from 'react';
import { Button } from '../ui/Button';
import { useUIStore } from '../../store/slices/uiSlice';
import { instanceCommands } from '../../hooks/useTauriCommands';

export function OnboardingScreen() {
  const [step, setStep] = useState(1);
  const { setViewMode } = useUIStore();
  const [instanceUrl, setInstanceUrl] = useState('');
  const [instanceType, setInstanceType] = useState<'invidious' | 'piped'>('invidious');
  const [importing, setImporting] = useState(false);

  const steps = [
    { number: 1, title: 'Welcome', description: 'Welcome to EchoPrism — where two streams become one.' },
    { number: 2, title: 'Add Instance', description: 'Add an Invidious or Piped instance to connect to YouTube.' },
    { number: 3, title: 'Import Subscriptions', description: 'Import your YouTube subscriptions to build your feed.' },
    { number: 4, title: 'Ready', description: 'You\'re all set! Start watching and listening.' },
  ];

  const handleNext = async () => {
    if (step === 2 && instanceUrl.trim()) {
      try {
        await instanceCommands.add(instanceUrl, instanceType);
        setStep(step + 1);
      } catch (error) {
        console.error('Failed to add instance:', error);
      }
    } else if (step < 4) {
      setStep(step + 1);
    } else {
      // Complete onboarding
      setViewMode('feed');
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Progress indicator */}
      <div className="px-4 py-4 border-b border-border">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            {steps.map((stepData, index) => (
              <div key={stepData.number} className="flex-1 flex items-center gap-2">
                {index > 0 && <div className="flex-1 h-0.5 bg-border" />}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  step > stepData.number ? 'bg-accent text-text-inverse' :
                  step === stepData.number ? 'bg-accent text-text-inverse' :
                  'bg-surface text-text-muted'
                }`}>
                  {stepData.number}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm text-text-muted">
            {steps.map((s, i) => (
              <span key={s.number} className={`flex-1 text-center ${step > i + 1 ? 'text-text' : step === i + 1 ? 'text-accent' : 'text-text-muted'}`}>
                {s.title}
              </span>
            ))}
          </div>
        </div>
      </div>

      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="text-center animate-in">
              <div className="w-32 h-32 mx-auto mb-8 bg-gradient-to-br from-stream-audio to-stream-video rounded-2xl flex items-center justify-center">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                  <path d="M2 17l10 5 10-5"></path>
                  <path d="M2 12l10 5 10-5"></path>
                </svg>
              </div>
              <h1 className="text-4xl font-bold text-text mb-4">EchoPrism</h1>
              <p className="text-xl text-text-muted mb-8 max-w-xl mx-auto">
                Two streams become one. A unified video & podcast player that converges 
                YouTube watching and podcast listening into one seamless stream.
              </p>
              <div className="space-y-4 text-left max-w-md mx-auto">
                <div className="flex items-center gap-3 p-4 bg-surface rounded-xl">
                  <div className="w-10 h-10 bg-accent-soft rounded-lg flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                      <path d="M2 17l10 5 10-5"></path>
                      <path d="M2 12l10 5 10-5"></path>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-text">Unified Queue</p>
                    <p className="text-sm text-text-muted">Video + podcast in one playlist</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-surface rounded-xl">
                  <div className="w-10 h-10 bg-audio-soft rounded-lg flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-audio)" strokeWidth="2">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7c0-2.21-1.79-4-4-4H2v2h2v10.55c0 3.87 3.13 7 7 7 1.1 0 2.1-.3 2.8-.86l2.14 2.14 1.41-1.41-2.14-2.14C17.25 12.81 18 10.79 18 8.5c0-2.76-2.24-5-5-5H5.53l3.53-3.53 1.41-1.41L1.82 2.22 3.23 3.64l3.53 3.53 1.41-1.41-3.53-3.53A9.01 9.01 0 0112 2c-4.97 0-9 4.03-9 9s4.03 9 9 9c4.6 0 8.51-3.48 8.84-8H12V3zm0 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm-1.5-9c0 .83-.67 1.5-1.5 1.5S12 13.83 12 13s.67 1.5 1.5 1.5S15 13.83 15 13s-.67-1.5-1.5-1.5z"></path>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-text">Audio Mode</p>
                    <p className="text-sm text-text-muted">Background play that just works</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-surface rounded-xl">
                  <div className="w-10 h-10 bg-video-soft rounded-lg flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-video)" strokeWidth="2">
                      <polygon points="23 7 16 12 23 17 23 7"></polygon>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-text">Smart Links</p>
                    <p className="text-sm text-text-muted">Audio↔Video episode matching</p>
                  </div>
                </div>
              </div>
              <Button className="w-full mt-8" onClick={() => {}} size="lg">
                Get Started
              </Button>
            </div>
          </div>

          {/* Step 2: Add Instance */}
          {step === 2 && (
            <div className="text-center animate-in">
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-stream-audio to-stream-video rounded-2xl flex items-center justify-center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                  <path d="M21 15V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"></path>
                  <path d="M14 10l-4 4 4 4"></path>
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-text mb-2">Add Your First Instance</h1>
              <p className="text-text-muted mb-8 max-w-md mx-auto">
                EchoPrism uses Invidious or Piped instances to access YouTube without tracking. 
                Add a public instance or your own self-hosted one.
              </p>
              
              <div className="max-w-md mx-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Instance URL</label>
                  <input
                    type="url"
                    value={instanceUrl}
                    onChange={(e) => setInstanceUrl(e.target.value)}
                    placeholder="https://invidious.example.com"
                    className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text placeholder-text-muted focus:border-input focus:outline-none focus:ring-2 focus:ring-focus-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <select
                    value={instanceType}
                    onChange={(e) => setInstanceType(e.target.value as 'invidious' | 'piped')}
                    className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text focus:border-input focus:outline-none focus:ring-2 focus:ring-focus-ring"
                  >
                    <option value="invidious">Invidious</option>
                    <option value="piped">Piped</option>
                  </select>
                </div>
                <Button 
                  className="w-full" 
                  onClick={() => handleNext()}
                  disabled={!instanceUrl.trim()}
                >
                  Add Instance
                </Button>
              </div>
            </div>
          </div>

          {/* Step 3: Import Subscriptions */}
          {step === 3 && (
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-stream-audio to-stream-video rounded-2xl flex items-center justify-center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14"></path>
                  <polyline points="17 17 22 22 17 22"></polyline>
                  <polyline points="7 17 2 22 7 22"></polyline>
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-text mb-2">Import Subscriptions</h1>
              <p className="text-text-muted mb-8 max-w-md mx-auto">
                Import your YouTube subscriptions to instantly build your EchoPrism feed.
              </p>
              <div className="max-w-md mx-auto space-y-4">
                <Button variant="unified" className="w-full" onClick={() => {}}>
                  Import from YouTube
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => {}}>
                  Import from OPML file
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => handleNext()}>
                  Skip for now
                </Button>
              </div>
            </div>
          </div>

          {/* Step 4: Ready */}
          {step === 4 && (
            <div className="text-center animate-in">
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-stream-audio to-stream-video rounded-2xl flex items-center justify-center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11"></polyline>
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-text mb-2">You're All Set!</h1>
              <p className="text-text-muted mb-8 max-w-md mx-auto">
                EchoPrism is ready. Your unified feed is waiting.
              </p>
              <Button className="w-full md:w-auto" onClick={() => setViewMode('feed')} size="lg">
                Open Feed
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Navigation */}
      <div className="px-4 py-4 border-t border-border">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Button variant="ghost" onClick={handleBack} disabled={step === 1}>
            Back
          </Button>
          <div className="flex gap-2">
            {step < 4 && (
              <Button onClick={handleNext} disabled={step === 2 && !instanceUrl.trim()}>
                Next
              </Button>
            )}
            {step === 4 && (
              <Button onClick={() => setViewMode('feed')} size="lg">
                Start Using EchoPrism
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
