import { useQuery } from "@tanstack/react-query";
import { commands, unwrap } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";

/** The documents that hold the text, each with its first line that does. */
export function useDocSearch(query: string) {
	const active = Boolean(useActiveProject().data);
	const text = query.trim();
	return useQuery({
		queryKey: ["knowledge", "search", text],
		queryFn: () => unwrap(commands.docSearch(text)),
		enabled: active && text.length > 0,
	});
}

/** The `.docx` files of the documents folder. */
export function useDocxList() {
	const active = Boolean(useActiveProject().data);
	return useQuery({
		queryKey: ["knowledge", "docx"],
		queryFn: () => unwrap(commands.docDocxList()),
		enabled: active,
	});
}

/** The paragraphs of one `.docx` file. */
export function useDocx(path: string) {
	return useQuery({
		queryKey: ["knowledge", "docx", path],
		queryFn: () => unwrap(commands.docDocxRead(path)),
		retry: false,
	});
}
