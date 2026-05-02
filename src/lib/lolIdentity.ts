import championsSeed from "../../data/lec/draft/champions.json";
import type { PlayerData, LolRole } from "../store/gameStore";

export type LolRoleTag = "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";

export function toLolRole(position: string): LolRole {
  const normalized = position.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "top" || normalized.startsWith("defender") || normalized.startsWith("rightback") || normalized.startsWith("centerback") || normalized.startsWith("leftback") || normalized.startsWith("rightwingback") || normalized.startsWith("leftwingback")) return "TOP";
  if (normalized === "jungle" || normalized === "jungler" || normalized.startsWith("midfielder") || normalized.startsWith("centralmidfielder")) return "JUNGLE";
  if (normalized === "mid" || normalized.startsWith("attackingmidfielder") || normalized.startsWith("rightmidfielder") || normalized.startsWith("leftmidfielder")) return "MID";
  if (normalized === "adc" || normalized === "bot" || normalized === "bottom" || normalized.startsWith("forward") || normalized.startsWith("rightwinger") || normalized.startsWith("leftwinger") || normalized.startsWith("striker")) return "ADC";
  if (normalized === "support" || normalized === "sup" || normalized.startsWith("defensivemidfielder") || normalized.startsWith("goalkeeper")) return "SUPPORT";
  return "MID";
}

/**
 * Resolve the LoL role for a player directly from their data.
 */
export function resolvePlayerLolRole(player: PlayerData): LolRoleTag {
  return toLolRole(player.natural_position || player.position || "");
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

const CHAMPION_ROLE_MAP =
  ((championsSeed as { data?: { roles?: Record<string, string[]> } }).data?.roles ?? {}) as Record<string, string[]>;

const CHAMPION_POOL_BY_ROLE: Record<LolRoleTag, string[]> = {
  TOP: [],
  JUNGLE: [],
  MID: [],
  ADC: [],
  SUPPORT: [],
};

Object.entries(CHAMPION_ROLE_MAP).forEach(([champion, roles]) => {
  roles.forEach((role) => {
    const normalized = normalizeKey(role);
    if (normalized === "top") CHAMPION_POOL_BY_ROLE.TOP.push(champion);
    if (normalized === "jungle") CHAMPION_POOL_BY_ROLE.JUNGLE.push(champion);
    if (normalized === "mid") CHAMPION_POOL_BY_ROLE.MID.push(champion);
    if (normalized === "adc" || normalized === "bot" || normalized === "bottom") CHAMPION_POOL_BY_ROLE.ADC.push(champion);
    if (normalized === "support" || normalized === "sup") CHAMPION_POOL_BY_ROLE.SUPPORT.push(champion);
  });
});

function stableHash(value: string): number {
  return value
    .split("")
    .reduce((acc, ch) => (acc * 33 + ch.charCodeAt(0)) >>> 0, 5381);
}

export function fallbackChampionForRole(playerId: string, role: LolRoleTag): string | null {
  const pool = CHAMPION_POOL_BY_ROLE[role] ?? [];
  if (pool.length === 0) return null;
  const idx = stableHash(`${playerId}:${role}`) % pool.length;
  return pool[idx] ?? null;
}
