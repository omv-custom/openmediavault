import { Injectable } from '@angular/core';
import { Observable, of, from, forkJoin, throwError, delay } from 'rxjs';
import { map, catchError, switchMap, tap } from 'rxjs/operators';
import { parseString } from 'xml2js';
import { ServerInfo } from '../models/server-info.model';
import { Session } from '../models/session.model';
import { LibraryStats } from '../models/library-stats.model';
import { RpcService } from '~/app/shared/services/rpc.service';

@Injectable({
  providedIn: 'root'
})
export class PlexService {
  private plexToken = 'EcHzvdmMoq1Y-LggFH-D'; // Przenieś do environment.ts
  private defaultPlexPort = ':32400'; // Domyślny port Plex
  private plexUrl: string;
  private statusAddons = {
            radarr: { port: 7878, img: '/Content/Images/logo-full.png' },
            sonarr: { port: 8989, img: '/Content/Images/logo.svg' },
            overseerr: { port: 5055, img: '/favicon.ico' }
  };

  constructor(private rpcService: RpcService) {
    this.initializePlexUrl();
  }

  testPlexConnection(): Observable<any> {
    return this.rpcService.request('PLEX', 'getFromUrl', {
      host: location.hostname,
      port: this.defaultPlexPort,
      url: '/',
      token: this.plexToken
    }).pipe(
      tap(response => console.log('Raw API response:', 'OK')),
      catchError(error => {
        console.error('API connection error:', error);
        return throwError(error);
      })
    );
  }

