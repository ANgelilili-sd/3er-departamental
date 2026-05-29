import { Injectable } from '@angular/core';
import { MultiplayerService } from './multiplayer.service';
import { MultiplayerGameState, InGameCard, PlayerState } from '../models/game-state.model';
import { PokemonCard } from '../models/pokemon-card.model';

@Injectable({
  providedIn: 'root'
})
export class MultiplayerEngineService {
  
  constructor(private multiplayerService: MultiplayerService) {}

  private generateGameId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  public mapToInGameCard(card: PokemonCard): InGameCard {
    return {
      ...card,
      gameId: this.generateGameId(),
      currentHp: card.hp,
      canAttack: false,
      isDefending: false,
      abilityUsed: false
    };
  }

  public shuffleDeck(deck: InGameCard[]): InGameCard[] {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  private logMessage(state: MultiplayerGameState, message: string) {
    state.log.unshift(`[Turno ${state.turnNumber}] ${message}`);
    if (state.log.length > 20) state.log.pop();
  }

  async drawCard(roomId: string, state: MultiplayerGameState, playerId: string) {
    if (state.status !== 'playing') return;

    const playerKey = state.player1.id === playerId ? 'player1' : 'player2';
    const player = state[playerKey] as PlayerState;
    
    if (!player) return;

    if (player.deck.length === 0) {
      this.logMessage(state, `El mazo de ${player.name} está vacío.`);
      return;
    }

    if (player.hand.length < 3) {
      const card = player.deck.pop()!;
      player.hand.push(card);
      this.logMessage(state, `${player.name} roba una carta.`);
    } else {
      this.logMessage(state, `La mano de ${player.name} está llena. Carta enviada al descarte.`);
      player.discard.push(player.deck.pop()!);
    }
    
    this.checkWinCondition(roomId, state);
    if (state.status === 'playing') {
      await this.multiplayerService.updateGameState(roomId, state);
    }
  }

  async playCard(roomId: string, state: MultiplayerGameState, playerId: string, cardGameId: string) {
    if (state.activePlayerId !== playerId || state.status !== 'playing') return;

    const playerKey = state.player1.id === playerId ? 'player1' : 'player2';
    const player = state[playerKey] as PlayerState;

    if (player.field.length >= 3) {
      return; // No space
    }

    const cardIndex = player.hand.findIndex(c => c.gameId === cardGameId);
    if (cardIndex > -1) {
      const card = player.hand.splice(cardIndex, 1)[0];
      card.canAttack = false;
      player.field.push(card);
      this.logMessage(state, `${player.name} pone a ${card.name} en el campo.`);
      await this.multiplayerService.updateGameState(roomId, state);
    }
  }

  getDamageMultiplier(attackerType: string, defenderType: string): number {
    const advantages: { [key: string]: string[] } = {
      'fire': ['grass', 'bug', 'ice', 'steel'],
      'water': ['fire', 'ground', 'rock'],
      'grass': ['water', 'ground', 'rock'],
      'electric': ['water', 'flying'],
      'psychic': ['fighting', 'poison'],
      'fighting': ['normal', 'ice', 'rock', 'dark', 'steel'],
    };

    if (advantages[attackerType] && advantages[attackerType].includes(defenderType)) {
      return 2;
    }
    return 1;
  }

  async useMove(roomId: string, state: MultiplayerGameState, playerId: string, cardGameId: string, moveIndex: number, targetGameId?: string) {
    if (state.activePlayerId !== playerId || state.status !== 'playing') return;

    const playerKey = state.player1.id === playerId ? 'player1' : 'player2';
    const player = state[playerKey] as PlayerState;
    const card = player.field.find(c => c.gameId === cardGameId);
    
    if (!card || !card.canAttack) return;

    const move = card.moves[moveIndex];
    if (!move) return;

    if (move.type === 'defense') {
      card.isDefending = true;
      card.canAttack = false;
      this.logMessage(state, `${card.name} usa ${move.name} y se prepara para defender.`);
      await this.multiplayerService.updateGameState(roomId, state);
      return;
    }

    if (move.type === 'attack') {
      const defenderPlayerId = state.player1.id === playerId ? state.player2?.id : state.player1.id;
      if (defenderPlayerId) {
        await this.executeAttack(roomId, state, playerId, defenderPlayerId, card, targetGameId, move.power, move.name);
      }
    }
  }

  // Mantenemos firma anterior
  async attack(roomId: string, state: MultiplayerGameState, attackerPlayerId: string, attackerGameId: string, targetGameId: string) {
    if (state.activePlayerId !== attackerPlayerId || state.status !== 'playing') return;
    await this.useMove(roomId, state, attackerPlayerId, attackerGameId, 0, targetGameId);
  }

  private async executeAttack(roomId: string, state: MultiplayerGameState, attackerPlayerId: string, defenderPlayerId: string, attacker: InGameCard, targetGameId: string | undefined, movePower: number, moveName: string) {
    const attackerKey = state.player1.id === attackerPlayerId ? 'player1' : 'player2';
    const defenderKey = state.player1.id === defenderPlayerId ? 'player1' : 'player2';

    const attackerPlayer = state[attackerKey] as PlayerState;
    const defenderPlayer = state[defenderKey] as PlayerState;
    if (!defenderPlayer) return;

    const defenderCard = targetGameId ? defenderPlayer.field.find(c => c.gameId === targetGameId) : null;
    if (targetGameId && !defenderCard) return;

    let finalDamage = 0;
    let effectivenessMsg = '';

    if (defenderCard) {
      const multiplier = this.getDamageMultiplier(attacker.types[0], defenderCard.types[0]);
      let rawDamage = movePower;

      if (defenderCard.isDefending) {
        rawDamage -= defenderCard.defense;
        if (rawDamage < 0) rawDamage = 0;
        this.logMessage(state, `${defenderCard.name} se está defendiendo y mitiga daño.`);
      }

      if (rawDamage < 10) rawDamage = 10;
      finalDamage = rawDamage * multiplier;

      defenderCard.currentHp -= finalDamage;
      defenderPlayer.hp -= finalDamage;
      if (defenderPlayer.hp < 0) defenderPlayer.hp = 0;

      effectivenessMsg = multiplier === 2 ? ' ¡Es súper efectivo!' : '';
      this.logMessage(state, `${attacker.name} usa ${moveName} contra ${defenderCard.name} causando ${finalDamage} de daño.${effectivenessMsg}`);

      if (defenderCard.currentHp <= 0) {
        this.logMessage(state, `${defenderCard.name} de ${defenderPlayer.name} se ha debilitado.`);
        defenderPlayer.field = defenderPlayer.field.filter(c => c.gameId !== targetGameId);
        defenderPlayer.discard.push(defenderCard);
        attackerPlayer.pokemonDefeated += 1;
      }
    } else {
      finalDamage = movePower;
      defenderPlayer.hp -= finalDamage;
      if (defenderPlayer.hp < 0) defenderPlayer.hp = 0;
      this.logMessage(state, `${attacker.name} usa ${moveName} directamente contra ${defenderPlayer.name} causando ${finalDamage} de daño.`);
    }

    attacker.canAttack = false;

    await this.checkWinCondition(roomId, state);
    if (state.status === 'playing') {
      await this.multiplayerService.updateGameState(roomId, state);
    }
  }

  async useSpecialAbility(roomId: string, state: MultiplayerGameState, playerId: string, cardGameId: string) {
    if (state.activePlayerId !== playerId || state.status !== 'playing') return;

    const playerKey = state.player1.id === playerId ? 'player1' : 'player2';
    const player = state[playerKey] as PlayerState;
    const card = player.field.find(c => c.gameId === cardGameId);

    if (!card || card.abilityUsed) return;

    card.abilityUsed = true;
    let effectMessage = '';

    switch (card.types[0]) {
      case 'grass':
      case 'fairy':
        card.currentHp += 150;
        if (card.currentHp > card.hp) card.currentHp = card.hp;
        effectMessage = `se cura 150 HP.`;
        break;
      case 'fire':
      case 'fighting':
      case 'dragon':
        card.attack += 80;
        effectMessage = `aumenta su ataque permanentemente en 80.`;
        break;
      case 'water':
      case 'psychic':
      case 'electric':
        if (player.deck.length > 0 && player.hand.length < 3) {
           player.hand.push(player.deck.pop()!);
           effectMessage = `roba una carta.`;
        } else {
           effectMessage = `intenta robar, pero su mano está llena o el mazo vacío.`;
        }
        break;
      default:
        card.defense += 80;
        effectMessage = `aumenta su defensa en 80.`;
        break;
    }

    this.logMessage(state, `${card.name} usa Habilidad (${card.specialAbility}) y ${effectMessage}`);
    await this.multiplayerService.updateGameState(roomId, state);
  }

  private async checkWinCondition(roomId: string, state: MultiplayerGameState) {
    if (!state.player2) return;

    const p1LostAll = state.player1.deck.length === 0 && state.player1.hand.length === 0 && state.player1.field.length === 0;
    const p2LostAll = state.player2.deck.length === 0 && state.player2.hand.length === 0 && state.player2.field.length === 0;

    let winnerId: string | null = null;

    if (state.player2.hp <= 0 || p2LostAll) {
      winnerId = state.player1.id;
      this.logMessage(state, `¡Los puntos de vida de ${state.player2.name} han llegado a 0! ¡${state.player1.name} HAS GANADO!`);
    } else if (state.player1.hp <= 0 || p1LostAll) {
      winnerId = state.player2.id;
      this.logMessage(state, `¡Los puntos de vida de ${state.player1.name} han llegado a 0! ¡${state.player2.name} HAS GANADO!`);
    }

    if (winnerId) {
      await this.multiplayerService.setWinner(roomId, winnerId, state);
    }
  }

  async endTurn(roomId: string, state: MultiplayerGameState, currentPlayerId: string) {
    if (state.activePlayerId !== currentPlayerId || state.status !== 'playing' || !state.player2) return;

    const currentKey = state.player1.id === currentPlayerId ? 'player1' : 'player2';
    const nextKey = currentKey === 'player1' ? 'player2' : 'player1';
    
    const currentPlayer = state[currentKey] as PlayerState;
    const nextPlayer = state[nextKey] as PlayerState;

    currentPlayer.field.forEach((c: InGameCard) => c.canAttack = true);
    
    state.log = []; // Limpiar log para no saturar jsonb
    
    if (nextKey === 'player1') {
      state.turnNumber++;
    }

    state.activePlayerId = nextPlayer.id;
    // Reiniciar defensa del siguiente jugador
    nextPlayer.field.forEach((c: InGameCard) => c.isDefending = false);

    this.logMessage(state, `--- Turno ${state.turnNumber}: Turno de ${nextPlayer.name} ---`);
    
    await this.multiplayerService.updateGameState(roomId, state);
    // El próximo jugador roba automáticamente
    await this.drawCard(roomId, state, nextPlayer.id);
  }
}
