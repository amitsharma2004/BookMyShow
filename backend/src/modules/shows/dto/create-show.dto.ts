/** Plain TypeScript interface — validation handled by Zod in shows.router.ts */
export interface CreateShowDto {
  movieId: string;    // UUID
  theaterId: string;  // UUID
  showTime: string;   // ISO 8601 with timezone e.g. 2026-06-15T19:30:00+05:30
}
