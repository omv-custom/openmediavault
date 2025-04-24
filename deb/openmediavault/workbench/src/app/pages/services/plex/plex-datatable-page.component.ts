import { Component, OnInit, OnDestroy, ViewChild, TemplateRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { PlexService } from '~/app/core/services/plex.service';
import { Session } from '~/app/core/models/session.model';
import { LibraryStats } from '~/app/core/models/library-stats.model';
import { ServerInfo } from '~/app/core/models/server-info.model';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ThemePalette } from '@angular/material/core';
import { interval, Subscription, of } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-plex-page',
  templateUrl: './plex-page.component.html',
  styleUrls: ['./plex-page.component.scss'],
  standalone: false
})
export class PlexDatatablePageComponent implements OnInit, OnDestroy {
  serverInfo: ServerInfo | null = null;
  activeSessions: Session[] = [];
  libraryStats: LibraryStats[] = [];
  settingsForm: FormGroup;
  updateAvailable = false;
  isLoading = true;
  selectedTab = 'dashboard';
  installationType: 'docker' | 'native' | 'unknown' = 'unknown';
  color: ThemePalette = 'primary';
  isRefreshing = false;
  lastRefreshTime?: Date;
  private refreshSubscription?: Subscription;
  transcodingSessions: any[] = [];
  @ViewChild('terminateDialog') terminateDialogTemplate!: TemplateRef<any>;
  terminationReason = '';
  currentSession: Session | null = null;
  currentSessionId = '';
  isDialogOpen = false;
  isTerminating = false;

  constructor(
    private plexService: PlexService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.settingsForm = this.fb.group({
      autoUpdate: [false],
      hardwareAcceleration: [true],
      remoteAccess: [true],
      analytics: [true]
    });
  }

  ngOnInit(): void {
    this.loadData();
    this.detectInstallationType();
    this.startSessionAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopSessionAutoRefresh();
  }

  getLibraryCount(type: string): number {
    if (!this.libraryStats || this.libraryStats.length === 0) return 0;
    const lib = this.libraryStats.find(l => l.type === type);
    return lib ? lib.count : 0;
  }

  getLibraryIcon(type: string): string {
    switch (type) {
      case 'movie': return 'fas fa-film';
      case 'show': return 'fas fa-tv';
      case 'artist': return 'fas fa-music';
      case 'photo': return 'fas fa-camera';
      default: return 'fas fa-photo-video';
    }
  }

  async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      
      const [info, sessions, stats, transcoding] = await Promise.all([
        this.plexService.getServerInfo().toPromise(),
        this.plexService.getActiveSessions().toPromise(),
        this.plexService.getLibraryStats().toPromise(),
        this.plexService.getTranscodingSessions().toPromise()
      ]);
      
      this.serverInfo = info || this.plexService.getMockServerInfo();
      this.activeSessions = sessions || this.plexService.getMockSessions();
      this.libraryStats = stats || this.plexService.getMockLibraryStats();
      this.transcodingSessions = transcoding || [];
      this.updateAvailable = this.serverInfo.updateAvailable || false;
      
