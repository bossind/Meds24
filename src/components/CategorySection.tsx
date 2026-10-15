import React from 'react';
import { Category } from '../types';
import { Pill, Activity, Sparkles, Leaf, Baby, Stethoscope } from 'lucide-react';

interface CategorySectionProps {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (slug: string) => void;
}

const getCategoryIcon = (iconName?: string) => {
  switch (iconName) {
    case 'Pill': return <Pill className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />;
    case 'Activity': return <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />;
    case 'Sparkles': return <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />;
    case 'Leaf': return <Leaf className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />;
    case 'Baby': return <Baby className="w-5 h-5 sm:w-6 sm:h-6 text-pink-600" />;
    case 'Stethoscope': return <Stethoscope className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />;
    default: return <Pill className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />;
  }
};

export const CategorySection: React.FC<CategorySectionProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
}) => {
  return (
    <section id="categories" className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 overflow-hidden">
      <div className="flex justify-between items-center mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Top Categories</h2>
          <p className="text-xs sm:text-sm text-slate-500">Explore medicines and healthcare essentials by category</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* All Categories Option */}
        <button
          onClick={() => onSelectCategory('all')}
          className={`p-3.5 sm:p-5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 sm:gap-4 min-w-0 ${
            selectedCategory === 'all'
              ? 'bg-emerald-50 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm hover:shadow'
          }`}
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <Pill className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-700" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 text-xs sm:text-sm truncate">All Products</h3>
            <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">Browse catalog</p>
          </div>
        </button>

        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.slug;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.slug)}
              className={`p-3.5 sm:p-5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 sm:gap-4 min-w-0 ${
                isSelected
                  ? 'bg-emerald-50 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm hover:shadow'
              }`}
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                {getCategoryIcon(cat.icon)}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm truncate">{cat.name}</h3>
                <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">{cat.description || 'Explore items'}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
