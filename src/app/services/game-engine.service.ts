import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GameState, PlayerState, InGameCard } from '../models/game-state.model';
import { PokemonCard } from '../models/pokemon-card.model';
import { HistoryService } from './history.service';
import { AlertService } from './alert.service';

@Injectable({
  providedIn: 'root'
})
export class GameEngineService {
  constructor(private historyService: HistoryService, private alertService: AlertService) {}

  private initialState: GameState = {
    status: 'waiting',
    turnNumber: 0,
    activePlayerId: 'player',
    player: this.createEmptyPlayer('player', 'Tú'),
    ai: this.createEmptyPlayer('ai', 'Rival IA'),
    log: []
  };

  private state = new BehaviorSubject<GameState>(this.initialState);
  gameState$ = this.state.asObservable();

  private createEmptyPlayer(id: string, name: string): PlayerState {
    return { id, name, hp: 9000, deck: [], hand: [], field: [], discard: [], pokemonDefeated: 0 };
  }

  private generateGameId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private mapToInGameCard(card: PokemonCard): InGameCard {
    return {
      ...card,
      gameId: this.generateGameId(),
      currentHp: card.hp,
      canAttack: false,
      isDefending: false,
      abilityUsed: false
    };
  }

  private shuffleDeck(deck: InGameCard[]): InGameCard[] {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  private logMessage(message: string) {
    const currentState = this.state.getValue();
    currentState.log.unshift(`[Turno ${currentState.turnNumber}] ${message}`);
    // Mantener solo los últimos 20 mensajes
    if (currentState.log.length > 20) currentState.log.pop();
    this.state.next({ ...currentState });
  }

  startGame(playerCards: PokemonCard[], aiCards: PokemonCard[]) {
    const playerDeck = this.shuffleDeck(playerCards.map(c => this.mapToInGameCard(c)));
    const aiDeck = this.shuffleDeck(aiCards.map(c => this.mapToInGameCard(c)));

    // Lanzamiento de moneda
    const startsFirst = Math.random() < 0.5 ? 'player' : 'ai';

    const newState: GameState = {
      status: 'playing',
      turnNumber: 1,
      activePlayerId: startsFirst,
      player: { ...this.createEmptyPlayer('player', 'Tú'), deck: playerDeck },
      ai: { ...this.createEmptyPlayer('ai', 'Rival IA'), deck: aiDeck },
      log: [],
    };

    this.state.next(newState);
    this.logMessage('¡Comienza la batalla!');
    if (startsFirst === 'player') {
      this.logMessage('La moneda ha caído de tu lado. ¡Empiezas tú!');
    } else {
      this.logMessage('La IA gana el lanzamiento de moneda. Empieza el Rival.');
    }

    // Robar 2 cartas iniciales (Mazo es de 3)
    for (let i = 0; i < 2; i++) {
      this.drawCard('player');
      this.drawCard('ai');
    }

    if (startsFirst === 'ai') {
      this.executeAiTurn();
    }
  }

  drawCard(playerId: 'player' | 'ai') {
    const currentState = this.state.getValue();
    if (currentState.status !== 'playing') return;

    const player = currentState[playerId];
    if (player.deck.length === 0) {
      this.logMessage(`El mazo de ${player.name} está vacío. No puede robar más.`);
      return;
    }

    if (player.hand.length < 3) { // Límite de mano de 3 cartas, según el requerimiento
      const card = player.deck.pop()!;
      player.hand.push(card);
      this.logMessage(`${player.name} roba una carta.`);
    } else {
      this.logMessage(`La mano de ${player.name} está llena (Máx 3). Carta enviada al descarte.`);
      player.discard.push(player.deck.pop()!);
    }

    this.checkWinCondition(currentState);
    this.state.next(currentState);
  }

  playCard(playerId: 'player' | 'ai', cardGameId: string) {
    const currentState = this.state.getValue();
    if (currentState.activePlayerId !== playerId || currentState.status !== 'playing') return;

    const player = currentState[playerId];
    if (player.field.length >= 3) {
      if (playerId === 'player') this.alertService.show('No hay espacio en el campo (Máx 3).');
      return;
    }

    const cardIndex = player.hand.findIndex(c => c.gameId === cardGameId);
    if (cardIndex > -1) {
      const card = player.hand.splice(cardIndex, 1)[0];
      // La carta no puede atacar el turno que es jugada
      card.canAttack = false;
      player.field.push(card);
      this.logMessage(`${player.name} pone a ${card.name} en el campo.`);
      this.state.next(currentState);
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

  useMove(playerId: 'player' | 'ai', cardGameId: string, moveIndex: number, targetGameId?: string) {
    const currentState = this.state.getValue();
    if (currentState.activePlayerId !== playerId || currentState.status !== 'playing') return;

    const player = currentState[playerId];
    const card = player.field.find(c => c.gameId === cardGameId);
    if (!card || !card.canAttack) return;

    const move = card.moves[moveIndex];
    if (!move) return;

    if (move.type === 'defense') {
      card.isDefending = true;
      card.canAttack = false;
      this.logMessage(`${card.name} usa ${move.name} y se prepara para defender.`);
      this.state.next(currentState);
      return;
    }

    if (move.type === 'attack') {
      const defenderId = playerId === 'player' ? 'ai' : 'player';
      this.executeAttack(playerId, defenderId, card, targetGameId, move.power, move.name, currentState);
    }
  }

  // Mantenemos la firma anterior por si algún componente antiguo la llama, pero la redirigimos si es necesario
  attack(attackerGameId: string, targetGameId?: string) {
    const currentState = this.state.getValue();
    if (currentState.activePlayerId !== 'player' || currentState.status !== 'playing') return;
    const attacker = currentState.player.field.find(c => c.gameId === attackerGameId);
    if (!attacker) return;
    // Usa el primer ataque por defecto si llaman al método antiguo
    this.useMove('player', attackerGameId, 0, targetGameId);
  }

  private executeAttack(attackerId: 'player'|'ai', defenderId: 'player'|'ai', attacker: InGameCard, targetGameId: string | undefined, movePower: number, moveName: string, currentState: GameState) {
    const attackerPlayer = currentState[attackerId];
    const defenderPlayer = currentState[defenderId];

    const defenderCard = targetGameId ? defenderPlayer.field.find(c => c.gameId === targetGameId) : null;

    if (targetGameId && !defenderCard) return;

    let finalDamage = 0;
    let effectivenessMsg = '';

    if (defenderCard) {
      const attackerType = attacker.types[0];
      const defenderType = defenderCard.types[0];
      const multiplier = this.getDamageMultiplier(attackerType, defenderType);

      let rawDamage = movePower;

      if (defenderCard.isDefending) {
        rawDamage -= defenderCard.defense;
        if (rawDamage < 0) rawDamage = 0;
        this.logMessage(`${defenderCard.name} se está defendiendo y mitiga daño.`);
      }

      if (rawDamage < 10) rawDamage = 10;
      finalDamage = rawDamage * multiplier;

      defenderCard.currentHp -= finalDamage;
      defenderPlayer.hp -= finalDamage;
      if (defenderPlayer.hp < 0) defenderPlayer.hp = 0;

      // Disparar animación de impacto
      defenderCard.isHit = true;
      this.state.next({ ...currentState });

      effectivenessMsg = multiplier === 2 ? ' ¡Es súper efectivo!' : '';
      this.logMessage(`${attacker.name} usa ${moveName} contra ${defenderCard.name} causando ${finalDamage} de daño.${effectivenessMsg}`);

      const wasDefeated = defenderCard.currentHp <= 0;

      if (wasDefeated) {
        // Animación de derrota antes de eliminar la carta
        defenderCard.isDefeated = true;
        this.state.next({ ...currentState });
        setTimeout(() => {
          const s = this.state.getValue();
          const dp = s[defenderId];
          dp.field = dp.field.filter(c => c.gameId !== targetGameId);
          dp.discard.push({ ...defenderCard, isHit: false, isDefeated: false });
          attackerPlayer.pokemonDefeated += 1;
          this.logMessage(`${defenderCard.name} se ha debilitado.`);
          this.checkWinCondition(s);
          this.state.next({ ...s });
        }, 700);
      } else {
        // Limpiar isHit después de la animación
        setTimeout(() => {
          const s = this.state.getValue();
          const dp = s[defenderId];
          const dc = dp.field.find(c => c.gameId === targetGameId);
          if (dc) { dc.isHit = false; this.state.next({ ...s }); }
        }, 500);
      }
    } else {
      finalDamage = movePower;
      defenderPlayer.hp -= finalDamage;
      if (defenderPlayer.hp < 0) defenderPlayer.hp = 0;
      this.logMessage(`${attacker.name} usa ${moveName} directamente contra ${defenderPlayer.name} causando ${finalDamage} de daño.`);
    }

    attacker.canAttack = false;
    if (!defenderCard || defenderCard.currentHp > 0) {
      this.checkWinCondition(currentState);
    }
    this.state.next(currentState);
  }

  useSpecialAbility(playerId: 'player' | 'ai', cardGameId: string) {
    const currentState = this.state.getValue();
    if (currentState.activePlayerId !== playerId || currentState.status !== 'playing') return;

    const player = currentState[playerId];
    const card = player.field.find(c => c.gameId === cardGameId);

    if (!card || card.abilityUsed) return;

    const primaryType = card.types[0];
    card.abilityUsed = true;
    let effectMessage = '';

    switch (primaryType) {
      case 'grass':
      case 'fairy':
        card.currentHp += 150;
        if (card.currentHp > card.hp) card.currentHp = card.hp;
        effectMessage = `se cura 150 HP.`;
        break;
      case 'fire':
      case 'fighting':
      case 'dragon':
        // Aumentamos el poder de todos sus ataques en 80
        card.moves.forEach(m => { if (m.type === 'attack') m.power += 80; });
        effectMessage = `aumenta el poder de sus ataques permanentemente en 80.`;
        break;
      case 'water':
      case 'psychic':
      case 'electric':
        this.drawCard(playerId);
        effectMessage = `te permite robar una carta.`;
        break;
      default:
        card.defense += 80;
        effectMessage = `aumenta su defensa en 80.`;
        break;
    }

    this.logMessage(`${card.name} usa Habilidad (${card.specialAbility}) y ${effectMessage}`);
    this.state.next(currentState);
  }

  checkWinCondition(currentState: GameState) {
    if (currentState.status === 'won' || currentState.status === 'lost') return;

    const playerLostAll = currentState.player.deck.length === 0 && currentState.player.hand.length === 0 && currentState.player.field.length === 0;
    const aiLostAll = currentState.ai.deck.length === 0 && currentState.ai.hand.length === 0 && currentState.ai.field.length === 0;

    // Victoria si la IA llega a 0 HP o se queda sin cartas. Derrota si el jugador llega a 0 HP o se queda sin cartas.
    if (currentState.ai.hp <= 0 || aiLostAll) {
      currentState.status = 'won';
      this.logMessage('¡Los puntos de vida del Rival han llegado a 0! ¡HAS GANADO!');
      this.historyService.saveMatchResult('pve', 'win', 'Rival IA');
    } else if (currentState.player.hp <= 0 || playerLostAll) {
      currentState.status = 'lost';
      this.logMessage('Tus puntos de vida han llegado a 0. Has perdido...');
      this.historyService.saveMatchResult('pve', 'loss', 'Rival IA');
    }
  }

  endTurn() {
    const currentState = this.state.getValue();
    if (currentState.status !== 'playing') return;

    const playerState = currentState.activePlayerId === 'player' ? currentState.player : currentState.ai;
    playerState.field.forEach((c: InGameCard) => c.canAttack = true);

    if (currentState.activePlayerId === 'player') {
      currentState.log = [];
      currentState.activePlayerId = 'ai';
      currentState.ai.field.forEach(c => c.isDefending = false);

      this.logMessage('--- Turno del Rival ---');
      this.drawCard('ai');
      this.state.next(currentState);
      this.executeAiTurn();
    } else {
      currentState.log = [];
      currentState.turnNumber++;
      currentState.activePlayerId = 'player';
      currentState.player.field.forEach(c => c.isDefending = false);

      this.logMessage(`--- Turno ${currentState.turnNumber}: Tu Turno ---`);
      this.drawCard('player');
      this.state.next(currentState);
    }
  }

  // --- IA MEJORADA Y COMPETITIVA ---
  private executeAiTurn() {
    const currentState = this.state.getValue();
    if (currentState.status !== 'playing') return;

    setTimeout(() => {
      this.processAiActions();
    }, 800);
  }

  private processAiActions() {
    const state = this.state.getValue();
    if (state.status !== 'playing') return;
    const ai = state.ai;
    const player = state.player;

    // 1. Jugar cartas inteligentemente
    // Llena el campo siempre que pueda
    while (ai.field.length < 3 && ai.hand.length > 0) {
      // Priorizar jugar el Pokemon con mayor HP/Ataque
      ai.hand.sort((a, b) => (b.hp + b.attack) - (a.hp + a.attack));
      this.playCard('ai', ai.hand[0].gameId);
    }

    // 2. Activar Habilidades Inteligentemente
    ai.field.forEach(aiCard => {
      if (!aiCard.abilityUsed) {
        // Usa curación si le falta vida
        if (['grass', 'fairy'].includes(aiCard.types[0]) && aiCard.currentHp < aiCard.hp - 50) {
          this.useSpecialAbility('ai', aiCard.gameId);
        }
        // Usa daño extra o robar cartas agresivamente
        else if (['fire', 'fighting', 'dragon', 'water', 'electric', 'psychic'].includes(aiCard.types[0])) {
          this.useSpecialAbility('ai', aiCard.gameId);
        }
      }
    });

    // 3. Atacar Inteligentemente
    // Solo cartas que pueden atacar (las que ya estaban en el turno anterior)
    const attackers = ai.field.filter(c => c.canAttack);

    attackers.forEach(aiCard => {
      // 10% de probabilidad base de defender, o 40% si tiene menos del 30% de HP
      const shouldDefend = Math.random() < (aiCard.currentHp < aiCard.hp * 0.3 ? 0.4 : 0.1);

      if (shouldDefend) {
        const defenseIndex = aiCard.moves.findIndex(m => m.type === 'defense');
        if (defenseIndex !== -1) {
          this.useMove('ai', aiCard.gameId, defenseIndex);
          return;
        }
      }

      // Selecciona el mejor objetivo del jugador
      if (player.field.length > 0) {
        // Priorizar al objetivo con menos vida para matarlo rápido
        const targets = [...player.field].sort((a, b) => a.currentHp - b.currentHp);

        // Pero si hay debilidad de tipo a favor de la IA, darle prioridad
        const bestTarget = targets.find(t => this.getDamageMultiplier(aiCard.types[0], t.types[0]) === 2) || targets[0];

        // Elegir un ataque al azar
        const attackMoves = aiCard.moves.map((m, idx) => ({ m, idx })).filter(item => item.m.type === 'attack');
        if (attackMoves.length > 0) {
          const randomAttack = attackMoves[Math.floor(Math.random() * attackMoves.length)];
          this.useMove('ai', aiCard.gameId, randomAttack.idx, bestTarget.gameId);
        }
      } else {
        // Si el jugador no tiene cartas en el campo, ataca directamente al jugador
        const attackMoves = aiCard.moves.map((m, idx) => ({ m, idx })).filter(item => item.m.type === 'attack');
        if (attackMoves.length > 0) {
          const randomAttack = attackMoves[Math.floor(Math.random() * attackMoves.length)];
          this.useMove('ai', aiCard.gameId, randomAttack.idx); // undefined targetGameId
        }
      }
    });

    // 4. Terminar Turno
    setTimeout(() => {
      this.endTurn();
    }, 1200);
  }
}
