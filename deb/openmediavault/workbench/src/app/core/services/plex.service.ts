import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of, from, forkJoin, throwError } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { parseString } from 'xml2js';
import { ServerInfo } from '../models/server-info.model';
import { Session } from '../models/session.model';
import { LibraryStats } from '../models/library-stats.model';

@Injectable({
  providedIn: 'root'
})
export class PlexService {
  private plexToken = 'EcHzvdmMoq1Y-LggFH-D'; // Przenieś do environment.ts
  private defaultPlexPort = ':32400'; // Domyślny port Plex
  private plexUrl: string;

  constructor(private http: HttpClient) {
    this.initializePlexUrl();
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

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'X-Plex-Token': this.plexToken,
      'Accept': '*',
      'Access-Control-Allow-Origin': '**',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, Content-Type, Accept, Authorization, X-Requested-With'
    });
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
    return this.http.get(`${this.plexUrl}/`, {
      headers: {'X-Plex-Token': this.plexToken,
      'Accept': '*',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'},
      responseType: 'text'
    }).pipe(
      switchMap(xmlResponse => this.parseXml(xmlResponse)),
      map(json => this.mapServerInfo(json)),
      catchError(error => {
        console.error('Error fetching server info:', error);
        return of(this.getMockServerInfo());
      })
    );
  }

  getActiveSessions(): Observable<Session[]> {
    return this.http.get(`${this.plexUrl}/status/sessions?X-Plex-Token=EcHzvdmMoq1Y-LggFH-D`, {
      headers: this.getHeaders(),
      responseType: 'text'
    }).pipe(
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
    this.http.get(`${this.plexUrl}/:/prefs`, {
      headers: this.getHeaders(),
      responseType: 'text'
    }).pipe(
      catchError(() => of(''))
    ),
    this.http.get(`${this.plexUrl}/`, {
      headers: this.getHeaders(),
      responseType: 'text'
    })
  ]).pipe(
    switchMap(([prefsResponse, rootResponse]) => 
      forkJoin([
        this.parseXml(prefsResponse).pipe(catchError(() => of({}))),
        this.parseXml(rootResponse).pipe(catchError(() => of({})))
      ])
    ),
    map(([prefsJson, rootJson]): 'docker' | 'native' | 'unknown' => {
      const networkInterfaceSetting = this.findSetting(prefsJson, 'PreferredNetworkInterface');
      if (networkInterfaceSetting && networkInterfaceSetting.$.enumValues) {
        const interfaces = networkInterfaceSetting.$.enumValues.split('|');
        if (interfaces.some(intf => intf.includes('docker0'))) {
          return 'docker';
        }
      }

      const dockerSettings = ['Docker', 'Container', 'DockerHost'];
      if (dockerSettings.some(setting => this.findSetting(prefsJson, setting))) {
        return 'docker';
      }

      const platform = (rootJson.MediaContainer?.$?.platform || '').toLowerCase();
      const machineId = (rootJson.MediaContainer?.$?.machineIdentifier || '').toLowerCase();

      const dockerPatterns = [
        /docker/, /container/, /k8s/, /kubernetes/,
        /plexinc\/plex-media-server/, /plexpass\/plex-media-server/,
        /docker0/
      ];

      if (dockerPatterns.some(pattern => 
        pattern.test(platform) || pattern.test(machineId))
      ) {
        return 'docker';
      }

      const nativePatterns = [/windows/, /linux/, /macos/, /darwin/];
      if (nativePatterns.some(pattern => pattern.test(platform))) {
        return 'native';
      }

      return 'unknown';
    }),
    catchError(() => of('unknown' as const))
  );
}

// Pomocnicza metoda do znajdowania ustawień w prefs
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

  const params = new HttpParams()
    .set('reason', encodeURIComponent(reason));

    return this.http.get(`${this.plexUrl}/status/sessions/terminate?sessionId=${encodeURIComponent(sessionId)}&X-Plex-Token=EcHzvdmMoq1Y-LggFH-D`, {
      headers: this.getHeaders(),
      params,
      responseType: 'text'
    }).pipe(
    map(() => undefined),
    catchError(error => {
      const message = error.status === 404 
        ? 'Session not found (already ended?)' 
        : error.status === 401
        ? 'Unauthorized - check your Plex token'
        : 'Server error during termination';
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

  getLibraryStats(): Observable<LibraryStats[]> {
    return this.http.get(`${this.plexUrl}/library/sections`, {
      headers: this.getHeaders(),
      responseType: 'text'
    }).pipe(
      switchMap(xmlResponse => this.parseXml(xmlResponse)),
      switchMap((json: any) => {
        const directories = this.ensureArray(json.MediaContainer.Directory);
        
        const libraryRequests = directories.map((lib: any) => 
          this.getLibraryDetails(lib.$.key).pipe(
            map(details => ({
              id: lib.$.key,
              name: lib.$.title,
              type: lib.$.type,
              count: details.count,
              size: details.size,
              lastScanned: new Date(parseInt(lib.$.scannedAt) * 1000)
            })),
            catchError(() => of({
              id: lib.$.key,
              name: lib.$.title,
              type: lib.$.type,
              count: 0,
              size: 0,
              lastScanned: new Date(parseInt(lib.$.scannedAt) * 1000)
            }))
          )
        );
        
        return forkJoin(libraryRequests);
      }),
      catchError(error => {
        console.error('Error fetching library stats:', error);
        return of(this.getMockLibraryStats());
      })
    );
  }

  private getLibraryDetails(libraryId: string): Observable<{count: number, size: number}> {
    return this.http.get(`${this.plexUrl}/library/sections/${libraryId}/all`, {
      headers: this.getHeaders(),
      responseType: 'text'
    }).pipe(
      switchMap(xmlResponse => this.parseXml(xmlResponse)),
      map(json => ({
        count: parseInt(json.MediaContainer.$.size) || 0,
        size: this.calculateLibrarySize(this.ensureArray(json.MediaContainer.Directory))
      })),
      catchError(error => {
        console.error(`Error fetching details for library ${libraryId}:`, error);
        return of({count: 0, size: 0});
      })
    );
  }

getTranscodingSessions(): Observable<any[]> {
  return this.http.get(`${this.plexUrl}/transcode/sessions`, {
    headers: this.getHeaders(),
    responseType: 'text'
  }).pipe(
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

  private calculateLibrarySize(directories: any[]): number {
    return directories.reduce((total, dir) => {
      const locationSize = parseInt(dir.Location?.$?.size) || 0;
      return total + locationSize;
    }, 0);
  }

  private ensureArray(data: any): any[] {
    if (!data) return [];
    return Array.isArray(data) ? data : [data];
  }

}
