import { TEMPLATE } from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { LikeC4View } from "@/ui/organisms/likec4-view";
import { TextTab } from "./text-tab";

/** Design / Architecture: the LikeC4 models, rendered live (REQ-006, REQ-007). */
export function Architecture() {
	const { t } = useI18n();
	return (
		<TextTab
			kind="model"
			title={t.tabs.design.architecture}
			noun={t.design.noun.model}
			ext="c4"
			template={TEMPLATE.model}
			textLabel={t.design.architecture.text}
			view={(source, onError) => (
				<LikeC4View source={source} label={t.design.architecture.render} onError={onError} />
			)}
		/>
	);
}
