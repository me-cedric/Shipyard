import { useCallback, useState } from "react";

/**
 * Runs a write. The reason of a failure shows in `error`, and the next run clears it. `failure` is
 * the thrown error: give it to `ErrorNotice` to show the action of the error.
 */
export function useGuard() {
	const [error, setError] = useState<string | null>(null);
	const [failure, setFailure] = useState<unknown>(null);
	const run = useCallback(async (job: () => Promise<unknown>) => {
		try {
			setError(null);
			setFailure(null);
			await job();
			return true;
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setFailure(e);
			return false;
		}
	}, []);
	return { error, failure, setError, run };
}
