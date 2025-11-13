'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

interface JsonViewerProps {
  data: any;
  title?: string;
}

export function JsonViewer({ data, title = 'Data Preview' }: JsonViewerProps) {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const handleCopy = (value: string, path: string) => {
    navigator.clipboard.writeText(value);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  return (
    <div className="flex flex-col gap-1 p-4 bg-[hsl(0,0%,20%)] backdrop-blur-sm rounded-lg text-white border border-zinc-600">
      <h2 className="text-sm font-semibold mb-2 text-zinc-300">{title}</h2>
      <div className="bg-[hsl(0,0%,14.1%)] rounded-md p-2 overflow-x-auto max-w-full border border-zinc-600/50">
        <JsonNode
          data={data}
          path=""
          onCopy={handleCopy}
          copiedPath={copiedPath}
        />
      </div>
    </div>
  );
}

interface JsonNodeProps {
  data: any;
  path: string;
  depth?: number;
  onCopy: (value: string, path: string) => void;
  copiedPath: string | null;
  parentKey?: string;
  isArrayItem?: boolean;
  arrayIndex?: number;
}

function JsonNode({
  data,
  path,
  depth = 0,
  onCopy,
  copiedPath,
  parentKey,
  isArrayItem,
  arrayIndex,
}: JsonNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 3);

  // Handle primitive values
  if (
    data === null ||
    data === undefined ||
    typeof data === 'boolean' ||
    typeof data === 'number' ||
    typeof data === 'string'
  ) {
    const value =
      data === null
        ? 'null'
        : data === undefined
          ? 'undefined'
          : typeof data === 'boolean'
            ? data.toString()
            : typeof data === 'number'
              ? data.toString()
              : data;

    const colorClass =
      data === null || data === undefined
        ? 'text-zinc-500'
        : typeof data === 'boolean'
          ? 'text-green-400'
          : typeof data === 'number'
            ? 'text-sky-400'
            : 'text-orange-400';

    const displayValue = typeof data === 'string' ? `"${data}"` : value;

    // If this is an array item
    if (isArrayItem && arrayIndex !== undefined) {
      return (
        <div className="group flex items-center justify-between py-0.5 px-1 hover:bg-zinc-600/20 rounded transition-all duration-150">
          <div className="flex items-center gap-2 text-xs">
            <span className="bg-zinc-600/50 text-zinc-400 px-1.5 py-0.5 rounded text-[10px] font-mono min-w-6 text-center">
              {arrayIndex}
            </span>
            <span className={`${colorClass}`}>{displayValue}</span>
          </div>
          <button
            onClick={() => onCopy(JSON.stringify(data), path)}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-0.5 hover:bg-zinc-600/30 rounded"
            type="button"
            title="Copy value"
          >
            {copiedPath === path ? (
              <Check className="size-3 text-green-400" />
            ) : (
              <Copy className="size-3 text-zinc-500 hover:text-white" />
            )}
          </button>
        </div>
      );
    }

    // If this is part of an object property
    if (parentKey) {
      return (
        <div className="group flex items-center justify-between py-0.5 px-1 hover:bg-zinc-600/20 rounded transition-all duration-150">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-300">{parentKey}:</span>
            <span className={`${colorClass}`}>{displayValue}</span>
          </div>
          <button
            onClick={() => onCopy(JSON.stringify(data), path)}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-0.5 hover:bg-zinc-600/30 rounded"
            type="button"
            title="Copy value"
          >
            {copiedPath === path ? (
              <Check className="size-3 text-green-400" />
            ) : (
              <Copy className="size-3 text-zinc-500 hover:text-white" />
            )}
          </button>
        </div>
      );
    }

    // Root level primitive
    return (
      <div className="py-1 px-2 bg-zinc-600/20 rounded text-xs">
        <span className={`${colorClass}`}>{displayValue}</span>
      </div>
    );
  }

  // Handle arrays
  if (Array.isArray(data)) {
    // Empty array handling
    if (data.length === 0) {
      if (parentKey) {
        return (
          <div className="py-0.5 px-1 hover:bg-zinc-600/20 rounded transition-all duration-150">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-300">{parentKey}:</span>
              <span className="text-zinc-500 bg-zinc-600/30 px-1.5 py-0.5 rounded text-[10px]">
                Empty Array
              </span>
            </div>
          </div>
        );
      }
      if (isArrayItem && arrayIndex !== undefined) {
        return (
          <div className="py-0.5 px-1 hover:bg-zinc-600/20 rounded transition-all duration-150">
            <div className="flex items-center gap-2 text-xs">
              <span className="bg-zinc-600/50 text-zinc-400 px-1.5 py-0.5 rounded text-[10px] font-mono min-w-6 text-center">
                {arrayIndex}
              </span>
              <span className="text-zinc-500 bg-zinc-600/30 px-1.5 py-0.5 rounded text-[10px]">
                Empty Array
              </span>
            </div>
          </div>
        );
      }
      return (
        <div className="py-1 px-2 bg-zinc-600/20 rounded text-xs">
          <span className="text-zinc-500">Empty Array</span>
        </div>
      );
    }

    // Non-empty array
    const displayKey =
      isArrayItem && arrayIndex !== undefined ? `[${arrayIndex}]` : parentKey;

    return (
      <div>
        <div className="bg-zinc-500/10 border border-zinc-500/30 rounded">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full py-1 px-2 flex items-center gap-2 hover:bg-zinc-500/20 transition-all duration-150 rounded text-xs"
            type="button"
          >
            <div className="flex items-center gap-2 flex-1">
              {isExpanded ? (
                <ChevronDown className="size-3 text-zinc-400" />
              ) : (
                <ChevronRight className="size-3 text-zinc-400" />
              )}
              {isArrayItem && arrayIndex !== undefined && (
                <span className="bg-zinc-600/50 text-zinc-400 px-1.5 py-0.5 rounded text-[10px] font-mono">
                  {arrayIndex}
                </span>
              )}
              {displayKey && !isArrayItem && (
                <span className="text-zinc-300 font-medium">{displayKey}:</span>
              )}
              <span className="bg-zinc-500/30 text-zinc-300 px-2 py-0.5 rounded-full text-[10px] font-medium">
                Array • {data.length} {data.length === 1 ? 'item' : 'items'}
              </span>
            </div>
          </button>
        </div>
        {isExpanded && (
          <div className="border-l border-zinc-500/30 ml-3 pl-3 mt-0.5">
            {data.map((item, index) => (
              <JsonNode
                // biome-ignore lint/suspicious/noArrayIndexKey: Rendering arbitrary JSON data without unique IDs
                key={`${path}-${index}`}
                data={item}
                path={`${path}[${index}]`}
                depth={depth + 1}
                onCopy={onCopy}
                copiedPath={copiedPath}
                isArrayItem={true}
                arrayIndex={index}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Handle objects
  if (typeof data === 'object') {
    const keys = Object.keys(data);

    // Empty object handling
    if (keys.length === 0) {
      if (parentKey) {
        return (
          <div className="py-0.5 px-1 hover:bg-zinc-600/20 rounded transition-all duration-150">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-300">{parentKey}:</span>
              <span className="text-zinc-500 bg-zinc-600/30 px-1.5 py-0.5 rounded text-[10px]">
                Empty Object
              </span>
            </div>
          </div>
        );
      }
      if (isArrayItem && arrayIndex !== undefined) {
        return (
          <div className="py-0.5 px-1 hover:bg-zinc-600/20 rounded transition-all duration-150">
            <div className="flex items-center gap-2 text-xs">
              <span className="bg-zinc-600/50 text-zinc-400 px-1.5 py-0.5 rounded text-[10px] font-mono min-w-6 text-center">
                {arrayIndex}
              </span>
              <span className="text-zinc-500 bg-zinc-600/30 px-1.5 py-0.5 rounded text-[10px]">
                Empty Object
              </span>
            </div>
          </div>
        );
      }
      return (
        <div className="py-1 px-2 bg-zinc-600/20 rounded text-xs">
          <span className="text-zinc-500">Empty Object</span>
        </div>
      );
    }

    // Non-empty object
    const displayKey =
      isArrayItem && arrayIndex !== undefined ? `[${arrayIndex}]` : parentKey;

    return (
      <div>
        <div className="bg-zinc-600/10 border border-zinc-600/30 rounded">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full py-1 px-2 flex items-center gap-2 hover:bg-zinc-600/20 transition-all duration-150 rounded text-xs"
            type="button"
          >
            <div className="flex items-center gap-2 flex-1">
              {isExpanded ? (
                <ChevronDown className="size-3 text-zinc-400" />
              ) : (
                <ChevronRight className="size-3 text-zinc-400" />
              )}
              {isArrayItem && arrayIndex !== undefined && (
                <span className="bg-zinc-600/50 text-zinc-400 px-1.5 py-0.5 rounded text-[10px] font-mono">
                  {arrayIndex}
                </span>
              )}
              {displayKey && !isArrayItem && (
                <span className="text-zinc-300 font-medium">{displayKey}:</span>
              )}
              <span className="bg-zinc-600/30 text-zinc-300 px-2 py-0.5 rounded-full text-[10px] font-medium">
                Object • {keys.length}{' '}
                {keys.length === 1 ? 'property' : 'properties'}
              </span>
            </div>
          </button>
        </div>
        {isExpanded && (
          <div className="border-l border-zinc-600/30 ml-3 pl-3 mt-0.5">
            {keys.map((key) => {
              const currentPath = path ? `${path}.${key}` : key;
              const value = data[key];

              return (
                <JsonNode
                  key={key}
                  data={value}
                  path={currentPath}
                  depth={depth + 1}
                  onCopy={onCopy}
                  copiedPath={copiedPath}
                  parentKey={key}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Fallback for any other type
  return (
    <div className="py-1 px-2 bg-red-500/10 border border-red-500/20 rounded text-xs">
      <span className="text-red-400 text-[10px]">
        Unknown type: {JSON.stringify(data)}
      </span>
    </div>
  );
}
