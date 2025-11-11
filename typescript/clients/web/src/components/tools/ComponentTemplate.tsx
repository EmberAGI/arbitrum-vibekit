'use client';

import React, { useState } from 'react';
import { CheckCircle, AlertCircle, Loader2, Sparkles } from 'lucide-react';

/**
 * Component Template for Custom MCP Tool Components
 *
 * Copy this file and rename it for your specific tool.
 * Replace "MyTool" with your tool name throughout the file.
 *
 * Usage:
 * 1. Copy this file: cp ComponentTemplate.tsx YourToolName.tsx
 * 2. Replace all instances of "MyTool" with your tool name
 * 3. Define proper TypeScript interfaces for your data
 * 4. Implement your custom UI
 * 5. Register in toolComponentLoader.ts
 * 6. Configure in tools.ts
 */

// TODO: Replace with your specific data interface
interface MyToolData {
  // Define the structure of data your component expects
  // This should match what your MCP tool returns (after transformation)
  id?: string;
  title?: string;
  description?: string;
  value?: number;
  status?: string;
  // Add more fields as needed
}

interface MyToolProps {
  // For simple components, use 'data' prop
  data?: MyToolData;

  // For complex components with transformation, use specific props
  // toolResult?: any;
  // metadata?: any;

  // Optional props for enhanced functionality
  isLoading?: boolean;
  error?: string;
  onAction?: (action: string, payload?: any) => void;
}

/**
 * MyTool Component
 *
 * TODO: Replace "MyTool" with your actual component name
 * TODO: Update the component description
 */
export function MyTool({ data, isLoading = false, error, onAction }: MyToolProps) {
  // Local state for component interactions
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string>('');

  // Handle loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 p-8 rounded-xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent">
        <Loader2 className="h-6 w-6 text-orange-400 animate-spin" />
        <span className="text-gray-300 font-medium">Loading...</span>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-400 mb-1">Error</h3>
            <p className="text-sm text-red-400/70">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Handle empty/missing data
  if (!data) {
    return (
      <div className="rounded-xl border border-[#404040] bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] p-8">
        <p className="text-gray-400 text-center text-sm">No data available</p>
      </div>
    );
  }

  // Validate required data fields
  // TODO: Add validation for your specific required fields
  if (!data.title && !data.id) {
    return (
      <div className="rounded-xl border border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 via-yellow-500/5 to-transparent p-5">
        <p className="text-yellow-400 text-sm">Missing required data fields</p>
      </div>
    );
  }

  // Event handlers
  const handleAction = (actionType: string, payload?: any) => {
    console.log(`[MyTool] Action: ${actionType}`, payload);
    onAction?.(actionType, payload);
  };

  const handleToggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Main component render
  return (
    <div className="relative overflow-hidden rounded-xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent">
      {/* Header Section */}
      <div className="flex items-center gap-3 p-5 pb-4 border-b border-orange-500/20 bg-gradient-to-r from-orange-500/5 to-transparent">
        <div className="p-2 rounded-lg bg-orange-500/20">
          <Sparkles className="h-5 w-5 text-orange-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-orange-400">{data.title || 'Tool Result'}</h3>
          {data.description && <p className="text-xs text-gray-400 mt-0.5">{data.description}</p>}
        </div>

        {/* Status indicator */}
        {data.status && (
          <div
            className={`px-3 py-1 rounded-lg text-xs font-semibold ${
              data.status === 'success'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : data.status === 'error'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : data.status === 'pending'
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                    : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
            }`}
          >
            {data.status === 'success' && <CheckCircle className="h-3 w-3 inline mr-1" />}
            {data.status === 'error' && <AlertCircle className="h-3 w-3 inline mr-1" />}
            {data.status}
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="p-5 space-y-4">
        {/* Main content area - customize this section */}
        <div className="space-y-4">
          {/* Value display example */}
          {data.value !== undefined && (
            <div className="rounded-xl bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] border border-[#404040] p-5">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Value</div>
              <div className="text-3xl font-bold text-white">
                {typeof data.value === 'number' ? data.value.toLocaleString() : data.value}
              </div>
            </div>
          )}

          {/* Expandable details section */}
          <div>
            <button
              onClick={handleToggleExpanded}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-orange-400 transition-colors"
            >
              <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                ▶
              </span>
              {isExpanded ? 'Hide Details' : 'Show Details'}
            </button>

            {isExpanded && (
              <div className="mt-3 p-3 bg-[#0a0a0a] border border-[#404040] rounded-lg">
                <pre className="text-xs text-gray-400 overflow-auto">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Interactive elements example */}
          <div className="flex flex-wrap gap-3 pt-2">
            <select
              value={selectedOption}
              onChange={(e) => setSelectedOption(e.target.value)}
              className="h-10 px-3 rounded-lg border border-[#404040] bg-[#1a1a1a] text-white text-sm hover:border-[#505050] transition-colors"
            >
              <option value="">Select option...</option>
              <option value="option1">Option 1</option>
              <option value="option2">Option 2</option>
              <option value="option3">Option 3</option>
            </select>

            <button
              onClick={() => handleAction('primary', { selectedOption })}
              className="flex items-center gap-2 h-10 px-6 rounded-lg font-semibold text-white transition-all duration-200 shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#FD6731' }}
              disabled={!selectedOption}
            >
              Execute Action
            </button>

            <button
              onClick={() => handleAction('secondary')}
              className="h-10 px-6 rounded-lg font-semibold border border-[#404040] text-gray-300 hover:bg-white/5 hover:border-[#505050] transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Footer Section (optional) */}
      <div className="px-5 py-4 border-t border-orange-500/20 bg-gradient-to-r from-orange-500/5 to-transparent">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>ID: {data.id || 'N/A'}</span>
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * TODO Checklist for customizing this template:
 *
 * □ Replace "MyTool" with your component name throughout the file
 * □ Update the MyToolData interface to match your tool's data structure
 * □ Customize the MyToolProps interface for your component's needs
 * □ Implement your specific UI in the main render section
 * □ Add any necessary state management with useState/useEffect
 * □ Implement proper error handling for your use case
 * □ Add event handlers for user interactions
 * □ Test with your actual MCP tool data
 * □ Register the component in toolComponentLoader.ts
 * □ Configure the tool mapping in tools.ts
 * □ Add data transformation if needed in dataTransformers.ts
 *
 * Optional enhancements:
 * □ Add wallet integration (useAccount, useSwitchChain, etc.)
 * □ Implement transaction handling
 * □ Add loading animations and better UX
 * □ Create responsive design for mobile
 * □ Add accessibility features (ARIA labels, keyboard navigation)
 * □ Write unit tests for your component
 */

// Export default for dynamic imports
export default MyTool;
