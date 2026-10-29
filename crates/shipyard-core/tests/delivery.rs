//! Delivery rules: branch, base, labels, pull request body, impacts digest and lanes (spec
//! `delivery`, REQ-007, REQ-009, REQ-010, REQ-011, REQ-021, REQ-027; `factory` REQ-038).

use shipyard_core::delivery::*;
use shipyard_core::run::RunState;
use shipyard_core::work_item::WorkKind;

#[test]
fn kebab_folds_accents_and_caps_length() {
    assert_eq!(kebab("Créer l'écran « Équipe » !"), "creer-l-ecran-equipe");
    assert_eq!(kebab("  Fix: crash on /api/v2  "), "fix-crash-on-api-v2");
    assert_eq!(kebab("Straße Œuvre"), "strasse-oeuvre");
    let long = kebab(&"word ".repeat(30));
    assert!(long.len() <= 60 && !long.ends_with('-'), "{long}");
    assert_eq!(kebab("日本語"), "");
}

#[test]
fn branch_name_shape() {
    assert_eq!(
        branch_name("feat", "Factory", "Add the run lanes"),
        "feat/factory/add-the-run-lanes"
    );
    assert_eq!(branch_name("fix", "", "日本"), "fix/general/change");
    assert_eq!(commit_type(WorkKind::Bug), "fix");
    assert_eq!(commit_type(WorkKind::Story), "feat");
}

#[test]
fn tool_branches_are_renamed() {
    assert!(is_tool_branch("claude/fix-thing"));
    assert!(is_tool_branch("codex/x"));
    assert!(!is_tool_branch("feat/factory/x"));
}

#[test]
fn conventional_title() {
    assert_eq!(
        conventional("feat", "factory", "add the run lanes"),
        "feat(factory): add the run lanes"
    );
    assert_eq!(conventional("fix", "", "stop a crash"), "fix: stop a crash");
}

fn names(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
}

#[test]
fn base_choice() {
    let with_develop = names(&["main", "develop", "release/1.0"]);
    assert_eq!(
        base_branch(Some("trunk"), &with_develop, "main"),
        Ok("trunk".into())
    );
    assert_eq!(
        base_branch(None, &with_develop, "main"),
        Ok("develop".into())
    );
    assert_eq!(
        base_branch(None, &names(&["main"]), "main"),
        Ok("main".into())
    );
    assert_eq!(
        base_branch(Some("release/1.0"), &with_develop, "main"),
        Err(BaseError::Release("release/1.0".into()))
    );
    assert_eq!(
        base_branch(None, &names(&["release-2"]), "release-2"),
        Err(BaseError::Release("release-2".into()))
    );
}

#[test]
fn labels_from_existing_only() {
    let existing = names(&[
        "bug",
        "enhancement",
        "area:ui",
        "docs",
        "Core",
        "needs-review",
    ]);
    let paths = names(&["src/ui/button.tsx", "crates/core/src/x.rs", "README.md"]);
    assert_eq!(
        pr_labels(&existing, "feat", &paths),
        ["enhancement", "area:ui", "Core"]
    );
    assert_eq!(pr_labels(&existing, "fix", &[]), ["bug"]);
    // No type label exists: no label is invented.
    assert!(pr_labels(&names(&["wontfix"]), "feat", &paths).is_empty());
}

fn body() -> PrBody {
    PrBody {
        opening: "Adds the six lanes of Factory / Runs.\n\nCo-Authored-By: Claude <noreply@anthropic.com>"
            .into(),
        gate: vec![
            GateCheck {
                command: "cargo test -p shipyard-core".into(),
                passed: true,
                counts: "64 passed, 0 failed".into(),
            },
            GateCheck {
                command: "pnpm vitest run".into(),
                passed: false,
                counts: "2 failed".into(),
            },
        ],
        tickets: vec![TicketLine {
            key: "SHIP-42".into(),
            title: "Runs board".into(),
            url: "https://t/SHIP-42".into(),
        }],
        impacts: None,
    }
}

