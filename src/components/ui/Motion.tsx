import { useEffect, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Page transitions.
 *
 * A short fade and a few pixels of lift — enough to signal that the context
 * changed, not enough to make navigation feel slow. 180ms, and nothing at all
 * when the reader has asked for reduced motion.
 */
export const PageTransition = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.32, 0.72, 0, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

/**
 * Resets scroll on navigation. Without it, moving from the bottom of the goals
 * list to History lands the reader mid-page.
 */
export const ScrollToTop = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  return null;
};
