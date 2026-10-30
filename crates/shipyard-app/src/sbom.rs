//! SBOM export (CycloneDX 1.5 JSON) from the lock files of the project. The app reads the lock files itself, so the
//! export needs no tool. Cargo.lock, package-lock.json and pnpm-lock.yaml are read.

use std::collections::BTreeSet;
use std::path::Path;

use serde::Serialize;
use serde_json::{Value, json};
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking};
use crate::work::need_click;

/// Where the export goes.
pub const SBOM_FILE: &str = "docs/security/sbom.cdx.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SbomReport {
    pub path: String,
    pub components: u32,
    /// The lock files that were read.
    pub sources: Vec<String>,
}

/// One package: ecosystem (purl type), name, version.
type Pkg = (&'static str, String, String);

/// `[[package]]` blocks of Cargo.lock. A package without a `source` is a workspace crate: skip it.
fn cargo(text: &str) -> Vec<Pkg> {
    let mut out = Vec::new();
    for block in text.split("[[package]]").skip(1) {
        let field = |k: &str| {
            block
                .lines()
                .find_map(|l| l.strip_prefix(k)?.strip_prefix(" = \"")?.strip_suffix('"'))
        };
        if let (Some(n), Some(v), Some(_)) = (field("name"), field("version"), field("source")) {
            out.push(("cargo", n.into(), v.into()));
        }
    }
    out
}

fn npm_lock(text: &str) -> Vec<Pkg> {
    let Ok(v) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    let Some(map) = v["packages"].as_object() else {
        return Vec::new();
    };
    map.iter()
        .filter_map(|(k, p)| {
            let name = k.rsplit_once("node_modules/")?.1;
            Some(("npm", name.into(), p["version"].as_str()?.into()))
        })
        .collect()
}

/// The `packages:` section of pnpm-lock.yaml (v6 `/name@1.0.0:` and v9 `name@1.0.0:` keys).
fn pnpm_lock(text: &str) -> Vec<Pkg> {
    let mut in_packages = false;
    let mut out = Vec::new();
    for line in text.lines() {
        if !line.starts_with(' ') && !line.is_empty() {
            in_packages = line.trim_end() == "packages:";
            continue;
        }
        let Some(key) = line
            .strip_prefix("  ")
            .filter(|k| in_packages && !k.starts_with(' '))
        else {
            continue;
        };
        let key = key
            .trim_end_matches(':')
            .trim_matches('\'')
            .trim_start_matches('/');
        let key = key.split('(').next().unwrap_or(key);
        if let Some((name, version)) = key.rsplit_once('@').filter(|(n, _)| !n.is_empty()) {
            out.push(("npm", name.into(), version.into()));
        }
    }
    out
}

/// The CycloneDX document of the lock files in `root`, or an error when there is none.
pub fn build(root: &Path, at: &str) -> Result<(Value, SbomReport), String> {
    let mut pkgs = BTreeSet::new();
    let mut sources = Vec::new();
    for (file, read) in [
        ("Cargo.lock", cargo as fn(&str) -> Vec<Pkg>),
        ("package-lock.json", npm_lock),
        ("pnpm-lock.yaml", pnpm_lock),
    ] {
        if let Ok(text) = std::fs::read_to_string(root.join(file)) {
            pkgs.extend(read(&text));
            sources.push(file.to_string());
        }
    }
    if sources.is_empty() {
        return Err("no lock file: Cargo.lock, package-lock.json or pnpm-lock.yaml".into());
    }
    let components: Vec<Value> = pkgs
        .iter()
        .map(|(eco, name, version)| {
            let purl = match *eco {
                "npm" => format!("pkg:npm/{}@{version}", name.replacen('@', "%40", 1)),
                _ => format!("pkg:cargo/{name}@{version}"),
            };
            json!({"type": "library", "bom-ref": purl, "name": name, "version": version, "purl": purl})
        })
        .collect();
    let report = SbomReport {
        path: SBOM_FILE.into(),
        components: components.len() as u32,
        sources,
    };
    let bom = json!({
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "version": 1,
        "metadata": {"timestamp": at, "tools": [{"name": "shipyard"}]},
        "components": components,
    });
    Ok((bom, report))
}

pub fn export(s: &AppState, click: bool) -> Res<SbomReport> {
    need_click(s, click)?;
    let root: std::path::PathBuf = s
        .registry()?
        .active()
        .ok_or("no active project")?
        .path
        .clone()
        .into();
    let (bom, report) = build(&root, &crate::code::now_iso())?;
    let path = root.join(SBOM_FILE);
    std::fs::create_dir_all(path.parent().expect("the SBOM has a folder"))
        .and_then(|()| {
            std::fs::write(
                &path,
                serde_json::to_string_pretty(&bom).unwrap_or_default(),
            )
        })
        .map_err(|e| e.to_string())?;
    Ok(report)
}

#[tauri::command]
#[specta::specta]
pub async fn code_sbom_export(app: AppHandle, click: bool) -> Api<SbomReport> {
    blocking(app, move |s| export(s, click)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_files_become_one_sorted_document() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(
            d.path().join("Cargo.lock"),
            "[[package]]\nname = \"me\"\nversion = \"0.1.0\"\n\n[[package]]\nname = \"serde\"\nversion = \"1.0.0\"\nsource = \"registry+x\"\n",
        )
        .unwrap();
        std::fs::write(
            d.path().join("pnpm-lock.yaml"),
            "lockfileVersion: '9.0'\npackages:\n  '@scope/a@2.0.0':\n    resolution: {}\n  react@19.0.0(x@1):\n    r: 1\nsnapshots:\n  zzz@1.0.0:\n",
        )
        .unwrap();
        let (bom, r) = build(d.path(), "2026-10-30T00:00:00Z").unwrap();
        assert_eq!(r.components, 3);
        assert_eq!(r.sources, ["Cargo.lock", "pnpm-lock.yaml"]);
        assert_eq!(bom["specVersion"], "1.5");
        let purls: Vec<_> = bom["components"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["purl"].as_str().unwrap())
            .collect();
        assert!(purls.contains(&"pkg:npm/%40scope/a@2.0.0"));
        assert!(purls.contains(&"pkg:npm/react@19.0.0"));
        assert!(purls.contains(&"pkg:cargo/serde@1.0.0"));
    }

    #[test]
    fn no_lock_file_is_an_error() {
        let d = tempfile::tempdir().unwrap();
        assert!(build(d.path(), "t").is_err());
    }

    #[test]
    fn npm_lock_keeps_the_nested_name() {
        let t = r#"{"packages":{"":{"version":"1"},"node_modules/a/node_modules/@s/b":{"version":"3.0.0"}}}"#;
        assert_eq!(
            npm_lock(t),
            [("npm", "@s/b".to_string(), "3.0.0".to_string())]
        );
    }
}
