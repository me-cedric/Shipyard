import { RouterProvider } from "@tanstack/react-router";
import { Providers } from "./providers";
import { createAppRouter } from "./router";

const router = createAppRouter();

export function App() {
	return (
		<Providers>
			<RouterProvider router={router} />
		</Providers>
	);
}
