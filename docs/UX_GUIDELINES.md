# UX Guidelines

Conventions for the `apps/auth` admin dashboard and sign-in flows. Follow these when adding or changing UI so the experience stays consistent. All UI is Next.js + React + Tailwind, with icons from `lucide-react`.

## Destructive actions

**Do not use `window.confirm()` or any other browser dialog.** Confirmations must be inline, in the same row or card as the action that triggered them.

### Inline row-confirmation pattern

State: hold the id of the row currently asking for confirmation, plus (optionally) the id of the row whose request is in flight.

```ts
confirmingDeleteUserId: string | null;
deletingUserId: string | null;
```

Flow:

- First click (trash icon) → set `confirmingDeleteUserId`. No request yet.
- Second click ("Delete") → run the mutation. Track in-flight state on `deletingUserId` and show a spinner on the confirm button.
- "Cancel" or successful completion clears `confirmingDeleteUserId`.

While a row is in the confirming state, hide the other action buttons for that row so there is only one decision to make. See [apps/auth/src/app/(admin)/dashboard/users/page.tsx](../apps/auth/src/app/(admin)/dashboard/users/page.tsx) for the reference implementation.

```tsx
{confirmingDeleteUserId === user.id ? (
  <>
    <span className="text-xs text-red-200">Delete {label}?</span>
    <button
      type="button"
      onClick={() => confirmDelete(user)}
      disabled={deletingUserId === user.id}
      className="inline-flex items-center gap-1 rounded-full border border-red-800 bg-red-950/50 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-900/60 disabled:opacity-50"
    >
      {deletingUserId === user.id
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <Check className="h-3.5 w-3.5" />}
      Delete
    </button>
    <button
      type="button"
      onClick={cancelDelete}
      disabled={deletingUserId === user.id}
      className="inline-flex items-center gap-1 rounded-full border border-brand-muted px-3 py-1 text-xs hover:bg-brand-muted/30 disabled:opacity-50"
    >
      <X className="h-3.5 w-3.5" />
      Cancel
    </button>
  </>
) : (
  /* regular action buttons including the trash icon */
)}
```

For full-page destructive actions (e.g. deleting the current client from its detail page), use the same logic but render the confirmation as an inline card/banner above the action area rather than a modal.

## Buttons

| Variant | Usage | Classes |
|---|---|---|
| Primary | The main call-to-action on a form or page. | `rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-50` |
| Secondary / ghost | Neutral actions, dismissals, tertiary options. | `rounded-full border border-brand-muted px-4 py-2 text-sm font-medium hover:bg-brand-muted/30 disabled:opacity-50` |
| Destructive confirm | The "yes, do it" button in a confirmation. | `rounded-full border border-red-800 bg-red-950/50 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-900/60` |
| Icon-only | Per-row actions (edit, trash). Always include `aria-label`. | `rounded-full p-1.5 text-muted-foreground hover:bg-brand-muted/30 hover:text-foreground` (destructive icon: swap to `hover:bg-red-950/50 hover:text-red-200`) |

All buttons are pill-shaped (`rounded-full`). Never use sharp-cornered buttons.

## Banners

Error and success messages appear as inline banners inside the section they relate to, not as toasts or modals.

```tsx
// error
<p className="mb-3 rounded-xl bg-red-950/50 px-3 py-2 text-sm text-red-200">{message}</p>
// success
<p className="mb-3 rounded-xl bg-green-950/50 px-3 py-2 text-sm text-green-200">{message}</p>
```

Clear the message when the user starts a new attempt at the same action so stale errors do not linger.

## Cards and sections

Wrap related controls in a card:

```tsx
<section className="rounded-xl border border-brand-muted p-6">
  <h2 className="mb-4 flex items-center gap-2 text-lg font-medium">
    <Icon className="h-5 w-5" />
    {title}
  </h2>
  {children}
</section>
```

Cards use `rounded-xl` (not `rounded-full`). Every card heading takes a leading `lucide-react` icon at `h-5 w-5`.

## Forms

- Labels: `mb-1 block text-sm text-muted-foreground`.
- Inputs: `w-full rounded-xl border border-brand-muted bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50`.
- Read-only fields: keep the same input classes and add `readOnly disabled`. Do not hide them; show them disabled so the user sees the value.
- Two-column layouts: `grid gap-4 sm:grid-cols-2`. Collapse to one column on mobile.

## Loading states

- Use `<Loader2 className="h-4 w-4 animate-spin" />` (size adjusted to context) for in-flight feedback.
- Full-page loaders center the spinner: `flex min-h-screen items-center justify-center p-6`.
- Button loading: keep the button mounted, swap its icon to `Loader2`, and disable it. Do not replace the button with a bare spinner.
- Track per-row loading with an id field (`uploadingAvatarUserId`, `deletingUserId`, etc.), not a boolean, so concurrent actions on different rows remain independent.

## Icons

Icons come from `lucide-react`. Match the established vocabulary:

| Concept | Icon |
|---|---|
| User / profile | `UserCircle` |
| Edit | `Pencil` |
| Delete | `Trash2` |
| Confirm / done | `Check` |
| Cancel / dismiss | `X` |
| Loading | `Loader2` with `animate-spin` |
| Upload | `Upload` |
| Passkey / biometric | `Fingerprint` |
| Verified | `BadgeCheck` (green) |
| Not verified | `BadgeX` (amber) |
| Reset / retry | `RotateCcw` |
| Password | `Lock` |
| Image placeholder | `ImageIcon` |

Inline icons in flow text: `h-3.5 w-3.5`. Row action icons: `h-4 w-4`. Section-heading icons: `h-5 w-5`. Avatars / large affordances: `h-6 w-6` or larger.

## Colors

Prefer semantic tokens over raw Tailwind colors where they exist:

- Backgrounds: `bg-background`.
- Text: `text-foreground`, `text-muted-foreground`.
- Accents: `border-brand`, `border-brand-muted`, `bg-brand`, `bg-brand-muted`.
- Destructive: the `red-800 / red-900 / red-950 / red-200` ramp.
- Success: the `green-950 / green-300 / green-400` ramp.

Do not introduce new color ramps without a strong reason.

## State management

Complex pages use a reducer via `@eetr/react-reducer-utils` with a typed action enum and a flat state shape. When you add a new interaction:

1. Add an action to the enum.
2. Add the field to the state interface and `initialState`.
3. Add the reducer case.
4. Destructure the field in the component.

For simple pages (single form, no cross-cutting state), plain `useState` is fine.

## Server actions

User-facing mutations run through server actions (`"use server"` files in [apps/auth/src/app/actions/](../apps/auth/src/app/actions/)) wrapped with `onServerAction`. Call them from client components; do not hit API routes directly from admin UI unless there is a reason (e.g. `fetch` with a file upload).

## What to avoid

- `window.confirm`, `window.alert`, `window.prompt`.
- Toast libraries or modal overlay libraries — inline banners and inline confirmations cover our needs.
- New third-party UI component libraries. Tailwind + `lucide-react` is the stack.
- Emojis in UI copy.
- Sharp-cornered buttons, hard borders without `-muted`, bright primary colors outside the brand tokens.
