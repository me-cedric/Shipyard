import { useState } from "react";
import { message, useDesignActions } from "@/lib/design";

/** Opens a target outside the app. A refusal shows in `error`. */
export function useOpenOutside() {
	const act = useDesignActions();
	const [error, setError] = useState<string | null>(null);
	return {
		error,
		open: (target: string) =>
			act
				.open(target)
				.then(() => setError(null))
				.catch((e) => setError(message(e))),
	};
}
