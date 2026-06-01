use rusqlite::Connection;
use tauri::Manager;

pub fn init(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let db_path = data_dir.join("breakglass.db");
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    migrate(&mut conn).map_err(|e| e.to_string())?;
    Ok(conn)
}

fn migrate(conn: &mut Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    let version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

    if version < 10 {
        // Fresh-or-old: nuke any prior schema variants and lay down v10 (tree model).
        conn.pragma_update(None, "foreign_keys", "OFF")?;
        let tx = conn.transaction()?;
        tx.execute_batch(
            "
            DROP TRIGGER IF EXISTS entries_fts_insert;
            DROP TRIGGER IF EXISTS entries_fts_update;
            DROP TRIGGER IF EXISTS entries_fts_delete;
            DROP TABLE IF EXISTS entries_fts;
            DROP TABLE IF EXISTS attachments;
            ",
        )?;

        // Capture legacy data if it exists.
        let legacy_entries = legacy_dump_entries(&tx)?;
        let legacy_contacts = legacy_dump_contacts(&tx)?;

        tx.execute_batch(
            "
            DROP TABLE IF EXISTS entries;
            DROP TABLE IF EXISTS contacts;

            CREATE TABLE folders (
              id           TEXT PRIMARY KEY,
              parent_id    TEXT,
              top_category TEXT NOT NULL CHECK(top_category IN
                ('emergency','servers','dbs','network','apps','contacts','notes','howto','sitelinks')),
              name         TEXT NOT NULL,
              position     INTEGER NOT NULL DEFAULT 0,
              created_at   TEXT NOT NULL,
              updated_at   TEXT NOT NULL,
              FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
            );

            CREATE TABLE entries (
              id           TEXT PRIMARY KEY,
              title        TEXT NOT NULL,
              top_category TEXT NOT NULL CHECK(top_category IN
                ('emergency','servers','dbs','network','apps','contacts','notes','howto','sitelinks')),
              folder_id    TEXT,
              is_favorite  INTEGER NOT NULL DEFAULT 0,
              content      TEXT NOT NULL DEFAULT '{}',
              url          TEXT,
              tags         TEXT NOT NULL DEFAULT '[]',
              position     INTEGER NOT NULL DEFAULT 0,
              created_at   TEXT NOT NULL,
              updated_at   TEXT NOT NULL,
              FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
            );

            CREATE TABLE contacts (
              id           TEXT PRIMARY KEY,
              folder_id    TEXT,
              name         TEXT NOT NULL,
              role         TEXT NOT NULL DEFAULT '',
              company      TEXT NOT NULL DEFAULT '',
              phone        TEXT NOT NULL DEFAULT '',
              email        TEXT NOT NULL DEFAULT '',
              notes        TEXT NOT NULL DEFAULT '',
              tags         TEXT NOT NULL DEFAULT '[]',
              is_favorite  INTEGER NOT NULL DEFAULT 0,
              position     INTEGER NOT NULL DEFAULT 0,
              created_at   TEXT NOT NULL,
              updated_at   TEXT NOT NULL,
              FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
            );

            CREATE TABLE recents (
              kind       TEXT NOT NULL,
              ref_id     TEXT NOT NULL,
              viewed_at  TEXT NOT NULL,
              PRIMARY KEY (kind, ref_id)
            );

            CREATE VIRTUAL TABLE entries_fts USING fts5(
              id UNINDEXED, title, content_text, tags_flat,
              tokenize='porter unicode61'
            );
            CREATE TRIGGER entries_fts_insert AFTER INSERT ON entries BEGIN
              INSERT INTO entries_fts(id, title, content_text, tags_flat)
              VALUES (new.id, new.title, new.content, new.tags);
            END;
            CREATE TRIGGER entries_fts_update AFTER UPDATE ON entries BEGIN
              UPDATE entries_fts SET title=new.title, content_text=new.content, tags_flat=new.tags WHERE id=new.id;
            END;
            CREATE TRIGGER entries_fts_delete AFTER DELETE ON entries BEGIN
              DELETE FROM entries_fts WHERE id=old.id;
            END;

            CREATE INDEX idx_entries_top ON entries(top_category);
            CREATE INDEX idx_entries_folder ON entries(folder_id);
            CREATE INDEX idx_entries_fav ON entries(is_favorite);
            CREATE INDEX idx_entries_updated ON entries(updated_at DESC);
            CREATE INDEX idx_contacts_folder ON contacts(folder_id);
            CREATE INDEX idx_folders_parent ON folders(parent_id, top_category);
            ",
        )?;

        // Replay legacy data into new shape.
        for e in legacy_entries {
            let top = map_legacy_category(&e.category);
            tx.execute(
                "INSERT INTO entries (id,title,top_category,folder_id,is_favorite,content,url,tags,position,created_at,updated_at)
                 VALUES (?1,?2,?3,NULL,?4,?5,NULL,?6,0,?7,?8)",
                rusqlite::params![e.id, e.title, top, e.is_favorite as i64, e.content, e.tags, e.created_at, e.updated_at],
            )?;
        }
        for c in legacy_contacts {
            tx.execute(
                "INSERT INTO contacts (id,folder_id,name,role,company,phone,email,notes,tags,is_favorite,position,created_at,updated_at)
                 VALUES (?1,NULL,?2,?3,?4,?5,?6,?7,?8,?9,0,?10,?11)",
                rusqlite::params![c.id, c.name, c.role, c.company, c.phone, c.email, c.notes, c.tags, c.is_favorite as i64, c.created_at, c.updated_at],
            )?;
        }

        tx.pragma_update(None, "user_version", 10)?;
        tx.commit()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
    }

    if version < 11 {
        let tx = conn.transaction()?;
        // Old "contacts" and "sitelinks" entries (migrated from the legacy
        // category enum) don't belong in the new module-style tops. Sitelinks
        // entries without a URL get moved to Notes; remaining contacts entries
        // (the contacts module only renders contact records, not entries) move
        // to Notes too. Untitled empty drafts get deleted outright.
        tx.execute(
            "DELETE FROM entries
              WHERE (title IS NULL OR trim(title) = '' OR title = '(untitled)')
                AND (content IS NULL OR content = '' OR content = '{}')",
            [],
        )?;
        tx.execute(
            "UPDATE entries SET top_category = 'notes', folder_id = NULL
              WHERE top_category = 'contacts'",
            [],
        )?;
        tx.execute(
            "UPDATE entries SET top_category = 'notes', folder_id = NULL
              WHERE top_category = 'sitelinks' AND (url IS NULL OR trim(url) = '')",
            [],
        )?;
        tx.pragma_update(None, "user_version", 11)?;
        tx.commit()?;
    }

    // Seed vendor contacts if the contacts table is empty (fresh install).
    let contact_count: i64 = conn.query_row("SELECT COUNT(*) FROM contacts", [], |r| r.get(0))?;
    if contact_count == 0 {
        seed_vendor_contacts(conn)?;
    }

    Ok(())
}

