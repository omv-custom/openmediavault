import { Component, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { RpcService } from '~/app/shared/services/rpc.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';

interface Plugin {
  name: string;
  version: string;
  pluginsection: string;
  pluginarchitecture: string;
  repository: string;
  abstract: string;
  extendeddescription: string;
  summary: string;
  size: number;
  maintainer: string;
  homepage: string;
  installed: boolean;
  isInstalling?: boolean;
  installProgress?: number;
  installOutput: string[];
}

@Component({
  templateUrl: './plugins-datatable-page.component.html',
  styleUrls: ['./plugins-datatable-page.component.scss'],
  standalone: false
})
export class PluginsDatatablePageComponent implements OnInit {
  public plugins: Plugin[] = [];
  public filteredPlugins: Plugin[] = [];
  public isLoading = true;
  public searchQuery = '';
  public selectedCategory = '';
  public availableCategories: string[] = [];
  public filename = '';
  public running = false;
  public selectedStatus = '';

  @ViewChild('confirmationDialog') confirmationDialog!: TemplateRef<any>;
  @ViewChild('progressDialog') progressDialog!: TemplateRef<any>;

  constructor(
    private rpc: RpcService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadPlugins();
  }

  private showMessage(message: string, isError = false): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: isError ? 'error-snackbar' : 'success-snackbar'
    });
  }

  async loadPlugins(): Promise<void> {
    this.isLoading = true;
    try {
      const plugins = await this.rpc.request('Plugin', 'enumeratePlugins', null).toPromise();
      this.plugins = plugins.map(p => ({
        ...p,
        isInstalling: false,
        installProgress: 0
      }));
      
      // Extract unique categories
      this.availableCategories = [...new Set(this.plugins.map(p => p.pluginsection.toLowerCase()))];
      
      this.filterPlugins();
    } catch (error) {
      console.error('Failed to load plugins:', error);
      this.showMessage(`Failed to load plugins: ${error.message}`, true);
    } finally {
      this.isLoading = false;
    }
  }

  filterPlugins(): void {
    let filtered = [...this.plugins];
    
    // Apply category filter
    if (this.selectedCategory) {
      filtered = filtered.filter(p => 
        p.pluginsection.toLowerCase() === this.selectedCategory.toLowerCase()
      );
    }
  
    // Apply status filter
    if (this.selectedStatus === 'installed') {
      filtered = filtered.filter(p => p.installed);
    } else if (this.selectedStatus === 'not_installed') {
      filtered = filtered.filter(p => !p.installed);
    }
  
    // Apply search filter
    if (this.searchQuery) {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(this.searchQuery) ||
        p.pluginsection.toLowerCase().includes(this.searchQuery) ||
        p.abstract.toLowerCase().includes(this.searchQuery) ||
        (p.extendeddescription && p.extendeddescription.toLowerCase().includes(this.searchQuery))
      );
    }
    
    this.filteredPlugins = filtered;
  }

