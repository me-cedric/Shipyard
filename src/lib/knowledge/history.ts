import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commands, unwrap } from "@/lib/ipc";

/** The commits that changed one page of the project, newest first (`spec:library-functions#REQ-002`). */
export function usePageHistory(path: string) {
	return useQuery({
		queryKey: ["knowledge", "history", path],
		queryFn: () => unwrap(commands.pageHistory(path)),
	});
}

/** The text of a page at a commit. Idle until `sha` is set. */
export function usePageVersion(path: string, sha: string | null) {
	return useQuery({
		queryKey: ["knowledge", "history", path, sha],
		queryFn: () => unwrap(commands.pageVersion(path, sha ?? "")),
		enabled: sha !== null,
	});
}

/** Writes an earlier version into the page. It commits nothing: the page and the changes are read again. */
export function useRestorePage(path: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (sha: string) => unwrap(commands.pageRestore(path, sha, true)),
		onSuccess: () =>
			Promise.all(
				[["knowledge"], ["specs"], ["refs"], ["code"], ["git"]].map((queryKey) =>
					qc.invalidateQueries({ queryKey }),
				),
			),
	});
}
