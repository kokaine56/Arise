import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names, letting later Tailwind utilities win. */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

/** Clamp a number, as a named helper so the intent reads at the call site. */
export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/** 0–1, for progress values. */
export const normaliseProgress = (actual: number, target: number): number => {
  if (!Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) return 0;
  return clamp(actual / target, 0, 1);
};

export const asPercent = (ratio: number): number => Math.round(ratio * 100);

/** Format a magnitude for display: 10000 → "10,000", 1.5 → "1.5". */
export const formatAmount = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return value.toLocaleString('en-US');
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

/** `pluralise(1, 'day')` → "1 day"; `pluralise(3, 'day')` → "3 days". */
export const pluralise = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;
