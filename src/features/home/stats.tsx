import { useWorkItems } from "@/lib/sync";
import { useWorkContext } from "@/lib/work";

/** The mirrored items assigned to the person. */
export function useMyItems() {
	const me = useWorkContext().data?.me ?? null;
	return (useWorkItems({}).data ?? []).filter((i) => me !== null && i.member === me);
}
