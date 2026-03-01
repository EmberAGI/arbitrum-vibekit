---
inclusion: always
---


# UI Color Palette Preference

## Overview

**MANDATORY**: Prefer non-purple as the primary UI color. Use purple only as a secondary/accent.

### Palette Priorities

- Primary (preferred): blue, teal, cyan, green, neutral/gray
- Secondary: orange, amber, slate
- Accent only (low priority): purple/violet/fuchsia

### Common Patterns

```css
:root {
  /* Good: primary not purple */
  --color-primary: #0ea5e9;   /* blue-500 */
  --color-secondary: #a855f7; /* violet-500 (accent) */
}

/* Bad: purple as primary */
:root {
  --color-primary: #8b5cf6; /* violet-500 */
}
```

```tsx
// Good (React/Tailwind example)
<button className="bg-sky-600 hover:bg-sky-700 text-white">Action</button>

// Bad
<button className="bg-purple-600 hover:bg-purple-700 text-white">Action</button>
```

### Additional Guidelines

- Do not set purple as the default brand color or primary theme token
- Purple may be used for highlights, badges, or low-emphasis accents
- Prefer accessible contrast: meet WCAG AA at minimum for text and UI controls
- If brand guidelines mandate purple as primary, explicitly note the exception in the PR

### Rationale

This ensures consistent visual identity aligned with the requested preference while allowing purple as a tasteful accent when needed.
