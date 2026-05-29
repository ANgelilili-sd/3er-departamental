import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { MultiplayerService } from '../../services/multiplayer.service';
import { MultiplayerEngineService } from '../../services/multiplayer-engine.service';
import { PokemonService } from '../../services/pokemon';
import { AuthService } from '../../services/auth.service';
import { MultiplayerRoom, MultiplayerGameState, InGameCard, PlayerState } from '../../models/game-state.model';
import { HistoryService } from '../../services/history.service';
import { AlertService } from '../../services/alert.service';
import { Subscription, firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-pvp',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './pvp.html',
  styleUrl: './pvp.css'
})
export class Pvp implements OnInit, OnDestroy {
  phase: 'lobby' | 'waiting' | 'battling' = 'lobby';
  loading = false;
  
  rooms: MultiplayerRoom[] = [];
  currentRoom: MultiplayerRoom | null = null;
  gameState: MultiplayerGameState | null = null;
  
  currentUser: any = null;
  selectedAttackerId: string | null = null;
  selectedMoveIndex: number | null = null;
  
  private roomSub: Subscription | null = null;
  private authSub: Subscription | null = null;

  private historySaved = false;

  constructor(
    private router: Router,
    private multiplayerService: MultiplayerService,
    private engine: MultiplayerEngineService,
    private pokemonService: PokemonService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private historyService: HistoryService,
    private alertService: AlertService
  ) {}

