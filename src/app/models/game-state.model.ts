import { PokemonCard } from './pokemon-card.model';

export interface InGameCard extends PokemonCard {
  gameId: string;
  currentHp: number;
  canAttack: boolean;
  isDefending: boolean;
  abilityUsed: boolean;
  isHit?: boolean;      // true durante el flash de impacto
  isDefeated?: boolean; // true durante la animación de derrota
}

export interface PlayerState {
  id: string;
  name: string;
  hp: number; // Max 1000
  deck: InGameCard[];
  hand: InGameCard[];
  field: InGameCard[];
  discard: InGameCard[];
  pokemonDefeated: number;
}

export interface GameState {
  status: 'waiting' | 'playing' | 'won' | 'lost';
  turnNumber: number;
  activePlayerId: string;
  player: PlayerState;
  ai: PlayerState;
  log: string[];
}

export interface MultiplayerGameState {
  status: 'waiting' | 'playing' | 'finished';
  turnNumber: number;
  activePlayerId: string; // auth user id of the player who has the turn
  player1: PlayerState;
  player2: PlayerState | null;
  log: string[];
}

export interface MultiplayerRoom {
  id: string;
  player1_id: string;
  player2_id: string | null;
  status: 'waiting' | 'playing' | 'finished';
  game_state: MultiplayerGameState | null;
  winner_id: string | null;
  created_at?: string;
}
