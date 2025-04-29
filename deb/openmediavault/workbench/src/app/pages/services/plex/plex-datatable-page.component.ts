import { Component, OnInit, OnDestroy, ViewChild, TemplateRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { PlexService } from '~/app/core/services/plex.service';
import { Session } from '~/app/core/models/session.model';
import { LibraryStats } from '~/app/core/models/library-stats.model';
import { ServerInfo } from '~/app/core/models/server-info.model';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ThemePalette } from '@angular/material/core';
import { interval, Subscription, of, forkJoin } from 'rxjs';
import { finalize,switchMap, catchError } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';

interface DialogData {
  title: string;
  content: string;
  confirmText: string;
  isTranscode?: boolean;
}

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
  currentTranscodeSessionId = '';
  isStoppingTranscode = false;
  totalItemsCount = 0;
  totalLibrarySize = 0;
  arrStatus = {
    radarr: { installed: false, loading: true, error: false },
    sonarr: { installed: false, loading: true, error: false },
    overseerr: { installed: false, loading: true, error: false }
  };
  mobileMenuVisible = false;
  isRestarting = false;

  // Add this property to the component class
  dialogData: DialogData = {
    title: 'Confirmation',
    content: '',
    confirmText: 'Confirm',
    isTranscode: false
  };

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
      analytics: [true],
      terminationReason: ['']
    });
  }

  ngOnInit(): void {
    this.testConnection(); 
    this.loadData();
    this.detectInstallationType();
    this.startSessionAutoRefresh();
    this.checkArrStatus();
  setTimeout(() => {
    if (this.arrStatus.radarr.loading || this.arrStatus.sonarr.loading || this.arrStatus.overseerr.loading) {
      console.warn('Status check is still loading after 5 seconds!');
      // Wymuś zakończenie ładowania
      this.arrStatus.radarr.loading = false;
      this.arrStatus.sonarr.loading = false;
      this.arrStatus.overseerr.loading = false;
      this.arrStatus.radarr.error = true;
      this.arrStatus.sonarr.error = true;
      this.arrStatus.overseerr.error = true;
    }
  }, 5000);
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

      // Calculate totals after loading
      this.calculateTotals();
      
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
      this.calculateTotals(); // Calculate even with mock data
    } finally {
      this.isLoading = false;
    }
  }

async testConnection(): Promise<void> {
  try {
    await this.plexService.testPlexConnection().toPromise();
    this.showSuccess('Connected to Plex API successfully');
  } catch (error) {
    this.showError('Failed to connect to Plex API');
    console.error('Connection test failed:', error);
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
      if (this.selectedTab === 'sessions' || this.selectedTab === 'transcoding') {
        this.isRefreshing = true;
        return forkJoin([
          this.selectedTab === 'sessions' ? this.plexService.getActiveSessions() : of(null),
          this.selectedTab === 'transcoding' ? this.plexService.getTranscodingSessions() : of(null)
        ]).pipe(
          catchError(error => {
            console.error('Auto-refresh error:', error);
            return of([null, null]);
          })
        );
      }
      return of([null, null]);
    })
  ).subscribe({
    next: ([sessions, transcoding]) => {
      this.isRefreshing = false;
      this.lastRefreshTime = new Date();
      if (sessions && this.selectedTab === 'sessions') {
        this.activeSessions = sessions;
      }
      if (transcoding && this.selectedTab === 'transcoding') {
        this.transcodingSessions = transcoding;
      }
    },
    error: (error) => {
      this.isRefreshing = false;
      console.error('Auto-refresh error:', error);
    }
  });
}

async manualRefresh(): Promise<void> {
  if (this.isRefreshing) return;
  
  this.isRefreshing = true;
  try {
    if (this.selectedTab === 'sessions') {
      this.activeSessions = await this.plexService.getActiveSessions().toPromise() || [];
    } else if (this.selectedTab === 'transcoding') {
      this.transcodingSessions = await this.plexService.getTranscodingSessions().toPromise() || [];
    }
    this.lastRefreshTime = new Date();
    this.showSuccess('Data refreshed successfully');
  } catch (error) {
    console.error('Manual refresh error:', error);
    this.showError('Failed to refresh data');
  } finally {
    this.isRefreshing = false;
  }
}

  stopSessionAutoRefresh(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
      this.refreshSubscription = undefined;
    }
  }

selectTab(tab: string): void {
  this.selectedTab = tab;
  // Restart auto-refresh when switching to sessions or transcoding tab
  if (tab === 'sessions' || tab === 'transcoding') {
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
    this.showError('Invalid session - missing ID');
    return;
  }

  this.currentSession = session;
  this.currentSessionId = session.session.id;
  this.terminationReason = '';
  this.isDialogOpen = true;
  
  this.dialogData = {
    title: 'Confirmation',
    content: `Are you sure you want to terminate the session for user ${session.user.title || 'Unknown user'}?`,
    confirmText: 'Terminate Session',
    isTranscode: false
  };
  
  this.dialog.open(this.terminateDialogTemplate, {
    width: '400px',
    disableClose: true
  });
}