  private initializePlexUrl(): void {
    try {
      // Scenariusz 1: Development (localhost z portem Angulara)
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        this.plexUrl = `http://${location.hostname}${this.defaultPlexPort}`;
        return;
      }

      // Scenariusz 2: Produkcja (ten sam host co aplikacja)
      const hostWithoutPort = location.host.split(':')[0];
      this.plexUrl = `http://${hostWithoutPort}${this.defaultPlexPort}`;
      
      console.log(`Initialized Plex URL: ${this.plexUrl}`);
    } catch (error) {
      console.error('Error initializing Plex URL:', error);
      this.plexUrl = `http://localhost${this.defaultPlexPort}`; // Fallback
    }
  }

  // Public methods for mock data access
  public getMockServerInfo(): ServerInfo {
    return {
      version: '1.32.5.7349',
      platform: 'Linux',
      status: 'running',
      updatedAt: new Date(Date.now() - 86400000 * 14),
      updateAvailable: true,
      latestVersion: '1.32.6.7557',
      latestReleaseDate: new Date(Date.now() - 86400000 * 2),
      releaseNotes: [
        'Improved playback compatibility',
        'Fixed HDR tone mapping',
        'Enhanced subtitle support'
      ],
      settings: {
        autoUpdate: false,
        hardwareAcceleration: true,
        remoteAccess: true,
        analytics: true
      }
    };
  }

  public getMockSessions(): Session[] {
    return [
      {
        session: {
          'id': 'Session1'
        },
        user: {
          id: 'user1',
          title: 'John Doe',
          thumb: 'https://example.com/avatar1.jpg'
        },
        player: {
          title: 'Chrome',
          platform: 'Windows'
        },
        media: {
          type: 'movie',
          title: 'Example Movie',
          thumb: 'https://example.com/poster1.jpg',
          duration: 5400
        },
        progress: 1200,
        startedAt: new Date(Date.now() - 3600000)
      }
    ];
  }

  public getMockLibraryStats(): LibraryStats[] {
    return [
      {
        id: 'lib1',
        name: 'Movies',
        type: 'movie',
        count: 1245,
        size: 2578318080,
        lastScanned: new Date(Date.now() - 3600000)
      },
      {
        id: 'lib2',
        name: 'TV Shows',
        type: 'show',
        count: 543,
        size: 1932735283,
        lastScanned: new Date(Date.now() - 7200000)
      }
    ];
  }

  private parseXml(xml: string): Observable<any> {
    return from(new Promise((resolve, reject) => {
      parseString(xml, { explicitArray: false }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    }));
  }

  getServerInfo(): Observable<ServerInfo> {
    return this.rpcService.request('PLEX', 'getFromUrl', {
      host: location.hostname,
      port: this.defaultPlexPort,
      url: '/',
      token: this.plexToken
    }).pipe(
    map(rpcResponse => {
      return rpcResponse;
    }),
    map(rpcResponse => {
      return Array.isArray(rpcResponse) 
        ? rpcResponse.join('\n') 
        : rpcResponse;
    }),
    switchMap(xmlString => this.parseXml(xmlString)),
    // Mapowanie na obiekt ServerInfo
    map(xmlJson => this.mapServerInfo(xmlJson)),
      catchError(error => {
        console.error('Error fetching server info:', error);
        return of(this.getMockServerInfo());
      })
    );
  }

  getActiveSessions(): Observable<Session[]> {
    return this.rpcService.request('PLEX', 'getFromUrl', {
      host: location.hostname,
      port: this.defaultPlexPort,
      url: '/status/sessions',
      token: this.plexToken
    }).pipe(
    map(rpcResponse => {
      return rpcResponse;
    }),
    map(rpcResponse => {
      return Array.isArray(rpcResponse)
        ? rpcResponse.join('\n')
        : rpcResponse;
    }),
      switchMap(xmlResponse => this.parseXml(xmlResponse)),
      map(json => this.mapSessions(json.MediaContainer.Video || [])),
      catchError(error => {
        console.error('Error fetching sessions:', error);
        return of(this.getMockSessions());
      })
    );
  }

getInstallationType(): Observable<'docker' | 'native' | 'unknown'> {
  return forkJoin([
    this.rpcService.request('PLEX', 'getFromUrl', {
      host: location.hostname,
      port: this.defaultPlexPort,
      url: '/:/prefs',
      token: this.plexToken
    }).pipe(
      catchError(() => of({ response: '' }))
    ),
    this.rpcService.request('PLEX', 'getFromUrl', {
      host: location.hostname,
      port: this.defaultPlexPort,
      url: '/',
      token: this.plexToken
    }).pipe(
      catchError(() => of({ response: '' }))
    )
  ]).pipe(
    switchMap(([prefsResponse, rootResponse]) => {
      // Konwersja odpowiedzi RPC do stringów XML
      const prefsXml = Array.isArray(prefsResponse) 
        ? prefsResponse.join('\n') 
        : prefsResponse;
      
      const rootXml = Array.isArray(rootResponse) 
        ? rootResponse.join('\n') 
        : rootResponse;

      return forkJoin([
        this.parseXml(prefsXml).pipe(catchError(() => of({}))),
        this.parseXml(rootXml).pipe(catchError(() => of({})))
      ]);
    }),
    map(([prefsJson, rootJson]): 'docker' | 'native' | 'unknown' => {
      // 1. Sprawdzenie interfejsów sieciowych
      const networkInterfaceSetting = this.findSetting(prefsJson, 'PreferredNetworkInterface');
      if (networkInterfaceSetting?.$?.enumValues?.includes('docker0')) {
        return 'docker';
      }

      // 2. Sprawdzenie specyficznych ustawień Dockera
      const dockerSettings = ['Docker', 'Container', 'DockerHost'];
      if (dockerSettings.some(setting => this.findSetting(prefsJson, setting))) {
        return 'docker';
      }

      // 3. Analiza platformy i identyfikatora
      const platform = (rootJson.MediaContainer?.$?.platform || '').toLowerCase();
      const machineId = (rootJson.MediaContainer?.$?.machineIdentifier || '').toLowerCase();

      const dockerPatterns = [
        /docker/, /container/, /k8s/, /kubernetes/,
        /plexinc\/plex-media-server/, /plexpass\/plex-media-server/
      ];

      if (dockerPatterns.some(p => p.test(platform) || p.test(machineId))) {
        return 'docker';
      }

      // 4. Sprawdzenie natywnych platform
      const nativePatterns = [/windows/, /linux/, /macos/, /darwin/];
      if (nativePatterns.some(p => p.test(platform))) {
        return 'native';
      }

      return 'unknown';
    }),
    catchError(() => of('unknown' as const))
  );
}

private findSetting(prefsJson: any, settingId: string): any {
  if (!prefsJson.MediaContainer?.Setting) return null;
  
  const settings = Array.isArray(prefsJson.MediaContainer.Setting) 
    ? prefsJson.MediaContainer.Setting 
    : [prefsJson.MediaContainer.Setting];
    
  return settings.find((s: any) => s.$.id === settingId);
}

  updateServer(installationType: string): Observable<void> {
    // Implementacja aktualizacji serwera
    return of(undefined); // Tymczasowa implementacja
  }

  saveSettings(settings: any): Observable<void> {
    // Implementacja zapisywania ustawień
    return of(undefined); // Tymczasowa implementacja
  }

terminateSession(sessionId: string, reason: string = 'Session terminated by admin'): Observable<void> {
  if (!sessionId?.trim()) {
    return throwError(() => new Error('Valid session ID is required'));
  }

  return this.rpcService.request('PLEX', 'getFromUrl', {
    host: location.hostname,
    port: this.defaultPlexPort,
    url: `/status/sessions/terminate?sessionId=${encodeURIComponent(sessionId)}`,
    token: this.plexToken
  }).pipe(
    map(() => undefined), // Sukces - zwracamy void
    catchError(error => {
      // Mapowanie błędów RPC na przyjazne komunikaty
      const message = this.mapTranscodeError(error);
      return throwError(() => new Error(message));
    })
  );
}

  private mapServerInfo(xmlData: any): ServerInfo {
    return {
      version: xmlData.MediaContainer?.$?.version || 'unknown',
      platform: xmlData.MediaContainer?.$?.platform || 'unknown',
      status: 'running',
      updatedAt: new Date(),
      updateAvailable: false,
      latestVersion: undefined,
      latestReleaseDate: undefined,
      releaseNotes: [],
      settings: {
        autoUpdate: false,
        hardwareAcceleration: true,
        remoteAccess: true,
        analytics: true
      }
    };
  }

  private mapSessions(metadata: any): Session[] {
    if (!metadata) return [];
    const sessions = Array.isArray(metadata) ? metadata : [metadata];
    
    return sessions.map((session: any) => ({
      session: {
        id: session?.Session?.$?.id || ''
      },
      user: {
        id: session?.User?.$?.id || '',
        title: session?.User?.$?.title || 'Unknown',
        thumb: session?.User?.$?.thumb || ''
      },
      player: {
        title: session?.Player?.$?.title || 'Unknown',
        platform: session?.Player?.$?.platform || 'Unknown'
      },
      media: {
        type: session?.$?.type || '',
        title: session?.$?.title || 'Unknown',
        thumb: session?.$?.thumb 
        ? `${this.plexUrl}${session.$.thumb}?X-Plex-Token=${this.plexToken}`
        : '',
        duration: parseInt(session?.$?.duration || '0')
      },
      progress: parseInt(session?.$?.viewOffset || '0'),
      startedAt: new Date(parseInt(session?.$?.viewOffset || '0') * 1000)
    }));
  }

private getLibraryContent(libraryId: string, key?: string): Observable<{count: number, size: number}> {
  const baseUrl = key ? key : `/library/sections/${libraryId}/all`;
  
  return this.getLibraryPage(baseUrl, 0, 1000).pipe(
    switchMap(firstPage => {
      let totalCount = firstPage.totalSize;
      let totalSize = this.calculateTotalSize(firstPage);

      // Process directories (folders) recursively
      if (firstPage.directories?.length > 0) {
        return forkJoin(
          firstPage.directories.map((dir: any) => 
            this.getLibraryContent(libraryId, dir.$.key)
          )
        ).pipe(
          map((folderStats: {count: number, size: number}[]) => {
            folderStats.forEach(stats => {
              totalCount += stats.count;
              totalSize += stats.size;
            });
            return { count: totalCount, size: totalSize };
          })
        );
      }

      return of({ count: totalCount, size: totalSize });
    }),
    catchError(error => {
      console.error('Error processing library content:', error);
      return of({ count: 0, size: 0 });
    })
  );
}

private getLibraryPage(url: string, start: number, size: number): Observable<any> {
  const params = {
    host: location.hostname,
    port: this.defaultPlexPort,
    url: `${url}?X-Plex-Container-Start=${start}&X-Plex-Container-Size=${size}`,
    token: this.plexToken
  };

  return this.rpcService.request('PLEX', 'getFromUrl', params).pipe(
    switchMap(rpcResponse => {
      const xmlString = Array.isArray(rpcResponse) 
        ? rpcResponse.join('\n') 
        : rpcResponse;
      return this.parseXml(xmlString);
    }),
    map(json => {
      const items = json.MediaContainer?.Video || [];
      const directories = json.MediaContainer?.Directory || [];
      const totalSize = parseInt(json.MediaContainer?.$?.totalSize || '0');
      
      return {
        items: this.ensureArray(items),
        directories: this.ensureArray(directories),
        totalSize
      };
    })
  );
}

private calculateTotalSize(page: any): number {
  let size = 0;
  for (const item of page.items) {
    if (item.Media?.Part) {
      const parts = this.ensureArray(item.Media.Part);
      size += parts.reduce(
        (sum: number, part: any) => sum + (parseInt(part.$.size) || 0),
        0
      );
    }
  }
  return size;
}

public getLibraryStats(): Observable<LibraryStats[]> {
  return this.rpcService.request('PLEX', 'getFromUrl', {
    host: location.hostname,
    port: this.defaultPlexPort,
    url: '/library/sections',
    token: this.plexToken
  }).pipe(
    switchMap(rpcResponse => {
      const xmlString = Array.isArray(rpcResponse) 
        ? rpcResponse.join('\n') 
        : rpcResponse;
      return this.parseXml(xmlString);
    }),
    switchMap(async (json: any) => {
      const directories = this.ensureArray(json.MediaContainer.Directory);
      const stats = await forkJoin(
        directories.map((lib: any) => 
          this.getLibraryContent(lib.$.key).pipe(
            map(content => ({
              id: lib.$.key,
              name: lib.$.title,
              type: lib.$.type,
              count: content.count,
              size: content.size,
              lastScanned: new Date(parseInt(lib.$.scannedAt) * 1000)
            } as LibraryStats))
          )
        )
      ).toPromise();

      return stats || [];
    }),
    catchError(error => {
      console.error('Error fetching library stats:', error);
      return of(this.getMockLibraryStats());
    })
  );
}

getTranscodingSessions(): Observable<any[]> {
    return this.rpcService.request('PLEX', 'getFromUrl', {
      host: location.hostname,
      port: this.defaultPlexPort,
      url: '/transcode/sessions',
      token: this.plexToken
    }).pipe(
    map(rpcResponse => {
      return rpcResponse;
    }),
    map(rpcResponse => {
      return Array.isArray(rpcResponse)
        ? rpcResponse.join('\n')
        : rpcResponse;
    }),
    switchMap(xmlResponse => this.parseXml(xmlResponse)),
    map(json => {
      if (!json.MediaContainer?.TranscodeSession) return [];
      const sessions = this.ensureArray(json.MediaContainer.TranscodeSession);
      return sessions.map((session: any) => ({
        id: session.$.key,
        type: session.$.type,
        progress: parseFloat(session.$.progress),
        speed: parseFloat(session.$.speed),
        duration: parseInt(session.$.duration),
        videoDecision: session.$.videoDecision,
        audioDecision: session.$.audioDecision,
        throttled: session.$.throttled === '1',
        complete: session.$.complete === '1',
        timeStamp: new Date(parseInt(session.$.timeStamp) * 1000)
      }));
    }),
    catchError(error => {
      console.error('Error fetching transcoding sessions:', error);
      return of([]);
    })
  );
}

stopTranscodeSession(sessionKey: string): Observable<void> {
  if (!sessionKey?.trim()) {
    return throwError(() => new Error('Valid session key is required'));
  }

  return this.rpcService.request('PLEX', 'getFromUrl', {
    host: location.hostname,
    port: this.defaultPlexPort,
    url: `/transcode/sessions/${encodeURIComponent(sessionKey)}`,
    token: this.plexToken
  }).pipe(
    map(() => undefined), // Sukces - zwracamy void
    catchError(error => {
      // Mapowanie błędów RPC na przyjazne komunikaty
      const message = this.mapTranscodeError(error);
      return throwError(() => new Error(message));
    })
  );
}

  private mapTranscodeError(error: any): string {
    if (error?.status === 404) {
      return 'Transcode session not found (already ended?)';
    }
    if (error?.status === 401) {
      return 'Unauthorized - check your Plex token';
    }
    if (error?.response?.error?.includes('session')) {
      return 'Session error: ' + error.response.error;
    }
    return 'Server error while stopping transcode session: ' + (error.message || 'Unknown error');
  }

  restartServer(): Observable<any> {
    return of({ success: true }).pipe(delay(1000));
  }

  checkServiceStatus(port: number, serviceName: string, img: string): Observable<boolean> {
    return this.rpcService.request('PLEX', 'getServiceStatus', {
      host: location.hostname,
      port: port,
      path: img,
      service: serviceName
    }).pipe(
      map((response: any) => {
        // Rozszerzona logika weryfikacji odpowiedzi
        return response.status === true;
      }),
      catchError(() => of(false))
    );
  }

  checkRadarrStatus(): Observable<boolean> {
    return this.checkServiceStatus(this.statusAddons.radarr.port, 'Radarr', `${this.statusAddons.radarr.img}`);
  }

  checkSonarrStatus(): Observable<boolean> {
    return this.checkServiceStatus(this.statusAddons.sonarr.port, 'Sonarr', `${this.statusAddons.sonarr.img}`);
  }

  checkOverseerrStatus(): Observable<boolean> {
    return this.checkServiceStatus(this.statusAddons.overseerr.port, 'Overseerr', `${this.statusAddons.overseerr.img}`);
  }

  private ensureArray(data: any): any[] {
    if (!data) return [];
    return Array.isArray(data) ? data : [data];
  }

}
