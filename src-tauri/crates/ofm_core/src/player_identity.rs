use crate::game::Game;
use domain::player::{LolRole, Player};

pub fn upgrade_game_player_identities(game: &mut Game) -> bool {
    let mut changed = false;

    for player in &mut game.players {
        if needs_identity_upgrade(player) {
            upgrade_player_identity_simple(player);
            changed = true;
        }
    }

    changed
}

fn needs_identity_upgrade(player: &Player) -> bool {
    player.natural_position == LolRole::Unknown
        || player.alternate_positions.is_empty()
}

fn upgrade_player_identity_simple(player: &mut Player) {
    if player.natural_position == LolRole::Unknown {
        player.natural_position = player.position;
    }

    if player.alternate_positions.is_empty() {
        player.alternate_positions = compatible_roles(player.position);
    }
}

fn compatible_roles(role: LolRole) -> Vec<LolRole> {
    match role {
        LolRole::Top => vec![LolRole::Support],
        LolRole::Jungle => vec![LolRole::Mid, LolRole::Support],
        LolRole::Mid => vec![LolRole::Jungle, LolRole::Adc],
        LolRole::Adc => vec![LolRole::Mid],
        LolRole::Support => vec![LolRole::Jungle, LolRole::Top],
        LolRole::Unknown => vec![],
    }
}

pub fn upgrade_player_identity(player: &mut Player, _assigned_slot: Option<&LolRole>) -> bool {
    if !needs_identity_upgrade(player) {
        return false;
    }

    let natural_position = infer_natural_position(player);
    let alternate_positions = infer_alternate_positions(player, &natural_position);

    let changed = player.natural_position != natural_position
        || player.alternate_positions != alternate_positions;

    player.natural_position = natural_position;
    player.alternate_positions = alternate_positions;

    changed
}

fn infer_natural_position(player: &Player) -> LolRole {
    if player.position != LolRole::Unknown {
        return player.position;
    }

    let top_score = score_role_top(player);
    let jungle_score = score_role_jungle(player);
    let mid_score = score_role_mid(player);
    let adc_score = score_role_adc(player);
    let support_score = score_role_support(player);

    let max_score = top_score.max(jungle_score).max(mid_score).max(adc_score).max(support_score);

    if top_score == max_score {
        LolRole::Top
    } else if jungle_score == max_score {
        LolRole::Jungle
    } else if mid_score == max_score {
        LolRole::Mid
    } else if adc_score == max_score {
        LolRole::Adc
    } else {
        LolRole::Support
    }
}

fn infer_alternate_positions(player: &Player, natural_position: &LolRole) -> Vec<LolRole> {
    let natural_score = score_role(player, natural_position);
    let mut alternates = Vec::new();

    for candidate in all_roles() {
        if candidate == *natural_position || alternates.contains(&candidate) {
            continue;
        }

        let candidate_score = score_role(player, &candidate);
        if candidate_score + 8 >= natural_score {
            alternates.push(candidate);
        }

        if alternates.len() == 2 {
            break;
        }
    }

    alternates
}

fn all_roles() -> [LolRole; 5] {
    [
        LolRole::Top,
        LolRole::Jungle,
        LolRole::Mid,
        LolRole::Adc,
        LolRole::Support,
    ]
}

fn score_role(player: &Player, role: &LolRole) -> i32 {
    match role {
        LolRole::Top => score_role_top(player),
        LolRole::Jungle => score_role_jungle(player),
        LolRole::Mid => score_role_mid(player),
        LolRole::Adc => score_role_adc(player),
        LolRole::Support => score_role_support(player),
        LolRole::Unknown => 0,
    }
}

fn score_role_top(player: &Player) -> i32 {
    let attrs = &player.attributes;
    weighted_sum(&[
        (attrs.defending, 25),
        (attrs.tackling, 20),
        (attrs.strength, 18),
        (attrs.positioning, 15),
        (attrs.stamina, 12),
        (attrs.aerial, 10),
    ])
}

fn score_role_jungle(player: &Player) -> i32 {
    let attrs = &player.attributes;
    weighted_sum(&[
        (attrs.decisions, 22),
        (attrs.vision, 20),
        (attrs.positioning, 18),
        (attrs.stamina, 15),
        (attrs.passing, 13),
        (attrs.tackling, 12),
    ])
}

fn score_role_mid(player: &Player) -> i32 {
    let attrs = &player.attributes;
    weighted_sum(&[
        (attrs.vision, 22),
        (attrs.passing, 20),
        (attrs.decisions, 18),
        (attrs.dribbling, 15),
        (attrs.positioning, 13),
        (attrs.stamina, 12),
    ])
}

