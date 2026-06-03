use crate::models::*;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

fn now() -> String { Utc::now().to_rfc3339() }

fn valid_top(t: &str) -> bool { TOP_CATEGORIES.contains(&t) }

fn search_terms(query: &str) -> Vec<String> {
    query.to_lowercase().split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty()).take(8).map(|s| s.to_string()).collect()
}

fn collapse_spaces(text: &str) -> String { text.split_whitespace().collect::<Vec<_>>().join(" ") }

fn normalize_search_text(text: &str) -> String { collapse_spaces(&text.to_lowercase()) }

fn flatten_json_text(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::String(s) => out.push(s.clone()),
        Value::Number(n) => out.push(n.to_string()),
        Value::Bool(b) => out.push(b.to_string()),
        Value::Array(items) => for item in items { flatten_json_text(item, out); },
        Value::Object(map) => {
            for (key, item) in map {
                if key == "type" { continue; }
                if !matches!(key.as_str(), "content" | "attrs" | "text" | "marks") {
                    out.push(key.replace(['_', '-'], " "));
                }
                flatten_json_text(item, out);
            }
        }
        Value::Null => {}
    }
}

fn readable_text(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() { return String::new(); }
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        let mut parts = Vec::new();
        flatten_json_text(&value, &mut parts);
        return collapse_spaces(&parts.join(" "));
    }
    collapse_spaces(trimmed)
}

fn text_words(text: &str) -> Vec<&str> {
    text.split(|c: char| !c.is_alphanumeric()).filter(|s| !s.is_empty()).collect()
}

fn levenshtein_limited(a: &str, b: &str, limit: usize) -> usize {
    if a == b { return 0; }
    if a.len().abs_diff(b.len()) > limit { return limit + 1; }

    let mut prev: Vec<usize> = (0..=b.chars().count()).collect();
    let mut curr = vec![0; prev.len()];
    for (i, ca) in a.chars().enumerate() {
        curr[0] = i + 1;
        let mut row_min = curr[0];
        for (j, cb) in b.chars().enumerate() {
            let cost = if ca == cb { 0 } else { 1 };
            curr[j + 1] = (prev[j + 1] + 1).min(curr[j] + 1).min(prev[j] + cost);
            row_min = row_min.min(curr[j + 1]);
        }
        if row_min > limit { return limit + 1; }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b.chars().count()]
}

fn fuzzy_word_match(word: &str, term: &str) -> bool {
    if term.len() < 4 || word.len() < 4 { return false; }
    if word.starts_with(term) || word.contains(term) { return true; }
    let limit = if term.len() >= 7 { 2 } else { 1 };
    levenshtein_limited(word, term, limit) <= limit
}

fn all_terms_match(text: &str, terms: &[String]) -> bool {
    if terms.is_empty() { return false; }
    let words = text_words(text);
    terms.iter().all(|term| text.contains(term) || words.iter().any(|word| fuzzy_word_match(word, term)))
}

fn word_starts_with(text: &str, term: &str) -> bool {
    text_words(text).iter().any(|word| word.starts_with(term))
}

fn truncate_chars(text: &str, max: usize) -> String {
    let mut out = String::new();
    for ch in text.chars().take(max) { out.push(ch); }
    if text.chars().count() > max { out.push_str("..."); }
    out
}

fn search_snippet(fields: &[String], terms: &[String]) -> String {
    for field in fields {
        let clean = readable_text(field);
        if clean.is_empty() { continue; }
        let lower = clean.to_lowercase();
        let hit = terms.iter().filter(|t| !t.is_empty()).find_map(|term| lower.find(term));
        if let Some(idx) = hit {
            let start = clean[..idx].char_indices().rev().nth(24).map(|(i, _)| i).unwrap_or(0);
            let end = clean[idx..].char_indices().nth(72).map(|(i, _)| idx + i).unwrap_or(clean.len());
            let mut snippet = clean[start..end].trim().to_string();
            if start > 0 { snippet.insert_str(0, "..."); }
            if end < clean.len() { snippet.push_str("..."); }
            return snippet;
        }
    }

    fields.iter()
        .map(|f| readable_text(f))
        .find(|f| !f.is_empty())
        .map(|f| truncate_chars(&f, 96))
        .unwrap_or_default()
}

