import { useCallback, useState } from "react";

/** Runs a write. The reason of a failure shows in `error`, and the next run clears it. */
export function useGuard() {
	const [error, setError] = useState<string | null>(null);
	const run = useCallback(async (job: () => Promise<unknown>) => {
		try {
			setError(null);
			await job();
			return true;
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			return false;
		}
	}, []);
	return { error, setError, run };
}