  ngOnInit() {
    this.authSub = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user) {
        this.loadRooms();
      } else {
        this.loading = false;
        this.cdr.detectChanges();
        this.alertService.show('Debes iniciar sesión para jugar en línea.');
        this.router.navigate(['/login']);
      }
    });

    this.roomSub = this.multiplayerService.currentRoom$.subscribe(room => {
      this.currentRoom = room;
      if (room) {
        this.gameState = room.game_state;
        if (!this.isMyTurn) {
          this.selectedAttackerId = null;
          this.selectedMoveIndex = null;
        }

        if (room.status === 'playing' || room.status === 'finished') {
          this.phase = 'battling';
          if (room.status === 'finished' && !this.historySaved) {
            this.historySaved = true;
            const result = room.winner_id === this.currentUser?.id ? 'win' : 'loss';
            const opponentName = this.opponentState?.name || 'Oponente';
            this.historyService.saveMatchResult('pvp', result, opponentName);
          }
        } else if (room.status === 'waiting') {
          this.phase = 'waiting';
        }
      } else {
        this.phase = 'lobby';
        this.historySaved = false;
      }
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    if (this.roomSub) this.roomSub.unsubscribe();
    if (this.authSub) this.authSub.unsubscribe();
    this.multiplayerService.leaveRoom();
  }

  async loadRooms() {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      this.rooms = await this.multiplayerService.getAvailableRooms();
    } catch (e) {
      console.error('Error loading rooms', e);
    }
    this.loading = false;
    this.cdr.detectChanges();
  }

  private async generateDeck(): Promise<InGameCard[]> {
    const rawCards = await firstValueFrom(this.pokemonService.getRandomCards(15));
    return rawCards.map(c => this.engine.mapToInGameCard(c));
  }

  async createRoom() {
    if (!this.currentUser) return;
    this.loading = true;
    this.cdr.detectChanges();
    try {
      let deck = await this.generateDeck();
      deck = this.engine.shuffleDeck(deck);
      const username = this.currentUser.user_metadata?.username || this.currentUser.email;
      await this.multiplayerService.createRoom(this.currentUser.id, username, deck);
    } catch (e) {
      console.error('Error creating room', e);
      this.alertService.show('Error al crear la sala');
    }
    this.loading = false;
    this.cdr.detectChanges();
  }

  async joinRoom(roomId: string) {
    if (!this.currentUser) return;
    this.loading = true;
    this.cdr.detectChanges();
    try {
      let deck = await this.generateDeck();
      deck = this.engine.shuffleDeck(deck);
      const username = this.currentUser.user_metadata?.username || this.currentUser.email;
      await this.multiplayerService.joinRoom(roomId, this.currentUser.id, username, deck);
    } catch (e) {
      console.error('Error joining room', e);
      this.alertService.show('Error al unirse a la sala. Es posible que ya esté llena.');
      this.loadRooms();
    }
    this.loading = false;
    this.cdr.detectChanges();
  }

  // --- MÉTODOS DE BATALLA ---

  get isMyTurn(): boolean {
    return this.gameState?.activePlayerId === this.currentUser?.id;
  }

  get myState(): PlayerState | null {
    if (!this.gameState || !this.currentUser) return null;
    if (this.gameState.player1.id === this.currentUser.id) return this.gameState.player1;
    if (this.gameState.player2?.id === this.currentUser.id) return this.gameState.player2;
    return null;
  }

  get opponentState(): PlayerState | null {
    if (!this.gameState || !this.currentUser) return null;
    if (this.gameState.player1.id === this.currentUser.id) return this.gameState.player2;
    if (this.gameState.player2?.id === this.currentUser.id) return this.gameState.player1;
    return null;
  }

  async onPlayCard(card: InGameCard) {
    if (!this.isMyTurn || !this.currentRoom || !this.gameState) return;
    await this.engine.playCard(this.currentRoom.id, this.gameState, this.currentUser.id, card.gameId);
  }

  onSelectPlayerFieldCard(card: InGameCard) {
    if (!this.isMyTurn) return;
    if (card.canAttack) {
      if (this.selectedAttackerId === card.gameId) {
        this.selectedAttackerId = null;
        this.selectedMoveIndex = null;
        return;
      }
      this.selectedAttackerId = card.gameId;
      this.selectedMoveIndex = null;
    }
  }

  async onSelectMove(card: InGameCard, moveIndex: number, event: Event) {
    event.stopPropagation();
    if (!this.isMyTurn || !this.currentRoom || !this.gameState) return;

    if (this.selectedMoveIndex === moveIndex) {
      this.selectedMoveIndex = null;
      return;
    }

    const move = card.moves[moveIndex];
    if (move.type === 'defense') {
      await this.engine.useMove(this.currentRoom.id, this.gameState, this.currentUser.id, card.gameId, moveIndex);
      this.selectedAttackerId = null;
      this.selectedMoveIndex = null;
    } else {
      this.selectedMoveIndex = moveIndex;
    }
  }

  isSuperEffectiveTarget(targetCard: InGameCard): boolean {
    if (!this.selectedAttackerId || !this.myState) return false;
    const attacker = this.myState.field.find(c => c.gameId === this.selectedAttackerId);
    if (!attacker) return false;
    return this.engine.getDamageMultiplier(attacker.types[0], targetCard.types[0]) === 2;
  }

  async onSelectEnemyFieldCard(targetCard: InGameCard) {
    if (!this.isMyTurn || !this.selectedAttackerId || this.selectedMoveIndex === null || !this.currentRoom || !this.gameState) return;
    await this.engine.useMove(this.currentRoom.id, this.gameState, this.currentUser.id, this.selectedAttackerId, this.selectedMoveIndex, targetCard.gameId);
    this.selectedAttackerId = null;
    this.selectedMoveIndex = null;
  }

  async onAttackPlayerDirectly() {
    if (!this.isMyTurn || !this.selectedAttackerId || this.selectedMoveIndex === null || !this.currentRoom || !this.gameState) return;
    await this.engine.useMove(this.currentRoom.id, this.gameState, this.currentUser.id, this.selectedAttackerId, this.selectedMoveIndex);
    this.selectedAttackerId = null;
    this.selectedMoveIndex = null;
  }

  async onUseAbility(card: InGameCard, event: Event) {
    event.stopPropagation();
    if (!this.isMyTurn || !this.currentRoom || !this.gameState) return;
    await this.engine.useSpecialAbility(this.currentRoom.id, this.gameState, this.currentUser.id, card.gameId);
    this.selectedAttackerId = null;
    this.selectedMoveIndex = null;
  }

  async onEndTurn() {
    if (!this.isMyTurn || !this.currentRoom || !this.gameState) return;
    this.selectedAttackerId = null;
    this.selectedMoveIndex = null;
    await this.engine.endTurn(this.currentRoom.id, this.gameState, this.currentUser.id);
  }
}
