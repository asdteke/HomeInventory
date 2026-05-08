# HomeInventory v0 Master Prompt

```text
Design a complete modern redesign for HomeInventory using the existing GitHub repository as the source of truth.

This is a real product, not a concept app. The redesign must preserve the existing product structure, current features, and actual workflows already present in the repository.

Your job is to redesign the UI system and screen layouts, not to rewrite the product, simplify the feature set, or invent a different app.

Core instruction:
Treat the repository as locked product truth. Redesign the interface, not the product behavior.

Strict content rules:
- Do not rewrite product copy unless explicitly asked.
- Do not paraphrase headings.
- Do not replace CTA labels.
- Do not shorten feature descriptions.
- Do not invent new marketing messaging if text already exists in the repository.
- Use existing labels, helper text, headings, and feature wording from the repo wherever possible.
- If some text is missing, keep it minimal and neutral instead of inventing a new brand voice.

Strict brand rules:
- Use the existing HomeInventory logo assets from the repository as the official brand assets.
- Do not create a new logo.
- Do not replace the logo with a text wordmark.
- Do not simplify, redraw, restyle, or reinterpret the logo.
- Adapt the UI to the logo, not the other way around.

Strict product rules:
- Do not remove workflows.
- Do not collapse advanced functionality into fake simplified placeholders.
- Do not remove security-related UX.
- Do not remove multi-house, borrowing, vault, backup, admin, or account recovery flows.
- Keep the app implementation-friendly in React + Tailwind style.

Visual direction:
- modern
- clean
- calm
- warm neutral palette
- light premium
- refined and elegant
- trustworthy
- home-oriented
- organized
- practical, not flashy
- editorial but still product-focused
- subtle depth
- beautiful spacing
- premium hierarchy
- soft surfaces
- avoid generic SaaS dashboard aesthetics
- avoid purple-heavy styling
- avoid overly futuristic styling
- avoid excessive gradients
- avoid dark-only design bias

Design goals:
- make the UI feel intentionally designed
- improve hierarchy and clarity
- make dense product areas feel cleaner and easier to scan
- keep the interface rich without feeling cluttered
- create a cohesive system across landing, auth, dashboard, inventory, and settings
- desktop and mobile responsive

Use the repository as source of truth for these screens and flows:
- Landing page
- Login
- Register
- Forgot password
- Reset password
- Dashboard
- Inventory item list
- Add item
- Edit item
- Category management
- Room management
- Settings
- Personal Vault
- Borrow requests
- Main app shell / layout
- House access pending
- Google house select
- Recovery key setup
- Legal consent
- Admin panel

These existing product capabilities must remain represented in the new design:
- multi-house / household sharing
- item photos
- quantity management
- categories
- rooms
- locations
- barcode / QR flows
- public / private item states
- borrowing / lending / return status
- personal encrypted vault
- backup / restore
- account settings
- recovery key flow
- 2FA / authenticator flow
- multilingual product support
- admin access and management
- responsive mobile navigation

Design system requirements:
- create a cohesive UI system for cards, tables, forms, filters, badges, dialogs, tabs, navigation, empty states, and stat blocks
- use premium neutral colors with one strong accent and one softer secondary accent
- typography should feel polished and intentional
- spacing should feel generous and controlled
- buttons should feel refined and product-grade
- form layouts should be structured and easy to scan
- lists and dashboards should feel premium but highly usable
- use shadows and glass/layer effects sparingly and tastefully

Landing page requirements:
- redesign from scratch
- strong first impression
- modern editorial hero
- product-aware layout, not a generic SaaS hero
- feature storytelling
- trust and security emphasis
- clear CTA hierarchy
- preserve real product positioning from the repository

Dashboard requirements:
- feel powerful but calm
- strong information hierarchy
- beautiful stats
- recent items area
- category and room visibility
- quick actions where appropriate
- should feel like a real premium product dashboard

Inventory list requirements:
- excellent filtering UX
- polished grid/list presentation
- metadata should be easy to scan
- privacy state, room, category, quantity, and ownership should feel intentional
- action buttons should look elegant and practical

Settings and security requirements:
- make recovery key, 2FA, backup, house management, and account controls feel first-class
- emphasize trust, clarity, and safety

Auth requirements:
- login and register should feel premium and trustworthy
- preserve actual product copy and structure
- do not turn auth into generic marketing forms

Implementation guidance:
- generate implementation-friendly React + Tailwind style UI
- keep components realistic
- prefer layouts and styling that can map to the existing codebase
- do not output random filler content
- do not invent unrelated features

Primary instruction summary:
- preserve product behavior
- preserve copy
- preserve logo
- redesign the UI deeply
- make it feel modern, clean, premium, and clearly better than the current interface
```