fn score_role_adc(player: &Player) -> i32 {
    let attrs = &player.attributes;
    weighted_sum(&[
        (attrs.shooting, 28),
        (attrs.positioning, 20),
        (attrs.dribbling, 18),
        (attrs.pace, 14),
        (attrs.decisions, 12),
        (attrs.strength, 8),
    ])
}

fn score_role_support(player: &Player) -> i32 {
    let attrs = &player.attributes;
    weighted_sum(&[
        (attrs.vision, 24),
        (attrs.passing, 22),
        (attrs.positioning, 18),
        (attrs.decisions, 14),
        (attrs.teamwork, 12),
        (attrs.handling, 10),
    ])
}

fn weighted_sum(values: &[(u8, i32)]) -> i32 {
    values
        .iter()
        .map(|(value, weight)| *value as i32 * *weight)
        .sum::<i32>()
        / 100
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::GameClock;
    use chrono::{TimeZone, Utc};
    use domain::manager::Manager;
    use domain::player::PlayerAttributes;
    use domain::team::Team;

    fn make_player(id: &str, position: LolRole, attrs: PlayerAttributes) -> Player {
        Player::new(
            id.to_string(),
            format!("{}. Test", id),
            format!("{} Test", id),
            "2000-01-01".to_string(),
            "GB".to_string(),
            position,
            attrs,
        )
    }

    fn make_team() -> Team {
        Team::new(
            "team-1".to_string(),
            "Test FC".to_string(),
            "TFC".to_string(),
            "GB".to_string(),
            "London".to_string(),
            "Test Stadium".to_string(),
            25000,
        )
    }

    fn make_manager() -> Manager {
        Manager::new(
            "mgr-1".to_string(),
            "Test".to_string(),
            "Manager".to_string(),
            "1980-01-01".to_string(),
            "GB".to_string(),
        )
    }

    #[test]
    fn upgrade_player_identity_sets_natural_from_position() {
        let attrs = PlayerAttributes {
            pace: 86,
            stamina: 84,
            strength: 66,
            agility: 74,
            passing: 62,
            shooting: 40,
            tackling: 78,
            dribbling: 63,
            defending: 73,
            positioning: 68,
            vision: 55,
            decisions: 64,
            composure: 61,
            aggression: 66,
            teamwork: 72,
            leadership: 50,
            handling: 20,
            reflexes: 20,
            aerial: 48,
        };
        let mut player = make_player("test-top", LolRole::Top, attrs);
        player.natural_position = LolRole::Unknown;

        let changed = upgrade_player_identity(&mut player, None);

        assert!(changed);
        assert_eq!(player.natural_position, LolRole::Top);
    }

    #[test]
    fn upgrade_game_player_identities_uses_team_slot_context() {
        let start = Utc.with_ymd_and_hms(2026, 7, 1, 0, 0, 0).unwrap();
        let clock = GameClock::new(start);
        let mut team = make_team();
        team.formation = "4-4-2".to_string();
        team.starting_xi_ids = vec![
            "p-support".to_string(),
            "p-top".to_string(),
            "p-jungle".to_string(),
            "p-mid".to_string(),
            "p-adc".to_string(),
        ];

        let mut top_player = make_player(
            "p-top",
            LolRole::Top,
            PlayerAttributes {
                pace: 84,
                stamina: 82,
                strength: 63,
                agility: 72,
                passing: 64,
                shooting: 40,
                tackling: 77,
                dribbling: 62,
                defending: 72,
                positioning: 66,
                vision: 58,
                decisions: 64,
                composure: 60,
                aggression: 64,
                teamwork: 74,
                leadership: 44,
                handling: 20,
                reflexes: 20,
                aerial: 46,
            },
        );
        top_player.team_id = Some("team-1".to_string());
        top_player.natural_position = LolRole::Unknown;

        let adc_player = make_player(
            "p-adc",
            LolRole::Adc,
            PlayerAttributes {
                pace: 78,
                stamina: 70,
                strength: 76,
                agility: 68,
                passing: 56,
                shooting: 84,
                tackling: 32,
                dribbling: 71,
                defending: 36,
                positioning: 83,
                vision: 58,
                decisions: 74,
                composure: 70,
                aggression: 66,
                teamwork: 62,
                leadership: 40,
                handling: 20,
                reflexes: 20,
                aerial: 68,
            },
        );

        let game = &mut Game::new(
            clock,
            make_manager(),
            vec![team],
            vec![top_player, adc_player],
            vec![],
            vec![],
        );

        let changed = upgrade_game_player_identities(game);

        assert!(changed);
        assert_eq!(game.players[0].natural_position, LolRole::Top);
        assert_eq!(game.players[1].natural_position, LolRole::Adc);
    }
}
