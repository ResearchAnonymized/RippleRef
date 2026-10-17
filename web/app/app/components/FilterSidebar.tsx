'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, X, Search, Save, Bookmark } from 'lucide-react';

interface FilterState {
  severities: string[];
  smellTypes: string[];
  fileTypes: string[];
  searchTerm: string;
  quickFilters: string[];
}

interface FilterSidebarProps {
  onFiltersChange: (filters: FilterState) => void;
  totalIssues: number;
  filteredIssues: number;
}

const ALL_SMELL_TYPES = [
  'design.long-method', 'design.god-class', 'design.duplicate-code', 'design.complex-method',
  'design.long-parameter-list', 'design.feature-envy', 'design.data-clumps', 'design.primitive-obsession',
  'design.switch-statements', 'design.temporary-field', 'design.lazy-class', 'design.middle-man',
  'design.speculative-generality', 'design.message-chains', 'design.inappropriate-intimacy', 'design.shotgun-surgery',
  'design.divergent-change', 'design.parallel-inheritance', 'design.excessive-comments', 'design.dead-code',
  'design.large-class', 'design.data-class', 'design.magic-numbers', 'design.string-constants',
  'design.inconsistent-naming', 'design.nested-conditionals', 'design.flag-arguments', 'design.try-catch-hell',
  'design.null-abuse', 'design.type-embedded-name', 'design.refused-bequest', 'design.empty-catch-block',
  'design.resource-leak', 'design.raw-types', 'design.circular-dependencies', 'design.long-line',
  'design.string-concatenation', 'design.generic-exception', 'design.single-letter-vars', 'design.hardcoded-credentials'
];

const SMELL_TYPE_NAMES: { [key: string]: string } = {
  'design.long-method': 'Long Method',
  'design.god-class': 'God Class',
  'design.duplicate-code': 'Duplicate Code',
  'design.complex-method': 'Complex Method',
  'design.long-parameter-list': 'Long Parameter List',
  'design.feature-envy': 'Feature Envy',
  'design.data-clumps': 'Data Clumps',
  'design.primitive-obsession': 'Primitive Obsession',
  'design.switch-statements': 'Switch Statements',
  'design.temporary-field': 'Temporary Field',
  'design.lazy-class': 'Lazy Class',
  'design.middle-man': 'Middle Man',
  'design.speculative-generality': 'Speculative Generality',
  'design.message-chains': 'Message Chains',
  'design.inappropriate-intimacy': 'Inappropriate Intimacy',
  'design.shotgun-surgery': 'Shotgun Surgery',
  'design.divergent-change': 'Divergent Change',
  'design.parallel-inheritance': 'Parallel Inheritance',
  'design.excessive-comments': 'Excessive Comments',
  'design.dead-code': 'Dead Code',
  'design.large-class': 'Large Class',
  'design.data-class': 'Data Class',
  'design.magic-numbers': 'Magic Numbers',
  'design.string-constants': 'String Constants',
  'design.inconsistent-naming': 'Inconsistent Naming',
  'design.nested-conditionals': 'Nested Conditionals',
  'design.flag-arguments': 'Flag Arguments',
  'design.try-catch-hell': 'Try-Catch Hell',
  'design.null-abuse': 'Null Abuse',
  'design.type-embedded-name': 'Type Embedded Name',
  'design.refused-bequest': 'Refused Bequest',
  'design.empty-catch-block': 'Empty Catch Block',
  'design.resource-leak': 'Resource Leak',
  'design.raw-types': 'Raw Types',
  'design.circular-dependencies': 'Circular Dependencies',
  'design.long-line': 'Long Line',
  'design.string-concatenation': 'String Concatenation',
  'design.generic-exception': 'Generic Exception',
  'design.single-letter-vars': 'Single Letter Variables',
  'design.hardcoded-credentials': 'Hardcoded Credentials'
};

