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
            commands::list_folders,
            commands::save_folder,
            commands::delete_folder,
            commands::rename_folder,
            commands::move_folder,
            commands::list_entries,
            commands::get_entry,
            commands::save_entry,
            commands::delete_entry,
            commands::move_entry,
            commands::toggle_favorite,
            commands::list_contacts,
            commands::save_contact,
            commands::delete_contact,
            commands::move_contact,
            commands::list_apps,
            commands::save_app,
            commands::delete_app,
            commands::move_app,
            commands::search_all,
            commands::touch_recent,
            commands::list_recents,
            commands::seed_demo_data,
            commands::export_json,
            commands::import_json,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BreakGlass");
}
