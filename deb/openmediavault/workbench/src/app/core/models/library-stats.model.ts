export interface LibraryStats {
  id: string;
  name: string;
  type: 'movie' | 'show' | 'artist' | 'photo';
  count: number;
  size: number;
  lastScanned: Date;
}
