'use client';

import React, { useState, useEffect } from 'react';
import {
  Key,
  Plus,
  Trash2,
  Edit,
  Check,
  X,
  RefreshCw,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Shield,
  Database,
  Activity,
  Settings,
  Eye,
  EyeOff,
  Star
} from 'lucide-react';

interface ApiKey {
  id: string;
  provider: string;
  name: string;
  description: string;
  maskedApiKey: string;
  isActive: boolean;
  isDefault: boolean;
  status: string;
  dailyLimit: number;
  monthlyLimit: number;
  totalLimit: number;
  currentDailyCost: number;
  currentMonthlyCost: number;
  totalCost: number;
  remainingDailyBudget: number;
  remainingMonthlyBudget: number;
  remainingTotalBudget: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  createdAt: string;
  updatedAt: string;
  lastUsed: string;
}

interface Statistics {
  totalKeys: number;
  activeKeys: number;
  totalCost: number;
  totalRequests: number;
  successfulRequests: number;
  dailyCost: number;
  dailyLimit: number;
  dailyBudgetUsed: number;
  monthlyCost: number;
  monthlyLimit: number;
  monthlyBudgetUsed: number;
}

export default function LLMSettings() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    provider: 'openrouter',
    name: '',
    apiKey: '',
    description: '',
    dailyLimit: 10.0,
    monthlyLimit: 100.0,
    totalLimit: 1000.0
  });

  useEffect(() => {
    loadApiKeys();
    loadStatistics();
  }, []);

  const loadApiKeys = async () => {
    try {
      const response = await fetch('/api/llm/keys');
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data);
      }
    } catch (error) {
      console.error('Failed to load API keys:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const response = await fetch('/api/llm/keys/statistics');
      if (response.ok) {
        const data = await response.json();
        setStatistics(data);
      }
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  const handleAddKey = async () => {
    try {
      const response = await fetch('/api/llm/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setShowAddModal(false);
        resetForm();
        loadApiKeys();
        loadStatistics();
      }
    } catch (error) {
      console.error('Failed to add API key:', error);
    }
  };

  const handleUpdateKey = async () => {
    if (!selectedKey) return;

    try {
      const response = await fetch(`/api/llm/keys/${selectedKey.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setShowEditModal(false);
        setSelectedKey(null);
        resetForm();
        loadApiKeys();
      }
    } catch (error) {
      console.error('Failed to update API key:', error);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API key?')) return;

    try {
      const response = await fetch(`/api/llm/keys/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        loadApiKeys();
        loadStatistics();
      }
    } catch (error) {
      console.error('Failed to delete API key:', error);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const response = await fetch(`/api/llm/keys/${id}/set-default`, {
        method: 'POST'
      });

      if (response.ok) {
        loadApiKeys();
      }
    } catch (error) {
      console.error('Failed to set default key:', error);
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      const response = await fetch(`/api/llm/keys/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
      });

      if (response.ok) {
        loadApiKeys();
      }
    } catch (error) {
      console.error('Failed to toggle key status:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      provider: 'openrouter',
      name: '',
      apiKey: '',
      description: '',
      dailyLimit: 10.0,
      monthlyLimit: 100.0,
      totalLimit: 1000.0
    });
  };

  const openEditModal = (key: ApiKey) => {
    setSelectedKey(key);
    setFormData({
      provider: key.provider,
      name: key.name,
      apiKey: '',
      description: key.description || '',
      dailyLimit: key.dailyLimit,
      monthlyLimit: key.monthlyLimit,
      totalLimit: key.totalLimit
    });
    setShowEditModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'text-green-400 bg-green-500/20 border-green-500/50';
      case 'LIMIT_REACHED': return 'text-red-400 bg-red-500/20 border-red-500/50';
      case 'EXPIRED': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
      case 'DISABLED': return 'text-gray-400 bg-gray-500/20 border-gray-500/50';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/50';
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center">
            <Key className="w-6 h-6 mr-2" />
            LLM API Key Management
          </h2>
          <p className="text-slate-400 mt-1">
            Manage your API keys, track costs, and monitor usage
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add API Key
        </button>
      </div>

      {/* Statistics Dashboard */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Total Cost</span>
              <DollarSign className="w-4 h-4 text-green-400" />
            </div>
            <div className="text-2xl font-bold text-white">{formatCurrency(statistics.totalCost)}</div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Daily Budget</span>
              <TrendingUp className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white">{statistics.dailyBudgetUsed.toFixed(1)}%</div>
            <div className="text-xs text-slate-400 mt-1">
              {formatCurrency(statistics.dailyCost)} / {formatCurrency(statistics.dailyLimit)}
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Monthly Budget</span>
              <TrendingUp className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-white">{statistics.monthlyBudgetUsed.toFixed(1)}%</div>
            <div className="text-xs text-slate-400 mt-1">
              {formatCurrency(statistics.monthlyCost)} / {formatCurrency(statistics.monthlyLimit)}
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Total Requests</span>
              <Activity className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="text-2xl font-bold text-white">{statistics.totalRequests}</div>
            <div className="text-xs text-slate-400 mt-1">
              {statistics.successfulRequests} successful
            </div>
          </div>
        </div>
      )}

      {/* API Keys List */}
      <div className="space-y-4">
        {apiKeys.length === 0 ? (
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center">
            <Key className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No API Keys</h3>
            <p className="text-slate-400 mb-4">Add your first API key to start using LLM features</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Add API Key
            </button>
          </div>
        ) : (
          apiKeys.map(key => (
            <div key={key.id} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <h3 className="text-lg font-semibold text-white">{key.name}</h3>
                    {key.isDefault && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/50 flex items-center">
                        <Star className="w-3 h-3 mr-1" />
                        Default
                      </span>
                    )}
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(key.status)}`}>
                      {key.status}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm mb-2">{key.description || key.provider}</p>
                  <div className="flex items-center space-x-4 text-xs text-slate-500">
                    <span>Provider: {key.provider}</span>
                    <span>API Key: {key.maskedApiKey}</span>
                    <span>Last used: {formatDate(key.lastUsed)}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {!key.isDefault && (
                    <button
                      onClick={() => handleSetDefault(key.id)}
                      className="p-2 text-slate-400 hover:text-blue-400 transition-colors"
                      title="Set as default"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => openEditModal(key)}
                    className="p-2 text-slate-400 hover:text-green-400 transition-colors"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(key.id, !key.isActive)}
                    className={`p-2 transition-colors ${key.isActive ? 'text-green-400 hover:text-red-400' : 'text-slate-400 hover:text-green-400'}`}
                    title={key.isActive ? 'Disable' : 'Enable'}
                  >
                    {key.isActive ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDeleteKey(key.id)}
                    className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Cost & Usage Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-700">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Daily Cost</div>
                  <div className="text-sm font-semibold text-white">
                    {formatCurrency(key.currentDailyCost)} / {formatCurrency(key.dailyLimit)}
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2 mt-1">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min((key.currentDailyCost / key.dailyLimit) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400 mb-1">Monthly Cost</div>
                  <div className="text-sm font-semibold text-white">
                    {formatCurrency(key.currentMonthlyCost)} / {formatCurrency(key.monthlyLimit)}
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2 mt-1">
                    <div 
                      className="bg-purple-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min((key.currentMonthlyCost / key.monthlyLimit) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400 mb-1">Total Requests</div>
                  <div className="text-sm font-semibold text-white">{key.totalRequests}</div>
                  <div className="text-xs text-green-400 mt-1">
                    {key.successRate.toFixed(1)}% success rate
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400 mb-1">Total Cost</div>
                  <div className="text-sm font-semibold text-white">{formatCurrency(key.totalCost)}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Remaining: {formatCurrency(key.remainingTotalBudget)}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Key Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full border border-slate-700">
            <h3 className="text-xl font-bold text-white mb-4">Add New API Key</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Provider</label>
                <select
                  value={formData.provider}
                  onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="My API Key"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="sk-..."
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Production key for..."
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Daily Limit ($)</label>
                  <input
                    type="number"
                    value={formData.dailyLimit}
                    onChange={(e) => setFormData({ ...formData, dailyLimit: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    step="0.1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Monthly Limit ($)</label>
                  <input
                    type="number"
                    value={formData.monthlyLimit}
                    onChange={(e) => setFormData({ ...formData, monthlyLimit: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    step="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Total Limit ($)</label>
                  <input
                    type="number"
                    value={formData.totalLimit}
                    onChange={(e) => setFormData({ ...formData, totalLimit: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    step="10"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddKey}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Key Modal */}
      {showEditModal && selectedKey && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full border border-slate-700">
            <h3 className="text-xl font-bold text-white mb-4">Edit API Key</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Daily Limit ($)</label>
                  <input
                    type="number"
                    value={formData.dailyLimit}
                    onChange={(e) => setFormData({ ...formData, dailyLimit: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    step="0.1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Monthly Limit ($)</label>
                  <input
                    type="number"
                    value={formData.monthlyLimit}
                    onChange={(e) => setFormData({ ...formData, monthlyLimit: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    step="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Total Limit ($)</label>
                  <input
                    type="number"
                    value={formData.totalLimit}
                    onChange={(e) => setFormData({ ...formData, totalLimit: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    step="10"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedKey(null);
                  resetForm();
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateKey}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center"
              >
                <Check className="w-4 h-4 mr-2" />
                Update Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

