use crate::models::*;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

fn now() -> String { Utc::now().to_rfc3339() }

fn valid_top(t: &str) -> bool { TOP_CATEGORIES.contains(&t) }

// ─────────────── row mappers ───────────────

fn row_to_folder(row: &rusqlite::Row<'_>) -> rusqlite::Result<Folder> {
    Ok(Folder {
        id: row.get("id")?,
        parent_id: row.get("parent_id")?,
        top_category: row.get("top_category")?,
        name: row.get("name")?,
        position: row.get("position")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<Entry> {
    let tags: String = row.get("tags")?;
    let properties: String = row.get("properties").unwrap_or_else(|_| "{}".to_string());
    Ok(Entry {
        id: row.get("id")?,
        title: row.get("title")?,
        top_category: row.get("top_category")?,
        folder_id: row.get("folder_id")?,
        app_id: row.get("app_id").ok(),
        kind: row.get("kind").ok(),
        properties,
        is_favorite: row.get::<_, i64>("is_favorite")? == 1,
        content: row.get("content")?,
        url: row.get("url")?,
        tags: parse_tags(&tags),
        position: row.get("position")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_contact(row: &rusqlite::Row<'_>) -> rusqlite::Result<Contact> {
    let tags: String = row.get("tags")?;
    Ok(Contact {
        id: row.get("id")?,
        folder_id: row.get("folder_id")?,
        name: row.get("name")?,
        role: row.get("role")?,
        company: row.get("company")?,
        phone: row.get("phone")?,
        email: row.get("email")?,
        notes: row.get("notes")?,
        tags: parse_tags(&tags),
        is_favorite: row.get::<_, i64>("is_favorite")? == 1,
        position: row.get("position")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_app(row: &rusqlite::Row<'_>) -> rusqlite::Result<App> {
    let tags: String = row.get("tags")?;
    Ok(App {
        id: row.get("id")?,
        folder_id: row.get("folder_id")?,
        name: row.get("name")?,
        vendor: row.get("vendor")?,
        url: row.get("url")?,
        login_notes: row.get("login_notes")?,
        criticality: row.get("criticality")?,
        tags: parse_tags(&tags),
        is_favorite: row.get::<_, i64>("is_favorite")? == 1,
        position: row.get("position")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn load_entry(conn: &Connection, id: &str) -> Result<Option<Entry>, String> {
    conn.query_row("SELECT * FROM entries WHERE id = ?1", params![id], row_to_entry)
        .optional().map_err(|e| e.to_string())
}
fn load_contact(conn: &Connection, id: &str) -> Result<Option<Contact>, String> {
    conn.query_row("SELECT * FROM contacts WHERE id = ?1", params![id], row_to_contact)
        .optional().map_err(|e| e.to_string())
}
fn load_folder(conn: &Connection, id: &str) -> Result<Option<Folder>, String> {
    conn.query_row("SELECT * FROM folders WHERE id = ?1", params![id], row_to_folder)
        .optional().map_err(|e| e.to_string())
}
fn load_app(conn: &Connection, id: &str) -> Result<Option<App>, String> {
    conn.query_row("SELECT * FROM apps WHERE id = ?1", params![id], row_to_app)
        .optional().map_err(|e| e.to_string())
}

// ─────────────── folders ───────────────

#[tauri::command]
pub fn list_folders(state: State<Mutex<Connection>>) -> Result<Vec<Folder>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT * FROM folders ORDER BY top_category, parent_id, position, name").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_folder).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_folder(state: State<Mutex<Connection>>, folder: FolderInput) -> Result<Folder, String> {
    if !valid_top(&folder.top_category) { return Err(format!("invalid top_category: {}", folder.top_category)); }
    if folder.name.trim().is_empty() { return Err("Folder name required".into()); }
    let conn = state.lock().map_err(|e| e.to_string())?;
    let timestamp = now();
    let id = folder.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing: Option<String> = conn.query_row("SELECT created_at FROM folders WHERE id = ?1", params![id], |row| row.get(0))
        .optional().map_err(|e| e.to_string())?;
    let created_at = existing.unwrap_or_else(|| timestamp.clone());
    let position: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position),0)+1 FROM folders WHERE top_category=?1 AND COALESCE(parent_id,'')=COALESCE(?2,'')",
        params![folder.top_category, folder.parent_id], |row| row.get(0)
    ).unwrap_or(0);
    conn.execute(
        "INSERT INTO folders (id,parent_id,top_category,name,position,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)
         ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id, top_category=excluded.top_category,
         name=excluded.name, updated_at=excluded.updated_at",
        params![id, folder.parent_id, folder.top_category, folder.name.trim(), position, created_at, timestamp],
    ).map_err(|e| e.to_string())?;
    load_folder(&conn, &id)?.ok_or_else(|| "Folder save failed".into())
}

#[tauri::command]
pub fn delete_folder(state: State<Mutex<Connection>>, id: String) -> Result<bool, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let n = conn.execute("DELETE FROM folders WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(n > 0)
}

#[tauri::command]
pub fn rename_folder(state: State<Mutex<Connection>>, id: String, name: String) -> Result<Folder, String> {
    if name.trim().is_empty() { return Err("Folder name required".into()); }
    let conn = state.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE folders SET name=?1, updated_at=?2 WHERE id=?3", params![name.trim(), now(), id])
        .map_err(|e| e.to_string())?;
    load_folder(&conn, &id)?.ok_or_else(|| "Folder not found".into())
}

#[tauri::command]
pub fn move_folder(state: State<Mutex<Connection>>, id: String, new_parent_id: Option<String>) -> Result<Folder, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let cur = load_folder(&conn, &id)?.ok_or_else(|| "Folder not found".to_string())?;
    if let Some(ref np) = new_parent_id {
        let np_top: String = conn.query_row("SELECT top_category FROM folders WHERE id=?1", params![np], |r| r.get(0))
            .optional().map_err(|e| e.to_string())?.ok_or_else(|| "New parent not found".to_string())?;
        if np_top != cur.top_category {
            return Err("Cannot move folder across top-level categories".into());
        }
    }
    conn.execute("UPDATE folders SET parent_id=?1, updated_at=?2 WHERE id=?3",
        params![new_parent_id, now(), id]).map_err(|e| e.to_string())?;
    load_folder(&conn, &id)?.ok_or_else(|| "Folder vanished".into())
}

// ─────────────── entries ───────────────

#[tauri::command]
pub fn list_entries(state: State<Mutex<Connection>>) -> Result<Vec<Entry>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT * FROM entries ORDER BY is_favorite DESC, position, updated_at DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_entry).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_entry(state: State<Mutex<Connection>>, id: String) -> Result<Option<Entry>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    load_entry(&conn, &id)
}

#[tauri::command]
pub fn save_entry(state: State<Mutex<Connection>>, entry: EntryInput) -> Result<Entry, String> {
    if !valid_top(&entry.top_category) { return Err(format!("invalid top_category: {}", entry.top_category)); }
    if entry.title.trim().is_empty() { return Err("Title required".into()); }
    let conn = state.lock().map_err(|e| e.to_string())?;
    let timestamp = now();
    let id = entry.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing: Option<String> = conn.query_row("SELECT created_at FROM entries WHERE id = ?1", params![id], |row| row.get(0))
        .optional().map_err(|e| e.to_string())?;
    let created_at = existing.unwrap_or_else(|| timestamp.clone());
    let tags = serialize_tags(&entry.tags);
    conn.execute(
        "INSERT INTO entries (id,title,top_category,folder_id,app_id,kind,properties,is_favorite,content,url,tags,position,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,0,?12,?13)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, top_category=excluded.top_category,
         folder_id=excluded.folder_id, app_id=excluded.app_id, kind=excluded.kind, properties=excluded.properties,
         is_favorite=excluded.is_favorite, content=excluded.content, url=excluded.url, tags=excluded.tags,
         updated_at=excluded.updated_at",
        params![id, entry.title.trim(), entry.top_category, entry.folder_id, entry.app_id,
                entry.kind, entry.properties, entry.is_favorite as i64,
                entry.content, entry.url, tags, created_at, timestamp],
    ).map_err(|e| e.to_string())?;
    load_entry(&conn, &id)?.ok_or_else(|| "Entry save failed".into())
}

#[tauri::command]
pub fn delete_entry(state: State<Mutex<Connection>>, id: String) -> Result<bool, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let n = conn.execute("DELETE FROM entries WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    let _ = conn.execute("DELETE FROM recents WHERE kind='entry' AND ref_id=?1", params![id]);
    Ok(n > 0)
}

#[tauri::command]
pub fn move_entry(state: State<Mutex<Connection>>, id: String, new_top: String, new_folder_id: Option<String>) -> Result<Entry, String> {
    if !valid_top(&new_top) { return Err(format!("invalid top_category: {new_top}")); }
    let conn = state.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE entries SET top_category=?1, folder_id=?2, app_id=NULL, updated_at=?3 WHERE id=?4",
        params![new_top, new_folder_id, now(), id]).map_err(|e| e.to_string())?;
    load_entry(&conn, &id)?.ok_or_else(|| "Entry vanished".into())
}

#[tauri::command]
pub fn toggle_favorite(state: State<Mutex<Connection>>, id: String, item_type: String) -> Result<bool, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let table = match item_type.as_str() {
        "entry" => "entries", "contact" => "contacts", "app" => "apps",
        _ => return Err("item_type must be entry, contact, or app".into()),
    };
    let current: i64 = conn.query_row(
        &format!("SELECT is_favorite FROM {table} WHERE id = ?1"), params![id], |row| row.get(0)
    ).optional().map_err(|e| e.to_string())?.ok_or_else(|| "Item not found".to_string())?;
    let next = if current == 1 { 0 } else { 1 };
    conn.execute(&format!("UPDATE {table} SET is_favorite = ?1, updated_at = ?2 WHERE id = ?3"),
        params![next, now(), id]).map_err(|e| e.to_string())?;
    Ok(next == 1)
}

// ─────────────── contacts ───────────────

#[tauri::command]
pub fn list_contacts(state: State<Mutex<Connection>>) -> Result<Vec<Contact>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT * FROM contacts ORDER BY is_favorite DESC, position, name").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_contact).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_contact(state: State<Mutex<Connection>>, contact: ContactInput) -> Result<Contact, String> {
    if contact.name.trim().is_empty() { return Err("Name required".into()); }
    let conn = state.lock().map_err(|e| e.to_string())?;
    let timestamp = now();
    let id = contact.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing: Option<String> = conn.query_row("SELECT created_at FROM contacts WHERE id = ?1", params![id], |row| row.get(0))
        .optional().map_err(|e| e.to_string())?;
    let created_at = existing.unwrap_or_else(|| timestamp.clone());
    conn.execute(
        "INSERT INTO contacts (id,folder_id,name,role,company,phone,email,notes,tags,is_favorite,position,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,0,?11,?12)
         ON CONFLICT(id) DO UPDATE SET folder_id=excluded.folder_id, name=excluded.name, role=excluded.role,
         company=excluded.company, phone=excluded.phone, email=excluded.email, notes=excluded.notes,
         tags=excluded.tags, is_favorite=excluded.is_favorite, updated_at=excluded.updated_at",
        params![id, contact.folder_id, contact.name.trim(), contact.role.trim(), contact.company.trim(),
                contact.phone.trim(), contact.email.trim(), contact.notes, serialize_tags(&contact.tags),
                contact.is_favorite as i64, created_at, timestamp],
    ).map_err(|e| e.to_string())?;
    load_contact(&conn, &id)?.ok_or_else(|| "Contact save failed".into())
}

#[tauri::command]
pub fn delete_contact(state: State<Mutex<Connection>>, id: String) -> Result<bool, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let n = conn.execute("DELETE FROM contacts WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    let _ = conn.execute("DELETE FROM recents WHERE kind='contact' AND ref_id=?1", params![id]);
    Ok(n > 0)
}

#[tauri::command]
pub fn move_contact(state: State<Mutex<Connection>>, id: String, new_folder_id: Option<String>) -> Result<Contact, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE contacts SET folder_id=?1, updated_at=?2 WHERE id=?3",
        params![new_folder_id, now(), id]).map_err(|e| e.to_string())?;
    load_contact(&conn, &id)?.ok_or_else(|| "Contact vanished".into())
}

