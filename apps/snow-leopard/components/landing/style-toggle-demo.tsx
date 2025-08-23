"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";

interface StyleToggleDemoProps {
  inView: boolean;
}

export function StyleToggleDemo({ inView }: StyleToggleDemoProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  
  useEffect(() => {
    if (inView) {
      const timer = setTimeout(() => setIsEnabled(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [inView]);

  return (
    <div className="rounded-md border p-4 w-full">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Apply Writer Style</span>
        <Switch checked={isEnabled} onCheckedChange={setIsEnabled} className="scale-110" />
      </div>
    </div>
  );
}
