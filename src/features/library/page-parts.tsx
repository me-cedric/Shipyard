import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronRightIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { PageHeader, type PageMenuItem } from "@/ui/molecules/page-header";
import { Row, type RowProps } from "@/ui/molecules/row";
import { LibraryBackLink, useLibraryBackClaim } from "./back-link";

/**
 * The frame of a Library page: the way back in the header, the 44 px title, the header actions,
 * the "More" menu, then the body. `back` replaces the link to the doors on a sub-page.
 */
export function LibraryPage({
	title,
	count,
	chips,
	action,
	menu,
	back,
	className,
	children,
}: {
	title: string;
	count?: number;
	chips?: ReactNode;
	/** The header actions, the primary one last. A mode switch goes first. */
	action?: ReactNode;
	menu?: PageMenuItem[];
	/** The way back of a sub-page (a `BackLink`). The default goes to the doors of Library. */
	back?: ReactNode;
	className?: string;
	children?: ReactNode;
}) {
	useLibraryBackClaim();
	return (
		<>
			<PageHeader
				title={title}
				count={count}
				chips={chips}
				action={action}
				menu={menu}
				back={back ?? <LibraryBackLink />}
			/>
			<div className={cn("flex min-w-0 flex-col gap-6 px-4 pb-10", className)}>{children}</div>
		</>
	);
}

/** The columns of a page: they wrap under each other on a narrow window. */
export function PageColumns({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("flex flex-wrap items-start gap-6", className)} {...props} />;
}

/** The left column: one `ListCard` for each item. */
export function ListColumn({ className, ...props }: ComponentProps<"div">) {
	return (
		<div className={cn("flex min-w-0 flex-[1_1_240px] flex-col gap-2.5", className)} {...props} />
	);
}

/** The wide column beside the list: the cards of the open item. */
export function DetailColumn({ className, ...props }: ComponentProps<"div">) {
	return (
		<div className={cn("flex min-w-0 flex-[3_1_520px] flex-col gap-4", className)} {...props} />
	);
}

/** The right column of small cards. */
export function SideCards({ className, ...props }: ComponentProps<"div">) {
	return (
		<div className={cn("flex min-w-0 flex-[1_1_300px] flex-col gap-4", className)} {...props} />
	);
}

export type ListCardProps = {
	className: string;
	children: ReactNode;
	"aria-current"?: "true";
};

/**
 * One item of a list: a white card with the name and its pills under it. The selected one has the
 * accent outline and tint. A button by default (`aria-pressed`); `render` draws a router link
 * (`aria-current`) when the open item is in the address.
 */
export function ListCard({
	name,
	pills,
	selected,
	render,
	className,
	...props
}: {
	name: string;
	/** `Badge` parts under the name. */
	pills?: ReactNode;
	selected?: boolean;
	render?: (props: ListCardProps) => ReactNode;
} & Omit<ComponentProps<"button">, "children">) {
	const look = cn(
		"flex min-h-control w-full cursor-pointer flex-col items-start gap-3 rounded-lg bg-surface-2 p-4.5 text-left text-n-12 shadow-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
		selected && "bg-accent-tint outline-2 outline-accent",
		className,
	);
	const children = (
		<>
			<span className="max-w-full break-words text-17 font-semibold">{name}</span>
			{pills ? <span className="flex flex-wrap gap-1.5">{pills}</span> : null}
		</>
	);
	if (render)
		return render({
			className: look,
			children,
			...(selected ? { "aria-current": "true" as const } : {}),
		});
	return (
		<button type="button" aria-pressed={!!selected} className={look} {...props}>
			{children}
		</button>
	);
}

/** A titled card of rows: "Linked", "Used by", "Other test plans", "Pinned". */
export function LinkedCard({
	title,
	className,
	children,
}: {
	title: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<Card className={cn("py-2", className)}>
			<section aria-label={title}>
				<h2 className="px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11">{title}</h2>
				{children}
			</section>
		</Card>
	);
}

/**
 * One link row of a `LinkedCard`: a bold name, then `trailing` (a `Badge`) or the chevron.
 * `render` draws the router link: `render={(p) => <Link to="/library/questions" {...p} />}`.
 */
export function LinkedRow({
	label,
	leading,
	trailing,
	render,
}: {
	label: string;
	/** A `Badge` before the name. */
	leading?: ReactNode;
	trailing?: ReactNode;
	render: (props: RowProps) => ReactNode;
}) {
	return (
		<Row render={render}>
			{leading}
			<span className="min-w-0 font-semibold">{label}</span>
			<span className="ml-auto flex items-center">
				{trailing ?? <ChevronRightIcon size={20} />}
			</span>
		</Row>
	);
}
