import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";
import { ChevronRightIcon } from "../icons";
import { Row } from "./row";

/** The value or the control, on the right edge. A field or a select fills it; a narrow row wraps it under the label. */
const SETTINGS_CONTROL =
	"flex min-w-0 max-w-full flex-[0_0_20rem] flex-wrap items-center justify-end gap-2 [&>button[aria-haspopup=listbox]]:w-full [&>input]:w-full";

/** The control at its own width, on the right edge. */
const SETTINGS_CONTROL_AUTO =
	"ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2";

/** A row that is a link: the bold label and a chevron. The whole row opens `href`. */
function SettingsLink({ id, label, href }: { id?: string; label: ReactNode; href: string }) {
	const router = useRouter();
	return (
		<Row
			render={(row) => (
				<a
					id={id}
					href={href}
					onClick={(e) => {
						e.preventDefault();
						router.history.push(href);
					}}
					{...row}
					className={cn(row.className, "hover:bg-n-3")}
				/>
			)}
		>
			<span className="min-w-0 font-semibold">{label}</span>
			<span aria-hidden="true" className="ml-auto flex text-n-11">
				<ChevronRightIcon size={20} />
			</span>
		</Row>
	);
}

/**
 * The value row: the label on the left, the value or the control on the right. With `href` the
 * whole row is a link with a chevron.
 */
export function SettingsRow({
	id: anchor,
	icon,
	label,
	current,
	href,
	wide = true,
	children,
}: {
	/** The anchor of the row: an error or a link can open it (`#id`). */
	id?: string;
	icon?: ReactNode;
	label: ReactNode;
	/** The next step of a list of steps. */
	current?: boolean;
	/** The address that the row opens. The row has no control then. */
	href?: string;
	/** The control gets a column of 20rem, and a field fills it. Off: the control keeps its own width. */
	wide?: boolean;
	/** The control. It needs its own accessible name. */
	children?: ReactNode;
}) {
	const id = useId();
	if (href) return <SettingsLink id={anchor} label={label} href={href} />;
	return (
		<Row
			className="gap-y-1.5 py-2"
			render={(props) => (
				// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
				<div
					id={anchor}
					role="group"
					aria-labelledby={id}
					aria-current={current ? "step" : undefined}
					{...props}
				/>
			)}
		>
			{icon ? (
				<span aria-hidden="true" className="flex shrink-0 text-n-11">
					{icon}
				</span>
			) : null}
			{/* The label keeps its words whole; the control wraps below it when the row is narrow. */}
			<span id={id} className="min-w-32 flex-[1_1_10rem] font-semibold text-n-12">
				{label}
			</span>
			<div className={wide ? SETTINGS_CONTROL : SETTINGS_CONTROL_AUTO}>{children}</div>
		</Row>
	);
}
