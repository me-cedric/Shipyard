//! Settings / Connections: wire the Shipyard MCP server into the config file of an agent tool.
//! Four tools: Claude Code (`.mcp.json`), Codex (`.codex/config.toml` of the project, else
//! `~/.codex/config.toml`), Gemini (`.gemini/settings.json`) and VS Code (`.vscode/mcp.json`).
//!
//! A change has two steps. `review` gives the file before and after, with a line diff. `apply`
//! writes the file only when the text that the person reviewed is still what `apply` would write.
//! The rest of the file stays. No file holds the token: each entry reads `SHIPYARD_MCP_TOKEN`.
//!
//! shortcut: a JSON file with comments (VS Code accepts them) is refused, not rewritten, so no
//! comment is lost. A TOML file is edited as text: only the `[mcp_servers.shipyard]` table changes.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{Value, json};
use shipyard_store::project::write_atomic;
use specta::Type;

use crate::commands::{Api, AppState, Res, blocking, err};

const TOKEN_VAR: &str = "SHIPYARD_MCP_TOKEN";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Claude,
    Vscode,
    Gemini,
    Codex,
}

struct Target {
    id: &'static str,
    label: &'static str,
    path: PathBuf,
    kind: Kind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum WireState {
    Wired,
    OutOfDate,
    NotWired,
}

/// One detected agent tool.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Wiring {
    pub id: String,
    pub label: String,
    pub path: String,
    pub state: WireState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum LineKind {
    Same,
    Add,
    Del,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct DiffLine {
    pub kind: LineKind,
    pub text: String,
}

/// What the person reviews before the write.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WiringReview {
    pub path: String,
    /// The text that `apply` must get back.
    pub after: String,
    pub lines: Vec<DiffLine>,
}

fn targets(root: &Path, home: &Path) -> Vec<Target> {
    let codex = if root.join(".codex").is_dir() {
        root.join(".codex/config.toml")
    } else {
        home.join(".codex/config.toml")
    };
    vec![
        Target {
            id: "claude",
            label: "Claude Code",
            path: root.join(".mcp.json"),
            kind: Kind::Claude,
        },
        Target {
            id: "codex",
            label: "Codex",
            path: codex,
            kind: Kind::Codex,
        },
        Target {
            id: "gemini",
            label: "Gemini",
            path: root.join(".gemini/settings.json"),
            kind: Kind::Gemini,
        },
        Target {
            id: "vscode",
            label: "VS Code",
            path: root.join(".vscode/mcp.json"),
            kind: Kind::Vscode,
        },
    ]
}

/// Claude Code is always listed (`.mcp.json` is the shared file). The others show when their file
/// or their folder exists.
fn detected(t: &Target) -> bool {
    t.kind == Kind::Claude || t.path.exists() || t.path.parent().is_some_and(Path::is_dir)
}

/// The key of the server map, and the entry of Shipyard, for a JSON tool.
fn json_entry(kind: Kind, url: &str) -> (&'static str, Value) {
    match kind {
        Kind::Vscode => (
            "servers",
            json!({ "type": "http", "url": url, "headers": { "Authorization": format!("Bearer ${{env:{TOKEN_VAR}}}") } }),
        ),
        Kind::Gemini => (
            "mcpServers",
            json!({ "httpUrl": url, "headers": { "Authorization": format!("Bearer ${TOKEN_VAR}") } }),
        ),
        _ => (
            "mcpServers",
            json!({ "type": "http", "url": url, "headers": { "Authorization": format!("Bearer ${{{TOKEN_VAR}}}") } }),
        ),
    }
}

fn codex_block(url: &str) -> String {
    format!(
        "[mcp_servers.shipyard]\nurl = {}\nbearer_token_env_var = \"{TOKEN_VAR}\"\n",
        json!(url)
    )
}

/// True when `actual` holds every key of `want` with the same value. Extra keys do not matter.
fn covers(actual: &Value, want: &Value) -> bool {
    match (actual, want) {
        (Value::Object(a), Value::Object(w)) => w
            .iter()
            .all(|(k, v)| a.get(k).is_some_and(|x| covers(x, v))),
        _ => actual == want,
    }
}

/// The name in a table header, with no space and no quote: `[ mcp_servers . "shipyard" ] # note`
/// gives `mcp_servers.shipyard`. An array header (`[[x]]`) and a line that is not a header give `None`.
fn header(line: &str) -> Option<String> {
    let rest = line.trim().strip_prefix('[')?;
    if rest.starts_with('[') {
        return None;
    }
    let (name, tail) = rest.split_once(']')?;
    let tail = tail.trim();
    (tail.is_empty() || tail.starts_with('#')).then(|| {
        name.chars()
            .filter(|c| !c.is_whitespace() && !"\"'".contains(*c))
            .collect()
    })
}

/// The lines of the `[mcp_servers.shipyard]` table: first line and end (exclusive). The comment
/// and blank lines after the last key belong to what follows, so they stay.
fn codex_span(lines: &[&str]) -> Option<(usize, usize)> {
    let start = lines
        .iter()
        .position(|l| header(l).is_some_and(|h| h == "mcp_servers.shipyard"))?;
    let next = lines[start + 1..]
        .iter()
        .position(|l| l.trim_start().starts_with('['))
        .map_or(lines.len(), |i| start + 1 + i);
    let end = (start + 1..next)
        .rev()
        .find(|&i| !lines[i].trim().is_empty() && !lines[i].trim_start().starts_with('#'))
        .map_or(start + 1, |i| i + 1);
    Some((start, end))
}

/// True when the file sets the servers in a form other than tables: any inline `mcp_servers = {`
/// (on one line or many), or a dotted or inline `shipyard` key. Writing the `shipyard` table too
/// would make the TOML invalid, so the file is refused.
fn codex_other_form(lines: &[&str]) -> bool {
    let mut in_servers = false;
    for l in lines {
        if let Some(h) = header(l) {
            in_servers = h == "mcp_servers";
            continue;
        }
        let c: String = l
            .chars()
            .filter(|c| !c.is_whitespace() && !"\"'".contains(*c))
            .collect();
        let named = |p: &str| {
            c.starts_with(&format!("{p}shipyard=")) || c.starts_with(&format!("{p}shipyard."))
        };
        if c.starts_with("mcp_servers={") || named("mcp_servers.") || (in_servers && named("")) {
            return true;
        }
    }
    false
}

fn state_of(kind: Kind, text: Option<&str>, url: &str) -> WireState {
    let Some(text) = text else {
        return WireState::NotWired;
    };
    if kind == Kind::Codex {
        let lines: Vec<&str> = text.lines().collect();
        let Some((s, e)) = codex_span(&lines) else {
            return WireState::NotWired;
        };
        let want = codex_block(url);
        let have: Vec<&str> = lines[s..e].iter().map(|l| l.trim()).collect();
        return if want.lines().all(|w| have.contains(&w)) {
            WireState::Wired
        } else {
            WireState::OutOfDate
        };
    }
    let (key, want) = json_entry(kind, url);
    match serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|d| d.get(key)?.get("shipyard").cloned())
    {
        None => WireState::NotWired,
        Some(have) if covers(&have, &want) => WireState::Wired,
        Some(_) => WireState::OutOfDate,
    }
}

