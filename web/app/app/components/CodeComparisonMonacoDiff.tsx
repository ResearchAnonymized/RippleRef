'use client';

import React, { useCallback, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

export type CodeComparisonMonacoDiffProps = {
  original: string;
  modified: string;
  language: string;
  /** Viewport height, e.g. `min(70vh, 640px)` */
  height?: string;
};

export default function CodeComparisonMonacoDiff({
  original,
  modified,
  language,
  height = '70vh'
}: CodeComparisonMonacoDiffProps) {
  const [sideBySide, setSideBySide] = useState(true);

  const beforeMount = useCallback((monaco: Monaco) => {
    monaco.editor.defineTheme('refact-diff-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'diffEditor.insertedTextBackground': '#14532d66',
        'diffEditor.removedTextBackground': '#7f1d1d55',
        'diffEditor.border': '#334155'
      }
    });
  }, []);

  const options: editor.IDiffEditorConstructionOptions = {
    readOnly: true,
    renderSideBySide: sideBySide,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    lineNumbers: 'on',
    glyphMargin: true,
    folding: true,
    renderOverviewRuler: true,
    overviewRulerBorder: false,
    wordWrap: 'off',
    automaticLayout: true
  };

  return (
    <div className="rounded-lg border border-slate-600 overflow-hidden bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-700 bg-slate-900/80">
        <span className="text-xs text-slate-400">
          Monaco diff · <span className="text-slate-300">{language}</span>
        </span>
        <div className="flex rounded-md border border-slate-600 overflow-hidden text-xs font-medium">
          <button
            type="button"
            onClick={() => setSideBySide(true)}
            className={`px-3 py-1 ${sideBySide ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            Side by side
          </button>
          <button
            type="button"
            onClick={() => setSideBySide(false)}
            className={`px-3 py-1 border-l border-slate-600 ${!sideBySide ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            Inline
          </button>
        </div>
      </div>
      <DiffEditor
        height={height}
        theme="refact-diff-dark"
        language={language}
        original={original ?? ''}
        modified={modified ?? ''}
        beforeMount={beforeMount}
        options={options}
      />
    </div>
  );
}
