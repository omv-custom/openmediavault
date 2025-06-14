import { Component, OnInit, ViewEncapsulation, Inject, OnDestroy, ViewChild, TemplateRef, DOCUMENT } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { catchError, of, forkJoin, timeout, lastValueFrom } from 'rxjs';

import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';

interface PlayState {
  PlayMethod?: 'Transcode' | 'DirectPlay' | 'DirectStream';
  IsPaused?: boolean;
  CanSeek?: boolean;
  PositionTicks?: number;
}

interface PlaystateRequest {
  Command: PlaystateCommand;
  SeekPositionTicks?: number;
  ControllingUserId?: string;
}

type PlaystateCommand = 
  | 'Stop'
  | 'Pause'
  | 'Unpause'
  | 'NextTrack'
  | 'PreviousTrack'
  | 'Seek'
  | 'Rewind'
  | 'FastForward'
  | 'PlayPause'
  | 'SeekRelative';

interface MediaStream {
  Codec?: string;
  VideoRange?: string;
}

interface MediaItem {
  Id: string;
  Name: string;
  SeriesName?: string;
  Type: 'Movie' | 'Episode' | 'Audio' | 'Series';
  RunTimeTicks?: number;
  ProductionYear?: number;
  ImageTags?: {
    Primary?: string;
  };
  CanSeek?: boolean;
  CanPause?: boolean;
  CanStop?: boolean;
  OfficialRating?: string;
  MediaStreams?: MediaStream[];
  Container?: string;
  Bitrate?: number;
}

interface Session {
  Id: string;
  UserName: string;
  Client: string;
  DeviceName: string;
  RemoteEndPoint: string;
  Protocol: string;
  PlayState?: PlayState;
  NowPlayingItem?: MediaItem;
  LastActivityDate: string;
  AppIconUrl?: string;
  AdditionalUsers: string[];
  TranscodingInfo?: {
    AudioCodec?: string;
    VideoCodec?: string;
    Container?: string;
    IsVideoDirect?: boolean;
    IsAudioDirect?: boolean;
    Bitrate?: number;
    CompletionPercentage?: number;
    Width?: number;
    Height?: number;
    VideoDecoder?: string;
    VideoEncoder?: string;
    TranscodeReasons?: string[];
    Framerate?: number;
  };
}

interface Library {
  Id: string;
  Name: string;
  CollectionType: string;
  ServerId: string;
  IsFolder: boolean;
  Type: string;
  ImageTags?: { Primary?: string };
  ItemCount?: number;
  TotalFileSize?: number;
  LastScanned?: string;
}

interface ServerInfo {
  Version: string;
  HasUpdateAvailable: boolean;
  CanSelfUpdate: boolean;
  PackageName?: string;
}

interface IEmbySettings {
  ServerName?: string;
  RemoteClientBitrateLimit?: number;
  EnableRemoteAccess?: boolean;
  EnableAutomaticRestart?: boolean;
  // Dodaj inne potrzebne pola
}

@Component({
  selector: 'app-emby-page',
  templateUrl: './emby-page.component.html',
  styleUrls: ['./emby-page.component.scss'],
  encapsulation: ViewEncapsulation.None,
  standalone: false
})
export class EmbyPageComponent implements OnInit, OnDestroy {
  activeTab: string = 'dashboard';
  sessions: Session[] = [];
  libraries: Library[] = [];
  serverInfo: ServerInfo | null = null;
  isLoading: boolean = false;
  loadingProgress: number = 0;
  errorMessage: string | null = null;
  serverConnectionError: boolean = false;
  serverConnectionMessage: string = '';
  showConnectionSettings: boolean = false;
  updateForm: FormGroup;
  isDarkTheme = false;
  private refreshInterval = 5000; // 5 sekund
  private refreshTimer: any;
  isLiveUpdate = true;

  @ViewChild('messageDialogTemplate') messageDialogTemplate!: TemplateRef<any>;
  isDialogOpen = false;
  isMessage = false;
  currentSession: any;
  currentSessionId: string = '';
  messageTitle: string = 'Wiadomość od administratora';
  messageContent: string = '';
  messageTimeout: number = 5000;
  isSending: boolean = false;
  updateInProgress: boolean = false;
  embySettings: IEmbySettings | null = null;
  isSaving = false;