      if (this.serverInfo.settings) {
        this.settingsForm.patchValue(this.serverInfo.settings);
      }

    } catch (error) {
      console.error('Error loading Plex data:', error);
      this.showError('Failed to load Plex data. Using mock data instead.');
      this.serverInfo = this.plexService.getMockServerInfo();
      this.activeSessions = this.plexService.getMockSessions();
      this.libraryStats = this.plexService.getMockLibraryStats();
      this.transcodingSessions = [];
    } finally {
      this.isLoading = false;
    }
  }

  detectInstallationType(): void {
    this.plexService.getInstallationType().subscribe({
      next: (type) => {
        this.installationType = type;
      },
      error: (error) => {
        console.error('Error detecting installation type:', error);
        this.installationType = 'unknown';
      }
    });
  }

  async updateServer(): Promise<void> {
    try {
      this.isLoading = true;
      await this.plexService.updateServer(this.installationType).toPromise();
      this.updateAvailable = false;
      this.showSuccess('Server updated successfully!');
      await this.loadData();
    } catch (error) {
      console.error('Update failed:', error);
      this.showError('Failed to update server. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  async saveSettings(): Promise<void> {
    if (this.settingsForm.valid) {
      try {
        this.isLoading = true;
        await this.plexService.saveSettings(this.settingsForm.value).toPromise();
        this.showSuccess('Settings saved successfully!');
      } catch (error) {
        console.error('Error saving settings:', error);
        this.showError('Failed to save settings. Please try again.');
      } finally {
        this.isLoading = false;
      }
    }
  }
/*
terminateSession(session: Session): void {
  console.log(session);
  const reason = prompt('Enter reason for termination (optional):') || 
                'Session terminated by administrator';

  this.plexService.terminateSession(session?.session?.id, reason).subscribe({
    next: () => {
      this.activeSessions = this.activeSessions.filter(s => s.session.id !== session?.session?.id);
      this.showSuccess(`Session terminated successfully. Reason: ${reason}`);
    },
    error: (error) => {
      console.error('Error terminating session:', error);
      this.showError(error.message || 'Failed to terminate session');
    }
  });
} */

  startSessionAutoRefresh(): void {
    this.stopSessionAutoRefresh();
    
    this.refreshSubscription = interval(10000).pipe(
      switchMap(() => {
        if (this.selectedTab === 'sessions') {
          this.isRefreshing = true;
          return this.plexService.getActiveSessions().pipe(
            catchError(error => {
              console.error('Auto-refresh error:', error);
              return of(null);
            })
          );
        }
        return of(null);
      })
    ).subscribe({
      next: (sessions) => {
        this.isRefreshing = false;
        this.lastRefreshTime = new Date();
        if (sessions && this.selectedTab === 'sessions') {
          this.activeSessions = sessions;
        }
      },
      error: (error) => {
        this.isRefreshing = false;
        console.error('Auto-refresh error:', error);
      }
    });
  }

  manualRefresh(): void {
    if (this.isRefreshing) return;
    
    this.isRefreshing = true;
    this.plexService.getActiveSessions().subscribe({
      next: (sessions) => {
        this.activeSessions = sessions || [];
        this.isRefreshing = false;
        this.lastRefreshTime = new Date();
        this.showSuccess('Sessions refreshed successfully');
      },
      error: (error) => {
        console.error('Manual refresh error:', error);
        this.isRefreshing = false;
        this.showError('Failed to refresh sessions');
      }
    });
  }

  stopSessionAutoRefresh(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
      this.refreshSubscription = undefined;
    }
  }

  selectTab(tab: string): void {
    this.selectedTab = tab;
    // Restart auto-refresh when switching to sessions tab
    if (tab === 'sessions') {
      this.startSessionAutoRefresh();
    } else {
      this.stopSessionAutoRefresh();
    } 
 }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: ['success-snackbar']
    });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }

  openTerminateDialog(session: Session): void {
    if (!session?.session?.id) {
      this.showError('Nieprawidłowa sesja - brak ID');
      return;
    }

    this.currentSession = session; // <-- teraz przechowujemy cały obiekt
    this.currentSessionId = session.session.id;
    this.terminationReason = '';
    this.isDialogOpen = true;
    
    this.dialog.open(this.terminateDialogTemplate, {
      width: '400px',
      disableClose: true
    });
  }

  confirmTermination(): void {
    if (!this.currentSessionId) return;

    this.isTerminating = true;
    this.dialog.closeAll();
    
    this.plexService.terminateSession(
      this.currentSessionId, 
      this.terminationReason || 'Sesja zakończona przez administratora'
    ).subscribe({
      next: () => {
        this.activeSessions = this.activeSessions.filter(
          s => s.session.id !== this.currentSessionId
        );
        this.showSuccess('Sesja została zakończona');
      },
      error: (error) => {
        this.showError(error.message || 'Błąd podczas zakończania sesji');
      },
      complete: () => {
        this.isTerminating = false;
        this.isDialogOpen = false;
      }
    });
  }

  closeTerminateDialog(): void {
    this.dialog.closeAll();
    this.isDialogOpen = false;
  }

}
