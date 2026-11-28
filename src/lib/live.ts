import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicState } from "@/lib/exam.functions";

/** Shared exam status, refreshed every few seconds so every screen stays in sync. */
export function usePublicState(enabled = true) {
  const fn = useServerFn(getPublicState);
  return useQuery({ queryKey: ["public-state"], queryFn: () => fn(), enabled, staleTime: 8000, refetchInterval: enabled ? 12000 : false });
}
