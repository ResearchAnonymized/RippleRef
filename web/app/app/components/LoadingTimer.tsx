'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Clock, Zap } from 'lucide-react';

interface LoadingTimerProps {
  isActive: boolean;
  onTimeUpdate?: (elapsed: number) => void;
  showETA?: boolean;
  totalItems?: number;
  processedItems?: number;
  className?: string;
}

export default function LoadingTimer({ 
  isActive, 
  onTimeUpdate,
  showETA = false,
  totalItems,
  processedItems,
  className = ''
}: LoadingTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive && startTime === null) {
      // Start timer
      const now = Date.now();
      setStartTime(now);
      setElapsed(0);
      
      intervalRef.current = setInterval(() => {
        const elapsedMs = Date.now() - now;
        const elapsedSec = Math.floor(elapsedMs / 1000);
        setElapsed(elapsedSec);
        if (onTimeUpdate) {
          onTimeUpdate(elapsedSec);
        }
      }, 100); // Update every 100ms for smooth display
    } else if (!isActive && startTime !== null) {
      // Stop timer
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Keep the final elapsed time visible
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, startTime, onTimeUpdate]);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${hours}h ${mins}m ${secs}s`;
    }
  };

  const calculateETA = (): string | null => {
    if (!showETA || !totalItems || !processedItems || processedItems === 0) {
      return null;
    }

    const itemsPerSecond = processedItems / elapsed;
    if (itemsPerSecond === 0) return null;

    const remainingItems = totalItems - processedItems;
    const estimatedSeconds = remainingItems / itemsPerSecond;
    
    return formatTime(Math.ceil(estimatedSeconds));
  };

  const calculateProgress = (): number => {
    if (!totalItems || !processedItems) return 0;
    return Math.min(100, (processedItems / totalItems) * 100);
  };

  const eta = calculateETA();
  const progress = calculateProgress();

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex items-center gap-2 text-sm">
        <Clock className="w-4 h-4 text-blue-400" />
        <span className="font-mono font-semibold text-blue-300">
          {formatTime(elapsed)}
        </span>
        {isActive && (
          <span className="text-slate-400 text-xs">elapsed</span>
        )}
      </div>

      {showETA && eta && (
        <div className="flex items-center gap-2 text-sm">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="font-mono text-yellow-300">
            ~{eta} remaining
          </span>
        </div>
      )}

      {showETA && totalItems && processedItems !== undefined && (
        <div className="flex items-center gap-2 text-sm">
          <div className="w-24 bg-slate-700 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-slate-400 text-xs">
            {processedItems}/{totalItems} files
          </span>
        </div>
      )}
    </div>
  );
}

