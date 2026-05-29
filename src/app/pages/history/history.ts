import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { HistoryService, MatchHistoryEntry } from '../../services/history.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './history.html',
  styleUrl: './history.css',
})
export class HistoryComponent implements OnInit {
  matches: MatchHistoryEntry[] = [];
  loading = true;

  constructor(
    private historyService: HistoryService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private authService: AuthService,
    private alertService: AlertService
  ) {}

  async ngOnInit() {
    this.authService.currentUser$.subscribe(async user => {
      if (!user) {
        this.alertService.show('Debes iniciar sesión para ver el historial.');
        this.router.navigate(['/login']);
        return;
      }
      this.loading = true;
      this.cdr.detectChanges();
      try {
        this.matches = await this.historyService.getHistory();
      } catch (error) {
        console.error('Error cargando historial', error);
      }
      this.loading = false;
      this.cdr.detectChanges();
    });
  }
}
