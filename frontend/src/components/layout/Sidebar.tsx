import type { AppView, EmailCategory, UserProfile } from '@/types/email';
import { formatTimestamp } from '@/utils/formatters';

interface CategoryItem {
  key: EmailCategory;
  label: string;
  count: number;
}

interface ViewItem {
  key: AppView;
  label: string;
  description: string;
}

interface SidebarProps {
  user?: UserProfile;
  activeView: AppView;
  views: ViewItem[];
  onViewChange: (view: AppView) => void;
  categories: CategoryItem[];
  activeCategory: EmailCategory;
  onCategoryChange: (category: EmailCategory) => void;
  lastSyncAt?: string;
}

export function Sidebar({
  user,
  activeView,
  views,
  onViewChange,
  categories,
  activeCategory,
  onCategoryChange,
  lastSyncAt,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">EF</div>
        <div>
          <p className="eyebrow">Smart workspace</p>
          <h2>EmailFlow AI</h2>
        </div>
      </div>

      <nav className="sidebar-nav">
        {views.map((view) => (
          <button
            key={view.key}
            type="button"
            className={`nav-item ${activeView === view.key ? 'active' : ''}`}
            onClick={() => onViewChange(view.key)}
          >
            <strong>{view.label}</strong>
            <span>{view.description}</span>
          </button>
        ))}
      </nav>

      <section className="sidebar-section">
        <p className="eyebrow">Queues</p>
        <div className="queue-list">
          {categories.map((category) => (
            <button
              key={category.key}
              type="button"
              className={`queue-item ${activeCategory === category.key ? 'active' : ''}`}
              onClick={() => onCategoryChange(category.key)}
            >
              <span>{category.label}</span>
              <strong>{category.count}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar-profile">
        <p className="eyebrow">Operator profile</p>
        <strong>{user?.name ?? 'Loading profile...'}</strong>
        <p>{user?.role ?? 'AI email coordinator'}</p>
        <dl>
          <div>
            <dt>Plan</dt>
            <dd>{user?.plan ?? 'PRO'}</dd>
          </div>
          <div>
            <dt>Hours saved</dt>
            <dd>{user?.timeSavedHours ?? 0}/wk</dd>
          </div>
          <div>
            <dt>Response streak</dt>
            <dd>{user?.responseStreak ?? 0} days</dd>
          </div>
        </dl>
      </section>

      <p className="sidebar-footnote">
        Last sync {lastSyncAt ? formatTimestamp(lastSyncAt) : 'pending'}
      </p>
    </aside>
  );
}
