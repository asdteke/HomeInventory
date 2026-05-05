# HomeInventory Bolt Overnight Master Prompt

```text
You are working on an existing real-world application called HomeInventory.

This is NOT a blank project, NOT a prototype, and NOT a greenfield concept app.
Do NOT create a new app from scratch.
Do NOT replace the product with a simplified fake version.
Do NOT invent a different backend, data model, or generic SaaS structure.

Your mission is to redesign and improve the EXISTING HomeInventory frontend in a serious, production-minded way, using the repository as the source of truth.

You may take a long time, inspect deeply, and work iteratively, but the quality bar is high:
- preserve product behavior
- preserve feature depth
- preserve real workflows
- preserve existing copy unless explicitly asked otherwise
- preserve existing logo assets
- improve design, hierarchy, consistency, responsiveness, and polish

CORE OPERATING RULES

1. Treat the existing repository as locked product truth.
2. Redesign the interface, not the product logic.
3. Do not create a new standalone app structure.
4. Do not invent new fake backend endpoints.
5. Do not invent a new database or fake schema.
6. Do not remove advanced workflows.
7. Do not remove modals, states, or edge-case UX just because they are complex.
8. Do not rewrite product copy unless explicitly requested.
9. Do not paraphrase labels, CTA text, helper text, or headings if they already exist in the repository.
10. Do not redesign or replace the HomeInventory logo.
11. Use the existing brand/logo assets from the repository as official locked assets.
12. Work as a serious redesign layer on top of the current application.

DESIGN GOAL

Transform HomeInventory into a modern, clean, calm, light premium product UI that feels:
- refined
- trustworthy
- organized
- practical
- visually intentional
- less generic
- more editorial and product-grade
- elegant without being flashy

Avoid:
- generic SaaS dashboard templates
- excessive gradients everywhere
- purple-heavy palettes
- dark-mode-only thinking
- overdesigned futuristic gimmicks
- removing complexity by hiding important features

VISUAL DIRECTION

Use a design system with:
- warm neutral backgrounds
- restrained premium accent colors
- refined typography hierarchy
- consistent spacing rhythm
- polished cards and surfaces
- subtle, tasteful shadows
- occasional glass/layer effects only where appropriate
- strong desktop layout
- intentionally designed mobile layout
- elegant interactive states
- premium but practical forms

PRODUCT AREAS THAT MUST REMAIN REPRESENTED

The application already includes real functionality. The redesign must continue to support:
- multi-house / household sharing
- inventory items
- photos
- quantity
- categories
- rooms
- locations
- barcode / QR flows
- item privacy states
- borrowing / lending / returning
- personal encrypted vault
- backup / restore
- security
- 2FA / authenticator flow
- recovery key flow
- account settings
- house membership and access pending states
- admin panel / admin tools
- multilingual UI
- responsive mobile navigation

SCREENS / FLOWS TO COVER

You must work with the existing screens and preserve their meaning:
- Landing page
- Login
- Register
- Forgot password
- Reset password
- Main app shell / layout
- Dashboard
- Inventory item list
- Add item
- Edit item
- Category management
- Room management
- Settings
- Personal Vault
- Borrow requests page
- House access pending
- Google house select
- Recovery key setup
- Legal consent
- Admin panel

COPY LOCK

The repository already contains real copy and translations.
You must preserve the current wording wherever possible.

Rules:
- do not rewrite headings
- do not rewrite feature descriptions
- do not replace CTA labels
- do not change legal/security wording casually
- do not introduce new marketing slogans unless there is no existing copy
- if text is missing, stay minimal and neutral

BRAND LOCK

The repository contains existing HomeInventory logos.
Rules:
- use them as official assets
- do not replace them with a new wordmark
- do not restyle them
- do not invent a new logo system
- make the UI work with the existing logos

IMPLEMENTATION RULES

Work in a way that keeps the redesign usable for a real React + Tailwind app.
This means:
- implementation-friendly layout decisions
- reusable UI patterns
- realistic component structures
- maintainable styling choices
- no giant fake static mockups that cannot map back to the actual app

Do NOT stop at high-level ideas only.
Actually produce and refine the screens.

PROCESS YOU MUST FOLLOW

Follow this sequence carefully:

PHASE 1: INSPECT
- inspect the relevant existing files first
- understand actual structure, routes, states, and wording
- identify current shared layout and design patterns
- identify product complexity that must be preserved

PHASE 2: DEFINE
- establish a coherent design system foundation
- define typography, spacing, surface styles, accent usage, buttons, fields, cards, empty states, badges, navigation, and responsive behavior

PHASE 3: APPLY
- apply the system to the main app shell first
- then landing page
- then dashboard
- then inventory list and forms
- then auth screens
- then settings/security
- then the remaining complex flows

PHASE 4: VERIFY
- perform a strict review pass
- find screen-by-screen issues
- fix spacing, hierarchy, inconsistency, and responsiveness issues
- make sure no workflows were visually lost
- verify dark mode
- verify mobile layout
- verify copy consistency

DO NOT stop after “the design system is ready”.
DO NOT stop after “the main screens are updated”.
DO NOT stop after “verification started”.
Keep going until the redesign is actually polished.

IMPORTANT FILE FOCUS

Use the repository broadly, but prioritize understanding these areas first:
- app routing / main app shell
- translation / content source
- layout / navigation
- landing page
- dashboard
- inventory list
- auth screens
- settings
- logo assets

If you inspect more files, do it because they are needed to preserve real functionality, not because you want to rebuild the product from scratch.

EXPECTED OUTPUT STYLE

The result should feel like:
- a serious product redesign
- not a throwaway concept
- not a blank admin template
- not a dribbble-only experiment

The redesign should be:
- clearly better than the current UI
- cohesive across screens
- visually calm but premium
- functionally faithful to the existing app

FINAL INSTRUCTION

Work patiently and deeply.
Use the repo as the truth.
Preserve the product.
Improve the interface drastically.
Do not drift into fake simplification.
Do not stop early.
Polish until it feels like a real premium product redesign of HomeInventory.
```

