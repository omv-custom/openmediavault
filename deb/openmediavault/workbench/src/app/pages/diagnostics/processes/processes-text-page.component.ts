// processes-page.component.ts
import { Component } from '@angular/core';
import { RpcService } from '~/app/shared/services/rpc.service';
import { finalize } from 'rxjs/operators';

interface Process {
  pid: number;
  user: string;
  pr: number;
  ni: number;
  virt: string;
  res: string;
  shr: string;
  s: string;
  cpu: number;
  mem: number;
  time: string;
  command: string;
}

@Component({
  selector: 'omv-processes-page',
  templateUrl: './processes-text-page.component.html',
  styleUrls: ['./processes-text-page.component.scss'],
  standalone: false
})
export class ProcessesTextPageComponent {
  processes: Process[] = [];
  displayedColumns: string[] = ['pid', 'user', 'cpu', 'mem', 'time', 'command'];
  isLoading = false;
  autoRefresh = true;
  refreshInterval = 15000;
  private refreshTimer: any;

  constructor(private rpc: RpcService) {
    this.loadProcesses();
    this.setupAutoRefresh();
  }

  loadProcesses() {
    this.isLoading = true;
    this.rpc.request('System', 'getTopInfo', {})
      .pipe(finalize(() => this.isLoading = false))
      .subscribe({
        next: (res: any) => {
          this.processes = this.parseTopOutput(res);
        },
        error: (err) => {
          console.error('Error loading processes:', err);
        }
      });
  }

  private parseTopOutput(data: string): Process[] {
    const lines = data.split('\n');
    const processes: Process[] = [];

    // Skip header lines and find process lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('top') && !line.startsWith('Tasks') &&
          !line.startsWith('%Cpu') && !line.startsWith('KiB')) {
        const parts = line.split(/\s+/).filter(p => p);
        if (parts.length >= 12 && !isNaN(parseInt(parts[0]))) {
          processes.push({
            pid: parseInt(parts[0]),
            user: parts[1],
            pr: parseInt(parts[2]),
            ni: parseInt(parts[3]),
            virt: parts[4],
            res: parts[5],
            shr: parts[6],
            s: parts[7],
            cpu: parseFloat(parts[8]),
            mem: parseFloat(parts[9]),
            time: parts[10],
            command: parts.slice(11).join(' ')
          });
        }
      }
    }

    return processes;
  }

  toggleAutoRefresh() {
    this.autoRefresh = !this.autoRefresh;
    this.setupAutoRefresh();
  }

  private setupAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    if (this.autoRefresh) {
      this.refreshTimer = setInterval(() => this.loadProcesses(), this.refreshInterval);
    }
  }

  ngOnDestroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }
}