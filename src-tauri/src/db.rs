use rusqlite::{params, Connection};
use tauri::Manager;

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
    let mut version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version < 1 {
        let tx = conn.transaction()?;
        tx.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS entries (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              category TEXT NOT NULL CHECK(category IN ('emergency','runbooks','apps','contacts','network','servers','security','vendors','notes')),
              status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('active','in_progress','draft')),
              severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info','warning','critical')),
              is_favorite INTEGER NOT NULL DEFAULT 0,
              content TEXT NOT NULL DEFAULT '{}',
              tags TEXT NOT NULL DEFAULT '[]',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS contacts (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT '',
              company TEXT NOT NULL DEFAULT '',
              phone TEXT NOT NULL DEFAULT '',
              email TEXT NOT NULL DEFAULT '',
              notes TEXT NOT NULL DEFAULT '',
              tags TEXT NOT NULL DEFAULT '[]',
              is_favorite INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS attachments (
              id TEXT PRIMARY KEY,
              entry_id TEXT NOT NULL,
              filename TEXT NOT NULL,
              mime_type TEXT NOT NULL,
              data BLOB NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
              id UNINDEXED,
              title,
              content_text,
              tags_flat,
              tokenize='porter unicode61'
            );
            CREATE TRIGGER IF NOT EXISTS entries_fts_insert AFTER INSERT ON entries BEGIN
              INSERT INTO entries_fts(id, title, content_text, tags_flat)
              VALUES (new.id, new.title, new.content, new.tags);
            END;
            CREATE TRIGGER IF NOT EXISTS entries_fts_update AFTER UPDATE ON entries BEGIN
              UPDATE entries_fts SET title=new.title, content_text=new.content, tags_flat=new.tags WHERE id=new.id;
            END;
            CREATE TRIGGER IF NOT EXISTS entries_fts_delete AFTER DELETE ON entries BEGIN
              DELETE FROM entries_fts WHERE id=old.id;
            END;
            CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category);
            CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
            CREATE INDEX IF NOT EXISTS idx_entries_favorite ON entries(is_favorite);
            CREATE INDEX IF NOT EXISTS idx_entries_updated ON entries(updated_at DESC);
            PRAGMA user_version = 2;
            ",
        )?;
        tx.commit()?;
        version = 2;
    }
    if version < 2 {
        conn.pragma_update(None, "foreign_keys", "OFF")?;
        let tx = conn.transaction()?;
        tx.execute_batch(
            "
            DROP TRIGGER IF EXISTS entries_fts_insert;
            DROP TRIGGER IF EXISTS entries_fts_update;
            DROP TRIGGER IF EXISTS entries_fts_delete;
            CREATE TABLE entries_new (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              category TEXT NOT NULL CHECK(category IN ('emergency','runbooks','apps','contacts','network','servers','security','vendors','notes')),
              status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('active','in_progress','draft')),
              severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info','warning','critical')),
              is_favorite INTEGER NOT NULL DEFAULT 0,
              content TEXT NOT NULL DEFAULT '{}',
              tags TEXT NOT NULL DEFAULT '[]',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            INSERT INTO entries_new SELECT * FROM entries;
            DROP TABLE entries;
            ALTER TABLE entries_new RENAME TO entries;
            DELETE FROM entries_fts;
            INSERT INTO entries_fts(id, title, content_text, tags_flat)
              SELECT id, title, content, tags FROM entries;
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
            CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category);
            CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
            CREATE INDEX IF NOT EXISTS idx_entries_favorite ON entries(is_favorite);
            CREATE INDEX IF NOT EXISTS idx_entries_updated ON entries(updated_at DESC);
            PRAGMA user_version = 2;
            ",
        )?;
        tx.commit()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        version = 2;
    }
    if version < 3 {
        seed_vendor_contacts(conn)?;
        conn.pragma_update(None, "user_version", 3)?;
    }
    Ok(())
}

