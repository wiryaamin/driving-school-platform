import { RESURSER_ITEMS } from '../lib/supportItems.js';
import { SupportActionCard } from '../components/SupportActionCard.js';

export function ResurserPage() {
  return (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {RESURSER_ITEMS.map((item) => (
          <SupportActionCard key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}
