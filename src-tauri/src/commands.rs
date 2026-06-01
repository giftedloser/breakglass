use crate::models::*;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<Entry> {
    let tags: String = row.get("tags")?;
    Ok(Entry {
        id: row.get("id")?,
        title: row.get("title")?,
        category: row.get("category")?,
        status: row.get("status")?,
        severity: row.get("severity")?,
        is_favorite: row.get::<_, i64>("is_favorite")? == 1,
        content: row.get("content")?,
        tags: parse_tags(&tags),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_contact(row: &rusqlite::Row<'_>) -> rusqlite::Result<Contact> {
    let tags: String = row.get("tags")?;
    Ok(Contact {
        id: row.get("id")?,
        name: row.get("name")?,
        role: row.get("role")?,
        company: row.get("company")?,
        phone: row.get("phone")?,
        email: row.get("email")?,
        notes: row.get("notes")?,
        tags: parse_tags(&tags),
        is_favorite: row.get::<_, i64>("is_favorite")? == 1,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn load_entry(conn: &Connection, id: &str) -> Result<Option<Entry>, String> {
    conn.query_row("SELECT * FROM entries WHERE id = ?1", params![id], row_to_entry)
        .optional()
        .map_err(|e| e.to_string())
}

fn load_contact(conn: &Connection, id: &str) -> Result<Option<Contact>, String> {
    conn.query_row("SELECT * FROM contacts WHERE id = ?1", params![id], row_to_contact)
        .optional()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_entries(
    state: State<Mutex<Connection>>,
    category: Option<String>,
    status: Option<String>,
    favorites_only: bool,
    tag: Option<String>,
) -> Result<Vec<Entry>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    let mut stmt = conn
        .prepare("SELECT * FROM entries ORDER BY is_favorite DESC, updated_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_entry)
        .map_err(|e| e.to_string())?;
    for row in rows {
        let entry = row.map_err(|e| e.to_string())?;
        let category_ok = category.as_ref().map_or(true, |v| &entry.category == v);
        let status_ok = status.as_ref().map_or(true, |v| &entry.status == v);
        let favorite_ok = !favorites_only || entry.is_favorite;
        let tag_ok = tag.as_ref().map_or(true, |v| entry.tags.iter().any(|t| t == v));
        if category_ok && status_ok && favorite_ok && tag_ok {
            entries.push(entry);
        }
    }
    Ok(entries)
}

#[tauri::command]
pub fn get_entry(state: State<Mutex<Connection>>, id: String) -> Result<Option<Entry>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    load_entry(&conn, &id)
}

#[tauri::command]
pub fn save_entry(state: State<Mutex<Connection>>, entry: EntryInput) -> Result<Entry, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let timestamp = now();
    let id = entry.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing: Option<String> = conn
        .query_row("SELECT created_at FROM entries WHERE id = ?1", params![id], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    let created_at = existing.unwrap_or_else(|| timestamp.clone());
    let tags = serialize_tags(&entry.tags);
    conn.execute(
        "INSERT INTO entries (id,title,category,status,severity,is_favorite,content,tags,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, category=excluded.category, status=excluded.status,
         severity=excluded.severity, is_favorite=excluded.is_favorite, content=excluded.content, tags=excluded.tags,
         updated_at=excluded.updated_at",
        params![id, entry.title.trim(), entry.category, entry.status, entry.severity, entry.is_favorite as i64, entry.content, tags, created_at, timestamp],
    )
    .map_err(|e| e.to_string())?;
    load_entry(&conn, &id)?.ok_or_else(|| "Saved entry could not be loaded".to_string())
}

#[tauri::command]
pub fn delete_entry(state: State<Mutex<Connection>>, id: String) -> Result<bool, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let rows = conn.execute("DELETE FROM entries WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(rows > 0)
}

#[tauri::command]
pub fn toggle_favorite(
    state: State<Mutex<Connection>>,
    id: String,
    item_type: String,
) -> Result<bool, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let table = match item_type.as_str() {
        "entry" => "entries",
        "contact" => "contacts",
        _ => return Err("item_type must be entry or contact".to_string()),
    };
    let current: i64 = conn
        .query_row(&format!("SELECT is_favorite FROM {table} WHERE id = ?1"), params![id], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Item not found".to_string())?;
    let next = if current == 1 { 0 } else { 1 };
    conn.execute(&format!("UPDATE {table} SET is_favorite = ?1, updated_at = ?2 WHERE id = ?3"), params![next, now(), id])
        .map_err(|e| e.to_string())?;
    Ok(next == 1)
}

#[tauri::command]
pub fn cycle_status(state: State<Mutex<Connection>>, id: String) -> Result<String, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let current: String = conn
        .query_row("SELECT status FROM entries WHERE id = ?1", params![id], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Entry not found".to_string())?;
    let next = match current.as_str() {
        "draft" => "in_progress",
        "in_progress" => "active",
        _ => "draft",
    };
    conn.execute("UPDATE entries SET status = ?1, updated_at = ?2 WHERE id = ?3", params![next, now(), id])
        .map_err(|e| e.to_string())?;
    Ok(next.to_string())
}

#[tauri::command]
pub fn search_entries(state: State<Mutex<Connection>>, query: String) -> Result<Vec<SearchResult>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.title, e.category, snippet(entries_fts, 2, '', '', '...', 18) AS snippet,
                    e.status, e.severity, e.is_favorite, e.updated_at
             FROM entries_fts JOIN entries e ON e.id = entries_fts.id
             WHERE entries_fts MATCH ?1
             ORDER BY bm25(entries_fts)
             LIMIT 50",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![q], |row| {
            Ok(SearchResult {
                id: row.get(0)?,
                title: row.get(1)?,
                category: row.get(2)?,
                snippet: row.get(3)?,
                status: row.get(4)?,
                severity: row.get(5)?,
                is_favorite: row.get::<_, i64>(6)? == 1,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_category_counts(state: State<Mutex<Connection>>) -> Result<Vec<CategoryCount>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT category, COUNT(*) AS count,
             SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) AS draft_count,
             SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS in_progress_count
             FROM entries GROUP BY category",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CategoryCount {
                category: row.get(0)?,
                count: row.get(1)?,
                draft_count: row.get(2)?,
                in_progress_count: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_contacts(
    state: State<Mutex<Connection>>,
    favorites_only: bool,
    tag: Option<String>,
) -> Result<Vec<Contact>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut contacts = Vec::new();
    let mut stmt = conn
        .prepare("SELECT * FROM contacts ORDER BY is_favorite DESC, updated_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_contact).map_err(|e| e.to_string())?;
    for row in rows {
        let contact = row.map_err(|e| e.to_string())?;
        let favorite_ok = !favorites_only || contact.is_favorite;
        let tag_ok = tag.as_ref().map_or(true, |v| contact.tags.iter().any(|t| t == v));
        if favorite_ok && tag_ok {
            contacts.push(contact);
        }
    }
    Ok(contacts)
}

#[tauri::command]
pub fn save_contact(state: State<Mutex<Connection>>, contact: ContactInput) -> Result<Contact, String> {
    if contact.name.trim().is_empty() {
        return Err("Name is required".to_string());
    }
    let conn = state.lock().map_err(|e| e.to_string())?;
    let timestamp = now();
    let id = contact.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing: Option<String> = conn
        .query_row("SELECT created_at FROM contacts WHERE id = ?1", params![id], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    let created_at = existing.unwrap_or_else(|| timestamp.clone());
    conn.execute(
        "INSERT INTO contacts (id,name,role,company,phone,email,notes,tags,is_favorite,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, company=excluded.company,
         phone=excluded.phone, email=excluded.email, notes=excluded.notes, tags=excluded.tags,
         is_favorite=excluded.is_favorite, updated_at=excluded.updated_at",
        params![
            id,
            contact.name.trim(),
            contact.role.trim(),
            contact.company.trim(),
            contact.phone.trim(),
            contact.email.trim(),
            contact.notes,
            serialize_tags(&contact.tags),
            contact.is_favorite as i64,
            created_at,
            timestamp
        ],
    )
    .map_err(|e| e.to_string())?;
    load_contact(&conn, &id)?.ok_or_else(|| "Saved contact could not be loaded".to_string())
}

#[tauri::command]
pub fn delete_contact(state: State<Mutex<Connection>>, id: String) -> Result<bool, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let rows = conn.execute("DELETE FROM contacts WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(rows > 0)
}

#[tauri::command]
pub fn export_json(app: AppHandle, state: State<Mutex<Connection>>) -> Result<String, String> {
    let default_name = format!("breakglass-backup-{}.json", Utc::now().format("%Y%m%d-%H%M%S"));
    let path = app
        .dialog()
        .file()
        .add_filter("JSON backup", &["json"])
        .set_file_name(&default_name)
        .blocking_save_file()
        .ok_or_else(|| "Export cancelled".to_string())?
        .into_path()
        .map_err(|e| e.to_string())?;
    let entries = get_entries(state.clone(), None, None, false, None)?;
    let contacts = get_contacts(state, false, None)?;
    let data = ExportData {
        version: 1,
        exported_at: now(),
        entries,
        contacts,
    };
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_json(state: State<Mutex<Connection>>, path: String) -> Result<serde_json::Value, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let data: ExportData = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if data.version != 1 {
        return Err("Unsupported backup version".to_string());
    }
    let mut entries_imported = 0;
    let mut contacts_imported = 0;
    for entry in data.entries {
        let input = EntryInput {
            id: Some(entry.id),
            title: entry.title,
            category: entry.category,
            status: entry.status,
            severity: entry.severity,
            is_favorite: entry.is_favorite,
            content: entry.content,
            tags: entry.tags,
        };
        save_entry(state.clone(), input)?;
        entries_imported += 1;
    }
    for contact in data.contacts {
        let input = ContactInput {
            id: Some(contact.id),
            name: contact.name,
            role: contact.role,
            company: contact.company,
            phone: contact.phone,
            email: contact.email,
            notes: contact.notes,
            tags: contact.tags,
            is_favorite: contact.is_favorite,
        };
        save_contact(state.clone(), input)?;
        contacts_imported += 1;
    }
    Ok(serde_json::json!({ "entries_imported": entries_imported, "contacts_imported": contacts_imported }))
}