// ─────────────── apps ───────────────

#[tauri::command]
pub fn list_apps(state: State<Mutex<Connection>>) -> Result<Vec<App>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT * FROM apps ORDER BY is_favorite DESC, position, name").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_app).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_app(state: State<Mutex<Connection>>, app: AppInput) -> Result<App, String> {
    if app.name.trim().is_empty() { return Err("App name required".into()); }
    let conn = state.lock().map_err(|e| e.to_string())?;
    let timestamp = now();
    let id = app.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing: Option<String> = conn.query_row("SELECT created_at FROM apps WHERE id = ?1", params![id], |row| row.get(0))
        .optional().map_err(|e| e.to_string())?;
    let created_at = existing.unwrap_or_else(|| timestamp.clone());
    conn.execute(
        "INSERT INTO apps (id,folder_id,name,vendor,url,login_notes,criticality,tags,is_favorite,position,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10,?11)
         ON CONFLICT(id) DO UPDATE SET folder_id=excluded.folder_id, name=excluded.name, vendor=excluded.vendor,
         url=excluded.url, login_notes=excluded.login_notes, criticality=excluded.criticality,
         tags=excluded.tags, is_favorite=excluded.is_favorite, updated_at=excluded.updated_at",
        params![id, app.folder_id, app.name.trim(), app.vendor.trim(), app.url.trim(),
                app.login_notes, app.criticality, serialize_tags(&app.tags),
                app.is_favorite as i64, created_at, timestamp],
    ).map_err(|e| e.to_string())?;
    load_app(&conn, &id)?.ok_or_else(|| "App save failed".into())
}

