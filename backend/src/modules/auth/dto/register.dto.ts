/** Plain TypeScript interface — validation handled by Zod in auth.router.ts */
export interface RegisterDto {
  email: string;
  password: string;
}
