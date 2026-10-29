import { useQuery } from "@tanstack/react-query";
import { commands, unwrap } from "@/lib/ipc";

/** The Rust grammar parses the text. The app holds no copy of it. */
export function useParsedRef(text: string) {
	return useQuery({
		queryKey: ["refs", "parse", text],
		queryFn: () => commands.refsParse(text),
		enabled: text !== "",
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useResolvedRef(ref: string | null) {
	return useQuery({
		queryKey: ["refs", "resolve", ref],
		queryFn: () => unwrap(commands.refsResolve(ref ?? "")),
		enabled: ref !== null,
	});
}

export function useBacklinks(ref: string | null) {
	return useQuery({
		queryKey: ["refs", "backlinks", ref],
		queryFn: () => unwrap(commands.refsBacklinks(ref ?? "")),
		enabled: ref !== null,
	});
}

export function useRefSearch(query: string) {
	return useQuery({
		queryKey: ["refs", "search", query],
		queryFn: () => unwrap(commands.refsSearch(query, 8)),
		enabled: query !== "",
		placeholderData: (prev) => prev,
	});
}
