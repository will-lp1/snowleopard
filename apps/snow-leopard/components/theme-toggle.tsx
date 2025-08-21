"use client";

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sun, Moon } from 'lucide-react';
import { useGT } from 'gt-next';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const t = useGT();
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  
  const isDark = theme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      className="fixed top-4 left-4 z-50"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={t('Switch to {mode} mode', { mode: isDark ? t('light') : t('dark') })}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
} 