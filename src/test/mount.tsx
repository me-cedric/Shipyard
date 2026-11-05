import { RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { Providers } from "@/app/providers";
import { createAppRouter, createMemoryHistory } from "@/app/router";
import { routers } from "./routers";

/** The whole app on a memory history. The mock IPC serves the commands. */
export function mountApp(path: string) {
	const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
	// `src/test/setup.ts` waits for these routers after each test.
	routers().push(router);
	render(
		<Providers>
			<RouterProvider router={router} />
		</Providers>,
	);
	return router;
}
