# HomeInventory Bolt.new Master Prompt

```text
Redesign the existing HomeInventory application using the current repository as the source of truth.

This is a real production-style app with many existing features. Do not turn it into a simplified concept app. Do not replace the product with a generic dashboard template.

Your job:
- modernize the UI deeply
- improve hierarchy, spacing, responsiveness, and visual quality
- keep the existing product behavior and workflows
- preserve the current feature depth
- keep the output implementation-friendly

Primary instruction:
Treat the repository as locked product truth. Redesign the interface, not the product logic.

Hard constraints:
- Do not remove workflows
- Do not remove feature areas
- Do not rewrite product copy unless explicitly asked
- Do not paraphrase headings, CTA labels, helper text, or feature wording when it already exists in the repo
- Do not invent a new logo
- Do not replace the existing HomeInventory logos
- Do not simplify away security, backup, vault, admin, multi-house, or recovery flows

Brand lock:
- Use the existing HomeInventory logo assets from the repository as the official brand assets
- Do not redesign the logo
- Do not replace it with text-only branding
- Build the UI system around the current brand assets

Visual direction:
- modern
- clean
- light premium
- warm neutral palette
- refined and elegant
- calm and trustworthy
- home-oriented and organized
- practical, not flashy
- polished product UI, not generic SaaS
- subtle depth
- carefully controlled shadows
- tasteful layering
- avoid purple-heavy styling
- avoid excessive gradients
- avoid dark-mode-only visual thinking

Design goals:
- make the product feel more premium and intentional
- improve the information hierarchy across all screens
- make dense product surfaces feel calmer and easier to scan
- keep the app feature-rich without feeling messy
- make mobile feel designed, not collapsed desktop

Repository source-of-truth screens:
- Landing page
- Login
- Register
- Forgot password
- Reset password
- Main authenticated app shell / layout
- Dashboard
- Inventory item list
- Add item
- Edit item
- Category management
- Room management
- Settings
- Personal Vault
- Borrow requests
- Recovery key setup
- House access pending
- Google house select
- Legal consent
- Admin panel

Existing product areas that must remain represented:
- multi-house / household sharing
- item photos
- quantity
- categories
- rooms
- locations
- barcode / QR flows
- public / private item state
- borrowing / lending / return status
- personal encrypted vault
- backup / restore
- account settings
- security / 2FA / authenticator
- recovery key flow
- multilingual support
- admin management
- responsive navigation

Design system expectations:
- create a cohesive UI system for navigation, cards, tables, forms, filters, badges, tabs, dialogs, modals, empty states, and stat blocks
- use premium neutral colors with one strong accent and one softer secondary accent
- typography should feel intentional and polished
- spacing should be generous and structured
- cards should feel elegant and product-grade
- forms should feel clean and well grouped
- dashboards and list pages should remain highly usable

Landing page expectations:
- redesign from scratch
- make it visually strong and clearly modern
- avoid generic SaaS hero patterns
- include trust, organization, and product depth
- preserve the actual product meaning from the repository
- use the existing brand/logo assets

Dashboard expectations:
- calm but powerful
- beautiful stats
- strong hierarchy
- recent items
- quick actions where useful
- category and room visibility
- should feel premium and believable

Inventory expectations:
- elegant filtering UX
- strong scanability
- polished card/list presentation
- practical actions
- privacy state, category, room, quantity, and ownership should read clearly

Settings and security expectations:
- make trust and control feel central
- backup, recovery key, 2FA, and house management must feel first-class

Auth expectations:
- premium and trustworthy
- not generic
- preserve the current product copy and flow

Implementation instructions:
- generate code in a React + Tailwind-friendly style
- keep it realistic for integration into an existing app
- prefer reusable sections and components
- do not produce fake filler features
- do not replace real repo content with lorem ipsum

Summary:
- preserve product logic
- preserve feature coverage
- preserve existing copy
- preserve logo assets
- redesign the UI deeply
- make it feel modern, clean, refined, and clearly improved
```

