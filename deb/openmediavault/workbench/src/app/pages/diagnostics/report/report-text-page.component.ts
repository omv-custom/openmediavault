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
import { Clipboard } from '@angular/cdk/clipboard';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-report',
  templateUrl: './report-text-page.component.html',
  styleUrls: ['./report-text-page.component.scss'],
  standalone: false
})

export class ReportTextPageComponent implements OnInit {
  reportData: string;
  parsedSections: {title: string; content: string[]}[] = [];
  isLoading = true;
  error: string | null = null;

  constructor(
    private rpc: RpcService,
    private clipboard: Clipboard,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadReport();
  }

  loadReport(): void {
    this.isLoading = true;
    this.error = null;
    
    this.rpc.request('System', 'getDiagnosticReport', {}).subscribe({
      next: (response: string) => {
        this.reportData = response;
        this.parseReport(response);
        this.isLoading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load diagnostic report';
        this.isLoading = false;
      }
    });
  }

private parseReport(report: string): void {
  // Rozdzielanie sekcji poprzez linie z === lub ====
  const sections = report.split(/\n=+[\s=]*\n/).filter(section => section.trim());
  
  this.parsedSections = sections.map(section => {
    const lines = section.split('\n').filter(line => line.trim());
    const titleLine = lines[0];
    const contentLines = lines.slice(1);
    
    // Ekstrakcja tytułu (usuwa znaki = z początku/końca)
    const title = titleLine.replace(/^=+\s*|\s*=+$/g, '').trim();
    
    return {
      title: title || 'Untitled Section',
      content: contentLines
    };
  });
}

/*  private parseReport(report: string): void {
    const sections = report.split(/\n=+\n?/).filter(section => section.trim());
    
    this.parsedSections = sections.map(section => {
      const [titleLine, ...contentLines] = section.split('\n').filter(line => line.trim());
      const title = titleLine.replace(/^=\s*|\s*=$/g, '');
      
      return {
        title: title.trim(),
        content: contentLines.map(line => line.trim())
      };
    });
  }
*/

  copyToClipboard(): void {
    this.clipboard.copy(this.reportData);
    this.snackBar.open('Report copied to clipboard!', 'OK', {
      duration: 3000,
      panelClass: 'success-snackbar'
    });
  }

  // Add this to your component class
  getSectionIndex(section: any): number {
    return this.parsedSections.indexOf(section);
  }

  isLastSection(section: any): boolean {
    return this.getSectionIndex(section) === this.parsedSections.length - 1;
  }

  refresh(): void {
    this.loadReport();
  }
}
