'use client';

import React from 'react';
import LLMSettings from '../components/LLMSettings';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LLMSettingsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Navigation */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </button>
        </div>

        {/* LLM Settings Component */}
        <LLMSettings />
      </div>
    </div>
  );
}

