import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NgModule } from '@angular/core';
import { MATERIAL_SANITY_CHECKS } from '@angular/material/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { ServiceWorkerModule } from '@angular/service-worker';
import {
  TRANSLOCO_MISSING_HANDLER,
  TranslocoConfig,
  TranslocoMissingHandler,
  TranslocoTestingModule
} from '@jsverse/transloco';
import { ToastrModule } from 'ngx-toastr';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

export class TestingTranslocoMissingHandler implements TranslocoMissingHandler {
  handle(key: string, config: TranslocoConfig) {
    return key;
  }
}

@NgModule({ exports: [RouterTestingModule], imports: [NoopAnimationsModule,
        RouterTestingModule,
        TranslocoTestingModule,
        ServiceWorkerModule.register('ngsw-worker.js', {
           enabled: false
        }),
        ToastrModule.forRoot()], providers: [
        // Disable sanity checks to prevent warning messages in unit tests.
        // https://github.com/thymikee/jest-preset-angular/issues/83
        // https://github.com/angular/components/pull/4178
        { provide: MATERIAL_SANITY_CHECKS, useValue: false },
        // Disable 'Missing translation for ...' warnings.
        { provide: TRANSLOCO_MISSING_HANDLER, useClass: TestingTranslocoMissingHandler },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting()
    ] })
export class TestingModule {}
