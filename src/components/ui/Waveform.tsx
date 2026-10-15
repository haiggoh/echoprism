import { clsx } from 'clsx';
import { useRef, useEffect } from 'react';

export interface WaveformProps {
  variant?: 'static' | 'live';
  size?: 'full' | 'mini' | 'thumbnail';
  data?: number[]; // 0-1 normalized amplitude values
  barCount?: number;
  color?: 'unified' | 'audio' | 'video';
  className?: string;
}

const sizeStyles = {
  full: 'h-24',
  mini: 'h-10',
  thumbnail: 'h-6',
};

const barWidths = {
  full: 'w-1',
  mini: 'w-[3px]',
  thumbnail: 'w-[2px]',
};

const gapSizes = {
  full: 'gap-1',
  mini: 'gap-[2px]',
  thumbnail: 'gap-[1px]',
};

const barCounts = {
  full: 80,
  mini: 40,
  thumbnail: 20,
};

export const Waveform = ({
  variant = 'static',
  size = 'full',
  data,
  barCount = barCounts[size],
  color = 'unified',
  className = '',
}: WaveformProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // const [animatedData, setAnimatedData] = useState<number[]>([]); // Reserved for future sync
  const animationRef = useRef<number>();

  // Generate random waveform data if not provided
  const waveformData = data || Array.from({ length: barCount }, () => Math.random() * 0.3 + 0.1);

  const getColorClasses = () => {
    switch (color) {
      case 'audio': return 'bg-audio';
      case 'video': return 'bg-video';
      default: return 'bg-accent';
    }
  };

  useEffect(() => {
    if (variant !== 'live' || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = canvas.width / barCount;
      const maxHeight = canvas.height;

      for (let i = 0; i < barCount; i++) {
        const amplitude = waveformData[i] || Math.random() * 0.7 + 0.1;
        const height = amplitude * maxHeight * 0.9;
        const x = i * (barWidth + 1);
        const y = (maxHeight - height) / 2;

        ctx.fillStyle = '#10F0A8';
        ctx.fillRect(x, y, barWidth - 1, height);
      }

      // Update waveform data for next frame (handled inline in next frame)
      // const newData = waveformData.map(() => Math.random() * 0.7 + 0.1);

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [waveformData, barCount]);

  // Static waveform (CSS-based)
  if (variant === 'static') {
    const bars = Array.from({ length: barCount }, (_, i) => {
      const height = data ? data[i] * 100 : Math.random() * 70 + 15;
      return (
        <div
          key={i}
          className={clsx(
            'rounded-t',
            barWidths[size],
            gapSizes[size].replace('gap-', ''),
            getColorClasses(),
            'origin-bottom transition-all duration-100'
          )}
          style={{ height: `${height}%` } as React.CSSProperties}
          aria-hidden="true"
        />
      );
    });

    return (
      <div
        className={clsx(
          'flex items-end',
          sizeStyles[size],
          gapSizes[size],
          className
        )}
        role="img"
        aria-label="Audio waveform"
      >
        {bars}
      </div>
    );
  }

  // Live waveform (Canvas-based)
  return (
    <canvas
      ref={canvasRef}
      className={clsx(sizeStyles[size], className)}
      width={size === 'full' ? 320 : size === 'mini' ? 160 : 80}
      height={size === 'full' ? 96 : size === 'mini' ? 40 : 24}
      role="img"
      aria-label="Live audio waveform"
    />
  );
};

Waveform.displayName = 'Waveform';