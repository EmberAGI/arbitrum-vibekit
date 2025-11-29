'use client';

import React from 'react';
import Image from 'next/image';

interface StrategyCardProps {
  title: string;
  subtitle: string;
  metric1: { value: string; label: string };
  metric2: { value: string; label: string };
  icon?: string;
  avatarIcon?: string;
  disabled?: boolean;
  onClick?: () => void;
}

const StrategyCard: React.FC<StrategyCardProps> = ({
  title,
  subtitle,
  metric1,
  metric2,
  icon,
  avatarIcon,
  disabled = false,
  onClick,
}) => {
  return (
    <div
      className={`rounded-xl p-6 transition-all ${
        disabled
          ? 'bg-[#2a2a2a] opacity-50 cursor-not-allowed'
          : 'bg-[#2a2a2a] hover:bg-[#323232] cursor-pointer'
      }`}
      onClick={disabled ? undefined : onClick}
    >
      <div className="flex items-start gap-4 mb-6">
        {/* Icon with avatar overlay */}
        <div className="relative flex-shrink-0">
          <div className="w-16 h-16 rounded-full bg-[#1a1a1a] flex items-center justify-center border-2 border-gray-700">
            {icon ? (
              <span className="text-3xl">{icon}</span>
            ) : (
              <svg className="w-10 h-10 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
              </svg>
            )}
          </div>
          {avatarIcon && (
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border-2 border-[#2a2a2a] overflow-hidden flex items-center justify-center">
              <span className="text-xs">{avatarIcon}</span>
            </div>
          )}
        </div>

        {/* Title and subtitle */}
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
          <p className="text-sm text-gray-400">{subtitle}</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-4 bg-[#1a1a1a]">
          <div className="text-3xl font-bold text-white mb-1">{metric1.value}</div>
          <div className="text-sm text-gray-400">{metric1.label}</div>
        </div>
        <div className="rounded-lg p-4 bg-[#1a1a1a]">
          <div className="text-3xl font-bold text-white mb-1">{metric2.value}</div>
          <div className="text-sm text-gray-400">{metric2.label}</div>
        </div>
      </div>
    </div>
  );
};

interface SplashScreenProps {
  className?: string;
  onSubmit?: (message: string) => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ className = '', onSubmit }) => {
  const strategies = [
    {
      title: 'USDai Pendle Allo',
      subtitle: 'by @0xfarmer',
      metric1: { value: '25x', label: 'Allo points' },
      metric2: { value: '15%', label: 'APR' },
      icon: '🔷',
      avatarIcon: '👤',
      enabled: true,
      message: 'dispatch workflow',
    },
    {
      title: 'Myriad Arbitrage',
      subtitle: 'by @0xfarmer',
      metric1: { value: '10x', label: 'Points' },
      metric2: { value: '17%', label: 'APR' },
      icon: '🌊',
      avatarIcon: '⚡',
      enabled: false,
    },
  ];

  return (
    <div className={`flex flex-col items-center justify-center flex-1 px-8 py-12 ${className}`}>
      <div className="flex flex-col items-center max-w-5xl w-full">
        {/* Logo */}
        <div className="w-20 h-20 mb-8 flex items-center justify-center">
          <Image
            src="/Logo (1).svg"
            alt="Ember Logo"
            width={80}
            height={80}
            className="drop-shadow-[0_0_30px_rgba(253,103,49,0.3)]"
            priority
          />
        </div>

        {/* Heading */}
        <div className="text-center space-y-3 mb-10">
          <h1 className="text-5xl font-bold text-white tracking-tight leading-tight">
            Farm Airdrops Without a Headache
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Curators plan, Agents work, you relax.
          </p>
        </div>

        {/* Strategy Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mt-4">
          {strategies.map((strategy, index) => (
            <StrategyCard
              key={index}
              title={strategy.title}
              subtitle={strategy.subtitle}
              metric1={strategy.metric1}
              metric2={strategy.metric2}
              icon={strategy.icon}
              avatarIcon={strategy.avatarIcon}
              disabled={!strategy.enabled}
              onClick={
                strategy.enabled && strategy.message && onSubmit
                  ? () => onSubmit(strategy.message!)
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
};
