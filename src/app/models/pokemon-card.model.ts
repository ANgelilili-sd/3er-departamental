export interface PokemonMove {
  name: string;
  type: 'attack' | 'defense';
  power: number; // 0 for defense if it relies on base defense
}

export interface PokemonCard {
  id: number;
  name: string;
  image: string;
  types: string[];
  attack: number;
  defense: number;
  hp: number;
  specialAbility: string;
  level: string; // Common, Uncommon, Rare, Epic, Legendary
  description: string;
  moves: PokemonMove[];
}
