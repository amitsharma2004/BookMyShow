/** Plain TypeScript interface — validation handled by Zod in theaters.router.ts */
export interface CreateTheaterDto {
  name: string;
  location: string;
  totalRows: number;     // 1–26
  totalColumns: number;  // 1–50
}
