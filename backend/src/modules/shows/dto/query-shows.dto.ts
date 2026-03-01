/** Plain TypeScript interface — validation handled by Zod in shows.router.ts */
export interface QueryShowsDto {
  movieId?: string;  // UUID filter
  date?: string;     // YYYY-MM-DD filter
  page?: number;
  limit?: number;
}
