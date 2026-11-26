import { useRouter, useRouterState } from "@tanstack/react-router";
import { type ComponentProps, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Fold as Shared, valueClass } from "@/ui/molecules/fold";

export { valueClass };

/**
 * One row of a Setup card that opens in place: the label, and the value or the action as a button.
 * The fields of the setting are under the row. An address that names a field inside opens the fold
 * (`arriveAt`).
 */
export function Fold(props: Omit<ComponentProps<typeof Shared>, "fields" | "className">) {
	const ref = useRef<HTMLDetailsElement>(null);
	const hash = useRouterState({ select: (s) => s.location.hash });
	// An address that names the fold or a field inside it (`#section-personas`) opens the fold.
	useEffect(() => {
		const el = ref.current;
		if (el && hash && (el.id === hash || el.querySelector(`[id="${CSS.escape(hash)}"]`)))
			el.open = true;
	}, [hash]);
	return (
		<Shared
			ref={ref}
			fields
			className="border-n-6 border-b last:border-b-0 [[role=group]+&]:border-t [a+&]:border-t"
			{...props}
		/>
	);
}

/** A link with the look of a button. It opens an address of the app. */
export function ButtonLink({
	href,
	primary,
	mono,
	className,
	...props
}: ComponentProps<"a"> & { href: string; primary?: boolean; mono?: boolean }) {
	const router = useRouter();
	return (
		<a
			href={href}
			onClick={(e) => {
				e.preventDefault();
				router.history.push(href);
			}}
			className={cn(valueClass({ primary, mono }), className)}
			{...props}
		/>
	);
}