fn search_score(title: &str, fields: &[String], query: &str, terms: &[String], is_favorite: bool) -> Option<i64> {
    let title_text = normalize_search_text(title);
    let haystack = normalize_search_text(&format!("{} {}", title, fields.iter().map(|f| readable_text(f)).collect::<Vec<_>>().join(" ")));
    let query_text = normalize_search_text(query);
    let mut score = 0;
    let mut matched = false;

    if title_text == query_text { score += 1200; matched = true; }
    else if title_text.starts_with(&query_text) { score += 950; matched = true; }
    else if terms.iter().any(|term| word_starts_with(&title_text, term)) { score += 720; matched = true; }
    else if title_text.contains(&query_text) { score += 650; matched = true; }

    if all_terms_match(&title_text, terms) { score += 520; matched = true; }
    if haystack.contains(&query_text) { score += 260; matched = true; }
    if all_terms_match(&haystack, terms) { score += 180; matched = true; }
    if is_favorite && matched { score += 30; }

    matched.then_some(score)
}

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
    let terms = search_terms(q);
    let mut scored: Vec<(i64, SearchHit)> = Vec::new();

    let mut fstmt = conn.prepare("SELECT id, name, top_category, updated_at FROM folders ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    let frows = fstmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?))).map_err(|e| e.to_string())?;
    for row in frows {
        let (id, name, top_category, updated_at) = row.map_err(|e| e.to_string())?;
        let fields = vec![top_category.clone()];
        if let Some(score) = search_score(&name, &fields, q, &terms, false) {
            scored.push((score, SearchHit {
                kind: "folder".into(), id, title: name, top_category,
                snippet: String::new(), is_favorite: false, updated_at,
            }));
        }
    }

    let mut estmt = conn.prepare(
        "SELECT id, title, top_category, content, properties, tags, is_favorite, updated_at, COALESCE(url, ''), COALESCE(kind, '')
         FROM entries ORDER BY is_favorite DESC, updated_at DESC"
    ).map_err(|e| e.to_string())?;
    let erows = estmt.query_map([], |r| Ok((
        r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?,
        r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?,
        r.get::<_, i64>(6)? == 1, r.get::<_, String>(7)?, r.get::<_, String>(8)?,
        r.get::<_, String>(9)?,
    ))).map_err(|e| e.to_string())?;
    for row in erows {
        let (id, title, top_category, content, properties, tags, is_favorite, updated_at, url, kind) = row.map_err(|e| e.to_string())?;
        let fields = vec![properties, content, tags, url, kind, top_category.clone()];
        if let Some(score) = search_score(&title, &fields, q, &terms, is_favorite) {
            let snippet = search_snippet(&fields, &terms);
            scored.push((score, SearchHit {
                kind: "entry".into(), id, title, top_category,
                snippet, is_favorite, updated_at,
            }));
        }
    }

    let mut astmt = conn.prepare(
        "SELECT id, name, vendor, url, login_notes, criticality, tags, is_favorite, updated_at
         FROM apps ORDER BY is_favorite DESC, updated_at DESC"
    ).map_err(|e| e.to_string())?;
    let arows = astmt.query_map([], |r| Ok((
        r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?,
        r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?,
        r.get::<_, String>(6)?, r.get::<_, i64>(7)? == 1, r.get::<_, String>(8)?,
    ))).map_err(|e| e.to_string())?;
    for row in arows {
        let (id, name, vendor, url, login_notes, criticality, tags, is_favorite, updated_at) = row.map_err(|e| e.to_string())?;
        let fields = vec![vendor, url, login_notes, criticality, tags];
        if let Some(score) = search_score(&name, &fields, q, &terms, is_favorite) {
            let snippet = search_snippet(&fields, &terms);
            scored.push((score, SearchHit {
                kind: "app".into(), id, title: name, top_category: "apps".into(),
                snippet, is_favorite, updated_at,
            }));
        }
    }

    let mut cstmt = conn.prepare(
        "SELECT id, name, role, company, phone, email, notes, tags, is_favorite, updated_at
         FROM contacts ORDER BY is_favorite DESC, updated_at DESC"
    ).map_err(|e| e.to_string())?;
    let crows = cstmt.query_map([], |r| Ok((
        r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?,
        r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?,
        r.get::<_, String>(6)?, r.get::<_, String>(7)?, r.get::<_, i64>(8)? == 1,
        r.get::<_, String>(9)?,
    ))).map_err(|e| e.to_string())?;
    for row in crows {
        let (id, name, role, company, phone, email, notes, tags, is_favorite, updated_at) = row.map_err(|e| e.to_string())?;
        let fields = vec![role, company, phone, email, notes, tags];
        if let Some(score) = search_score(&name, &fields, q, &terms, is_favorite) {
            let snippet = search_snippet(&fields, &terms);
            scored.push((score, SearchHit {
                kind: "contact".into(), id, title: name, top_category: "contacts".into(),
                snippet, is_favorite, updated_at,
            }));
        }
    }

    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.updated_at.cmp(&a.1.updated_at)).then_with(|| a.1.title.cmp(&b.1.title)));
    Ok(scored.into_iter().take(100).map(|(_, hit)| hit).collect())
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

