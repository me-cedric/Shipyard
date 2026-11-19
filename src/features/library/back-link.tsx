import { Link } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useState,
} from "react";
import { useI18n } from "@/lib/i18n";
import { BackLink } from "@/ui/molecules/back-link";
import { noteOpened } from "./recent";

/** The link to the doors of Library. */
export function LibraryBackLink() {
	const { t } = useI18n();
	return (
		<BackLink label={t.library.back} render={(props) => <Link to="/library/home" {...props} />} />
	);
}

/** A page that draws the way back in its own header claims it here; the result releases it. */
const BackClaimContext = createContext<(() => () => void) | null>(null);

/** Tells the frame that this page draws the way back in its page header. */
export function useLibraryBackClaim() {
	const claim = useContext(BackClaimContext);
	useLayoutEffect(() => claim?.(), [claim]);
}

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