async installPlugin(plugin: Plugin): Promise<void> {
  const confirmDialog = this.dialog.open(this.confirmationDialog, {
    width: '400px',
    data: {
      title: `Install ${plugin.name}?`,
      message: 'All packages will be upgraded. Do you want to proceed?',
      confirmText: 'Install',
      isCritical: true
    }
  });

  confirmDialog.afterClosed().subscribe(async (confirmed) => {
    if (confirmed) {
      this.running = true;
      plugin.isInstalling = true;
      plugin.installProgress = 0;
      plugin.installOutput = [];

      try {
        const installResponse: any = await this.rpc.request('Plugin', 'install', {
          packages: [plugin.name]
        }).toPromise();

        this.filename = installResponse; // np. "/tmp/bgstatusxoVk9W"
        let lastPos = 0;
        let isComplete = false;

        // Funkcja do śledzenia postępu
        const trackProgress = async () => {
          if (isComplete) return;

          try {
            // Pobierz aktualny output
            const outputResponse: any = await this.rpc.request('Exec', 'getOutput', {
              filename: this.filename,
              pos: lastPos
            }).toPromise();

            lastPos = outputResponse.pos;
            
            if (outputResponse.output) {
              this.printOutput(outputResponse.output, plugin);
              const progressMatch = outputResponse.output.match(/Reading\s+database\s+...\s*(\d+)%/);
              if (progressMatch) {
                plugin.installProgress = parseInt(progressMatch[1], 10);
              }
            }

            if (outputResponse.output?.includes('/Unpacking\s.+/') ||
                outputResponse.output?.includes('Unpacking')) {
                plugin.installProgress = 25;
            }

            if (outputResponse.output?.includes('/Setting\s+up\s.+/') ||
                outputResponse.output?.includes('Setting up')) {
                plugin.installProgress = 50;
            }

            if (outputResponse.output?.includes('/Processing\s+triggers\s.+/') ||
                outputResponse.output?.includes('Processing triggers')) {
                plugin.installProgress = 75;
            }

            // Sprawdź czy proces zakończony  Restarting engine daemon ...
            if (outputResponse.output?.includes('/Updating\s+workbench\s+configuration\s+files\s+...\s.+/') || outputResponse.output?.includes('Updating workbench configuration files')) {
              plugin.installProgress = 100;
              setTimeout(()=> {
              isComplete = true;
              this.verifyInstallationStatus(plugin);
              plugin.installed = true;
              this.showMessage(`${plugin.name} installed successfully`);
              },10000);
            } else {
              setTimeout(trackProgress, 1000);
            }
          } catch (error) {
            isComplete = true;
            this.printOutput(`Error: ${error.message}`, plugin);
            plugin.isInstalling = false;
            this.showMessage(`Installation failed: ${error.message}`, true);
          }
        };

        trackProgress();

      } catch (error) {
        this.printOutput(`Initialization error: ${error.message}`, plugin);
        plugin.isInstalling = false;
        this.showMessage(`Failed to start installation: ${error.message}`, true);
      }
    }
  });
}

async uninstallPlugin(plugin: Plugin): Promise<void> {
  const confirmDialog = this.dialog.open(this.confirmationDialog, {
    width: '400px',
    data: {
      title: `Uninstall ${plugin.name}?`,
      message: 'This will remove the plugin and its configuration. Do you want to proceed?',
      confirmText: 'Uninstall',
      isCritical: true
    }
  });

  confirmDialog.afterClosed().subscribe(async (confirmed) => {
    if (confirmed) {
      plugin.isInstalling = true;
      plugin.installProgress = 0;
      plugin.installOutput = [];
      
      try {
        const installResponse: any = await this.rpc.request('Plugin', 'remove', {
          packages: [plugin.name]
        }).toPromise();

        this.filename = installResponse;
        let lastPos = 0;
        let isComplete = false;

        const trackProgress = async () => {
          if (isComplete) return;

          try {
            const outputResponse: any = await this.rpc.request('Exec', 'getOutput', {
              filename: this.filename,
              pos: lastPos
            }).toPromise();

            lastPos = outputResponse.pos;
            
            if (outputResponse.output) {
              this.printOutput(outputResponse.output, plugin);
              const progressMatch = outputResponse.output.match(/Reading\s+database\s+...\s*(\d+)%/);
              if (progressMatch) {
                plugin.installProgress = parseInt(progressMatch[1], 10);
              }
            }

            if (outputResponse.output?.includes('/Removing\s.+/') ||
                outputResponse.output?.includes('Removing')) {
                plugin.installProgress = 50;
            }

            if (outputResponse.output?.includes('/Processing\s+triggers\s+for\s+...\s.+/') ||
                outputResponse.output?.includes('Processing triggers for ...')) {
                plugin.installProgress = 75;
            }

            if (outputResponse.output?.includes('/Updating\s+workbench\s+configuration\s+files\s+...\s.+/') || outputResponse.output?.includes('Updating workbench configuration files')) {
              plugin.installProgress = 100;
              setTimeout(()=> {
              isComplete = true;
              this.verifyInstallationStatus(plugin);
              plugin.installed = true;
              this.showMessage(`${plugin.name} installed successfully`);
              },10000);
            } else {
              setTimeout(trackProgress, 500);
            }
          } catch (error) {
            isComplete = true;
            this.printOutput(`Error: ${error.message}`, plugin);
            plugin.isInstalling = false;
            this.showMessage(`UnInstallation failed: ${error.message}`, true);
          }
        };

        trackProgress();

      } catch (error) {
        this.printOutput(`Initialization error: ${error.message}`, plugin);
        plugin.isInstalling = false;
        this.showMessage(`Failed to start installation: ${error.message}`, true);
      }
    }
  });
}

