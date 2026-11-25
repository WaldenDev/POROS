export type SearchFilters = {
  min_stars: number | null;
  language: string | null;
  pushed_days: 30 | 90 | 180 | 365 | null;
};

export const DEFAULT_FILTERS: SearchFilters = {
  min_stars: null,
  language: null,
  pushed_days: null,
};

export function sameFilters(a: SearchFilters, b: SearchFilters) {
  return (
    a.min_stars === b.min_stars &&
    a.language === b.language &&
    a.pushed_days === b.pushed_days
  );
}
