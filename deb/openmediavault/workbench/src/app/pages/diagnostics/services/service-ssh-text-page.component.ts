/**
 * This file is part of OpenMediaVault.
 *
 * @license   http://www.gnu.org/licenses/gpl.html GPL Version 3
 * @author    Volker Theile <volker.theile@openmediavault.org>
 * @copyright Copyright (c) 2009-2025 Volker Theile
 *
 * OpenMediaVault is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 * OpenMediaVault is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 */
import { Component, OnInit } from '@angular/core';
import { RpcService } from '~/app/shared/services/rpc.service';
import { finalize } from 'rxjs';

interface SshConfig {
  enable?: boolean;
  port?: number;
  passwordauthentication?: boolean;
  permitrootlogin?: boolean;
  tcpforwarding?: boolean;
  allowgroups?: string[];
  extraoptions?: string;
}

interface SshStats {
  config?: SshConfig;
  loggedInUsers?: string;
  connections?: string;
}

interface ParsedUserSession {
  user?: string;
  terminal?: string;
  loginTime?: string;
  ip?: string;
  pid?: string;
}

interface ParsedConnection {
  command?: string;
  pid?: string;
  user?: string;
  protocol?: string;
  localAddress?: string;
  foreignAddress?: string;
  state?: string;
}

@Component({
  selector: 'app-ssh-info',
  templateUrl: './service-ssh-text-page.component.html',
  styleUrls: ['./service-ssh-text-page.component.scss'],
  standalone: false
})

export class ServiceSshTextPageComponent implements OnInit {
  sshStats: SshStats = {};
  parsedSessions: ParsedUserSession[] = [];
  parsedConnections: ParsedConnection[] = [];
  isLoading = true;
  error: string | null = null;
  sessionsExpanded = false;
  connectionsExpanded = false;

  constructor(private rpc: RpcService) {}

  ngOnInit(): void {
    this.loadSshStats();
  }

  loadSshStats(): void {
    this.isLoading = true;
    this.error = null;
    
    this.rpc.request('SSH', 'getStats', {}).pipe(
      finalize(() => this.isLoading = false)
    ).subscribe({
      next: (response: string) => {
        this.parseSshStats(response);
      },
      error: (err) => {
        this.error = err.message || 'Failed to load SSH statistics';
      }
    });
  }

  private parseSshStats(stats: string): void {
    this.sshStats = {};
    
    if (stats.includes('Service disabled')) {
      this.sshStats.config = { enable: false };
      return;
    }

    this.sshStats.config = { enable: true };

    // Split the response into sections
    const sections = stats.split('\n\n');
    
    // Parse logged in users
    if (sections.length > 0 && sections[0].includes('Currently logged in users')) {
      const usersSection = sections[0].split('\n').slice(1).join('\n');
      this.sshStats.loggedInUsers = usersSection;
      this.parsedSessions = this.parseUserSessions(usersSection);
    }

    // Parse connections
    if (sections.length > 1 && sections[1].includes('Connections')) {
      const connectionsSection = sections[1].split('\n').slice(1).join('\n');
      this.sshStats.connections = connectionsSection;
      this.parsedConnections = this.parseConnections(connectionsSection);
    }
  }

  private parseUserSessions(usersOutput: string): ParsedUserSession[] {
    if (!usersOutput || usersOutput.includes('No users connected')) {
      return [];
    }

    return usersOutput.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.split(/\s+/);
        return {
          user: parts[0],
          terminal: parts[1],
          loginTime: parts.length > 3 ? `${parts[2]} ${parts[3]}` : 'N/A',
          ip: parts.length > 5 ? parts[5].replace(/[()]/g, '') : 'N/A',
          pid: parts.length > 4 ? parts[4] : undefined
        };
      });
  }

  private parseConnections(connectionsOutput: string): ParsedConnection[] {
    if (!connectionsOutput || connectionsOutput.includes('No connections')) {
      return [];
    }

    return connectionsOutput.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.split(/\s+/).filter(part => part.trim());
        return {
          command: parts[0],
          pid: parts[1],
          user: parts[2],
          protocol: parts[3],
          localAddress: parts[8],
          foreignAddress: parts[9],
          state: parts[10] || 'N/A'
        };
      });
  }

  refresh(): void {
    this.loadSshStats();
  }

  getStatusIcon(): string {
    return this.sshStats.config?.enable ? 'check_circle' : 'cancel';
  }

  getStatusColor(): string {
    return this.sshStats.config?.enable ? 'primary' : 'warn';
  }
}