private cleanAnsiCodes(text: string): string {
  // Usuwa kody ANSI (kolory, znaki specjalne)
  return text.replace(/\u001b\[.*?m|\u001b\[.*?[hl]|\u001b\[\?25[hl]/g, '');
}

getInstallationStatus(plugin: Plugin): string {
  switch (plugin.installProgress) {
    case 25: return 'Unpacking package files...';
    case 50: return 'Setting Up package files...';
    case 75: return 'Processing triggers...';
    case 100: return 'Finalizing installation...';
    default: return `Preparing installation... (${plugin.installProgress}%)`;
  }
}

  async checkForUpdates(): Promise<void> {
    this.showMessage('Checking for new plugins...');
    try {
      await this.rpc.request('Apt', 'update', null, {
        task: true,
        progressMessage: 'Checking for new plugins...'
      }).toPromise();
      this.showMessage('Plugin repository updated successfully');
      await this.loadPlugins();
    } catch (error) {
      console.error('Failed to check updates:', error);
      this.showMessage(`Failed to check updates: ${error.message}`, true);
    }
  }

 private printOutput(output: string, plugin: Plugin) {
  if (!output) return;
  const cleanOutput = this.cleanAnsiCodes(output);  
  const lines = cleanOutput.split('\n');
  plugin.installOutput.push(...lines.filter(line => line.trim() !== ''));
  
  // Aktualizuj postęp na podstawie komunikatów
  lines.forEach(line => {
    if (line.includes('Unpacking')) {
      plugin.installProgress = 50;
    } else if (line.includes('Setting up')) {
      plugin.installProgress = 100;
    }
  });
    
  // Automatycznie przewijaj do końca
  setTimeout(() => {
    const outputContainer = document.querySelector('.output-content');
    if (outputContainer) {
      outputContainer.scrollTop = outputContainer.scrollHeight;
    }
  }, 0);
}

 private verifyInstallationStatus(plugin: Plugin) {
  this.rpc.request('Plugin', 'enumeratePlugins', null).subscribe({
    next: (plugins: Plugin[]) => {
      const updatedPlugin = plugins.find(p => p.name === plugin.name);
      if (updatedPlugin) {
        plugin.installed = updatedPlugin.installed;
        plugin.isInstalling = false;
      }
    },
    error: (error) => {
      console.error('Failed to verify installation:', error);
      plugin.isInstalling = false;
    }
  });
}

  updateSearch(event: Event): void {
    this.searchQuery = (event.target as HTMLInputElement).value.toLowerCase();
    this.filterPlugins();
  }

  onCategoryChange(event: Event): void {
    this.selectedCategory = (event.target as HTMLSelectElement).value;
    this.filterPlugins();
  }

  onStatusChange(event: Event): void {
    this.selectedStatus = (event.target as HTMLSelectElement).value;
    this.filterPlugins();
  }

  getSectionColor(section: string): string {
    const colors: Record<string, string> = {
      'web': '#4e73df',
      'network': '#1cc88a', 
      'system': '#f6c23e',
      'storage': '#e74a3b',
      'service': '#36b9cc'
    };
    return colors[section.toLowerCase()] || '#858796';
  }

  getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      'web': 'world',
      'network': 'network', 
      'system': 'settings',
      'storage': 'database',
      'service': 'server'
    };
    return icons[category.toLowerCase()] || 'category';
  }
}
