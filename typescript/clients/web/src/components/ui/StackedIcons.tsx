'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface StackedIconsProps {
    primaryIconUri?: string;
    secondaryIconUri?: string;
    primaryAlt?: string;
    secondaryAlt?: string;
    className?: string;
}

export function StackedIcons({
    primaryIconUri,
    secondaryIconUri,
    primaryAlt = 'Primary Icon',
    secondaryAlt = 'Secondary Icon',
    className,
}: StackedIconsProps) {
    return (
        <div className={cn('relative flex-shrink-0', className)}>
            {/* Primary Icon */}
            <div className="w-24 h-24 rounded-full bg-[#1a1a1a] flex items-center justify-center border-2 border-gray-700">
                {primaryIconUri ? (
                    <img
                        src={primaryIconUri}
                        alt={primaryAlt}
                        className="w-14 h-14 rounded-full object-contain"
                    />
                ) : (
                    <svg className="w-14 h-14 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
                    </svg>
                )}
            </div>

            {/* Secondary Icon Overlay */}
            {secondaryIconUri && (
                <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-white border-2 border-[#2a2a2a] overflow-hidden">
                    <img
                        src={secondaryIconUri}
                        alt={secondaryAlt}
                        className="w-full h-full object-contain"
                    />
                </div>
            )}
        </div>
    );
}
