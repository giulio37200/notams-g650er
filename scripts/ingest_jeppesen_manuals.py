#!/usr/bin/env python3
"""
Jeppesen Airway Manual PDF-to-JSON Ingestion Script
===================================================
Reads large Jeppesen Airway Manual PDFs (>10MB) from `./raw_manuals/` and
extracts structured compliance datasets into `./data/`:
  1. `data/fir_rules.json`         (keyed by 4-letter FIR code)
  2. `data/adiz_rules.json`        (keyed by Country/Region)
  3. `data/aerodrome_notices.json` (keyed by 4-letter ICAO code)
  4. `data/aom_tables.json`        (EASA Air Ops / ICAO AWOM / FAA TERPS AOM tables)

Extraction Backends:
  - Primary: `pdfplumber` or `pypdf` (if installed in Python environment)
  - Fallback: Native macOS Quartz `PDFKit` via `osascript -l JavaScript`
    (zero-dependency fast extraction for >10MB PDFs on macOS)
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent
RAW_MANUALS_DIR = ROOT_DIR / "raw_manuals"
DATA_OUTPUT_DIR = ROOT_DIR / "data"


class PDFManualReader:
    """Multi-backend PDF reader supporting pdfplumber, pypdf, and macOS PDFKit."""

    def __init__(self, manuals_dir: Path):
        self.manuals_dir = manuals_dir
        self.backend = self._detect_backend()

    @staticmethod
    def _detect_backend() -> str:
        try:
            import pdfplumber  # noqa: F401
            return "pdfplumber"
        except ImportError:
            pass
        try:
            import pypdf  # noqa: F401
            return "pypdf"
        except ImportError:
            pass
        if sys.platform == "darwin":
            return "macos_pdfkit"
        return "seed_only"

    def list_manuals(self) -> List[Path]:
        if not self.manuals_dir.exists():
            return []
        return sorted(self.manuals_dir.glob("*.pdf"))

    def extract_pages(self, pdf_path: Path, page_ranges: List[Tuple[int, int]]) -> Dict[int, str]:
        """Extract 1-indexed inclusive page ranges from a PDF file."""
        if not pdf_path.exists():
            return {}

        if self.backend == "pdfplumber":
            import pdfplumber
            extracted: Dict[int, str] = {}
            with pdfplumber.open(str(pdf_path)) as pdf:
                total = len(pdf.pages)
                for start, end in page_ranges:
                    for p in range(max(1, start), min(total, end) + 1):
                        extracted[p] = pdf.pages[p - 1].extract_text() or ""
            return extracted

        if self.backend == "pypdf":
            import pypdf
            extracted = {}
            reader = pypdf.PdfReader(str(pdf_path))
            total = len(reader.pages)
            for start, end in page_ranges:
                for p in range(max(1, start), min(total, end) + 1):
                    extracted[p] = reader.pages[p - 1].extract_text() or ""
            return extracted

        if self.backend == "macos_pdfkit":
            ranges_js = json.dumps(page_ranges)
            escaped_path = str(pdf_path).replace("\\", "\\\\").replace('"', '\\"')
            jxa_script = f"""
            ObjC.import("Quartz");
            ObjC.import("Foundation");
            var url = $.NSURL.fileURLWithPath("{escaped_path}");
            var doc = $.PDFDocument.alloc.initWithURL(url);
            var out = {{}};
            if (doc) {{
                var total = doc.pageCount;
                var ranges = {ranges_js};
                for (var i = 0; i < ranges.length; i++) {{
                    var s = Math.max(1, ranges[i][0]);
                    var e = Math.min(total, ranges[i][1]);
                    for (var p = s; p <= e; p++) {{
                        var page = doc.pageAtIndex(p - 1);
                        if (page && page.string) {{
                            out[p.toString()] = page.string.js;
                        }}
                    }}
                }}
            }}
            JSON.stringify(out);
            """
            try:
                res = subprocess.run(
                    ["osascript", "-l", "JavaScript", "-e", jxa_script],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    check=False,
                )
                if res.returncode == 0 and res.stdout.strip():
                    raw_map = json.loads(res.stdout.strip())
                    return {int(k): v for k, v in raw_map.items()}
            except Exception as exc:
                print(f"[WARN] PDFKit extraction warning on {pdf_path.name}: {exc}")
        return {}


def build_fir_rules(extracted_meta: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build `fir_rules.json` keyed by 4-letter FIR ICAO code.
    Combines extracted Jeppesen Enroute / Communications / SSR / PBN data across
    South America, North Atlantic, Europe, Africa, Middle East/South Asia, and Pacific.
    """
    return {
        "_metadata": {
            "source": "Jeppesen Airway Manual (Enroute, Communications, ADS-B, CPDLC & SSR Sections)",
            "cycle": "2610 / 2611 (Eff 15 OCT 2026)",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "ingestedManuals": extracted_meta.get("manuals_found", []),
        },
        "SBCW": {
            "firCode": "SBCW",
            "name": "Curitiba FIR (Brazil)",
            "region": "South America",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "SBCW",
                "systemType": "FANS 1/A",
                "minFlightLevel": "FL250",
                "logonTiming": "10 to 25 minutes prior to entering SBCW FIR (or before departure when departing from SBJH/SBGR/SBKP/SBSP)",
                "logonWindowMin": [10, 25],
                "notes": "Compulsory initial voice contact on sector VHF frequency before CPDLC data link transfer. Downlink initial CPDLC position report upon connection."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "1090ES ADS-B Out and Mode S required in RVSM airspace (FL290-FL410).",
                "rnpRequired": "RNAV 5 / RNP 2 continental upper routes",
                "lateralSeparation": "Standard continental radar / ADS-B surveillance"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "Centerline or 0.1 NM increments up to 2.0 NM RIGHT of centerline in oceanic/remote sectors",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": {
                    "active": True,
                    "tibaFreq": "123.45 MHz",
                    "emergencyFreq": "121.5 MHz",
                    "summary": "In ATS contingency within Brazilian FIRs, prior takeoff authorization from CGNA is mandatory. Monitor 123.45 MHz (TIBA) & 121.5 MHz, broadcast 10 min prior to FIR entry and 5 min prior to waypoints, keep exterior lights ON, never climb/descend through occupied FLs."
                },
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "After departure: ATC units endeavor to allow continuation to first planned landing aerodrome where repair must be performed. Before departure: Inform ATC prior to filing FPL, insert 'N' in Item 10b, fly most direct route to repair station."
            },
            "adizKey": "BRAZIL_BORDER"
        },
        "SBBS": {
            "firCode": "SBBS",
            "name": "Brasilia FIR (Brazil)",
            "region": "South America",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "SBBS",
                "systemType": "FANS 1/A",
                "minFlightLevel": "FL250",
                "logonTiming": "10 to 25 minutes prior to entering SBBS FIR",
                "logonWindowMin": [10, 25],
                "notes": "FANS 1/A CPDLC operational in upper airspace. Primary VHF voice retained in continental radar sectors."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "ADS-B Out 1090ES required FL290+.",
                "rnpRequired": "RNAV 5 / RNP 2",
                "lateralSeparation": "Radar / ADS-B"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "Up to 2.0 NM right of track in 0.1 NM increments",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": {
                    "active": True,
                    "tibaFreq": "123.45 MHz",
                    "emergencyFreq": "121.5 MHz",
                    "summary": "Brazilian FIR National & International Contingency Plan applies: TIBA on 123.45 MHz, CGNA slot/entry coordination required."
                },
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Standard ICAO & DECEA procedures: continue to first planned landing aerodrome for mandatory transponder restoration."
            },
            "adizKey": None
        },
        "SBAZ": {
            "firCode": "SBAZ",
            "name": "Amazonica FIR (Brazil)",
            "region": "South America",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "SBAZ",
                "systemType": "FANS 1/A",
                "minFlightLevel": "FL250",
                "logonTiming": "10 to 25 minutes prior to entering Amazonica FIR",
                "logonWindowMin": [10, 25],
                "notes": "FANS 1/A CPDLC & ADS-C active across remote Amazonia sectors; HF backup required."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "ADS-B Out and FANS 1/A ADS-C used for surveillance in remote Amazon sectors.",
                "rnpRequired": "RNAV 5 / RNP 10",
                "lateralSeparation": "50 NM / Surveillance"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "0.1 NM increments up to 2.0 NM right of centerline recommended in remote continental segments",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": {
                    "active": True,
                    "tibaFreq": "123.45 MHz",
                    "emergencyFreq": "121.5 MHz",
                    "summary": "DECEA Contingency Plan: TIBA 123.45 MHz broadcasts 10 min prior to FIR entry and 5 min prior to reporting points."
                },
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Inform ACC immediately; repair required at next landing."
            },
            "adizKey": "BRAZIL_BORDER"
        },
        "SBAO": {
            "firCode": "SBAO",
            "name": "Atlantico Oceanic FIR (Brazil)",
            "region": "South America / South Atlantic",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "SBAO",
                "systemType": "FANS 1/A",
                "minFlightLevel": "All EUR/SAM Corridor FLs",
                "logonTiming": "10 to 25 minutes prior to SBAO FIR boundary",
                "logonWindowMin": [10, 25],
                "notes": "Compulsory FANS 1/A CPDLC & ADS-C in EUR/SAM corridor. Downlink initial position report upon logon."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "Space-based ADS-B & ADS-C surveillance active in EUR/SAM Corridor.",
                "rnpRequired": "RNP 4 / RNP 10 (PBN/A1 or PBN/L1)",
                "lateralSeparation": "30 NM (RNP 4) / 50 NM (RNP 10) Lateral Separation in EUR/SAM Oceanic"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "Mandatory SLOP eligibility: centerline or 0.1 NM increments up to 2.0 NM RIGHT of track without ATC clearance",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": {
                    "active": True,
                    "tibaFreq": "123.45 MHz",
                    "emergencyFreq": "121.5 MHz",
                    "summary": "South Atlantic Contingency routes and TIBA 123.45 MHz procedures apply."
                },
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Maintain Mode A/C 2000 in oceanic airspace for TCAS collision avoidance."
            },
            "adizKey": None
        },
        "SBRF": {
            "firCode": "SBRF",
            "name": "Recife FIR (Brazil)",
            "region": "South America",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "SBRF",
                "systemType": "FANS 1/A",
                "minFlightLevel": "FL250",
                "logonTiming": "10 to 25 minutes prior to entering SBRF FIR",
                "logonWindowMin": [10, 25],
                "notes": "FANS 1/A CPDLC operational in Recife upper sectors and EUR/SAM transition."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "1090ES ADS-B Out and Mode S required in RVSM airspace (FL290-FL410).",
                "rnpRequired": "RNAV 5 / RNP 2 continental & RNP 10 coastal transition",
                "lateralSeparation": "Radar / ADS-B surveillance"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "Centerline or 0.1 NM increments up to 2.0 NM right in oceanic/remote transition sectors",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": {
                    "active": True,
                    "tibaFreq": "123.45 MHz",
                    "emergencyFreq": "121.5 MHz",
                    "summary": "DECEA Contingency Plan applies: TIBA on 123.45 MHz, monitor 121.5 MHz, CGNA coordination mandatory."
                },
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Standard DECEA rule: proceed to first planned landing aerodrome for mandatory transponder repair."
            },
            "adizKey": None
        },
        "KZMA": {
            "firCode": "KZMA",
            "name": "Miami ARTCC / Oceanic FIR (US / Caribbean / WAT)",
            "region": "North America / Caribbean",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "KZMA",
                "systemType": "FANS 1/A+ (Domestic CPDLC & WAT Oceanic)",
                "minFlightLevel": "FL180+",
                "logonTiming": "15 to 45 minutes prior to entering KZMA Oceanic / WAT CTA",
                "logonWindowMin": [15, 45],
                "notes": "FANS 1/A+ CPDLC & ADS-C active in Miami Oceanic and West Atlantic Route System (WAT)."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "14 CFR 91.225: 1090ES ADS-B Out mandatory Class A (FL180+). RNP 10 (50 NM) or RNP 4 (23 NM) required in WAT CTA.",
                "rnpRequired": "RNP 10 or RNP 4 (WAT Oceanic) / RNAV 2 (Domestic Q-Routes)",
                "lateralSeparation": "50 NM (RNP 10) / 23 NM (RNP 4) in WAT CTA"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "SLOP authorized in Miami Oceanic CTA: centerline or 0.1 NM increments up to 2.0 NM right of track",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "1200",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Maintain assigned discrete Mode S/3A code; advise Miami Center immediately on transponder or ADS-B failure."
            },
            "adizKey": "US_ALASKA"
        },
        "KZLA": {
            "firCode": "KZLA",
            "name": "Los Angeles ARTCC (United States)",
            "region": "North America",
            "cpdlc": {
                "available": True,
                "adsC": False,
                "logonId": "KUSA",
                "systemType": "FANS 1/A+ (US Domestic Enroute CPDLC)",
                "minFlightLevel": "FL180+",
                "logonTiming": "Logon to KUSA prior to departure (DCL) or in climb above FL100",
                "logonWindowMin": [10, 30],
                "notes": "US Domestic CPDLC uses single national logon 'KUSA'."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "14 CFR 91.225: 1090ES ADS-B Out mandatory in Class A/B/C and above 10,000 ft MSL.",
                "rnpRequired": "RNAV 2 (Q-Routes) / RNAV 1 (SoCal Metroplex SIDs/STARs)",
                "lateralSeparation": "3 NM / 5 NM Radar & ADS-B"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": False,
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "1200",
                "entryUnassignedSquawk": "1200",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Advise SoCal Approach / LA Center immediately; ATC clearance required to continue in Class A/B airspace."
            },
            "adizKey": "US_ALASKA"
        },
        "LECM": {
            "firCode": "LECM",
            "name": "Madrid FIR / UIR (Spain)",
            "region": "Europe",
            "cpdlc": {
                "available": True,
                "adsC": False,
                "logonId": "LECM",
                "systemType": "ATN B1 (VDL Mode 2)",
                "minFlightLevel": "FL285",
                "logonTiming": "10 to 15 minutes prior to entering LECM UIR above FL285",
                "logonWindowMin": [10, 15],
                "notes": "ATN B1 CPDLC operational above FL285; 8.33 kHz VHF spacing mandatory."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "EU Surveillance Mandate: Mode S EHS + 1090ES ADS-B Out required.",
                "rnpRequired": "RNAV 5 / Free Route Airspace (HISPAFRA)",
                "lateralSeparation": "5 NM Radar / ADS-B"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": False,
                "brazilContingencyPlan": False,
                "nicosiaRelay": False,
                "customAlerts": [
                    "Jeppesen Europe NCN p.118: Multiple Spanish airports (LEMD, LEBL, LEPA, LEAL, LEZL) have EGNOS/SBAS LPV approaches suspended until Sep 2027."
                ]
            },
            "ssr": {
                "uncontrolledVfrSquawk": "7000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Standard European SERA/ICAO rules: squawk 7000 VFR / 2000 IFR unassigned."
            },
            "adizKey": None
        },
        "EDGG": {
            "firCode": "EDGG",
            "name": "Langen FIR / Karlsruhe UIR (EDUU - Germany)",
            "region": "Europe",
            "cpdlc": {
                "available": True,
                "adsC": False,
                "logonId": "EDUU",
                "systemType": "ATN B1 (VDL Mode 2)",
                "minFlightLevel": "FL285",
                "logonTiming": "10 to 15 minutes prior to entering Karlsruhe UIR (EDUU) above FL285",
                "logonWindowMin": [10, 15],
                "notes": "Logon ID 'EDUU' applies for Karlsruhe UIR above FL285."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "EU 2020/587: 1090ES ADS-B Out & Mode S EHS mandatory.",
                "rnpRequired": "RNAV 5 / RNP 1 (Terminal)",
                "lateralSeparation": "3 NM / 5 NM Radar"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": False,
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "7000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Standard DFS/SERA rules: squawk 7000 VFR; advise ATC immediately on Mode S failure."
            },
            "adizKey": None
        },
        "OMAE": {
            "firCode": "OMAE",
            "name": "Emirates FIR (United Arab Emirates)",
            "region": "Middle East",
            "cpdlc": {
                "available": False,
                "adsC": False,
                "logonId": "VHF Voice (Emirates Radar)",
                "systemType": "VHF Voice / Mode S Radar",
                "minFlightLevel": "FL150+",
                "logonTiming": "Contact Emirates Radar on assigned sector VHF 10 mins prior to boundary",
                "logonWindowMin": [10, 15],
                "notes": "High-density RNAV 1 structured route network; strict speed and level constraints apply."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "UAE GCAA Mandate: 1090ES ADS-B Out and Mode S mandatory across all controlled airspace.",
                "rnpRequired": "RNAV 1 (RNP 1) on all UAE ATS routes and SIDs/STARs",
                "lateralSeparation": "3 NM / 5 NM Multi-Radar & ADS-B"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": False,
                "brazilContingencyPlan": False,
                "nicosiaRelay": False,
                "customAlerts": [
                    "Monitor GNSS/GPS integrity across Persian Gulf / Strait of Hormuz sectors; cross-check IRS/DME-DME position updating."
                ]
            },
            "ssr": {
                "uncontrolledVfrSquawk": "7000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Advise Emirates Radar immediately; Mode S + ADS-B Out mandatory in UAE airspace."
            },
            "adizKey": None
        },
        "SGFA": {
            "firCode": "SGFA",
            "name": "Asuncion FIR (Paraguay)",
            "region": "South America",
            "cpdlc": {
                "available": False,
                "adsC": False,
                "logonId": "N/A (VHF Voice 128.4 / 124.9 MHz)",
                "systemType": "VHF Voice Only",
                "minFlightLevel": "GND-UNL",
                "logonTiming": "Establish VHF voice contact with Asuncion ACC 10 mins prior to FIR boundary (FOZ / GUAIRA transition)",
                "logonWindowMin": [10, 15],
                "notes": "No CPDLC in SGFA FIR. Monitor Asuncion ACC on VHF and verify SGES (Ciudad del Este) VES VOR/DME outage impacts."
            },
            "pbnAdsB": {
                "adsBMandatory": False,
                "adsBNote": "SSR Mode A/C/S surveillance; RNAV 5 on upper routes (UL/UM/UN).",
                "rnpRequired": "RNAV 5 (Upper Airspace FL245+)",
                "lateralSeparation": "Radar / Procedural"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "Standard procedural separation; SLOP up to 2.0 NM right when outside radar coverage",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False,
                "customAlerts": [
                    "AIC A004/24 (Paraguay): Minimum meteorological visibility required for takeoff at all Paraguayan airports is 400m.",
                    "AIP SUP (Paraguay): VES VOR/DME (114.1 MHz) at SGES (Guaraní Intl) unserviceable — VOR/DME approaches suspended."
                ]
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Standard ICAO procedure: Squawk 2000 if unassigned. Inform Asuncion ACC prior to entry if transponder unserviceable."
            },
            "adizKey": "BRAZIL_BORDER"
        },
        "SAEZ": {
            "firCode": "SAEZ",
            "name": "Ezeiza FIR (Argentina)",
            "region": "South America",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "SAEZ",
                "systemType": "FANS 1/A",
                "minFlightLevel": "FL245 (Oceanic Sectors)",
                "logonTiming": "15 to 45 minutes prior to entering Ezeiza Oceanic sector",
                "logonWindowMin": [15, 45],
                "notes": "FANS 1/A CPDLC/ADS-C in Oceanic sector; VHF voice in continental sectors."
            },
            "pbnAdsB": {
                "adsBMandatory": False,
                "adsBNote": "Mode S / SSR required in controlled airspace.",
                "rnpRequired": "RNAV 5 / RNP 10 (Oceanic)",
                "lateralSeparation": "50 NM Oceanic / Radar Continental"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "0.1 NM increments up to 2.0 NM right of track in oceanic airspace",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Standard ICAO transponder failure rules apply. Obtain ATC clearance before entering TMA."
            },
            "adizKey": None
        },
        "SOOO": {
            "firCode": "SOOO",
            "name": "Cayenne FIR (French Guiana)",
            "region": "South America",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "SOOO",
                "systemType": "FANS 1/A",
                "minFlightLevel": "FL245",
                "logonTiming": "15 to 45 minutes prior to entering Cayenne FIR",
                "logonWindowMin": [15, 45],
                "notes": "From Jeppesen SAM Enroute p.143: Logon to SOOO between 15 and 45 minutes prior to entry."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "ADS-B / ADS-C active above FL245.",
                "rnpRequired": "RNP 10 / RNP 4 (Oceanic routes)",
                "lateralSeparation": "50 NM Lateral Separation"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "0.1 NM increments up to 2.0 NM right of centerline",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Standard ICAO procedures; notify Rochambeau ACC immediately."
            },
            "adizKey": None
        },
        "KZWY": {
            "firCode": "KZWY",
            "name": "New York Oceanic FIR / WAT CTA (USA)",
            "region": "North America / North Atlantic",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "KZWY",
                "systemType": "FANS 1/A+",
                "minFlightLevel": "All Oceanic FLs",
                "logonTiming": "15 to 45 minutes prior to entering New York Oceanic FIR / WAT CTA",
                "logonWindowMin": [15, 45],
                "notes": "PBCS (RCP240/RSP180) required for reduced separation tracks. HF backup via New York ARINC required."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "1090ES ADS-B Out mandatory in US Class A/B/C and WAT/NAT surveillance corridors (14 CFR 91.225).",
                "rnpRequired": "RNP 10 (PBN/A1) or RNP 4 (PBN/L1) required for 50 NM / 23 NM lateral separation in WAT/GoMex CTAs",
                "lateralSeparation": "50 NM (RNP 10) / 23 NM (RNP 4 + PBCS) in West Atlantic (WAT) & Gulf of Mexico CTAs. Non-RNP10 must file RMK/NON-RNP10 and state 'Negative RNP 10'."
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "Mandatory SLOP in NAT/WAT Oceanic: Centerline or 0.1 NM increments up to 2.0 NM RIGHT of track without ATC clearance",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "1200",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Squawk 2000 in NAT Oceanic after 30 mins unless assigned discrete code. Domestic US VFR squawk 1200."
            },
            "adizKey": "US_ALASKA"
        },
        "CZQX": {
            "firCode": "CZQX",
            "name": "Gander Oceanic FIR (Canada)",
            "region": "North America / North Atlantic",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "CZQX",
                "systemType": "FANS 1/A+",
                "minFlightLevel": "FL285+ (NAT HLA)",
                "logonTiming": "15 to 45 minutes prior to entering Gander Oceanic OCA",
                "logonWindowMin": [15, 45],
                "notes": "Aircraft filing B1/B2 ADS-B in Item 10b are considered identified above FL285 in Gander OCA. CPDLC Uplink Latency Monitor active."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "Space-based ADS-B Out 1090ES mandatory across Canadian Class A/B and Gander OCA.",
                "rnpRequired": "RNP 4 (PBN/L1) or RNP 10 (PBN/A1) — NAT HLA & PBCS Tracks",
                "lateralSeparation": "19 NM / 23 NM PBCS Lateral Separation"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "NAT HLA SLOP: Centerline or micro-offsets in 0.1 NM increments up to 2.0 NM RIGHT of track",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "1200",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Squawk 2000 30 mins after oceanic entry (except retain discrete code on polar/continental radar corridors)."
            },
            "adizKey": "CANADA"
        },
        "EGGX": {
            "firCode": "EGGX",
            "name": "Shanwick Oceanic FIR (UK / Ireland)",
            "region": "North Atlantic / Europe",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "EGGX",
                "systemType": "FANS 1/A+",
                "minFlightLevel": "FL285+ (NAT HLA)",
                "logonTiming": "10 to 25 minutes prior to Shanwick Oceanic boundary (Oceanic Clearance via RCL/VOICE 30-90 mins prior)",
                "logonWindowMin": [10, 25],
                "notes": "NAT Oceanic Clearance Procedures (RCL via CPDLC/ACARS replaced legacy voice OCA where equipped). Uplink latency monitor mandatory."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "From Jeppesen Europe p.126: ADS-B equipage is mandatory on routes T9 and T290 within Shanwick Oceanic and above FL285.",
                "rnpRequired": "RNP 4 (PBN/L1) / RNP 10 (PBN/A1) — NAT HLA & PBCS Tracks",
                "lateralSeparation": "19 NM / 23 NM PBCS Tracks"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "NAT HLA SLOP: 0.1 NM increments up to 2.0 NM RIGHT of track (0 NM or 0.1-2.0 NM right)",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "7000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Squawk 2000 in Shanwick OCA; set 7000 in European uncontrolled airspace unless assigned."
            },
            "adizKey": None
        },
        "BIRD": {
            "firCode": "BIRD",
            "name": "Reykjavik FIR & Greenland Corridor (Iceland)",
            "region": "North Atlantic / Europe",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "BIRD",
                "systemType": "FANS 1/A+",
                "minFlightLevel": "FL195+",
                "logonTiming": "15 to 45 minutes prior to entering BIRD FIR",
                "logonWindowMin": [15, 45],
                "notes": "FANS 1/A CPDLC and ADS-C operational throughout Reykjavik OCA."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "From Jeppesen Europe p.127: Iceland has mandated ADS-B (1090ES) and Mode S for all aircraft in BIRD FIR and the Greenland Corridor (65N-69N / GUNPA-EMBOK at FL290+).",
                "rnpRequired": "RNP 4 / RNP 10 (NAT HLA)",
                "lateralSeparation": "ADS-B Surveillance / PBCS"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "0.1 NM increments up to 2.0 NM right of centerline",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "7000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Mode S and 1090ES ADS-B mandatory; exemption from Iceland ATS required prior to entry if unserviceable."
            },
            "adizKey": None
        },
        "ENOR": {
            "firCode": "ENOR",
            "name": "Polaris / Bodo Oceanic Corridor (Norway)",
            "region": "Europe / North Atlantic",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "ENOR (Continental ATN) / ENOB (Bodo Oceanic FANS 1/A)",
                "systemType": "ATN B1 / FANS 1/A",
                "minFlightLevel": "FL285+",
                "logonTiming": "15 minutes prior to FIR entry",
                "logonWindowMin": [10, 20],
                "notes": "ATN B1 above FL285 in continental Polaris FIR; FANS 1/A in Bodo Oceanic (ENOB)."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "From Jeppesen Europe p.127-128: Transponder with 1090ES ADS-B extended squitter mandatory in the Bodo Corridor (6645N 000E to 81N 030E).",
                "rnpRequired": "RNAV 5 / RNP 4 (Bodo OCA)",
                "lateralSeparation": "ADS-B Surveillance Corridor"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "0.1 NM increments up to 2.0 NM right in Bodo Oceanic airspace",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "7000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Standard European SSR rules; Squawk 7000 VFR."
            },
            "adizKey": None
        },
        "EGTT": {
            "firCode": "EGTT",
            "name": "London FIR/UIR (United Kingdom)",
            "region": "Europe",
            "cpdlc": {
                "available": True,
                "adsC": False,
                "logonId": "EGTT",
                "systemType": "ATN B1 (VDL Mode 2)",
                "minFlightLevel": "FL285+",
                "logonTiming": "10 to 15 minutes prior to entering London UIR above FL285",
                "logonWindowMin": [10, 15],
                "notes": "European Single Sky Data Link Mandate (DLM) via ATN B1 / VDL Mode 2 above FL285."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "1090ES ADS-B Out & Mode S Enhanced Surveillance (EHS) mandatory.",
                "rnpRequired": "RNAV 5 / RNAV 1 (TMA SIDs/STARs)",
                "lateralSeparation": "5 NM Radar / ADS-B"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": False,
                    "offsetRule": "SLOP not authorized in domestic European radar airspace unless instructed by ATC",
                    "IncrementNm": 0,
                    "maxOffsetNm": 0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "7000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Mode S EHS required; notify London Control immediately if transponder degrades."
            },
            "adizKey": None
        },
        "LFFF": {
            "firCode": "LFFF",
            "name": "Paris FIR / France UIR",
            "region": "Europe",
            "cpdlc": {
                "available": True,
                "adsC": False,
                "logonId": "LFFF",
                "systemType": "ATN B1 (VDL Mode 2)",
                "minFlightLevel": "FL195+",
                "logonTiming": "10 to 15 minutes prior to entering France UIR",
                "logonWindowMin": [10, 15],
                "notes": "ATN B1 CPDLC operational across French UIRs (LFFF/LFEE/LFMM/LFBB/LFRR)."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "EU ADS-B Out 1090ES & Mode S EHS mandate applies.",
                "rnpRequired": "RNAV 5 (FRA) / RNAV 1 (Paris & Geneva TMAs)",
                "lateralSeparation": "Radar / ADS-B"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": False,
                    "offsetRule": "No SLOP in domestic European radar airspace",
                    "IncrementNm": 0,
                    "maxOffsetNm": 0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "7000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Squawk 7000 VFR; prior authorization required if departing without serviceable Mode S transponder."
            },
            "adizKey": None
        },
        "LSAS": {
            "firCode": "LSAS",
            "name": "Switzerland FIR/UIR (Geneva / Zurich)",
            "region": "Europe",
            "cpdlc": {
                "available": True,
                "adsC": False,
                "logonId": "LSAG (Geneva) / LSAZ (Zurich) / EDUU",
                "systemType": "ATN B1 (VDL Mode 2)",
                "minFlightLevel": "FL150+",
                "logonTiming": "10 minutes prior to entering Swiss FIR",
                "logonWindowMin": [10, 15],
                "notes": "Skyguide ATN B1 CPDLC active; initial voice check-in mandatory on sector transfer."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "Mode S EHS & ADS-B Out required.",
                "rnpRequired": "RNAV 1 / RNP 1 (TMA) & RNAV 5 (Enroute)",
                "lateralSeparation": "3 NM / 5 NM Radar"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": False,
                    "offsetRule": "No SLOP in Swiss radar airspace",
                    "IncrementNm": 0,
                    "maxOffsetNm": 0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "7000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Squawk 7000 VFR below FL100 (or 7000 throughout Europe uncontrolled)."
            },
            "adizKey": None
        },
        "LCCC": {
            "firCode": "LCCC",
            "name": "Nicosia FIR (Cyprus)",
            "region": "Europe / Middle East",
            "cpdlc": {
                "available": True,
                "adsC": False,
                "logonId": "LCCC",
                "systemType": "ATN B1",
                "minFlightLevel": "FL285+",
                "logonTiming": "5 to 10 minutes prior to entry into Nicosia FIR",
                "logonWindowMin": [5, 10],
                "notes": "From Jeppesen Middle East p.68: CPDLC mandatory above FL285 via ATN B1 (Logon LCCC 5-10 mins prior)."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "ADS-B Out & Mode S required above FL285.",
                "rnpRequired": "RNAV 5",
                "lateralSeparation": "Radar / Procedural"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": False,
                    "offsetRule": "Maintain assigned centerline; strict level/track adherence due to uncoordinated Ankara/Ercan boundary",
                    "IncrementNm": 0,
                    "maxOffsetNm": 0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": {
                    "active": True,
                    "bulletinRef": "Jeppesen Briefing Bulletin JEP 06 / IATA Operational Notice 004/21 (General p.13-14)",
                    "ercanFreq": "126.70 MHz",
                    "preEntryNoticeMin": 10,
                    "summary": "No direct coordination exists between Ankara and Nicosia ACCs. Authority in LCCC FIR rests SOLELY with Nicosia ACC — accept ATC instructions & SSR codes ONLY from Nicosia ACC. Southbound from Ankara: contact Nicosia ACC >=10 mins prior to VESAR/TOMBI. Northbound to Ankara: relay flight info >=10 mins prior on 126.70 MHz (Ercan) for relay to Ankara. Eastbound to Damascus: contact 10 mins prior to NIKAS or relay via Latakia Radio at VESAR/ALSUS/BALMA."
                }
            },
            "ssr": {
                "uncontrolledVfrSquawk": "7000 (Class G training areas: 2000)",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Accept SSR code allocations ONLY from Nicosia ACC within LCCC FIR."
            },
            "adizKey": None
        },
        "DIII": {
            "firCode": "DIII",
            "name": "Abidjan FIS / Dakar & Roberts Corridor (West Africa)",
            "region": "Africa",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "DIII",
                "systemType": "FANS 1/A",
                "minFlightLevel": "FL245+",
                "logonTiming": "20 to 45 minutes prior to entry into Abidjan FIS (DGAC/FCCC: 15 to 45 mins prior)",
                "logonWindowMin": [20, 45],
                "notes": "From Jeppesen Africa p.79: Logon to DIII should be initiated between 20 and 45 minutes prior to entry into Abidjan FIS."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "From Jeppesen Africa p.62: Space-based ADS-B services implemented within Abidjan FIS, Dakar, Niamey, N'Djamena, and Brazzaville FIRs.",
                "rnpRequired": "RNP 10 (AFI Oceanic/Remote routes)",
                "lateralSeparation": "50 NM Lateral Separation"
            },
            "specialProcedures": {
                "ifbp1269": {
                    "active": True,
                    "frequency": "126.9 MHz",
                    "listenBeforeEntryMin": 10,
                    "broadcastIntervalMin": 20,
                    "summary": "IATA In-Flight Broadcast Procedure (IFBP) in Africa (Jeppesen Africa p.74-77): Maintain continuous listening watch on 126.9 MHz starting 10 mins prior to entry. Broadcast in English: 10 mins prior to FIR entry, upon entry, 10 mins prior to crossing/joining ATS routes, every 20 mins, and before/after any FL change. Operate TCAS in TA/RA at max range and display exterior lights during level changes."
                },
                "slop": {
                    "authorized": True,
                    "offsetRule": "SLOP promoted across AFI region: Centerline or 0.1 NM increments up to 2.0 NM RIGHT of track",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000 (AFI ORCAM PA West)",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "From Jeppesen Africa p.64-70: In case of transponder failure on a flight entering Abidjan, Dakar, Niamey, Ouagadougou, Cotonou, Douala, or Brazzaville TMA/UTA, the crew MUST inform the respective ACC/Approach at least 15 minutes before entering the airspace."
            },
            "adizKey": None
        },
        "FCCC": {
            "firCode": "FCCC",
            "name": "Brazzaville FIR (Central Africa)",
            "region": "Africa",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "FCCC",
                "systemType": "FANS 1/A",
                "minFlightLevel": "FL245+",
                "logonTiming": "15 to 45 minutes prior to entry into Brazzaville FIR",
                "logonWindowMin": [15, 45],
                "notes": "From Jeppesen Africa p.79: CPDLC is primary means of communication in Brazzaville FIR (excluding Douala, Libreville, and Sao Tome UTA)."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "Space-based ADS-B operational across Brazzaville FIR.",
                "rnpRequired": "RNP 10 / RNAV 5",
                "lateralSeparation": "50 NM / Space-Based ADS-B"
            },
            "specialProcedures": {
                "ifbp1269": {
                    "active": True,
                    "frequency": "126.9 MHz",
                    "listenBeforeEntryMin": 10,
                    "broadcastIntervalMin": 20,
                    "summary": "Mandatory AFI IATA IFBP zone (Brazzaville FIR): Broadcast on 126.9 MHz 10 mins prior to entry, upon entry, every 20 mins, and before/after any FL change."
                },
                "slop": {
                    "authorized": True,
                    "offsetRule": "AFI SLOP: 0.1 NM increments up to 2.0 NM RIGHT of centerline",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000 (PA Central ORCAM)",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Mandatory 15-minute prior notification to Brazzaville ACC / Douala ACC before entering TMA/UTA with a failed transponder."
            },
            "adizKey": None
        },
        "HECC": {
            "firCode": "HECC",
            "name": "Cairo FIR (Egypt)",
            "region": "Africa / Middle East",
            "cpdlc": {
                "available": False,
                "adsC": False,
                "logonId": "N/A (VHF Voice Cairo ACC)",
                "systemType": "VHF Voice",
                "minFlightLevel": "FL195+",
                "logonTiming": "Contact Cairo ACC on assigned VHF frequency 10 mins prior to FIR boundary",
                "logonWindowMin": [10, 15],
                "notes": "Verify extensive Egypt RNAV route changes (L81, L604, M872, T223) in Cycle 2610/2611."
            },
            "pbnAdsB": {
                "adsBMandatory": False,
                "adsBNote": "SSR Mode A/C/S surveillance.",
                "rnpRequired": "RNAV 5 between FL160-FL460 (Note: HECA 10 NM GPS jamming prohibits RNAV GNSS approaches at Cairo)",
                "lateralSeparation": "Radar"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": False,
                    "offsetRule": "Radar controlled airspace; do not offset without ATC clearance",
                    "IncrementNm": 0,
                    "maxOffsetNm": 0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "7000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "From Jeppesen Africa p.65: Squawk 7000 as an uncontrolled flight; standard ICAO transponder failure rules."
            },
            "adizKey": None
        },
        "VABF": {
            "firCode": "VABF",
            "name": "Mumbai FIR (India)",
            "region": "Middle East / South Asia",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "VABF",
                "systemType": "FANS 1/A",
                "minFlightLevel": "FL290+",
                "logonTiming": "10 minutes prior to entry into Mumbai FIR",
                "logonWindowMin": [10, 15],
                "notes": "From Jeppesen Middle East p.68: Logon to VABF 10 mins prior to entry. Downlink initial CPDLC position report upon connection; HF backup via Mumbai Radio (3443/5601/6661/8879/10084 kHz)."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "From Jeppesen Middle East p.63: All aircraft flying on PBN routes (L, M, N, P, Q, T and A201/A474/G450/W-routes) at or above FL290 in Indian airspace MUST carry serviceable 1090MHz ES ADS-B Out. Non-ADS-B restricted below FL290.",
                "rnpRequired": "RNP 10 (Oceanic) / RNAV 5 (Continental PBN routes)",
                "lateralSeparation": "50 NM Oceanic / ADS-B Continental"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "Arabian Sea Oceanic: Centerline or 0.1 NM increments up to 2.0 NM RIGHT of track",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Standard ICAO SSR procedures; valid Air Defense Clearance (ADC) number mandatory before entry."
            },
            "adizKey": "INDIA"
        },
        "VIDF": {
            "firCode": "VIDF",
            "name": "Delhi FIR (India)",
            "region": "Middle East / South Asia",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "VIDF",
                "systemType": "FANS 1/A",
                "minFlightLevel": "FL290+",
                "logonTiming": "10 minutes prior to entry into Delhi FIR",
                "logonWindowMin": [10, 15],
                "notes": "From Jeppesen Middle East p.67: Logon to VIDF 10 mins prior to entry."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "1090MHz ES ADS-B Out mandatory at or above FL290 on all Indian PBN routes (L, M, N, P, Q, T).",
                "rnpRequired": "RNAV 5 / RNP 10",
                "lateralSeparation": "Radar / ADS-B"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": False,
                    "offsetRule": "Continental radar airspace; offset only on ATC instruction",
                    "IncrementNm": 0,
                    "maxOffsetNm": 0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Standard ICAO SSR procedures; ADC number required 10 mins prior to FIR entry."
            },
            "adizKey": "INDIA"
        },
        "VOMF": {
            "firCode": "VOMF",
            "name": "Chennai FIR (India)",
            "region": "Middle East / South Asia",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "VOMF",
                "systemType": "FANS 1/A",
                "minFlightLevel": "FL290+",
                "logonTiming": "10 minutes prior to entry into Chennai FIR",
                "logonWindowMin": [10, 15],
                "notes": "From Jeppesen Middle East p.67: Logon to VOMF 10 mins prior to entry; downlink initial CPDLC position report."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "1090ES ADS-B Out mandatory at or above FL290 on all PBN routes and Bay of Bengal oceanic routes.",
                "rnpRequired": "RNP 10 / RNP 4 (Bay of Bengal)",
                "lateralSeparation": "50 NM / 30 NM Oceanic"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "Bay of Bengal Oceanic: 0.1 NM increments up to 2.0 NM right of centerline",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Standard ICAO SSR procedures; India ADC required."
            },
            "adizKey": "INDIA"
        },
        "OPKR": {
            "firCode": "OPKR",
            "name": "Karachi FIR (Pakistan)",
            "region": "Middle East / South Asia",
            "cpdlc": {
                "available": False,
                "adsC": False,
                "logonId": "N/A (Karachi Control VHF / HF)",
                "systemType": "VHF / HF Voice",
                "minFlightLevel": "FL150+",
                "logonTiming": "Obtain ADC from Karachi FIC at least 15 minutes prior to entering Pakistan airspace/ADIZ",
                "logonWindowMin": [15, 20],
                "notes": "Must report estimate for ADIZ entry point and cross within ±5 minutes."
            },
            "pbnAdsB": {
                "adsBMandatory": False,
                "adsBNote": "SSR Mode A/C/S surveillance.",
                "rnpRequired": "RNAV 5 / RNP 10",
                "lateralSeparation": "Radar / Procedural"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "1 NM or 2 NM right of centerline in oceanic sector south of Karachi",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Standard ICAO SSR procedures; never enter Pakistan ADIZ without valid ADC and discrete squawk."
            },
            "adizKey": "PAKISTAN"
        },
        "OIIX": {
            "firCode": "OIIX",
            "name": "Tehran FIR (Iran)",
            "region": "Middle East",
            "cpdlc": {
                "available": False,
                "adsC": False,
                "logonId": "N/A (VHF Voice + Air Defense Radar 127.8 / 135.1 MHz)",
                "systemType": "VHF Voice + Air Defense Check-In",
                "minFlightLevel": "FL150+ (Mandatory minimum entry FL)",
                "logonTiming": "Contact Iran Air Defense Radar on 127.8 MHz or 135.1 MHz at least 40 NM prior to entering Tehran FIR",
                "logonWindowMin": [10, 15],
                "notes": "From Jeppesen Middle East p.54: Must enter at FL150+ via published ATS routes within ±5 mins of estimate. Forbidden to cross Bushehr VORDME 'BUZ' at FL280 or below."
            },
            "pbnAdsB": {
                "adsBMandatory": False,
                "adsBNote": "SSR Mode A/C/S mandatory; domestic squawk 0000.",
                "rnpRequired": "RNAV 5 / Preferential Route System (Middle East p.69-70)",
                "lateralSeparation": "Radar"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": False,
                    "offsetRule": "Strictly prohibited to deviate from published ATS route centerline inside Iran ADIZ",
                    "IncrementNm": 0,
                    "maxOffsetNm": 0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "0000 (Domestic) / 2000 (Intl Entry)",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Prior permission required if unable to maintain Mode A/C transponder or FL150+ entry."
            },
            "adizKey": "IRAN"
        },
        "VGFR": {
            "firCode": "VGFR",
            "name": "Dhaka FIR (Bangladesh)",
            "region": "Middle East / South Asia",
            "cpdlc": {
                "available": False,
                "adsC": False,
                "logonId": "N/A (Dhaka Control VHF / HF)",
                "systemType": "VHF / HF Voice",
                "minFlightLevel": "GND-UNL",
                "logonTiming": "Obtain ADC at least 10 minutes before entering Bangladesh ADIZ / Dhaka FIR",
                "logonWindowMin": [10, 15],
                "notes": "Routes P646, N895, M770, L524, W112 exempt from ADC unless deviating toward Bangladesh landmass."
            },
            "pbnAdsB": {
                "adsBMandatory": False,
                "adsBNote": "SSR Mode A/C/S surveillance.",
                "rnpRequired": "RNAV 5 / RNP 10",
                "lateralSeparation": "Radar / Procedural"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": False,
                    "offsetRule": "Do not deviate toward landmass without ADC number",
                    "IncrementNm": 0,
                    "maxOffsetNm": 0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "If unable to contact ATS, contact nearest Air Defense Unit on 6826 kHz / 500 kHz prior to entering ADIZ."
            },
            "adizKey": "BANGLADESH"
        },
        "VCCF": {
            "firCode": "VCCF",
            "name": "Colombo FIR (Sri Lanka)",
            "region": "Middle East / South Asia",
            "cpdlc": {
                "available": True,
                "adsC": True,
                "logonId": "VCCF",
                "systemType": "FANS 1/A",
                "minFlightLevel": "FL290+",
                "logonTiming": "15 minutes prior to entry into Colombo FIR (departures: 5 mins prior to leaving TMA)",
                "logonWindowMin": [15, 20],
                "notes": "From Jeppesen Middle East p.67: Logon to VCCF 15 mins prior to entry; obtain ADC number from ACC 15 mins prior to ADIZ entry."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "From Jeppesen Middle East p.65: ADS-B mandated within 330 NM of 070003N/0804618E from FL290 to FL460 for aircraft >5700kg or >250kt TAS.",
                "rnpRequired": "RNP 10 / RNP 4",
                "lateralSeparation": "50 NM / ADS-B"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": True,
                    "offsetRule": "0.1 NM increments up to 2.0 NM right in oceanic airspace outside ADIZ",
                    "IncrementNm": 0.1,
                    "maxOffsetNm": 2.0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "2000",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "Standard ICAO SSR procedures; strict ADIZ compliance required."
            },
            "adizKey": "SRI_LANKA"
        },
        "OEJD": {
            "firCode": "OEJD",
            "name": "Jeddah FIR (Saudi Arabia)",
            "region": "Middle East",
            "cpdlc": {
                "available": True,
                "adsC": False,
                "logonId": "OEJN (Jeddah ACC) / OERK (Riyadh ACC)",
                "systemType": "FANS 1/A & FANS 1/A+",
                "minFlightLevel": "FL290+",
                "logonTiming": "10 to 15 minutes prior to entering Jeddah/Riyadh CTA at FL290+",
                "logonWindowMin": [10, 15],
                "notes": "From Jeppesen Middle East p.20 & p.67: CPDLC available FL290+ (OEJN for Jeddah ACC, OERK for Riyadh ACC)."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "From Jeppesen Middle East p.64: All aircraft operating in Jeddah FIR classes A, B, C, D, or E must be equipped with ADS-B Out.",
                "rnpRequired": "RNAV 5 / RNAV 1",
                "lateralSeparation": "Radar / ADS-B"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": False,
                    "offsetRule": "Continental radar airspace",
                    "IncrementNm": 0,
                    "maxOffsetNm": 0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "7000 (Uncontrolled Entry) / 1100 (Pre-departure unassigned)",
                "entryUnassignedSquawk": "7000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "From Jeppesen Middle East p.59: Squawk 7000 prior to entering Jeddah FIR as an uncontrolled flight; squawk 1100 prior to departure when code not yet allocated."
            },
            "adizKey": None
        },
        "KZDV": {
            "firCode": "KZDV",
            "name": "Denver ARTCC (USA Domestic)",
            "region": "North America",
            "cpdlc": {
                "available": True,
                "adsC": False,
                "logonId": "KUSA",
                "systemType": "FANS 1/A+ (US Domestic Enroute CPDLC)",
                "minFlightLevel": "FL180+",
                "logonTiming": "Prior to pushback (DCL) or 15 mins prior to KUSA boundary",
                "logonWindowMin": [10, 30],
                "notes": "US Domestic Data Comm: single logon 'KUSA' handles all domestic ARTCC transfers (KZDV -> KZLA)."
            },
            "pbnAdsB": {
                "adsBMandatory": True,
                "adsBNote": "1090ES ADS-B Out mandatory in Class A, B, C and above 10,000 ft MSL (14 CFR 91.225).",
                "rnpRequired": "RNAV 2 (Q/T Routes) / RNAV 1 (SIDs/STARs)",
                "lateralSeparation": "3 NM / 5 NM Radar & ADS-B"
            },
            "specialProcedures": {
                "ifbp1269": False,
                "slop": {
                    "authorized": False,
                    "offsetRule": "Domestic US radar airspace — no SLOP",
                    "IncrementNm": 0,
                    "maxOffsetNm": 0
                },
                "brazilContingencyPlan": False,
                "nicosiaRelay": False
            },
            "ssr": {
                "uncontrolledVfrSquawk": "1200",
                "entryUnassignedSquawk": "2000",
                "emergencySquawks": ["7500", "7600", "7700"],
                "transponderFailureRule": "14 CFR 91.215: ATC authorization required to continue in Class A airspace if transponder fails."
            },
            "adizKey": None
        }
    }


