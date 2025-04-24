export interface Session {
  session: {
    id: string;
  };
  user: {
    id: string;
    title: string;
    thumb?: string;
  };
  player: {
    title: string;
    platform: string;
  };
  media?: {
    type: string;
    title: string;
    thumb?: string;
    duration: number;
  };
  progress: number;
  startedAt: Date;
}
