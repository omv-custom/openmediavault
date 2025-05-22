import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';

import { CoreModule } from '~/app/core/core.module';
import { NfsSettingsFormPageComponent } from '~/app/pages/services/nfs/nfs-settings-form-page.component';
import { NfsShareDatatablePageComponent } from '~/app/pages/services/nfs/nfs-share-datatable-page.component';
import { NfsShareFormPageComponent } from '~/app/pages/services/nfs/nfs-share-form-page.component';
import { RsyncModuleDatatablePageComponent } from '~/app/pages/services/rsync/rsync-module-datatable-page.component';
import { RsyncModuleFormPageComponent } from '~/app/pages/services/rsync/rsync-module-form-page.component';
import { RsyncModuleSettingsFormPageComponent } from '~/app/pages/services/rsync/rsync-module-settings-form-page.component';
import { RsyncTaskDatatablePageComponent } from '~/app/pages/services/rsync/rsync-task-datatable-page.component';
import { RsyncTaskFormPageComponent } from '~/app/pages/services/rsync/rsync-task-form-page.component';
import { ServicesRoutingModule } from '~/app/pages/services/services-routing.module';
import { SmbSettingsFormPageComponent } from '~/app/pages/services/smb/smb-settings-form-page.component';
import { SmbShareDatatablePageComponent } from '~/app/pages/services/smb/smb-share-datatable-page.component';
import { SmbShareFormPageComponent } from '~/app/pages/services/smb/smb-share-form-page.component';
import { SshFormPageComponent } from '~/app/pages/services/ssh/ssh-form-page.component';
import { PlexDatatablePageComponent } from '~/app/pages/services/plex/plex-datatable-page.component';
import { EmbyPageComponent } from '~/app/pages/services/emby/emby-page.component';
import { ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '~/app/material.module';
import { PipesModule } from '~/app/shared/pipes/pipes.module';
import { FormsModule } from '@angular/forms';

@NgModule({
  declarations: [
    SshFormPageComponent,
    SmbSettingsFormPageComponent,
    SmbShareDatatablePageComponent,
    SmbShareFormPageComponent,
    NfsSettingsFormPageComponent,
    NfsShareDatatablePageComponent,
    NfsShareFormPageComponent,
    RsyncTaskDatatablePageComponent,
    RsyncTaskFormPageComponent,
    RsyncModuleSettingsFormPageComponent,
    RsyncModuleDatatablePageComponent,
    RsyncModuleFormPageComponent,
    PlexDatatablePageComponent,
    EmbyPageComponent
  ],
  imports: [CommonModule, CoreModule, ServicesRoutingModule, ReactiveFormsModule,MaterialModule, TranslocoModule, PipesModule, FormsModule]
})
export class ServicesModule {}
