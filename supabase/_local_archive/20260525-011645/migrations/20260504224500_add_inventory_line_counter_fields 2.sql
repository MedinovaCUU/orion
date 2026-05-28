BEGIN;

ALTER TABLE public.inventory_count_lines
  ADD COLUMN IF NOT EXISTS counted_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS counted_by_name TEXT;

UPDATE public.inventory_count_lines AS line
SET
  counted_by_id = COALESCE(line.counted_by_id, count.counted_by_id),
  counted_by_name = COALESCE(line.counted_by_name, count.counted_by_name, count.captured_by_name)
FROM public.inventory_counts AS count
WHERE count.id = line.inventory_count_id
  AND (
    line.counted_by_id IS NULL
    OR NULLIF(trim(COALESCE(line.counted_by_name, '')), '') IS NULL
  );

CREATE INDEX IF NOT EXISTS inventory_count_lines_counted_by_id_idx
  ON public.inventory_count_lines (counted_by_id);

COMMIT;