#[tauri::command]
pub fn delete_app(state: State<Mutex<Connection>>, id: String, cascade_entries: bool) -> Result<bool, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    if cascade_entries {
        conn.execute("DELETE FROM entries WHERE app_id = ?1", params![id]).map_err(|e| e.to_string())?;
    } else {
        conn.execute("UPDATE entries SET app_id = NULL WHERE app_id = ?1", params![id]).map_err(|e| e.to_string())?;
    }
    let n = conn.execute("DELETE FROM apps WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(n > 0)
}

#[tauri::command]
pub fn move_app(state: State<Mutex<Connection>>, id: String, new_folder_id: Option<String>) -> Result<App, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE apps SET folder_id=?1, updated_at=?2 WHERE id=?3",
        params![new_folder_id, now(), id]).map_err(|e| e.to_string())?;
    load_app(&conn, &id)?.ok_or_else(|| "App vanished".into())
}

// ─────────────── search & recents ───────────────

#[tauri::command]
pub fn search_all(state: State<Mutex<Connection>>, query: String) -> Result<Vec<SearchHit>, String> {
    let q = query.trim();
    if q.is_empty() { return Ok(Vec::new()); }
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut hits: Vec<SearchHit> = Vec::new();
    let like = format!("%{}%", q.to_lowercase());

    let mut fstmt = conn.prepare("SELECT id, name, top_category, updated_at FROM folders WHERE lower(name) LIKE ?1 LIMIT 25").map_err(|e| e.to_string())?;
    let frows = fstmt.query_map(params![like], |r| Ok(SearchHit {
        kind: "folder".into(), id: r.get(0)?, title: r.get(1)?, top_category: r.get(2)?,
        snippet: String::new(), is_favorite: false, updated_at: r.get(3)?,
    })).map_err(|e| e.to_string())?;
    for h in frows { hits.push(h.map_err(|e| e.to_string())?); }

    // Apps
    let mut astmt = conn.prepare(
        "SELECT id, name, 'apps', COALESCE(vendor, '') AS snip, is_favorite, updated_at
         FROM apps WHERE lower(name) LIKE ?1 OR lower(vendor) LIKE ?1 LIMIT 25"
    ).map_err(|e| e.to_string())?;
    let arows = astmt.query_map(params![like], |r| Ok(SearchHit {
        kind: "app".into(), id: r.get(0)?, title: r.get(1)?, top_category: r.get(2)?,
        snippet: r.get(3)?, is_favorite: r.get::<_, i64>(4)? == 1, updated_at: r.get(5)?,
    })).map_err(|e| e.to_string())?;
    for h in arows { hits.push(h.map_err(|e| e.to_string())?); }

    let fts_q = q.replace('"', "");
    let mut estmt = conn.prepare(
        "SELECT e.id, e.title, e.top_category,
                snippet(entries_fts, 2, '', '', '...', 16) AS snip,
                e.is_favorite, e.updated_at
         FROM entries_fts JOIN entries e ON e.id = entries_fts.id
         WHERE entries_fts MATCH ?1
         ORDER BY bm25(entries_fts) LIMIT 50"
    ).map_err(|e| e.to_string())?;
    if let Ok(erows) = estmt.query_map(params![fts_q], |r| Ok(SearchHit {
        kind: "entry".into(), id: r.get(0)?, title: r.get(1)?, top_category: r.get(2)?,
        snippet: r.get(3)?, is_favorite: r.get::<_, i64>(4)? == 1, updated_at: r.get(5)?,
    })) {
        for h in erows.flatten() { hits.push(h); }
    } else {
        let mut estmt2 = conn.prepare(
            "SELECT id, title, top_category, '' AS snip, is_favorite, updated_at
             FROM entries WHERE lower(title) LIKE ?1 LIMIT 50"
        ).map_err(|e| e.to_string())?;
        let erows2 = estmt2.query_map(params![like], |r| Ok(SearchHit {
            kind: "entry".into(), id: r.get(0)?, title: r.get(1)?, top_category: r.get(2)?,
            snippet: r.get(3)?, is_favorite: r.get::<_, i64>(4)? == 1, updated_at: r.get(5)?,
        })).map_err(|e| e.to_string())?;
        for h in erows2 { hits.push(h.map_err(|e| e.to_string())?); }
    }

    let mut cstmt = conn.prepare(
        "SELECT id, name, 'contacts', company, is_favorite, updated_at
         FROM contacts
         WHERE lower(name) LIKE ?1 OR lower(company) LIKE ?1 OR lower(role) LIKE ?1
            OR lower(email) LIKE ?1 OR phone LIKE ?1
         LIMIT 25"
    ).map_err(|e| e.to_string())?;
    let crows = cstmt.query_map(params![like], |r| Ok(SearchHit {
        kind: "contact".into(), id: r.get(0)?, title: r.get(1)?, top_category: r.get(2)?,
        snippet: r.get(3)?, is_favorite: r.get::<_, i64>(4)? == 1, updated_at: r.get(5)?,
    })).map_err(|e| e.to_string())?;
    for h in crows { hits.push(h.map_err(|e| e.to_string())?); }

    Ok(hits)
}

