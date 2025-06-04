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
    <div className="flex flex-col gap-2 p-8 bg-transparent shadow-md rounded-2xl text-white border-red-200 border-2">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <div className="rounded-xl bg-zinc-700 p-4">
        <JsonNode data={data} path="" onCopy={handleCopy} copiedPath={copiedPath} />
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
}

function JsonNode({ data, path, depth = 0, onCopy, copiedPath }: JsonNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);

  if (data === null) {
    return <span className="text-gray-400">null</span>;
  }

  if (data === undefined) {
    return <span className="text-gray-400">undefined</span>;
  }

  if (typeof data === 'boolean') {
    return <span className="text-cyan-400">{data.toString()}</span>;
  }

  if (typeof data === 'number') {
    return <span className="text-green-400">{data}</span>;
  }

  if (typeof data === 'string') {
    return <span className="text-yellow-400 break-words">&quot;{data}&quot;</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-gray-400">[]</span>;
    }

    return (
      <div className="inline-block">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
          type="button"
        >
          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <span className="text-gray-400">
            [{data.length} {data.length === 1 ? 'item' : 'items'}]
          </span>
        </button>
        {isExpanded && (
          <div className="ml-4 mt-1 space-y-1">
            {data.map((item, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="text-gray-500 select-none min-w-8">{index}:</span>
                <div className="flex-1">
                  <JsonNode
                    data={item}
                    path={`${path}[${index}]`}
                    depth={depth + 1}
                    onCopy={onCopy}
                    copiedPath={copiedPath}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return <span className="text-gray-400">{'{}'}</span>;
    }

    return (
      <div className="inline-block w-full">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
          type="button"
        >
          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <span className="text-gray-400">
            {'{'}
            {keys.length} {keys.length === 1 ? 'property' : 'properties'}
            {'}'}
          </span>
        </button>
        {isExpanded && (
          <div className="ml-4 mt-1 space-y-2">
            {keys.map(key => {
              const currentPath = path ? `${path}.${key}` : key;
              const value = data[key];
              const isValuePrimitive =
                value === null || value === undefined || typeof value !== 'object';

              return (
                <div key={key} className="group">
                  <div className="flex items-start gap-2 bg-zinc-600 rounded-lg p-3">
                    <span className="text-blue-400 font-medium min-w-[120px] break-words">
                      {key}:
                    </span>
                    <div className="flex-1">
                      <JsonNode
                        data={value}
                        path={currentPath}
                        depth={depth + 1}
                        onCopy={onCopy}
                        copiedPath={copiedPath}
                      />
                    </div>
                    {isValuePrimitive && (
                      <button
                        onClick={() => onCopy(JSON.stringify(value), currentPath)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                        type="button"
                        title="Copy value"
                      >
                        {copiedPath === currentPath ? (
                          <Check className="size-4 text-green-400" />
                        ) : (
                          <Copy className="size-4 text-gray-400 hover:text-white" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Fallback for any other type
  return <span className="text-gray-400">{JSON.stringify(data)}</span>;
}
