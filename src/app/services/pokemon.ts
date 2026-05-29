import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, tap, catchError, timeout } from 'rxjs/operators';
import { PokemonCard } from '../models/pokemon-card.model';

@Injectable({
  providedIn: 'root',
})
export class PokemonService {
  private apiUrl = 'https://pokeapi.co/api/v2';
  private cardCache = new Map<string | number, PokemonCard>();

  constructor(private http: HttpClient) {}

  getPokemonCard(idOrName: string | number): Observable<PokemonCard> {
    if (this.cardCache.has(idOrName)) {
      return of(this.cardCache.get(idOrName)!);
    }

    // Añadimos timeout de 3 segundos para que si la API se satura, no congele el juego
    const pokemonReq = this.http.get<any>(`${this.apiUrl}/pokemon/${idOrName}`).pipe(
      timeout(3000),
      catchError(() => of(null))
    );
    
    const speciesReq = this.http.get<any>(`${this.apiUrl}/pokemon-species/${idOrName}`).pipe(
      timeout(3000),
      catchError(() => of(null))
    );

    return forkJoin([pokemonReq, speciesReq]).pipe(
      map(([pokemonData, speciesData]) => {
        if (!pokemonData) {
          // Devuelve una carta genérica si falla
          return this.getFallbackCard();
        }
        return this.mapToPokemonCard(pokemonData, speciesData);
      }),
      tap((card) => {
        this.cardCache.set(idOrName, card);
      })
    );
  }

  private getFallbackCard(): PokemonCard {
    return {
      id: 0,
      name: 'MissingNo',
      image: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/201.png', // Unown genérico
      types: ['normal'],
      attack: 100,
      defense: 100,
      hp: 1000,
      specialAbility: 'Fallo en la Matrix',
      level: 'Común',
      description: 'Un error temporal.',
      moves: [
        { name: 'Ataque Falla', type: 'attack', power: 100 },
        { name: 'Defensa Errónea', type: 'defense', power: 0 }
      ]
    };
  }

  private mapToPokemonCard(pokemonData: any, speciesData: any): PokemonCard {
    // 1. Extraer nombre, id e imagen
    const id = pokemonData?.id || 0;
    // Capitalizar nombre
    const rawName = pokemonData?.name || 'Desconocido';
    const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    
    // Priorizar imagen 'official-artwork', fallback a 'dream_world' o sprite normal con safe navigation
    const image = pokemonData?.sprites?.other?.['official-artwork']?.front_default 
      || pokemonData?.sprites?.other?.dream_world?.front_default 
      || pokemonData?.sprites?.front_default
      || '';

    // 2. Extraer tipos
    const types = pokemonData?.types?.map((t: any) => t?.type?.name) || ['Normal'];

    // 3. Extraer estadísticas base y adaptarlas al juego
    const baseHp = pokemonData?.stats?.find((s: any) => s?.stat?.name === 'hp')?.base_stat || 50;
    const baseAttack = pokemonData?.stats?.find((s: any) => s?.stat?.name === 'attack')?.base_stat || 50;
    const baseDefense = pokemonData?.stats?.find((s: any) => s?.stat?.name === 'defense')?.base_stat || 50;

    const hp = baseHp * 10;
    const attack = baseAttack * 5;
    const defense = baseDefense * 5;

    // 4. Habilidad Especial
    const ability = pokemonData?.abilities?.find((a: any) => !a?.is_hidden)?.ability?.name 
                 || pokemonData?.abilities?.[0]?.ability?.name 
                 || 'Ninguna';
    const specialAbility = ability.charAt(0).toUpperCase() + ability.slice(1);

    // 5. Nivel o Rareza
    const exp = pokemonData?.base_experience || 100;
    let level = 'Común';
    if (exp >= 250) level = 'Legendaria';
    else if (exp >= 180) level = 'Épica';
    else if (exp >= 120) level = 'Rara';
    else if (exp >= 80) level = 'Poco Común';

    // 6. Descripción breve
    const flavorTextEntries = speciesData?.flavor_text_entries || [];
    let descriptionEntry = flavorTextEntries.find((entry: any) => entry?.language?.name === 'es');
    if (!descriptionEntry) {
      descriptionEntry = flavorTextEntries.find((entry: any) => entry?.language?.name === 'en');
    }
    const description = descriptionEntry ? descriptionEntry.flavor_text.replace(/[\n\f]/g, ' ') : 'Un Pokémon misterioso.';

    // 7. Movimientos
    const allMoves = pokemonData?.moves || [];
    const moves: any[] = [];
    
    const availableApiMoves = allMoves.filter((m: any) => m.move?.name);
    if (availableApiMoves.length > 0) {
      const numAttacks = Math.floor(Math.random() * 2) + 1; // 1 o 2 ataques
      const selected = availableApiMoves.sort(() => 0.5 - Math.random()).slice(0, numAttacks);
      selected.forEach((m: any) => {
        moves.push({
          name: m.move.name.charAt(0).toUpperCase() + m.move.name.slice(1).replace(/-/g, ' '),
          type: 'attack',
          power: attack // usa la stat calculada
        });
      });
    } else {
      moves.push({ name: 'Placaje', type: 'attack', power: attack });
    }

    moves.push({
      name: 'Posición Defensiva',
      type: 'defense',
      power: 0
    });

    return { id, name, image, types, attack, defense, hp, specialAbility, level, description, moves };
  }

  // Método para obtener un conjunto de cartas específicas (colección fija)
  getSpecificCards(ids: number[]): Observable<PokemonCard[]> {
    const requests: Observable<PokemonCard>[] = [];
    for (const id of ids) {
      requests.push(this.getPokemonCard(id));
    }
    return forkJoin(requests);
  }

  // Método para obtener un mazo/sobre de N cartas aleatorias
  getRandomCards(count: number): Observable<PokemonCard[]> {
    const requests: Observable<PokemonCard>[] = [];
    for (let i = 0; i < count; i++) {
      const randomId = Math.floor(Math.random() * (1025 - 906 + 1)) + 906;
      requests.push(this.getPokemonCard(randomId));
    }
    return forkJoin(requests);
  }
}