#[test]
fn body_order_and_no_attribution() {
    let text = body().render();
    let opening = text.find("Adds the six lanes").unwrap();
    let gate = text.find("## Gate").unwrap();
    let tickets = text.find("## Tickets").unwrap();
    assert!(opening < gate && gate < tickets, "{text}");
    assert!(text.contains("- `cargo test -p shipyard-core`: passed, 64 passed, 0 failed"));
    assert!(text.contains("- `pnpm vitest run`: failed, 2 failed"));
    assert!(text.contains("- [SHIP-42](https://t/SHIP-42) Runs board"));
    assert!(!text.to_lowercase().contains("co-authored-by"));
    assert!(!text.contains("## Impacts"));
}

#[test]
fn impacts_digest_is_one_section_at_the_end() {
    let mut b = body();
    b.impacts = Some("- `refs`: 3 callers".into());
    let text = b.render();
    assert!(text.find("## Tickets").unwrap() < text.find("## Impacts").unwrap());
    assert!(text.trim_end().ends_with("- `refs`: 3 callers"));
    assert_eq!(text.matches("## Impacts").count(), 1);
}

#[test]
fn attribution_lines_are_removed() {
    let text = "Fix it.\n🤖 Generated with [Claude Code](https://claude.com)\nco-authored-by: Codex <x>\nKeep this.";
    assert_eq!(strip_attribution(text), "Fix it.\nKeep this.");
}

#[test]
fn the_robot_sign_is_deleted_and_the_words_stay() {
    assert_eq!(
        strip_attribution("Fix it.\n🤖 done by a bot\nKeep."),
        "Fix it.\ndone by a bot\nKeep."
    );
}

#[test]
fn a_mention_is_broken_and_an_address_is_not() {
    let out = neutralize_mentions("ping @alice, (@bob) and a@b.c or [~accountid:1]");
    assert_eq!(
        out,
        "ping @\u{200B}alice, (@\u{200B}bob) and a@b.c or [\u{200B}~accountid:1]"
    );
    assert_eq!(
        clean_outgoing("@dev look\n🤖 Generated with x\nok"),
        "@\u{200B}dev look\nok"
    );
}

fn pr(ci: Ci, changes_requested: bool, draft: bool) -> PrSignal {
    PrSignal {
        ci,
        changes_requested,
        draft,
    }
}

#[test]
fn lanes() {
    use Lane::*;
    use RunState as S;
    for (state, lane_) in [
        (S::Queued, Queued),
        (S::Claimed, Queued),
        (S::RetryQueued, Queued),
        (S::Planning, Working),
        (S::Working, Working),
        (S::SelfReview, Working),
        (S::ChangesRequested, Working),
        (S::PlanReview, NeedsYou),
        (S::WaitingForAnswer, NeedsYou),
        (S::Blocked, NeedsYou),
        (S::Paused, NeedsYou),
        (S::Failed, NeedsYou),
        (S::Merged, Done),
        (S::Done, Done),
        (S::Cancelled, Done),
        (S::PROpen, InReview),
    ] {
        assert_eq!(lane(state, None), lane_, "{state:?}");
    }
    let ready = pr(Ci::Passing, false, false);
    assert_eq!(lane(S::PROpen, Some(&ready)), ReadyToMerge);
    assert_eq!(
        lane(S::PROpen, Some(&pr(Ci::Passing, false, true))),
        InReview
    );
    assert_eq!(
        lane(S::PROpen, Some(&pr(Ci::Passing, true, false))),
        InReview
    );
    assert_eq!(
        lane(S::PROpen, Some(&pr(Ci::Pending, false, false))),
        InReview
    );
    assert_eq!(lane(S::Working, Some(&ready)), Working);
    assert_eq!(Lane::ALL.len(), 6);
}
