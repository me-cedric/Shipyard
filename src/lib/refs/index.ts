import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { commands, unwrap } from "@/lib/ipc";
import { setHitQuery } from "./query";

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

export { foldWords, setHitQuery, snippetParts, useHitQuery } from "./query";

export function useRefSearch(query: string, limit = 8) {
	return useQuery({
		queryKey: ["refs", "search", query, limit],
		queryFn: () => unwrap(commands.refsSearch(query, limit)),
		enabled: query !== "",
		placeholderData: (prev) => prev,
	});
}

/** The filter box of a list: the refs that match the text, or `null` for no filter. */
export function useRefFilter() {
	const [text, setText] = useState("");
	const q = text.trim();
	const found = useRefSearch(q, 500).data;
	useEffect(() => {
		// An empty box leaves the query of the palette alone.
		if (!q) return;
		setHitQuery(q);
		return () => setHitQuery("");
	}, [q]);
	return { text, setText, refs: q && found ? new Set(found.map((h) => h.ref)) : null };
}
