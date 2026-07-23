//! Thin Tauri shell for VeriLock Offline.
//! Document hashing and verification run entirely in the webview (shared SPA).
//! This crate does not read or transmit document file bytes.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
