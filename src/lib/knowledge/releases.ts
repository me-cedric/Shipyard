import { useWorkItems } from "@/lib/sync";
import { useReleases as useWorkReleases } from "@/lib/work";

export type Release = { name: string; keys: string[] };

/**
 * The releases of the issue tracker with the keys of their tickets (`spec:library-functions#REQ-010`):
 * `work_releases` and the release of each ticket (`spec:code-host-tickets#REQ-004`). With no release
 * the picker stays hidden.
 */
export function useReleases(): Release[] {
	const names = useWorkReleases().data ?? [];
	const items = useWorkItems({}).data ?? [];
	return names.map((name) => ({
		name,
		keys: items.filter((i) => i.release === name).map((i) => i.key),
	}));
}