/// The text of the file with the Shipyard entry. Every other key stays.
fn render(kind: Kind, text: Option<&str>, url: &str) -> Res<String> {
    if kind == Kind::Codex {
        let old = text.unwrap_or("");
        let lines: Vec<&str> = old.lines().collect();
        if codex_other_form(&lines) {
            return Err("the file sets mcp_servers as an inline table, or shipyard as an inline or dotted key: move each server to its own [mcp_servers.<name>] table".into());
        }
        let block = codex_block(url);
        let mut out: Vec<String> = Vec::new();
        match codex_span(&lines) {
            Some((s, e)) => {
                out.extend(lines[..s].iter().map(|l| l.to_string()));
                out.extend(block.lines().map(String::from));
                // A blank line before the next table stays.
                out.extend(lines[e..].iter().map(|l| l.to_string()));
            }
            None => {
                out.extend(lines.iter().map(|l| l.to_string()));
                if !old.trim().is_empty() {
                    out.push(String::new());
                }
                out.extend(block.lines().map(String::from));
            }
        }
        return Ok(out.join("\n") + "\n");
    }
    let mut doc: Value = match text {
        Some(t) if !t.trim().is_empty() => {
            serde_json::from_str(t).map_err(|e| format!("the file is not valid JSON: {e}"))?
        }
        _ => json!({}),
    };
    let (key, entry) = json_entry(kind, url);
    doc.as_object_mut()
        .ok_or("the file is not a JSON object")?
        .entry(key)
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| format!("{key} is not an object"))?
        .insert("shipyard".into(), entry);
    Ok(serde_json::to_string_pretty(&doc).map_err(err)? + "\n")
}

