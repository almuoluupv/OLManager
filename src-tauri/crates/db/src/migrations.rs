use rusqlite::{Connection, Transaction};
use rusqlite_migration::{HookResult, M, Migrations};

fn column_exists(tx: &Transaction<'_>, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut stmt = tx.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn add_column_if_missing(
    tx: &Transaction<'_>,
    table: &str,
    column: &str,
    definition: &str,
) -> rusqlite::Result<()> {
    if !column_exists(tx, table, column)? {
        tx.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )?;
    }
    Ok(())
}

fn migrate_profile_image_urls(tx: &Transaction<'_>) -> HookResult {
    add_column_if_missing(tx, "players", "profile_image_url", "TEXT")?;
    add_column_if_missing(tx, "staff", "profile_image_url", "TEXT")?;
    Ok(())
}

fn migrate_manager_avatar_path(tx: &Transaction<'_>) -> HookResult {
    add_column_if_missing(tx, "managers", "avatar_path", "TEXT")?;
    Ok(())
}

fn connection_column_exists(
    conn: &Connection,
    table: &str,
    column: &str,
) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn connection_add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> rusqlite::Result<()> {
    if !connection_column_exists(conn, table, column)? {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )?;
    }
    Ok(())
}

pub fn ensure_compatible_schema(conn: &Connection) -> rusqlite::Result<()> {
    connection_add_column_if_missing(conn, "managers", "avatar_path", "TEXT")?;
    connection_add_column_if_missing(conn, "players", "profile_image_url", "TEXT")?;
    connection_add_column_if_missing(conn, "staff", "profile_image_url", "TEXT")?;
    Ok(())
}

/// Number of migrations defined. Keep in sync with the vec in `all_migrations`.
pub const MIGRATION_COUNT: usize = 30;

