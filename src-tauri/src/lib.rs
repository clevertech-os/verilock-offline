//! Thin Tauri shell for VeriLock Offline.
//! Document hashing and verification run in the webview (shared SPA).
//! This crate does not read or transmit document file bytes.
//!
//! Native HTTP helpers for product API calls, plus a system-browser Hub login
//! bridge (free loopback port) because embedded WebKit cannot hold Hub keys reliably.

mod hub_login_bridge;

use std::collections::HashMap;
use std::io::Read;

use hub_login_bridge::BridgeSession;

fn assert_allowed_url(url: &str) -> Result<url::Url, String> {
  let parsed = url::Url::parse(url).map_err(|e| e.to_string())?;
  let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
  let allowed = host == "verilock.online"
    || host.ends_with(".verilock.online")
    || host == "localhost"
    || host == "127.0.0.1";
  if parsed.scheme() != "https"
    && !(parsed.scheme() == "http" && (host == "localhost" || host == "127.0.0.1"))
  {
    return Err("Only https (or local http) is allowed".into());
  }
  if !allowed {
    return Err(format!("Host not allowed: {host}"));
  }
  Ok(parsed)
}

fn agent() -> ureq::Agent {
  ureq::AgentBuilder::new()
    .timeout_connect(std::time::Duration::from_secs(10))
    .timeout(std::time::Duration::from_secs(30))
    .build()
}

fn apply_headers(
  req: ureq::Request,
  headers: &Option<HashMap<String, String>>,
) -> ureq::Request {
  let mut req = req;
  if let Some(map) = headers {
    for (k, v) in map {
      let key = k.to_ascii_lowercase();
      if key == "authorization" || key == "accept" || key == "content-type" {
        req = req.set(k, v);
      }
    }
  }
  req
}

#[tauri::command]
fn fetch_json(
  url: String,
  method: String,
  body: Option<String>,
  headers: Option<HashMap<String, String>>,
) -> Result<String, String> {
  let method = method.to_uppercase();
  if method != "GET" && method != "POST" {
    return Err("Only GET and POST are allowed".into());
  }
  let _ = assert_allowed_url(&url)?;

  let response = if method == "GET" {
    let req = apply_headers(agent().get(&url).set("Accept", "application/json"), &headers);
    req.call()
  } else {
    let data = body.unwrap_or_else(|| "{}".into());
    if data.len() > 8192 {
      return Err("Request body too large".into());
    }
    let req = apply_headers(
      agent()
        .post(&url)
        .set("Content-Type", "application/json")
        .set("Accept", "application/json"),
      &headers,
    );
    req.send_string(&data)
  }
  .map_err(|e| e.to_string())?;

  let status = response.status();
  let text = response.into_string().map_err(|e| e.to_string())?;
  if !(200..300).contains(&status) {
    return Err(format!(
      "HTTP {status}: {}",
      text.chars().take(200).collect::<String>()
    ));
  }
  Ok(text)
}

#[tauri::command]
fn fetch_image_data_url(
  url: String,
  headers: Option<HashMap<String, String>>,
) -> Result<String, String> {
  let _ = assert_allowed_url(&url)?;
  if url.to_ascii_lowercase().contains(".pdf") {
    return Err("PDF download is not allowed".into());
  }

  let req = apply_headers(agent().get(&url).set("Accept", "image/*"), &headers);
  let response = req.call().map_err(|e| e.to_string())?;
  let status = response.status();
  if !(200..300).contains(&status) {
    return Err(format!("HTTP {status}"));
  }
  let content_type = response
    .header("content-type")
    .unwrap_or("image/png")
    .to_string();
  if !content_type.starts_with("image/") {
    return Err("Response is not an image".into());
  }
  let mut bytes: Vec<u8> = Vec::new();
  response
    .into_reader()
    .take(512 * 1024)
    .read_to_end(&mut bytes)
    .map_err(|e| e.to_string())?;
  if bytes.is_empty() {
    return Err("Empty image".into());
  }
  if bytes.starts_with(b"%PDF") {
    return Err("PDF bytes are not allowed".into());
  }
  let b64 = base64_encode(&bytes);
  let mime = if content_type.starts_with("image/") {
    content_type.split(';').next().unwrap_or("image/png")
  } else {
    "image/png"
  };
  Ok(format!("data:{mime};base64,{b64}"))
}

/// Open system browser Hub login on an OS-assigned free loopback port.
/// Runs on a blocking pool so the UI thread stays responsive while the user finishes Hub.
#[tauri::command]
async fn login_via_system_browser() -> Result<BridgeSession, String> {
  tauri::async_runtime::spawn_blocking(hub_login_bridge::run_hub_login_bridge)
    .await
    .map_err(|e| format!("Login task failed: {e}"))?
}

