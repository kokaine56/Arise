import { useState, useRef, type FormEvent, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { GlassButton } from '@/components/glass/GlassButton';
import { motion } from 'framer-motion';

export const AccessGate = () => {
  const { verifyAccess } = useAuth();
  const [code, setCode] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);
    setError(null);

    // Auto-advance
    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      // Focus previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pastedData) {
      const newCode = [...code];
      for (let i = 0; i < pastedData.length; i++) {
        newCode[i] = pastedData[i] as string;
      }
      setCode(newCode);
      setError(null);
      // Focus the next empty slot or the last slot
      const nextIndex = Math.min(pastedData.length, 3);
      inputRefs.current[nextIndex]?.focus();
    }
  };

  const currentCodeString = code.join('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (currentCodeString.length !== 4) return;
    
    setLoading(true);
    setError(null);
    try {
      const success = await verifyAccess(currentCodeString);
      if (!success) {
        setError('Incorrect access code');
        setCode(['', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (err: any) {
      setError(err.message || "Couldn't connect to the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-4 sm:p-6">
      <motion.form 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit}
        className="glass glass--strong flex w-full max-w-sm flex-col items-center gap-6 rounded-[var(--radius-glass-lg)] p-6 sm:p-8 text-center"
      >
        <div>
          <h1 className="text-title font-medium text-foreground">Welcome back</h1>
          <p className="mt-2 text-body text-muted">Enter your 4-digit access code</p>
        </div>

        <div className="flex w-full justify-center gap-3 sm:gap-4">
          {code.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              inputMode="numeric"
              pattern="\d"
              autoComplete="off"
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              disabled={loading}
              className="w-12 h-14 sm:w-14 sm:h-16 rounded-[var(--radius-control)] border border-glass-border bg-glass-sunken text-center text-title sm:text-[2rem] text-foreground shadow-inner focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 transition-shadow"
            />
          ))}
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
          disabled={currentCodeString.length !== 4 || loading}
        >
          {loading ? 'Verifying…' : 'Continue'}
        </GlassButton>
      </motion.form>
    </div>
  );
};
