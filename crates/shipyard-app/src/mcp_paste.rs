//! Settings / Connections, custom server form: add servers by pasting their JSON, the usual
//! `{"mcpServers": {"name": {...}}}` shape (a `servers` map or a bare map also works).
//!
//! A value that looks like a secret never reaches a file. An `env` value goes to the secret store
//! (that is what `env` of a custom server is). A secret header of a remote server becomes an
//! `--header Name:${VAR}` argument with the value in the store as `VAR`. A secret in the arguments
//! of a local server is refused: no shell expands a variable there, so the person moves it to `env`.

use serde_json::Value;

use crate::agents::{Agents, McpCustom, McpEnv};
use crate::commands::{Api, AppState, Res, blocking};

const SECRET_KEYS: [&str; 8] = [
    "token",
    "key",
    "secret",
    "password",
    "auth",
    "credential",
    "bearer",
    "cookie",
];
const SECRET_PREFIXES: [&str; 7] = [
    "sk-",
    "ghp_",
    "github_pat_",
    "glpat-",
    "xox",
    "AKIA",
    "Bearer ",
];

/// A value that is a reference (`${VAR}`) is not a secret. A name or a known prefix makes one.
pub fn looks_secret(name: &str, value: &str) -> bool {
    if value.is_empty() || value.starts_with("${") {
        return false;
    }
    let n = name.to_ascii_lowercase();
    SECRET_KEYS.iter().any(|k| n.contains(k)) || has_prefix(value)
}

/// A known secret prefix at the start of the value or after a character that is not a letter or
/// a digit (`Authorization: Bearer x`, `token=sk-x`). `task-runner` is not a match.
fn has_prefix(value: &str) -> bool {
    SECRET_PREFIXES.iter().any(|p| {
        value.match_indices(p).any(|(i, _)| {
            value[..i]
                .chars()
                .next_back()
                .is_none_or(|c| !c.is_alphanumeric())
        })
    })
}

/// A URL whose query has a secret name or value (`?api_key=abc`).
fn url_secret(url: &str) -> bool {
    url.split_once('?').is_some_and(|(_, q)| {
        q.split('&')
            .any(|kv| kv.split_once('=').is_some_and(|(k, v)| looks_secret(k, v)))
    })
}

/// An argument is a secret by its value, by a `name=value` or `Name: value` shape, by the flag
/// before it, or by a secret query in a URL.
fn arg_secret(args: &[String], i: usize) -> bool {
    let a = args[i].as_str();
    let prev = i.checked_sub(1).map(|p| args[p].as_str());
    let named = a
        .split_once(['=', ':'])
        .is_some_and(|(k, v)| looks_secret(k, v.trim()));
    named
        || has_prefix(a)
        || url_secret(a)
        || prev.is_some_and(|p| p.starts_with('-') && looks_secret(p, a))
}

