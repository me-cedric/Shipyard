import { useRouter, useRouterState } from "@tanstack/react-router";
import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/ui/atoms/button";

/** The look of a button on a link or on the summary of a fold. */
export const valueClass = (o?: { mono?: boolean; primary?: boolean }) =>
	cn(
		buttonVariants({ variant: o?.primary ? "primary" : "secondary" }),
		"min-w-0 shrink",
		o?.mono && "font-mono text-ui font-normal",
	);

/**
 * One row of a Setup card that opens in place: the label, and the value or the action as a button.
 * The fields of the setting are under the row. An address that names a field inside opens the fold
 * (`arriveAt`).
 */
export function Fold({
	id,
	label,
	value,
	mono,
	hint,
	plain,
	children,
}: {
	/** The anchor of the row (`#id`). */
	id?: string;
	label: ReactNode;
	/** The text of the button: the value of the setting, or an action such as "Edit". */
	value: ReactNode;
	mono?: boolean;
	/** A quiet value that shows before the button, such as an address. */
	hint?: ReactNode;
	/** The value is a status, not a button: it has no button look. */
	plain?: boolean;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDetailsElement>(null);
	const hash = useRouterState({ select: (s) => s.location.hash });
	// An address that names the fold or a field inside it (`#section-personas`) opens the fold.
	useEffect(() => {
		const el = ref.current;
		if (el && hash && (el.id === hash || el.querySelector(`[id="${CSS.escape(hash)}"]`)))
			el.open = true;
	}, [hash]);
	return (
		<details
			ref={ref}
			id={id}
			className="border-n-6 border-b last:border-b-0 [[role=group]+&]:border-t [a+&]:border-t"
		>
			<summary className="flex min-h-15 cursor-pointer list-none flex-wrap items-center gap-3 px-6 py-2 text-n-12 [&::-webkit-details-marker]:hidden">
				<span className="min-w-0 flex-[1_1_10rem] font-semibold">{label}</span>
				{hint ? (
					<span className="min-w-0 flex-[1_1_0%] truncate text-right font-mono text-ui text-n-11">
						{hint}
					</span>
				) : null}
				<span className={cn(plain ? "" : valueClass({ mono }), !hint && "ml-auto", "truncate")}>
					{value}
				</span>
			</summary>
			<div className="flex flex-col gap-3 px-6 pt-1 pb-5">{children}</div>
		</details>
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