#[tauri::command]
pub fn touch_recent(state: State<Mutex<Connection>>, kind: String, id: String) -> Result<(), String> {
    if kind != "entry" && kind != "contact" && kind != "app" {
        return Err("kind must be entry, contact, or app".into());
    }
    let conn = state.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO recents(kind, ref_id, viewed_at) VALUES(?1,?2,?3)
         ON CONFLICT(kind, ref_id) DO UPDATE SET viewed_at=excluded.viewed_at",
        params![kind, id, now()]
    ).map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM recents WHERE rowid NOT IN (
            SELECT rowid FROM recents ORDER BY viewed_at DESC LIMIT 25
         )", []
    ).ok();
    Ok(())
}

#[tauri::command]
pub fn list_recents(state: State<Mutex<Connection>>) -> Result<Vec<RecentItem>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT r.kind, r.ref_id, r.viewed_at,
                COALESCE(e.title, c.name, a.name) AS title,
                COALESCE(e.top_category, 'contacts', 'apps') AS top_category,
                COALESCE(e.folder_id, c.folder_id, a.folder_id) AS folder_id
         FROM recents r
         LEFT JOIN entries  e ON r.kind='entry'   AND e.id = r.ref_id
         LEFT JOIN contacts c ON r.kind='contact' AND c.id = r.ref_id
         LEFT JOIN apps     a ON r.kind='app'     AND a.id = r.ref_id
         WHERE COALESCE(e.id, c.id, a.id) IS NOT NULL
         ORDER BY r.viewed_at DESC
         LIMIT 12"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(RecentItem {
        kind: r.get(0)?, id: r.get(1)?, viewed_at: r.get(2)?,
        title: r.get(3)?, top_category: r.get(4)?, folder_id: r.get(5)?,
    })).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

