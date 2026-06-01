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
    Ok(Entry {
        id: row.get("id")?,
        title: row.get("title")?,
        top_category: row.get("top_category")?,
        folder_id: row.get("folder_id")?,
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

// ─────────────── folders ───────────────

#[tauri::command]
pub fn list_folders(state: State<Mutex<Connection>>) -> Result<Vec<Folder>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT * FROM folders ORDER BY top_category, parent_id, position, name")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_folder).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_folder(state: State<Mutex<Connection>>, folder: FolderInput) -> Result<Folder, String> {
    if !valid_top(&folder.top_category) {
        return Err(format!("invalid top_category: {}", folder.top_category));
    }
    if folder.name.trim().is_empty() { return Err("Folder name required".into()); }
    let conn = state.lock().map_err(|e| e.to_string())?;
    let timestamp = now();
    let id = folder.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing: Option<String> = conn
        .query_row("SELECT created_at FROM folders WHERE id = ?1", params![id], |row| row.get(0))
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
    // Children cascade. Entries/contacts in the folder get folder_id=NULL via ON DELETE SET NULL.
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
    // New parent must be in same top_category if provided.
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
    if !valid_top(&entry.top_category) {
        return Err(format!("invalid top_category: {}", entry.top_category));
    }
    if entry.title.trim().is_empty() { return Err("Title required".into()); }
    let conn = state.lock().map_err(|e| e.to_string())?;
    let timestamp = now();
    let id = entry.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing: Option<String> = conn
        .query_row("SELECT created_at FROM entries WHERE id = ?1", params![id], |row| row.get(0))
        .optional().map_err(|e| e.to_string())?;
    let created_at = existing.unwrap_or_else(|| timestamp.clone());
    let tags = serialize_tags(&entry.tags);
    conn.execute(
        "INSERT INTO entries (id,title,top_category,folder_id,is_favorite,content,url,tags,position,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,?9,?10)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, top_category=excluded.top_category,
         folder_id=excluded.folder_id, is_favorite=excluded.is_favorite, content=excluded.content,
         url=excluded.url, tags=excluded.tags, updated_at=excluded.updated_at",
        params![id, entry.title.trim(), entry.top_category, entry.folder_id, entry.is_favorite as i64,
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
    conn.execute("UPDATE entries SET top_category=?1, folder_id=?2, updated_at=?3 WHERE id=?4",
        params![new_top, new_folder_id, now(), id]).map_err(|e| e.to_string())?;
    load_entry(&conn, &id)?.ok_or_else(|| "Entry vanished".into())
}

#[tauri::command]
pub fn toggle_favorite(state: State<Mutex<Connection>>, id: String, item_type: String) -> Result<bool, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let table = match item_type.as_str() {
        "entry" => "entries", "contact" => "contacts",
        _ => return Err("item_type must be entry or contact".into()),
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
    let mut stmt = conn.prepare(
        "SELECT * FROM contacts ORDER BY is_favorite DESC, position, name"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_contact).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_contact(state: State<Mutex<Connection>>, contact: ContactInput) -> Result<Contact, String> {
    if contact.name.trim().is_empty() { return Err("Name required".into()); }
    let conn = state.lock().map_err(|e| e.to_string())?;
    let timestamp = now();
    let id = contact.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing: Option<String> = conn
        .query_row("SELECT created_at FROM contacts WHERE id = ?1", params![id], |row| row.get(0))
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

// ─────────────── search & recents ───────────────

#[tauri::command]
pub fn search_all(state: State<Mutex<Connection>>, query: String) -> Result<Vec<SearchHit>, String> {
    let q = query.trim();
    if q.is_empty() { return Ok(Vec::new()); }
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut hits: Vec<SearchHit> = Vec::new();
    let like = format!("%{}%", q.to_lowercase());

    // Folders by name
    let mut fstmt = conn.prepare(
        "SELECT id, name, top_category, updated_at FROM folders WHERE lower(name) LIKE ?1 LIMIT 25"
    ).map_err(|e| e.to_string())?;
    let frows = fstmt.query_map(params![like], |r| Ok(SearchHit {
        kind: "folder".into(), id: r.get(0)?, title: r.get(1)?, top_category: r.get(2)?,
        snippet: String::new(), is_favorite: false, updated_at: r.get(3)?,
    })).map_err(|e| e.to_string())?;
    for h in frows { hits.push(h.map_err(|e| e.to_string())?); }

    // Entries via FTS
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
        // FTS rejected the query (e.g. syntax). Fall back to LIKE on title.
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

    // Contacts by name/company/role/email/phone
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
    if kind != "entry" && kind != "contact" {
        return Err("kind must be entry or contact".into());
    }
    let conn = state.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO recents(kind, ref_id, viewed_at) VALUES(?1,?2,?3)
         ON CONFLICT(kind, ref_id) DO UPDATE SET viewed_at=excluded.viewed_at",
        params![kind, id, now()]
    ).map_err(|e| e.to_string())?;
    // Trim to 25 most recent
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
                COALESCE(e.title, c.name) AS title,
                COALESCE(e.top_category, 'contacts') AS top_category,
                COALESCE(e.folder_id, c.folder_id) AS folder_id
         FROM recents r
         LEFT JOIN entries  e ON r.kind='entry'   AND e.id = r.ref_id
         LEFT JOIN contacts c ON r.kind='contact' AND c.id = r.ref_id
         WHERE COALESCE(e.id, c.id) IS NOT NULL
         ORDER BY r.viewed_at DESC
         LIMIT 12"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(RecentItem {
        kind: r.get(0)?, id: r.get(1)?, viewed_at: r.get(2)?,
        title: r.get(3)?, top_category: r.get(4)?, folder_id: r.get(5)?,
    })).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
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
    let entries = list_entries(state.clone())?;
    let contacts = list_contacts(state)?;
    let data = ExportData { version: 2, exported_at: now(), folders, entries, contacts };
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_json(state: State<Mutex<Connection>>, path: String) -> Result<serde_json::Value, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let data: ExportData = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if data.version != 2 { return Err("Unsupported backup version".into()); }
    let mut folders_imported = 0;
    let mut entries_imported = 0;
    let mut contacts_imported = 0;
    for f in data.folders {
        let input = FolderInput {
            id: Some(f.id), parent_id: f.parent_id, top_category: f.top_category, name: f.name,
        };
        save_folder(state.clone(), input)?;
        folders_imported += 1;
    }
    for e in data.entries {
        let input = EntryInput {
            id: Some(e.id), title: e.title, top_category: e.top_category, folder_id: e.folder_id,
            is_favorite: e.is_favorite, content: e.content, url: e.url, tags: e.tags,
        };
        save_entry(state.clone(), input)?;
        entries_imported += 1;
    }
    for c in data.contacts {
        let input = ContactInput {
            id: Some(c.id), folder_id: c.folder_id, name: c.name, role: c.role, company: c.company,
            phone: c.phone, email: c.email, notes: c.notes, tags: c.tags, is_favorite: c.is_favorite,
        };
        save_contact(state.clone(), input)?;
        contacts_imported += 1;
    }
    Ok(serde_json::json!({
        "folders_imported": folders_imported,
        "entries_imported": entries_imported,
        "contacts_imported": contacts_imported,
    }))
}
