import { Component, OnInit, OnDestroy, HostListener, TemplateRef, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'omv-check-inactivity',
  templateUrl: './check-inactivity.component.html',
  styleUrls: ['./check-inactivity.component.scss'],
  standalone: false
})
export class CheckInactivityComponent implements OnInit, OnDestroy {

  private inactivityTime = 120000; // 5 minut w milisekundach
  private lastActivityTime: number;
  private timerSubscription: Subscription;
  public dialogRef: any;

  @ViewChild('inactivityDialog', { static: true }) inactivityDialog!: TemplateRef<any>;

  constructor(private dialog: MatDialog) {}

  ngOnInit(): void {
    this.lastActivityTime = Number(localStorage.getItem('lastActivityTime')) || Date.now();
    this.startTimer();
  }

  ngOnDestroy(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }

  @HostListener('document:mousemove')
  onMouseMove() {
    this.lastActivityTime = Date.now();
    localStorage.setItem('lastActivityTime', this.lastActivityTime.toString());
    
    if (this.dialogRef) {
      this.dialogRef.close();
      this.dialogRef = null;
    }
  }

  private startTimer(): void {
    this.timerSubscription = interval(1000).subscribe(() => {
      const currentTime = Date.now();
      const timeDiff = currentTime - this.lastActivityTime;

      if (timeDiff > this.inactivityTime) {
        this.openInactivityDialog();
      }
    });
  }

  private openInactivityDialog(): void {
   if (!this.dialogRef) {
    this.dialogRef = this.dialog.open(this.inactivityDialog, {
      data: 'test',
      disableClose: true
    });

    this.dialogRef.afterClosed().subscribe(() => {
      this.dialogRef = null;
    });
   }
  }
}