// ─────────────── category counts ───────────────

#[tauri::command]
pub fn category_counts(state: State<Mutex<Connection>>) -> Result<serde_json::Value, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut out = serde_json::Map::new();

    let entry_top_counts: Vec<(String, i64)> = {
        let mut stmt = conn.prepare("SELECT top_category, COUNT(*) FROM entries GROUP BY top_category").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))).map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?
    };
    for (top, n) in entry_top_counts { out.insert(top, serde_json::json!(n)); }

    let contacts: i64 = conn.query_row("SELECT COUNT(*) FROM contacts", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    out.insert("contacts".into(), serde_json::json!(contacts));
    let apps: i64 = conn.query_row("SELECT COUNT(*) FROM apps", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    out.insert("apps".into(), serde_json::json!(apps));

    for top in TOP_CATEGORIES {
        if !out.contains_key(*top) { out.insert((*top).into(), serde_json::json!(0)); }
    }
    Ok(serde_json::Value::Object(out))
}

// ─────────────── per-category export / import ───────────────

fn collect_attachments_for(conn: &Connection, col: &str, ids: &[String]) -> Result<Vec<serde_json::Value>, String> {
    if ids.is_empty() { return Ok(Vec::new()); }
    let placeholders = ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, entry_id, app_id, contact_id, filename, mime_type, size_bytes, data, created_at
         FROM attachments WHERE {col} IN ({placeholders})"
    );
    let id_params: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params_from_iter(id_params), |r| {
        let blob: Vec<u8> = r.get(7)?;
        Ok(serde_json::json!({
            "id": r.get::<_, String>(0)?,
            "entry_id": r.get::<_, Option<String>>(1)?,
            "app_id": r.get::<_, Option<String>>(2)?,
            "contact_id": r.get::<_, Option<String>>(3)?,
            "filename": r.get::<_, String>(4)?,
            "mime_type": r.get::<_, String>(5)?,
            "size_bytes": r.get::<_, i64>(6)?,
            "data_base64": general_purpose::STANDARD.encode(&blob),
            "created_at": r.get::<_, String>(8)?,
        }))
    }).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

