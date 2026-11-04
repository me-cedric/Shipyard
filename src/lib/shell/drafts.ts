import { useEffect, useId } from "react";
import { commands, unwrap } from "@/lib/ipc";

// The editors that hold an unsaved draft now. The close guard of the window counts them.
const open = new Set<string>();

const sync = () => void unwrap(commands.closeGuardDrafts(open.size)).catch(() => {});

/** Counts this editor in the close guard while `dirty` is true. */
export function useDraftCount(dirty: boolean) {
	const id = useId();
	useEffect(() => {
		if (!dirty) return;
		open.add(id);
		sync();
		return () => {
			open.delete(id);
			sync();
		};
	}, [dirty, id]);
}
