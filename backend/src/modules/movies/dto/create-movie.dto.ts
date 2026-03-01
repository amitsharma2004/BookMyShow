/** Plain TypeScript interface — validation handled by Zod in movies.router.ts */
export interface CreateMovieDto {
  title: string;
  description?: string;
  genre: string[];
  cast: string[];
  releaseDate: string;   // YYYY-MM-DD
  durationMinutes: number;
  posterUrl?: string;
}