  connectionSettings = {
    apiUrl: '',
    apiKey: ''
  };

  public apiUrl = '';
  public apiKey = '';
  userId = 'zaba';

  // Add this property to the component class
  dialogData: {
    title: string;
    content: string;
    confirmText: string;
    showMessageOptions?: boolean;
  };

  private themeObserver?: MutationObserver;

  constructor(
    private fb: FormBuilder, 
    private http: HttpClient,
    @Inject(DOCUMENT) private document: Document,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.updateForm = this.fb.group({
      updateMethod: ['docker', Validators.required],
      backupBeforeUpdate: [true],
      restartAfterUpdate: [true]
    });
    this.loadSettings();
    this.checkTheme();
  }

  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    document.body.classList.toggle('dark-theme', this.isDarkTheme);
    
    // Opcjonalnie: zapisz preferencję w localStorage
    localStorage.setItem('darkTheme', JSON.stringify(this.isDarkTheme));
  }

  getMediaImage(session: Session): string {
    if (!session.NowPlayingItem?.ImageTags?.Primary) {
      return 'none';
    }
  
    const imageUrl = `${this.apiUrl}/Items/${session.NowPlayingItem.Id}/Images/Primary?maxHeight=300&tag=${session.NowPlayingItem.ImageTags.Primary}`;
    return `url('${imageUrl}')`;
  }

  ngOnInit(): void {
    this.checkConnectionSettings();
    this.loadData();
    this.initializeForm();
    this.startAutoRefresh();
    this.loadEmbySettings();
  }

  private checkConnectionSettings(): void {
    const savedSettings = localStorage.getItem('embyConnectionSettings');
    if (!savedSettings) {
      this.showConnectionSettings = true;
      this.showNotification('Proszę skonfigurować połączenie z serwerem Emby');
    } else {
      try {
        const settings = JSON.parse(savedSettings);
        if (!settings.apiUrl || !settings.apiKey) {
          this.showConnectionSettings = true;
          this.showNotification('Niekompletne ustawienia połączenia');
        }
      } catch (e) {
        this.showConnectionSettings = true;
        this.showNotification('Błąd odczytu ustawień połączenia');
      }
    }
  }

  private initializeForm(): void {
    this.updateForm = this.fb.group({
      apiUrl: [this.connectionSettings.apiUrl, Validators.required],
      apiKey: [this.connectionSettings.apiKey, Validators.required]
    });
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    if (this.themeObserver) {
      this.themeObserver.disconnect();
    }
  }

  startAutoRefresh(): void {
    this.stopAutoRefresh(); // Najpierw zatrzymaj istniejący timer
    if (this.isLiveUpdate) {
      this.refreshTimer = setInterval(() => {
        this.refreshSessions();
      }, this.refreshInterval);
    }
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  toggleLiveUpdate(): void {
    this.isLiveUpdate = !this.isLiveUpdate;
    if (this.isLiveUpdate) {
      this.startAutoRefresh();
      this.showNotification('Auto-aktualizacja włączona');
    } else {
      this.stopAutoRefresh();
      this.showNotification('Auto-aktualizacja wyłączona');
    }
  }

  get activePlayingSessions(): Session[] {
    return this.sessions.filter(session => 
      session.NowPlayingItem !== undefined && 
      session.NowPlayingItem !== null
    );
  }

  private checkTheme(): void {
    this.isDarkTheme = this.document.body.classList.contains('dark-theme');
    this.themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          this.isDarkTheme = this.document.body.classList.contains('dark-theme');
        }
      });
    });
    this.themeObserver.observe(this.document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  private loadSettings(): void {
    const savedSettings = localStorage.getItem('embyConnectionSettings');
    if (savedSettings) {
      const { apiUrl, apiKey } = JSON.parse(savedSettings);
      this.apiUrl = apiUrl;
      this.apiKey = apiKey;
    }
  }

  public saveSettings(): void {
    this.connectionSettings = {
      apiUrl: this.updateForm.value.apiUrl,
      apiKey: this.updateForm.value.apiKey
    };
    localStorage.setItem('embyConnectionSettings', JSON.stringify(this.connectionSettings));
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'X-Emby-Token': this.apiKey,
      'Accept': 'application/json'
    });
  }

  private handleConnectionError(error: HttpErrorResponse): void {
    this.serverConnectionError = true;
    this.isLoading = false;
    
    if (error.status === 0) {
      this.serverConnectionMessage = 'Cannot connect to Emby server. Please check:';
    } else {
      this.serverConnectionMessage = `Server returned error ${error.status}: ${error.statusText}`;
    }
  }

  loadData(): void {
    if (!this.hasValidConnectionSettings()) {
      this.showConnectionSettings = true;
      return;
    }

    if (!this.apiUrl || !this.apiKey) {
      this.showConnectionSettings = true;
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    this.serverConnectionError = false;

    forkJoin({
      sessions: this.http.get<any[]>(`${this.apiUrl}/Sessions`, { 
        headers: this.getHeaders()
      }).pipe(
        catchError(error => {
          console.error('Error fetching sessions:', error);
          this.handleConnectionError(error);
          return of([]);
        })
      ),
      libraries: this.http.get<any[]>(`${this.apiUrl}/Library/VirtualFolders`, {
        headers: this.getHeaders()
      }).pipe(
        catchError(() => of([]))
      )
    }).subscribe({
      next: ({ sessions, libraries }) => {
        this.sessions = sessions.map(session => this.mapSession(session));
        this.libraries = libraries.filter(folder => 
          folder.CollectionType && ['movies', 'tvshows', 'music'].includes(folder.CollectionType.toLowerCase())
        );
        this.loadLibraryDetails();
      },
      error: (error) => {
        console.error('Session load failed:', error);
        this.handleConnectionError(error);
      }
    });
  }

  private hasValidConnectionSettings(): boolean {
    const savedSettings = localStorage.getItem('embyConnectionSettings');
    if (!savedSettings) return false;
  
    try {
      const settings = JSON.parse(savedSettings);
      return !!settings.apiUrl && !!settings.apiKey;
    } catch (e) {
      return false;
    }
  }

  private async loadLibraryDetails(): Promise<void> {
    if (!this.libraries || this.libraries.length === 0) {
      this.loadServerInfo();
      return;
    }

    this.isLoading = true;
    this.loadingProgress = 0;
    const progressStep = 100 / this.libraries.length;

    for (const lib of this.libraries) {
      try {
        const stats = await this.getLibraryStats(lib.Id, lib.CollectionType);
        lib.ItemCount = stats.itemCount;
        lib.TotalFileSize = stats.totalSize;
      } catch (error) {
        console.error(`Error processing library ${lib.Name}:`, error);
        lib.ItemCount = 0;
        lib.TotalFileSize = 0;
      } finally {
        this.loadingProgress += progressStep;
      }
    }

    this.loadServerInfo();
    this.isLoading = false;
  }

  private async getLibraryStats(libraryId: string, collectionType: string): Promise<{itemCount: number, totalSize: number}> {
    const itemType = this.mapCollectionTypeToItemType(collectionType);
    let totalCount = 0;
    let totalSize = 0;
    let startIndex = 0;
    const pageSize = 100;

    do {
      const response = await lastValueFrom(
        this.http.get<any>(`${this.apiUrl}/Items`, {
          headers: this.getHeaders(),
          params: {
            ParentId: libraryId,
            Recursive: true,
            IncludeItemTypes: itemType,
            Fields: 'Size',
            StartIndex: startIndex,
            Limit: pageSize,
            EnableTotalRecordCount: true
          }
        }).pipe(timeout(30000))
      );

      totalCount = response.TotalRecordCount;
      totalSize += response.Items?.reduce((sum: number, item: any) => sum + (item.Size || 0), 0) || 0;
      startIndex += pageSize;

    } while (startIndex < totalCount);

    return { itemCount: totalCount, totalSize };
  }

  private mapCollectionTypeToItemType(collectionType: string): string {
    switch (collectionType?.toLowerCase()) {
      case 'movies': return 'Movie';
      case 'tvshows': return 'Series,Episode';
      case 'music': return 'Audio,MusicAlbum';
      default: return '';
    }
  }

  private mapSession(session: any): Session {
    const nowPlayingItem = session.NowPlayingItem || session.CurrentlyPlayingItem;
    const playState = session.PlayState || {};

    return {
      Id: session.Id,
      UserName: session.UserName || 'Unknown',
      Client: session.Client || session.ApplicationName || 'Unknown',
      DeviceName: session.DeviceName || 'Unknown',
      RemoteEndPoint: session.RemoteEndPoint?.split(':')[0] || 'Unknown',
      Protocol: session.Protocol || 'Unknown',
      PlayState: {
        PlayMethod: playState.PlayMethod || (session.TranscodingInfo ? 'Transcode' : 'DirectPlay'),
        IsPaused: playState.IsPaused,
        PositionTicks: playState.PositionTicks
      },
      NowPlayingItem: nowPlayingItem ? {
        Id: nowPlayingItem.Id,
        Name: nowPlayingItem.Name || 'Unknown',
        SeriesName: nowPlayingItem.SeriesName,
        Type: nowPlayingItem.Type || 'Unknown',
        RunTimeTicks: nowPlayingItem.RunTimeTicks,
        ProductionYear: nowPlayingItem.ProductionYear,
        ImageTags: nowPlayingItem.ImageTags || {},
        OfficialRating: nowPlayingItem.OfficialRating || 'Unknown',
        MediaStreams: nowPlayingItem.MediaStream || 'Unknown',
        Bitrate: nowPlayingItem.Bitrate || 'Unknown'
      } : undefined,
      LastActivityDate: session.LastActivityDate,
      AppIconUrl: session.AppIconUrl,
      AdditionalUsers: session.AdditionalUsers || [],
      TranscodingInfo: session.TranscodingInfo
    };
  }

  getPlaybackPercentage(session: Session): number {
    if (!session.PlayState?.PositionTicks || !session.NowPlayingItem?.RunTimeTicks) {
      return 0;
    }
    return (session.PlayState.PositionTicks / session.NowPlayingItem.RunTimeTicks) * 100;
  }

  getPlayMethodIcon(playMethod?: string): string {
    switch (playMethod) {
      case 'Transcode': return 'sync';
      case 'DirectPlay': return 'play_arrow';
      case 'DirectStream': return 'stream';
      default: return 'help_outline';
    }
  }

  getLibraryIcon(collectionType: string): string {
    const icons = {
      movies: 'movie',
      tvshows: 'tv',
      music: 'music_note',
      photos: 'photo_library',
      books: 'menu_book',
      games: 'sports_esports'
    };
    return icons[collectionType.toLowerCase()] || 'folder';
  }

  getTranscodingStatus(session: Session): string {
    if (!session.TranscodingInfo) return 'Direct Play';
  
    const info = session.TranscodingInfo;
    const parts = [];
  
    if (info.VideoCodec) parts.push(`${info.VideoCodec.toUpperCase()}`);
    if (info.AudioCodec) parts.push(`${info.AudioCodec.toUpperCase()}`);
    if (info.CompletionPercentage) parts.push(`${info.CompletionPercentage}%`);
    if (info.Bitrate) parts.push(`${Math.round(info.Bitrate / 1000)}kbps`);
  
    return parts.join(' · ');
  }

  formatPlayTime(ticks?: number): string {
    if (!ticks) return '00:00';
    const seconds = Math.floor(ticks / 10000000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    return [
      hours.toString().padStart(2, '0'),
      (minutes % 60).toString().padStart(2, '0'),
      (seconds % 60).toString().padStart(2, '0')
    ].join(':');
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0)} ${units[i]}`;
  }

  formatDate(date: Date | string): string {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleString();
  }

  refreshData(): void {
    this.loadData();
  }

  saveConnectionSettings(): void {
    if (!this.connectionSettings.apiUrl || !this.connectionSettings.apiKey) {
      this.showNotification('URL serwera i klucz API są wymagane', 'OK', 3000);
      return;
    }

    localStorage.setItem('embyConnectionSettings', JSON.stringify(this.connectionSettings));
    this.apiUrl = this.connectionSettings.apiUrl;
    this.apiKey = this.connectionSettings.apiKey;
    this.showConnectionSettings = false;
    this.showNotification('Ustawienia zapisane pomyślnie');
    this.loadData(); // Ponowne załadowanie danych po zapisaniu ustawień
    /* this.saveSettings();
    this.showConnectionSettings = false;
    this.refreshData(); */
  }

  async testConnection(): Promise<void> {
    if (!this.connectionSettings.apiUrl || !this.connectionSettings.apiKey) return;

    try {
      const headers = new HttpHeaders({
        'X-Emby-Token': this.connectionSettings.apiKey,
        'Accept': 'application/json'
      });

      const response = await lastValueFrom(
        this.http.get(`${this.connectionSettings.apiUrl}/System/Info`, { headers })
      );

      if (response) {
        this.showNotification('Połączenie z serwerem udane!', 'OK', 3000);
      }
    } catch (error) {
      this.showNotification('Błąd połączenia: ' + (error.message || 'Nieznany błąd'), 'OK', 5000);
    }
  }

  killSession(sessionId: string): void {
    if (!confirm('Are you sure you want to terminate this session?')) return;

    this.http.delete(`${this.apiUrl}/Sessions/${sessionId}`, { headers: this.getHeaders() })
      .subscribe({
        next: () => {
          this.sessions = this.sessions.filter(s => s.Id !== sessionId);
        },
        error: (error) => {
          this.errorMessage = 'Failed to terminate session: ' + error.message;
        }
      });
  }

  scanLibrary(libraryId: string): void {
    this.http.post(`${this.apiUrl}/Library/Refresh`, { 
      LibraryId: libraryId,
      Recursive: true 
    }, { headers: this.getHeaders() }).subscribe({
      next: () => {
        alert(`Library scan started for ${this.libraries.find(l => l.Id === libraryId)?.Name}`);
      },
      error: (error) => {
        this.errorMessage = 'Failed to start library scan: ' + error.message;
      }
    });
  }

  private loadServerInfo(): void {
    this.http.get<ServerInfo>(`${this.apiUrl}/System/Info`, { 
      headers: this.getHeaders()
    }).pipe(
      catchError(() => of(null))
    ).subscribe({
      next: (info) => {
        this.serverInfo = info;
      },
      error: () => {
        this.serverInfo = null;
      }
    });
  }

sendPlaystateCommand(sessionId: string, command: PlaystateCommand, options: {
  seekTicks?: number;
  controllingUserId?: string;
} = {}): void {
  const endpoint = `${this.apiUrl}/Sessions/${sessionId}/Playing/${command}`;
  const body: PlaystateRequest = {
    Command: command,
    SeekPositionTicks: options.seekTicks,
    ControllingUserId: options.controllingUserId || this.userId
  };

  this.http.post(endpoint, body, { headers: this.getHeaders() }).subscribe({
    next: () => {
      this.showNotification(`Command "${command}" executed successfully`);
      this.refreshSessions();
    },
    error: (error) => {
      console.error(`Error executing "${command}":`, error);
      this.errorMessage = this.getPlaystateError(command, error);
    }
  });
}

private getPlaystateError(command: string, error: any): string {
  switch (error.status) {
    case 401:
      return 'Authentication required. Please check your API key.';
    case 403:
      return 'You don\'t have permission to control playback.';
    case 404:
      return 'Session not found. It may have already ended.';
    default:
      return `Failed to execute "${command}": ${error.message || 'Unknown error'}`;
  }
}

/**
 * Terminates a session completely
 */
terminateSession(sessionId: string): void {
  if (!confirm('Are you sure you want to terminate this session?')) return;

  // Try multiple endpoints in sequence
  const endpoints = [
    `${this.apiUrl}/Sessions/${sessionId}/Playing/Stop`, // First try to stop playback
    `${this.apiUrl}/Sessions/${sessionId}`,              // Then try to delete session
    `${this.apiUrl}/Sessions/Logoff`                    // Legacy endpoint
  ];

  const tryTermination = (index: number) => {
    if (index >= endpoints.length) {
      this.errorMessage = 'All termination methods failed';
      return;
    }

    const endpoint = endpoints[index];
    const isPostMethod = endpoint.includes('Logoff') || endpoint.includes('Stop');

    const request = isPostMethod ?
      this.http.post(endpoint, index === 2 ? { Id: sessionId } : {}, { headers: this.getHeaders() }) :
      this.http.delete(endpoint, { headers: this.getHeaders() });

    request.subscribe({
      next: () => {
        this.showNotification('Session terminated successfully');
        this.refreshSessions();
      },
      error: (error) => {
        console.error(`Termination attempt ${index + 1} failed:`, error);
        tryTermination(index + 1);
      }
    });
  };

  tryTermination(0);
}

refreshSessions(): void {
  if (this.serverConnectionError) return;

  const previousSessionIds = this.sessions.map(s => s.Id);

  this.http.get<any[]>(`${this.apiUrl}/Sessions`, { 
    headers: this.getHeaders() 
  }).subscribe({
    next: (sessions) => {
      const newSessions = sessions.map(session => this.mapSession(session));
      const newSessionIds = newSessions.map(s => s.Id);
      
      // Znajdź zmiany
      const addedSessions = newSessions.filter(s => !previousSessionIds.includes(s.Id));
      const removedSessions = this.sessions.filter(s => !newSessionIds.includes(s.Id));
      
      this.sessions = newSessions;
      
      // Wizualne powiadomienia o zmianach
      if (addedSessions.length > 0) {
        this.showNotification(`Dodano ${addedSessions.length} nowych sesji`);
      }
      if (removedSessions.length > 0) {
        this.showNotification(`Zamknięto ${removedSessions.length} sesji`);
      }
    },
    error: (error) => {
      console.error('Error refreshing sessions:', error);
    }
  });
}

private showNotification(message: string, action: string = 'OK', duration: number = 3000): void {
  this.snackBar.open(message, action, {
    duration: duration,
    panelClass: ['custom-snackbar'],
    horizontalPosition: 'right',
    verticalPosition: 'top',
  });
}

// Playback controls
stopPlayback(sessionId: string): void {
  this.sendPlaystateCommand(sessionId, 'Stop');
}

togglePause(sessionId: string): void {
  this.sendPlaystateCommand(sessionId, 'PlayPause');
}

seek(sessionId: string, positionTicks: number): void {
  this.sendPlaystateCommand(sessionId, 'Seek', { seekTicks: positionTicks });
}

nextTrack(sessionId: string): void {
  this.sendPlaystateCommand(sessionId, 'NextTrack');
}

previousTrack(sessionId: string): void {
  this.sendPlaystateCommand(sessionId, 'PreviousTrack');
}

seekToPosition(event: MouseEvent, session: Session): void {
  if (!session.NowPlayingItem?.CanSeek || !session.NowPlayingItem?.RunTimeTicks) {
    return;
  }

  const progressBar = event.currentTarget as HTMLElement;
  const rect = progressBar.getBoundingClientRect();
  const clickPosition = (event.clientX - rect.left) / rect.width;
  const seekPosition = Math.floor(clickPosition * session.NowPlayingItem.RunTimeTicks);

  this.seek(session.Id, seekPosition);
}

openMessageDialog(session: Session): void {
  if (!session?.Id) {
    this.showError('Nieprawidłowa sesja - brak ID');
    return;
  }

  this.currentSession = session;
  this.currentSessionId = session.Id;
  this.messageContent = '';
  this.messageTitle = 'Wiadomość od administratora';
  this.messageTimeout = 5000; // domyślny czas wyświetlania w ms

  this.dialogData = {
    title: 'Wyślij wiadomość',
    content: `Wpisz wiadomość dla użytkownika ${session.UserName || 'Nieznany użytkownik'} (${session.DeviceName || 'Nieznane urządzenie'})`,
    confirmText: 'Wyślij',
    showMessageOptions: true
  };

  const dialogRef = this.dialog.open(this.messageDialogTemplate, {
    width: '450px',
    disableClose: true
  });

  dialogRef.afterClosed().subscribe(result => {
    if (result) {
      this.sendMessageToSession();
    }
  });
}

closeMessageDialog(): void {
  this.dialog.closeAll();
}

sendMessageToSession(): void {
  if (!this.currentSessionId || !this.messageContent) return;

  this.isSending = true;

  const messageData = {
    header: this.messageTitle,
    text: this.messageContent,
    timeoutMs: this.messageTimeout
  };

  const url = `${this.apiUrl}/Sessions/${this.currentSessionId}/Message`;
  const headers = new HttpHeaders({
    'X-Emby-Token': this.apiKey
  });

  this.http.post(url, messageData, { headers }).pipe(
    catchError(error => {
      this.showError(error.message || 'Błąd podczas wysyłania wiadomości');
      return of(null);
    }),
    finalize(() => {
      this.isSending = false;
      this.dialog.closeAll();
    })
  ).subscribe({
    next: () => {
      this.showSuccess('Wiadomość wysłana pomyślnie');
    }
  });
}

loadEmbySettings(): void {
  this.http.get<IEmbySettings>(`${this.apiUrl}/System/Configuration`, {
    headers: this.getHeaders()
  }).subscribe({
    next: (settings) => {
      this.embySettings = {
        ServerName: settings.ServerName || '',
        RemoteClientBitrateLimit: settings.RemoteClientBitrateLimit || 0,
        EnableRemoteAccess: settings.EnableRemoteAccess || false,
        EnableAutomaticRestart: settings.EnableAutomaticRestart || false
      };
      this.showNotification('Ustawienia pobrane pomyślnie');
    },
    error: (err) => {
      console.error('Error loading settings:', err);
      this.showNotification('Błąd podczas pobierania ustawień', 'error');
    }
  });
}

saveEmbySettings(): void {
  if (!this.embySettings) return;

  this.isSaving = true;
  
  this.http.post(`${this.apiUrl}/System/Configuration`, this.embySettings, {
    headers: this.getHeaders()
  }).pipe(
    finalize(() => this.isSaving = false)
  ).subscribe({
    next: () => {
      this.showNotification('Ustawienia zapisane pomyślnie');
      this.loadEmbySettings();
    },
    error: (err) => {
      console.error('Error saving settings:', err);
      this.showNotification('Błąd podczas zapisywania ustawień', 'error');
    }
  });
}

  // Add these methods
  showError(message: string): void {
    // Implement your error display logic here
    console.error(message);
    // Example using MatSnackBar:
    this.snackBar.open(message, 'Close', { duration: 5000, panelClass: ['error-snackbar'] });
  }

  showSuccess(message: string): void {
    // Implement your success display logic here
    console.log(message);
    // Example using MatSnackBar:
    this.snackBar.open(message, 'Close', { duration: 5000, panelClass: ['success-snackbar'] });
  }

getRemainingTime(session: Session): number {
  if (!session.NowPlayingItem?.RunTimeTicks || !session.PlayState?.PositionTicks) {
    return 0;
  }
  return session.NowPlayingItem.RunTimeTicks - session.PlayState.PositionTicks;
}

getRemainingTimeColor(session: Session): string {
  const remainingSeconds = this.getRemainingTime(session) / 10000000;
  
  if (remainingSeconds < 60) return '#ff4d4d'; // Czerwony dla < 1 min
  if (remainingSeconds < 300) return '#ffa500'; // Pomarańczowy dla < 5 min
  return 'inherit'; // Domyślny kolor
}

getProgressGradient(session: Session): string {
  const percentage = this.getPlaybackPercentage(session);
  const remainingSeconds = this.getRemainingTime(session) / 10000000;
  
  if (remainingSeconds < 60) {
    // Czerwony gradient dla kończącego się media
    return `linear-gradient(90deg, #ff4d4d, #ff1a1a)`;
  } else if (remainingSeconds < 300) {
    // Pomarańczowy gradient dla kończącego się za kilka minut
    return `linear-gradient(90deg, #ffa500, #ff8c00)`;
  } else {
    // Standardowy gradient (niebieski do fioletowego)
    const hue = 210 + (100 - percentage) * 0.6;
    return `linear-gradient(90deg, 
            hsl(${hue}, 100%, 60%), 
            hsl(${hue + 10}, 100%, 50%))`;
  }
}

