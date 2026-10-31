//! Figma in Design / Screens: the files of a Figma project, the preview of a file, its design
//! tokens (the local variables), and the view of a `.fig` file of the repository. The token is the
//! one of the Figma tools (`conn:figma/token` in the OS keychain): one place for one setting.
//! Each call reads; nothing is written to Figma.

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use shipyard_http::{Auth, Http, Request};
use shipyard_secrets::Secret;
use shipyard_store::fig_view::{self, FigView};
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking, err};
use crate::work::need_click;

const API: &str = "https://api.figma.com/v1";
/// A `.fig` file of the repository is read up to this size.
const MAX_FIG: u64 = 64 * 1_048_576;
const NO_TOKEN: &str = "no Figma token: add the token of your Figma account first";

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FigmaFile {
    pub key: String,
    pub name: String,
    pub last_modified: String,
}

/// One design token: a Figma variable with the value of its first mode.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct DesignToken {
    pub name: String,
    pub kind: String,
    pub value: String,
}

/// The file key of a Figma address (`/file/<key>/`, `/design/<key>/`) or of a bare key.
pub fn file_key(text: &str) -> Res<String> {
    let t = text.trim();
    let key = ["/file/", "/design/", "/proto/"]
        .iter()
        .find_map(|m| t.split_once(m).map(|(_, rest)| rest))
        .unwrap_or(t)
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default();
    if key.is_empty() || key.len() > 64 || !key.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("this is not a Figma file address".into());
    }
    Ok(key.into())
}

fn get(http: &dyn Http, token: &Secret, path: &str) -> Res<Value> {
    let req = Request::get(
        format!("{API}{path}"),
        Auth::Header("X-Figma-Token", token.clone()),
    )
    .timeout(Duration::from_secs(20));
    http.send(&req)
        .map_err(err)?
        .ok()
        .map_err(err)?
        .json()
        .map_err(err)
}

/// The files of a Figma project. `project` is the number in the address of the project.
pub fn files(http: &dyn Http, token: &Secret, project: &str) -> Res<Vec<FigmaFile>> {
    let id = project
        .trim()
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("");
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit()) {
        return Err("this is not a Figma project address".into());
    }
    let v = get(http, token, &format!("/projects/{id}/files"))?;
    let text = |f: &Value, k: &str| f.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    Ok(v.get("files")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|f| FigmaFile {
            key: text(f, "key"),
            name: text(f, "name"),
            last_modified: text(f, "last_modified"),
        })
        .collect())
}

/// The PNG preview of a file: the picture that Figma keeps of its first page.
pub fn preview(http: &dyn Http, token: &Secret, key: &str) -> Res<Vec<u8>> {
    let v = get(http, token, &format!("/files/{key}?depth=1"))?;
    let url = v
        .get("thumbnailUrl")
        .and_then(Value::as_str)
        .filter(|u| u.starts_with("https://"))
        .ok_or("this Figma file has no preview")?;
    let res = http
        .send(&Request::get(url, Auth::None).timeout(Duration::from_secs(20)))
        .map_err(err)?
        .ok()
        .map_err(err)?;
    Ok(res.body)
}

fn colour(v: &Value) -> Option<String> {
    let c = |k: &str| v.get(k).and_then(Value::as_f64);
    let (r, g, b) = (c("r")?, c("g")?, c("b")?);
    let byte = |x: f64| (x.clamp(0.0, 1.0) * 255.0).round() as u8;
    let a = c("a").unwrap_or(1.0);
    Some(if a >= 1.0 {
        format!("#{:02x}{:02x}{:02x}", byte(r), byte(g), byte(b))
    } else {
        format!("rgba({}, {}, {}, {a:.2})", byte(r), byte(g), byte(b))
    })
}