// ─────────────── attachments ───────────────

use base64::{engine::general_purpose, Engine as _};

fn parent_col(parent_kind: &str) -> Result<&'static str, String> {
    match parent_kind {
        "entry" => Ok("entry_id"),
        "app" => Ok("app_id"),
        "contact" => Ok("contact_id"),
        _ => Err(format!("invalid parent kind: {parent_kind}")),
    }
}

#[tauri::command]
pub fn list_attachments(state: State<Mutex<Connection>>, parent_kind: String, parent_id: String) -> Result<Vec<Attachment>, String> {
    let col = parent_col(&parent_kind)?;
    let conn = state.lock().map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT id, entry_id, app_id, contact_id, filename, mime_type, size_bytes, created_at
         FROM attachments WHERE {col} = ?1 ORDER BY filename"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![parent_id], |r| Ok(Attachment {
        id: r.get(0)?, entry_id: r.get(1)?, app_id: r.get(2)?, contact_id: r.get(3)?,
        filename: r.get(4)?, mime_type: r.get(5)?, size_bytes: r.get(6)?, created_at: r.get(7)?,
    })).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_attachment(
    state: State<Mutex<Connection>>,
    parent_kind: String, parent_id: String,
    filename: String, mime_type: String, data_base64: String,
) -> Result<Attachment, String> {
    let col = parent_col(&parent_kind)?;
    let bytes = general_purpose::STANDARD.decode(data_base64.as_bytes()).map_err(|e| e.to_string())?;
    if bytes.len() > 50 * 1024 * 1024 {
        return Err("Attachment exceeds 50 MB limit".into());
    }
    let conn = state.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let ts = now();
    let sql = format!(
        "INSERT INTO attachments (id, {col}, filename, mime_type, size_bytes, data, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
    );
    conn.execute(&sql, params![id, parent_id, filename, mime_type, bytes.len() as i64, bytes, ts])
        .map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, entry_id, app_id, contact_id, filename, mime_type, size_bytes, created_at FROM attachments WHERE id = ?1",
        params![id],
        |r| Ok(Attachment {
            id: r.get(0)?, entry_id: r.get(1)?, app_id: r.get(2)?, contact_id: r.get(3)?,
            filename: r.get(4)?, mime_type: r.get(5)?, size_bytes: r.get(6)?, created_at: r.get(7)?,
        }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_attachment(state: State<Mutex<Connection>>, id: String) -> Result<bool, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let n = conn.execute("DELETE FROM attachments WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(n > 0)
}

#[tauri::command]
pub fn save_attachment_to(state: State<Mutex<Connection>>, id: String, dest_path: String) -> Result<String, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let bytes: Vec<u8> = conn.query_row(
        "SELECT data FROM attachments WHERE id = ?1", params![id], |r| r.get(0)
    ).map_err(|e| e.to_string())?;
    std::fs::write(&dest_path, bytes).map_err(|e| e.to_string())?;
    Ok(dest_path)
}

#[tauri::command]
pub fn read_attachment_b64(state: State<Mutex<Connection>>, id: String) -> Result<String, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let bytes: Vec<u8> = conn.query_row(
        "SELECT data FROM attachments WHERE id = ?1", params![id], |r| r.get(0)
    ).map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(&bytes))
}

// ─────────────── demo data ───────────────

