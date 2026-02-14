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
          tab.activeClassName ?? 'bg-white/10 text-white border border-white/10';
        const inactiveClassName =
          tab.inactiveClassName ??
          'text-gray-400 border border-white/10 hover:text-white hover:bg-white/5';

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={[
              'flex items-center gap-2 h-10 px-4 rounded-full text-sm transition-colors',
              isActive ? activeClassName : inactiveClassName,
            ].join(' ')}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span
                className={[
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  isActive
                    ? tab.countClassName ?? 'bg-black/20 text-current'
                    : 'bg-white/10 text-gray-300',
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