getRatingColor(rating: string | undefined): string {
  if (!rating) return 'var(--primary)';
  
  const ratingMap: {[key: string]: string} = {
    'G': '#4CAF50', // Zielony
    'PG': '#8BC34A',
    'PG-13': '#FFC107', // Żółty
    'R': '#F44336', // Czerwony
    'NC-17': '#E91E63',
    'TV-Y': '#4CAF50',
    'TV-Y7': '#8BC34A',
    'TV-G': '#CDDC39',
    'TV-PG': '#FFC107',
    'TV-14': '#FF9800',
    'TV-MA': '#F44336'
  };

  return ratingMap[rating] || 'var(--primary)';
}

getQualityLabel(session: Session): string {
  try {
    if (!session?.NowPlayingItem) return '';

    const parts = [];
    const item = session.NowPlayingItem;

    // Rozdzielczość na podstawie bitrate'u
    if (item.Bitrate) {
      if (item.Bitrate > 30000000) parts.push('4K');
      else if (item.Bitrate > 10000000) parts.push('1080p');
      else parts.push('720p');
    }

    // Bezpieczne sprawdzenie MediaStreams
    const mediaStreams = Array.isArray(item.MediaStreams) ? item.MediaStreams : [];
    const videoStream = mediaStreams.find(s => s?.Codec);

    if (videoStream?.VideoRange) {
      const rangeMap: {[key: string]: string} = {
        'HDR10': 'HDR10',
        'HDR': 'HDR',
        'DOVI': 'Dolby Vision',
        'HLG': 'HLG'
      };
      const rangeLabel = rangeMap[videoStream.VideoRange] || videoStream.VideoRange;
      parts.push(rangeLabel);
    }

    if (videoStream?.Codec) {
      const codecMap: {[key: string]: string} = {
        'hevc': 'HEVC',
        'av1': 'AV1',
        'vp9': 'VP9',
        'h264': 'H.264'
      };
      parts.push(codecMap[videoStream.Codec.toLowerCase()] || videoStream.Codec.toUpperCase());
    }

    return parts.join(' ');
  } catch (error) {
    console.error('Error generating quality label:', error);
    return '';
  }
}

