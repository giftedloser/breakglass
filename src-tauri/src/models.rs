#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Folder {
    pub id: String,
    pub parent_id: Option<String>,
    pub top_category: String,
    pub name: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FolderInput {
    pub id: Option<String>,
    pub parent_id: Option<String>,
    pub top_category: String,
    pub name: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Entry {
    pub id: String,
    pub title: String,
    pub top_category: String,
    pub folder_id: Option<String>,
    pub is_favorite: bool,
    pub content: String,
    pub url: Option<String>,
    pub tags: Vec<String>,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EntryInput {
    pub id: Option<String>,
    pub title: String,
    pub top_category: String,
    pub folder_id: Option<String>,
    pub is_favorite: bool,
    pub content: String,
    pub url: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Contact {
    pub id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub role: String,
    pub company: String,
    pub phone: String,
    pub email: String,
    pub notes: String,
    pub tags: Vec<String>,
    pub is_favorite: bool,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ContactInput {
    pub id: Option<String>,
    pub folder_id: Option<String>,
    pub name: String,
    pub role: String,
    pub company: String,
    pub phone: String,
    pub email: String,
    pub notes: String,
    pub tags: Vec<String>,
    pub is_favorite: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SearchHit {
    pub kind: String, // "entry" | "contact" | "folder"
    pub id: String,
    pub title: String,
    pub top_category: String,
    pub snippet: String,
    pub is_favorite: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RecentItem {
    pub kind: String, // "entry" | "contact"
    pub id: String,
    pub title: String,
    pub top_category: String,
    pub folder_id: Option<String>,
    pub viewed_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExportData {
    pub version: u32,
    pub exported_at: String,
    pub folders: Vec<Folder>,
    pub entries: Vec<Entry>,
    pub contacts: Vec<Contact>,
}

pub fn parse_tags(s: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(s).unwrap_or_default()
}

pub fn serialize_tags(tags: &[String]) -> String {
    serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string())
}

pub const TOP_CATEGORIES: &[&str] = &[
    "emergency", "servers", "dbs", "network", "apps", "contacts", "notes", "howto", "sitelinks",
];
