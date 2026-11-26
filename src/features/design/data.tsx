import { useState } from "react";
import { TEMPLATE } from "@/lib/design";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Input } from "@/ui/atoms/input";
import { dbml } from "@/ui/molecules/syntax";
import { parseDbml } from "@/ui/organisms/dbml";
import { useRender } from "@/ui/organisms/use-render";
import { ZoomFrame } from "@/ui/organisms/zoom-frame";
import { ListCard, ListColumn, NoMatch } from "@/ui/templates/library-page";
import { Canvas } from "./parts";
import { ReaderPage, type ReaderView } from "./text-tab";

async function load(source: string) {
	const { data, error } = parseDbml(source);
	if (!data) throw new Error(error);
	return data;
}

/**
 * The tables of the open model: the list at the left with "Find a table", and the canvas of table
 * cards with the zoom. A column that is a key has the pill "Key"; a column that points to another
 * table has the pill "Link", which names the target. A broken text keeps the last good tables.
 */
function Tables({ frame, shown, files }: ReaderView) {
	const { t } = useI18n();
	const p = t.design.page;
	const model = useRender(frame.file.text, load, frame.onError);
	const [query, setQuery] = useState("");
	const [pick, setPicked] = useState<string | null | undefined>(undefined);
	const tables = model?.tables ?? [];
	// The first table is open until the person picks another, or closes it.
	const picked = pick === undefined ? (tables[0]?.name ?? null) : pick;
	const q = query.trim().toLowerCase();
	return (
		<>
			<ListColumn className="flex-[1_1_220px]">
				<Input
					label={p.findTable}
					placeholder={p.findTable}
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				{q && !tables.some((x) => x.name.toLowerCase().includes(q)) ? (
					<NoMatch onClear={() => setQuery("")} />
				) : null}
				<ul aria-label={t.design.data.view} className="flex flex-col gap-2.5">
					{tables
						.filter((x) => x.name.toLowerCase().includes(q))
						.map((x) => (
							<li key={x.name}>
								<ListCard
									name={x.name}
									selected={x.name === picked}
									onClick={() => setPicked(x.name === picked ? null : x.name)}
									pills={
										<span className="text-n-11">
											{format(p.columns, { count: x.fields.length })}
										</span>
									}
								/>
							</li>
						))}
				</ul>
				{files}
			</ListColumn>
			{shown ? (
				<Canvas className="flex-[3_1_520px]">
					<ZoomFrame label={t.design.data.view} className="h-full min-h-[520px] flex-1">
						<div className="grid h-[520px] w-[840px] grid-cols-3 content-start items-start gap-7 p-6">
							{tables.map((x) => (
								<section
									key={x.name}
									aria-label={x.name}
									className={cn(
										"overflow-hidden rounded-lg bg-surface-2 shadow-2",
										x.name === picked && "outline-2 outline-accent",
									)}
								>
									<h2 className="bg-accent px-4 py-3 text-15 font-semibold text-accent-fg">
										{x.name}
									</h2>
									<ul>
										{x.fields.map((f) => {
											const ref = model?.refs.find((r) => r.from === `${x.name}.${f.name}`);
											return (
												<li
													key={f.name}
													title={f.notNull ? `${f.type}, ${t.design.data.notNull}` : f.type}
													className="flex min-h-11 items-center gap-2 px-4 [&+&]:border-t [&+&]:border-n-6"
												>
													{f.pk ? <Badge variant="accent">{p.key}</Badge> : null}
													{ref ? <Badge title={`${ref.from} → ${ref.to}`}>{p.link}</Badge> : null}
													<span className="font-mono">{f.name}</span>
												</li>
											);
										})}
									</ul>
								</section>
							))}
						</div>
					</ZoomFrame>
				</Canvas>
			) : null}
		</>
	);
}

/** Library / Data: the DBML models as tables and links (REQ-014, REQ-015). */
export function Data() {
	const { t } = useI18n();
	return (
		<ReaderPage
			kind="data"
			title={t.tabs.design.data}
			newLabel={t.design.page.newData}
			ext="dbml"
			template={TEMPLATE.data}
			textLabel={t.design.data.text}
			highlight={dbml}
			view={(v) => <Tables {...v} />}
		/>
	);
}
