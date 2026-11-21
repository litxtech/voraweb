import { useEffect, useMemo, useState } from 'react';

import { VV_CATEGORY_FALLBACK } from '@/features/vora-video/constants';
import { loadVvCategories } from '@/features/vora-video/services/api';
import type { VvCategoryRow } from '@/features/vora-video/types';

/** Sunucudaki aktif kategoriler; yüklenene kadar yerel yedek liste gösterilir. */
export function useVvCategories(): VvCategoryRow[] {
  const fallback = useMemo<VvCategoryRow[]>(
    () =>
      VV_CATEGORY_FALLBACK.map((category, index) => ({
        id: category.id as string,
        label: category.label as string,
        description: null,
        icon: category.icon as string,
        sort_order: (index + 1) * 10,
      })),
    [],
  );
  const [categories, setCategories] = useState<VvCategoryRow[]>(fallback);

  useEffect(() => {
    let active = true;
    void loadVvCategories().then((result) => {
      if (active && result.data && result.data.length > 0) setCategories(result.data);
    });
    return () => {
      active = false;
    };
  }, []);

  return categories;
}
