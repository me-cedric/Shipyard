import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { useViewState } from "@/lib/shell/view-state";
import { Switch } from "@/ui/atoms/switch";
import { ChevronRightIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { Row } from "@/ui/molecules/row";

/** The switch of Spend: a shared screen keeps the amounts private. It holds on every page of Spend. */
export function usePrices() {
	const { t } = useI18n();
	const [prices, setPrices] = useViewState("usage-prices", true);
	const price = (text: string): ReactNode =>
		prices ? (
			text
		) : (
			<span>
				<span aria-hidden="true">•••</span>
				<span className="sr-only">{t.extras.usage.hidden}</span>
			</span>
		);
	const switcher = (
		<Switch label={t.extras.usage.showPrices} checked={prices} onCheckedChange={setPrices} />
	);
	return { prices, price, switcher };
}

/** Where a sub-page of Spend goes. */
export type SpendPage = "how" | "budgets";
export const toSpend = (page?: SpendPage, run?: string) => ({
	to: "/crew/spend" as const,
	search: { ...(page ? { page } : {}), ...(run ? { run } : {}) } as never,
});

/** The way back to the Spend page. */
export function BackToSpend() {
	const { t } = useI18n();
	return (
		<BackLink
			label={t.factory.spendPage.back}
			render={(props) => <Link {...toSpend()} {...props} />}
		/>
	);
}

/** A card of rows with a small muted heading (picture 013). */
export function RowsCard({ title, children }: { title: string; children: ReactNode }) {
	return (
		<Card className="py-2">
			<h2 className="px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11">{title}</h2>
			{children}
		</Card>
	);
}

/** A row that opens a page of Spend or of the app. */
export function LinkRow({
	label,
	page,
	to,
}: {
	label: string;
	page?: SpendPage;
	to?: "/crew/sessions" | "/flow/done";
}) {
	return (
		<Row
			render={(props) => <Link {...(to ? { to } : toSpend(page))} {...props} aria-label={label} />}
		>
			<span className="flex-1 font-semibold">{label}</span>
			<ChevronRightIcon size={20} />
		</Row>
	);
}