#[tauri::command]
pub fn seed_demo_data(state: State<Mutex<Connection>>) -> Result<serde_json::Value, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let ts = now();

    let mk_folder = |conn: &Connection, parent_id: Option<&str>, top: &str, name: &str, ts: &str| -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO folders (id,parent_id,top_category,name,position,created_at,updated_at)
             VALUES (?1,?2,?3,?4,0,?5,?5)",
            params![id, parent_id, top, name, ts],
        ).map_err(|e| e.to_string())?;
        Ok(id)
    };

    let mk_entry = |conn: &Connection, top: &str, folder_id: Option<&str>, app_id: Option<&str>,
                    kind: &str, title: &str, body: &str, props_json: &str, url: Option<&str>, ts: &str|
        -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        let content = if body.is_empty() { "{}".to_string() } else {
            serde_json::json!({ "type":"doc", "content": [ { "type":"paragraph", "content": [ { "type":"text", "text": body } ] } ] }).to_string()
        };
        conn.execute(
            "INSERT INTO entries (id,title,top_category,folder_id,app_id,kind,properties,is_favorite,content,url,tags,position,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8,?9,'[]',0,?10,?10)",
            params![id, title, top, folder_id, app_id, kind, props_json, content, url, ts],
        ).map_err(|e| e.to_string())?;
        Ok(id)
    };

    let mk_app = |conn: &Connection, folder_id: Option<&str>, name: &str, vendor: &str,
                  url: &str, login_notes: &str, criticality: &str, ts: &str|
        -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO apps (id,folder_id,name,vendor,url,login_notes,criticality,tags,is_favorite,position,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,'[]',0,0,?8,?8)",
            params![id, folder_id, name, vendor, url, login_notes, criticality, ts],
        ).map_err(|e| e.to_string())?;
        Ok(id)
    };

    // Emergency
    let em_floor = mk_folder(&conn, None, "emergency", "Casino floor", &ts)?;
    let em_hotel = mk_folder(&conn, None, "emergency", "Hotel", &ts)?;
    mk_entry(&conn, "emergency", Some(&em_floor), None, "runbook", "Slot floor offline",
             "1. Check rack PDU. 2. Verify VLAN 10 uplink on core switch. 3. Page IGT support if gaming-side persists past 10 minutes.",
             "{}", None, &ts)?;
    mk_entry(&conn, "emergency", Some(&em_floor), None, "runbook", "Loss of power - casino side",
             "Generator should kick in within 30s. If not, contact facilities at extension 4400.",
             "{}", None, &ts)?;
    mk_entry(&conn, "emergency", Some(&em_hotel), None, "runbook", "Hotel lock system down",
             "Front desk uses manual override keys until INFOR check-in is restored. See How To > Reset hotel lock system.",
             "{}", None, &ts)?;

    // Servers
    let srv_inf = mk_folder(&conn, None, "servers", "Infra", &ts)?;
    let srv_gam = mk_folder(&conn, None, "servers", "Gaming", &ts)?;
    mk_entry(&conn, "servers", Some(&srv_inf), None, "server", "DC01",
             "Primary domain controller. Replicates to DC02 every 15 min.",
             r#"{"name":"DC01","ip":"10.10.20.10","role":"Primary AD / DNS"}"#, None, &ts)?;
    mk_entry(&conn, "servers", Some(&srv_inf), None, "server", "DC02",
             "Secondary DC. Holds FSMO roles for the DR site.",
             r#"{"name":"DC02","ip":"10.10.20.11","role":"Secondary AD / DNS"}"#, None, &ts)?;
    mk_entry(&conn, "servers", Some(&srv_inf), None, "server", "File-SRV-01",
             "Shared drives map here. Backed up nightly to NAS.",
             r#"{"name":"File-SRV-01","ip":"10.10.20.30","role":"SMB file share"}"#, None, &ts)?;
    mk_entry(&conn, "servers", Some(&srv_gam), None, "server", "Slot-DB-01",
             "Hosts IGT slot database. Replicates to Slot-DB-02 hot-standby.",
             r#"{"name":"Slot-DB-01","ip":"10.10.10.20","role":"IGT EZPay backing DB"}"#, None, &ts)?;

    // DBs
    let db_inf = mk_folder(&conn, None, "dbs", "Infra", &ts)?;
    let db_gam = mk_folder(&conn, None, "dbs", "Gaming", &ts)?;
    let db_snips = mk_folder(&conn, None, "dbs", "Snippets", &ts)?;
    mk_entry(&conn, "dbs", Some(&db_gam), None, "database", "slot_main",
             "Production slot DB. Read replica at slot-db-02.",
             r#"{"name":"slot_main","host":"10.10.10.20"}"#, None, &ts)?;
    mk_entry(&conn, "dbs", Some(&db_inf), None, "database", "hotel_pms",
             "INFOR PMS backing DB. Restart only with vendor on the line.",
             r#"{"name":"hotel_pms","host":"10.10.20.40"}"#, None, &ts)?;
    mk_entry(&conn, "dbs", Some(&db_snips), None, "snippet", "List active sessions (MSSQL)",
             "",
             r#"{"engine":"MSSQL","sql":"SELECT session_id, login_name, host_name, program_name\nFROM sys.dm_exec_sessions\nWHERE is_user_process = 1\nORDER BY login_time DESC;"}"#,
             None, &ts)?;
    mk_entry(&conn, "dbs", Some(&db_snips), None, "snippet", "Top expensive queries",
             "",
             r#"{"engine":"MSSQL","sql":"SELECT TOP 25\n  total_worker_time/execution_count AS avg_cpu,\n  total_elapsed_time/execution_count AS avg_elapsed,\n  execution_count,\n  SUBSTRING(t.text, (s.statement_start_offset/2)+1,\n    ((CASE s.statement_end_offset WHEN -1 THEN DATALENGTH(t.text)\n      ELSE s.statement_end_offset END - s.statement_start_offset)/2)+1) AS query_text\nFROM sys.dm_exec_query_stats s\nCROSS APPLY sys.dm_exec_sql_text(s.sql_handle) t\nORDER BY avg_cpu DESC;"}"#,
             None, &ts)?;

    // Network
    let net_v = mk_folder(&conn, None, "network", "VLANs", &ts)?;
    let net_s = mk_folder(&conn, None, "network", "Subnets", &ts)?;
    let net_d = mk_folder(&conn, None, "network", "Devices", &ts)?;
    mk_entry(&conn, "network", Some(&net_v), None, "vlan", "VLAN 10 - Slot floor",
             "All gaming devices on the floor. Isolated from corp by FW rule G-10.",
             r#"{"vlan_id":"10","subnet":"10.10.10.0/24","gateway":"10.10.10.1","purpose":"Gaming floor"}"#, None, &ts)?;
    mk_entry(&conn, "network", Some(&net_v), None, "vlan", "VLAN 20 - Back office",
             "Staff workstations and printers.",
             r#"{"vlan_id":"20","subnet":"10.10.20.0/24","gateway":"10.10.20.1","purpose":"Back office"}"#, None, &ts)?;
    mk_entry(&conn, "network", Some(&net_v), None, "vlan", "VLAN 30 - Hotel",
             "Guest WiFi and hotel-side systems.",
             r#"{"vlan_id":"30","subnet":"10.10.30.0/24","gateway":"10.10.30.1","purpose":"Hotel / guest"}"#, None, &ts)?;
    mk_entry(&conn, "network", Some(&net_s), None, "subnet", "10.10.10.0/24",
             "Slot floor subnet. DHCP 10.10.10.50-200.",
             r#"{"cidr":"10.10.10.0/24","gateway":"10.10.10.1","dhcp_range":"10.10.10.50 - .200"}"#, None, &ts)?;
    mk_entry(&conn, "network", Some(&net_d), None, "switch", "core-sw01",
             "Core stack. Aruba 6300, mgmt IP below.",
             r#"{"hostname":"core-sw01","ip":"10.10.0.2","model":"Aruba 6300","location":"MDF"}"#, None, &ts)?;

    // Apps
    let apps_igt = mk_folder(&conn, None, "apps", "IGT", &ts)?;
    let apps_ms = mk_folder(&conn, None, "apps", "Microsoft", &ts)?;
    let igt_ezpay = mk_app(&conn, Some(&apps_igt), "EZPay", "IGT",
        "https://ezpay.igt.com",
        "SSO via Okta. Break-glass admin in Bitwarden as 'igt-ezpay-admin'.",
        "high", &ts)?;
    mk_entry(&conn, "apps", None, Some(&igt_ezpay), "generic", "EZPay license renewal",
             "Annual renewal in November. Submit PO to procurement 30 days prior. Vendor contact: Sarah Chen.",
             "{}", None, &ts)?;
    mk_entry(&conn, "apps", None, Some(&igt_ezpay), "generic", "EZPay login broken",
             "1. Check Okta status. 2. Re-enroll MFA in Okta admin. 3. Have user retry from a known IP.",
             "{}", None, &ts)?;
    let igt_patron = mk_app(&conn, Some(&apps_igt), "Patron", "IGT",
        "https://patron.igt.com",
        "Same Okta SSO as EZPay.",
        "medium", &ts)?;
    mk_entry(&conn, "apps", None, Some(&igt_patron), "generic", "Card reader reset",
             "Power cycle the kiosk. If still red LED, swap reader from spares cabinet C-12.",
             "{}", None, &ts)?;
    let ms_excel = mk_app(&conn, Some(&apps_ms), "Excel", "Microsoft",
        "https://office.com",
        "Licensed via Microsoft 365 E3.",
        "low", &ts)?;
    mk_entry(&conn, "apps", None, Some(&ms_excel), "generic", "Re-activate Office",
             "If Office shows 'product deactivated', sign out under File > Account, sign back in with corp creds.",
             "{}", None, &ts)?;

    // Notes
    let notes_q = mk_folder(&conn, None, "notes", "Quirks & gotchas", &ts)?;
    mk_entry(&conn, "notes", Some(&notes_q), None, "generic", "Outlook PST quirk",
             "If Outlook freezes opening a large PST, increase the cache size in registry under HKCU\\Software\\Microsoft\\Office.",
             "{}", None, &ts)?;
    mk_entry(&conn, "notes", None, None, "generic", "Bitwarden vault pointers",
             "Admin vault is 'breakglass-admin'. Daily-use vault is 'mj-personal'. Recovery codes in physical safe (combo with Sarah).",
             "{}", None, &ts)?;

    // How To
    mk_entry(&conn, "howto", None, None, "generic", "Reset marquee sign",
             "1. Open closet C-04. 2. Unplug controller. 3. Wait 30 seconds. 4. Plug back in, wait for boot tone.",
             "{}", None, &ts)?;
    mk_entry(&conn, "howto", None, None, "generic", "Reset hotel lock system",
             "On the front desk PC, run 'InnFinity Service Restart' shortcut. Wait for tray icon green. Locks resume within 60s.",
             "{}", None, &ts)?;
    mk_entry(&conn, "howto", None, None, "generic", "Unlock an AD user account",
             "ADUC > Find user > Account tab > uncheck 'Account is locked out' > OK. Or run: Unlock-ADAccount -Identity <samaccountname>",
             "{}", None, &ts)?;

    // Weekly Reports
    mk_entry(&conn, "weekly", None, None, "report", "Week of 2026-05-25",
             "",
             r#"{"week_of":"2026-05-25","summary":"Quiet week overall. No incidents on the gaming side. One small AD lockout cluster mid-week handled via runbook.","accomplishments":"- Replaced switch in MDF (core-sw02)\n- Closed 12 helpdesk tickets\n- Reviewed and updated emergency runbooks\n- Re-enrolled 4 users in Okta MFA","blockers":"Still waiting on PO approval for the UPS replacement. Finance has it in queue.","next_steps":"- Schedule hotel-side firmware update for the locks (target weekend)\n- Walk the floor with Sarah to map gaming VLAN gaps\n- Inventory pass on spare card readers"}"#,
             None, &ts)?;

    // Site Links
    mk_entry(&conn, "sitelinks", None, None, "generic", "Okta admin",
             "", r#"{"description":"User MFA, SSO config, app assignments."}"#, Some("https://admin.okta.com"), &ts)?;
    mk_entry(&conn, "sitelinks", None, None, "generic", "IGT support portal",
             "", r#"{"description":"Ticket submission and license renewals."}"#, Some("https://support.igt.com"), &ts)?;
    mk_entry(&conn, "sitelinks", None, None, "generic", "Microsoft 365 admin",
             "", r#"{"description":"User licenses, mailboxes, Teams config."}"#, Some("https://admin.microsoft.com"), &ts)?;

    Ok(serde_json::json!({ "ok": true }))
}

// ─────────────── export / import ───────────────

#[tauri::command]
pub fn export_json(app: AppHandle, state: State<Mutex<Connection>>) -> Result<String, String> {
    let default_name = format!("breakglass-backup-{}.json", Utc::now().format("%Y%m%d-%H%M%S"));
    let path = app.dialog().file().add_filter("JSON backup", &["json"])
        .set_file_name(&default_name).blocking_save_file()
        .ok_or_else(|| "Export cancelled".to_string())?
        .into_path().map_err(|e| e.to_string())?;
    let folders = list_folders(state.clone())?;
    let apps = list_apps(state.clone())?;
    let entries = list_entries(state.clone())?;
    let contacts = list_contacts(state)?;
    let data = ExportData { version: 3, exported_at: now(), folders, apps, entries, contacts };
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_json(state: State<Mutex<Connection>>, path: String) -> Result<serde_json::Value, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let data: ExportData = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if data.version < 2 || data.version > 3 { return Err("Unsupported backup version".into()); }
    let mut folders_imported = 0;
    let mut apps_imported = 0;
    let mut entries_imported = 0;
    let mut contacts_imported = 0;
    for f in data.folders {
        save_folder(state.clone(), FolderInput {
            id: Some(f.id), parent_id: f.parent_id, top_category: f.top_category, name: f.name,
        })?;
        folders_imported += 1;
    }
    for a in data.apps {
        save_app(state.clone(), AppInput {
            id: Some(a.id), folder_id: a.folder_id, name: a.name, vendor: a.vendor, url: a.url,
            login_notes: a.login_notes, criticality: a.criticality, tags: a.tags, is_favorite: a.is_favorite,
        })?;
        apps_imported += 1;
    }
    for e in data.entries {
        save_entry(state.clone(), EntryInput {
            id: Some(e.id), title: e.title, top_category: e.top_category, folder_id: e.folder_id,
            app_id: e.app_id, kind: e.kind, properties: e.properties,
            is_favorite: e.is_favorite, content: e.content, url: e.url, tags: e.tags,
        })?;
        entries_imported += 1;
    }
    for c in data.contacts {
        save_contact(state.clone(), ContactInput {
            id: Some(c.id), folder_id: c.folder_id, name: c.name, role: c.role, company: c.company,
            phone: c.phone, email: c.email, notes: c.notes, tags: c.tags, is_favorite: c.is_favorite,
        })?;
        contacts_imported += 1;
    }
    Ok(serde_json::json!({
        "folders_imported": folders_imported,
        "apps_imported": apps_imported,
        "entries_imported": entries_imported,
        "contacts_imported": contacts_imported,
    }))
}
