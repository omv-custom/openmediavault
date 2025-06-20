import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { marker as gettext } from '@jsverse/transloco-keys-manager/marker';

@Component({
  selector: 'omv-session-expired',
  templateUrl: './session-expired.component.html',
  styleUrls: ['./session-expired.component.scss'],
  standalone: false
})
export class SessionExpiredComponent {

  public message = {
    title: gettext('Sesja wygasła'),
    content: gettext('Twoja sesja wygasła z powodu braku aktywności. Proszę odśwież stronę lub zaloguj się ponownie.')
  };

  constructor(private router: Router) {}

  refreshPage(): void {
    this.router.navigate(['/']);    
  }

  navigateToLogin(): void {
    this.router.navigate(['/login']);
  }
}
