---
name: Technical Precision
colors:
  surface: '#10131a'
  surface-dim: '#10131a'
  surface-bright: '#363941'
  surface-container-lowest: '#0b0e15'
  surface-container-low: '#191b23'
  surface-container: '#1d2027'
  surface-container-high: '#272a31'
  surface-container-highest: '#32353c'
  on-surface: '#e1e2ec'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e1e2ec'
  inverse-on-surface: '#2e3038'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#b7c8e1'
  on-secondary: '#213145'
  secondary-container: '#3a4a5f'
  on-secondary-container: '#a9bad3'
  tertiary: '#ffb786'
  on-tertiary: '#502400'
  tertiary-container: '#df7412'
  on-tertiary-container: '#461f00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb786'
  on-tertiary-fixed: '#311400'
  on-tertiary-fixed-variant: '#723600'
  background: '#10131a'
  on-background: '#e1e2ec'
  surface-variant: '#32353c'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
  code-block:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  gutter: 16px
  margin: 24px
  sidebar-width: 260px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
The design system is engineered for developers, data scientists, and AI engineers. The brand personality is rooted in **Precision, Performance, and Transparency**. It avoids decorative flourishes in favor of high-information density and functional clarity.

The visual style is a hybrid of **Minimalism** and **Technical Utility**. It leverages deep charcoal surfaces to reduce eye strain during long-form coding and model monitoring sessions. The UI should evoke the feeling of a high-end IDE—efficient, modular, and robust. We prioritize clear visual hierarchies and immediate feedback loops through a strictly functional application of color and motion.

## Colors
The color palette is optimized for a dark-first environment.
- **Primary:** A vibrant blue used for primary actions, active states, and "processing" indicators.
- **Neutrals:** A scale of slate grays and deep charcoals. The background uses the darkest shade, while UI surfaces use slightly lighter tones to create perceived depth.
- **Semantic Accents:** These are strictly reserved for status communication. 
    - **Green (Ready):** Successful model deployment or training completion.
    - **Blue (Processing):** Active training, inference, or data transfer.
    - **Amber (Warning):** Resource throttling or non-critical configuration issues.
    - **Red (Error):** Runtime failures, hardware disconnects, or critical exceptions.

## Typography
The typography system uses a dual-font approach to distinguish between UI navigation and technical data.
- **Inter** is the primary sans-serif used for all structural UI elements, titles, and descriptive text. It provides high legibility and a modern, neutral tone.
- **JetBrains Mono** is utilized for any data that is machine-generated or requires exact character alignment. This includes Model IDs, checksums, file paths, code snippets, and telemetry values.

For mobile layouts, `headline-xl` should scale down to `28px` to ensure readability on narrower viewports.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a fixed sidebar for primary navigation.
- **Desktop:** A 12-column grid with a fixed 260px sidebar. Content areas use 16px gutters and 24px outer margins.
- **Sidebar:** Positioned on the left, containing model repositories, active kernels, and settings.
- **Rhythm:** All spacing is based on a 4px baseline. Use `stack-md` (16px) for standard grouping of elements within cards and `stack-sm` (8px) for related label-input pairs.
- **Density:** This design system supports high-density views. In data-heavy tables or resource monitors, reduce vertical padding to 4px–8px to maximize information visibility.

## Elevation & Depth
In this dark mode system, elevation is conveyed through **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows.
- **Level 0 (Background):** The base canvas (`#0F172A`).
- **Level 1 (Surface):** Cards, sidebars, and main containers. These use a subtle 1px border (`#334155`) to define boundaries against the background.
- **Level 2 (Overlay):** Popovers, dropdowns, and modals. These use a slightly lighter fill and a very soft, 15% opacity black shadow with a 12px blur to separate them from Level 1.
- **Active State:** Any interactive element in a "focused" or "selected" state receives a primary blue glow or 1px border to indicate prominence.

## Shapes
We use a **Soft (0.25rem)** shape language. This smaller radius maintains the "technical" and "precise" feel of the platform while avoiding the harshness of 0px corners.
- **Standard UI (Buttons, Inputs, Cards):** 4px (0.25rem) corner radius.
- **Large Containers (Modals):** 8px (0.5rem) corner radius.
- **Status Indicators (Pills):** Fully rounded (pill-shaped) to distinguish them from interactive buttons.

## Components
- **Cards:** Used as the primary container for model summaries. Includes a header with the Model ID (Monospace), a status badge (Pill), and a small sparkline graph for recent performance.
- **Buttons:**
    - *Primary:* Solid blue with white text.
    - *Secondary:* Ghost style with a slate-400 border.
    - *Icon-only:* Used for terminal controls (Play, Stop, Restart).
- **Progress Bars:** Sophisticated, thin bars (4px height) that use a pulse animation for "Processing" states. Labels for percentage should always be monospaced.
- **Resource Monitors:** Small, high-density line charts showing CPU/GPU/RAM usage. Use the primary blue for the stroke and a subtle gradient fill below the line.
- **Input Fields:** Dark background (`#0F172A`) with a 1px border. On focus, the border transitions to primary blue with a subtle outer glow.
- **Sidebar Navigation:** Minimalist icons paired with labels. The "Active" state is indicated by a vertical 2px blue bar on the left edge and a subtle background tint.
- **Code Editor:** Integrated monospaced editor with syntax highlighting tailored to the system's semantic color palette (Blues, Greens, and Ambers).