//! Mail on a clock: messages scheduled to go later, and reminders to follow up when nobody answers a message you sent.
//! Both are saved in `later.json`, readable by this user only, and checked every half minute while the app runs, so
//! they survive a restart; anything that fell due while the app was closed goes at the next start.

mod service;
#[cfg(test)]
mod tests;

pub use service::{LaterService, ReminderDto, ScheduledDto};
