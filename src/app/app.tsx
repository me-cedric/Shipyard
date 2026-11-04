import { RouterProvider } from "@tanstack/react-router";
import { TrayView } from "@/features/tray";
import { Providers } from "./providers";
import { createAppRouter } from "./router";

const router = createAppRouter();

export function App() {
	return (
		<Providers>
			{/* The menu bar panel loads this front end at /tray, with no shell. */}
			{window.location.pathname === "/tray" ? <TrayView /> : <RouterProvider router={router} />}
		</Providers>
	);
}
