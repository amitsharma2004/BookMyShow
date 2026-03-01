/** Plain TypeScript interface — validation handled by Zod in auth.router.ts */
export interface LoginDto {
  email: string;
  password: string;
}
