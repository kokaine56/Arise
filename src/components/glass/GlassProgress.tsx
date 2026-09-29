import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/format';
import { clamp } from '@/lib/format';

export interface ProgressRingProps {
  /** 0–1. Values outside the range are clamped. */
  value: number;
  size?: number | undefined;
  strokeWidth?: number | undefined;
  className?: string | undefined;
  children?: React.ReactNode | undefined;
  label: string;
}

/**
 * The day's centre of gravity: one thin ring, the percentage set in tabular
 * figures at its centre, nothing else competing for attention.
 *
 * Drawn as an SVG circle rather than a conic gradient so the arc animates
 * smoothly and the track stays a hairline at any size.
 */
export const ProgressRing = ({
  value,
  size = 132,
  strokeWidth = 5,
  className,
  children,
  label,
}: ProgressRingProps) => {
  const reduceMotion = useReducedMotion();
  const progress = clamp(value, 0, 1);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * progress;

  return (
    <div
      className={cn('relative grid place-items-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="gpu -rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--glass-border)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          initial={false}
          animate={{ strokeDasharray: `${dash} ${circumference}` }}
          transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.32, 0.72, 0, 1] }}
        />
      </svg>
      {children ? (
        <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
      ) : null}
    </div>
  );
};

export interface ProgressBarProps {
  value: number;
  className?: string | undefined;
  label: string;
}

/**
 * A thin linear indicator for inline use — a goal row's own progress, or a
 * week strip. Deliberately not a chunky filled bar: this is a proportion, and
 * it should read as one glance, not as a status light.
 */
export const ProgressBar = ({ value, className, label }: ProgressBarProps) => {
  const reduceMotion = useReducedMotion();
  const progress = clamp(value, 0, 1);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-label={label}
      className={cn('h-1 w-full overflow-hidden rounded-full bg-glass-border', className)}
    >
      <motion.div
        className="h-full rounded-full bg-accent gpu"
        initial={false}
        animate={{ width: `${progress * 100}%` }}
        transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.32, 0.72, 0, 1] }}
      />
    </div>
  );
};
