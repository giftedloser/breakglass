mod commands;
mod db;
mod models;

use std::sync::Mutex;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let conn = db::init(app.handle())?;
            app.manage(Mutex::new(conn));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_entries,
            commands::get_entry,
            commands::save_entry,
            commands::delete_entry,
            commands::toggle_favorite,
            commands::cycle_status,
            commands::search_entries,
            commands::get_category_counts,
            commands::get_contacts,
            commands::save_contact,
            commands::delete_contact,
            commands::export_json,
            commands::import_json
        ])
        .run(tauri::generate_context!())
        .expect("error while running BreakGlass");
}
