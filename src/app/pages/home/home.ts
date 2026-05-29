import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomeComponent implements OnInit, OnDestroy {
  currentUser: any = null;
  username: string = '';

  /** Estilos inline para cada partícula flotante */
  particles: string[] = [];

  /** Estilos inline para cada rayo de energía */
  rays: string[] = [];

  constructor(
    private router: Router,
    private authService: AuthService,
    private alertService: AlertService
  ) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user) {
        this.username = user.user_metadata?.['username'] || user.email?.split('@')[0] || 'Entrenador';
      }
    });

    this.generateParticles();
    this.generateRays();
  }

  /** Genera 40 partículas con posición, tamaño, color y duración aleatorios */
  private generateParticles(): void {
    const colors = [
      'rgba(255,204,0,0.7)',
      'rgba(59,130,246,0.7)',
      'rgba(239,68,68,0.7)',
      'rgba(34,197,94,0.7)',
      'rgba(168,85,247,0.7)',
      'rgba(255,255,255,0.5)',
    ];

    this.particles = Array.from({ length: 40 }, () => {
      const size   = Math.random() * 5 + 2;
      const left   = Math.random() * 100;
      const delay  = Math.random() * 15;
      const dur    = Math.random() * 12 + 8;
      const color  = colors[Math.floor(Math.random() * colors.length)];
      return `left:${left}%;width:${size}px;height:${size}px;background:${color};animation-duration:${dur}s;animation-delay:${delay}s;box-shadow:0 0 ${size * 2}px ${color}`;
    });
  }

  /** Genera 12 rayos de energía verticales */
  private generateRays(): void {
    this.rays = Array.from({ length: 12 }, () => {
      const left   = Math.random() * 100;
      const height = Math.random() * 40 + 20;
      const delay  = Math.random() * 6;
      const dur    = Math.random() * 4 + 3;
      const opacity = Math.random() * 0.4 + 0.1;
      return `left:${left}%;height:${height}vh;animation-duration:${dur}s;animation-delay:${delay}s;opacity:${opacity}`;
    });
  }

  onNavigate(route: string) {
    if (route !== 'pve' && route !== 'login' && route !== 'register' && !this.currentUser) {
      this.alertService.show('Debes iniciar sesión para acceder a esta función.');
      this.router.navigate(['/login']);
      return;
    }
    this.router.navigate([`/${route}`]);
  }

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }

  ngOnDestroy() {}
}
