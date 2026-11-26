import { type ReactNode, useCallback, useEffect, useState } from "react";
import { BackClaimContext, LibraryBackLink } from "@/ui/templates/library-page";
import { noteOpened } from "./recent";

/**
 * The way back to the doors (`spec:app-redesign#REQ-020`). A page built on `LibraryPage` draws it
 * in its page header. For a page that does not, the link shows above the page.
 */
export function LibraryBack({ slug, children }: { slug?: string; children: ReactNode }) {
	const [claims, setClaims] = useState(0);
	const claim = useCallback(() => {
		setClaims((c) => c + 1);
		return () => setClaims((c) => c - 1);
	}, []);
	// The home lists the pages that the person opened last.
	useEffect(() => {
		if (slug && slug !== "home") noteOpened(slug);
	}, [slug]);
	return (
		<BackClaimContext.Provider value={claim}>
			{slug && slug !== "home" && !claims ? (
				<div className="flex shrink-0 px-4 pt-3">
					<LibraryBackLink />
				</div>
			) : null}
			{children}
		</BackClaimContext.Provider>
	);
}
