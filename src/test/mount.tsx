import { RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { Providers } from "@/app/providers";
import { createAppRouter, createMemoryHistory } from "@/app/router";

/** The whole app on a memory history. The mock IPC serves the commands. */
export function mountApp(path: string) {
	const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
	render(
		<Providers>
			<RouterProvider router={router} />
		</Providers>,
	);
	return router;
}
