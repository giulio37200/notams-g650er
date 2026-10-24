# AeroBrief G650ER ✈️
### Executive Flight Deck NOTAM Analyzer & Operational Impact Decoder

**AeroBrief G650ER** is a purpose-built web application designed for executive aviation pilots flying the **Gulfstream G650ER (GLF6)**. It ingests ForeFlight PDF flight packages, ICAO/FAA briefings, and text dumps, evaluates validity windows in UTC against scheduled departure (ETD) and arrival (ETA) times, and decodes cryptic aeronautical messages into plain-English operational impacts specifically calibrated to the G650ER's performance envelope.

---

## 🛩️ Built Specifically for Gulfstream G650ER Operations

Unlike generic airline or general aviation tools, AeroBrief G650ER analyzes every NOTAM against the G650ER's exact aircraft characteristics:

| Parameter | G650ER Value | Operational Filter / Trigger |
| :--- | :--- | :--- |
| **Wingspan** | **99 ft 7 in (30.36 m)** | **ICAO Code D / FAA Group IV**. Flags any taxiway or airport restriction below 100 ft (e.g. Code C, 79 ft, 95 ft like Aspen KASE). |
| **MTOW** | **103,600 lbs (47,000 kg)** | Evaluates pavement bearing strength (**PCR/PCN**), taxiway weight restrictions, and high-gross weight departures. |
| **Pavement Rating** | **PCR 560/F/A/X/T** | Evaluates ICAO Doc 9157 ACR/PCR ratings. Verifies Category X/W tire pressure (>1.75 MPa / 254 psi) compliance for G650ER 214 psi tires. |
| **Runway Length** | **Min 6,000 ft practical** | Flags runway closures, displaced thresholds, and declared distance reductions (TORA/LDA). Available length `< 5,000 ft` triggers an immediate **Critical No-Go Hazard**. |
| **Approach Category** | **Category C** (Vref 115-135 kt) | Checks Category C landing minimums, ILS Cat I/II/III outages, localizer/glidepath OTS, sequenced strobe flashers inop (`SEM FLASH`), and RVR requirements. |
| **ARFF / RFFS** | **ICAO Cat 6 / FAA Index B** | Fuselage length 99 ft 9 in. Flags downgrades to Cat 4/5 which impact insurance and company OpsSpecs. |
| **Airspace & Avionics** | GPS Spoofing, Drones & Balloons | Alerts on GPS/GNSS jamming/spoofing, low-altitude drone (RPA) areas, and free balloons (e.g. Barueri, Sorocaba, Luque). |
| **Executive VIP Services** | Customs & FBO Handling | Flags Jet-A fuel shortages, Port of Entry (AOE) / Customs closures, mandatory PPR, and ramp parking slot constraints. |
| **Noise & Curfew** | Stage 4 / 14 Compliant | Flags night curfews, APU runtime limitations, and voluntary quiet hours (e.g. KTEB, LFMN, LSGG, KASE, KHPN). |

---

## 📁 1-Click ForeFlight PDF Briefing Drag & Drop

You can drag and drop your **ForeFlight Flight Briefing PDF** (or text export) directly onto the app:
1. **Automatic Metadata Extraction**: Reads aircraft tail (`N650MV`), type (`GLF6`), route (`SBJH — SGAS`), flight date, and UTC departure/arrival times (`1400Z` ➔ `1527Z`).
2. **Weather & SIGMET Deck**: Automatically extracts and displays:
   - Station METARs with automated flight category pills (**VFR** 🟢, **MVFR** 🔵, **IFR** 🟡, **LIFR** 🔴), winds, ceilings, visibilities, and altimeters.
   - Active SIGMETs (e.g. Curitiba FIR Severe Icing FL140-210) with automatic G650ER anti-ice checklist alerts.
3. **Multi-Station Section Grouping**: Automatically organizes NOTAMs into:
   - 🛫 **Departure Station** (e.g. SBJH)
   - 🛬 **Destination Station** (e.g. SGAS)
   - 🔄 **En-Route Alternates** (e.g. SBLO, SBMG, SBFI, SGES)
   - 🌐 **En-Route FIRs** (e.g. SBCW, SGFA)
