'use client';

import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  animate?: boolean;
}

export function Skeleton({ 
  className = '', 
  width, 
  height, 
  rounded = false, 
  animate = true 
}: SkeletonProps) {
  const style: React.CSSProperties = {};
  
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`
        bg-slate-700/50 
        ${rounded ? 'rounded-full' : 'rounded-lg'} 
        ${animate ? 'animate-pulse' : ''} 
        ${className}
      `}
      style={style}
    />
  );
}

// Pre-built skeleton components
export function SkeletonText({ lines = 1, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          height="1rem" 
          width={i === lines - 1 ? '75%' : '100%'} 
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 ${className}`}>
      <div className="flex items-center space-x-4 mb-4">
        <Skeleton width={48} height={48} rounded />
        <div className="flex-1 space-y-2">
          <Skeleton height="1.25rem" width="60%" />
          <Skeleton height="1rem" width="40%" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4, className = '' }: { 
  rows?: number; 
  columns?: number; 
  className?: string; 
}) {
  return (
    <div className={`bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-slate-700/30 px-6 py-4 border-b border-slate-700/50">
        <div className="flex space-x-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} height="1rem" width={`${100 / columns}%`} />
          ))}
        </div>
      </div>
      
      {/* Rows */}
      <div className="divide-y divide-slate-700/50">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="px-6 py-4">
            <div className="flex space-x-4">
              {Array.from({ length: columns }).map((_, colIndex) => (
                <Skeleton 
                  key={colIndex} 
                  height="1rem" 
                  width={`${100 / columns}%`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonChart({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <Skeleton height="1.5rem" width="200px" />
        <Skeleton height="2rem" width="100px" />
      </div>
      
      {/* Chart area */}
      <div className="h-64 flex items-end space-x-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton 
            key={i} 
            width="100%" 
            height={`${Math.random() * 60 + 20}%`} 
          />
        ))}
      </div>
      
      {/* Legend */}
      <div className="flex justify-center space-x-6 mt-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center space-x-2">
            <Skeleton width={12} height={12} rounded />
            <Skeleton height="1rem" width="60px" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonFileList({ files = 8, className = '' }: { 
  files?: number; 
  className?: string; 
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: files }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4 p-3 bg-slate-800/30 rounded-lg">
          <Skeleton width={20} height={20} />
          <Skeleton height="1rem" width={`${Math.random() * 40 + 30}%`} />
          <div className="flex-1" />
          <Skeleton height="1rem" width="80px" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCodeSmell({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Skeleton width={24} height={24} rounded />
          <Skeleton height="1.25rem" width="200px" />
        </div>
        <Skeleton height="1.5rem" width="80px" />
      </div>
      
      <SkeletonText lines={2} className="mb-4" />
      
      <div className="flex items-center space-x-4">
        <Skeleton height="1rem" width="120px" />
        <Skeleton height="1rem" width="100px" />
        <Skeleton height="1rem" width="80px" />
      </div>
    </div>
  );
}

export function SkeletonDashboard({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-8 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton height="2rem" width="300px" />
          <Skeleton height="1.25rem" width="200px" />
        </div>
        <Skeleton height="3rem" width="150px" />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonChart />
        <SkeletonChart />
      </div>

      {/* File List */}
      <SkeletonFileList files={10} />
    </div>
  );
}

// Loading states for specific components
export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <SkeletonDashboard />
    </div>
  );
}

export function FileAnalysisSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Skeleton width={40} height={40} rounded />
        <div className="space-y-2">
          <Skeleton height="1.25rem" width="250px" />
          <Skeleton height="1rem" width="150px" />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-slate-800/50 rounded-lg p-4">
            <Skeleton height="1rem" width="100px" className="mb-2" />
            <Skeleton height="1.5rem" width="60px" />
          </div>
        ))}
      </div>
      
      <SkeletonText lines={4} />
    </div>
  );
}

export function CodeSmellListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonCodeSmell key={i} />
      ))}
    </div>
  );
}