/// A line diff by the longest common subsequence. The files are small.
fn diff(before: &str, after: &str) -> Vec<DiffLine> {
    let (a, b): (Vec<&str>, Vec<&str>) = (before.lines().collect(), after.lines().collect());
    let mut len = vec![vec![0u32; b.len() + 1]; a.len() + 1];
    for i in (0..a.len()).rev() {
        for j in (0..b.len()).rev() {
            len[i][j] = if a[i] == b[j] {
                len[i + 1][j + 1] + 1
            } else {
                len[i + 1][j].max(len[i][j + 1])
            };
        }
    }
    let (mut i, mut j, mut out) = (0, 0, Vec::new());
    let line = |kind, text: &str| DiffLine {
        kind,
        text: text.to_string(),
    };
    while i < a.len() || j < b.len() {
        if i < a.len() && j < b.len() && a[i] == b[j] {
            out.push(line(LineKind::Same, a[i]));
            (i, j) = (i + 1, j + 1);
        } else if j < b.len() && (i == a.len() || len[i][j + 1] >= len[i + 1][j]) {
            out.push(line(LineKind::Add, b[j]));
            j += 1;
        } else {
            out.push(line(LineKind::Del, a[i]));
            i += 1;
        }
    }
    out
}

fn read(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

fn home() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_default()
}

/// The path with every link of its existing part resolved. A part that does not exist yet has no link.
fn real(p: &Path) -> PathBuf {
    let mut rest = Vec::new();
    let mut cur = p;
    while !cur.exists() {
        let (Some(name), Some(parent)) = (cur.file_name(), cur.parent()) else {
            return p.to_path_buf();
        };
        rest.push(name);
        cur = parent;
    }
    let mut out = cur.canonicalize().unwrap_or_else(|_| cur.to_path_buf());
    out.extend(rest.iter().rev());
    out
}

/// The target must stay inside the project, or inside `~/.codex` for the Codex file of the user.
/// A linked `.vscode` folder that points outside is refused.
fn find(root: &Path, home: &Path, id: &str) -> Res<Target> {
    let t = targets(root, home)
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("unknown agent tool: {id}"))?;
    let base = if t.kind == Kind::Codex && !t.path.starts_with(root) {
        home.join(".codex")
    } else {
        root.to_path_buf()
    };
    if !real(t.path.parent().unwrap_or(&t.path)).starts_with(real(&base)) {
        return Err(format!(
            "the folder of {} is a link that leaves {}",
            t.label,
            base.display()
        ));
    }
    Ok(t)
}

fn list_in(root: &Path, home: &Path, url: &str) -> Vec<Wiring> {
    targets(root, home)
        .into_iter()
        .filter(detected)
        .map(|t| Wiring {
            id: t.id.into(),
            label: t.label.into(),
            state: state_of(t.kind, read(&t.path).as_deref(), url),
            path: t.path.to_string_lossy().into_owned(),
        })
        .collect()
}

