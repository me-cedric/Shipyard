import { useCallback, useState } from "react";
import { message } from "./project-gate";

/** Runs a git action. A refusal keeps its reason in `error` for the view to show. */
export function useRun() {
	const [error, setError] = useState<string | null>(null);
	const run = useCallback(async (job: () => Promise<unknown>) => {
		setError(null);
		try {
			await job();
		} catch (e) {
			setError(message(e));
		}
	}, []);
	return { error, run };
}
