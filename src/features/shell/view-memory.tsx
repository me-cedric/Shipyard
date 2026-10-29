import { useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { commands, unwrap } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";

/**
 * Keeps the last view of each project (shell REQ-015). The first project that loads at start
 * goes back to its last view. A switch sets its own view, so the write skips that first path.
 */
export function ViewMemory() {
	const active = useActiveProject().data;
	const pathname = useLocation({ select: (l) => l.pathname });
	const router = useRouter();
	const seen = useRef<string | undefined>(undefined);
	const id = active?.id;
	const lastView = active?.lastView;

	useEffect(() => {
		if (!id) {
			seen.current = undefined;
			return;
		}
		if (seen.current !== id) {
			const atStart = seen.current === undefined;
			seen.current = id;
			if (atStart && lastView && lastView !== pathname) router.history.push(lastView);
			return;
		}
		unwrap(commands.projectsSetView(id, pathname)).catch((e) => console.error(e));
	}, [id, lastView, pathname, router]);

	return null;
}
