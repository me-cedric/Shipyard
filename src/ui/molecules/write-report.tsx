import { format, useI18n } from "@/lib/i18n";

/** What a write did: the files it wrote and the files it kept. Both lists show a count. */
export function WriteReportView({ report }: { report: { written: string[]; kept: string[] } }) {
	const { t } = useI18n();
	return (
		<div role="status" className="flex flex-col gap-1 px-3 py-2 text-12 text-n-11">
			{(["written", "kept"] as const).map((k) =>
				report[k].length ? (
					<div key={k}>
						<span className="font-medium">
							{format(t.count, { name: t.extensions.report[k], count: report[k].length })}
						</span>
						<ul>
							{report[k].map((f) => (
								<li key={f} className="font-mono">
									{f}
								</li>
							))}
						</ul>
					</div>
				) : null,
			)}
		</div>
	);
}