fn collect_all_attachments(conn: &Connection) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, entry_id, app_id, contact_id, filename, mime_type, size_bytes, data, created_at
         FROM attachments ORDER BY filename"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| {
        let blob: Vec<u8> = r.get(7)?;
        Ok(serde_json::json!({
            "id": r.get::<_, String>(0)?,
            "entry_id": r.get::<_, Option<String>>(1)?,
            "app_id": r.get::<_, Option<String>>(2)?,
            "contact_id": r.get::<_, Option<String>>(3)?,
            "filename": r.get::<_, String>(4)?,
            "mime_type": r.get::<_, String>(5)?,
            "size_bytes": r.get::<_, i64>(6)?,
            "data_base64": general_purpose::STANDARD.encode(&blob),
            "created_at": r.get::<_, String>(8)?,
        }))
    }).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_category(app: AppHandle, state: State<Mutex<Connection>>, category: String) -> Result<String, String> {
    if !valid_top(&category) { return Err(format!("invalid category: {category}")); }
    let default_name = format!("breakglass-{}-{}.json", category, Utc::now().format("%Y%m%d-%H%M%S"));
    let path = app.dialog().file().add_filter("JSON", &["json"])
        .set_file_name(&default_name).blocking_save_file()
        .ok_or_else(|| "Export cancelled".to_string())?
        .into_path().map_err(|e| e.to_string())?;

    let conn = state.lock().map_err(|e| e.to_string())?;

    let folders: Vec<Folder> = {
        let mut stmt = conn.prepare("SELECT * FROM folders WHERE top_category = ?1 ORDER BY position, name").map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![category], row_to_folder).map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?
    };

    let payload = if category == "contacts" {
        let contacts: Vec<Contact> = {
            let mut stmt = conn.prepare("SELECT * FROM contacts ORDER BY name").map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], row_to_contact).map_err(|e| e.to_string())?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?
        };
        let ids: Vec<String> = contacts.iter().map(|c| c.id.clone()).collect();
        let atts = collect_attachments_for(&conn, "contact_id", &ids)?;
        serde_json::json!({
            "version": 1, "category": "contacts", "exported_at": now(),
            "folders": folders, "contacts": contacts, "attachments": atts,
        })
    } else if category == "apps" {
        let apps: Vec<App> = {
            let mut stmt = conn.prepare("SELECT * FROM apps ORDER BY name").map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], row_to_app).map_err(|e| e.to_string())?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?
        };
        let entries: Vec<Entry> = {
            let mut stmt = conn.prepare("SELECT * FROM entries WHERE top_category = 'apps' ORDER BY title").map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], row_to_entry).map_err(|e| e.to_string())?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?
        };
        let app_ids: Vec<String> = apps.iter().map(|a| a.id.clone()).collect();
        let entry_ids: Vec<String> = entries.iter().map(|e| e.id.clone()).collect();
        let mut atts = collect_attachments_for(&conn, "app_id", &app_ids)?;
        atts.extend(collect_attachments_for(&conn, "entry_id", &entry_ids)?);
        serde_json::json!({
            "version": 1, "category": "apps", "exported_at": now(),
            "folders": folders, "apps": apps, "entries": entries, "attachments": atts,
        })
    } else {
        let entries: Vec<Entry> = {
            let mut stmt = conn.prepare("SELECT * FROM entries WHERE top_category = ?1 ORDER BY title").map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![category], row_to_entry).map_err(|e| e.to_string())?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?
        };
        let ids: Vec<String> = entries.iter().map(|e| e.id.clone()).collect();
        let atts = collect_attachments_for(&conn, "entry_id", &ids)?;
        serde_json::json!({
            "version": 1, "category": category, "exported_at": now(),
            "folders": folders, "entries": entries, "attachments": atts,
        })
    };

    let json = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_category(state: State<Mutex<Connection>>, category: String, path: String) -> Result<serde_json::Value, String> {
    if !valid_top(&category) { return Err(format!("invalid category: {category}")); }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let payload: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let file_category = payload.get("category").and_then(|v| v.as_str()).unwrap_or("");
    if file_category != category {
        return Err(format!("File category is '{file_category}', not '{category}'. Refusing to import."));
    }

    let mut conn = state.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut folders_in = 0; let mut entries_in = 0; let mut contacts_in = 0; let mut apps_in = 0; let mut atts_in = 0;

    if let Some(arr) = payload.get("folders").and_then(|v| v.as_array()) {
        for f in arr {
            let id = f.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let parent_id = f.get("parent_id").and_then(|v| v.as_str());
            let name = f.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let position = f.get("position").and_then(|v| v.as_i64()).unwrap_or(0);
            let created_at = f.get("created_at").and_then(|v| v.as_str()).unwrap_or(&*now()).to_string();
            let updated_at = f.get("updated_at").and_then(|v| v.as_str()).unwrap_or(&*now()).to_string();
            if id.is_empty() || name.is_empty() { continue; }
            tx.execute(
                "INSERT INTO folders (id,parent_id,top_category,name,position,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)
                 ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id, name=excluded.name,
                 position=excluded.position, updated_at=excluded.updated_at",
                params![id, parent_id, category, name, position, created_at, updated_at],
            ).map_err(|e| e.to_string())?;
            folders_in += 1;
        }
    }

    if category == "contacts" {
        if let Some(arr) = payload.get("contacts").and_then(|v| v.as_array()) {
            for c in arr {
                let id = c.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let name = c.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if id.is_empty() || name.is_empty() { continue; }
                let folder_id = c.get("folder_id").and_then(|v| v.as_str());
                let role = c.get("role").and_then(|v| v.as_str()).unwrap_or("");
                let company = c.get("company").and_then(|v| v.as_str()).unwrap_or("");
                let phone = c.get("phone").and_then(|v| v.as_str()).unwrap_or("");
                let email = c.get("email").and_then(|v| v.as_str()).unwrap_or("");
                let notes = c.get("notes").and_then(|v| v.as_str()).unwrap_or("");
                let tags = c.get("tags").map(|v| v.to_string()).unwrap_or_else(|| "[]".into());
                let is_fav = c.get("is_favorite").and_then(|v| v.as_bool()).unwrap_or(false) as i64;
                let created_at = c.get("created_at").and_then(|v| v.as_str()).unwrap_or(&*now()).to_string();
                let updated_at = c.get("updated_at").and_then(|v| v.as_str()).unwrap_or(&*now()).to_string();
                tx.execute(
                    "INSERT INTO contacts (id,folder_id,name,role,company,phone,email,notes,tags,is_favorite,position,created_at,updated_at)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,0,?11,?12)
                     ON CONFLICT(id) DO UPDATE SET folder_id=excluded.folder_id, name=excluded.name,
                     role=excluded.role, company=excluded.company, phone=excluded.phone, email=excluded.email,
                     notes=excluded.notes, tags=excluded.tags, is_favorite=excluded.is_favorite,
                     updated_at=excluded.updated_at",
                    params![id, folder_id, name, role, company, phone, email, notes, tags, is_fav, created_at, updated_at],
                ).map_err(|e| e.to_string())?;
                contacts_in += 1;
            }
        }
    } else if category == "apps" {
        if let Some(arr) = payload.get("apps").and_then(|v| v.as_array()) {
            for a in arr {
                let id = a.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let name = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if id.is_empty() || name.is_empty() { continue; }
                let folder_id = a.get("folder_id").and_then(|v| v.as_str());
                let vendor = a.get("vendor").and_then(|v| v.as_str()).unwrap_or("");
                let url = a.get("url").and_then(|v| v.as_str()).unwrap_or("");
                let login_notes = a.get("login_notes").and_then(|v| v.as_str()).unwrap_or("");
                let criticality = a.get("criticality").and_then(|v| v.as_str()).unwrap_or("");
                let tags = a.get("tags").map(|v| v.to_string()).unwrap_or_else(|| "[]".into());
                let is_fav = a.get("is_favorite").and_then(|v| v.as_bool()).unwrap_or(false) as i64;
                let created_at = a.get("created_at").and_then(|v| v.as_str()).unwrap_or(&*now()).to_string();
                let updated_at = a.get("updated_at").and_then(|v| v.as_str()).unwrap_or(&*now()).to_string();
                tx.execute(
                    "INSERT INTO apps (id,folder_id,name,vendor,url,login_notes,criticality,tags,is_favorite,position,created_at,updated_at)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10,?11)
                     ON CONFLICT(id) DO UPDATE SET folder_id=excluded.folder_id, name=excluded.name,
                     vendor=excluded.vendor, url=excluded.url, login_notes=excluded.login_notes,
                     criticality=excluded.criticality, tags=excluded.tags, is_favorite=excluded.is_favorite,
                     updated_at=excluded.updated_at",
                    params![id, folder_id, name, vendor, url, login_notes, criticality, tags, is_fav, created_at, updated_at],
                ).map_err(|e| e.to_string())?;
                apps_in += 1;
            }
        }
    }

    if let Some(arr) = payload.get("entries").and_then(|v| v.as_array()) {
        for e in arr {
            let id = e.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let title = e.get("title").and_then(|v| v.as_str()).unwrap_or("");
            if id.is_empty() || title.is_empty() { continue; }
            let folder_id = e.get("folder_id").and_then(|v| v.as_str());
            let app_id = e.get("app_id").and_then(|v| v.as_str());
            let kind = e.get("kind").and_then(|v| v.as_str());
            let properties = e.get("properties").and_then(|v| v.as_str()).unwrap_or("{}");
            let is_fav = e.get("is_favorite").and_then(|v| v.as_bool()).unwrap_or(false) as i64;
            let content = e.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let url = e.get("url").and_then(|v| v.as_str());
            let tags = e.get("tags").map(|v| v.to_string()).unwrap_or_else(|| "[]".into());
            let created_at = e.get("created_at").and_then(|v| v.as_str()).unwrap_or(&*now()).to_string();
            let updated_at = e.get("updated_at").and_then(|v| v.as_str()).unwrap_or(&*now()).to_string();
            tx.execute(
                "INSERT INTO entries (id,title,top_category,folder_id,app_id,kind,properties,is_favorite,content,url,tags,position,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,0,?12,?13)
                 ON CONFLICT(id) DO UPDATE SET title=excluded.title, folder_id=excluded.folder_id,
                 app_id=excluded.app_id, kind=excluded.kind, properties=excluded.properties,
                 is_favorite=excluded.is_favorite, content=excluded.content, url=excluded.url,
                 tags=excluded.tags, updated_at=excluded.updated_at",
                params![id, title, category, folder_id, app_id, kind, properties, is_fav, content, url, tags, created_at, updated_at],
            ).map_err(|e| e.to_string())?;
            entries_in += 1;
        }
    }

    if let Some(arr) = payload.get("attachments").and_then(|v| v.as_array()) {
        for a in arr {
            let id = a.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let filename = a.get("filename").and_then(|v| v.as_str()).unwrap_or("");
            let b64 = a.get("data_base64").and_then(|v| v.as_str()).unwrap_or("");
            if id.is_empty() || filename.is_empty() || b64.is_empty() { continue; }
            let entry_id = a.get("entry_id").and_then(|v| v.as_str());
            let app_id = a.get("app_id").and_then(|v| v.as_str());
            let contact_id = a.get("contact_id").and_then(|v| v.as_str());
            let mime_type = a.get("mime_type").and_then(|v| v.as_str()).unwrap_or("");
            let created_at = a.get("created_at").and_then(|v| v.as_str()).unwrap_or(&*now()).to_string();
            let Ok(bytes) = general_purpose::STANDARD.decode(b64.as_bytes()) else { continue; };
            if bytes.len() > 50 * 1024 * 1024 {
                return Err(format!("Attachment '{filename}' exceeds 50 MB limit"));
            }
            tx.execute(
                "INSERT INTO attachments (id, entry_id, app_id, contact_id, filename, mime_type, size_bytes, data, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(id) DO UPDATE SET filename=excluded.filename, mime_type=excluded.mime_type,
                 size_bytes=excluded.size_bytes, data=excluded.data",
                params![id, entry_id, app_id, contact_id, filename, mime_type, bytes.len() as i64, bytes, created_at],
            ).map_err(|e| e.to_string())?;
            atts_in += 1;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "folders": folders_in, "entries": entries_in, "contacts": contacts_in,
        "apps": apps_in, "attachments": atts_in,
    }))
}

