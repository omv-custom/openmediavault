// src/app/directives/has-permission.directive.ts
import { Directive, Input, TemplateRef, ViewContainerRef, OnInit } from '@angular/core';
import { PermissionService } from '~/app/shared/services/permission.service';

@Directive({
  selector: '[hasPermission]',
  standalone: false
})
export class HasPermissionDirective implements OnInit {
  @Input() hasPermission: string;

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private permissionService: PermissionService
  ) {}

  ngOnInit() {
    if (this.permissionService.hasPermission(this.hasPermission)) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    } else {
      this.viewContainer.clear();
    }
  }
}
