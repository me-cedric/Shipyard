import { useCallback, useState } from "react";

export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Runs a write. The reason of a failure shows in `error`, and the next run clears it. `failure` is
 * the thrown error: give it to `ErrorNotice` to show the action of the error. `busy` is true while a
 * run is in progress: give it to `Button busy`.
 */
export function useGuard() {
	const [error, setError] = useState<string | null>(null);
	const [failure, setFailure] = useState<unknown>(null);
	const [pending, setPending] = useState(0);
	const run = useCallback(async (job: () => Promise<unknown>) => {
		setPending((n) => n + 1);
		try {
			setError(null);
			setFailure(null);
			await job();
			return true;
		} catch (e) {
			setError(message(e));
			setFailure(e);
			return false;
		} finally {
			setPending((n) => n - 1);
		}
	}, []);
	return { error, failure, setError, busy: pending > 0, run };
}
