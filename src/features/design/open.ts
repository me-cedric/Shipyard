import { useState } from "react";
import { useDesignActions } from "@/lib/design";

/** Opens a target outside the app. A refusal shows in `error`. */
export function useOpenOutside() {
	const act = useDesignActions();
	const [error, setError] = useState<unknown>(null);
	return {
		error,
		open: (target: string) =>
			act
				.open(target)
				.then(() => setError(null))
				.catch(setError),
	};
}
