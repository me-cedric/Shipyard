import type { ReactNode } from "react";
import type { RunScopeData } from "@/features/factory/runs/run-detail";
import { RunUnits } from "@/features/factory/runs/run-units";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ChevronRightIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { EventLog, Requests } from "./story";

export type Open = "terminal" | "requests" | "events";

/** One row of the card: a name and a chevron that opens its panel. */
function Row({
	children,
	open,
	onClick,
}: {
	children: ReactNode;
	open: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-expanded={open}
			onClick={onClick}
			className="flex min-h-15 w-full items-center justify-between gap-3 px-6 text-left font-semibold text-n-12 hover:bg-n-2"
		>
			{children}
			<ChevronRightIcon size={14} className={cn(open && "rotate-90")} />
		</button>
	);
}

/**
 * "For developers" (picture 023): the functions that Story held. One panel is open at a time. `linked` is
 * true when the address names a session: the page already draws the requests and the sessions for it.
 */
export function Developers({
	count,
	open,
	linked,
	onOpen,
}: {
	count: number;
	open: Open | null;
	linked: boolean;
	onOpen: (o: Open | null) => void;
}) {
	const { t } = useI18n();
	const c = t.flow.look.checks;
	const pick = (o: Open) => onOpen(open === o ? null : o);
	return (
		<Card className="py-2">
			<h2 className="px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11">{c.developers}</h2>
			<div className="flex flex-col divide-y divide-n-4">
				<Row open={linked || open === "terminal"} onClick={() => pick("terminal")}>
					{c.terminal}
				</Row>
				<Row open={linked || open === "requests"} onClick={() => pick("requests")}>
					{c.requests}
				</Row>
				<Row open={open === "events"} onClick={() => pick("events")}>
					{format(t.flow.feature.allEvents, { count })}
				</Row>
			</div>
		</Card>
	);
}

/** The panel that a row of "For developers" opens, full width under the page. */
export function DevPanel({ scope, open }: { scope: RunScopeData; open: Open | null }) {
	if (open === "terminal")
		return (
			<Card className="overflow-hidden">
				<RunUnits run={scope.run} events={scope.events} />
			</Card>
		);
	if (open === "requests") return <Requests scope={scope} />;
	if (open === "events") return <EventLog scope={scope} />;
	return null;
}