getQualityTooltip(session: Session): string {
  try {
    if (!session?.NowPlayingItem) return '';

    const details = [];
    const item = session.NowPlayingItem;

    // Bezpieczne sprawdzenie MediaStreams
    const mediaStreams = Array.isArray(item.MediaStreams) ? item.MediaStreams : [];
    const videoStream = mediaStreams.find(s => s?.Codec);

    if (videoStream?.Codec) details.push(`Codec: ${videoStream.Codec}`);
    if (videoStream?.VideoRange) details.push(`Video Range: ${videoStream.VideoRange}`);
    if (item.Bitrate) details.push(`Bitrate: ${Math.round(item.Bitrate / 1000000)} Mbps`);
    if (item.Container) details.push(`Container: ${item.Container}`);

    return details.join('\n') || 'No quality information available';
  } catch (error) {
    console.error('Error generating quality tooltip:', error);
    return 'Error loading quality information';
  }
}

hasQualityInfo(session: Session): boolean {
  return this.hasHDR(session) || 
         this.hasDolbyVision(session) ||
         this.hasHEVC(session) ||
         this.hasAV1(session) ||
         this.hasHD(session) ||
         this.has4K(session);
}

hasHDR(session: Session): boolean {
  return this.getVideoStream(session)?.VideoRange?.includes('HDR') ?? false;
}

