import { Injectable } from '@angular/core';
import { RpcService } from '~/app/shared/services/rpc.service';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface ClusterNode {
  hostname: string;
  address: string;
  port: number;
  username: string;
  password?: string;
  key?: string;
}

export interface SystemInfo {
  hostname: string;
  version: string;
  cpuUsage: number;
  memoryUsage: number;
  uptime: string;
  services: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ClusterService {
  private readonly defaultSshPort = 22;

  constructor(private rpcService: RpcService) {}

  addClusterNode(node: ClusterNode) {
    return this.rpcService.request('Cluster', 'addNode', {
      host: node.hostname,
      port: node.port || this.defaultSshPort,
      username: node.username,
      password: node.password,
      key: node.key
    }).pipe(
      map((response) => {
        return { success: true, message: 'Node added successfully' };
      }),
      catchError((error) => {
        return of({ success: false, message: this.mapClusterError(error) });
      })
    );
  }

  getClusterNodes() {
    return this.rpcService.request('Cluster', 'getNodes', {}).pipe(
      map((response) => response.nodes),
      catchError((error) => {
        console.error('Error fetching cluster nodes:', error);
        return of([]);
      })
    );
  }

  getRemoteSystemInfo(node: ClusterNode) {
    return this.rpcService.request('Cluster', 'getRemoteSystemInfo', {
      host: node.hostname,
      port: node.port || this.defaultSshPort,
      username: node.username,
      password: node.password,
      key: node.key
    }).pipe(
      map((response) => response.info),
      catchError((error) => {
        console.error('Error fetching remote system info:', error);
        return of(null);
      })
    );
  }

  private mapClusterError(error: any): string {
    if (error.code === 'ECONNREFUSED') {
      return 'Connection refused. Check if SSH is enabled on the remote host.';
    } else if (error.code === 'ETIMEDOUT') {
      return 'Connection timed out. Check the hostname and network connectivity.';
    } else if (error.message.includes('Authentication failed')) {
      return 'Authentication failed. Check username and password or SSH key.';
    }
    return 'An unknown error occurred while connecting to the cluster node.';
  }
}