// ─────────────── full export / import (legacy) ───────────────

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
    let contacts = list_contacts(state.clone())?;
    let conn = state.lock().map_err(|e| e.to_string())?;
    let attachments = collect_all_attachments(&conn)?;
    let data = ExportData { version: 4, exported_at: now(), folders, apps, entries, contacts, attachments };
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_json(state: State<Mutex<Connection>>, path: String) -> Result<serde_json::Value, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let data: ExportData = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if data.version < 2 || data.version > 4 { return Err("Unsupported backup version".into()); }
    let mut folders_imported = 0;
    let mut apps_imported = 0;
    let mut entries_imported = 0;
    let mut contacts_imported = 0;
    let mut attachments_imported = 0;

    let mut conn = state.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for f in data.folders {
        if !valid_top(&f.top_category) { return Err(format!("invalid top_category: {}", f.top_category)); }
        if f.id.is_empty() || f.name.trim().is_empty() { continue; }
        tx.execute(
            "INSERT INTO folders (id,parent_id,top_category,name,position,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7)
             ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id, top_category=excluded.top_category,
             name=excluded.name, position=excluded.position, updated_at=excluded.updated_at",
            params![f.id, f.parent_id, f.top_category, f.name.trim(), f.position, f.created_at, f.updated_at],
        ).map_err(|e| e.to_string())?;
        folders_imported += 1;
    }

    for a in data.apps {
        if a.id.is_empty() || a.name.trim().is_empty() { continue; }
        tx.execute(
            "INSERT INTO apps (id,folder_id,name,vendor,url,login_notes,criticality,tags,is_favorite,position,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
             ON CONFLICT(id) DO UPDATE SET folder_id=excluded.folder_id, name=excluded.name,
             vendor=excluded.vendor, url=excluded.url, login_notes=excluded.login_notes,
             criticality=excluded.criticality, tags=excluded.tags, is_favorite=excluded.is_favorite,
             position=excluded.position, updated_at=excluded.updated_at",
            params![a.id, a.folder_id, a.name.trim(), a.vendor.trim(), a.url.trim(), a.login_notes,
                    a.criticality, serialize_tags(&a.tags), a.is_favorite as i64,
                    a.position, a.created_at, a.updated_at],
        ).map_err(|e| e.to_string())?;
        apps_imported += 1;
    }

    for e in data.entries {
        if !valid_top(&e.top_category) { return Err(format!("invalid top_category: {}", e.top_category)); }
        if e.id.is_empty() || e.title.trim().is_empty() { continue; }
        tx.execute(
            "INSERT INTO entries (id,title,top_category,folder_id,app_id,kind,properties,is_favorite,content,url,tags,position,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title, top_category=excluded.top_category,
             folder_id=excluded.folder_id, app_id=excluded.app_id, kind=excluded.kind,
             properties=excluded.properties, is_favorite=excluded.is_favorite, content=excluded.content,
             url=excluded.url, tags=excluded.tags, position=excluded.position, updated_at=excluded.updated_at",
            params![e.id, e.title.trim(), e.top_category, e.folder_id, e.app_id, e.kind,
                    e.properties, e.is_favorite as i64, e.content, e.url, serialize_tags(&e.tags),
                    e.position, e.created_at, e.updated_at],
        ).map_err(|e| e.to_string())?;
        entries_imported += 1;
    }

    for c in data.contacts {
        if c.id.is_empty() || c.name.trim().is_empty() { continue; }
        tx.execute(
            "INSERT INTO contacts (id,folder_id,name,role,company,phone,email,notes,tags,is_favorite,position,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
             ON CONFLICT(id) DO UPDATE SET folder_id=excluded.folder_id, name=excluded.name,
             role=excluded.role, company=excluded.company, phone=excluded.phone, email=excluded.email,
             notes=excluded.notes, tags=excluded.tags, is_favorite=excluded.is_favorite,
             position=excluded.position, updated_at=excluded.updated_at",
            params![c.id, c.folder_id, c.name.trim(), c.role.trim(), c.company.trim(),
                    c.phone.trim(), c.email.trim(), c.notes, serialize_tags(&c.tags),
                    c.is_favorite as i64, c.position, c.created_at, c.updated_at],
        ).map_err(|e| e.to_string())?;
        contacts_imported += 1;
    }

    for a in data.attachments {
        let id = a.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let filename = a.get("filename").and_then(|v| v.as_str()).unwrap_or("");
        let b64 = a.get("data_base64").and_then(|v| v.as_str()).unwrap_or("");
        if id.is_empty() || filename.is_empty() || b64.is_empty() { continue; }
        let entry_id = a.get("entry_id").and_then(|v| v.as_str());
        let app_id = a.get("app_id").and_then(|v| v.as_str());
        let contact_id = a.get("contact_id").and_then(|v| v.as_str());
        let mime_type = a.get("mime_type").and_then(|v| v.as_str()).unwrap_or("");
        let created_at = a.get("created_at").and_then(|v| v.as_str()).unwrap_or(&*now()).to_string();
        let Ok(bytes) = general_purpose::STANDARD.decode(b64.as_bytes()) else { continue; };
        if bytes.len() > 50 * 1024 * 1024 {
            return Err(format!("Attachment '{filename}' exceeds 50 MB limit"));
        }
        tx.execute(
            "INSERT INTO attachments (id, entry_id, app_id, contact_id, filename, mime_type, size_bytes, data, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET filename=excluded.filename, mime_type=excluded.mime_type,
             size_bytes=excluded.size_bytes, data=excluded.data",
            params![id, entry_id, app_id, contact_id, filename, mime_type, bytes.len() as i64, bytes, created_at],
        ).map_err(|e| e.to_string())?;
        attachments_imported += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "folders_imported": folders_imported,
        "apps_imported": apps_imported,
        "entries_imported": entries_imported,
        "contacts_imported": contacts_imported,
        "attachments_imported": attachments_imported,
    }))
}
