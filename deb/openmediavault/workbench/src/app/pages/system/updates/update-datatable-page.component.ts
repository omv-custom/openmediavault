import { Component, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { finalize } from 'rxjs/operators';
import { RpcService } from '~/app/shared/services/rpc.service';

interface PackageUpdate {
  name: string;
  version: string;
  description: string;
  size: number;
  repository?: string;
  isSecurity: boolean;
  filename?: string;
}

interface ProgressData {
  package: string;
  operation?: string;    // For general operations
  progress: number;
  status: string;
  details?: string;
}

@Component({
  selector: 'app-updates',
  templateUrl: './update-datatable-page.component.html',
  styleUrls: ['./update-datatable-page.component.scss'],
  standalone: false
})
export class UpdateDatatablePageComponent implements OnInit {
  updates: PackageUpdate[] = [];
  isLoading = true;
  error: string | null = null;
  displayedColumns: string[] = ['name', 'versions', 'size', 'repository', 'description', 'actions'];

  @ViewChild('confirmationDialog') confirmationDialog!: TemplateRef<any>;
  @ViewChild('progressDialog') progressDialog!: TemplateRef<any>;
  @ViewChild('updateDialog') updateDialog!: TemplateRef<any>;

  progressData: ProgressData[] = [];
  currentProgress = 0;
  currentStatus = 'Preparing...';
  dialogRef: any;
  rippleVisible = false;

  constructor(
    private rpc: RpcService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
   this.fetchUpdates();
  }

  installUpdates(): void {
    const dialogRef = this.dialog.open(this.confirmationDialog, {
      width: '400px',
      data: {
        title: 'System Upgrade',
        message: 'All packages will be upgraded. Do you want to proceed?',
        confirmText: 'Upgrade',
        isCritical: true
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.openProgressDialog('Install Updates');
        this.executeUpgradeTask();
      }
    });
  }

  updateRepositories(): void {
    this.openProgressDialog('Updating repositories...');
    this.progressData = [{
      package: 'Updating package lists',
      progress: 0,
      status: 'Starting...'
    }];

    this.rpc.request('Apt', 'update', {})
      .subscribe({
        next: (response: any) => {
          // Aktualizacja postępu w czasie rzeczywistym
          if (response.progress) {
            this.updateProgress(0, response.progress, response.status, response.message);
          }
        },
        complete: () => {
          this.updateProgress(0, 100, 'Completed', 'Repositories updated successfully');
          this.currentStatus = 'Repositories updated';
          setTimeout(() => {
            this.dialogRef.close();
            this.fetchUpdates();
          }, 5000);
        },
        error: (err) => {
          this.updateProgress(0, 100, 'Failed', err.message);
          this.currentStatus = 'Update failed';
          this.snackBar.open(`Repository update failed: ${err.message}`, 'Dismiss', {
            duration: 5000
          });
        }
      });
  }

  openProgressDialog(title: string): void {
    this.dialogRef = this.dialog.open(this.progressDialog, {
      width: '600px',
      disableClose: true,
      data: { title }
    });
  }

  fetchUpdates(): void {
    this.isLoading = true;
    this.error = null;
  
    this.rpc.request('Apt', 'enumerateUpgraded', null)
      .pipe(
        finalize(() => this.isLoading = false)
      )
      .subscribe({
        next: (response: PackageUpdate[]) => {
          this.updates = response || [];
        },
        error: (err) => {
          this.error = err.message || 'Failed to fetch updates';
          this.snackBar.open(this.error, 'Dismiss', {
            duration: 5000
          });
        }
      });
  }

  checkForUpdates(event: MouseEvent): void {
    this.isLoading = true;
    this.showRippleEffect(event);
    this.snackBar.open('Checking repositories for updates...', 'Dismiss', {
      duration: 3000
    });

    this.rpc.request('Apt', 'update', {})
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.fetchUpdates(); // Po sprawdzeniu załaduj nowe aktualizacje
        })
      )
      .subscribe({
        next: () => {
          this.snackBar.open('Repositories updated successfully', 'Dismiss', {
            duration: 5000
          });
        },
        error: (err) => {
          this.snackBar.open(
            err.message || 'Failed to update repositories', 
            'Dismiss', 
            { duration: 5000 }
          );
        }
      });
  }

  private executeUpgradeTask(): void {
    this.progressData = this.updates.map(pkg => ({
      package: pkg.name,
      progress: 0,
      status: 'Pending'
    }));

    // Symulacja postępu (w rzeczywistości użyj WebSocket lub polling)
    this.simulateUpgradeProgress();
    
    // Rzeczywiste wywołanie aktualizacji
    this.rpc.request('Apt', 'upgrade', {})
      .pipe(
        finalize(() => {
          this.isLoading = false;
          setTimeout(() => {
            this.fetchUpdates();
          }, 2000);
        })
      )
      .subscribe({
        next: () => {
          this.currentStatus = 'Upgrade completed successfully';
          this.snackBar.open('Upgrade completed successfully', 'Dismiss', {
            duration: 5000
          });
        },
        error: (err) => {
          this.currentStatus = `Upgrade failed: ${err.message || 'Unknown error'}`;
          this.snackBar.open(
            `Upgrade failed: ${err.message || 'Unknown error'}`,
            'Dismiss',
            { duration: 5000 }
          );
        }
      });
  }

  private showRippleEffect(event: MouseEvent): void {
    this.rippleVisible = true;
    setTimeout(() => this.rippleVisible = false, 600);
    
    // Pozycjonowanie efektu ripple
    const button = event.currentTarget as HTMLElement;
    const ripple = button.querySelector('.ripple') as HTMLElement;
    
    if (ripple) {
      const rect = button.getBoundingClientRect();
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
    }
  }

  private simulateUpgradeProgress(): void {
    let completed = 0;
    const total = this.progressData.length;
    
    this.progressData.forEach((pkg, index) => {
      setTimeout(() => {
        // Symulacja pobierania
        this.updateProgress(index, 50, 'Downloading...');
        
        setTimeout(() => {
          // Symulacja instalacji
          this.updateProgress(index, 100, 'Installed');
          completed++;
          
          // Aktualizacja ogólnego postępu
          this.currentProgress = Math.round((completed / total) * 100);
          this.currentStatus = `Upgraded ${completed} of ${total} packages`;
        }, 1000 + (index * 500));
      }, index * 1000);
    });
  }

  private updateProgress(index: number, progress: number, status: string, details?: string): void {
    if (this.progressData[index]) {
      this.progressData[index] = {
        ...this.progressData[index],
        progress,
        status,
        details: details || this.progressData[index].details
      };
      this.progressData = [...this.progressData];
      this.currentProgress = progress;
    }
  }

getStatusIcon(status: string): string {
  switch(status.toLowerCase()) {
    case 'completed':
      return 'circle-check';
    case 'failed':
      return 'alert-circle';
    case 'downloading':
      return 'download';
    case 'installing':
      return 'package';
    default:
      return 'refresh';
  }
}

  getSecurityIcon(update: PackageUpdate): string {
    return update.isSecurity ? 'security' : 'system_update';
  }

  getSecurityTooltip(update: PackageUpdate): string {
    return update.isSecurity ? 'Security update' : 'Regular update';
  }
}
