/**
 * SeatStatus — used by both Seat (base default) and ShowSeat (per-show live status).
 * The Seat entity carries AVAILABLE as a permanent default.
 * ShowSeat carries the mutable per-show status.
 */
export enum SeatStatus {
  AVAILABLE = 'AVAILABLE',
  LOCKED = 'LOCKED',
  BOOKED = 'BOOKED',
}
