import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { PokemonService } from '../../services/pokemon';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { PokemonCard } from '../../models/pokemon-card.model';

@Component({
  selector: 'app-collection',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './collection.html',
  styleUrl: './collection.css',
})
export class Collection implements OnInit {
  cards: PokemonCard[] = [];
  loading = true;

  constructor(
    private pokemonService: PokemonService, 
    private cdr: ChangeDetectorRef,
    private router: Router,
    private authService: AuthService,
    private alertService: AlertService
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      if (!user) {
        this.alertService.show('Debes iniciar sesión para ver la colección.');
        this.router.navigate(['/login']);
        return;
      }
      this.loadCollection();
    });
  }

  loadCollection() {
    // Definimos los IDs de los Pokémon que formarán la colección inicial del usuario
    // Colección de cartas de Novena Generación (Paldea) completa
    const misCartasIds = Array.from({ length: 1025 - 906 + 1 }, (_, i) => 906 + i);

    this.pokemonService.getSpecificCards(misCartasIds).subscribe({
      next: (cards) => {
        this.cards = cards;
        this.loading = false;
        console.log('Cartas cargadas:', this.cards);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar cartas:', err);
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }
}
