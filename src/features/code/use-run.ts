import { useCallback, useState } from "react";
import { message } from "./project-gate";

/** Runs a git action. A refusal keeps its reason in `error`, and the thrown error in `failure`: give it to `ErrorNotice` to show the action. */
export function useRun() {
	const [error, setError] = useState<string | null>(null);
	const [failure, setFailure] = useState<unknown>(null);
	const run = useCallback(async (job: () => Promise<unknown>) => {
		setError(null);
		setFailure(null);
		try {
			await job();
		} catch (e) {
			setError(message(e));
			setFailure(e);
		}
	}, []);
	return { error, failure, run };
}