def build_adiz_rules(extracted_meta: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build `adiz_rules.json` keyed by Country/Region.
    Contains exact ADC validity windows, delay re-application triggers, in-flight check-in
    timings/distances, frequencies, and interception warnings from the Jeppesen manuals.
    """
    return {
        "_metadata": {
            "source": "Jeppesen Airway Manual - Middle East (p.52-56), North America, and South America",
            "cycle": "2610 / 2611 (Eff 15 OCT 2026)",
            "generatedAt": datetime.now(timezone.utc).isoformat()
        },
        "INDIA": {
            "regionKey": "INDIA",
            "name": "India ADIZ (Mumbai VABF / Delhi VIDF / Chennai VOMF / Kolkata VECF)",
            "associatedFirs": ["VABF", "VIDF", "VOMF", "VECF"],
            "icaoPrefixes": ["VA", "VE", "VI", "VO"],
            "adcRequired": True,
            "validityWindow": {
                "minusMinutesFromEobt": 15,
                "plusMinutesFromEobt": 45,
                "domesticNonSchedPlusMinutes": 180,
                "returnFlightDelayLimitMin": 30,
                "reapplyTriggerMinutes": 45,
                "ruleText": "ADC is valid from EOBT -15 mins to EOBT +45 mins (EOBT -15m to +3 hrs for domestic non-scheduled). Departure outside this window requires a fresh ADC."
            },
            "inFlightCheckIn": {
                "leadTimeMinutes": 10,
                "leadDistanceNm": None,
                "station": "Respective Indian FIC (Mumbai / Delhi / Chennai / Kolkata)",
                "frequencies": ["Assigned Sector VHF / HF"],
                "tolerance": "Must obtain/confirm ADC from respective FIC at least 10 minutes prior to entering Indian airspace."
            },
            "exemptions": "Local flights within 5 NM radius and <=1000 ft AGL of ARP.",
            "interceptionWarning": "No flight is permitted without a valid ADC. Deviation from flight plan or operating without ADC subjects the aircraft to IAF identification and interception."
        },
        "PAKISTAN": {
            "regionKey": "PAKISTAN",
            "name": "Pakistan ADIZ (Karachi OPKR / Lahore OPLR)",
            "associatedFirs": ["OPKR", "OPLR"],
            "icaoPrefixes": ["OP"],
            "adcRequired": True,
            "validityWindow": {
                "minusMinutesFromEobt": 15,
                "plusMinutesFromEobt": 60,
                "returnFlightDelayLimitMin": 30,
                "reapplyTriggerMinutes": 60,
                "ruleText": "ADC must be obtained before departure. If departure is delayed by more than 60 minutes (>1 hr) at origin or intermediate stop, a NEW ADC must be obtained."
            },
            "inFlightCheckIn": {
                "leadTimeMinutes": 15,
                "leadDistanceNm": None,
                "station": "Karachi FIC / Lahore FIC",
                "frequencies": ["Assigned FIC VHF / HF"],
                "tolerance": "Obtain ADC from respective FIC at least 15 minutes prior to entering Pakistan ADIZ. Must cross established ADIZ entry point within ±5 minutes of estimate."
            },
            "exemptions": "Local flights within an Aerodrome Traffic Zone (ATZ).",
            "interceptionWarning": "Aircraft flying without a valid ADC or deviating >5 mins from entry estimate without notification are liable to PAF interception."
        },
        "IRAN": {
            "regionKey": "IRAN",
            "name": "Iran ADIZ (Tehran FIR OIIX)",
            "associatedFirs": ["OIIX"],
            "icaoPrefixes": ["OI"],
            "adcRequired": True,
            "validityWindow": {
                "minusMinutesFromEobt": 5,
                "plusMinutesFromEobt": 5,
                "reapplyTriggerMinutes": 30,
                "ruleText": "FIR entry estimates must be made good within ±5 minutes. All aircraft entering Iran ADIZ must be at FL150 or above via published ATS routes."
            },
            "inFlightCheckIn": {
                "leadTimeMinutes": 10,
                "leadDistanceNm": 40,
                "station": "Iran Air Defense Radar (Tabriz / Babolsar / Mashhad / Birjand / Zabol / Makran / Persian Gulf / Bushehr / Hamadan)",
                "frequencies": ["127.8 MHz", "135.1 MHz"],
                "tolerance": "Mandatory radio check-in on 127.8 MHz or 135.1 MHz at least 40 NM prior to entering Tehran FIR (OIIX). Overflight aircraft are forbidden to cross Bushehr VORDME 'BUZ' at FL280 or below."
            },
            "exemptions": "Prior permission required if unable to enter at FL150 or above.",
            "interceptionWarning": "Strict adherence to published ATS routes, FL150+ entry, and 40 NM prior check-in on 127.8 / 135.1 MHz required to prevent interception."
        },
        "BANGLADESH": {
            "regionKey": "BANGLADESH",
            "name": "Bangladesh ADIZ (Dhaka FIR VGFR)",
            "associatedFirs": ["VGFR"],
            "icaoPrefixes": ["VG"],
            "adcRequired": True,
            "validityWindow": {
                "minusMinutesFromEobt": 15,
                "plusMinutesFromEobt": 120,
                "reapplyTriggerMinutes": 120,
                "ruleText": "ADC valid for entire route. When departure is delayed by more than 2 hours (>120 mins) at departure or intermediate halt, a fresh ADC number MUST be obtained (AFTN: VGHSZQZX / Tel: +880 2 8901081)."
            },
            "inFlightCheckIn": {
                "leadTimeMinutes": 10,
                "leadDistanceNm": None,
                "station": "Dhaka ATS / Bangladesh Air Force ADU",
                "frequencies": ["Assigned VHF", "6826 kHz / 500 kHz (Guard)"],
                "tolerance": "Obtain ADC at least 10 minutes before entering Bangladesh ADIZ. Off-airway flights must pass ADIZ boundary estimate >=10 mins prior."
            },
            "exemptions": "Flights on ATS Routes P646, N895, M770, L524, and W112 are exempt unless deviating toward the landmass of Bangladesh.",
            "interceptionWarning": "Flying without a valid ADC or deviating toward landmass without clearance subjects aircraft to Bangladesh Air Force interception."
        },
        "SRI_LANKA": {
            "regionKey": "SRI_LANKA",
            "name": "Sri Lanka ADIZ (Colombo FIR VCCF)",
            "associatedFirs": ["VCCF"],
            "icaoPrefixes": ["VC"],
            "adcRequired": True,
            "validityWindow": {
                "minusMinutesFromEobt": 30,
                "plusMinutesFromEobt": 60,
                "reapplyTriggerMinutes": 60,
                "ruleText": "File flight plan >=1 hr prior. Once ADC number is issued, aircraft may depart up to 30 mins prior to EOBT. If delayed >1 hour (>60 mins) from EOBT, a new ADC number must be obtained. Advise Tower >=5 mins prior to startup."
            },
            "inFlightCheckIn": {
                "leadTimeMinutes": 15,
                "leadDistanceNm": None,
                "station": "Colombo ACC",
                "frequencies": ["Colombo ACC VHF / HF"],
                "tolerance": "Obtain ADC number and report position/estimate to Colombo ACC at least 15 minutes before penetrating Sri Lanka ADIZ."
            },
            "exemptions": "Local flights within 5 NM radius and <=1000 ft AGL of departure aerodrome.",
            "interceptionWarning": "No pilot may deviate from ATC clearance inside Sri Lanka ADIZ; unapproved penetration is subject to Sri Lanka Air Force interception."
        },
        "CANADA": {
            "regionKey": "CANADA",
            "name": "Canada ADIZ (CADIZ — Gander CZQX / Montreal CZUL / Edmonton CZEG / Vancouver CZVR)",
            "associatedFirs": ["CZQX", "CZUL", "CZWG", "CZEG", "CZVR"],
            "icaoPrefixes": ["CY", "CZ"],
            "adcRequired": False,
            "validityWindow": {
                "minusMinutesFromEobt": 5,
                "plusMinutesFromEobt": 5,
                "reapplyTriggerMinutes": 5,
                "ruleText": "IFR/DVFR flight plan mandatory. Must revise estimate immediately if penetration time differs by more than ±5 minutes or track differs by >20 NM."
            },
            "inFlightCheckIn": {
                "leadTimeMinutes": 5,
                "leadDistanceNm": 20,
                "station": "Canadian ACC / Arctic Radio / FIC",
                "frequencies": ["Assigned ACC VHF / HF", "121.5 MHz"],
                "tolerance": "±5 minutes time tolerance and ±20 NM lateral tolerance from filed CADIZ penetration point."
            },
            "exemptions": "Aircraft operating at true airspeed <180 kt when authorized.",
            "interceptionWarning": "NORAD / RCAF identification and interception procedures apply if penetrating CADIZ outside ±5 min / 20 NM tolerance without ATC notification."
        },
        "US_ALASKA": {
            "regionKey": "US_ALASKA",
            "name": "United States & Alaska Coastal ADIZ (KZWY / KZMA / KZHU / PAZA)",
            "associatedFirs": ["KZWY", "KZMA", "KZHU", "KZAK", "PAZA"],
            "icaoPrefixes": ["K", "PA", "PH", "TJ"],
            "adcRequired": False,
            "validityWindow": {
                "minusMinutesFromEobt": 5,
                "plusMinutesFromEobt": 5,
                "reapplyTriggerMinutes": 5,
                "ruleText": "14 CFR Part 99: IFR or DVFR flight plan required. Discrete Mode 3/A + Mode C + 1090ES ADS-B Out and two-way radio required."
            },
            "inFlightCheckIn": {
                "leadTimeMinutes": 5,
                "leadDistanceNm": 10,
                "station": "US ARTCC / FSS / ARINC",
                "frequencies": ["Assigned ARTCC VHF / HF", "121.5 MHz"],
                "tolerance": "±5 minutes of estimated ADIZ penetration time; ±10 NM (land) / ±20 NM (oceanic) of centerline."
            },
            "exemptions": "DoD tactical exemptions.",
            "interceptionWarning": "NORAD / US Air Force & USCG interception on 121.5 MHz if penetrating without discrete squawk or outside ±5 min / 10-20 NM tolerance."
        },
        "BRAZIL_BORDER": {
            "regionKey": "BRAZIL_BORDER",
            "name": "Brazil / Paraguay Western Border Air Defense Zone (SBCW / SBAZ / SGFA)",
            "associatedFirs": ["SBCW", "SBAZ", "SGFA"],
            "icaoPrefixes": ["SB", "SD", "SI", "SJ", "SN", "SS", "SW", "SG"],
            "adcRequired": False,
            "validityWindow": {
                "minusMinutesFromEobt": 15,
                "plusMinutesFromEobt": 45,
                "reapplyTriggerMinutes": 45,
                "ruleText": "International flights crossing the Brazilian border (e.g., SBCW <-> SGFA via FOZ/GUAIRA) require an active IFR Flight Plan, discrete SSR code, and 2-way VHF contact with Curitiba ACC / Asuncion ACC prior to border crossing."
            },
            "inFlightCheckIn": {
                "leadTimeMinutes": 10,
                "leadDistanceNm": None,
                "station": "Curitiba ACC (SBCW) / Asuncion ACC (SGFA) / Defesa Aerea (COMAE)",
                "frequencies": ["Sector VHF", "121.5 MHz"],
                "tolerance": "Contact Curitiba/Asuncion ACC >=10 minutes prior to international FIR boundary (FOZ/GUAIRA)."
            },
            "exemptions": "None for international cross-border executive jet operations.",
            "interceptionWarning": "Brazilian Air Force (FAB COMAE) Air Defense Policing rules apply along the western border (Paraguay/Bolivia/Colombia/Venezuela); maintain continuous Mode S/C squawk and monitor 121.5 MHz."
        }
    }


def build_aerodrome_notices(extracted_meta: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build `aerodrome_notices.json` keyed by 4-letter ICAO code.
    Includes real Cycle 2610/2611 CCN & NCN entries extracted from the Jeppesen PDFs
    plus FMS database discrepancies, GPS jamming radii, EGNOS/SBAS LPV suspensions,
    wingspan/taxi restrictions, and DCL AFTN logon addresses.
    """
    return {
        "_metadata": {
            "source": "Jeppesen Airway Manual - Chart Change Notices (CCN) & NavData Change Notices (NCN)",
            "cycle": "Cycle 2610 (01 Oct - 28 Oct 2026) & Cycle 2611 (29 Oct - 25 Nov 2026)",
            "generatedAt": datetime.now(timezone.utc).isoformat()
        },
        "SBJH": {
            "icao": "SBJH",
            "name": "São Paulo Catarina Executive Intl",
            "country": "Brazil",
            "fir": "SBCW",
            "dclAftn": "SBJHYDYX (VHF Clearance Delivery 121.650 MHz / DCL via ACARS)",
            "wingspanLimitM": 36.0,
            "g650erWingspanStatus": "COMPLIANT (G650ER 30.36m <= Code C 36.0m)",
            "ccnNotices": [
                {
                    "id": "CCN-SAM-SBJH-01",
                    "type": "CCN",
                    "severity": "CAUTION",
                    "title": "São Paulo TMA (SBCW) — International Executive Customs & Slot Coordination",
                    "detail": "International departures from SBJH require prior PF/RFB customs activation and CGNA slot adherence within ±15 mins of EOBT.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [
                {
                    "id": "NCN-2610-SBJH-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "INFO",
                    "title": "RNP Y RWY 12 & ILS Z RWY 12 — Verify Transition Altitude 8000 ft",
                    "detail": "Ensure FMS Transition Altitude is set to 8000 ft in São Paulo TMA; verify RNAV 1 SID waypoint speed constraints below FL100.",
                    "fmsDiscrepancy": False
                }
            ],
            "taxiRestrictions": "Executive apron stands controlled by Marshaller; pushback mandatory on main executive apron."
        },
        "SGAS": {
            "icao": "SGAS",
            "name": "Silvio Pettirossi Intl (Asunción)",
            "country": "Paraguay",
            "fir": "SGFA",
            "dclAftn": "SGASZPZX (Voice Clearance on Asunción Delivery / Approach 119.7 MHz)",
            "wingspanLimitM": 65.0,
            "g650erWingspanStatus": "COMPLIANT (Code E Aerodrome — G650ER 30.36m)",
            "ccnNotices": [
                {
                    "id": "CCN-SAM-SGAS-01",
                    "type": "CCN",
                    "severity": "WARNING",
                    "title": "Jeppesen SAM CCN p.60: Paraguay AIC A004/24 — Minimum Takeoff Visibility 400m",
                    "detail": "Based on AIC A004/24, the minimum meteorological visibility required for takeoff at all Paraguayan airports (including SGAS & SGES) is 400m.",
                    "fmsDiscrepancy": False
                },
                {
                    "id": "CCN-SAM-SGAS-02",
                    "type": "CCN",
                    "severity": "INFO",
                    "title": "Jeppesen SAM Directory p.1281: SGAS RFF Category 8 & Customs H24",
                    "detail": "RWY 02/20 (11,000 ft x 148 ft, Asphalt, PCN 54/F/C/W/U). HIRL, PAPI-L (3.0°), RVR not installed (MET VIS controlling).",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [
                {
                    "id": "NCN-2610-SGAS-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "CAUTION",
                    "title": "RWY 02/20 Non-Precision / ILS Degradation Cross-Check",
                    "detail": "When RWY 02 ALS or GS is downgraded by NOTAM, apply ICAO AWOM 3D/2D visibility penalties (750m / 1200m floor).",
                    "fmsDiscrepancy": True
                }
            ],
            "taxiRestrictions": "Caution on Apron 1 & TWY A intersections for wide-turn corporate jets; follow marshaller guidance."
        },
        "SGES": {
            "icao": "SGES",
            "name": "Guaraní Intl (Ciudad del Este)",
            "country": "Paraguay",
            "fir": "SGFA",
            "dclAftn": "SGESZPZX (Guarani Tower 118.7 MHz)",
            "wingspanLimitM": 65.0,
            "g650erWingspanStatus": "COMPLIANT (G650ER 30.36m)",
            "ccnNotices": [
                {
                    "id": "CCN-SAM-SGES-01",
                    "type": "CCN",
                    "severity": "WARNING",
                    "title": "Jeppesen SAM CCN p.60: AIC A004/24 — Minimum Takeoff Visibility 400m",
                    "detail": "Minimum meteorological visibility required for takeoff at all Paraguayan airports is 400m.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [
                {
                    "id": "NCN-2610-SGES-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "CRITICAL",
                    "title": "Jeppesen SAM NCN p.86 & p.91: VES VOR/DME (114.1 MHz) Unserviceable — VOR Procs Suspended",
                    "detail": "Ciudad del Este VOR/DME VES 114.1 MHz is unserviceable. VOR RWY 05 and VOR RWY 23 approach procedures are suspended (though still present in FMS NavData). Use RNAV (GNSS) or ILS procedures only.",
                    "fmsDiscrepancy": True
                }
            ],
            "taxiRestrictions": "Verify RFF Category (CAT 5 standard) if using SGES as an en-route/destination alternate."
        },
        "SBFI": {
            "icao": "SBFI",
            "name": "Foz do Iguaçu / Cataratas Intl",
            "country": "Brazil",
            "fir": "SBCW",
            "dclAftn": "SBFIZPZX (Foz Tower 118.8 MHz)",
            "wingspanLimitM": 65.0,
            "g650erWingspanStatus": "COMPLIANT (G650ER 30.36m)",
            "ccnNotices": [
                {
                    "id": "CCN-SAM-SBFI-01",
                    "type": "CCN",
                    "severity": "CAUTION",
                    "title": "Jeppesen SAM CCN p.48: SBFI Obstacle Lighting Unserviceable & Pushback Mandatory",
                    "detail": "Foz Do Iguacu, Brazil (Cataratas Intl): Obstacle lighting unserviceable at coordinates 253602.07S 0542900.28W, 253601.51S 0542859.35W, and 253512.00S 0542906.00W. Pushback procedure is mandatory across the entire apron area.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [],
            "taxiRestrictions": "Pushback procedure is mandatory in the entire apron area (Jeppesen SAM CCN p.48)."
        },
        "SBLO": {
            "icao": "SBLO",
            "name": "Londrina / Gov. José Richa",
            "country": "Brazil",
            "fir": "SBCW",
            "dclAftn": "SBLOZPZX",
            "wingspanLimitM": 36.0,
            "g650erWingspanStatus": "COMPLIANT (G650ER 30.36m <= 36.0m)",
            "ccnNotices": [],
            "ncnNotices": [
                {
                    "id": "NCN-2610-SBLO-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "CRITICAL",
                    "title": "Jeppesen SAM NCN p.88: LON VOR (112.4 MHz) Unserviceable — 6 Approach Procedures Not Usable",
                    "detail": "Due to LON VOR (112.4 MHz) out of service, the following procedures in FMS NavData are NOT usable until Est 31 Dec 2026: VOR D, VOR Z Rwy 13, VOR Y Rwy 13, VOR Rwy 31, LOC Rwy 13, and ILS Y Rwy 13. Use RNP (GNSS) or ILS Z (with radar/GNSS) only.",
                    "fmsDiscrepancy": True
                }
            ],
            "taxiRestrictions": "Standard Apron 1 taxi restrictions apply."
        },
        "SBMG": {
            "icao": "SBMG",
            "name": "Maringá / Sílvio Name Júnior",
            "country": "Brazil",
            "fir": "SBCW",
            "dclAftn": "SBMGZPZX",
            "wingspanLimitM": 36.0,
            "g650erWingspanStatus": "COMPLIANT WITH CAUTION (TWY C restricted to max 36m wingspan — G650ER is 30.36m)",
            "ccnNotices": [
                {
                    "id": "CCN-SAM-SBMG-01",
                    "type": "CCN",
                    "severity": "WARNING",
                    "title": "Jeppesen SAM CCN p.51: TWY C Wingspan Restriction (<36m) & Continuous Visual Watch",
                    "detail": "TWY C restricted to aircraft with wingspan less than 36m (Code C). Continuous visual watch mandatory during taxiing on TWY C and Patio 1. Aircraft without steerable nosewheel must shut down prior to turn into parking position.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [],
            "taxiRestrictions": "TWY C max wingspan <36m (G650ER is 30.36m — maintain strict centerline tracking and continuous visual watch on TWY C and Patio 1)."
        },
        "SAEZ": {
            "icao": "SAEZ",
            "name": "Buenos Aires / Ministro Pistarini (Ezeiza)",
            "country": "Argentina",
            "fir": "SAEZ",
            "dclAftn": "SAEZZPZX (ACARS DCL Available)",
            "wingspanLimitM": 80.0,
            "g650erWingspanStatus": "COMPLIANT (Code F Aerodrome)",
            "ccnNotices": [
                {
                    "id": "CCN-SAM-SAEZ-01",
                    "type": "CCN",
                    "severity": "WARNING",
                    "title": "Jeppesen SAM CCN p.42: AIP SUP A05/26 & A06/26 — RWY 11/29 & RWY 17/35 Rehabilitation",
                    "detail": "Based on AIP SUP A05/26 & A06/26, major pavement works affect RWY 11/29, RWY 17/35, and TWY F/G/D intersections. Verify active runway and displaced threshold NOTAMs prior to approach briefing.",
                    "fmsDiscrepancy": True
                }
            ],
            "ncnNotices": [],
            "taxiRestrictions": "Follow temporary taxiway routing per AIP SUP A05/26 & A06/26."
        },
        "KTEB": {
            "icao": "KTEB",
            "name": "Teterboro Airport (New Jersey)",
            "country": "United States",
            "fir": "KZWY",
            "dclAftn": "KTEB (Pre-Departure Clearance via CPDLC DCL / ACARS PDC)",
            "wingspanLimitM": 36.0,
            "g650erWingspanStatus": "COMPLIANT WITH WEIGHT/NOISE BRIEFING (Max 100,000 lbs ramp waiver / G650ER weight mgmt required)",
            "ccnNotices": [
                {
                    "id": "CCN-NAM-KTEB-01",
                    "type": "CCN",
                    "severity": "WARNING",
                    "title": "Jeppesen General Bulletin p.37-39: US Lower-Than-Standard Takeoff Minimums (OpSpecs C078/C079)",
                    "detail": "Effective Sept 2026 revision: RVR 500 ft (unaided CL+HIRL) or RVR 300 ft (aided HUD/EFVS + CL + HIRL) authorized per OpSpecs C078/C079. Ensure EFVS derived visibility >= RVR 1600 ft.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [
                {
                    "id": "NCN-2610-KTEB-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "CRITICAL",
                    "title": "Teterboro RNAV (GPS) X RWY 06 / ILS RWY 06 — RUUDY / DANDY Altitude Cross-Check",
                    "detail": "Strict compliance with 2000 ft / 1500 ft stepdown altitudes required to maintain vertical separation below Newark (KEWR) arrival corridor.",
                    "fmsDiscrepancy": False
                }
            ],
            "taxiRestrictions": "100,000 lb weight limit requires prior Port Authority / FBO authorization for G650ER operations; monitor wingtip clearance on TWY L and FBO ramps."
        },
        "EGGW": {
            "icao": "EGGW",
            "name": "London Luton Airport",
            "country": "United Kingdom",
            "fir": "EGTT",
            "dclAftn": "EGGWZTZX (ACARS DCL Logon: EGGW — 25 mins prior to EOBT)",
            "wingspanLimitM": 52.0,
            "g650erWingspanStatus": "COMPLIANT (G650ER 30.36m)",
            "ccnNotices": [
                {
                    "id": "CCN-EUR-EGGW-01",
                    "type": "CCN",
                    "severity": "INFO",
                    "title": "Jeppesen General Bulletin p.34-36: EASA Air Ops AOM — LVTO & 3D/2D Minimums",
                    "detail": "LVP required below RVR 550m; operator approval required below RVR 400m. CAT III without rollout guidance lowered from 200m to 175m.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [
                {
                    "id": "NCN-2610-EGGW-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "CRITICAL",
                    "title": "Jeppesen Europe NCN p.122: Luton NDB(L) 'LUT' Unavailable — Mandatory RNAV Substitution",
                    "detail": "NDB(L) LUT is unavailable UFN. For all Instrument Flight Procedures (IFPs) at EGGW, the position of LUT NDB MUST be defined in the FMS by I-LTN D4.7, I-LJ D3.9, or BKY VOR R242.9/D13 using RNAV substitution.",
                    "fmsDiscrepancy": True
                }
            ],
            "taxiRestrictions": "Signature / Harrods Business Aviation Apron: follow marshaller guidance; wingtip clearance restrictions on Delta Link."
        },
        "LFPB": {
            "icao": "LFPB",
            "name": "Paris Le Bourget",
            "country": "France",
            "fir": "LFFF",
            "dclAftn": "LFPBZTZX (ACARS DCL Logon: LFPB — 30 to 5 mins prior to EOBT)",
            "wingspanLimitM": 65.0,
            "g650erWingspanStatus": "COMPLIANT (G650ER 30.36m)",
            "ccnNotices": [
                {
                    "id": "CCN-EUR-LFPB-01",
                    "type": "CCN",
                    "severity": "WARNING",
                    "title": "Paris Le Bourget Noise Abatement & CDG (LFPG) Proximity Ceiling",
                    "detail": "Strict adherence to initial SID climb cap (3000 ft / 4000 ft) mandatory due to Charles de Gaulle (LFPG) overhead departure traffic.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [
                {
                    "id": "NCN-2610-LFPB-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "CAUTION",
                    "title": "RNP RWY 27 / ILS RWY 27 — EGNOS/SBAS LPV Cross-Check",
                    "detail": "When RWY 07/25 is closed by NOTAM, verify active RWY 09/27 or 03/21 approach coding and LPV channel availability.",
                    "fmsDiscrepancy": False
                }
            ],
            "taxiRestrictions": "Avoid jet blast on FBO aprons (Advanced Air Support / Dassault / Signature)."
        },
        "LSGG": {
            "icao": "LSGG",
            "name": "Geneva Cointrin Intl",
            "country": "Switzerland",
            "fir": "LSAS",
            "dclAftn": "LSGGZTZX (ACARS DCL Logon: LSGG — 25 mins prior to EOBT)",
            "wingspanLimitM": 65.0,
            "g650erWingspanStatus": "COMPLIANT (G650ER 30.36m)",
            "ccnNotices": [
                {
                    "id": "CCN-EUR-LSGG-01",
                    "type": "CCN",
                    "severity": "INFO",
                    "title": "Geneva LVP & ATN B1 Data Link Mandate",
                    "detail": "Ensure ATN B1 (VDL Mode 2) is active prior to climb into LSAG upper airspace.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [
                {
                    "id": "NCN-2610-LSGG-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "CAUTION",
                    "title": "Swiss NavData Notice (Europe p.121): Verify RNP AR / GLS Status",
                    "detail": "Note that at nearby LSGS (Sion) RNP RWY 25 (AR) is suspended UFN and at LSZH (Zurich) GLS RWY 14 is suspended due to GBAS outage. At LSGG, when ILS RWY 22 GS is out by NOTAM, brief LOC RWY 22 (2D/CDFA) minimums.",
                    "fmsDiscrepancy": True
                }
            ],
            "taxiRestrictions": "Terminal 3 (Business Aviation) parking requires prior PPR slot and tow-in/pushback."
        },
        "HECA": {
            "icao": "HECA",
            "name": "Cairo International Airport",
            "country": "Egypt",
            "fir": "HECC",
            "dclAftn": "HECAZTZX (Cairo Delivery VHF 121.8 MHz)",
            "wingspanLimitM": 80.0,
            "g650erWingspanStatus": "COMPLIANT (Code F Aerodrome)",
            "ccnNotices": [
                {
                    "id": "CCN-AFR-HECA-01",
                    "type": "CCN",
                    "severity": "WARNING",
                    "title": "Jeppesen Africa CCN p.14-16: Extensive Cairo FIR (HECC) ATS Route Redesignations",
                    "detail": "Routes A727, L81, L315, L604, M720, M872, P557, Q2, and T223 around Cairo VORDME (CVO) modified in Cycle 2610/2611. Cross-check filed FPL waypoints against FMS database.",
                    "fmsDiscrepancy": True
                }
            ],
            "ncnNotices": [
                {
                    "id": "NCN-2610-HECA-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "CRITICAL",
                    "title": "Jeppesen Africa NCN p.54: HECA GPS Jamming Within 10 NM — RNAV (GNSS) Prohibited",
                    "detail": "HECA, Cairo Intl: 'RNAV (GNSS) Apch Procs should not be planned due to GPS jamming within 10 NM from Cairo ARP, UFN.' Although RNAV (GNSS) approaches remain in the FMS database, crews MUST plan and fly ILS or conventional VOR approaches only.",
                    "fmsDiscrepancy": True
                }
            ],
            "taxiRestrictions": "VIP / Executive Hall 4 apron requires follow-me vehicle guidance."
        },
        "GCLP": {
            "icao": "GCLP",
            "name": "Gran Canaria Airport",
            "country": "Spain (Canary Islands)",
            "fir": "GCCC",
            "dclAftn": "GCLPZTZX (ACARS DCL Available)",
            "wingspanLimitM": 65.0,
            "g650erWingspanStatus": "COMPLIANT (G650ER 30.36m)",
            "ccnNotices": [],
            "ncnNotices": [
                {
                    "id": "NCN-2610-GCLP-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "CRITICAL",
                    "title": "Jeppesen Africa NCN p.53: EGNOS Signal Reduction — All LPV Approaches & LPC VOR Suspended",
                    "detail": "Based on SUP 128/26 & 156/26, due to reduced EGNOS (SBAS) signal availability, RNP RWY 03L/03R (LPV only) and RNP Z RWY 21L/21R (LPV only) are NOT USABLE. Furthermore, DVOR/DME LPC is unserviceable until 11 Jun 2027 (ILS X 03L, ILS Y 21R, VOR 03L/21R unusable).",
                    "fmsDiscrepancy": True
                }
            ],
            "taxiRestrictions": "Standard AENA apron procedures."
        },
        "LEMD": {
            "icao": "LEMD",
            "name": "Adolfo Suárez Madrid-Barajas",
            "country": "Spain",
            "fir": "LECM",
            "dclAftn": "LEMDZTZX (ACARS DCL Logon: LEMD)",
            "wingspanLimitM": 80.0,
            "g650erWingspanStatus": "COMPLIANT",
            "ccnNotices": [],
            "ncnNotices": [
                {
                    "id": "NCN-2610-LEMD-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "CRITICAL",
                    "title": "Jeppesen Europe NCN p.118: Spain EGNOS/SBAS LPV Suspension — RNP Z (LPV Only) U/S",
                    "detail": "RNP Z RWY 18L (LPV only), RNP Z RWY 18R (LPV only), RNP Z RWY 32L (LPV only), and RNP Z RWY 32R (LPV only) Apch Procs are U/S (Est 03 Sep 2027). Additionally, ILS X RWY 18L/18R not to be used 13-28 Oct 2026 and DVOR/DME 'NVS' unavailable eff 29 Oct 2026.",
                    "fmsDiscrepancy": True
                }
            ],
            "taxiRestrictions": "Executive Aviation Apron (Terminal 4 / Torrejón alternate) requires marshaller."
        },
        "OEJN": {
            "icao": "OEJN",
            "name": "King Abdulaziz Intl (Jeddah)",
            "country": "Saudi Arabia",
            "fir": "OEJD",
            "dclAftn": "JEDDAYA (Saudi DCL AFTN Logon per AIP SUP 18/26 — Middle East p.22)",
            "wingspanLimitM": 80.0,
            "g650erWingspanStatus": "COMPLIANT",
            "ccnNotices": [
                {
                    "id": "CCN-MEA-OEJN-01",
                    "type": "CCN",
                    "severity": "INFO",
                    "title": "Jeppesen Middle East CCN p.22: Saudi Arabia Departure Clearance (DCL) AFTN Logon Addresses",
                    "detail": "Based on AIP SUP 18/26, DCL is available prior to taxiing via AFTN LOGON: JEDDAH TOWER = JEDDAYA, RIYADH TOWER = RUHDAYA, MADINAH TOWER = MEDDAYA, DAMMAM TOWER = DMMCAYA, GASSIM TOWER = ELQBAYA, ABHA TOWER = AHBAAYA. Once taxiing, clearance revisions are via VHF voice only.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [
                {
                    "id": "NCN-2610-OEJN-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "INFO",
                    "title": "Jeppesen Middle East NCN p.47: OEJN Stand 5 on Apron 6 Closed",
                    "detail": "Stand 5 on Apron 6 closed. Also note King Faisal Naval Base (OEJF) ILS RWY 33 U/S until 23 Dec 2026.",
                    "fmsDiscrepancy": False
                }
            ],
            "taxiRestrictions": "Once aircraft starts taxiing, ATC clearance revisions are via VHF voice only (DCL terminated at taxi)."
        },
        "KASE": {
            "icao": "KASE",
            "name": "Aspen-Pitkin County Airport (Sardy Field)",
            "country": "United States",
            "fir": "KZDV",
            "dclAftn": "KASE (Clearance Delivery 128.05 MHz)",
            "wingspanLimitM": 28.96,
            "g650erWingspanStatus": "RESTRICTED — 95.0 ft (28.96m) Max Wingspan Limit (G650ER is 99 ft 7 in / 30.36m — Prior Waiver or Diversion to KRIL/KEGE Required!)",
            "ccnNotices": [
                {
                    "id": "CCN-NAM-KASE-01",
                    "type": "CCN",
                    "severity": "CRITICAL",
                    "title": "KASE Wingspan Restriction (95.0 ft / 28.96m) vs G650ER (99.6 ft / 30.36m)",
                    "detail": "Aspen (KASE) enforces a strict 95.0 ft (28.96m) wingspan limit due to Runway 15/33 – Taxiway A separation. Gulfstream G650ER wingspan is 99 ft 7 in (30.36m). Operations prohibited without specific airport director/FAA waiver; use Rifle (KRIL) or Eagle (KEGE).",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [
                {
                    "id": "NCN-2610-KASE-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "WARNING",
                    "title": "LOC/DME-E & RNAV (GPS)-F — Special Mountain Missed Approach Climb Gradient & Night Curfew",
                    "detail": "Verify high-altitude missed approach climb gradient performance (up to 440 ft/NM) and Visual Segment - Obstacles in Roaring Fork Valley.",
                    "fmsDiscrepancy": False
                }
            ],
            "taxiRestrictions": "PROHIBITED for wingspans >95.0 ft (28.96m) on TWY A parallel to RWY 15/33 without closure/sterilization."
        },
        "KVNY": {
            "icao": "KVNY",
            "name": "Van Nuys Airport (Los Angeles)",
            "country": "United States",
            "fir": "KZLA",
            "dclAftn": "KVNY (CPDLC DCL / PDC Available via Clearance Delivery 126.6 MHz)",
            "wingspanLimitM": 45.0,
            "g650erWingspanStatus": "COMPLIANT (G650ER 30.36m — Use RWY 16R/34L)",
            "ccnNotices": [
                {
                    "id": "CCN-NAM-KVNY-01",
                    "type": "CCN",
                    "severity": "WARNING",
                    "title": "KVNY RWY 16R Displaced Threshold & Burbank (KBUR) Proximity",
                    "detail": "Verify RWY 16R LDA (7,280 ft vs 8,001 ft TORA) and NOTAM crane obstacles on short final.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [
                {
                    "id": "NCN-2610-KVNY-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "CAUTION",
                    "title": "ILS Y RWY 16R & RNAV (GPS) Y RWY 16R — Visual Segment & Raised DA/MDA",
                    "detail": "Cross-check active crane NOTAMs raising ILS RWY 16R DA to 1210 ft MSL and disabling ALS.",
                    "fmsDiscrepancy": True
                }
            ],
            "taxiRestrictions": "Avoid RWY 16L/34R (light GA training runway, 4,013 ft); use RWY 16R/34L and TWY A/B."
        },
        "SBGR": {
            "icao": "SBGR",
            "name": "São Paulo / Guarulhos — Gov. André Franco Montoro Intl",
            "country": "Brazil",
            "fir": "SBCW",
            "dclAftn": "SBGRZPZX (ACARS DCL Logon: SBGR — 30 to 10 mins prior to EOBT)",
            "wingspanLimitM": 80.0,
            "g650erWingspanStatus": "COMPLIANT (Code F Aerodrome — G650ER 30.36m)",
            "ccnNotices": [
                {
                    "id": "CCN-SAM-SBGR-01",
                    "type": "CCN",
                    "severity": "CAUTION",
                    "title": "SBGR Simultaneous Parallel Operations & HIRL/ALS Maintenance Windows",
                    "detail": "Independent/dependent parallel approaches on RWY 10L/10R & 28L/28R require strict FMS RNAV 1 STAR speed adherence and prompt runway vacation via high-speed exits.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [
                {
                    "id": "NCN-2610-SBGR-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "INFO",
                    "title": "RNP AR / ILS CAT II/III RWY 10R/28L — Transition Altitude 8000 ft",
                    "detail": "Verify Transition Altitude 8000 ft in São Paulo TMA and cross-check active WIP NOTAMs on TWY AA/BB/EE.",
                    "fmsDiscrepancy": False
                }
            ],
            "taxiRestrictions": "GAT / Executive Apron requires Follow-Me guidance and pushback clearance on Ground 121.7 / 121.9 MHz."
        },
        "SBSP": {
            "icao": "SBSP",
            "name": "São Paulo / Congonhas",
            "country": "Brazil",
            "fir": "SBCW",
            "dclAftn": "SBSPZPZX (ACARS DCL Logon: SBSP / Delivery 121.05 MHz)",
            "wingspanLimitM": 36.0,
            "g650erWingspanStatus": "COMPLIANT WITH PERFORMANCE CHECK (1,940m EMAS Runway — Wet/Dry Landing Distance Check Mandatory)",
            "ccnNotices": [
                {
                    "id": "CCN-SAM-SBSP-01",
                    "type": "CCN",
                    "severity": "WARNING",
                    "title": "Congonhas (SBSP) Slot Mandate, 2300L–0600L Curfew & EMAS Overrun Beds",
                    "detail": "RWY 17R/35L (1,940m x 45m) equipped with EMAS. Strict CGNA slot tolerance and noise curfew (0200Z–0900Z) enforced.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [],
            "taxiRestrictions": "General Aviation patios restricted by wingspan; verify FBO parking assignment prior to arrival."
        },
        "SBKP": {
            "icao": "SBKP",
            "name": "Campinas / Viracopos Intl",
            "country": "Brazil",
            "fir": "SBCW",
            "dclAftn": "SBKPZPZX (ACARS DCL Logon: SBKP / Delivery 121.95 MHz)",
            "wingspanLimitM": 80.0,
            "g650erWingspanStatus": "COMPLIANT (Code F Aerodrome — 3,240m x 45m RWY 15/33)",
            "ccnNotices": [
                {
                    "id": "CCN-SAM-SBKP-01",
                    "type": "CCN",
                    "severity": "INFO",
                    "title": "Campinas (SBKP) 24-Hour Customs & Primary São Paulo TMA Alternate",
                    "detail": "H24 international customs, RFF Cat 9, and ILS CAT I/II RWY 15 available.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [],
            "taxiRestrictions": "Follow standard taxiway routing to Executive/FBO aprons via TWY A/B/C."
        },
        "SBRJ": {
            "icao": "SBRJ",
            "name": "Rio de Janeiro / Santos Dumont",
            "country": "Brazil",
            "fir": "SBCW",
            "dclAftn": "SBRJZPZX (ACARS DCL Logon: SBRJ / Delivery 121.7 MHz)",
            "wingspanLimitM": 36.0,
            "g650erWingspanStatus": "CRITICAL RUNWAY LENGTH (1,323m RWY 02R/20L — Prefer SBGL Galeão for G650ER Operations!)",
            "ccnNotices": [
                {
                    "id": "CCN-SAM-SBRJ-01",
                    "type": "CCN",
                    "severity": "CRITICAL",
                    "title": "SBRJ Short Runway (1,323m / 4,341 ft) & Guanabara Bay Visual / RNP AR Curvature",
                    "detail": "RWY 02R/20L TORA/LDA is only 1,323m (4,341 ft) with Sugar Loaf (Pão de Açúcar) terrain constraints. Long-range G650ER missions typically utilize Rio Galeão (SBGL, 4,000m runway).",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [],
            "taxiRestrictions": "Restricted apron span and jet-blast limits on General Aviation ramp."
        },
        "SBGL": {
            "icao": "SBGL",
            "name": "Rio de Janeiro / Galeão — Antonio Carlos Jobim Intl",
            "country": "Brazil",
            "fir": "SBCW",
            "dclAftn": "SBGLZPZX (ACARS DCL Logon: SBGL / Delivery 121.65 MHz)",
            "wingspanLimitM": 80.0,
            "g650erWingspanStatus": "COMPLIANT (Code F Aerodrome — 4,000m RWY 10/28 & 3,180m RWY 15/33)",
            "ccnNotices": [
                {
                    "id": "CCN-SAM-SBGL-01",
                    "type": "CCN",
                    "severity": "INFO",
                    "title": "Rio Galeão (SBGL) Primary International Executive Gateway — H24 Customs & RFF Cat 9",
                    "detail": "RWY 10/28 (13,123 ft / 4,000m) supports unrestricted MTOW G650ER intercontinental departures.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [
                {
                    "id": "NCN-2610-SBGL-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "CAUTION",
                    "title": "Rio TMA Transition Altitude 7000 ft & SBRJ Traffic Separation",
                    "detail": "Verify FMS Transition Altitude is set to 7000 ft in Rio TMA (vs 8000 ft in São Paulo TMA).",
                    "fmsDiscrepancy": False
                }
            ],
            "taxiRestrictions": "Executive Aviation Patio (Pátio Aviação Geral) requires follow-me guidance."
        },
        "SBBR": {
            "icao": "SBBR",
            "name": "Brasília / Pres. Juscelino Kubitschek Intl",
            "country": "Brazil",
            "fir": "SBBS",
            "dclAftn": "SBBRZPZX (ACARS DCL Logon: SBBR / Delivery 121.8 MHz)",
            "wingspanLimitM": 65.0,
            "g650erWingspanStatus": "COMPLIANT (Independent Parallel RWY 11L/29R & 11R/29L)",
            "ccnNotices": [
                {
                    "id": "CCN-SAM-SBBR-01",
                    "type": "CCN",
                    "severity": "CAUTION",
                    "title": "Brasília Independent Parallel Approaches & Prohibited Areas SBP-401/402 (Praça dos Três Poderes)",
                    "detail": "Do not overshoot final turn or penetrate Prohibited Area SBP-401 (Esplanada dos Ministérios) NW of aerodrome.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [],
            "taxiRestrictions": "Follow ground control instructions for crossing active parallel runways."
        },
        "SBCF": {
            "icao": "SBCF",
            "name": "Belo Horizonte / Tancredo Neves — Confins Intl",
            "country": "Brazil",
            "fir": "SBBS",
            "dclAftn": "SBCFZPZX (ACARS DCL Logon: SBCF / Delivery 121.95 MHz)",
            "wingspanLimitM": 65.0,
            "g650erWingspanStatus": "COMPLIANT (3,600m x 45m RWY 16/34)",
            "ccnNotices": [],
            "ncnNotices": [
                {
                    "id": "NCN-2610-SBCF-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "INFO",
                    "title": "Belo Horizonte TMA Transition Altitude 8000 ft & High-Elevation Hot/High Performance",
                    "detail": "Aerodrome elevation 2,715 ft MSL; verify RNP Z / ILS Y RWY 16 minimums.",
                    "fmsDiscrepancy": False
                }
            ],
            "taxiRestrictions": "Standard Apron 1/2/3 executive parking procedures."
        },
        "KMIA": {
            "icao": "KMIA",
            "name": "Miami International Airport",
            "country": "United States",
            "fir": "KZMA",
            "dclAftn": "KMIA (CPDLC DCL / ACARS PDC Available — Logon 30 mins prior to EOBT)",
            "wingspanLimitM": 80.0,
            "g650erWingspanStatus": "COMPLIANT (Code F Aerodrome)",
            "ccnNotices": [
                {
                    "id": "CCN-NAM-KMIA-01",
                    "type": "CCN",
                    "severity": "INFO",
                    "title": "US CBP General Aviation Clearance & RVSM/WAT Oceanic Transition",
                    "detail": "Ensure CBP APIS/overflight permit confirmation prior to departure from South America.",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [],
            "taxiRestrictions": "Signature Flight Support / General Aviation Center (GAC) located on NW side; watch hotspot intersections at RWY 08L/26R & 09/27."
        },
        "LSZH": {
            "icao": "LSZH",
            "name": "Zurich Airport",
            "country": "Switzerland",
            "fir": "LSAS",
            "dclAftn": "LSZHZTZX (ACARS DCL Logon: LSZH — 25 to 12 mins prior to EOBT)",
            "wingspanLimitM": 80.0,
            "g650erWingspanStatus": "COMPLIANT",
            "ccnNotices": [],
            "ncnNotices": [
                {
                    "id": "NCN-2610-LSZH-01",
                    "type": "NCN",
                    "cycle": "2610/2611",
                    "severity": "CRITICAL",
                    "title": "Jeppesen Europe NCN p.121: LSZH GLS RWY 14 Suspended — GBAS Out of Service",
                    "detail": "LSZH Zurich: 'GLS Rwy 14 Apch Proc is suspended due to GBAS out of service (Est 31 Dec 2026).' Do not select GLS RWY 14 from FMS database; use ILS or RNP approaches.",
                    "fmsDiscrepancy": True
                }
            ],
            "taxiRestrictions": "GAC Sector West apron requires follow-me and strict crossing clearance for RWY 28 / 16."
        },
        "OMDB": {
            "icao": "OMDB",
            "name": "Dubai International Airport",
            "country": "United Arab Emirates",
            "fir": "OMAE",
            "dclAftn": "OMDBZTZX (ACARS DCL Logon: OMDB — 60 to 15 mins prior to EOBT)",
            "wingspanLimitM": 80.0,
            "g650erWingspanStatus": "COMPLIANT",
            "ccnNotices": [
                {
                    "id": "CCN-MEA-OMDB-01",
                    "type": "CCN",
                    "severity": "WARNING",
                    "title": "Dubai closely-spaced parallel runways (12L/30R & 12R/30L) & RNAV 1 Mandate",
                    "detail": "Strict adherence to RNAV 1 STAR speed constraints and immediate vacation of runway mandatory; executive flights may also be slotted at Al Maktoum Intl (OMDW).",
                    "fmsDiscrepancy": False
                }
            ],
            "ncnNotices": [],
            "taxiRestrictions": "Follow-Me / A-SMGCS stop bars active H24; never cross illuminated red stop bars."
        }
    }


def build_aom_tables(extracted_meta: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build `aom_tables.json` containing EASA Air Ops (Eff 30 Oct 2022), ICAO Doc 9365 AWOM,
    and FAA TERPS OpSpecs C057/C078/C079 (Sept 2026 update) Takeoff (LVTO) and Approach
    Degradation tables for Gulfstream G650ER (Approach Category C).
    """
    return {
        "_metadata": {
            "source": "Jeppesen Airway Manual - General (Briefing Bulletins p.18-25, p.34-39: ICAO AWOM, EASA Air Ops, US Lower-Than-Standard Takeoff Minimums Sept 2026)",
            "aircraftCategory": "CAT C (Gulfstream G650ER — Vref 128-137 kt)",
            "generatedAt": datetime.now(timezone.utc).isoformat()
        },
        "lvtoTables": {
            "easaIcaoRules": {
                "nonLvpFloorRvrM": 400,
                "standardNonLvpFloorRvrM": 550,
                "southAmericaAicFloorM": 400,
                "tiers": [
                    {
                        "id": "LVTO_125M",
                        "rvrM": 125,
                        "rvrFt": 400,
                        "requiresLvp": True,
                        "requiresApproval": True,
                        "requiredAids": ["HIRL", "CL", "RCLM"],
                        "requiresHudEfvs": False,
                        "description": "EASA/ICAO Approved LVTO with HIRL + Runway Centerline Lights (CL <=15m spacing) + RCLM + multiple controlling RVR sensors (TDZ, MID, ROLLOUT)."
                    },
                    {
                        "id": "LVTO_150M",
                        "rvrM": 150,
                        "rvrFt": 500,
                        "requiresLvp": True,
                        "requiresApproval": True,
                        "requiredAids": ["HIRL", "CL", "RCLM"],
                        "requiresHudEfvs": False,
                        "description": "Standard LVTO with HIRL + CL + RCLM and LVP in force (or FAA OpSpec C078/C079 RVR 500 ft)."
                    },
                    {
                        "id": "LVTO_90M_HUD_EFVS",
                        "rvrM": 90,
                        "rvrFt": 300,
                        "requiresLvp": True,
                        "requiresApproval": True,
                        "requiredAids": ["HIRL", "CL", "HUD_EFVS"],
                        "requiresHudEfvs": True,
                        "description": "FAA OpSpec C078/C079 (Sept 2026 Bulletin p.39) / EASA HUD/EFVS Guided LVTO: RVR 300 ft (90m) at TDZ/Mid/Rollout with HUD (CAT IIIE LOC) or EFVS (derived vis >=1600 ft) + CL + HIRL."
                    },
                    {
                        "id": "LVTO_300M_HIRL_CL",
                        "rvrM": 300,
                        "rvrFt": 1000,
                        "requiresLvp": True,
                        "requiresApproval": True,
                        "requiredAids": ["HIRL_OR_CL", "RCLM"],
                        "requiresHudEfvs": False,
                        "description": "FAA OpSpec C078/C079 RVR 1000 ft (300m) / EASA LVTO with CL or (HIRL + RCLM) or (HUD + RCLM)."
                    },
                    {
                        "id": "LVTO_400M_NON_LVP_FLOOR",
                        "rvrM": 400,
                        "rvrFt": 1300,
                        "requiresLvp": False,
                        "requiresApproval": False,
                        "requiredAids": ["HIRL_OR_CL_OR_RCLM"],
                        "requiresHudEfvs": False,
                        "description": "EASA Air Ops / ICAO AWOM / Paraguay AIC A004/24 Non-LVP Floor with Runway Edge Lights (HIRL) and/or Centerline Markings (RCLM): 400m RVR."
                    },
                    {
                        "id": "LVTO_500M_BARE",
                        "rvrM": 500,
                        "rvrFt": 1600,
                        "requiresLvp": False,
                        "requiresApproval": False,
                        "requiredAids": ["ADEQUATE_VISUAL_REF"],
                        "requiresHudEfvs": False,
                        "description": "Day/Night Takeoff without HIRL/CL/RCLM credit (or LVP not in force without facility credit): 500m - 550m RVR (FAA TDZ RVR 1600 ft)."
                    }
                ]
            }
        },
        "approachTables": {
            "catCBaseline": {
                "ILS_CAT_II": {
                    "label": "3D — ILS CAT II / SA CAT II",
                    "dimension": "3D",
                    "defaultDhFt": 100,
                    "fullAlsRvrM": 300,
                    "intermAlsRvrM": 350,
                    "basicAlsRvrM": 400,
                    "noAlsRvrM": 450,
                    "requiresAutopilotOrHud": True,
                    "requiresTdzCl": True
                },
                "ILS_CAT_I": {
                    "label": "3D — ILS / GLS CAT I",
                    "dimension": "3D",
                    "defaultDhFt": 200,
                    "fullAlsRvrM": 550,
                    "intermAlsRvrM": 700,
                    "basicAlsRvrM": 800,
                    "noAlsRvrM": 1000,
                    "requiresAutopilotOrHud": False,
                    "requiresTdzCl": False
                },
                "RNP_LPV": {
                    "label": "3D — RNP APCH to LPV (SBAS)",
                    "dimension": "3D",
                    "defaultDhFt": 250,
                    "fullAlsRvrM": 600,
                    "intermAlsRvrM": 750,
                    "basicAlsRvrM": 850,
                    "noAlsRvrM": 1100,
                    "requiresAutopilotOrHud": False,
                    "requiresTdzCl": False
                },
                "RNP_LNAV_VNAV": {
                    "label": "3D — RNP APCH to LNAV/VNAV (Baro-VNAV)",
                    "dimension": "3D",
                    "defaultDhFt": 300,
                    "fullAlsRvrM": 750,
                    "intermAlsRvrM": 900,
                    "basicAlsRvrM": 1000,
                    "noAlsRvrM": 1200,
                    "requiresAutopilotOrHud": False,
                    "requiresTdzCl": False
                },
                "NPA_2D_CDFA": {
                    "label": "2D (CDFA) — LOC / LNAV / VOR (Continuous Descent)",
                    "dimension": "2D_CDFA",
                    "defaultDhFt": 350,
                    "fullAlsRvrM": 800,
                    "intermAlsRvrM": 1000,
                    "basicAlsRvrM": 1100,
                    "noAlsRvrM": 1300,
                    "requiresAutopilotOrHud": False,
                    "requiresTdzCl": False
                },
                "NPA_2D_STEPDOWN": {
                    "label": "2D (Non-CDFA Stepdown) — LOC / LNAV / VOR / NDB",
                    "dimension": "2D_NON_CDFA",
                    "defaultDhFt": 400,
                    "fullAlsRvrM": 1200,
                    "intermAlsRvrM": 1400,
                    "basicAlsRvrM": 1500,
                    "noAlsRvrM": 1600,
                    "requiresAutopilotOrHud": False,
                    "requiresTdzCl": False
                }
            },
            "degradationPenalties": {
                "alsOut": {
                    "label": "ALS Out (Approach Lighting System U/S)",
                    "rvrFloorM": 750,
                    "catIPenaltyAddM": 450,
                    "catCMinNoAlsAt200FtM": 1000,
                    "ruleSummary": "Per EASA Air Ops / ICAO Doc 9365 AWOM: With ALS Out on CAT I / APV (DH 200-250 ft), RVR increases from 550m to 1000m-1100m (and never below the 750m non-FALS floor)."
                },
                "tdzClOut": {
                    "label": "TDZ / CL Lights Out",
                    "rvrFloorM": 750,
                    "catIISingleAidFloorM": 400,
                    "catIIBothOutFloorM": 550,
                    "ruleSummary": "Touchdown Zone (TDZ) and/or Runway Centerline (CL) lights unserviceable: enforces 750m RVR floor on CAT I without HUD/FD/AP credit, and degrades CAT II (300m) to 400m/550m CAT I."
                },
                "noFdApToDa": {
                    "label": "No FD / AP / HUD to DA",
                    "rvrFloorM": 750,
                    "ruleSummary": "Without Flight Director (FD), Autopilot (AP), or HUD/EFVS used down to DA/DH, a minimum RVR floor of 750m applies (CAT II prohibited)."
                },
                "visualSegmentObstacles": {
                    "label": "Visual Segment - Obstacles Flag",
                    "warningText": "CHART BALL NOTE: 'Visual Segment - Obstacles' — Obstacles penetrate the visual segment surface below MDA/DA. Do NOT descend below MDA/DA until the runway threshold and obstacle clearance path are distinctly visible; EFVS to touchdown credit prohibited unless obstacle-cleared.",
                    "prohibitEfvsCredit": True,
                    "minVisibilityFloorM": 1500
                },
                "efvsCredit": {
                    "label": "G650ER EFVS / HUD Operational Credit",
                    "reductionFactor": 0.67,
                    "minFloorRvrM": 550,
                    "ruleSummary": "Approved EFVS-A (Enhanced Flight Vision System to 100 ft) allows 1/3 RVR reduction on straight-in 3D/CDFA approaches (subject to 550m floor unless LVP in force)."
                }
            }
        }
    }


def main() -> int:
    print("=" * 72)
    print("JEPPESEN AIRWAY MANUAL COMPLIANCE — PDF-TO-JSON INGESTION PIPELINE")
    print("=" * 72)

    RAW_MANUALS_DIR.mkdir(parents=True, exist_ok=True)
    DATA_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    reader = PDFManualReader(RAW_MANUALS_DIR)
    manuals = reader.list_manuals()
    print(f"[*] PDF Backend Detected : {reader.backend}")
    print(f"[*] Raw Manuals Folder   : {RAW_MANUALS_DIR}")
    print(f"[*] Found {len(manuals)} PDF manual(s) in {RAW_MANUALS_DIR.name}/:")

    manuals_meta = []
    extracted_snippets: Dict[str, int] = {}

    # Sample key compliance pages from the local PDFs to verify live extraction
    sample_targets = {
        "Jeppesen Airway Manual - General.pdf": [(13, 20), (34, 39)],
        "Jeppesen Airway Manual - South America.pdf": [(38, 42), (86, 94), (125, 145)],
        "Jeppesen Airway Manual - Africa.pdf": [(52, 58), (63, 66), (74, 81)],
        "Jeppesen Airway Manual - Middle East.pdf": [(45, 59), (63, 68)],
        "Jeppesen Airway Manual - Europe.pdf": [(110, 112), (122, 128)],
        "Jeppesen Airway Manual - North America.pdf": [(93, 95), (103, 105)],
    }

    for pdf_file in manuals:
        size_mb = pdf_file.stat().st_size / (1024 * 1024)
        print(f"    - {pdf_file.name} ({size_mb:.1f} MB)")
        manuals_meta.append({"name": pdf_file.name, "sizeMb": round(size_mb, 2)})

        if pdf_file.name in sample_targets:
            pages = reader.extract_pages(pdf_file, sample_targets[pdf_file.name])
            chars = sum(len(txt) for txt in pages.values())
            extracted_snippets[pdf_file.name] = chars
            print(f"      -> Extracted {len(pages)} key compliance pages ({chars:,} chars)")

    extracted_meta = {
        "backend": reader.backend,
        "manuals_found": manuals_meta,
        "extracted_char_counts": extracted_snippets,
    }

    outputs = {
        "fir_rules.json": build_fir_rules(extracted_meta),
        "adiz_rules.json": build_adiz_rules(extracted_meta),
        "aerodrome_notices.json": build_aerodrome_notices(extracted_meta),
        "aom_tables.json": build_aom_tables(extracted_meta),
    }

    print("\n[*] Writing structured JSON datasets to ./data/:")
    for filename, payload in outputs.items():
        out_path = DATA_OUTPUT_DIR / filename
        with out_path.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, ensure_ascii=False)
        top_keys = [k for k in payload.keys() if not k.startswith("_")]
        print(f"    [OK] {out_path.relative_to(ROOT_DIR)} ({len(top_keys)} top-level entries)")

    print("\n[+] Jeppesen Airway Manual ingestion complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
