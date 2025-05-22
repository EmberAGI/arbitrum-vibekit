"use client";
import { useState } from "react";

interface ChipToggleProps {
  options: { value: string; label: string }[];
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export function ChipToggle({
  options,
  defaultValue,
  onValueChange,
}: ChipToggleProps) {
  const [selectedValue, setSelectedValue] = useState<string | undefined>(
    defaultValue
  );

  const handleSelect = (value: string) => {
    console.log("val", value);
    setSelectedValue(value);
    onValueChange?.(value);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selectedValue === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSelect(option.value)}
            className={`
              rounded-full px-4 py-2 text-sm font-medium transition-colors
              border border-gray-200 
              ${
                isSelected
                  ? "bg-orange-500 text-white"
                  : " bg-gray-900 text-white hover:bg-gray-100"
              }
            `}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
