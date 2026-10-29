import { useCallback, useState } from "react";

export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Runs a write. The reason of a failure shows in `error`, and the next run clears it. */
export function useGuard() {
	const [error, setError] = useState<string | null>(null);
	const run = useCallback(async (job: () => Promise<unknown>) => {
		try {
			setError(null);
			await job();
			return true;
		} catch (e) {
			setError(message(e));
			return false;
		}
	}, []);
	return { error, setError, run };
}
