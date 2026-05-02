import type { PlayerData } from "../store/gameStore";
import type { LolRole } from "../store/types";

/**
 * Role-based rating weights (per design spec)
 * Each role has attribute weights that reflect what matters for that position in LoL
 */
const ROLE_WEIGHTS: Record<LolRole, Array<[keyof PlayerData["attributes"], number]>> = {
    TOP: [
        ["strength", 20],
        ["stamina", 18],
        ["tackling", 15],
        ["defending", 14],
        ["aggression", 12],
        ["decisions", 10],
        ["positioning", 6],
        ["composure", 5],
    ],
    JUNGLE: [
        ["stamina", 18],
        ["aggression", 17],
        ["tackling", 15],
        ["defending", 13],
        ["decisions", 12],
        ["pace", 10],
        ["positioning", 8],
        ["vision", 7],
    ],
    MID: [
        ["vision", 20],
        ["passing", 18],
        ["decisions", 16],
        ["dribbling", 12],
        ["shooting", 10],
        ["stamina", 8],
        ["positioning", 8],
        ["composure", 8],
    ],
    ADC: [
        ["pace", 20],
        ["dribbling", 18],
        ["shooting", 16],
        ["positioning", 12],
        ["decisions", 10],
        ["agility", 8],
        ["stamina", 8],
        ["composure", 8],
    ],
    SUPPORT: [
        ["vision", 22],
        ["passing", 18],
        ["decisions", 16],
        ["positioning", 12],
        ["aggression", 10],
        ["stamina", 8],
        ["teamwork", 8],
        ["composure", 6],
    ],
};

function weightedAverage(values: Array<[number, number]>): number {
    return values.reduce((sum, [value, weight]) => sum + value * weight, 0) / 100;
}

function weightedRoleScore(player: PlayerData, role: LolRole): number {
    const attributes = player.attributes;
    const weights = ROLE_WEIGHTS[role];

    return weightedAverage(
        weights.map(([attr, weight]) => [attributes[attr] as number, weight])
    );
}

function criticalPenalty(player: PlayerData, role: LolRole): number {
    const attributes = player.attributes;
    let criticalMin: number;

    switch (role) {
        case "TOP":
            criticalMin = Math.min(attributes.strength, attributes.tackling, attributes.stamina);
            break;
        case "JUNGLE":
            criticalMin = Math.min(attributes.stamina, attributes.aggression, attributes.tackling);
            break;
        case "MID":
            criticalMin = Math.min(attributes.vision, attributes.passing, attributes.decisions);
            break;
        case "ADC":
            criticalMin = Math.min(attributes.pace, attributes.dribbling, attributes.shooting);
            break;
        case "SUPPORT":
            criticalMin = Math.min(attributes.vision, attributes.passing, attributes.positioning);
            break;
    }

    return criticalMin >= 45 ? 0 : (45 - criticalMin) * 0.6;
}

/**
 * Compatibility penalty based on role match
 * - Primary role (natural_position): 0 penalty
 * - Alternate role: 4.0 penalty
 * - Different role: 14.0 penalty
 */
function roleCompatibilityPenalty(player: PlayerData, targetRole: LolRole): number {
    const primary = player.natural_position;
    const alternates = player.alternate_positions || [];

    if (primary === targetRole) {
        return 0;
    }

    if (alternates.includes(targetRole)) {
        return 4.0;
    }

    return 14.0;
}

/**
 * Calculate overall rating for a player at a given role
 */
export function calcOvr(player: PlayerData, role?: LolRole): number {
    const targetRole = role || player.natural_position;
    const weightedScore = weightedRoleScore(player, targetRole);
    const penalty = criticalPenalty(player, targetRole);
    const fitPenalty = role ? roleCompatibilityPenalty(player, targetRole) : 0;

    return Math.round(
        Math.max(1, Math.min(99, weightedScore - penalty - fitPenalty)),
    );
}

/**
 * Role badge color mapping
 * Uses the same mapping as roleIcons.ts for consistency
 */
export function positionBadgeVariant(role: LolRole): "accent" | "primary" | "success" | "danger" {
    switch (role) {
        case "TOP":
            return "danger";
        case "JUNGLE":
            return "success";
        case "MID":
            return "primary";
        case "ADC":
            return "accent";
        case "SUPPORT":
            return "neutral";
        default:
            return "primary";
    }
}