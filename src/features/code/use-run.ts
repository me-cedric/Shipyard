import { useCallback, useState } from "react";
import { message } from "./project-gate";

/** Runs a git action. `busy` is true while a run is in progress: give it to `Button busy`. A refusal keeps its reason in `error`, and the thrown error in `failure`: give it to `ErrorNotice` to show the action. */
export function useRun() {
	const [error, setError] = useState<string | null>(null);
	const [failure, setFailure] = useState<unknown>(null);
	const [pending, setPending] = useState(0);
	const run = useCallback(async (job: () => Promise<unknown>) => {
		setPending((n) => n + 1);
		setError(null);
		setFailure(null);
		try {
			await job();
		} catch (e) {
			setError(message(e));
			setFailure(e);
		} finally {
			setPending((n) => n - 1);
		}
	}, []);
	return { error, failure, busy: pending > 0, run };
}
