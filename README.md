# AeroBrief G650ER ✈️
### Executive Flight Deck NOTAM Analyzer & Operational Impact Decoder

**AeroBrief G650ER** is a purpose-built web application designed for executive aviation pilots flying the **Gulfstream G650ER (GLF6)**. It ingests departure, arrival, and alternate airport NOTAMs, evaluates validity windows in UTC against scheduled departure (ETD) and arrival (ETA) times, and decodes cryptic aeronautical messages into plain-English operational impacts specifically calibrated to the G650ER's performance envelope.

---

## 🛩️ Built Specifically for Gulfstream G650ER Operations

Unlike generic airline or general aviation tools, AeroBrief G650ER analyzes every NOTAM against the G650ER's exact aircraft characteristics:

| Parameter | G650ER Value | Operational Filter / Trigger |
| :--- | :--- | :--- |
| **Wingspan** | **99 ft 7 in (30.36 m)** | **ICAO Code D / FAA Group IV**. Flags any taxiway or airport restriction below 100 ft (e.g. Code C, 79 ft, 95 ft like Aspen KASE). |
| **MTOW** | **103,600 lbs (47,000 kg)** | Flags taxiway/ramp weight restrictions, pavement bearing capacity (PCN/ACN), and high-gross weight departures. |
| **Runway Length** | **Min 6,000 ft practical** | Flags runway closures, displaced thresholds, and declared distance reductions (TORA/LDA). Available length `< 5,000 ft` triggers an immediate **Critical No-Go Hazard**. |
| **Approach Category** | **Category C** (Vref 115-135 kt) | Checks Category C landing minimums, ILS Cat I/II/III outages, localizer/glidepath OTS, and RVR requirements. |
| **ARFF / RFFS** | **ICAO Cat 6 / FAA Index B** | Fuselage length 99 ft 9 in. Flags downgrades to Cat 4/5 which impact insurance and company OpsSpecs. |
| **Executive VIP Services** | Customs & FBO Handling | Flags Jet-A fuel shortages, Port of Entry (AOE) / Customs closures, mandatory PPR, and ramp parking slot constraints. |
| **Noise & Curfew** | Stage 4 / 14 Compliant | Flags night curfews, APU runtime limitations, and voluntary quiet hours (e.g. KTEB, LFMN, LSGG, KASE, KHPN). |

---

## 🕒 UTC Flight Window Time Filtering

A typical flight briefing contains dozens of NOTAMs that are only active during nighttime maintenance or days when your flight is not operating. AeroBrief filters them intelligently:

- **Zulu / UTC Flight Windows**: You specify your Departure Date/Time (UTC) and Arrival Date/Time (UTC).
- **Configurable Buffer**: Select `±1h`, `±2h (Standard)`, `±3h`, `±4h`, or `Show All`.
- **Field B, C & D Decoding**: Parses start times (`YYMMDDhhmm`), end times (`PERM`, `EST`), and Field D non-continuous schedules (e.g. `DAILY 2330-0530` or `MON-FRI 0800-1600`).
- **Clear Status Badges**:
  - `🟢 ACTIVE DURING FLIGHT`: Active during your ETD or ETA operational window.
  - `⚪ INACTIVE IN FLIGHT WINDOW`: Highlighted as inactive during your window so you aren't distracted by irrelevant maintenance closures.

---

## 🌐 100% Free Hosting (Zero Cost & No Specific Domain Name Required)

The application is built as a pure, zero-dependency, modern static Web App (HTML5, Tailwind CSS, ES Modules, Progressive Web App). It requires **no backend server**, **no subscription**, and **no paid domain name**.

### Option 1: GitHub Pages (Recommended - 100% Free Forever)
1. Initialize a git repository in this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of AeroBrief G650ER"
   ```
2. Create a free repository on [GitHub](https://github.com) (e.g. `aerobrief-g650er`).
3. Push your code:
   ```bash
   git remote add origin https://github.com/<YOUR-USERNAME>/aerobrief-g650er.git
   git branch -M main
   git push -u origin main
   ```
4. On GitHub, navigate to **Settings** ➔ **Pages** ➔ under **Branch**, select `main` and `/ (root)`, then click **Save**.
5. Your web app is live at: `https://<YOUR-USERNAME>.github.io/aerobrief-g650er/`

