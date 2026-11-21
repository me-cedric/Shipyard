import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useActiveProject } from "@/lib/projects";

export type Release = { name: string; keys: string[] };

/**
 * The releases of the issue tracker with the keys of their tickets (`spec:library-functions#REQ-010`).
 * seam: `releases_list` exists in the mock only. When `spec:code-host-tickets#REQ-004` is merged,
 * read `workReleases` and the release of each ticket instead. Without the command the list is empty
 * and the picker stays hidden.
 */
export function useReleases(): Release[] {
	const active = useActiveProject().data;
	const q = useQuery({
		queryKey: ["knowledge", "releases"],
		queryFn: () => invoke<Release[]>("releases_list").catch(() => [] as Release[]),
		enabled: !!active,
	});
	return q.data ?? [];
}
