/**
 * SeatType — physical classification of a seat in a theater.
 * Row A → PREMIUM; last 2 rows → VIP; everything else → REGULAR.
 */
export enum SeatType {
  REGULAR = 'REGULAR',
  PREMIUM = 'PREMIUM',
  VIP = 'VIP',
}
