import { Component, OnInit } from '@angular/core';
import { RpcService } from '~/app/shared/services/rpc.service';
import { finalize } from 'rxjs/operators';

interface SambaConnection {
  pid: string;
  username: string;
  group: string;
  machine: string;
  protocolVersion: string;
  encryption: string;
  signing: string;
}

interface SambaService {
  name: string;
  pid: string;
  machine: string;
  connectedAt: Date;
  encryption: string;
  signing: string;
}

interface SambaStatus {
  version: string;
  connections: SambaConnection[];
  services: SambaService[];
  lockedFiles: string[];
  isDisabled?: boolean;
}

@Component({
  selector: 'app-samba-status',
  templateUrl: './service-smb-text-page.component.html',
  styleUrls: ['./service-smb-text-page.component.scss'],
  standalone: false
})
export class ServiceSmbTextPageComponent implements OnInit {
  public loading = true;
  public error: string | null = null;
  isDarkTheme = false;
  public status: SambaStatus = {
    version: '',
    connections: [],
    services: [],
    lockedFiles: []
  };

  public connectionsColumns: string[] = [
    'pid', 'username', 'group', 'machine', 'protocolVersion', 'encryption', 'signing'
  ];

  public servicesColumns: string[] = [
    'name', 'pid', 'machine', 'connectedAt', 'encryption', 'signing'
  ];

  public filesColumns: string[] = ['path'];

  constructor(private rpcService: RpcService) {}

  ngOnInit(): void {
    this.checkTheme();
    this.loadData();
  }

  checkTheme() {
    this.isDarkTheme = document.body.classList.contains('dark-theme');
  }

  loadData(): void {
    this.loading = true;
    this.error = null;

    this.rpcService.request('SMB', 'getStats', null)
      .pipe(
        finalize(() => this.loading = false)
      )
      .subscribe({
        next: (response: string) => {
          if (response.includes('Service disabled')) {
            this.status = {
              isDisabled: true,
              version: '',
              connections: [],
              services: [],
              lockedFiles: []
            };
          } else {
            this.status = this.parseSambaResponse(response);
            this.status.isDisabled = false;
          }
        },
        error: (error) => {
          this.error = 'Failed to load Samba status: ' + error.message;
          console.error('Samba status error:', error);
        }
      });
  }

  private parseSambaResponse(response: string): SambaStatus {
    const lines = response.split('\n');
    const result: SambaStatus = {
      version: '',
      connections: [],
      services: [],
      lockedFiles: []
    };

    let section: 'version' | 'connections' | 'services' | 'lockedFiles' | null = null;

    for (const line of lines) {
      if (line.startsWith('Samba version')) {
        result.version = line.split('Samba version')[1].trim();
        continue;
      }

      if (line.includes('PID     Username     Group')) {
        section = 'connections';
        continue;
      }

      if (line.includes('Service      pid     Machine')) {
        section = 'services';
        continue;
      }

      if (line.includes('No locked files')) {
        section = 'lockedFiles';
        continue;
      }

      if (line.trim() === '' || line.startsWith('----')) {
        continue;
      }

      if (section === 'connections') {
        const connection = this.parseConnectionLine(line);
        if (connection) {
          result.connections.push(connection);
        }
      } else if (section === 'services') {
        const service = this.parseServiceLine(line);
        if (service) {
          result.services.push(service);
        }
      }
    }

    return result;
  }

  private parseConnectionLine(line: string): SambaConnection | null {
    const parts = line.trim().split(/\s{2,}/);

    if (parts.length < 6) return null;

    return {
      pid: parts[0].trim(),
      username: parts[1].trim(),
      group: parts[2].trim(),
      machine: parts[3].trim(),
      protocolVersion: parts[4].trim(),
      encryption: parts[5].trim(),
      signing: parts.length > 6 ? parts[6].trim() : '-'
    };
  }

  private parseServiceLine(line: string): SambaService | null {
    const parts = line.trim().split(/\s{2,}/);

    if (parts.length < 6) return null;

    const dateParts = parts[3].split(/\s+/);
    const dateStr = `${dateParts[2]} ${dateParts[1]} ${dateParts[5]} ${dateParts[3]}`;
    const connectedAt = new Date(dateStr);

    return {
      name: parts[0].trim(),
      pid: parts[1].trim(),
      machine: parts[2].trim(),
      connectedAt: isNaN(connectedAt.getTime()) ? new Date() : connectedAt,
      encryption: parts[4].trim(),
      signing: parts[5].trim()
    };
  }

  refresh(): void {
    this.loadData();
  }
}