fn var_name(prefix: &str, name: &str) -> String {
    let tail: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect();
    format!("{prefix}_{tail}")
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn one(name: &str, v: &Value) -> Res<McpCustom> {
    let remote = v["url"].as_str().or(v["httpUrl"].as_str());
    let command = v["command"]
        .as_str()
        .or(remote)
        .ok_or_else(|| format!("{name}: it needs a \"command\" or a \"url\""))?;
    let mut args = strings(&v["args"]);
    let mut env: Vec<McpEnv> = v["env"]
        .as_object()
        .map(|o| {
            o.iter()
                .filter_map(|(k, x)| {
                    Some(McpEnv {
                        key: k.clone(),
                        value: x.as_str()?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    if let Some(i) = (0..args.len()).find(|&i| arg_secret(&args, i)) {
        return Err(format!(
            "{name}: an argument looks like a secret (#{}). Put it in \"env\" and paste again.",
            i + 1
        ));
    }
    if remote.is_some_and(url_secret) {
        return Err(format!(
            "{name}: the URL has a secret in its query. Use a header and paste again."
        ));
    }
    if remote.is_some() && v["command"].is_null() {
        for (k, x) in v["headers"].as_object().into_iter().flatten() {
            let Some(x) = x.as_str() else { continue };
            args.push("--header".into());
            if looks_secret(k, x) {
                let var = var_name("HEADER", k);
                args.push(format!("{k}:${{{var}}}"));
                env.push(McpEnv {
                    key: var,
                    value: x.to_string(),
                });
            } else {
                args.push(format!("{k}:{x}"));
            }
        }
    }
    Ok(McpCustom {
        id: None,
        name: name.to_string(),
        description: "Pasted".to_string(),
        command: command.to_string(),
        args,
        env,
    })
}

/// The servers of a pasted JSON text. One bad server fails the whole paste: nothing is half added.
pub fn parse(text: &str) -> Res<Vec<McpCustom>> {
    let doc: Value =
        serde_json::from_str(text).map_err(|e| format!("this is not valid JSON: {e}"))?;
    let map = doc
        .get("mcpServers")
        .or_else(|| doc.get("servers"))
        .unwrap_or(&doc)
        .as_object()
        .ok_or("expected an object with the servers")?;
    if map.is_empty() {
        return Err("no server in this JSON".into());
    }
    map.iter().map(|(n, v)| one(n, v)).collect()
}

/// Add the servers. Returns their ids. When one add fails, the servers added before it go away.
pub fn add_all(agents: &Agents, text: &str) -> Res<Vec<String>> {
    let mut ids = Vec::new();
    for d in parse(text)? {
        match agents.mcp_add_custom(d) {
            Ok(id) => ids.push(id),
            Err(e) => {
                for id in &ids {
                    let _ = agents.mcp_remove(id);
                }
                return Err(e);
            }
        }
    }
    Ok(ids)
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_custom_paste(app: tauri::AppHandle, text: String) -> Api<Vec<String>> {
    blocking(app, move |s: &AppState| add_all(&s.agents, &text)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use shipyard_http::fake::FakeHttp;
    use shipyard_secrets::MemoryStore;
    use std::sync::Arc;

    #[test]
    fn a_local_server_keeps_its_args_and_a_secret_in_args_is_refused() {
        let got = parse(r#"{"mcpServers":{"git":{"command":"uvx","args":["mcp-server-git","--repo","/tmp/x"],"env":{"A":"1"}}}}"#).unwrap();
        assert_eq!(got[0].command, "uvx");
        assert_eq!(got[0].args, ["mcp-server-git", "--repo", "/tmp/x"]);
        for bad in [
            r#"["x","--api-key=abc"]"#,
            r#"["x","--token","abc"]"#,
            r#"["x","sk-123"]"#,
            r#"["x","--header","Authorization: Bearer abc"]"#,
            r#"["x","--header","Cookie: a=b"]"#,
            r#"["x","--url=https://h.dev/m?api_key=abc"]"#,
            r#"["x","k=sk-abc"]"#,
        ] {
            let text = format!(r#"{{"s":{{"command":"c","args":{bad}}}}}"#);
            assert!(parse(&text).err().unwrap().contains("secret"), "{bad}");
        }
        // A reference is not a secret.
        assert!(parse(r#"{"s":{"command":"c","args":["--token=${T}"]}}"#).is_ok());
        assert!(parse(r#"{"s":{"command":"c","args":["task-runner"]}}"#).is_ok());
        assert!(parse("nope").is_err());
        assert!(parse("{}").is_err());
        assert!(parse(r#"{"s":{"args":[]}}"#).is_err());
    }

    #[test]
    fn a_remote_url_with_a_secret_query_and_a_cookie_header_are_handled() {
        let e = parse(r#"{"w":{"url":"https://x.dev/mcp?api_key=abc"}}"#)
            .err()
            .unwrap();
        assert!(e.contains("query"), "{e}");
        assert!(parse(r#"{"w":{"url":"https://x.dev/mcp?page=2"}}"#).is_ok());
        let got = parse(r#"{"w":{"url":"https://x.dev/m","headers":{"Cookie":"a=b"}}}"#).unwrap();
        assert_eq!(got[0].args, ["--header", "Cookie:${HEADER_COOKIE}"]);
    }

    #[test]
    fn a_secret_header_becomes_a_reference_and_the_value_goes_to_the_store() {
        let got = parse(
            r#"{"servers":{"web":{"url":"https://x.dev/mcp","headers":{"Authorization":"Bearer abc","X-Team":"core"}}}}"#,
        )
        .unwrap();
        assert_eq!(
            got[0].args,
            [
                "--header",
                "Authorization:${HEADER_AUTHORIZATION}",
                "--header",
                "X-Team:core"
            ]
        );
        assert_eq!(got[0].env[0].key, "HEADER_AUTHORIZATION");
        assert_eq!(got[0].env[0].value, "Bearer abc");
    }

    #[test]
    fn the_secret_values_reach_the_store_and_never_the_config_file() {
        let dir = tempfile::tempdir().unwrap();
        let agents = Agents::new(
            dir.path(),
            Arc::new(MemoryStore::default()),
            Arc::new(FakeHttp::new()),
            |c| c,
        );
        let ids = add_all(
            &agents,
            r#"{"mcpServers":{
                "git":{"command":"uvx","args":["mcp-server-git"],"env":{"GIT_TOKEN":"s3cret-value"}},
                "web":{"url":"https://x.dev/mcp","headers":{"Authorization":"Bearer hdr-secret"}}}}"#,
        )
        .unwrap();
        assert_eq!(ids.len(), 2);
        let secret = |id: &str, key: &str| {
            agents
                .mcp_field(id, key)
                .unwrap()
                .map(|s| s.expose().to_string())
        };
        assert_eq!(
            secret(&ids[0], "GIT_TOKEN").as_deref(),
            Some("s3cret-value")
        );
        assert_eq!(
            secret(&ids[1], "HEADER_AUTHORIZATION").as_deref(),
            Some("Bearer hdr-secret")
        );
        for entry in std::fs::read_dir(dir.path()).unwrap().flatten() {
            let text = std::fs::read_to_string(entry.path()).unwrap_or_default();
            assert!(!text.contains("s3cret-value") && !text.contains("hdr-secret"));
        }
        assert_eq!(
            agents
                .mcp_list()
                .iter()
                .filter(|r| r.id.starts_with("custom-"))
                .count(),
            2
        );
    }

    #[test]
    fn a_failed_add_removes_the_servers_added_before_it() {
        let dir = tempfile::tempdir().unwrap();
        let agents = Agents::new(
            dir.path(),
            Arc::new(MemoryStore::default()),
            Arc::new(FakeHttp::new()),
            |c| c,
        );
        // "good" sorts first and is added; the NUL in the command of "zbad" fails its add.
        let text = r#"{"good":{"command":"uvx"},"zbad":{"command":"a\u0000b"}}"#;
        assert!(add_all(&agents, text).is_err());
        assert!(
            !agents
                .mcp_list()
                .iter()
                .any(|r| r.id.starts_with("custom-"))
        );
    }
}