/// All migrations for a per-save game database.
/// Each save `.db` file gets this schema applied via `rusqlite_migration`.
pub fn all_migrations() -> Migrations<'static> {
    Migrations::new(vec![
        // V1: Initial schema — all game entity tables
        M::up(include_str!("sql/v001_initial_schema.sql")),
        // V2: Training groups per team
        M::up(include_str!("sql/v002_training_groups.sql")),
        // V3: Alternate positions per player
        M::up(include_str!("sql/v003_alternate_positions.sql")),
        // V4: Natural/preferred position per player
        M::up(include_str!("sql/v004_natural_position.sql")),
        // V5: Per-player training focus override
        M::up(include_str!("sql/v005_player_training_focus.sql")),
        // V6: Team match roles defaults
        M::up(include_str!("sql/v006_team_match_roles.sql")),
        // V7: Team financial ledger
        M::up(include_str!("sql/v007_team_financial_ledger.sql")),
        // V8: Team sponsorship state
        M::up(include_str!("sql/v008_team_sponsorship.sql")),
        // V9: Team facilities state
        M::up(include_str!("sql/v009_team_facilities.sql")),
        // V10: Hidden per-player morale architecture state
        M::up(include_str!("sql/v010_player_morale_core.sql")),
        // V11: Player footedness identity fields
        M::up(include_str!("sql/v011_player_footedness.sql")),
        // V12: Fixture competition metadata
        M::up(include_str!("sql/v012_fixture_competition.sql")),
        // V13: Player long-term fitness value
        M::up(include_str!("sql/v013_player_fitness.sql")),
        // V14: Explicit football identity fields for teams and people
        M::up(include_str!("sql/v014_football_identity.sql")),
        // V15: Historical player and team match stats
        M::up(include_str!("sql/v015_match_stats_history.sql")),
        // V16: Manager board-warning stage tracking (per-club, resets on hire)
        M::up(include_str!("sql/v016_manager_warning_stage.sql")),
        // V17: Manager nickname support (LoL-style handle)
        M::up(include_str!("sql/v017_manager_nickname.sql")),
        // V18: Champion id per player match stats row
        M::up(include_str!("sql/v018_player_match_champion_id.sql")),
        // V19: Champion win/loss per player match stats row
        M::up(include_str!("sql/v019_player_match_champion_win.sql")),
        // V20: LoL-first stats columns with explicit legacy bridge
        M::up(include_str!("sql/v020_lol_stats_schema.sql")),
        // V21: Pure LoL stats tables (primary path) + legacy import bridge
        M::up(include_str!("sql/v021_lol_pure_stats_tables.sql")),
        // V22: Player potential research tracking fields
        M::up(include_str!("sql/v022_player_potential_research.sql")),
        // V23: Weekly scrim planning state per team
        M::up(include_str!("sql/v023_team_weekly_scrims.sql")),
        // V24: Weekly scrim counters for staff summary
        M::up(include_str!("sql/v024_team_scrim_weekly_counters.sql")),
        // V25: Per-slot scrim simulation results for UI timeline
        M::up(include_str!("sql/v025_team_scrim_slot_results.sql")),
        // V26: Fixture series length metadata (best-of)
        M::up(include_str!("sql/v026_fixture_best_of.sql")),
        // V27: Persist academy team kind, affiliation links, and ERL metadata
        M::up(include_str!("sql/v027_academy_team_metadata.sql")),
        // V28: Add avatar_path column to managers table for profile avatar persistence
        M::up_with_hook("SELECT 1;", migrate_manager_avatar_path),
        // V29: Champion mastery + patch progression persistence
        M::up(include_str!("sql/v028_champion_progression_state.sql")),
        // V30: Optional unified profile image URLs for players and staff
        M::up_with_hook("SELECT 1;", migrate_profile_image_urls),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_migrations_are_valid() {
        let migrations = all_migrations();
        migrations.validate().expect("migrations should be valid");
    }

    #[test]
    fn test_apply_migrations_to_empty_db() {
        let mut conn = Connection::open_in_memory().unwrap();
        let migrations = all_migrations();
        migrations
            .to_latest(&mut conn)
            .expect("migrations should apply cleanly");

        // Verify all expected tables exist
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(
            tables.contains(&"game_meta".to_string()),
            "missing game_meta"
        );
        assert!(tables.contains(&"managers".to_string()), "missing managers");
        assert!(tables.contains(&"teams".to_string()), "missing teams");
        assert!(tables.contains(&"players".to_string()), "missing players");
        assert!(
            tables.contains(&"player_match_stats".to_string()),
            "missing player_match_stats"
        );
        assert!(
            tables.contains(&"lol_player_match_stats".to_string()),
            "missing lol_player_match_stats"
        );
        assert!(tables.contains(&"staff".to_string()), "missing staff");
        assert!(
            tables.contains(&"team_match_stats".to_string()),
            "missing team_match_stats"
        );
        assert!(
            tables.contains(&"lol_team_match_stats".to_string()),
            "missing lol_team_match_stats"
        );
        assert!(tables.contains(&"league".to_string()), "missing league");
        assert!(tables.contains(&"fixtures".to_string()), "missing fixtures");
        assert!(
            tables.contains(&"standings".to_string()),
            "missing standings"
        );
        assert!(tables.contains(&"messages".to_string()), "missing messages");
        assert!(tables.contains(&"news".to_string()), "missing news");
        assert!(
            tables.contains(&"board_objectives".to_string()),
            "missing board_objectives"
        );
        assert!(
            tables.contains(&"scouting_assignments".to_string()),
            "missing scouting_assignments"
        );
    }

    #[test]
    fn test_migrations_are_idempotent() {
        let mut conn = Connection::open_in_memory().unwrap();
        let migrations = all_migrations();
        migrations
            .to_latest(&mut conn)
            .expect("first apply should succeed");
        // Applying again should be a no-op (already at latest)
        migrations
            .to_latest(&mut conn)
            .expect("second apply should succeed (idempotent)");
    }

    #[test]
    fn test_schema_version_after_migration() {
        let mut conn = Connection::open_in_memory().unwrap();
        let migrations = all_migrations();
        migrations.to_latest(&mut conn).unwrap();

        let version: i64 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        // rusqlite_migration sets user_version to the number of applied migrations
        assert_eq!(
            version, MIGRATION_COUNT as i64,
            "expected schema version {} after migrations",
            MIGRATION_COUNT
        );
    }

    #[test]
    fn test_profile_image_url_migration_tolerates_existing_columns() {
        let mut conn = Connection::open_in_memory().unwrap();
        let migrations = all_migrations();
        migrations
            .to_version(&mut conn, MIGRATION_COUNT - 1)
            .expect("migrations before profile image URLs should apply");

        conn.execute("ALTER TABLE players ADD COLUMN profile_image_url TEXT", [])
            .unwrap();
        conn.execute("ALTER TABLE staff ADD COLUMN profile_image_url TEXT", [])
            .unwrap();

        migrations
            .to_latest(&mut conn)
            .expect("profile image URL migration should skip existing columns");
    }

    #[test]
    fn test_compatible_schema_repairs_missing_avatar_path() {
        let mut conn = Connection::open_in_memory().unwrap();
        let migrations = all_migrations();
        migrations
            .to_version(&mut conn, 27)
            .expect("migrations before avatar_path should apply");

        assert!(!connection_column_exists(&conn, "managers", "avatar_path").unwrap());
        ensure_compatible_schema(&conn).expect("compatibility repair should add avatar_path");
        assert!(connection_column_exists(&conn, "managers", "avatar_path").unwrap());
    }
}
