import { Pipe, PipeTransform } from '@angular/core';
import * as _ from 'lodash';

@Pipe({ 
    name: 'filesize',
    standalone: false
})
export class FileSizePipe implements PipeTransform {
  transform(bytes: number = 0, precision: number = 2): string {
    if (isNaN(bytes) || !isFinite(bytes) || bytes === 0) return '0 Bytes';
    
    const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(precision)) + ' ' + units[i];
  }
}
