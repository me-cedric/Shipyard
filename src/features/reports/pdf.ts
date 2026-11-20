import { useQuery } from "@tanstack/react-query";
import { commands } from "@/lib/ipc";

/** The PDF of a report works on macOS first, with the print path of the decks (`spec:library-functions#REQ-006`). */
export function usePdfAvailable(): boolean {
	const os = useQuery({
		queryKey: ["app", "info"],
		queryFn: () => commands.appInfo(),
		staleTime: Number.POSITIVE_INFINITY,
	}).data?.os;
	return os === "macos";
}
