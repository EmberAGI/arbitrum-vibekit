'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pencil } from 'lucide-react';

interface SettingItem {
  name: string;
  description: string;
  amount?: string;
  asset?: string;
}

interface StrategySettingsProps {
  settings: SettingItem[];
  onSettingChange?: (index: number, field: 'amount' | 'asset', value: string) => void;
}

export function StrategySettings({ settings = [], onSettingChange }: StrategySettingsProps) {
  const [localSettings, setLocalSettings] = useState(settings);

  const handleChange = (index: number, field: 'amount' | 'asset', value: string) => {
    const updated = [...localSettings];
    updated[index] = { ...updated[index], [field]: value };
    setLocalSettings(updated);
    onSettingChange?.(index, field, value);
  };

  return (
    <Card className="bg-[#2a2a2a] border-[#323232] rounded-xl">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold text-white">Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {localSettings.map((setting, idx) => (
            <div key={idx} className="bg-[#1a1a1a] rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-sm font-medium text-white mb-1">{setting.name}</h4>
                  <p className="text-xs text-gray-400">{setting.description}</p>
                </div>
                <button className="text-gray-400 hover:text-gray-300 flex-shrink-0 ml-2">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
              {setting.amount !== undefined ? (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <Input
                    type="text"
                    value={setting.amount}
                    onChange={(e) => handleChange(idx, 'amount', e.target.value)}
                    className="bg-[#0a0a0a] border-transparent text-white pl-7 focus:border-gray-700 focus:ring-1 focus:ring-gray-700 rounded-lg"
                    placeholder="0.00"
                  />
                </div>
              ) : setting.asset !== undefined ? (
                <Input
                  type="text"
                  value={setting.asset}
                  onChange={(e) => handleChange(idx, 'asset', e.target.value)}
                  placeholder="0x..."
                  className="bg-[#0a0a0a] border-transparent text-white focus:border-gray-700 focus:ring-1 focus:ring-gray-700 rounded-lg"
                />
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
