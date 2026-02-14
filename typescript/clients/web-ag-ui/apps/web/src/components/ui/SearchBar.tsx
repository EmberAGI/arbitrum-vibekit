import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Search' }: SearchBarProps) {
  return (
    <div className="flex-1 relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 pl-11 pr-4 rounded-full bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:border-[color:var(--hire-accent)] focus:ring-2 focus:ring-[color:var(--hire-accent-soft)] transition-colors"
      />
    </div>
  );
}