fn review_in(root: &Path, home: &Path, id: &str, url: &str) -> Res<WiringReview> {
    let t = find(root, home, id)?;
    let before = read(&t.path);
    let after = render(t.kind, before.as_deref(), url)?;
    Ok(WiringReview {
        lines: diff(before.as_deref().unwrap_or(""), &after),
        path: t.path.to_string_lossy().into_owned(),
        after,
    })
}

fn apply_in(root: &Path, home: &Path, id: &str, url: &str, reviewed: &str) -> Res<String> {
    let t = find(root, home, id)?;
    let after = render(t.kind, read(&t.path).as_deref(), url)?;
    if after != reviewed {
        return Err("the file changed since the review: review it again".into());
    }
    write_atomic(&t.path, after.as_bytes()).map_err(err)?;
    Ok(t.path.to_string_lossy().into_owned())
}

fn context(s: &AppState) -> Res<(PathBuf, String)> {
    let root = PathBuf::from(&s.registry()?.active().ok_or("no active project")?.path);
    Ok((root, crate::outside::url(s)))
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_wiring_list(app: tauri::AppHandle) -> Api<Vec<Wiring>> {
    blocking(app, |s| {
        let (root, url) = context(s)?;
        Ok(list_in(&root, &home(), &url))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_wiring_review(app: tauri::AppHandle, id: String) -> Api<WiringReview> {
    blocking(app, move |s| {
        let (root, url) = context(s)?;
        review_in(&root, &home(), &id, &url)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_wiring_apply(app: tauri::AppHandle, id: String, reviewed: String) -> Api<String> {
    blocking(app, move |s| {
        let (root, url) = context(s)?;
        // A file of the repository is a project setting. The Codex file of the user is not.
        if find(&root, &home(), &id)?.path.starts_with(&root) {
            crate::rights::require(
                s,
                crate::rights::Right::ProjectSettings,
                "mcp_wiring_apply",
                &id,
            )?;
        }
        apply_in(&root, &home(), &id, &url, &reviewed)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    const URL: &str = "http://127.0.0.1:47821/mcp";

    fn put(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }

    fn wire(root: &Path, home: &Path, id: &str, url: &str) -> String {
        let r = review_in(root, home, id, url).unwrap();
        apply_in(root, home, id, url, &r.after).unwrap()
    }

    fn state(root: &Path, home: &Path, id: &str, url: &str) -> WireState {
        list_in(root, home, url)
            .into_iter()
            .find(|w| w.id == id)
            .unwrap()
            .state
    }

    #[test]
    fn each_json_format_keeps_the_other_keys_and_no_token_value() {
        for (id, rel, key, other) in [
            ("claude", ".mcp.json", "mcpServers", "mcpServers"),
            ("vscode", ".vscode/mcp.json", "servers", "servers"),
            (
                "gemini",
                ".gemini/settings.json",
                "mcpServers",
                "mcpServers",
            ),
        ] {
            let d = tempfile::tempdir().unwrap();
            let (root, home) = (d.path().join("p"), d.path().join("h"));
            put(
                &root,
                rel,
                &format!(r#"{{"theme":"dark","{other}":{{"x":{{"command":"c"}}}}}}"#),
            );
            assert_eq!(state(&root, &home, id, URL), WireState::NotWired, "{id}");
            wire(&root, &home, id, URL);
            let text = std::fs::read_to_string(root.join(rel)).unwrap();
            let doc: Value = serde_json::from_str(&text).unwrap();
            assert_eq!(doc["theme"], "dark", "{id}");
            assert_eq!(doc[key]["x"]["command"], "c", "{id}");
            assert!(
                text.contains(URL) && text.contains("SHIPYARD_MCP_TOKEN"),
                "{id}"
            );
            assert_eq!(state(&root, &home, id, URL), WireState::Wired, "{id}");
            // The server settings changed: the port is new.
            let moved = "http://127.0.0.1:50000/mcp";
            assert_eq!(state(&root, &home, id, moved), WireState::OutOfDate, "{id}");
            wire(&root, &home, id, moved);
            assert_eq!(state(&root, &home, id, moved), WireState::Wired, "{id}");
        }
    }

    #[test]
    fn a_new_json_file_is_made_and_a_bad_one_is_refused() {
        let d = tempfile::tempdir().unwrap();
        let (root, home) = (d.path().join("p"), d.path().join("h"));
        wire(&root, &home, "claude", URL);
        assert!(root.join(".mcp.json").is_file());
        put(&root, ".vscode/mcp.json", "{ // comment\n}");
        assert!(review_in(&root, &home, "vscode", URL).is_err());
        assert_eq!(
            std::fs::read_to_string(root.join(".vscode/mcp.json")).unwrap(),
            "{ // comment\n}"
        );
    }

    #[test]
    fn codex_keeps_the_rest_of_the_toml_and_replaces_only_its_table() {
        let d = tempfile::tempdir().unwrap();
        let (root, home) = (d.path().join("p"), d.path().join("h"));
        put(
            &home,
            ".codex/config.toml",
            "model = \"x\"\n\n[mcp_servers.other]\ncommand = \"c\"\n",
        );
        assert_eq!(state(&root, &home, "codex", URL), WireState::NotWired);
        wire(&root, &home, "codex", URL);
        let p = home.join(".codex/config.toml");
        let text = std::fs::read_to_string(&p).unwrap();
        assert!(text.starts_with("model = \"x\"\n\n[mcp_servers.other]\ncommand = \"c\"\n"));
        assert!(text.contains("[mcp_servers.shipyard]\nurl = \"http://127.0.0.1:47821/mcp\""));
        assert_eq!(state(&root, &home, "codex", URL), WireState::Wired);
        let moved = "http://127.0.0.1:50000/mcp";
        assert_eq!(state(&root, &home, "codex", moved), WireState::OutOfDate);
        // A table after Shipyard's table stays, and the old url is gone.
        std::fs::write(&p, format!("{text}\n[profiles.fast]\nmodel = \"y\"\n")).unwrap();
        wire(&root, &home, "codex", moved);
        let text = std::fs::read_to_string(&p).unwrap();
        assert!(text.contains("[profiles.fast]\nmodel = \"y\""));
        assert!(!text.contains("47821") && text.contains("50000"));
        assert_eq!(text.matches("[mcp_servers.shipyard]").count(), 1);
    }

    #[test]
    fn the_project_codex_folder_wins_and_tools_show_only_when_detected() {
        let d = tempfile::tempdir().unwrap();
        let (root, home) = (d.path().join("p"), d.path().join("h"));
        std::fs::create_dir_all(&root).unwrap();
        let ids = |r: &Path| -> Vec<String> {
            list_in(r, &home, URL).into_iter().map(|w| w.id).collect()
        };
        assert_eq!(ids(&root), ["claude"]);
        std::fs::create_dir_all(root.join(".codex")).unwrap();
        std::fs::create_dir_all(root.join(".gemini")).unwrap();
        assert_eq!(ids(&root), ["claude", "codex", "gemini"]);
        wire(&root, &home, "codex", URL);
        assert!(root.join(".codex/config.toml").is_file());
        assert!(!home.join(".codex").exists());
    }

    #[test]
    fn the_review_shows_a_line_diff_and_apply_refuses_a_changed_file() {
        let d = tempfile::tempdir().unwrap();
        let (root, home) = (d.path().join("p"), d.path().join("h"));
        put(&root, ".mcp.json", r#"{"mcpServers":{}}"#);
        let r = review_in(&root, &home, "claude", URL).unwrap();
        assert!(
            r.lines
                .iter()
                .any(|l| l.kind == LineKind::Add && l.text.contains(URL))
        );
        assert!(r.lines.iter().any(|l| l.kind == LineKind::Del));
        put(
            &root,
            ".mcp.json",
            r#"{"mcpServers":{"y":{"command":"c"}}}"#,
        );
        assert!(
            apply_in(&root, &home, "claude", URL, &r.after)
                .unwrap_err()
                .contains("changed")
        );
        assert!(
            !std::fs::read_to_string(root.join(".mcp.json"))
                .unwrap()
                .contains("shipyard")
        );
        assert!(review_in(&root, &home, "nope", URL).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_linked_folder_that_leaves_the_project_is_refused() {
        let d = tempfile::tempdir().unwrap();
        let (root, home, out) = (d.path().join("p"), d.path().join("h"), d.path().join("out"));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&out).unwrap();
        std::os::unix::fs::symlink(&out, root.join(".vscode")).unwrap();
        let e = review_in(&root, &home, "vscode", URL).unwrap_err();
        assert!(e.contains("link"), "{e}");
        assert!(apply_in(&root, &home, "vscode", URL, "x").is_err());
        assert!(!out.join("mcp.json").exists());
        // A link that stays inside the project is fine.
        std::fs::create_dir_all(root.join("real")).unwrap();
        std::os::unix::fs::symlink(root.join("real"), root.join(".gemini")).unwrap();
        wire(&root, &home, "gemini", URL);
        assert!(root.join("real/settings.json").is_file());
    }

    #[test]
    fn codex_reads_a_spaced_header_with_a_comment_and_keeps_the_comments_after_it() {
        let d = tempfile::tempdir().unwrap();
        let (root, home) = (d.path().join("p"), d.path().join("h"));
        put(
            &home,
            ".codex/config.toml",
            "[ mcp_servers . shipyard ] # mine\nurl = \"old\"\n# about profiles\n\n[profiles.x]\na = 1\n",
        );
        wire(&root, &home, "codex", URL);
        let text = std::fs::read_to_string(home.join(".codex/config.toml")).unwrap();
        assert_eq!(text.matches("mcp_servers").count(), 1, "{text}");
        assert!(!text.contains("old"));
        assert!(text.contains("# about profiles\n\n[profiles.x]"), "{text}");
    }

    #[test]
    fn codex_refuses_the_inline_and_the_dotted_forms() {
        for body in [
            "mcp_servers.shipyard.url = \"x\"\n",
            "mcp_servers.shipyard = { url = \"x\" }\n",
            "mcp_servers = { shipyard = { url = \"x\" } }\n",
            "[mcp_servers]\nshipyard = { url = \"x\" }\n",
            "mcp_servers = {\n  shipyard = { url = \"x\" }\n}\n",
            "mcp_servers.shipyard = {\n  url = \"x\",\n}\n",
            "mcp_servers = { other = { command = \"c\" } }\n",
            "mcp_servers = {\n  other = { command = \"c\" }\n}\n",
            "[mcp_servers]\nshipyard.url = \"x\"\n",
            "[mcp_servers]\n'shipyard'.url = \"x\"\n",
        ] {
            let d = tempfile::tempdir().unwrap();
            let (root, home) = (d.path().join("p"), d.path().join("h"));
            put(&home, ".codex/config.toml", body);
            assert!(review_in(&root, &home, "codex", URL).is_err(), "{body}");
        }
    }

    #[test]
    fn codex_replaces_a_single_quoted_table() {
        let d = tempfile::tempdir().unwrap();
        let (root, home) = (d.path().join("p"), d.path().join("h"));
        put(
            &home,
            ".codex/config.toml",
            "[mcp_servers.'shipyard']\nurl = \"old\"\n",
        );
        let text = std::fs::read_to_string(wire(&root, &home, "codex", URL)).unwrap();
        assert_eq!(text.matches("mcp_servers").count(), 1, "{text}");
    }

    #[test]
    fn a_json_file_keeps_its_key_order() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("p");
        put(
            &root,
            ".mcp.json",
            r#"{"zeta":1,"mcpServers":{},"alpha":2}"#,
        );
        wire(&root, &d.path().join("h"), "claude", URL);
        let text = std::fs::read_to_string(root.join(".mcp.json")).unwrap();
        let at = |k: &str| text.find(k).unwrap();
        assert!(
            at("zeta") < at("mcpServers") && at("mcpServers") < at("alpha"),
            "{text}"
        );
    }
}
