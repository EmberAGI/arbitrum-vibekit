interface FilterTab {
  id: string;
  label: string;
  count?: number;
  color?: string;
}

interface FilterTabsProps {
  tabs: FilterTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function FilterTabs({ tabs, activeTab, onTabChange }: FilterTabsProps) {
  return (
    <div className="flex items-center gap-2">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const colorClasses = tab.color
          ? isActive
            ? tab.color
            : 'text-gray-400 hover:text-white'
          : isActive
            ? 'bg-[#2a2a2a] text-white'
            : 'text-gray-400 hover:text-white';

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${colorClasses}`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`px-1.5 py-0.5 rounded text-xs ${
                  isActive && tab.color
                    ? `${tab.color.includes('teal') ? 'bg-teal-500/30' : tab.color.includes('fd6731') ? 'bg-[#fd6731]/30' : 'bg-gray-500/30'}`
                    : 'bg-gray-500/30'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
