# Demo Login CTA Visual Hierarchy Design

## Goal

Make the public Demo entry on the login page immediately noticeable while keeping it in its current position after the configured formal sign-in controls. The selected direction is option D from the visual review: a confident, solid primary CTA with concise benefit information inside the control.

## Interaction and Layout

- Keep `DemoLoginButton` in its existing document position. Do not move it above Google, self-hosted, or other formal sign-in controls.
- Preserve the existing form submission, pending state, error display, disabled behavior, and server action.
- Keep the button full width and touch-safe. Increase its internal height only as needed for two lines of copy.
- Use a leading circular play icon to distinguish trying the product from signing into an account.

## Visual Treatment

- Change the Demo CTA from an outline button to a darker, schema-aware primary surface derived from the existing color tokens. Use fully opaque contrasting text and verify every supported light/dark color schema reaches at least `4.5:1` for both text lines.
- Use a restrained primary-colored shadow for separation from the login card. Do not add gradients, glow, decorative animation, or a surrounding nested card.
- Left-align the two-line copy group while keeping the complete icon-and-copy group visually centered inside the button.
- The first line remains the existing localized action label.
- Add a short localized metadata line communicating no sign-up and the isolated 24-hour workspace.
- Keep the existing explanatory copy below the button and the error message below that.
- The pending state keeps the spinner and clearly communicates preparation without causing layout shift.
- Focus-visible, hover, active, disabled, dark-mode, and reduced-motion behavior must continue to follow the shared Button component and existing tokens.

## Internationalization and Accessibility

- Supply English and Traditional Chinese metadata strings through the existing `demo.login` translation namespace.
- Do not hard-code user-facing text in the component.
- Keep one accessible button name based on the primary action label; decorative iconography is hidden from assistive technology.
- Verify with computed rendered colors that the CTA surface and both text lines reach at least `4.5:1` in every supported light and dark color schema.

## Component Scope

The change stays within the shared `DemoLoginButton` presentation and its translation messages. Both `start` and `restart` variants retain their current action labels and receive the same stronger CTA treatment so the component remains visually consistent wherever it appears. No authentication, Demo lifecycle, quota, database, environment-variable, or routing behavior changes.

## Verification

- Add or update a focused component/contract test first, and confirm it fails because the selected D treatment is absent.
- Verify the test passes after implementation and covers the solid primary variant, two-line localized copy, icon accessibility, pending state, and both action-label variants where the existing test harness permits.
- Run the focused test suite, typecheck, lint, formatting check, and diff check.
- Render the login page at desktop and mobile widths in light and dark themes, checking visual hierarchy, no overflow in English or Traditional Chinese, keyboard focus, and disabled/pending presentation.
- Confirm the Demo control remains in the same page position relative to formal sign-in controls.
