import { useCallback, useState } from "react";
import { toFailure } from "@/lib/ipc";

/** The plain sentence of an error: a raw text gets the sentence of its error code. */
export const message = (e: unknown) => toFailure(e).message;

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
			const f = toFailure(e);
			setError(f.message);
			setFailure(f);
			return false;
		} finally {
			setPending((n) => n - 1);
		}
	}, []);
	// A sentence of the interface replaces the last failure.
	const setSentence = useCallback((m: string | null) => {
		setError(m);
		setFailure(null);
	}, []);
	return { error, failure, setError: setSentence, busy: pending > 0, run };
}
