import { Component, OnInit, OnDestroy, HostListener, TemplateRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'omv-check-inactivity',
  templateUrl: './check-inactivity.component.html',
  styleUrls: ['./check-inactivity.component.scss'],
  standalone: false
})
export class CheckInactivityComponent implements OnInit, OnDestroy {

  private readonly INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minut w milisekundach
  private redirectTime = 300000; // 5 minut w milisekundach - czas po którym nastąpi przekierowanie
  private warningTime = 60000; // 1 minuta przed przekierowaniem pokaż ostrzeżenie
  private lastActivityTime: number;
  private timerSubscription: Subscription;
  private redirectUrl = '/session-expired'; // URL strony, na którą nastąpi przekierowanie
  private toastRef: any;
  private toastShown = false;

  @ViewChild('inactivityToastr', { static: true }) inactivityToastr!: TemplateRef<any>;

  constructor(
    private router: Router,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.checkLastActivityTime();
    this.lastActivityTime = Number(localStorage.getItem('lastActivityTime')) || Date.now();
    this.startTimer();
  }

  ngOnDestroy(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
    this.clearToast();
  }

  @HostListener('document:mousemove')
  @HostListener('document:keypress')
  @HostListener('document:click')
  @HostListener('document:scroll')
  onUserActivity(): void {
    this.lastActivityTime = Date.now();
    localStorage.setItem('lastActivityTime', this.lastActivityTime.toString());
    this.clearToast();
    this.toastShown = false;
  }

  private checkLastActivityTime(): void {
    const storedTime = localStorage.getItem('lastActivityTime');
    if (storedTime) {
      const lastTime = parseInt(storedTime, 10);
      const currentTime = Date.now();
      const timeDiff = currentTime - lastTime;

      if (timeDiff > this.INACTIVITY_TIMEOUT) {
        localStorage.removeItem('lastActivityTime');
      }
    }
  }

  private startTimer(): void {
    this.timerSubscription = interval(1000).subscribe(() => {
      const currentTime = Date.now();
      const timeDiff = currentTime - this.lastActivityTime;
      const timeLeft = this.redirectTime - timeDiff;

      // Pokazanie toastr na 1 minutę przed przekierowaniem
      if (timeLeft <= this.warningTime && timeLeft > 0 && !this.toastShown) {
        this.showWarningToast(timeLeft);
        this.toastShown = true;
      } 
      // Przekierowanie po pełnym czasie
      else if (timeDiff > this.redirectTime) {
        this.clearToast();
        this.redirectToExpiredPage();
      }
    });
  }

private showWarningToast(timeLeft: number): void {
  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  
  const message = `
    <div class="toast-warning-content">
      <strong>Twoja sesja wkrótce wygaśnie!</strong>
      <p>Zostaniesz wylogowany za ${minutes}m ${seconds}s z powodu braku aktywności.</p>
      <p class="small">Kliknij w powiadomienie, aby przedłużyć sesję.</p>
    </div>
  `;

  const options: any = {  // Using 'any' as a workaround
    timeOut: 0,
    extendedTimeOut: 0,
    disableTimeOut: true,
    closeButton: true,
    positionClass: 'toast-top-full-width',
    enableHtml: true,
    tapToDismiss: true,
    onTap: () => {
      this.lastActivityTime = Date.now();
      localStorage.setItem('lastActivityTime', this.lastActivityTime.toString());
      this.toastShown = false;
    }
  };

  this.toastRef = this.toastr.warning(message, '', options);
  
  // Manual tap handler using the toast's onHidden observable
  this.toastRef.onHidden.subscribe(() => {
    if (this.toastRef) {  // Check if toast was dismissed by tap
      this.lastActivityTime = Date.now();
      localStorage.setItem('lastActivityTime', this.lastActivityTime.toString());
      this.toastShown = false;
    }
  });
}

  private clearToast(): void {
    if (this.toastRef) {
      this.toastr.clear(this.toastRef.toastId);
      this.toastRef = null;
    }
  }

  private redirectToExpiredPage(): void {
    this.router.navigateByUrl(this.redirectUrl);
    localStorage.removeItem('lastActivityTime');
  }
}
