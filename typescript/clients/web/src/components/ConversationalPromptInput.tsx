'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, Sparkles } from 'lucide-react';
import {
  PromptTemplate,
  PromptParameter,
  promptTemplates as staticPromptTemplates,
} from '@/config/prompts';
import { Prompt } from '@modelcontextprotocol/sdk/types.js';
import { findPromptMapping } from '@/config/promptMappings';
import { useCompletionState } from '@/lib/hooks/useCompletionState';

interface ConversationalPromptInputProps {
  onSubmit: (
    prompt: string,
    template?: PromptTemplate,
    parameters?: Record<string, string>,
  ) => void;
  placeholder?: string;
  className?: string;
  handleCompletion?: (
    ref: { type: 'ref/prompt'; name: string },
    argName: string,
    value: string,
    context?: Record<string, string>,
    signal?: AbortSignal,
  ) => Promise<string[]>;
  completionsSupported?: boolean;
  isConnected?: boolean;
  disabled?: boolean;
  mcpPrompts?: Prompt[];
  onGetPrompt?: (name: string, args?: Record<string, string>) => Promise<any>;
  onTemplateChange?: (hasTemplate: boolean) => void; // New prop to notify parent about template state
}

interface ParameterValue {
  [key: string]: string | boolean;
}

const ConversationalPromptInput = React.forwardRef<
  HTMLInputElement,
  ConversationalPromptInputProps