struct SeedContact {
    id: &'static str,
    name: &'static str,
    role: &'static str,
    company: &'static str,
    phone: &'static str,
    email: &'static str,
    notes: &'static str,
    tags: &'static str,
}

fn seed_vendor_contacts(conn: &Connection) -> rusqlite::Result<()> {
    const TS: &str = "2026-05-31T00:00:00Z";
    let contacts = [
        SeedContact { id: "vendor-agilysys", name: "Agilysys", role: "Vendor for POS systems", company: "IT", phone: "+1 (800) 327-7088", email: "ig_support@agilysys.com", notes: "Access: Admin\nAccount: N/A", tags: r#"["vendor","it","pos"]"# },
        SeedContact { id: "vendor-alien-vault-usm", name: "Alien Vault/USM", role: "Managed security service provider", company: "IT", phone: "+1 (650) 713-3333", email: "", notes: "Access: Users\nAccount: Admin", tags: r#"["vendor","it","security"]"# },
        SeedContact { id: "vendor-avigilon", name: "Avigilon", role: "Vendor for ACM systems", company: "Surveillance", phone: "+1 (213) 297-2180", email: "", notes: "Access: Admin\nAccount: Admin", tags: r#"["vendor","surveillance","acm"]"# },
        SeedContact { id: "vendor-biometrica", name: "Biometrica's Visual Casino VC7", role: "Software for casino floor maps", company: "IT", phone: "+1 (303) 565-5394", email: "avsupport@e2optics.com", notes: "Access: Overview", tags: r#"["vendor","it","casino-floor"]"# },
        SeedContact { id: "vendor-broadcom", name: "Broadcom", role: "Brocade switch services", company: "IT", phone: "+1 (800) 752-8061", email: "partner.helpdesk@broadcom.com", notes: "Access: Admin", tags: r#"["vendor","it","network","brocade"]"# },
        SeedContact { id: "vendor-converge-point", name: "Converge Point", role: "Policy documentation management", company: "IT", phone: "", email: "support@convergepoint.com", notes: "Access: Admin", tags: r#"["vendor","it","policy"]"# },
        SeedContact { id: "vendor-e2-optics-crestron", name: "E2 Optics/Crestron", role: "Audio/music/mic systems", company: "IT", phone: "+1 (303) 565-5394", email: "avsupport@e2optics.com", notes: "Access: Admin", tags: r#"["vendor","it","audio","crestron"]"# },
        SeedContact { id: "vendor-everi", name: "Everi Support", role: "Cash Club, PKMS, Xchange support", company: "IT/Guest Services", phone: "+1 (844) 383-7424", email: "support@everi.zendesk.com", notes: "Access: Admin", tags: r#"["vendor","it","guest-services"]"# },
        SeedContact { id: "vendor-fourwinds", name: "FourWinds (Poppulo/Digital Signage)", role: "FourWinds software support", company: "IT", phone: "+1 (303) 313-3000", email: "support@fourwindsinteractive.com", notes: "Access: Admin", tags: r#"["vendor","it","digital-signage"]"# },
        SeedContact { id: "vendor-igt", name: "IGT Support", role: "IGT application services", company: "IT", phone: "+1 (866) 777-8448", email: "support@igt.com", notes: "Access: Admin\nAccount: Admin", tags: r#"["vendor","it","gaming"]"# },
        SeedContact { id: "vendor-innfinity", name: "Innfinity", role: "Hotel application system", company: "IT", phone: "+1 (619) 798-3915", email: "support@innfinity.com", notes: "Access: Admin", tags: r#"["vendor","it","hotel"]"# },
        SeedContact { id: "vendor-mpulse", name: "Mpulse 9", role: "Facilities ticketing system", company: "IT/Facilities", phone: "+1 (800) 944-1796", email: "", notes: "Access: Admin", tags: r#"["vendor","it","facilities"]"# },
        SeedContact { id: "vendor-opentable", name: "Open Table", role: "Restaurant reservation system", company: "IT", phone: "+1 (800) 673-6822", email: "", notes: "Access: Admin", tags: r#"["vendor","it","restaurant"]"# },
        SeedContact { id: "vendor-red-rocks", name: "Red Rocks Inventory", role: "Inventory software", company: "IT", phone: "+1 (702) 968-7851", email: "helpdesk@redrocksoftware.com", notes: "Access: Admin", tags: r#"["vendor","it","inventory"]"# },
        SeedContact { id: "vendor-schoox", name: "Schoox", role: "Employee training platform", company: "IT/HR", phone: "", email: "", notes: "Access: Admin", tags: r#"["vendor","it","hr","training"]"# },
        SeedContact { id: "vendor-smart-idesigner", name: "Smart Idesigner", role: "Card encoding/design", company: "IT", phone: "+1 (401) 400-7111", email: "support@idp-corp.com", notes: "Access: Admin", tags: r#"["vendor","it","cards"]"# },
        SeedContact { id: "vendor-vantage", name: "Vantage Innovative Display Solutions", role: "Outside promo signs", company: "IT", phone: "+1 (888) 595-3956", email: "", notes: "Access: Admin", tags: r#"["vendor","it","signage"]"# },
        SeedContact { id: "vendor-wasp", name: "WASP", role: "Inventory software", company: "IT", phone: "+1 (866) 547-9277", email: "", notes: "Access: Admin", tags: r#"["vendor","it","inventory","barcode"]"# },
        SeedContact { id: "vendor-modern-craft", name: "Modern Craft Media", role: "Website administrators", company: "Vendor", phone: "", email: "support@moderncraftmedia.com", notes: "Access: Overview", tags: r#"["vendor","website"]"# },
        SeedContact { id: "vendor-cashtrac", name: "Casino CashTrac", role: "Cage and vault transactions", company: "Vendor", phone: "+1 (405) 820-3967", email: "wfranca@casinocashtrac.com", notes: "Access: Admin", tags: r#"["vendor","casino","cage","vault"]"# },
        SeedContact { id: "vendor-passport", name: "Passport Technology", role: "Table Games card reader", company: "Vendor", phone: "+1 (775) 338-7878", email: "martv@passporttechnology.com", notes: "Access: Admin", tags: r#"["vendor","table-games"]"# },
        SeedContact { id: "vendor-barrynet", name: "BarryNet", role: "Cable TV, backup internet", company: "Vendor", phone: "+1 (303) 918-5251", email: "bkisselman@gpcom.com", notes: "Access: Overview", tags: r#"["vendor","network","internet"]"# },
        SeedContact { id: "vendor-southern-cross", name: "Southern Cross", role: "Network cable runs", company: "Vendor", phone: "+1 (720) 463-4960", email: "tim@scnetcabling.com", notes: "Access: Admin", tags: r#"["vendor","network","cabling"]"# },
        SeedContact { id: "vendor-morse-watchman", name: "Morse Watchman", role: "KeyWatcher hardware", company: "Vendor", phone: "+1 (800) 423-8256", email: "monse@morsewatchman.com", notes: "", tags: r#"["vendor","hardware","keys"]"# },
        SeedContact { id: "vendor-infor", name: "INFOR", role: "Hotel check-in application", company: "Vendor", phone: "+1 (866) 244-5479", email: "inforsaas@service-now.com", notes: "Access: Admin", tags: r#"["vendor","hotel"]"# },
    ];

    for c in contacts {
        conn.execute(
            "INSERT OR IGNORE INTO contacts (id,folder_id,name,role,company,phone,email,notes,tags,is_favorite,position,created_at,updated_at)
             VALUES (?1,NULL,?2,?3,?4,?5,?6,?7,?8,0,0,?9,?9)",
            rusqlite::params![c.id, c.name, c.role, c.company, c.phone, c.email, c.notes, c.tags, TS],
        )?;
    }
    Ok(())
}

struct LegacyEntry {
    id: String,
    title: String,
    category: String,
    is_favorite: bool,
    content: String,
    tags: String,
    created_at: String,
    updated_at: String,
}

struct LegacyContact {
    id: String,
    name: String,
    role: String,
    company: String,
    phone: String,
    email: String,
    notes: String,
    tags: String,
    is_favorite: bool,
    created_at: String,
    updated_at: String,
}

fn legacy_dump_entries(tx: &rusqlite::Transaction) -> rusqlite::Result<Vec<LegacyEntry>> {
    let exists: i64 = tx.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='entries'",
        [], |row| row.get(0),
    )?;
    if exists == 0 { return Ok(Vec::new()); }
    let mut stmt = tx.prepare("SELECT id,title,category,is_favorite,content,tags,created_at,updated_at FROM entries")?;
    let rows = stmt.query_map([], |r| Ok(LegacyEntry {
        id: r.get(0)?, title: r.get(1)?, category: r.get(2)?,
        is_favorite: r.get::<_, i64>(3)? == 1,
        content: r.get(4)?, tags: r.get(5)?, created_at: r.get(6)?, updated_at: r.get(7)?,
    }))?;
    rows.collect()
}

fn legacy_dump_contacts(tx: &rusqlite::Transaction) -> rusqlite::Result<Vec<LegacyContact>> {
    let exists: i64 = tx.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='contacts'",
        [], |row| row.get(0),
    )?;
    if exists == 0 { return Ok(Vec::new()); }
    let mut stmt = tx.prepare("SELECT id,name,role,company,phone,email,notes,tags,is_favorite,created_at,updated_at FROM contacts")?;
    let rows = stmt.query_map([], |r| Ok(LegacyContact {
        id: r.get(0)?, name: r.get(1)?, role: r.get(2)?, company: r.get(3)?,
        phone: r.get(4)?, email: r.get(5)?, notes: r.get(6)?, tags: r.get(7)?,
        is_favorite: r.get::<_, i64>(8)? == 1,
        created_at: r.get(9)?, updated_at: r.get(10)?,
    }))?;
    rows.collect()
}

fn map_legacy_category(old: &str) -> &'static str {
    match old {
        "emergency" => "emergency",
        "runbooks"  => "howto",
        "apps"      => "apps",
        "contacts"  => "contacts",
        "network"   => "network",
        "servers"   => "servers",
        "security"  => "notes",
        "vendors"   => "contacts",
        "notes"     => "notes",
        _           => "notes",
    }
}
