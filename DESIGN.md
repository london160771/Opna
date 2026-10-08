# Opna — V1 design direction

## Character and references

Simple before impressive. Opna should feel calm, friendly, and dependable, with the public booking flow receiving the most attention.

- **Cal.com:** primary booking UX reference; clear choices, restrained layout, little motion.
- **TimeNest:** primary landing-page reference; approachable, concise, small-business language.
- **Linear:** dashboard hierarchy, navigation, dense information made readable.
- **Attio:** typography, spacing, inputs, and finishing details.

Borrow principles, not page layouts or brand assets. Do not imply unsupported capabilities, including WhatsApp reminders. Avoid cinematic sequences, animated backgrounds, scroll reveals, and decorative dashboard complexity.

## Visual foundation

- Use a light canvas, white panels, dark neutral text, subtle borders, and one restrained blue accent for primary actions and selected states. Green/amber/red status cues always include text or icons.
- Suggested starting tokens: canvas `#F8FAFC`, surface `#FFFFFF`, text `#0F172A`, muted text `#475569`, border `#CBD5E1`, primary `#1D4ED8`, primary hover `#1E40AF`. Verify contrast in the actual rendered combinations.
- Use one clean sans-serif family with a system fallback. Body/input text starts at 16px with approximately 1.5 line height; supporting text is at least 14px. Headings have a short, consistent scale; avoid oversized display text.
- Use a 4px spacing base; typical section gaps 24–48px, card padding 20–24px, control gaps 8–16px. Align content to a consistent grid.
- Use modest 8–12px corner radii and sparse, subtle shadows. Controls look related across public and owner screens.
- Motion: 100–180ms color/opacity transitions only where useful. Honor reduced-motion settings. Loading indicators should not shift the page layout.

## Homepage

Target business owners first. A concise headline explains a simple booking page; one short paragraph explains services, availability, and bookings. Primary CTA: **Create your booking page**. Keep **Login** plainly visible.

Show a small, accurate booking-page preview and at most three short explanations: set up services, share your link, manage bookings. Avoid invented testimonials, customer logos, metrics, pricing, feature comparisons, and oversized marketing sections.

Provide a secondary **Find a business** area with a labeled search input, brief “Search by business name” guidance, matching names, and clear empty/loading/error states. This is a lookup for people who know the business; do not turn it into a directory.

## Public booking — highest polish priority

On desktop, use a compact business summary beside a focused booking panel. On mobile, put a short summary above a single-column flow. Keep service, date/time, and contact steps visually clear; previous choices remain editable before submission.

1. **Service:** Show name and duration; single-choice controls make the selection obvious. No price or payment UI.
2. **Date and time:** Use an accessible date picker/calendar limited to the permitted local dates. Show times as large selectable buttons, with the business timezone beside the date/time section. Keep empty dates understandable and easy to change.
3. **Your details:** Require name and email with visible labels and appropriate autocomplete. Explain that details go to the business. Mention a booking confirmation email only when transactional email is enabled; when it is disabled, do not promise or imply that an email will be sent. Do not promise reminders.
4. **Review and confirm:** Show business, service/duration, full date, time, and timezone near **Confirm booking**. Avoid ambiguity from numeric-only dates or unlabeled timezones.
5. **Confirmation:** Always show a clear on-screen **Booking confirmed** result and the appointment summary/reference. Mention the customer confirmation email only when transactional email is enabled; when disabled, do not promise or imply that an email will follow. Do not add customer cancellation, rescheduling, calendar-sync, or notification controls.

Use progressive disclosure without unnecessary page transitions. Preserve choices when moving back. Keep loading, selection, errors, and confirmation in stable layouts. Never show an optimistic success screen.

| State | Presentation |
| --- | --- |
| Loading services/slots | Quiet skeleton or labeled loading indicator; only affected controls are unavailable. |
| No times on a date | Plain message and an immediately reachable date control; do not style this as a system failure. |
| Slot just taken | Explain that the time is no longer available, refresh choices, and retain contact details. |
| Network problem | Inline message with retry; keep form values and pending submission identity. |
| Form error | Specific text below the field, linked with `aria-describedby`; focus the first invalid field on submit. |
| Missing/unavailable business | Friendly explanation and a link back to the homepage lookup. |

## Owner experience

Use a compact sidebar on desktop: **Overview**, **Bookings**, **Services**, **Availability**, **Settings**. Put the business name and booking-link access in the shell; logout remains reachable. On phones, use an accessible collapsible navigation menu without hiding the page's main action.

- **Setup:** A short business form, then clear prompts to add a service and set weekly availability. Show progress through required setup; avoid a large onboarding wizard.
- **Overview:** Three simple counts, next upcoming booking, shareable link/copy action, and setup guidance when needed. No revenue charts or analytics expansion.
- **Services:** Simple rows/cards with name, duration, and active state; clear add/edit/deactivate actions. Explain that existing bookings remain unchanged.
- **Availability:** Seven weekday rows with open/closed controls and start/end fields. One explicit save action with visible result. No drag-to-paint calendar or multiple-window editor.
- **Bookings:** Readable desktop table, mobile cards; show customer, service, date/time/timezone, and status. Details reveal contact data and permitted status actions. Use a confirmation dialog for owner cancellation; explain that it releases the time and emails the customer when transactional email is enabled. Let the owner add an optional short message for that email.
- **Settings:** Business name, timezone, and stable booking URL. Explain the timezone lock when applicable. No teams, locations, billing, or integration placeholders.

Empty states explain the next useful action: add a service, open a weekday, or share the link. Destructive actions use plain labels; avoid icon-only controls for important tasks.

## Accessibility and responsive finish

- Use semantic controls, explicit labels, visible keyboard focus, logical tab order, and accessible names for copy/navigation controls.
- Date picker and time choices support keyboard navigation; expose selected/disabled states to assistive technology. Announce slot refresh, save errors, and booking confirmation politely.
- Modal focus is contained, Escape closes it, and closing restores focus. Never rely solely on color for selection, validation, or booking status.
- Meet AA contrast; ensure 44px touch targets and comfortable spacing between adjacent time choices. Verify at 200% zoom.
- At 360px, use one column and full-width inputs; avoid horizontal page scrolling. At 768px, adapt navigation and booking panels to available space. At 1280px, constrain content width rather than stretching forms.
- Check long business/service names, many services, empty/full dates, loading changes, and error text. Polish alignment and spacing across every state, not only the default screen.

## Design acceptance

Homepage clearly serves owners while keeping customer lookup easy to find. A customer can complete booking without an account, with no unclear timezones or hidden required fields. Owner pages have consistent hierarchy and controls. All flows remain usable on mobile and keyboard, with minimal motion and no out-of-scope promises.
