import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';

export interface MatchHistoryEntry {
  id?: string;
  user_id: string;
  game_mode: 'pve' | 'pvp';
  result: 'win' | 'loss';
  opponent_name: string;
  created_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class HistoryService {
  private supabase: SupabaseClient;

  constructor(private authService: AuthService) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  async getHistory(): Promise<MatchHistoryEntry[]> {
    const user = await firstValueFrom(this.authService.currentUser$);
    if (!user) return [];

    const { data, error } = await this.supabase
      .from('match_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching history:', error);
      return [];
    }

    return data as MatchHistoryEntry[];
  }

  async saveMatchResult(gameMode: 'pve' | 'pvp', result: 'win' | 'loss', opponentName: string) {
    const user = await firstValueFrom(this.authService.currentUser$);
    // Only save history if the user is authenticated
    if (!user) return;

    const { error } = await this.supabase
      .from('match_history')
      .insert([
        {
          user_id: user.id,
          game_mode: gameMode,
          result: result,
          opponent_name: opponentName
        }
      ]);

    if (error) {
      console.error('Error saving match result:', error);
    }
  }
}
