import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PokemonService } from '../../services/pokemon';
import { GameEngineService } from '../../services/game-engine.service';
import { AlertService } from '../../services/alert.service';
import { GameState, InGameCard } from '../../models/game-state.model';
import { PokemonCard } from '../../models/pokemon-card.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-pve',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './pve.html',
  styleUrl: './pve.css',
})
export class Pve implements OnInit, OnDestroy {
  gameState!: GameState;
  loading = true;
  phase: 'selecting' | 'battling' = 'selecting';
  starterCards: PokemonCard[] = [];
  
  private sub!: Subscription;

  // Selección temporal para atacar
  selectedAttackerId: string | null = null;
  selectedMoveIndex: number | null = null;

  constructor(
    private pokemonService: PokemonService,
    public gameEngine: GameEngineService,
    private cdr: ChangeDetectorRef,
    private alertService: AlertService
  ) {}

  ngOnInit(): void {
    // Fase de selección: Cargar 3 cartas iniciales de Paldea (Sprigatito, Fuecoco, Quaxly)
    this.loading = true;
    this.pokemonService.getSpecificCards([906, 909, 912]).subscribe({
      next: (cards) => {
        this.starterCards = cards;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.alertService.show('Error al cargar selección inicial. Intenta recargar la página.');
        this.loading = false;
        this.cdr.detectChanges();
      }
    });

    // Suscribirse al estado del juego
    this.sub = this.gameEngine.gameState$.subscribe(state => {
      this.gameState = state;
      if (state.activePlayerId !== 'player') {
        this.selectedAttackerId = null;
        this.selectedMoveIndex = null;
      }
      this.cdr.detectChanges();
    });
  }

  selectCard(playerCard: PokemonCard) {
    this.loading = true;
    
    // Pool de IDs de Novena Generación (Paldea) completa (906 a 1025)
    const pool = Array.from({ length: 1025 - 906 + 1 }, (_, i) => 906 + i);
    
    // Seleccionar 4 aleatorias para el jugador (más el starter = 5)
    const playerDeckIds = [...pool].sort(() => 0.5 - Math.random()).slice(0, 4);
    // Seleccionar 5 aleatorias para la IA
    const aiDeckIds = [...pool].sort(() => 0.5 - Math.random()).slice(0, 5);

    this.pokemonService.getSpecificCards(playerDeckIds).subscribe({
      next: pCards => {
        this.pokemonService.getSpecificCards(aiDeckIds).subscribe({
          next: aiCards => {
            const playerDeck = [playerCard, ...pCards];
            this.gameEngine.startGame(playerDeck, aiCards);
            this.phase = 'battling';
            this.loading = false;
            this.cdr.detectChanges();
          },
          error: err => {
            console.error('Error cargando IA:', err);
            this.loading = false;
            this.cdr.detectChanges();
          }
        });
      },
      error: err => {
        console.error('Error cargando jugador:', err);
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe();
  }

  // --- Interacciones del Jugador ---

  onPlayCard(card: InGameCard) {
    if (this.gameState.activePlayerId !== 'player') return;
    this.gameEngine.playCard('player', card.gameId);
  }

  onSelectPlayerFieldCard(card: InGameCard) {
    if (this.gameState.activePlayerId !== 'player' || !card.canAttack) return;
    // Si vuelve a dar clic al mismo, deseleccionar
    if (this.selectedAttackerId === card.gameId) {
      this.selectedAttackerId = null;
      this.selectedMoveIndex = null;
      return;
    }
    // Seleccionar carta aliada para abrir menú de acciones
    this.selectedAttackerId = card.gameId;
    this.selectedMoveIndex = null; // Reiniciar movimiento
  }

  onSelectMove(card: InGameCard, moveIndex: number, event: Event) {
    event.stopPropagation();
    if (this.gameState.activePlayerId !== 'player') return;

    // Si le da clic al mismo movimiento seleccionado, se deselecciona
    if (this.selectedMoveIndex === moveIndex) {
      this.selectedMoveIndex = null;
      return;
    }

    const move = card.moves[moveIndex];
    if (move.type === 'defense') {
      this.gameEngine.useMove('player', card.gameId, moveIndex);
      this.selectedAttackerId = null;
      this.selectedMoveIndex = null;
    } else {
      // Si es ataque, guardamos el índice y esperamos a que elija un objetivo
      this.selectedMoveIndex = moveIndex;
    }
  }

  isSuperEffectiveTarget(targetCard: InGameCard): boolean {
    if (!this.selectedAttackerId) return false;
    const attacker = this.gameState.player.field.find(c => c.gameId === this.selectedAttackerId);
    if (!attacker) return false;
    return this.gameEngine.getDamageMultiplier(attacker.types[0], targetCard.types[0]) === 2;
  }

  onSelectEnemyFieldCard(card: InGameCard) {
    if (this.gameState.activePlayerId !== 'player' || !this.selectedAttackerId || this.selectedMoveIndex === null) return;
    // Ejecutar ataque
    this.gameEngine.useMove('player', this.selectedAttackerId, this.selectedMoveIndex, card.gameId);
    this.selectedAttackerId = null; 
    this.selectedMoveIndex = null;
  }

  onAttackPlayerDirectly() {
    if (this.gameState.activePlayerId !== 'player' || !this.selectedAttackerId || this.selectedMoveIndex === null) return;
    // Ejecutar ataque directo al jugador (targetGameId = undefined)
    this.gameEngine.useMove('player', this.selectedAttackerId, this.selectedMoveIndex);
    this.selectedAttackerId = null;
    this.selectedMoveIndex = null;
  }

  onUseAbility(card: InGameCard, event: Event) {
    event.stopPropagation(); // Evitar que seleccione para atacar
    if (this.gameState.activePlayerId !== 'player') return;
    this.gameEngine.useSpecialAbility('player', card.gameId);
    this.selectedAttackerId = null;
    this.selectedMoveIndex = null;
  }

  onEndTurn() {
    if (this.gameState.activePlayerId === 'player') {
      this.gameEngine.endTurn();
      this.selectedAttackerId = null;
      this.selectedMoveIndex = null;
    }
  }

  resetGame() {
    this.phase = 'selecting';
    this.loading = false;
    this.selectedAttackerId = null;
    this.selectedMoveIndex = null;
    this.cdr.detectChanges();
  }
}
