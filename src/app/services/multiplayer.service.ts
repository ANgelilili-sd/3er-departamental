import { Injectable, NgZone } from '@angular/core';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';
import { MultiplayerRoom, MultiplayerGameState } from '../models/game-state.model';

@Injectable({
  providedIn: 'root'
})
export class MultiplayerService {
  private supabase: SupabaseClient;
  private currentRoomSubject = new BehaviorSubject<MultiplayerRoom | null>(null);
  currentRoom$ = this.currentRoomSubject.asObservable();
  
  private realtimeChannel: RealtimeChannel | null = null;

  constructor(private ngZone: NgZone) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  async getAvailableRooms(): Promise<MultiplayerRoom[]> {
    const { data, error } = await this.supabase
      .from('multiplayer_games')
      .select('*')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createRoom(player1Id: string, player1Name: string, initialDeck: any[]): Promise<MultiplayerRoom> {
    const initialState: MultiplayerGameState = {
      status: 'waiting',
      turnNumber: 0,
      activePlayerId: player1Id,
      player1: {
        id: player1Id,
        name: player1Name,
        hp: 9000,
        deck: initialDeck,
        hand: [],
        field: [],
        discard: [],
        pokemonDefeated: 0
      },
      player2: null,
      log: ['Sala creada. Esperando al jugador 2...']
    };

    const { data, error } = await this.supabase
      .from('multiplayer_games')
      .insert([
        {
          player1_id: player1Id,
          status: 'waiting',
          game_state: initialState
        }
      ])
      .select()
      .single();

    if (error) throw error;
    
    this.subscribeToRoom(data.id);
    this.currentRoomSubject.next(data);
    return data;
  }

  async joinRoom(roomId: string, player2Id: string, player2Name: string, initialDeck: any[]): Promise<void> {
    // Primero, obtener la sala actual
    const { data: roomData, error: fetchError } = await this.supabase
      .from('multiplayer_games')
      .select('*')
      .eq('id', roomId)
      .single();

    if (fetchError) throw fetchError;
    if (roomData.status !== 'waiting') throw new Error('La sala ya no está disponible');

    const state: MultiplayerGameState = roomData.game_state;
    state.status = 'playing';
    state.turnNumber = 1;
    
    // Lanzamiento de moneda para ver quién empieza
    const startsFirstId = Math.random() < 0.5 ? state.player1.id : player2Id;
    state.activePlayerId = startsFirstId;
    
    state.player2 = {
      id: player2Id,
      name: player2Name,
      hp: 9000,
      deck: initialDeck,
      hand: [],
      field: [],
      discard: [],
      pokemonDefeated: 0
    };
    
    if (startsFirstId === player2Id) {
      state.log.unshift(`${player2Name} se ha unido. La moneda cae a su favor. ¡Empieza ${player2Name}!`);
    } else {
      state.log.unshift(`${player2Name} se ha unido. La moneda cae a favor de ${state.player1.name}. ¡Empieza ${state.player1.name}!`);
    }

    const { data, error } = await this.supabase
      .from('multiplayer_games')
      .update({
        player2_id: player2Id,
        status: 'playing',
        game_state: state
      })
      .eq('id', roomId)
      .select()
      .single();

    if (error) throw error;
    
    this.subscribeToRoom(roomId);
    this.currentRoomSubject.next(data);
  }

  async updateGameState(roomId: string, newState: MultiplayerGameState): Promise<void> {
    const { error } = await this.supabase
      .from('multiplayer_games')
      .update({ game_state: newState })
      .eq('id', roomId);

    if (error) throw error;
  }

  async setWinner(roomId: string, winnerId: string, finalState: MultiplayerGameState): Promise<void> {
    finalState.status = 'finished';
    const { error } = await this.supabase
      .from('multiplayer_games')
      .update({
        status: 'finished',
        winner_id: winnerId,
        game_state: finalState
      })
      .eq('id', roomId);

    if (error) throw error;
  }

  private subscribeToRoom(roomId: string) {
    if (this.realtimeChannel) {
      this.supabase.removeChannel(this.realtimeChannel);
    }

    this.realtimeChannel = this.supabase.channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'multiplayer_games',
          filter: `id=eq.${roomId}`
        },
        (payload) => {
          this.ngZone.run(() => {
            this.currentRoomSubject.next(payload.new as MultiplayerRoom);
          });
        }
      )
      .subscribe();
  }

  leaveRoom() {
    if (this.realtimeChannel) {
      this.supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    this.currentRoomSubject.next(null);
  }
}