/// Hosts the desktop shell may open in the system browser (links, explorers, Hub).
fn assert_openable_external_url(url: &str) -> Result<url::Url, String> {
  let parsed = url::Url::parse(url).map_err(|e| e.to_string())?;
  if parsed.scheme() != "https" {
    return Err("Only https links can be opened".into());
  }
  let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
  let allowed = host == "verilock.online"
    || host.ends_with(".verilock.online")
    || host == "github.com"
    || host.ends_with(".github.com")
    || host == "github.io"
    || host.ends_with(".github.io")
    || host == "nimiq.watch"
    || host.ends_with(".nimiq.watch")
    || host == "nimiq.com"
    || host.ends_with(".nimiq.com")
    || host == "nimiqweb.com"
    || host.ends_with(".nimiqweb.com");
  if !allowed {
    return Err(format!("Host not allowed for external open: {host}"));
  }
  Ok(parsed)
}

/// Open an allowlisted https URL in the system browser (not the embedded webview).
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
  let parsed = assert_openable_external_url(&url)?;
  open::that(parsed.as_str()).map_err(|e| format!("Could not open browser: {e}"))
}

/// Write a print-ready HTML document (page images from the webview) and open it
/// in the system browser. WKWebView/Tauri does not support window.print() reliably.
#[tauri::command]
fn open_print_html(html: String) -> Result<(), String> {
  // Rendered page images as data URLs — cap size so we never write unbounded data.
  const MAX_BYTES: usize = 80 * 1024 * 1024;
  if html.is_empty() {
    return Err("Print document is empty".into());
  }
  if html.len() > MAX_BYTES {
    return Err("Print document is too large".into());
  }
  // Must be our print HTML, not arbitrary shell content.
  if !html.contains("verilock-offline-print") && !html.contains("<!DOCTYPE html>") {
    return Err("Invalid print document".into());
  }

  let dir = std::env::temp_dir().join("verilock-offline-print");
  std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create temp dir: {e}"))?;

  // Prune older print files (best effort) so temp does not grow forever.
  if let Ok(entries) = std::fs::read_dir(&dir) {
    let cutoff = std::time::SystemTime::now()
      .checked_sub(std::time::Duration::from_secs(3600))
      .unwrap_or(std::time::UNIX_EPOCH);
    for entry in entries.flatten() {
      let path = entry.path();
      if path.extension().and_then(|e| e.to_str()) != Some("html") {
        continue;
      }
      if let Ok(meta) = entry.metadata() {
        if let Ok(modified) = meta.modified() {
          if modified < cutoff {
            let _ = std::fs::remove_file(&path);
          }
        }
      }
    }
  }

  let stamp = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0);
  let path = dir.join(format!("print-{stamp}.html"));
  std::fs::write(&path, html.as_bytes()).map_err(|e| format!("Could not write print file: {e}"))?;

  open::that(&path).map_err(|e| {
    format!(
      "Could not open print preview ({}). Open {} manually.",
      e,
      path.display()
    )
  })?;
  Ok(())
}

fn base64_encode(data: &[u8]) -> String {
  const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
  let mut i = 0;
  while i < data.len() {
    let b0 = data[i];
    let b1 = if i + 1 < data.len() { data[i + 1] } else { 0 };
    let b2 = if i + 2 < data.len() { data[i + 2] } else { 0 };
    out.push(TABLE[(b0 >> 2) as usize] as char);
    out.push(TABLE[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
    if i + 1 < data.len() {
      out.push(TABLE[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
    } else {
      out.push('=');
    }
    if i + 2 < data.len() {
      out.push(TABLE[(b2 & 0x3f) as usize] as char);
    } else {
      out.push('=');
    }
    i += 3;
  }
  out
}

fn allow_navigation(url: &url::Url) -> bool {
  let scheme = url.scheme();
  let host = url.host_str().unwrap_or("").to_ascii_lowercase();
  if scheme == "tauri" || scheme == "asset" {
    return true;
  }
  if host == "localhost" || host == "127.0.0.1" || host == "tauri.localhost" {
    return true;
  }
  if host == "hub.nimiq.com" || host.ends_with(".nimiq.com") {
    return true;
  }
  if host == "verilock.online" || host.ends_with(".verilock.online") {
    return true;
  }
  if scheme == "http" || scheme == "https" {
    return host.is_empty() || host == "localhost" || host.ends_with(".localhost");
  }
  false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      fetch_json,
      fetch_image_data_url,
      login_via_system_browser,
      open_external_url,
      open_print_html
    ])
    .plugin(
      tauri::plugin::Builder::<tauri::Wry, ()>::new("navigation")
        .on_navigation(|_webview, url| allow_navigation(url))
        .build(),
    )
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running VeriLock Offline");
}