4. **100% Client-Side PDF Parsing**: Powered by PDF.js running entirely in your browser — zero file upload to external servers, maximum flight privacy, and $0 cost.

---

## 🕒 UTC Flight Window Time Filtering

A typical flight briefing contains dozens of NOTAMs that are only active during nighttime maintenance or days when your flight is not operating. AeroBrief filters them intelligently:

- **Zulu / UTC Flight Windows**: Automatically populated from your briefing or custom set.
- **Configurable Buffer**: Select `±1h`, `±2h (Standard)`, `±3h`, `±4h`, or `Show All`.
- **Field B, C & D Decoding**: Parses start times (`YYMMDDhhmm`), end times (`PERM`, `EST`), and Field D non-continuous schedules (e.g. `DAILY 0200-0900` or `DAILY 2330-0530`).
- **ForeFlight Tag Sync**: Respects ForeFlight tags like `[Inactive at ETD]`, `[Inactive at ETA]`, and `[Inactive during flight]`.
- **Visual Separation**:
  - `🟢 ACTIVE DURING FLIGHT`: Active during your ETD or ETA operational window.
  - `⚪ INACTIVE IN FLIGHT WINDOW`: Highlighted and dimmed so routine nighttime runway maintenance doesn't distract you during daytime flights.

---

## 📱 Executive Cockpit Features

- ☀️ **Direct Glare / Night Cockpit Modes**: One-click toggle between deep dark slate & amber (cockpit night flight deck) and ultra-high-contrast bright mode (reading on iPad under FL450 direct sun glare).
- 📋 **1-Click Share Summary (WhatsApp / Dispatch / iMessage)**: Generates a clean, executive pilot briefing ready to text to your co-pilot, dispatcher, or passengers:
  ```
  ✈️ GULFSTREAM G650ER FLIGHT BRIEFING: SBJH ➔ SGAS
  Aircraft: N650MV (GLF6) | ETD: 14:00Z | ETA: 15:27Z

  🌦️ WEATHER CONDITIONS:
  - SBJH: MVFR | 130°/9kt | Vis: ≥ 10 km | Cld: 1000 FT AGL
  - SGAS: VFR | 160°/5kt | Vis: CAVOK | Cld: Clear / CAVOK
  - ⚠️ SIGMET: SBCW FIR SEVERE ICING (FL140-210)

  🔴 CRITICAL OPERATIONAL HAZARDS:
  - None active during scheduled flight window

  🟡 CAUTION & AIRSPACE NOTICES:
  - [SBJH] Runway 12/30 closed daily 0200-0900Z (INACTIVE at 1400Z ETD: OPEN)
  - [SBLO] Pavement Bearing Strength (PCR 560/F/A/X/T) - G650ER Compliant
  - [SBMG] ALS RWY 10 operating without sequenced flashers
  - [SBFI] VOR/DME FOZ 112.100 OTS
  - [SBCW/SGFA] Low-altitude drone & balloon activity (Barueri & Luque)
  ```
- 🛬 **Runway Status Visualizer Strip**: Dynamic status pills for departure and destination runways confirming status at ETD/ETA.
- 🖨️ **Cockpit Kneeboard Print Preview**: Formatted for standard 5.5" × 8.5" kneeboard clipboards and iPad PDF export.

---

## 🌐 100% Free Hosting (GitHub Pages)

The app is deployed on **GitHub Pages**:
- Live Web App: **`https://giulio37200.github.io/notams-g650er/`**
- Repository: **`https://github.com/giulio37200/notams-g650er`**
- Automated CI/CD via `.github/workflows/deploy.yml` — pushes to `main` deploy instantly.
- Zero server maintenance, zero API fees, and 100% private.

---

## 📱 iPad / iPhone Cockpit PWA Installation (100% Offline)

1. Open `https://giulio37200.github.io/notams-g650er/` in **Safari on your iPad**.
2. Tap the **Share** button ➔ **Add to Home Screen**.
3. Launch from your home screen. The Service Worker caches all assets locally, allowing full PDF drag-and-drop and NOTAM analysis at FL450 without internet access.

---

*Disclaimer: This software is an operational aid for situational awareness and briefing synthesis. Official flight operations must always be conducted in accordance with the official Gulfstream G650ER Airplane Flight Manual (AFM) and authoritative NOTAM sources.*