const QUICK_FILTERS = [
  { id: 'critical-only', label: 'Critical Only', severities: ['CRITICAL'] },
  { id: 'security-issues', label: 'Security Issues', smellTypes: ['design.hardcoded-credentials', 'design.empty-catch-block', 'design.resource-leak'] },
  { id: 'performance-issues', label: 'Performance Issues', smellTypes: ['design.string-concatenation', 'design.long-method', 'design.complex-method'] },
  { id: 'maintainability', label: 'Maintainability', smellTypes: ['design.god-class', 'design.long-parameter-list', 'design.duplicate-code'] },
  { id: 'java-files', label: 'Java Files Only', fileTypes: ['.java'] }
];

export default function FilterSidebar({ onFiltersChange, totalIssues, filteredIssues }: FilterSidebarProps) {
  // Load saved filters from localStorage
  const loadSavedFilters = (): FilterState => {
    try {
      const saved = localStorage.getItem('refactai-filters');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.warn('Failed to load saved filters:', error);
    }
    return {
      severities: [],
      smellTypes: [],
      fileTypes: [],
      searchTerm: '',
      quickFilters: []
    };
  };

  const [filters, setFilters] = useState<FilterState>(loadSavedFilters());

  const [expandedSections, setExpandedSections] = useState({
    severity: true,
    smellTypes: true,
    fileTypes: false,
    quickFilters: true
  });

  const [smellTypeSearch, setSmellTypeSearch] = useState('');

  // Save filters to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('refactai-filters', JSON.stringify(filters));
    } catch (error) {
      console.warn('Failed to save filters:', error);
    }
  }, [filters]);

  useEffect(() => {
    onFiltersChange(filters);
  }, [filters, onFiltersChange]);

  const updateFilter = (key: keyof FilterState, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleArrayFilter = (key: 'severities' | 'smellTypes' | 'fileTypes' | 'quickFilters', value: string) => {
    setFilters(prev => {
      const newFilters = {
        ...prev,
        [key]: prev[key].includes(value)
          ? prev[key].filter(item => item !== value)
          : [...prev[key], value]
      };
      return newFilters;
    });
  };

  const applyQuickFilter = (quickFilterId: string) => {
    const quickFilter = QUICK_FILTERS.find(f => f.id === quickFilterId);
    if (!quickFilter) return;

    setFilters(prev => ({
      ...prev,
      severities: quickFilter.severities || prev.severities,
      smellTypes: quickFilter.smellTypes || prev.smellTypes,
      fileTypes: quickFilter.fileTypes || prev.fileTypes,
      quickFilters: prev.quickFilters.includes(quickFilterId)
        ? prev.quickFilters.filter(id => id !== quickFilterId)
        : [...prev.quickFilters, quickFilterId]
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      severities: [],
      smellTypes: [],
      fileTypes: [],
      searchTerm: '',
      quickFilters: []
    });
  };

  const saveFilterPreset = () => {
    const presetName = prompt('Enter a name for this filter preset:');
    if (presetName) {
      try {
        const savedPresets = JSON.parse(localStorage.getItem('refactai-filter-presets') || '{}');
        savedPresets[presetName] = filters;
        localStorage.setItem('refactai-filter-presets', JSON.stringify(savedPresets));
        alert(`Filter preset "${presetName}" saved successfully!`);
      } catch (error) {
        alert('Failed to save filter preset');
      }
    }
  };

  const filteredSmellTypes = ALL_SMELL_TYPES.filter(type =>
    SMELL_TYPE_NAMES[type].toLowerCase().includes(smellTypeSearch.toLowerCase())
  );

  const hasActiveFilters = filters.severities.length > 0 || 
                          filters.smellTypes.length > 0 || 
                          filters.fileTypes.length > 0 || 
                          filters.searchTerm.length > 0 ||
                          filters.quickFilters.length > 0;

  return (
    <div className="w-80 bg-slate-800 border-r border-slate-700 h-full overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">Filters</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={saveFilterPreset}
              className="text-sm text-green-400 hover:text-green-300 flex items-center gap-1"
              title="Save current filter as preset"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Filter Status */}
        <div className="mb-6 p-3 bg-slate-700 rounded-lg">
          <div className="text-sm text-slate-300 flex items-center justify-between">
            <span>
              Showing <span className="text-white font-semibold">{filteredIssues}</span> of{' '}
              <span className="text-white font-semibold">{totalIssues}</span> issues
            </span>
            {hasActiveFilters && (
              <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full">
                {filteredIssues < totalIssues ? 'Filtered' : 'All'}
              </span>
            )}
          </div>
          {hasActiveFilters && (
            <div className="mt-2 text-xs text-blue-400 space-y-1">
              {filters.severities.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                  Severity: {filters.severities.join(', ')}
                </div>
              )}
              {filters.smellTypes.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-orange-400 rounded-full"></span>
                  Smell Types: {filters.smellTypes.length} selected
                </div>
              )}
              {filters.fileTypes.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                  File Types: {filters.fileTypes.join(', ')}
                </div>
              )}
              {filters.searchTerm && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                  Search: "{filters.searchTerm}"
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search files..."
              value={filters.searchTerm}
              onChange={(e) => updateFilter('searchTerm', e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Quick Filters */}
        <div className="mb-6">
          <button
            onClick={() => setExpandedSections(prev => ({ ...prev, quickFilters: !prev.quickFilters }))}
            className="flex items-center justify-between w-full text-left text-white font-medium mb-3"
          >
            <span>Quick Filters</span>
            {expandedSections.quickFilters ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {expandedSections.quickFilters && (
            <div className="space-y-2">
              {QUICK_FILTERS.map(filter => (
                <button
                  key={filter.id}
                  onClick={() => applyQuickFilter(filter.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    filters.quickFilters.includes(filter.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Severity Filter */}
        <div className="mb-6">
          <button
            onClick={() => setExpandedSections(prev => ({ ...prev, severity: !prev.severity }))}
            className="flex items-center justify-between w-full text-left text-white font-medium mb-3"
          >
            <span>Severity</span>
            {expandedSections.severity ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {expandedSections.severity && (
            <div className="space-y-2">
              {['CRITICAL', 'MAJOR', 'MINOR'].map(severity => (
                <label key={severity} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.severities.includes(severity)}
                    onChange={() => toggleArrayFilter('severities', severity)}
                    className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <span className={`text-sm ${
                    severity === 'CRITICAL' ? 'text-red-400' :
                    severity === 'MAJOR' ? 'text-orange-400' : 'text-yellow-400'
                  }`}>
                    {severity}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Smell Types Filter */}
        <div className="mb-6">
          <button
            onClick={() => setExpandedSections(prev => ({ ...prev, smellTypes: !prev.smellTypes }))}
            className="flex items-center justify-between w-full text-left text-white font-medium mb-3"
          >
            <span>Code Smell Types ({filters.smellTypes.length})</span>
            {expandedSections.smellTypes ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {expandedSections.smellTypes && (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Search smell types..."
                value={smellTypeSearch}
                onChange={(e) => setSmellTypeSearch(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <div className="max-h-60 overflow-y-auto space-y-2">
                {filteredSmellTypes.map(type => (
                  <label key={type} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.smellTypes.includes(type)}
                      onChange={() => toggleArrayFilter('smellTypes', type)}
                      className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-300">
                      {SMELL_TYPE_NAMES[type]}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* File Types Filter */}
        <div className="mb-6">
          <button
            onClick={() => setExpandedSections(prev => ({ ...prev, fileTypes: !prev.fileTypes }))}
            className="flex items-center justify-between w-full text-left text-white font-medium mb-3"
          >
            <span>File Types</span>
            {expandedSections.fileTypes ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {expandedSections.fileTypes && (
            <div className="space-y-2">
              {['.java', '.xml', '.properties', '.yml', '.json', '.md'].map(fileType => (
                <label key={fileType} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.fileTypes.includes(fileType)}
                    onChange={() => toggleArrayFilter('fileTypes', fileType)}
                    className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-300">{fileType}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
