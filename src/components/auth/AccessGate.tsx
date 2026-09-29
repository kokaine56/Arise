import { useState, useRef, type FormEvent, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { GlassButton } from '@/components/glass/GlassButton';
import { motion } from 'framer-motion';

export const AccessGate = () => {
  const { verifyAccess } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setCode(value);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 4) return;
    
    setLoading(true);
    setError(null);
    try {
      const success = await verifyAccess(code);
      if (!success) {
        setError('Incorrect access code');
        setCode('');
        inputRef.current?.focus();
      }
    } catch (err: any) {
      setError(err.message || "Couldn't connect to the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6">
      <motion.form 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit}
        className="glass glass--strong flex w-full max-w-sm flex-col items-center gap-6 rounded-[var(--radius-glass-lg)] p-8 text-center"
      >
        <div>
          <h1 className="text-title font-medium text-foreground">Welcome back</h1>
          <p className="mt-2 text-body text-muted">Enter your 4-digit access code</p>
        </div>

        <div className="relative w-full max-w-[200px]">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="\d{4}"
            autoComplete="off"
            value={code}
            onChange={handleChange}
            disabled={loading}
            className="w-full rounded-[var(--radius-control)] border border-glass-border bg-glass-sunken px-4 py-3 text-center text-[2rem] tracking-[1em] text-foreground shadow-inner focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            placeholder="••••"
          />
        </div>

        {error ? (
          <p className="text-caption text-danger" role="alert">
            {error}
          </p>
        ) : (
          <div className="h-[18px]" aria-hidden />
        )}

        <GlassButton
          type="submit"
          variant="primary"
          className="w-full"
          disabled={code.length !== 4 || loading}
        >
          {loading ? 'Verifying…' : 'Continue'}
        </GlassButton>
      </motion.form>
    </div>
  );
};
