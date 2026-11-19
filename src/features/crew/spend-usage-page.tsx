import { useNavigate } from "@tanstack/react-router";
import { MachineUsage } from "@/features/factory/usage/machine-usage";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/ui/molecules/page-header";
import { BackToSpend, toSpend, usePrices } from "./spend-parts";
import { UsageCard } from "./spend-usage";

/**
 * The numbers behind Spend (`page=usage`, opened from the More menu of How agents do): the tiles,
 * the usage by run, day and member, and the spend of this computer by day, AI tool, model and project.
 */
export function SpendUsage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { prices, price, menu } = usePrices();
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader title={t.factory.usage} back={<BackToSpend />} menu={menu} />
			<div className="flex flex-col gap-5 px-4 pb-4">
				<UsageCard
					prices={prices}
					price={price}
					onBudget={() => void navigate(toSpend("budgets"))}
				/>
				<MachineUsage prices={prices} withBudget={false} />
			</div>
		</div>
	);
}
