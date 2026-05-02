use domain::player::{LolRole, Player};

pub fn formation_slots(_formation: &str) -> Vec<LolRole> {
    vec![
        LolRole::Top,
        LolRole::Jungle,
        LolRole::Mid,
        LolRole::Adc,
        LolRole::Support,
    ]
}

pub fn natural_ovr(player: &Player) -> f64 {
    let role = primary_role(player);
    ovr_for_role(player, &role)
}

pub fn ovr_for_role(player: &Player, role: &LolRole) -> f64 {
    let base = weighted_score(player, role);
    let penalty = critical_penalty(player, role);
    (base - penalty).clamp(1.0, 99.0)
}

pub fn effective_rating_for_assignment(player: &Player, slot_role: &LolRole) -> f64 {
    let base = ovr_for_role(player, slot_role);
    let compatibility_penalty = compatibility_penalty(player, slot_role);
    let adjusted = (base - compatibility_penalty).max(1.0);
    adjusted * (player.condition as f64 / 100.0)
}

fn primary_role(player: &Player) -> LolRole {
    if player.natural_position != LolRole::Unknown {
        player.natural_position
    } else {
        player.position
    }
}

fn compatibility_penalty(player: &Player, slot_role: &LolRole) -> f64 {
    let primary = primary_role(player);
    if &primary == slot_role {
        return 0.0;
    }

    if player.alternate_positions.contains(slot_role) {
        4.0
    } else if same_role_group(&primary, slot_role) {
        8.0
    } else {
        14.0
    }
}

fn same_role_group(a: &LolRole, b: &LolRole) -> bool {
    matches!(
        (a, b),
        (LolRole::Top, LolRole::Support)
            | (LolRole::Support, LolRole::Top)
            | (LolRole::Jungle, LolRole::Mid)
            | (LolRole::Mid, LolRole::Jungle)
            | (LolRole::Adc, LolRole::Mid)
            | (LolRole::Mid, LolRole::Adc)
    )
}

fn weighted_score(player: &Player, role: &LolRole) -> f64 {
    let attrs = &player.attributes;
    match role {
        LolRole::Top => weighted_average(&[
            (attrs.defending, 22),
            (attrs.tackling, 18),
            (attrs.strength, 16),
            (attrs.positioning, 12),
            (attrs.stamina, 12),
            (attrs.aerial, 10),
            (attrs.decisions, 6),
            (attrs.composure, 4),
        ]),
        LolRole::Jungle => weighted_average(&[
            (attrs.decisions, 20),
            (attrs.vision, 18),
            (attrs.positioning, 16),
            (attrs.stamina, 14),
            (attrs.passing, 12),
            (attrs.tackling, 10),
            (attrs.dribbling, 6),
            (attrs.pace, 4),
        ]),
        LolRole::Mid => weighted_average(&[
            (attrs.vision, 20),
            (attrs.passing, 18),
            (attrs.decisions, 16),
            (attrs.dribbling, 14),
            (attrs.positioning, 10),
            (attrs.stamina, 10),
            (attrs.composure, 8),
            (attrs.pace, 4),
        ]),
        LolRole::Adc => weighted_average(&[
            (attrs.shooting, 26),
            (attrs.positioning, 18),
            (attrs.dribbling, 16),
            (attrs.pace, 14),
            (attrs.decisions, 12),
            (attrs.strength, 6),
            (attrs.composure, 6),
            (attrs.vision, 2),
        ]),
        LolRole::Support => weighted_average(&[
            (attrs.vision, 22),
            (attrs.passing, 20),
            (attrs.positioning, 16),
            (attrs.decisions, 14),
            (attrs.teamwork, 12),
            (attrs.handling, 8),
            (attrs.tackling, 6),
            (attrs.composure, 2),
        ]),
        LolRole::Unknown => 40.0,
    }
}

fn critical_penalty(player: &Player, role: &LolRole) -> f64 {
    let attrs = &player.attributes;
    let critical_min = match role {
        LolRole::Top => attrs
            .defending
            .min(attrs.tackling)
            .min(attrs.positioning)
            .min(attrs.strength),
        LolRole::Jungle => attrs
            .decisions
            .min(attrs.vision)
            .min(attrs.positioning)
            .min(attrs.stamina),
        LolRole::Mid => attrs.passing.min(attrs.vision).min(attrs.decisions),
        LolRole::Adc => attrs
            .shooting
            .min(attrs.positioning)
            .min(attrs.decisions)
            .min(attrs.dribbling),
        LolRole::Support => attrs
            .vision
            .min(attrs.passing)
            .min(attrs.positioning)
            .min(attrs.teamwork),
        LolRole::Unknown => 50,
    };

    if critical_min >= 45 {
        0.0
    } else {
        (45 - critical_min) as f64 * 0.6
    }
}

fn weighted_average(values: &[(u8, i32)]) -> f64 {
    values
        .iter()
        .map(|(value, weight)| *value as f64 * *weight as f64)
        .sum::<f64>()
        / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::player::PlayerAttributes;

    fn make_player(role: LolRole) -> Player {
        Player::new(
            "p-1".to_string(),
            "Test".to_string(),
            "Test Player".to_string(),
            "2000-01-01".to_string(),
            "GB".to_string(),
            role,
            PlayerAttributes {
                pace: 70,
                stamina: 70,
                strength: 70,
                agility: 70,
                passing: 70,
                shooting: 70,
                tackling: 70,
                dribbling: 70,
                defending: 70,
                positioning: 70,
                vision: 70,
                decisions: 70,
                composure: 70,
                aggression: 70,
                teamwork: 70,
                leadership: 70,
                handling: 20,
                reflexes: 20,
                aerial: 70,
            },
        )
    }

    #[test]
    fn formation_slots_returns_five_lol_roles() {
        let slots = formation_slots("4-4-2");
        assert_eq!(slots.len(), 5);
        assert_eq!(slots[0], LolRole::Top);
        assert_eq!(slots[1], LolRole::Jungle);
        assert_eq!(slots[2], LolRole::Mid);
        assert_eq!(slots[3], LolRole::Adc);
        assert_eq!(slots[4], LolRole::Support);
    }

    #[test]
    fn role_specific_rating_favors_matching_profile() {
        let mut player = make_player(LolRole::Top);
        player.natural_position = LolRole::Top;
        player.attributes.defending = 88;
        player.attributes.tackling = 84;
        player.attributes.positioning = 82;
        player.attributes.strength = 80;
        player.attributes.passing = 55;
        player.attributes.vision = 50;
        player.attributes.shooting = 40;
        player.attributes.dribbling = 44;

        assert!(ovr_for_role(&player, &LolRole::Top) > ovr_for_role(&player, &LolRole::Adc));
    }

    #[test]
    fn alternate_positions_reduce_assignment_penalty() {
        let mut player = make_player(LolRole::Mid);
        player.natural_position = LolRole::Mid;
        player.alternate_positions = vec![LolRole::Adc];
        player.attributes.passing = 82;
        player.attributes.vision = 84;
        player.attributes.decisions = 78;
        player.attributes.dribbling = 76;

        let alternate_role = effective_rating_for_assignment(&player, &LolRole::Adc);
        let out_of_group_role = effective_rating_for_assignment(&player, &LolRole::Top);

        assert!(alternate_role > out_of_group_role);
    }
}
