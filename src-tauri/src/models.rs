#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Entry {
    pub id: String,
    pub title: String,
    pub category: String,
    pub status: String,
    pub severity: String,
    pub is_favorite: bool,
    pub content: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EntryInput {
    pub id: Option<String>,
    pub title: String,
    pub category: String,
    pub status: String,
    pub severity: String,
    pub is_favorite: bool,
    pub content: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Contact {
    pub id: String,
    pub name: String,
    pub role: String,
    pub company: String,
    pub phone: String,
    pub email: String,
    pub notes: String,
    pub tags: Vec<String>,
    pub is_favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ContactInput {
    pub id: Option<String>,
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
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub category: String,
    pub snippet: String,
    pub status: String,
    pub severity: String,
    pub is_favorite: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CategoryCount {
    pub category: String,
    pub count: i64,
    pub draft_count: i64,
    pub in_progress_count: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExportData {
    pub version: u32,
    pub exported_at: String,
    pub entries: Vec<Entry>,
    pub contacts: Vec<Contact>,
}

pub fn parse_tags(s: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(s).unwrap_or_default()
}

pub fn serialize_tags(tags: &[String]) -> String {
    serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string())
}