fn seed_vendor_contacts(conn: &Connection) -> rusqlite::Result<()> {
    const TIMESTAMP: &str = "2026-05-31T00:00:00Z";
    let contacts = [
        SeedContact {
            id: "vendor-agilysys",
            name: "Agilysys",
            role: "Vendor for POS systems",
            company: "IT",
            phone: "+1 (800) 327-7088",
            email: "ig_support@agilysys.com",
            notes: "Access: Admin\nAccount: N/A",
            tags: r#"["vendor","it","pos"]"#,
        },
        SeedContact {
            id: "vendor-alien-vault-usm",
            name: "Alien Vault/USM",
            role: "Managed security service provider",
            company: "IT",
            phone: "+1 (650) 713-3333",
            email: "",
            notes: "Access: Users\nAccount: Admin\nSupport link: Support (att.com)",
            tags: r#"["vendor","it","security"]"#,
        },
        SeedContact {
            id: "vendor-avigilon",
            name: "Avigilon",
            role: "Vendor for ACM systems",
            company: "Surveillance",
            phone: "+1 (213) 297-2180",
            email: "",
            notes: "Access: Admin\nAccount: Admin",
            tags: r#"["vendor","surveillance","acm"]"#,
        },
        SeedContact {
            id: "vendor-biometrica-visual-casino-vc7",
            name: "Biometrica's Visual Casino VC7",
            role: "Software for building out casino floor maps",
            company: "IT",
            phone: "+1 (303) 565-5394",
            email: "avsupport@e2optics.com",
            notes: "Access: Overview\nAccount: N/A",
            tags: r#"["vendor","it","casino-floor"]"#,
        },
        SeedContact {
            id: "vendor-broadcom",
            name: "Broadcom",
            role: "Brocade switch services",
            company: "IT",
            phone: "+1 (800) 752-8061",
            email: "partner.helpdesk@broadcom.com",
            notes: "Access: Admin\nAccount: N/A\nSupport link: Contact Brocade (broadcom.com)",
            tags: r#"["vendor","it","network","brocade"]"#,
        },
        SeedContact {
            id: "vendor-converge-point",
            name: "Converge Point",
            role: "Policy documentation management software",
            company: "IT",
            phone: "",
            email: "support@convergepoint.com",
            notes: "Access: Admin\nAccount: N/A\nSupport link: Policy Management Software (convergepoint.com)",
            tags: r#"["vendor","it","policy"]"#,
        },
        SeedContact {
            id: "vendor-e2-optics-crestron",
            name: "E2 Optics/Crestron",
            role: "Vendor for audio/music/mic systems",
            company: "IT",
            phone: "+1 (303) 565-5394 / +1 (866) 973-1507",
            email: "avsupport@e2optics.com",
            notes: "Access: Admin\nAccount: N/A",
            tags: r#"["vendor","it","audio","crestron"]"#,
        },
        SeedContact {
            id: "vendor-everi-support",
            name: "Everi Support",
            role: "Cash Club, PKMS, Xchange support",
            company: "IT/Guest Services",
            phone: "+1 (844) 383-7424",
            email: "support@everi.zendesk.com",
            notes: "Access: Admin\nAccount: N/A\nSupport link: Contact - Everi",
            tags: r#"["vendor","it","guest-services"]"#,
        },
        SeedContact {
            id: "vendor-fourwinds-poppulo-digital-signage",
            name: "FourWinds (Poppulo/Digital Signage)",
            role: "Support for FourWinds software",
            company: "IT",
            phone: "+1 (303) 313-3000",
            email: "support@fourwindsinteractive.com",
            notes: "Access: Admin\nAccount: N/A\nSupport link: Poppulo Support & Help Centre",
            tags: r#"["vendor","it","digital-signage"]"#,
        },
        SeedContact {
            id: "vendor-igt-support",
            name: "IGT Support",
            role: "IGT application services",
            company: "IT",
            phone: "+1 (866) 777-8448",
            email: "support@igt.com",
            notes: "Access: Admin\nAccount: Admin\nSupport link: IGT Gaming Support Applications | IGT",
            tags: r#"["vendor","it","gaming"]"#,
        },
        SeedContact {
            id: "vendor-innfinity",
            name: "Innfinity",
            role: "Hotel application system",
            company: "IT",
            phone: "+1 (619) 798-3915",
            email: "support@innfinity.com",
            notes: "Access: Admin\nAccount: N/A\nSupport link: Contact - INNFINITY",
            tags: r#"["vendor","it","hotel"]"#,
        },
        SeedContact {
            id: "vendor-mpulse-9",
            name: "Mpulse 9",
            role: "Facilities ticketing system",
            company: "IT/Facilities",
            phone: "+1 (800) 944-1796",
            email: "",
            notes: "Access: Admin\nAccount: N/A\nSupport link: MPulse 9 (mpulsesoftware.com)",
            tags: r#"["vendor","it","facilities","ticketing"]"#,
        },
        SeedContact {
            id: "vendor-open-table",
            name: "Open Table",
            role: "Restaurant reservation system",
            company: "IT",
            phone: "+1 (800) 673-6822",
            email: "",
            notes: "Access: Admin\nAccount: N/A\nSupport link: Send-Us-an-Email (opentable.com)",
            tags: r#"["vendor","it","restaurant"]"#,
        },
        SeedContact {
            id: "vendor-red-rocks-inventory",
            name: "Red Rocks Inventory",
            role: "Inventory software",
            company: "IT",
            phone: "+1 (702) 968-7851",
            email: "helpdesk@redrocksoftware.com",
            notes: "Access: Admin\nAccount: N/A",
            tags: r#"["vendor","it","inventory"]"#,
        },
        SeedContact {
            id: "vendor-schoox",
            name: "Schoox",
            role: "Employee training platform",
            company: "IT/HR",
            phone: "",
            email: "",
            notes: "Access: Admin\nAccount: N/A\nSupport link: Contact Us | Schoox",
            tags: r#"["vendor","it","hr","training"]"#,
        },
        SeedContact {
            id: "vendor-smart-idesigner",
            name: "Smart Idesigner",
            role: "Card encoding/design software",
            company: "IT",
            phone: "+1 (401) 400-7111",
            email: "support@idp-corp.com",
            notes: "Access: Admin\nAccount: N/A\nSupport link: Help Center - SMART ID Card Printer",
            tags: r#"["vendor","it","cards"]"#,
        },
        SeedContact {
            id: "vendor-vantage-innovative-display-solutions",
            name: "Vantage Innovative Display Solutions",
            role: "Vendor for outside promo signs",
            company: "IT",
            phone: "+1 (888) 595-3956",
            email: "",
            notes: "Access: Admin\nAccount: N/A\nSupport link: Service - VantageLED",
            tags: r#"["vendor","it","signage"]"#,
        },
        SeedContact {
            id: "vendor-wasp",
            name: "WASP",
            role: "Inventory software",
            company: "IT",
            phone: "+1 (866) 547-9277",
            email: "",
            notes: "Access: Admin\nAccount: N/A\nSupport link: Wasp Barcode & RFID Technologies",
            tags: r#"["vendor","it","inventory","barcode"]"#,
        },
        SeedContact {
            id: "vendor-modern-craft-media",
            name: "Modern Craft Media",
            role: "Website administrators",
            company: "Vendor",
            phone: "",
            email: "support@moderncraftmedia.com",
            notes: "Access: Overview\nAccount: N/A",
            tags: r#"["vendor","website"]"#,
        },
        SeedContact {
            id: "vendor-casino-cashtrac",
            name: "Casino CashTrac",
            role: "Cage and vault transaction software",
            company: "Vendor",
            phone: "+1 (405) 820-3967",
            email: "wfranca@casinocashtrac.com",
            notes: "Access: Admin\nAccount: N/A\nSupport link: Casino Cash Trac",
            tags: r#"["vendor","casino","cage","vault"]"#,
        },
        SeedContact {
            id: "vendor-passport-technology",
            name: "Passport Technology",
            role: "Table Games card reader",
            company: "Vendor",
            phone: "+1 (775) 338-7878",
            email: "martv@passporttechnology.com",
            notes: "Access: Admin\nAccount: N/A\nSupport link: Support - Passport Technology",
            tags: r#"["vendor","table-games"]"#,
        },
        SeedContact {
            id: "vendor-barrynet",
            name: "BarryNet",
            role: "Cable TV, backup internet circuit",
            company: "Vendor",
            phone: "+1 (303) 918-5251",
            email: "bkisselman@gpcom.com",
            notes: "Access: Overview\nAccount: N/A",
            tags: r#"["vendor","network","internet","cable-tv"]"#,
        },
        SeedContact {
            id: "vendor-southern-cross",
            name: "Southern Cross",
            role: "Network cable runs",
            company: "Vendor",
            phone: "+1 (720) 463-4960",
            email: "tim@scnetcabling.com",
            notes: "Access: Admin\nAccount: N/A",
            tags: r#"["vendor","network","cabling"]"#,
        },
        SeedContact {
            id: "vendor-morse-watchman",
            name: "Morse Watchman",
            role: "KeyWatcher hardware",
            company: "Vendor",
            phone: "+1 (800) 423-8256",
            email: "monse@morsewatchman.com",
            notes: "",
            tags: r#"["vendor","hardware","keys"]"#,
        },
        SeedContact {
            id: "vendor-infor",
            name: "INFOR",
            role: "Hotel check-in application",
            company: "Vendor",
            phone: "+1 (866) 244-5479",
            email: "inforsaas@service-now.com",
            notes: "Access: Admin\nAccount: N/A\nCustomer portal: customerportal@support.infor.com",
            tags: r#"["vendor","hotel"]"#,
        },
    ];

    for contact in contacts {
        conn.execute(
            "INSERT OR IGNORE INTO contacts (id,name,role,company,phone,email,notes,tags,is_favorite,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,?9,?9)",
            params![
                contact.id,
                contact.name,
                contact.role,
                contact.company,
                contact.phone,
                contact.email,
                contact.notes,
                contact.tags,
                TIMESTAMP,
            ],
        )?;
    }

    Ok(())
}
