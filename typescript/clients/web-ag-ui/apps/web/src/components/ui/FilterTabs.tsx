interface FilterTab {
  id: string;
  label: string;
  count?: number;
  activeClassName?: string;
  inactiveClassName?: string;
  countClassName?: string;
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
        const activeClassName =
          tab.activeClassName ?? 'bg-[#F0E2D2] text-[#241813] border border-[#DDC8B3]';
        const inactiveClassName =
          tab.inactiveClassName ??
          'text-[#7B6758] border border-[#DDC8B3] hover:text-[#241813] hover:bg-[#FFF8F0]';

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={[
              'flex items-center gap-2 h-10 px-4 rounded-full text-[13px] transition-colors',
              isActive ? activeClassName : inactiveClassName,
            ].join(' ')}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span
                className={[
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  isActive
                    ? tab.countClassName ?? 'bg-[#E7D3BE] text-current'
                    : 'bg-[#F4E6D8] text-[#8A6F58]',
                ].join(' ')}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
