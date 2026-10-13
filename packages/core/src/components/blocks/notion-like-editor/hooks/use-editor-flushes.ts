import { useCallback, useRef } from "react";
import type { Operation } from "platejs";
import { useEditorSelector } from "platejs/react";

// Re-renders its caller once per editor flush and hands over every operation
// flushed since the last `take`. A flush can land before React commits, so a
// caller that read only the latest batch would miss the operations of an
// earlier one. `version` changes on every flush, so it is safe as an effect key.
export function useEditorFlushes(): { version: number; take: () => Operation[] } {
  const pending = useRef<Operation[]>([]);
  const flushes = useRef(0);
  const version = useEditorSelector(
    (instance) => {
      for (const operation of instance.operations) {
        pending.current.push(operation);
      }
      flushes.current += 1;
      return flushes.current;
    },
    [],
    { equalityFn: () => false },
  );
  const take = useCallback((): Operation[] => {
    const operations = pending.current;
    pending.current = [];
    return operations;
  }, []);
  return { version, take };
}