/// The local variables of a file as design tokens, by name.
pub fn tokens(http: &dyn Http, token: &Secret, key: &str) -> Res<Vec<DesignToken>> {
    let v = get(http, token, &format!("/files/{key}/variables/local"))?;
    let vars = v.pointer("/meta/variables").and_then(Value::as_object);
    let mut out: Vec<DesignToken> = vars
        .into_iter()
        .flatten()
        .filter_map(|(_, var)| {
            let first = var
                .get("valuesByMode")
                .and_then(Value::as_object)?
                .values()
                .next()?;
            let value = match first {
                Value::Object(o) if o.get("type").is_some_and(|t| t == "VARIABLE_ALIAS") => {
                    "alias".to_string()
                }
                Value::Object(_) => colour(first)?,
                Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            Some(DesignToken {
                name: var.get("name")?.as_str()?.to_string(),
                kind: var
                    .get("resolvedType")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_lowercase(),
                value,
            })
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

fn token(s: &AppState) -> Res<Secret> {
    s.agents
        .mcp_field("figma", "token")?
        .ok_or_else(|| NO_TOKEN.into())
}

/// The preview of a `.fig` file of the repository.
pub fn fig_file(s: &AppState, rel: &str) -> Res<FigView> {
    let p = crate::design::project(s)?;
    let full = shipyard_store::design::resolve(&p.root, &p.file, rel)?;
    let meta = std::fs::metadata(&full).map_err(|e| format!("{rel}: {e}"))?;
    if !meta.is_file() || meta.len() > MAX_FIG {
        return Err(format!("{rel}: not a file or too big"));
    }
    fig_view::read(&std::fs::read(&full).map_err(err)?).map_err(err)
}

/// Whether a Figma token is in the keychain. The value never leaves the backend.
#[tauri::command]
#[specta::specta]
pub async fn figma_token_state(app: AppHandle) -> Api<bool> {
    blocking(app, |s| Ok(s.agents.mcp_field("figma", "token")?.is_some())).await
}

/// Saves the Figma token in the OS keychain, after a click.
#[tauri::command]
#[specta::specta]
pub async fn figma_token_set(app: AppHandle, token: String, click: bool) -> Api<()> {
    blocking(app, move |s| {
        need_click(s, click)?;
        s.agents
            .mcp_set_field("figma", "token", Secret::new(token.trim()))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn figma_files(app: AppHandle, project: String) -> Api<Vec<FigmaFile>> {
    blocking(app, move |s| {
        files(&*s.connections.http(), &token(s)?, &project)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn figma_preview(app: AppHandle, file: String) -> Api<Vec<u8>> {
    blocking(app, move |s| {
        preview(&*s.connections.http(), &token(s)?, &file_key(&file)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn figma_tokens(app: AppHandle, file: String) -> Api<Vec<DesignToken>> {
    blocking(app, move |s| {
        tokens(&*s.connections.http(), &token(s)?, &file_key(&file)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn design_fig_view(app: AppHandle, path: String) -> Api<FigView> {
    blocking(app, move |s| fig_file(s, &path)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use shipyard_http::fake::FakeHttp;

    #[test]
    fn a_key_comes_from_an_address_or_stands_alone() {
        assert_eq!(
            file_key("https://www.figma.com/design/AbC123/Shop?node-id=1").unwrap(),
            "AbC123"
        );
        assert_eq!(
            file_key("https://www.figma.com/file/XyZ9/x").unwrap(),
            "XyZ9"
        );
        assert_eq!(file_key(" AbC123 ").unwrap(), "AbC123");
        assert!(file_key("https://example.com/../etc").is_err());
        assert!(file_key("").is_err());
    }

    #[test]
    fn the_list_the_preview_and_the_tokens_read_the_figma_api_with_the_token_header() {
        let http = FakeHttp::new();
        let tok = Secret::new("figd_test");
        http.get(
            "/v1/projects/42/files",
            200,
            r#"{"files":[{"key":"AbC","name":"Shop","last_modified":"2026-10-01T10:00:00Z"}]}"#,
        );
        http.get(
            "/v1/files/AbC?depth=1",
            200,
            r#"{"thumbnailUrl":"https://s3.example.com/thumb.png"}"#,
        );
        http.get("thumb.png", 200, "PNGDATA");
        http.get(
            "/v1/files/AbC/variables/local",
            200,
            r#"{"meta":{"variables":{
                "1":{"name":"color/primary","resolvedType":"COLOR","valuesByMode":{"m":{"r":1,"g":0,"b":0,"a":1}}},
                "2":{"name":"space/s","resolvedType":"FLOAT","valuesByMode":{"m":4}}
            }}}"#,
        );
        let list = files(&http, &tok, "https://www.figma.com/files/project/42").unwrap();
        assert_eq!(
            (list[0].key.as_str(), list[0].name.as_str()),
            ("AbC", "Shop")
        );
        assert!(files(&http, &tok, "../x").is_err());
        assert_eq!(preview(&http, &tok, "AbC").unwrap(), b"PNGDATA");
        let t = tokens(&http, &tok, "AbC").unwrap();
        assert_eq!(
            t,
            [
                DesignToken {
                    name: "color/primary".into(),
                    kind: "color".into(),
                    value: "#ff0000".into()
                },
                DesignToken {
                    name: "space/s".into(),
                    kind: "float".into(),
                    value: "4".into()
                }
            ]
        );
        let sent = http.requests();
        assert!(sent[0].url.starts_with("https://api.figma.com/v1/"));
        assert!(
            !sent[0].url.contains("figd_test"),
            "the token is never in the address"
        );
    }
}
