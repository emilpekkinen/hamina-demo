# Hamina design spec (for the RevOps forecasting demo)

Extracted on 2026-10-07 from the production sites. Unless a value is marked **(inferred)**, it is copied exactly from source CSS/JS.

Sources:
- **hamina.com** (marketing, HubSpot CMS, theme `@projects/hamina-2026`, Tailwind CSS v4.3.3):
  - `https://www.hamina.com/hubfs/raw_assets/309/public/@projects/hamina-2026/theme/styles/tailwind.css`
  - `https://www.hamina.com/hubfs/raw_assets/273/public/@projects/hamina-2026/theme/css/styles.css` (unlayered `:root` brand tokens that override Tailwind's default palette)
  - `https://rsms.me/inter/inter.css` (font)
  - Older pages (`/planner`, `blog.hamina.com`) still use `template_tailwind-2025.min.css` (Tailwind v3) with the same brand values (`indigo-500 = rgb(49 67 229)`, `gray-900 = rgb(27 27 29)`).
- **eu.hamina.com** (the product web app, a Vite/React SPA using styled-components plus Bootstrap 5 base CSS):
  - `/assets/index-*.css` (Bootstrap defaults and Roboto `@font-face`)
  - The app theme object in `/assets/useQuery-*.js`: `color`, `text`, `button` and `elevate` tokens. These are the best source for a dashboard because they come from Hamina's own product UI.

> Demo note: this spec is for a clearly labeled pitch demo. Keep a visible "Demo, not affiliated / prepared for Hamina Wireless" label in the app chrome.

---

## 1. Brand at a glance

- **One brand color: Hamina Blue `#3143E5`.** Logo mark, primary buttons, links, highlights, and the accent word in headlines (`text-blue-500`, for example "AI-powered tools for **great wireless**.").
- **Neutral, slightly cool-violet grays** (`#1B1B1D` to `#F9F9FA`). The page backgrounds are mostly white, with `#F9F9FA` and `#F0F0F1` alternate sections.
- **Product sub-brands** each have their own accent: Planner = blue `#3143E5`, Onsite (surveys) = violet `#6726F5`, Live = magenta `#BF40C3`.
- **Tone:** clean, Nordic, engineering-confident, with light humor (walrus mascot, "the hottest thing to come out of Finland, since the sauna", the 🎬 emoji on "Watch video"). Generous whitespace, bold tight headlines, muted gray body copy. Product visuals are Wi-Fi signal heatmaps on floor plans, 3D building views, and short looping product videos in rounded-2xl frames.
- **Dark moments:** the marketing site has a few full-bleed dark sections (Clip product promo `bg-black`, pricing comparison table `bg-gray-950`, quote summary panel). The product app itself is light.

---

## 2. Color tokens

### 2.1 Brand / primary (marketing `styles.css` indigo scale = `blue-*` in tailwind.css)
| Token | Hex | Role |
|---|---|---|
| indigo-50 | `#E8EAFC` | tint bg, badge bg (`bg-blue-50`), hover bg on outline buttons |
| indigo-100 | `#D6DAFA` | card border on active card (`border-indigo-100`), spinner track |
| indigo-200 | `#ADB5F5` | eyebrow text on dark (`text-blue-200`) |
| indigo-300 | `#858FF0` | column headers on dark table (`text-blue-300`) |
| indigo-400 | `#5C6AEA` | link on dark (`prose-a:text-blue-400`) |
| **indigo-500** | **`#3143E5`** | **primary** |
| indigo-600 | `#192BC7` | primary hover (marketing) |
| indigo-700 | `#132095` | pressed / deep |
| indigo-800 | `#0D1564` | — |
| indigo-900 | `#060B32` | — |

App primary states (exact, from the app theme): `primaryBrand #3143E5`, `primaryHover #1A2CCC`, `primaryActive #14229E`. Tints: `primaryBrand075 #6472EB`, `primaryBrand05 #98A1F2`, `primaryBrand025 #CBD0F8`, `primaryBrand01 #EAECFC`, `primaryBrandSubtle #E8EAFC`.
Marketing accent-button hover: `#1B2ED5`.

### 2.2 Neutrals (marketing `styles.css` `:root`, which overrides Tailwind's gray)
| Token | Hex | Role |
|---|---|---|
| gray-50 | `#F9F9FA` | alt section bg, footer bg (`.bg-gray`), form panels |
| gray-100 | `#F0F0F1` | inactive card bg, hover bg on ghost buttons, divider (`border-top-1`) |
| gray-200 | `#DCDDDF` | borders (= app `borderDefault`) |
| gray-300 | `#BDBEC1` | disabled text |
| gray-400 | `#9D9EA4` | muted text on dark, chevrons |
| gray-500 | `#85868E` | secondary body text (most-used text color on the homepage) |
| gray-600 | `#696A72` | body copy in feature sections |
| gray-700 | `#4E4F55` | `--color-text-secondary`, nav icons |
| gray-800 | `#36363A` | — |
| gray-900 | `#1B1B1D` | `--color-text-primary`, headings, tooltip bg |
| gray-950 | `#030712` | darkest section bg. This is Tailwind's default `gray-950` (`oklch(13% 0.028 261.692)`) because Hamina does not override it |
| black | `#000000` | Clip promo section bg |

Other semantic tokens from marketing: `--color-text-muted #898989`, `--color-border-light #DADADD`, `--color-border-gray #E5E5E8`, `--color-focus-ring rgb(59 130 246 / 0.5)`, `--color-error = red-500 #DF2664`.

App semantic text tokens: `textTitle #1B1B1D`, `textBody #4E4F55`, `text #525252`, `textSubtitle #85868E`, `textCaption #9D9EA4`, `subtleText #898989`, `dark #202427` (logo wordmark color as well), `subtleLight #DADADD`, `dimLight #E5E5E8`, `light #F0F0F1`, `grayBg #F9F9FA`, app top-bar border `#E0E3E5`.

### 2.3 Status and product accents (app theme, exact)
| Role | Base | 075 | 05 | 025 | 01 (bg tint) | hover / active |
|---|---|---|---|---|---|---|
| Error / negative | `#DF2664` | `#E75C8B` | `#EF93B2` | `#F7C9D8` | `#FDEAF0` | `#B61B4F` / `#89153C` (also `#C72259`) |
| Success / positive | `#349780` | `#66B1A0` | `#99CBBF` | `#CCE5DF` | `#EDF8F6` | — (success text `#07967E`) |
| Warning (orange) | `#E58F10` | `#F5B14D` | `#F9CB88` | `#F9E3C3` | `#FEF5E7` | — |
| Onsite / survey (violet) | `#6726F5` | — | — | `#D9C9FD` | `#F0E9FE` | marketing hover `#4E0AE0` |
| Live (magenta) | `#BF40C3` | — | — | `#EFCFF0` | `#F9ECF9` | marketing hover `#A334A7` |

Marketing red scale (`styles.css`): 50 `#FCE9EF`, 100 `#F8D3DF`, 200 `#F2A6BF`, 300 `#EC7EA3`, 400 `#E55283`, 500 `#DF2664`, 600 `#B61B4F`, 700 `#8A143B`, 800 `#590D26`, 900 `#2C0713`.

### 2.4 Gradients
- Gradient text: `bg-linear-to-r from-indigo-500 to-indigo-600 bg-clip-text text-transparent`, which is `#3143E5 → #192BC7`.
- Testimonial band: `bg-linear-to-b from-gray-100 via-gray-50 to-gray-100` (`#F0F0F1 → #F9F9FA → #F0F0F1`).
- "Why Hamina" / steps sections: a `#F0F0F1` repeating tile pattern (`pattern.svg`, masked at 64×32px) faded with inset shadows of `rgb(246,247,250)`.
- Live pulse dot: `rgba(92,106,234, .3→.8)` glow (= indigo-400).
- There are no big decorative mesh gradients. The color in the imagery comes from product screenshots and heatmaps.

### 2.5 Heatmap ramps (from the app, exact, useful for "health" visuals)
- **Signal (RSSI) ramp, worst → best:** `#C00000`, `#FF0000`, `#FF9000`, `#FFC000`, `#FFFF00`, `#92D050`, `#49C050`, `#00B050`, `#2A9943`, `#548235`
- **Score ramp (0-100, stepped):** 0-50 `#EF4444`, 50-70 `#F5A623`, 70-80 `#A8C13C`, 80-90 `#5BA84F`, 90-100 `#2E9E5B`

---

## 3. Typography

| Use | Family | Source | Notes |
|---|---|---|---|
| Marketing (headings and body) | **Inter** (`"Inter var"` when variation is supported) | `https://rsms.me/inter/inter.css` (rsms CDN) | Also free on Google Fonts as **Inter**. Use `next/font/google`. |
| Product app (eu.hamina.com) | **Roboto** variable 100-900 | self-hosted (fontsource woff2) | Also on Google Fonts. The app also declares a `font-family: Hamina` alias that points to Roboto at weight 500. |
| Mono | none used on the site | — | Tailwind default `ui-monospace, SFMono-Regular, Menlo…`. **(inferred)** For tabular figures use Inter with `font-variant-numeric: tabular-nums`, or `JetBrains Mono` if a mono font is needed. |

**Recommendation for the dashboard:** use Inter as the single family (it is the brand face on the public site) and enable `tabular-nums` for numbers. Use Roboto only if you want to mimic the in-app UI exactly.

Rendering: `text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased;`, with `b, strong { font-weight: 600 }`.

### Marketing type scale (Tailwind v4 defaults as used)
| Role | Classes | Size / line-height | Weight | Tracking |
|---|---|---|---|---|
| Hero H1 | `text-5xl sm:text-7xl font-bold tracking-tight` | 48px/1 → 72px/1 | 700 | -0.025em |
| Pricing H1 | `text-5xl font-bold leading-none tracking-tight text-blue-600` | 48px/1 | 700 | -0.025em |
| Section H2 | `text-3xl sm:text-4xl font-bold tracking-tight` | 30/36 → 36/40 | 700 | -0.025em |
| Sub-brand kicker under H2 | `text-base sm:text-lg font-medium tracking-wide` in accent color | 16-18px | 500 | +0.025em |
| Card title H3 | `text-lg font-semibold leading-tight` | 18px/1.25 | 600 | — |
| Lead paragraph | `text-lg sm:text-xl/8 text-gray-500` | 18 → 20/32 | 400 | — |
| Body | `text-sm`–`text-base text-gray-500/600` | 14–16px | 400 | — |
| Nav links | `text-sm font-medium leading-6 text-gray-900` | 14/24 | 500 | — |
| Eyebrow / step label | `text-xs font-semibold uppercase tracking-wider text-gray-600` | 12px | 600 | +0.05em |
| Tiny label on dark | `text-[11px] font-semibold uppercase tracking-wider text-blue-200` | 11px | 600 | +0.05em |
| Pill text | `text-[10px] font-medium` | 10px | 500 | — |

### App type scale (styled-components theme, all line-height 140% unless noted)
`header3 28px/900`, `header4 20px/900`, `body 16px/400 (strong 700)`, `small 14px/400 (strong 500)`, `tiny 12px/400 (strong 500)`, `tiny11 11px`, `tiny10 10px (lh 100%)`, `tiny9 9px`. App headers are **Black (900)**, which is noticeably heavier than marketing's 700.

---

## 4. Shape, elevation, spacing

**Radii** (Tailwind v4 defaults, as used):
- `rounded-md` 6px: buttons. The app also uses 6px for buttons and the Clerk auth card.
- `rounded-lg` 8px: tooltips, inner media, inputs on dark, app panels.
- `rounded-xl` 12px: cards (step cards, pricing rows).
- `rounded-2xl` 16px: media frames, feature images, quote panel, testimonial photos.
- `rounded-3xl` 24px: big dark promo container.
- `rounded-full`: pills, toggles, avatars, dots.
- Form inputs (HubSpot) use 3px. App color-swatch chips use 29px.

**Shadows**
- Marketing: Tailwind defaults. `shadow-sm` on buttons, `shadow-lg` on cards, `hover:shadow-xl`, and `shadow-lg/5` on the active segmented-toggle option.
  - `shadow-sm` = `0 1px 3px 0 rgb(0 0 0/.1), 0 1px 2px -1px rgb(0 0 0/.1)`
  - `shadow-lg` = `0 10px 15px -3px rgb(0 0 0/.1), 0 4px 6px -4px rgb(0 0 0/.1)`
- App elevation (exact, softer, preferred for dashboard cards):
  - `elevate_1`: `0 24px 24px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.04)` (modals, popovers)
  - `elevate_2`: `0 16px 16px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.04)`
  - `elevate_3`: `0 4px 16px rgba(0,0,0,.04), 0 3px 5px rgba(0,0,0,.04)` (cards, buttons)
  - `elevate_4`: `0 1px 2px rgba(0,0,0,.1)` (subtle)
  - `elevate_sm`: `0 1px 4px 0 rgba(78,79,85,.04), 0 8px 16px -4px rgba(78,79,85,.1)`

**Spacing rhythm:** Tailwind 4px base (`--spacing: .25rem`). Containers are `max-w-7xl` (1280px) with `px-6 lg:px-8`, and feature rows go up to `max-w-[1400px] px-8 md:px-16`. Sections use `py-16 sm:py-28` and `py-28 sm:py-32 lg:py-40`. Card padding is `p-6` (24px). Card grids use `gap-4` to `gap-8`. Nav padding is `p-6 lg:px-8`. App: the top bar is 44px tall and control heights are 24/32/40/48px.

**Motion:** 150ms `cubic-bezier(.4,0,.2,1)` for color changes. Scroll-reveal is `opacity 0 → 1` with `translateY(16–30px)`. The step carousel uses `duration-500 ease-in-out`.

---

## 5. Iconography and imagery

- **Icons:** Heroicons (outline, `stroke-width 1.5`, 24px; solid 20px chevrons in `text-gray-400`). The app uses filled 14–22px glyphs colored via `fill`. For the demo use `@heroicons/react` (24/outline) or `lucide-react` at stroke 1.5.
- **List bullets:** a blue right-arrow icon (`icon-arrow-right.svg`, 20px) in the accent color, plus a blue "badge-check" bullet (`#3143E5`) in form hero lists.
- **Feature tiles:** 44px (`h-11 w-11`) square `rounded-lg bg-gray-50` icon wells that turn `bg-indigo-100` on hover.
- **Imagery:** product videos and screenshots (heatmaps over floor plans, 3D buildings) framed `rounded-2xl`, plus headshots `rounded-2xl ring-2 ring-white shadow-lg` with colored status dots. There is a white walrus mascot (`walrus-white.svg`, used at 8% opacity as a watermark) and an "exploded" logo-mark graphic.
- **Loading:** spinner `rounded-full border-4 border-indigo-100 border-t-indigo-500`.

---

## 6. Logo

- Inline SVG in the header, `viewBox="0 0 104 26"`, rendered at **104px wide**. The mark (a segmented "shell/walrus-tooth" rosette) is filled `#3143E5`, and the "Hamina" wordmark is filled `#202427`.
- Files saved in `design/assets/`:
  - `hamina-logo.svg`: full logo (as on site)
  - `hamina-logo-white.svg`: wordmark recolored to `#FFFFFF` for dark backgrounds (derived; the mark stays blue)
  - `hamina-mark.svg`: mark only (derived, `viewBox 0 0 26 26`)
  - `favicon.ico`: app favicon from eu.hamina.com (multi-size, up to 256px)
  - `hamina-favicon-mark.jpeg`: marketing favicon (1200×1200 JPEG mark)
  - `walrus-white.svg`, `logo-explode.svg`, `pattern.svg`, `icon-arrow-right.svg`: supporting brand graphics
- Usage in the demo: put the logo top-left with a "Demo" pill next to it. Do not alter the mark.

---

## 7. Ready-to-paste CSS (Tailwind v4, `app/globals.css`)

```css
@import "tailwindcss";

/* ---------- Hamina tokens (light; exact unless marked inferred) ---------- */
:root {
  /* brand */
  --hm-primary: #3143e5;
  --hm-primary-hover: #1a2ccc;       /* app */
  --hm-primary-active: #14229e;      /* app */
  --hm-primary-075: #6472eb;
  --hm-primary-05: #98a1f2;
  --hm-primary-025: #cbd0f8;
  --hm-primary-01: #eaecfc;

  /* surfaces */
  --hm-bg: #ffffff;
  --hm-bg-subtle: #f9f9fa;           /* gray-50 / app grayBg */
  --hm-bg-muted: #f0f0f1;            /* gray-100 / app light */
  --hm-surface: #ffffff;

  /* text */
  --hm-text: #1b1b1d;                /* titles */
  --hm-text-body: #4e4f55;
  --hm-text-secondary: #696a72;
  --hm-text-muted: #85868e;
  --hm-text-caption: #9d9ea4;
  --hm-text-logo: #202427;

  /* borders */
  --hm-border: #dcdddf;              /* app borderDefault / gray-200 */
  --hm-border-light: #e5e5e8;
  --hm-border-subtle: #f0f0f1;

  /* status */
  --hm-success: #349780;  --hm-success-bg: #edf8f6;
  --hm-warning: #e58f10;  --hm-warning-bg: #fef5e7;
  --hm-error:   #df2664;  --hm-error-bg:   #fdeaf0;
  --hm-violet:  #6726f5;  --hm-violet-bg:  #f0e9fe;   /* Onsite */
  --hm-magenta: #bf40c3;  --hm-magenta-bg: #f9ecf9;   /* Live */

  /* elevation (app) */
  --hm-shadow-card: 0 4px 16px rgba(0,0,0,.04), 0 3px 5px rgba(0,0,0,.04);
  --hm-shadow-pop: 0 24px 24px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.04);
  --hm-shadow-sm: 0 1px 4px 0 rgba(78,79,85,.04), 0 8px 16px -4px rgba(78,79,85,.1);
  --hm-focus-ring: rgb(59 130 246 / 0.5);

  /* charts: categorical (app's own 6-colour set; order inferred) */
  --chart-1: #3143e5;   /* blue   - primary series */
  --chart-2: #e58f10;   /* orange */
  --chart-3: #349780;   /* teal-green */
  --chart-4: #df2664;   /* pink-red */
  --chart-5: #7a53f8;   /* violet */
  --chart-6: #bd47f5;   /* purple (use sparingly; close to chart-5) */
  --chart-neutral: #bdbec1;  /* "other" / prior period (gray-300) */

  /* charts: sequential (brand indigo scale) */
  --seq-1: #e8eafc; --seq-2: #d6dafa; --seq-3: #adb5f5; --seq-4: #858ff0;
  --seq-5: #5c6aea; --seq-6: #3143e5; --seq-7: #192bc7; --seq-8: #132095; --seq-9: #0d1564;
}

/* Dark variant: based on the site's own dark sections (pricing table, Clip promo).
   The product app has no dark mode, so these mappings are partly inferred. */
:root[data-theme="dark"] {
  --hm-bg: #030712;                  /* bg-gray-950 (pricing compare) */
  --hm-bg-subtle: #1b1b1d;           /* gray-900 */
  --hm-bg-muted: rgb(255 255 255 / 0.10);  /* bg-white/10 */
  --hm-surface: #1b1b1d;             /* inferred */
  --hm-text: #ffffff;
  --hm-text-body: #dcdddf;           /* inferred */
  --hm-text-secondary: #9d9ea4;      /* text-gray-400 on dark */
  --hm-text-muted: #85868e;
  --hm-border: rgb(255 255 255 / 0.20);    /* ring-white/20 */
  --hm-border-light: rgb(255 255 255 / 0.10);
  --hm-border-subtle: #36363a;       /* gray-800, inferred */
  --hm-primary-hover: #5c6aea;       /* inferred: lighter on dark */
  /* accent text on dark: #858ff0 (blue-300) headers, #adb5f5 (blue-200) eyebrows, #5c6aea (blue-400) links */
}

@theme inline {
  --font-sans: var(--font-inter), "Inter", ui-sans-serif, system-ui, sans-serif;
  --color-primary: var(--hm-primary);
  --color-primary-hover: var(--hm-primary-hover);
  --color-primary-soft: var(--hm-primary-01);
  --color-bg: var(--hm-bg);
  --color-bg-subtle: var(--hm-bg-subtle);
  --color-bg-muted: var(--hm-bg-muted);
  --color-surface: var(--hm-surface);
  --color-fg: var(--hm-text);
  --color-fg-body: var(--hm-text-body);
  --color-fg-muted: var(--hm-text-muted);
  --color-line: var(--hm-border);
  --color-line-light: var(--hm-border-light);
  --color-success: var(--hm-success);
  --color-warning: var(--hm-warning);
  --color-error: var(--hm-error);
  --shadow-card: var(--hm-shadow-card);
  --shadow-pop: var(--hm-shadow-pop);
}

@theme {
  /* Hamina's neutral + indigo scales (override Tailwind defaults, as the site does) */
  --color-gray-50: #f9f9fa;  --color-gray-100: #f0f0f1; --color-gray-200: #dcdddf;
  --color-gray-300: #bdbec1; --color-gray-400: #9d9ea4; --color-gray-500: #85868e;
  --color-gray-600: #696a72; --color-gray-700: #4e4f55; --color-gray-800: #36363a;
  --color-gray-900: #1b1b1d; --color-gray-950: #030712;
  --color-indigo-50: #e8eafc;  --color-indigo-100: #d6dafa; --color-indigo-200: #adb5f5;
  --color-indigo-300: #858ff0; --color-indigo-400: #5c6aea; --color-indigo-500: #3143e5;
  --color-indigo-600: #192bc7; --color-indigo-700: #132095; --color-indigo-800: #0d1564;
  --color-indigo-900: #060b32;
  --color-blue-50: #e8eafc;  --color-blue-100: #d6dafa; --color-blue-200: #adb5f5;
  --color-blue-300: #858ff0; --color-blue-400: #5c6aea; --color-blue-500: #3143e5;
  --color-blue-600: #192bc7; --color-blue-700: #132095;
}

html { text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; }
body { background: var(--hm-bg); color: var(--hm-text); font-family: var(--font-sans); }
b, strong { font-weight: 600; }
.tabular { font-variant-numeric: tabular-nums; }
```


### Font loading (Next.js App Router)
```ts
// app/layout.tsx
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// <html lang="en" className={inter.variable}> ...
// Optional app-faithful alternative: import { Roboto } from "next/font/google" (weights 400/500/700/900)
```

---

## 8. Component guidance

### Top nav (from the marketing header)
- `header.bg-white` with an inner `nav.mx-auto.max-w-7xl.flex.items-center.justify-between.p-6.lg:px-8` (in the dashboard, reduce this to `h-14 px-6` with a `border-b border-gray-100`. The app top bar is 44px tall with a `#E0E3E5` bottom border).
- Left: logo, 104px wide. Center: links `text-sm font-medium leading-6 text-gray-900`, `gap-x-12` on marketing (use `gap-x-6` in the app), hover `text-blue-500`. Dropdown chevron `h-5 w-5 text-gray-400`.
- Right: ghost "Log in" (`rounded-md px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100`) and primary "Sign up" (`rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-600`).
- Active tab **(inferred, app-consistent)**: `text-indigo-500` with a 2px `#3143E5` underline, or the app "toggle" button style (`bg-[#EAECFC] text-[#202427]`).

### Buttons
| Variant | Classes / values |
|---|---|
| Primary | `inline-flex items-center rounded-md bg-indigo-500 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600`. App: bg `#3143E5`, hover `#1A2CCC`, active `#14229E`, radius 6px, weight 500 |
| Secondary (outline) | `rounded-md border border-indigo-500 text-indigo-500 px-4 py-3 font-medium hover:bg-[#1B2ED5] hover:text-white` (homepage "Learn more"), or `ring-1 ring-indigo-500 text-indigo-500 hover:bg-indigo-100` (planner page) |
| Tertiary (app) | bg `#F0F0F1`, text `#202427`, hover bg `#E5E5E8` |
| Flat / ghost | bg white or transparent, text `#202427`/`gray-900`, hover bg `#F0F0F1` |
| Danger (app) | bg `#DF2664`, hover `#B61B4F`, active `#89153C`; soft danger: bg `#FDEAF0` text `#DF2664` |
| On dark | primary `bg-blue-500`; secondary `ring-1 ring-white/30 text-white hover:bg-white/10`; small `bg-white/10 ring-1 ring-inset ring-white/20 text-xs rounded-md px-2.5 py-1.5` |
| Sizes (app) | lg 48px/16px, md 40px/14px, sm 32px/12px, xs 24px/11px; icon gap 4–6px; disabled = opacity .5 |

### KPI stat cards
- Container: `rounded-xl border border-gray-100 bg-white p-6 shadow-[var(--hm-shadow-card)]` (the border and radius come from the pricing rows; the shadow is app `elevate_3`). Hover: `hover:shadow-xs` / `elevate_sm`.
- Label: `text-xs font-semibold uppercase tracking-wider text-gray-500` (the eyebrow pattern).
- Value: `text-3xl font-bold tracking-tight text-gray-900 tabular-nums` (30px/700). To match the app's heavier header style use `font-black` (900).
- Delta: a pill (see Badges) in success `#349780`/`#EDF8F6` or error `#DF2664`/`#FDEAF0`, plus a muted comparator `text-sm text-gray-500` ("vs. last quarter").
- Optional sparkline in `--chart-1` with a 10% `#3143E5` area fill **(inferred)**.
- Highlighted/selected card: `border-indigo-100 bg-white shadow-lg`. Inactive siblings use `bg-[#F0F0F1] border-transparent` (homepage step cards).

### Data tables
- Light (dashboard default, **inferred** from the site tokens): wrapper `rounded-xl border border-gray-200 bg-white overflow-hidden`. Header row `bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500`, cells `px-4 py-3 text-sm text-gray-700`, row dividers `border-t border-gray-100`, row hover `bg-gray-50`, numbers `text-right tabular-nums text-gray-900 font-medium`.
- Sticky header as on the pricing comparison table: `sticky top-0 backdrop-blur-sm bg-white/80`. The site's dark version uses `bg-gray-950/50 border-b border-white/10`, with column titles `text-sm font-medium text-blue-300`, values `text-sm font-semibold text-white`, and units `text-xs text-gray-400`.
- Segmented control above the table (exact, from pricing): `inline-flex rounded-full border border-gray-100 bg-gray-100 p-0.5`. Options use `rounded-full px-3 py-2 text-[13px] font-semibold text-gray-500`. The active option uses `bg-white text-gray-900 border border-gray-100 shadow-lg/5`.

### Badges / pills
- Brand pill (exact): `rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-500`, e.g. "best value". For the dashboard, scale it up to `px-2 py-0.5 text-xs`.
- Status pills: bg `*-01` + text base color. Success `#EDF8F6`/`#349780`, warning `#FEF5E7`/`#E58F10` (use `#B5720D` for text contrast; that shade exists in the app chunk), error `#FDEAF0`/`#DF2664`, neutral `#F0F0F1`/`#4E4F55`, product (Onsite `#F0E9FE`/`#6726F5`, Live `#F9ECF9`/`#BF40C3`).
- Numbered step chip (exact): `flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-900`.
- Status dot (exact): `h-3 w-3 rounded-full border-2 border-white` in a status color.
- "DEMO" label **(inferred)**: `rounded-full bg-[#FEF5E7] text-[#B5720D] text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5`.

### Section headers
- Page title: `text-3xl sm:text-4xl font-bold tracking-tight text-gray-900`, optionally with one highlighted word in `text-blue-500` (the site's signature pattern: "Steps to Wi-Fi **design** and **deployment**").
- Kicker/subtitle: `mt-3 text-base sm:text-lg text-gray-500`.
- In-page section header (dashboard): an eyebrow `text-xs font-semibold uppercase tracking-wider text-gray-600` (optionally with a numbered chip), then an H2 `text-xl font-semibold text-gray-900`, then actions aligned right.
- Product-colored kicker: `text-base font-medium tracking-wide` in an accent hex (Planner `#3143E5`, Onsite `#6726F5`, Live `#BF40C3`). You can reuse this to tag forecast segments by product line.

### Charts
- **Categorical (6):** `#3143E5`, `#E58F10`, `#349780`, `#DF2664`, `#7A53F8`, `#BD47F5`. This is the app's own confetti color set (exact); the ordering for maximum separation is inferred. Use `#BDBEC1` for "other", prior period, or target lines. For product-line charts use Planner `#3143E5`, Onsite `#6726F5`, Live `#BF40C3`, Clip/hardware `#E58F10` (the Clip mapping is inferred).
- **Sequential:** indigo `#E8EAFC → #D6DAFA → #ADB5F5 → #858FF0 → #5C6AEA → #3143E5 → #192BC7 → #132095 → #0D1564`.
- **Diverging (inferred from tokens):** `#DF2664 · #EF93B2 · #F0F0F1 · #98A1F2 · #3143E5` (miss ↔ beat).
- **Health / heatmap:** use the exact score ramp from §2.5 (`#EF4444 / #F5A623 / #A8C13C / #5BA84F / #2E9E5B`). This makes a nice on-brand nod for a pipeline-health or territory-coverage heatmap.
- Chart chrome **(inferred)**: gridlines `#F0F0F1`, axis labels `12px #85868E`, tooltip `rounded-lg bg-gray-900 px-4 py-2 text-xs text-white shadow-lg` (exact homepage tooltip style).

### Cards / panels (general)
- Standard: `rounded-xl border border-gray-100 bg-white p-6`. Feature/media: `rounded-2xl overflow-hidden`. Image overlay ring: `ring-1 ring-inset ring-gray-900/10` (blog).
- Dark summary panel (pricing quote): `rounded-2xl border-2 border-gray-900 bg-gray-950 p-6 text-white`, title `text-[11px] font-semibold uppercase tracking-wider text-blue-200`, body `text-xs text-gray-400`, inputs `bg-gray-900 border-gray-700 rounded-lg`. This works well for a "Forecast summary" sidebar.
- Forms: labels `14px/500 #4E4F55`; inputs white with a `#DADADD` border and 8px radius in the app (3px on HubSpot forms); focus `border-color: #3143E5; box-shadow: 0 0 0 2px #3143E520`.

---

## 9. hamina.com vs eu.hamina.com

| | hamina.com | eu.hamina.com |
|---|---|---|
| What it is | Marketing site (HubSpot CMS + React islands) | The **product web app** (EU data region, `haminaEnv: prod-eu1`). The homepage is a JS-only SPA shell titled "Hamina" with login via Clerk. There is no separate EU marketing site. |
| Styling | Tailwind v4 utilities + `styles.css` brand tokens | styled-components theme + Bootstrap 5.x base CSS (Bootstrap's default `#0d6efd` palette is present but overridden by the theme) |
| Font | Inter (rsms CDN) | Roboto variable, self-hosted (plus a "Hamina" alias = Roboto 500) |
| Headings | 700, tracking-tight, 30–72px | 900 (Black), 20/28px, line-height 140% |
| Primary | `#3143E5`, hover `#192BC7` / `#1B2ED5` | `#3143E5`, hover `#1A2CCC`, active `#14229E` |
| Neutrals | identical gray scale | same values, with semantic names (`textTitle`, `textBody`, `subtleText`…) |
| Shadows | Tailwind `shadow-sm/lg/xl` (10% black) | very soft 4% double shadows (`elevate_1..4`) |
| Theme color meta | — | `#000000` (manifest bg `#FFFFFF`) |
| Dark mode | a few dark marketing sections | none (light UI) |

**Takeaway for the dashboard:** follow the **app** (eu.hamina.com) for density, elevation, button states and status colors, and the **marketing site** for typography (Inter), heading style and the blue-accent-word headline pattern.