closeTerminateDialog(): void {
  this.dialog.closeAll();
  this.isDialogOpen = false;
}

// This method should already exist in your original code
confirmTermination(): void {
  if (!this.currentSessionId) return;

  this.isTerminating = true;
  this.dialog.closeAll();
  
  this.plexService.terminateSession(
    this.currentSessionId, 
    this.terminationReason || 'Session terminated by administrator'
  ).subscribe({
    next: () => {
      this.activeSessions = this.activeSessions.filter(
        s => s.session.id !== this.currentSessionId
      );
      this.showSuccess('Session terminated successfully');
    },
    error: (error) => {
      this.showError(error.message || 'Error terminating session');
    },
    complete: () => {
      this.isTerminating = false;
      this.isDialogOpen = false;
    }
  });
}

// Update openStopTranscodeDialog method
openStopTranscodeDialog(session: any): void {
  this.currentTranscodeSessionId = session.id;
  this.isDialogOpen = true;
  
  this.dialogData = {
    title: `Stop Transcode Session #${session.id}`,
    content: 'Are you sure you want to stop this transcoding session?',
    confirmText: 'Stop Transcoding',
    isTranscode: true
  };
  
  this.dialog.open(this.terminateDialogTemplate, {
    width: '400px',
    disableClose: true
  });
}

stopTranscodeSession(): void {
  if (!this.currentTranscodeSessionId) return;

  this.isStoppingTranscode = true;
  this.dialog.closeAll();
  
  this.plexService.stopTranscodeSession(this.currentTranscodeSessionId).subscribe({
    next: () => {
      this.transcodingSessions = this.transcodingSessions.filter(
        s => s.id !== this.currentTranscodeSessionId
      );
      this.showSuccess('Transcoding session stopped successfully');
    },
    error: (error) => {
      this.showError(error.message || 'Error stopping transcoding session');
    },
    complete: () => {
      this.isStoppingTranscode = false;
      this.isDialogOpen = false;
      this.currentTranscodeSessionId = '';
    }
  });
}

  calculateTotals(): void {
    this.totalItemsCount = this.libraryStats.reduce((sum, lib) => sum + (lib.count || 0), 0);
    this.totalLibrarySize = this.libraryStats.reduce((sum, lib) => sum + (lib.size || 0), 0);
  
    console.log('Calculated totals:', {
      items: this.totalItemsCount,
      size: this.totalLibrarySize
    });
  }

checkArrStatus() {
  // Reset status before checking
  this.arrStatus = {
    radarr: { installed: false, loading: true, error: false },
    sonarr: { installed: false, loading: true, error: false },
    overseerr: { installed: false, loading: true, error: false }
  };

  // Check Radarr
  this.plexService.checkRadarrStatus().pipe(
    finalize(() => this.arrStatus.radarr.loading = false)
  ).subscribe({
    next: (status) => this.arrStatus.radarr.installed = status,
    error: () => this.arrStatus.radarr.error = true
  });

  // Check Sonarr
  this.plexService.checkSonarrStatus().pipe(
    finalize(() => this.arrStatus.sonarr.loading = false)
  ).subscribe({
    next: (status) => this.arrStatus.sonarr.installed = status,
    error: () => this.arrStatus.sonarr.error = true
  });

  this.plexService.checkOverseerrStatus().pipe(
    finalize(() => this.arrStatus.overseerr.loading = false)
  ).subscribe({
    next: (status) => this.arrStatus.overseerr.installed = status,
    error: () => this.arrStatus.overseerr.error = true
  });
}

  getStatusClass(service: 'radarr' | 'sonarr' | 'overseerr'): string {
    const status = this.arrStatus[service];
    if (status.loading) return 'status-loading';
    if (status.error) return 'status-error';
    return status.installed ? 'status-installed' : 'status-not-installed';
  }

  // Metoda do przełączania menu mobilnego
  toggleMobileMenu(): void {
    this.mobileMenuVisible = !this.mobileMenuVisible;
  }

  // Metoda do restartowania serwera
  restartServer(): void {
    if (this.isRestarting) return;
    
    this.isRestarting = true;
    this.plexService.restartServer().subscribe({
      next: () => {
        this.showSuccess('Server restart initiated');
        // Odśwież status po krótkim opóźnieniu
        setTimeout(() => {
          this.loadData();
          this.isRestarting = false;
        }, 5000);
      },
      error: (error) => {
        console.error('Restart failed:', error);
        this.showError('Failed to restart server');
        this.isRestarting = false;
      }
    });
  }

}
