export interface ServerInfo {
  version: string;
  latestVersion?: string;
  platform: string;
  status: 'running' | 'stopped' | 'restarting';
  updatedAt: Date;
  latestReleaseDate?: Date;
  updateAvailable: boolean;
  releaseNotes?: string[];
  settings?: {
    autoUpdate: boolean;
    hardwareAcceleration: boolean;
    remoteAccess: boolean;
    analytics: boolean;
  };
}
