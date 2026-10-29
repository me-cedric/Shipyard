import { useQuery } from "@tanstack/react-query";
import { commands, type FileView, unwrap } from "@/lib/ipc";

export type FileText = FileView;

/** The working copy file for the viewer (REQ-036), or the file at `rev`. */
export function useFile(path: string, rev: string | null = null) {
	return useQuery({
		queryKey: ["code", "file", path, rev],
		queryFn: () => unwrap(commands.codeFileRead(path, rev)),
	});
}