### Option 2: Cloudflare Pages (100% Free)
1. Go to [Cloudflare Pages](https://pages.cloudflare.com) (free account).
2. Connect your GitHub repository (or simply drag and drop this project directory into the Cloudflare dashboard).
3. Build command: None (leave blank), Output directory: `/` (root).
4. Click Deploy. Your site is globally deployed with instant edge CDN.

### Option 3: Netlify or Vercel (100% Free Tier)
- Connect this folder or Git repository. It deploys automatically in under 10 seconds.

### Option 4: Run Locally on your Mac or Offline in the Cockpit
Run this one command in your terminal:
```bash
python3 -m http.server 8080
```
Open `http://localhost:8080` in Safari, Chrome, or Edge.

---

## 📱 iPad / iPhone Cockpit PWA Installation (100% Offline)

AeroBrief G650ER includes a Service Worker and Web App Manifest:
1. Open the hosted URL (or local URL) in **Safari on your iPad or iPhone**.
2. Tap the **Share** button (box with an arrow pointing up).
3. Select **Add to Home Screen**.
4. The AeroBrief G650ER icon appears on your home screen and operates as a standalone application.
5. All assets are cached locally, allowing you to paste and decode NOTAMs in flight without internet access!

---

## 🎯 Pre-Loaded Executive Flight Presets

The app comes with 4 authentic, real-world executive flight mission profiles to test and demonstrate:
1. **Mission 1: Teterboro (KTEB) ➡️ London Stansted (EGSS)**:
   - Transatlantic executive mission. Demonstrates KTEB reduced runway declared distances (LDA 5,520 ft), Twy Z 79-ft wingspan limit, and EGSS ILS Cat II/III outage and UK Border Force customs schedule.
2. **Mission 2: Hong Kong (VHHH) ➡️ Los Angeles (KLAX)**:
   - Ultra-long-range (ULR) transpacific flight. Demonstrates VHHH runway 07L/25R closure, KLAX Twy E 95-ft wingspan limit, displaced threshold, and customs PPR.
3. **Mission 3: Palm Beach (KPBI) ➡️ Nice Côte d'Azur (LFMN)**:
   - VIP transatlantic mission. Demonstrates LFMN night runway closure, VIP apron COHOR slots / 2-hour max ground time for Code D, and ARFF category downgrade.
4. **Mission 4: Aspen (KASE) ➡️ White Plains (KHPN)**:
   - Mountain airport mission. Demonstrates Aspen's mandatory 95-ft wingspan restriction (G650ER NO-GO without waiver), 100,000 lb max weight limit, night curfews, and morning runway frost braking action advisory.

---

## 📋 File Architecture

- [`index.html`](file:///Users/marchetti/Documents/Antigravity/NOTAMs/index.html) - Main cockpit HUD user interface.
- [`styles.css`](file:///Users/marchetti/Documents/Antigravity/NOTAMs/styles.css) - Cockpit avionics dark theme, glow effects, and print stylesheet.
- [`notam-parser.js`](file:///Users/marchetti/Documents/Antigravity/NOTAMs/notam-parser.js) - ICAO Doc 8126 & FAA Order 7930.2 parser with UTC schedule math.
- [`g650er-rules.js`](file:///Users/marchetti/Documents/Antigravity/NOTAMs/g650er-rules.js) - Gulfstream G650ER specifications, operational limits, and impact engine.
- [`mock-briefings.js`](file:///Users/marchetti/Documents/Antigravity/NOTAMs/mock-briefings.js) - Pre-configured real-world mission presets.
- [`app.js`](file:///Users/marchetti/Documents/Antigravity/NOTAMs/app.js) - UI coordinator, live clock, filtering, search, and briefing generation.
- [`manifest.json`](file:///Users/marchetti/Documents/Antigravity/NOTAMs/manifest.json) - PWA manifest for iPad / iPhone installation.
- [`sw.js`](file:///Users/marchetti/Documents/Antigravity/NOTAMs/sw.js) - Service worker for 100% offline flight deck caching.

---

*Disclaimer: This software is an operational aid for situational awareness and briefing synthesis. Official flight operations must always be conducted in accordance with the official Gulfstream G650ER Airplane Flight Manual (AFM) and authoritative NOTAM sources.*
