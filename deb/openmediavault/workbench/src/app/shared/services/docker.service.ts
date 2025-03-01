import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DockerService {
  private outputSubject = new Subject<string>();

  constructor(private http: HttpClient) {}

  connectToContainer(containerName: string) {
    this.http.post('http://192.168.1.22:1122/api/connect', { containerName }).subscribe();
  }

  sendCommand(command: string) {
    this.http.post('http://192.168.1.22:1122/api/command', { command }).subscribe();
  }

  getOutput() {
    return this.outputSubject.asObservable();
  }
}