hasDolbyVision(session: Session): boolean {
  return this.getVideoStream(session)?.VideoRange?.includes('DOVI') ?? false;
}

hasHEVC(session: Session): boolean {
  return this.getVideoStream(session)?.Codec?.toLowerCase() === 'hevc';
}

hasAV1(session: Session): boolean {
  return this.getVideoStream(session)?.Codec?.toLowerCase() === 'av1';
}

hasHD(session: Session): boolean {
  const bitrate = session.NowPlayingItem?.Bitrate ?? 0;
  return bitrate > 10000000 && bitrate <= 30000000;
}

has4K(session: Session): boolean {
  const bitrate = session.NowPlayingItem?.Bitrate ?? 0;
  return bitrate > 30000000;
}

private getVideoStream(session: Session): MediaStream | undefined {
  return Array.isArray(session.NowPlayingItem?.MediaStreams) 
    ? session.NowPlayingItem?.MediaStreams.find(s => s?.Codec)
    : undefined;
}

updateServer(): void {
  if (!this.serverInfo?.HasUpdateAvailable) return;

  this.updateInProgress = true;
  
  this.http.post<{ RestartRequired: boolean }>(`${this.apiUrl}/System/Update`, {}, { 
    headers: this.getHeaders() 
  }).pipe(
    finalize(() => {
      this.updateInProgress = false;
    })
  ).subscribe({
    next: (response) => {
      const message = response.RestartRequired 
        ? 'Aktualizacja zakończona - wymagany restart' 
        : 'Aktualizacja zakończona pomyślnie';
      this.showNotification(message);
      setTimeout(() => this.refreshData(), 5000);
    },
    error: (error) => {
      console.error('Update error:', error);
      this.showNotification('Błąd podczas aktualizacji', 'error');
    }
  });
}

}