>(
  (
    {
      onSubmit,
      placeholder = 'Type your message or use a prompt template...',
      className = '',
      handleCompletion,
      completionsSupported = false,
      isConnected = false,
      disabled = false,
      mcpPrompts = [],
      onGetPrompt,
      onTemplateChange,
    },
    ref,
  ) => {
    const [inputValue, setInputValue] = useState('');
    const [ghostText, setGhostText] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
    const [parameterValues, setParameterValues] = useState<ParameterValue>({});
    const [activeParameterIndex, setActiveParameterIndex] = useState(-1);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<PromptTemplate[]>([]);
    const [isPromptDropdownOpen, setIsPromptDropdownOpen] = useState(false);
    const [promptSearchText, setPromptSearchText] = useState('');
    const [completionSearchText, setCompletionSearchText] = useState<Record<string, string>>({});
    const [selectedCompletionIndex, setSelectedCompletionIndex] = useState<Record<string, number>>(
      {},
    );

    const inputRef = useRef<HTMLInputElement>(null);
    const promptDropdownRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const { completions, loading, errors, requestCompletions, clearError } = useCompletionState(
      handleCompletion
        ? (
            ref: any,
            argName: string,
            value: string,
            context?: Record<string, string>,
            signal?: AbortSignal,
          ) => handleCompletion(ref, argName, value, context, signal)
        : async () => [],
      completionsSupported && !!handleCompletion,
    );

    // Convert MCP prompts to template format, fallback to static prompts if MCP is unavailable
    const promptTemplates = React.useMemo(() => {
      console.log(
        '[ConversationalPromptInput] Converting MCP prompts to templates:',
        mcpPrompts.map((p) => ({ name: p.name, description: p.description })),
      );

      // If no MCP prompts, use static prompts as fallback
      if (!mcpPrompts || mcpPrompts.length === 0) {
        console.log(
          '[ConversationalPromptInput] No MCP prompts available, using static prompts fallback',
        );
        return staticPromptTemplates;
      }

      return mcpPrompts.map((mcpPrompt): PromptTemplate => {
        // Try to find a custom mapping for this prompt
        const mapping = findPromptMapping(mcpPrompt.name);
        console.log(
          `[ConversationalPromptInput] Looking for mapping for "${mcpPrompt.name}":`,
          mapping ? 'FOUND' : 'NOT FOUND',
        );

        // Create base parameters from MCP arguments
        const parameters: PromptParameter[] = (mcpPrompt.arguments || []).map((arg) => {
          // Check if there's a parameter override in the mapping
          const override = mapping?.parameterOverrides?.find((o) => o.name === arg.name);

          return {
            name: arg.name,
            type: override?.type || 'text',
            placeholder: override?.placeholder || arg.description || `Enter ${arg.name}...`,
            required: override?.required !== undefined ? override.required : arg.required || false,
            description: override?.description || arg.description,
            options: override?.options,
          };
        });

        // Use mapping if available, otherwise create a basic template
        if (mapping) {
          // Ensure all template parameters have corresponding parameter definitions
          const templateParams = mapping.template.match(/\{([^}]+)\}/g) || [];
          const enhancedParameters = [...parameters];

          templateParams.forEach((paramPlaceholder) => {
            const paramName = paramPlaceholder.replace(/[{}]/g, '');
            if (!enhancedParameters.find((p) => p.name === paramName)) {
              // Find parameter override in mapping
              const override = mapping.parameterOverrides?.find((o) => o.name === paramName);
              if (override) {
                enhancedParameters.push({
                  name: paramName,
                  type: override.type || 'text',
                  placeholder: override.placeholder || `Enter ${paramName}...`,
                  required: override.required !== undefined ? override.required : true,
                  description: override.description,
                  options: override.options,
                });
              }
            }
          });

          console.log(
            `[ConversationalPromptInput] Using mapping template for "${mcpPrompt.name}":`,
            mapping.template,
          );
          return {
            id: mcpPrompt.name,
            name: mapping.name,
            description: mapping.description,
            triggerWords: mapping.triggerWords,
            template: mapping.template,
            parameters: enhancedParameters,
            category: mapping.category,
            example: mapping.example,
          };
        } else {
          // Fallback: create basic template from prompt name
          const template = `${mcpPrompt.name} ${parameters.map((p) => `{${p.name}}`).join(' ')}`;
          console.log(
            `[ConversationalPromptInput] Using fallback template for "${mcpPrompt.name}":`,
            template,
          );
          return {
            id: mcpPrompt.name,
            name: mcpPrompt.name,
            description: mcpPrompt.description || '',
            triggerWords: [mcpPrompt.name.toLowerCase()],
            template,
            parameters,
          };
        }
      });
    }, [mcpPrompts]);

    // Helper functions for template matching
    const findPromptByTrigger = (text: string): PromptTemplate | null => {
      const lowerText = text.toLowerCase().trim();
      for (const template of promptTemplates) {
        for (const trigger of template.triggerWords) {
          if (lowerText.startsWith(trigger.toLowerCase())) {
            return template;
          }
        }
      }
      return null;
    };

    const getPromptSuggestions = (text: string): PromptTemplate[] => {
      const lowerText = text.toLowerCase().trim();
      return promptTemplates.filter(
        (template) =>
          template.name.toLowerCase().includes(lowerText) ||
          template.description.toLowerCase().includes(lowerText) ||
          template.triggerWords.some((word) => word.toLowerCase().includes(lowerText)),
      );
    };

    // Handle click outside to close prompt dropdown
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          promptDropdownRef.current &&
          !promptDropdownRef.current.contains(event.target as Node)
        ) {
          setIsPromptDropdownOpen(false);
        }
      };

      if (isPromptDropdownOpen) {
        document.addEventListener('mousedown', handleClickOutside);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isPromptDropdownOpen]);

    // Update suggestions based on input
    useEffect(() => {
      if (inputValue.length > 0 && !selectedTemplate) {
        const newSuggestions = getPromptSuggestions(inputValue);
        setSuggestions(newSuggestions);
        setShowSuggestions(newSuggestions.length > 0);

        const matchedTemplate = findPromptByTrigger(inputValue);
        if (matchedTemplate) {
          const triggerWord = matchedTemplate.triggerWords[0];
          const userInputAfterTrigger = inputValue.substring(triggerWord.length);
          const templateAfterTrigger = matchedTemplate.template.substring(triggerWord.length);

          if (
            templateAfterTrigger.startsWith(userInputAfterTrigger) &&
            userInputAfterTrigger !== templateAfterTrigger
          ) {
            setGhostText(templateAfterTrigger.substring(userInputAfterTrigger.length));
          } else {
            setGhostText('');
          }
        } else {
          setGhostText('');
        }
      } else {
        setShowSuggestions(false);
        setGhostText('');
      }
    }, [inputValue, selectedTemplate]);

    const handleInputChange = (value: string) => {
      if (selectedTemplate) return;
      setInputValue(value);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Tab' && ghostText) {
        e.preventDefault();
        activateTemplate();
      } else if (e.key === 'Enter' && !selectedTemplate && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        clearTemplate();
      }
    };

    const activateTemplate = () => {
      const matchedTemplate = findPromptByTrigger(inputValue);
      if (matchedTemplate) {
        // Use selectTemplate to ensure proper parameter setup
        selectTemplate(matchedTemplate);
        setGhostText('');
        setShowSuggestions(false);
      }
    };

    const selectTemplate = (template: PromptTemplate) => {
      // Ensure all template parameters are properly defined from mapping
      const mapping = findPromptMapping(template.id);
      if (mapping) {
        const templateParams = mapping.template.match(/\{([^}]+)\}/g) || [];
        const enhancedParameters = [...template.parameters];

        templateParams.forEach((paramPlaceholder) => {
          const paramName = paramPlaceholder.replace(/[{}]/g, '');
          if (!enhancedParameters.find((p) => p.name === paramName)) {
            const override = mapping.parameterOverrides?.find((o) => o.name === paramName);
            if (override) {
              enhancedParameters.push({
                name: paramName,
                type: override.type || 'text',
                placeholder: override.placeholder || `Enter ${paramName}...`,
                required: override.required !== undefined ? override.required : true,
                description: override.description,
                options: override.options,
              });
            }
          }
        });

        template.parameters = enhancedParameters;
      }

      setSelectedTemplate(template);
      setInputValue('');
      setParameterValues({});
      setActiveParameterIndex(0);
      setShowSuggestions(false);
      setIsPromptDropdownOpen(false);

      // Notify parent about template selection
      onTemplateChange?.(true);
    };

    const clearTemplate = () => {
      setSelectedTemplate(null);
      setParameterValues({});
      setActiveParameterIndex(-1);
      setInputValue('');
      inputRef.current?.focus();

      // Notify parent that template was cleared
      onTemplateChange?.(false);
    };

    const updateParameter = (
      paramName: string,
      value: string | boolean,
      isSelection: boolean = false,
    ) => {
      setParameterValues((prev) => ({
        ...prev,
        [paramName]: value,
      }));

      if (
        selectedTemplate &&
        handleCompletion &&
        completionsSupported &&
        typeof value === 'string' &&
        value.trim().length > 0 &&
        !isSelection
      ) {
        const context: Record<string, string> = {};
        Object.entries({ ...parameterValues, [paramName]: value }).forEach(([key, val]) => {
          context[key] = typeof val === 'boolean' ? val.toString() : val;
        });

        requestCompletions(
          {
            type: 'ref/prompt' as const,
            name: selectedTemplate.id,
          },
          paramName,
          value,
          context,
        );
      }

      if (errors[paramName]) {
        clearError(paramName);
      }
    };

    const generateFinalPrompt = (): string => {
      if (!selectedTemplate) return inputValue;

      console.log('[generateFinalPrompt] Template:', selectedTemplate.template);
      console.log('[generateFinalPrompt] Parameter values:', parameterValues);
      console.log(
        '[generateFinalPrompt] Template parameters:',
        selectedTemplate.parameters.map((p) => p.name),
      );

      let result = selectedTemplate.template;
      selectedTemplate.parameters.forEach((param) => {
        const value = parameterValues[param.name] || '';
        console.log(`[generateFinalPrompt] Replacing {${param.name}} with "${value}"`);
        result = result.replace(`{${param.name}}`, String(value));
      });

      console.log('[generateFinalPrompt] Final result:', result);
      return result;
    };

    const handleSubmit = async () => {
      const finalPrompt = generateFinalPrompt();
      if (!finalPrompt.trim()) return;

      // Convert parameter values to strings for metadata
      const promptArgs: Record<string, string> = {};
      Object.entries(parameterValues).forEach(([key, val]) => {
        promptArgs[key] = typeof val === 'boolean' ? val.toString() : val;
      });

      // If we have a selected template and onGetPrompt, we could fetch the MCP prompt,
      // but we prefer to use our template-generated prompt for better formatting
      if (selectedTemplate && onGetPrompt && isConnected) {
        try {
          // We still call onGetPrompt to validate the prompt exists, but we don't use its text
          await onGetPrompt(selectedTemplate.id, promptArgs);
          console.log(
            '[ConversationalPromptInput] MCP prompt validated, using template-generated text:',
            finalPrompt,
          );

          // Use our template-generated prompt instead of the MCP server's text
          onSubmit(finalPrompt, selectedTemplate, promptArgs);
          clearTemplate();
          return;
        } catch (error) {
          console.error('[ConversationalPromptInput] Failed to validate MCP prompt:', error);
          // Fall through to use the template-generated prompt
        }
      }

      onSubmit(
        finalPrompt,
        selectedTemplate || undefined,
        selectedTemplate ? promptArgs : undefined,
      );

      // Clear after submission
      if (!selectedTemplate) {
        setInputValue('');
      } else {
        clearTemplate();
      }
    };

    const isSubmitReady = () => {
      if (!selectedTemplate) return inputValue.trim().length > 0;

      return selectedTemplate.parameters
        .filter((p) => p.required)
        .every((p) => parameterValues[p.name] && String(parameterValues[p.name]).trim() !== '');
    };

    const renderParameterInput = (param: PromptParameter, index: number) => {
      const value = parameterValues[param.name] || '';
      const isActive = activeParameterIndex === index;
      const paramCompletions = completions[param.name] || [];
      const isLoadingCompletions = loading[param.name];
      const completionError = errors[param.name];
      const searchText = completionSearchText[param.name] || '';
      const selectedIdx = selectedCompletionIndex[param.name] || 0;

      // Filter completions based on search text
      const filteredCompletions = paramCompletions.filter((completion) =>
        completion.toLowerCase().includes(searchText.toLowerCase()),
      );

      const handleKeyDown = (e: React.KeyboardEvent) => {
        if (filteredCompletions.length === 0 || !isActive) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedCompletionIndex((prev) => ({
            ...prev,
            [param.name]: Math.min((prev[param.name] || 0) + 1, filteredCompletions.length - 1),
          }));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedCompletionIndex((prev) => ({
            ...prev,
            [param.name]: Math.max((prev[param.name] || 0) - 1, 0),
          }));
        } else if (e.key === 'Enter' && filteredCompletions.length > 0) {
          e.preventDefault();
          updateParameter(param.name, filteredCompletions[selectedIdx], true);
          setCompletionSearchText((prev) => ({ ...prev, [param.name]: '' }));
          setSelectedCompletionIndex((prev) => ({ ...prev, [param.name]: 0 }));
          setActiveParameterIndex(-1); // Close dropdown
        } else if (e.key === 'Escape') {
          setCompletionSearchText((prev) => ({ ...prev, [param.name]: '' }));
          setSelectedCompletionIndex((prev) => ({ ...prev, [param.name]: 0 }));
          setActiveParameterIndex(-1); // Close dropdown
        }
      };

      const handleFocus = () => {
        setActiveParameterIndex(index);
      };

      return (
        <div key={param.name} className="relative" data-param={param.name}>
          <div className="relative">
            {param.type === 'select' && param.options ? (
              <select
                value={String(value)}
                onChange={(e) => updateParameter(param.name, e.target.value)}
                className="h-8 px-2 rounded bg-black/20 text-white text-sm min-w-[100px] focus:outline-none focus:bg-black/30"
                onFocus={handleFocus}
              >
                <option value="">{param.placeholder || 'Select...'}</option>
                {param.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                type={
                  param.type === 'email' ? 'email' : param.type === 'number' ? 'number' : 'text'
                }
                value={String(value)}
                onChange={(e) => updateParameter(param.name, e.target.value)}
                placeholder={param.placeholder}
                className="h-8 px-2 text-sm bg-black/20 border-0 focus:ring-1 focus:ring-orange-500/30 min-w-[100px]"
                onFocus={handleFocus}
                onKeyDown={handleKeyDown}
              />
            )}

            {isLoadingCompletions && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin h-3 w-3 border-2 border-orange-500 border-t-transparent rounded-full"></div>
              </div>
            )}
          </div>

          {paramCompletions.length > 0 && isActive && (
            <div className="absolute bottom-full left-0 mb-2 min-w-[350px] z-50 bg-black/90 backdrop-blur-sm rounded-lg shadow-2xl max-h-80 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-orange-500/10">
                <Sparkles className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-xs font-medium text-gray-300">
                  {filteredCompletions.length} suggestion
                  {filteredCompletions.length !== 1 ? 's' : ''}
                </span>
              </div>
              <Input
                placeholder="Filter..."
                value={searchText}
                onChange={(e) => {
                  setCompletionSearchText((prev) => ({ ...prev, [param.name]: e.target.value }));
                  setSelectedCompletionIndex((prev) => ({ ...prev, [param.name]: 0 }));
                }}
                className="h-8 mx-2 mt-2 mb-1 text-sm bg-black/40 border-0 focus:ring-1 focus:ring-orange-500/30"
                autoFocus
              />
              <div className="max-h-56 overflow-y-auto px-2 pb-2">
                {filteredCompletions.length > 0 ? (
                  filteredCompletions.map((completion, idx) => (
                    <div
                      key={idx}
                      className={`px-3 py-2 rounded cursor-pointer text-sm text-white transition-all ${
                        idx === selectedIdx ? 'bg-orange-500/20' : 'hover:bg-white/5'
                      }`}
                      onClick={() => {
                        updateParameter(param.name, completion, true);
                        setCompletionSearchText((prev) => ({ ...prev, [param.name]: '' }));
                        setSelectedCompletionIndex((prev) => ({ ...prev, [param.name]: 0 }));
                        setActiveParameterIndex(-1);
                      }}
                      onMouseEnter={() =>
                        setSelectedCompletionIndex((prev) => ({ ...prev, [param.name]: idx }))
                      }
                    >
                      {completion}
                    </div>
                  ))
                ) : (
                  <div className="px-2 py-6 text-center text-xs text-gray-500">No matches</div>
                )}
              </div>
            </div>
          )}

          {completionError && (
            <div className="absolute top-full left-0 mt-2 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded">
              {completionError}
            </div>
          )}
        </div>
      );
    };

    const renderTemplateView = () => {
      if (!selectedTemplate) return null;

      const parts = selectedTemplate.template.split(/(\{[^}]+\})/);

      return (
        <div className="rounded-lg bg-orange-500/5 p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-orange-400 shrink-0" />
              <span className="font-semibold text-orange-400">{selectedTemplate.name}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearTemplate}
              className="h-7 px-2 text-gray-400 hover:text-white text-xs"
            >
              ✕
            </Button>
          </div>

          {/* Parameters */}
          <div className="flex flex-wrap items-center gap-2">
            {parts.map((part, index) => {
              const paramMatch = part.match(/\{([^}]+)\}/);
              if (paramMatch) {
                const paramName = paramMatch[1];
                const param = selectedTemplate.parameters.find((p) => p.name === paramName);

                if (param) {
                  const paramIndex = selectedTemplate.parameters.findIndex(
                    (p) => p.name === paramName,
                  );
                  return (
                    <div key={index} className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">{param.name}:</span>
                      {renderParameterInput(param, paramIndex)}
                      {param.required && !parameterValues[param.name] && (
                        <span className="text-red-400 text-xs">*</span>
                      )}
                    </div>
                  );
                }
              }
              return null;
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSubmit}
              disabled={!isSubmitReady() || disabled}
              size="sm"
              className="h-9 px-6 font-medium"
              style={{ backgroundColor: '#FD6731' }}
            >
              <Send className="h-3.5 w-3.5 mr-2" />
              Send Prompt
            </Button>
            {selectedTemplate.parameters.filter((p) => p.required).length > 0 && (
              <span className="text-xs text-gray-500">
                <span className="text-red-400">*</span> Required
              </span>
            )}
          </div>
        </div>
      );
    };

    return (
      <div ref={containerRef} className={`relative w-full ${className}`}>
        {selectedTemplate ? (
          renderTemplateView()
        ) : (
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Input
                  ref={ref || inputRef}
                  value={inputValue}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  disabled={disabled}
                  className="h-12 text-base pr-24 border-2"
                  style={{
                    backgroundColor: '#1a1a1a',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                  }}
                />

                {ghostText && (
                  <div className="absolute inset-0 flex items-center px-3 pointer-events-none overflow-hidden">
                    <div className="relative w-full overflow-hidden">
                      <span className="invisible whitespace-pre">{inputValue}</span>
                      <span className="absolute left-0 top-0 text-transparent whitespace-pre overflow-hidden">
                        {inputValue}
                        <span className="text-gray-500">{ghostText}</span>
                      </span>
                    </div>
                  </div>
                )}

                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                  {ghostText && (
                    <Badge variant="secondary" className="text-xs">
                      Tab to complete
                    </Badge>
                  )}
                  {/* Magic button hidden per user request */}
                  {/* <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 bg-orange-500 hover:bg-orange-600 text-white"
                                    disabled={disabled}
                                    onClick={() => {
                                        setIsPromptDropdownOpen(!isPromptDropdownOpen);
                                        setPromptSearchText('');
                                    }}
                                >
                                    <Sparkles className="h-4 w-4" />
                                </Button> */}
                </div>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!isSubmitReady() || disabled}
                size="default"
                className="h-12 min-w-[100px]"
                style={{ backgroundColor: '#FD6731', borderColor: '#FD6731' }}
              >
                <Send className="h-5 w-5 mr-2" />
                Send
              </Button>
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-black/90 backdrop-blur-sm rounded-lg shadow-2xl p-3 max-h-80 overflow-hidden">
                <div className="flex items-center gap-2 mb-2 pb-2">
                  <Sparkles className="h-3.5 w-3.5 text-orange-400" />
                  <span className="text-xs font-medium text-gray-300">
                    Suggestions ({suggestions.length})
                  </span>
                </div>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {suggestions.map((template) => (
                    <div
                      key={template.id}
                      onClick={() => selectTemplate(template)}
                      className="p-2 rounded cursor-pointer hover:bg-orange-500/10 transition-all"
                    >
                      <div className="font-medium text-sm text-white">{template.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{template.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isPromptDropdownOpen && promptTemplates.length > 0 && (
              <div
                ref={promptDropdownRef}
                className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-black/90 backdrop-blur-sm rounded-lg shadow-2xl p-4 max-h-[600px] overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center gap-2 mb-3 pb-2">
                  <Sparkles className="h-4 w-4 text-orange-400" />
                  <div>
                    <div className="text-sm font-semibold text-white">Smart Prompts</div>
                    <div className="text-xs text-gray-500">{promptTemplates.length} available</div>
                  </div>
                </div>

                {/* Search */}
                <Input
                  placeholder="Search..."
                  value={promptSearchText}
                  onChange={(e) => setPromptSearchText(e.target.value)}
                  className="h-9 mb-3 text-sm bg-black/40 border-0 focus:ring-1 focus:ring-orange-500/30"
                  autoFocus
                />

                {/* Categorized Prompts */}
                <div
                  className="max-h-[450px] overflow-y-auto pr-2"
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#404040 #1a1a1a',
                  }}
                >
                  {(() => {
                    const filteredTemplates = promptTemplates.filter((template) => {
                      if (!promptSearchText) return true;
                      const search = promptSearchText.toLowerCase();
                      return (
                        template.name.toLowerCase().includes(search) ||
                        template.description.toLowerCase().includes(search) ||
                        template.triggerWords.some((w) => w.toLowerCase().includes(search)) ||
                        (template.category || '').toLowerCase().includes(search)
                      );
                    });

                    if (filteredTemplates.length === 0) {
                      return (
                        <div className="text-center text-gray-500 py-12 text-sm">
                          <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-20" />
                          <div>No prompts found</div>
                          <div className="text-xs mt-1">Try a different search term</div>
                        </div>
                      );
                    }

                    // Group by category
                    const grouped: Record<string, typeof promptTemplates> = {};
                    filteredTemplates.forEach((template) => {
                      const category = template.category || 'Other';
                      if (!grouped[category]) {
                        grouped[category] = [];
                      }
                      grouped[category].push(template);
                    });

                    return Object.entries(grouped).map(([category, templates]) => (
                      <div key={category} className="mb-3 last:mb-0">
                        <div className="text-xs font-semibold text-orange-400 mb-1.5 px-1">
                          {category}
                        </div>
                        <div className="space-y-1">
                          {templates.map((template) => (
                            <div
                              key={template.id}
                              onClick={() => {
                                selectTemplate(template);
                                setIsPromptDropdownOpen(false);
                              }}
                              className="p-2 rounded cursor-pointer hover:bg-orange-500/10 transition-all"
                            >
                              <div className="font-medium text-sm text-white mb-0.5">
                                {template.name}
                              </div>
                              {template.description && (
                                <div className="text-xs text-gray-500 line-clamp-1">
                                  {template.description}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);

ConversationalPromptInput.displayName = 'ConversationalPromptInput';

export default ConversationalPromptInput;
