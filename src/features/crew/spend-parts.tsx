import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useWorkflows } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { useViewState } from "@/lib/shell/view-state";
import { ChevronRightIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import type { PageMenuItem } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";

/** The prices of Spend: a shared screen keeps the amounts private. The item of the More menu holds on every page of Spend. */
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
	const menu: PageMenuItem[] = [
		{
			label: prices ? t.factory.spendPage.hidePrices : t.extras.usage.showPrices,
			onClick: () => setPrices(!prices),
		},
	];
	return { prices, price, menu };
}

/** Where a sub-page of Spend goes. */
export type SpendPage = "how" | "budgets" | "usage";
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

/**
 * The limit of a feature is the budget of its recipe. This gives the highest one and where its Edit
 * goes: the budget row of that recipe, else of the first recipe.
 */
export function useFeatureLimit() {
	const list = useWorkflows().data ?? [];
	const top = list.reduce<(typeof list)[number] | undefined>(
		(a, w) => ((w.budget ?? -1) > (a?.budget ?? -1) ? w : a),
		undefined,
	);
	return {
		usd: top?.budget ?? null,
		link: {
			to: "/crew/recipes",
			search: { recipe: (top ?? list[0])?.id } as never,
			hash: "budget",
		} as const,
	};
}
