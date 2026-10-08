alter table public.bookings
  add column cancellation_message text,
  add constraint bookings_cancellation_message_length
    check (cancellation_message is null or char_length(cancellation_message) <= 1000);
