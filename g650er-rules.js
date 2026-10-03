/**
 * AeroBrief G650ER - Gulfstream G650ER Operational Rules & Impact Engine
 * Tailored specifically for executive aviation operations of the GLF6.
 */

export const G650ER_SPECS = {
  model: 'Gulfstream G650ER',
  icaoType: 'GLF6',
  mtowLbs: 103600,
  mtowKg: 47000,
  mlwLbs: 83500,
  mlwKg: 37875,
  wingspanFt: 99.58, // 99 ft 7 in
  wingspanM: 30.36,
  lengthFt: 99.75, // 99 ft 9 in
  lengthM: 30.40,
  tailHeightFt: 25.67,
  outerGearSpanM: 5.26,
  icaoCode: 'Code D', // Wingspan 24m to <36m
  faaGroup: 'Group IV / Group III',
  approachCategory: 'Cat C',
  typicalVref: '115 - 135 kts',
  requiredArffIcao: 'Category 6',
  requiredArffFaa: 'Index B',
  minRunwayWidthFt: 100, // 30m
  preferredRunwayWidthFt: 150, // 45m
  criticalRunwayLengthFt: 5000, // Below 5,000 ft is emergency / extreme no-go
  marginalRunwayLengthFt: 6000, // 5,000 - 6,000 ft requires strict AFM performance check
  standardRunwayLengthFt: 6500  // ≥ 6,500 ft standard comfort
};

export class G650ERRulesEngine {
  /**
   * Evaluate a NOTAM against G650ER specifications and the flight context.
   * flightContext: {
   *   stage: 'DEP' | 'ARR' | 'ALT',
   *   targetUtc: Date,
   *   airportIcao: string,
   *   bufferHours: number
   * }
   */
  static evaluate(notam, flightContext = {}) {
    const text = (notam.bodyText || notam.raw || '').toUpperCase();
    const qCode = (notam.qCode || '').toUpperCase();

    const evaluation = {
      severity: 'INFO', // 'CRITICAL', 'CAUTION', 'ADVISORY', 'INFO'
      severityScore: 10, // 10 to 100
      impactTitle: 'Standard Aeronautical Information',
      pilotAction: '',
      executiveSummary: '',
      tags: [],
      isSpecificToG650ER: false,
      g650erHighlights: []
    };

    // 1. RUNWAY CLOSURES & REDUCED RUNWAY LENGTHS
    if (this.isRunwayClosed(text, qCode)) {
      const rwyMatch = text.match(/RWY\s*([0-9]{2}[LRC]?(\/[0-9]{2}[LRC]?)?)/i);
      const rwyName = rwyMatch ? rwyMatch[1] : 'Runway';

      evaluation.severity = 'CRITICAL';
      evaluation.severityScore = 95;
      evaluation.impactTitle = `Runway Closure: RWY ${rwyName} Closed`;
      evaluation.tags.push('RWY CLSD', 'CRITICAL');
      evaluation.executiveSummary = `Runway ${rwyName} is confirmed CLOSED during the active period. If this is the primary or sole suitable runway for G650ER operations, flight diversion or rescheduling is mandatory.`;
      evaluation.pilotAction = `Verify remaining active runway length (min 6,000 ft required for standard G650ER ops) and crosswind component. Check if alternate airport is required.`;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(`G650ER MTOW 103,600 lbs requires runway verification.`);
      return evaluation;
    }

    // 2. RUNWAY SHORTENING / DISPLACED THRESHOLD / REDUCED LDA
    const rwyLengthImpact = this.checkRunwayDistanceReduction(text);
    if (rwyLengthImpact) {
      evaluation.severity = rwyLengthImpact.severity;
      evaluation.severityScore = rwyLengthImpact.score;
      evaluation.impactTitle = rwyLengthImpact.title;
      evaluation.tags.push('RWY LENGTH', rwyLengthImpact.severity);
      evaluation.executiveSummary = rwyLengthImpact.summary;
      evaluation.pilotAction = rwyLengthImpact.action;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(rwyLengthImpact.highlight);
      return evaluation;
    }

    // 3. AIRPORT-WIDE WINGSPAN LIMIT (e.g. KASE 95 FT MAX WINGSPAN LIMIT)
    const adSpanImpact = this.checkAirportWingspanLimit(text, qCode);
    if (adSpanImpact) {
      evaluation.severity = adSpanImpact.severity;
      evaluation.severityScore = adSpanImpact.score;
      evaluation.impactTitle = adSpanImpact.title;
      evaluation.tags.push('AIRPORT WINGSPAN LIMIT', 'NO-GO');
      evaluation.executiveSummary = adSpanImpact.summary;
      evaluation.pilotAction = adSpanImpact.action;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(adSpanImpact.highlight);
      return evaluation;
    }

    // 4. AIRPORT CLOSURES / CURFEW CONFLICTS
    if (this.isAirportClosedOrCurfew(text, qCode)) {
      evaluation.severity = 'CRITICAL';
      evaluation.severityScore = 90;
      evaluation.impactTitle = 'Aerodrome Closed / Strict Curfew Active';
      evaluation.tags.push('AD CLSD / CURFEW', 'CRITICAL');
      evaluation.executiveSummary = `Aerodrome is completely CLOSED or subject to strict operational curfew during the scheduled hours.`;
      evaluation.pilotAction = `Ensure ETD/ETA strictly avoids closed window. Executive flights outside operating hours will be refused landing or subject to heavy noise violation fines.`;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(`G650ER APU and engine start must comply with local airport noise curfews.`);
      return evaluation;
    }

    // 4. JET FUEL / REFUELING RESTRICTIONS
    if (this.isFuelRestriction(text, qCode)) {
      evaluation.severity = 'CRITICAL';
      evaluation.severityScore = 85;
      evaluation.impactTitle = 'Fuel Advisory: Jet-A/A1 Refueling Impact';
      evaluation.tags.push('FUEL AVAILABILITY', 'HIGH RISK');
      evaluation.executiveSummary = `Jet-A/Jet-A1 fuel availability is restricted, contaminated, or unavailable. G650ER fuel capacity is 48,200 lbs (7,194 gal).`;
      evaluation.pilotAction = `Calculate tanker fuel requirements prior to departure, or plan an en-route technical fuel stop. Coordinate with FBO handling immediately.`;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(`Gulfstream G650ER maximum fuel capacity is 48,200 lbs (approx 7,194 USG). Plan fuel tankering.`);
      return evaluation;
    }

    // 5. TAXIWAY RESTRICTIONS & WINGSPAN / WEIGHT LIMITS (CRITICAL FOR G650ER!)
    const twyImpact = this.checkTaxiwayAndWingspan(text, qCode);
    if (twyImpact) {
      evaluation.severity = twyImpact.severity;
      evaluation.severityScore = twyImpact.score;
      evaluation.impactTitle = twyImpact.title;
      evaluation.tags.push('TAXIWAY / WINGSPAN', twyImpact.severity);
      evaluation.executiveSummary = twyImpact.summary;
      evaluation.pilotAction = twyImpact.action;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(twyImpact.highlight);
      return evaluation;
    }

    // 6. CUSTOMS, IMMIGRATION & PORT OF ENTRY (AOE)
    if (this.isCustomsImpact(text, qCode)) {
      evaluation.severity = 'CRITICAL';
      evaluation.severityScore = 80;
      evaluation.impactTitle = 'Customs & Border Protection (AOE) Disruption';
      evaluation.tags.push('CUSTOMS / AOE', 'INTERNATIONAL OPS');
      evaluation.executiveSummary = `Customs/Immigration/Port of Entry clearance modified or unavailable. Critical for international executive passengers.`;
      evaluation.pilotAction = `Confirm Customs clearance arrangements via handling agent / FBO prior to departure. Flights landing without Customs will remain sealed on ramp.`;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(`Executive VIP passengers cannot clear passport control if AOE hours are reduced.`);
      return evaluation;
    }

    // 7. INSTRUMENT APPROACHES & ILS OUTAGES
    const approachImpact = this.checkApproachAndNavaids(text, qCode);
    if (approachImpact) {
      evaluation.severity = approachImpact.severity;
      evaluation.severityScore = approachImpact.score;
      evaluation.impactTitle = approachImpact.title;
      evaluation.tags.push('IAP / ILS', approachImpact.severity);
      evaluation.executiveSummary = approachImpact.summary;
      evaluation.pilotAction = approachImpact.action;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(approachImpact.highlight);
      return evaluation;
    }

    // 8. RESCUE & FIRE FIGHTING (ARFF / RFFS) DOWNGRADE
    const arffImpact = this.checkArffRffs(text, qCode);
    if (arffImpact) {
      evaluation.severity = arffImpact.severity;
      evaluation.severityScore = arffImpact.score;
      evaluation.impactTitle = arffImpact.title;
      evaluation.tags.push('ARFF / RFFS', arffImpact.severity);
      evaluation.executiveSummary = arffImpact.summary;
      evaluation.pilotAction = arffImpact.action;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(arffImpact.highlight);
      return evaluation;
    }

    // 9. PRIOR PERMISSION REQUIRED (PPR) / SLOTS / PARKING
    if (this.isPprOrSlotRequired(text, qCode)) {
      evaluation.severity = 'CAUTION';
      evaluation.severityScore = 65;
      evaluation.impactTitle = 'Prior Permission Required (PPR) / Ramp Parking Slot';
      evaluation.tags.push('PPR / SLOTS', 'HANDLING');
      evaluation.executiveSummary = `Airport or ramp parking restricted to prior permission / slot reservation. Executive ramp congestion in effect.`;
      evaluation.pilotAction = `Verify PPR confirmation number with FBO handling. Drop-and-go may be required if overnight ramp parking is denied.`;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(`G650ER requires large executive ramp footprint (99'8" span x 99'9" length).`);
      return evaluation;
    }

    // 10. LIGHTING & VISUAL AIDS (PAPI, ALS, RCLL)
    const lightingImpact = this.checkLighting(text, qCode);
    if (lightingImpact) {
      evaluation.severity = lightingImpact.severity;
      evaluation.severityScore = lightingImpact.score;
      evaluation.impactTitle = lightingImpact.title;
      evaluation.tags.push('LIGHTING / VISUAL', lightingImpact.severity);
      evaluation.executiveSummary = lightingImpact.summary;
      evaluation.pilotAction = lightingImpact.action;
      return evaluation;
    }

    // 11. OBSTACLES & CRANES NEAR AIRPORT
    if (this.isObstacle(text, qCode)) {
      evaluation.severity = 'ADVISORY';
      evaluation.severityScore = 40;
      evaluation.impactTitle = 'Obstacle Alert: Temporary Crane / Mast Erected';
      evaluation.tags.push('OBSTACLE', 'ADVISORY');
      evaluation.executiveSummary = `Temporary obstacle erected in vicinity of airport / runway approach or departure corridor.`;
      evaluation.pilotAction = `Review departure net takeoff flight path (OEI - One Engine Inoperative climb gradient) to ensure adequate obstacle clearance.`;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(`Verify G650ER FMS obstacle data and emergency turn procedures for departure.`);
      return evaluation;
    }

    // 12. RUNWAY CONTAMINATION / BRAKING ACTION
    if (this.isBrakingActionOrContamination(text)) {
      evaluation.severity = 'CAUTION';
      evaluation.severityScore = 70;
      evaluation.impactTitle = 'Runway Surface Condition / Braking Action Advisory';
      evaluation.tags.push('BRAKING ACTION', 'CAUTION');
      evaluation.executiveSummary = `Runway contamination reported (water, slush, snow, or reduced friction coefficient).`;
      evaluation.pilotAction = `Consult Gulfstream Quick Reference Handbook (QRH) contaminated runway landing distances. Factor in crosswind limits.`;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(`G650ER contaminated runway landing field length requires AFM factored distances.`);
      return evaluation;
    }

    // 13. DEFAULT ADVISORY / INFO
    evaluation.severity = 'INFO';
    evaluation.severityScore = 20;
    evaluation.impactTitle = 'General Airport Advisory';
    evaluation.tags.push('ROUTINE');
    evaluation.executiveSummary = `Routine aeronautical information or secondary maintenance activity.`;
    evaluation.pilotAction = `Review for general flight awareness.`;

    return evaluation;
  }

  // --- HELPER RULES METHODS ---

  static isRunwayClosed(text, qCode) {
    if (qCode.startsWith('QMR') && (qCode.endsWith('LC') || qCode.endsWith('AU'))) return true;
    return /(?:RWY|RUNWAY)\s*([0-9]{2}[LRC]?(\/[0-9]{2}[LRC]?)?)\s*(?:CLSD|CLOSED|UNAVAILABLE)/i.test(text) ||
           /(?:ALL\s+RUNWAYS|RWYS)\s*CLSD/i.test(text);
  }

  static checkRunwayDistanceReduction(text) {
    // Check for displaced threshold or declared distance changes
    const isDisplaced = /DISPLACED\s+THR|DTHR|DECLARED\s+DIST|TORA|TODA|ASDA|LDA/i.test(text);
    if (!isDisplaced) return null;

    // Try to extract distance numbers (in feet or meters)
    let extractedFt = null;
    const ftMatch = text.match(/(?:LDA|TORA|TODA|ASDA|DIST|REDUCED\s+TO)\s*[:=]?\s*([0-9]{4,5})\s*(?:FT|FEET)?/i);
    const mMatch = text.match(/(?:LDA|TORA|TODA|ASDA|DIST|REDUCED\s+TO)\s*[:=]?\s*([0-9]{3,4})\s*M(?:ETRES|ETERS)?/i);

    if (ftMatch) {
      extractedFt = parseInt(ftMatch[1], 10);
    } else if (mMatch) {
      extractedFt = Math.round(parseInt(mMatch[1], 10) * 3.28084);
    }

    if (extractedFt !== null) {
      if (extractedFt < G650ER_SPECS.criticalRunwayLengthFt) {
        return {
          severity: 'CRITICAL',
          score: 92,
          title: `Critical Runway Shortening: Available Length ${extractedFt} FT (< 5,000 FT)`,
          summary: `Runway declared distance is reduced to ${extractedFt} ft. This is BELOW the safe practical operating limit for a Gulfstream G650ER at MTOW or typical landing weights!`,
          action: `Mandatory G650ER Aircraft Flight Manual (AFM) calculation. Immediate diversion or alternative runway required.`,
          highlight: `Available ${extractedFt} ft is below G650ER practical threshold (6,000 ft). Severe overrun hazard.`
        };
      } else if (extractedFt < G650ER_SPECS.marginalRunwayLengthFt) {
        return {
          severity: 'CAUTION',
          score: 75,
          title: `Runway Length Restriction: Available Length ${extractedFt} FT (5,000 - 6,000 FT)`,
          summary: `Runway declared distance is reduced to ${extractedFt} ft. Marginal for G650ER operations.`,
          action: `Compute precise AFM Part 25 field length. Verify dry runway, zero tailwind, and anti-skid operative.`,
          highlight: `G650ER requires ~5,858 ft at MTOW (SL, ISA). Careful weight & fuel planning necessary.`
        };
      }
    }

    return {
      severity: 'CAUTION',
      score: 65,
      title: 'Displaced Threshold / Revised Declared Distances (TORA/LDA)',
      summary: `Threshold displaced or declared distances modified. Landing/takeoff available distances are reduced.`,
      action: `Cross-check actual available LDA/TORA against G650ER dispatch field length performance charts.`,
      highlight: `Check displaced threshold distance in FMS runway database.`
    };
  }

  static checkAirportWingspanLimit(text, qCode) {
    if (!text.includes('WINGSPAN') && !text.includes('SPAN') && !text.includes('CODE C')) return null;

    const isAirportWide = /AD\s+RESTRICTION|AERODROME\s+RESTRICTION|AIRPORT\s+RESTRICTION|PROHIBITED\s+FROM\s+ALL\s+OPERATIONS/i.test(text);
    if (!isAirportWide) return null;

    const spanMatchFt = text.match(/(?:MAX(?:IMUM)?\s*(?:ACFT\s*)?(?:WING)?SPAN|SPAN\s*RESTRICTED\s*TO|WINGSPAN\s*EXCEEDING|WINGSPAN\s*LIMITED\s*TO)\s*[:=]?\s*([0-9]{2,3})\s*(?:FT|FEET)?/i);
    const spanMatchM = text.match(/(?:MAX(?:IMUM)?\s*(?:ACFT\s*)?(?:WING)?SPAN|SPAN\s*RESTRICTED\s*TO|WINGSPAN\s*EXCEEDING|WINGSPAN\s*LIMITED\s*TO)\s*[:=]?\s*([0-9]{2})\s*M(?:ETRES|ETERS)?/i);

    let maxSpanFt = null;
    if (spanMatchFt) {
      maxSpanFt = parseInt(spanMatchFt[1], 10);
    } else if (spanMatchM) {
      maxSpanFt = Math.round(parseInt(spanMatchM[1], 10) * 3.28084);
    }

    if (maxSpanFt && maxSpanFt < 100) {
      return {
        severity: 'CRITICAL',
        score: 99,
        title: `CRITICAL AIRPORT WINGSPAN PROHIBITION: Max Wingspan ${maxSpanFt} FT (< 99'7")`,
        summary: `Aerodrome strictly prohibits aircraft with wingspan exceeding ${maxSpanFt} ft (such as KASE Aspen). Gulfstream G650ER wingspan is 99 ft 7 in (30.36m). Operations strictly prohibited without formal airport/FAA waiver.`,
        action: `NO-GO for standard G650ER operations. Divert to suitable alternate (e.g. KRIL Rifle, KEGE Eagle, or KGJT Grand Junction).`,
        highlight: `G650ER wingspan (99'7") exceeds posted aerodrome maximum (${maxSpanFt} ft). High risk of grounding/fine.`
      };
    }
    return null;
  }

  static isAirportClosedOrCurfew(text, qCode) {
    if (qCode.startsWith('QFA') && (qCode.endsWith('LC') || qCode.endsWith('AU'))) return true;
    return /AD\s+CLSD|AERODROME\s+CLSD|AIRPORT\s+CLOSED|OPERATING\s+HOURS|NIGHT\s+CURFEW|VOLUNTARY\s+CURFEW|TWR\s+CLSD.*CLASS\s+G/i.test(text);
  }

  static isFuelRestriction(text, qCode) {
    if (qCode.startsWith('QFU')) return true;
    return /JET\s*A(?:-?1)?\s*(?:NOT\s*AVBL|UNAVAILABLE|U\/S|SHORTAGE|CONTAMINATED)|NO\s*JET\s*FUEL|AVGAS\s*ONLY/i.test(text);
  }

  static checkTaxiwayAndWingspan(text, qCode) {
    const isTwy = qCode.startsWith('QMX') || /TWY|TAXIWAY|TAXILANE/i.test(text);
    if (!isTwy) return null;

    // Check for wingspan limitations!
    const spanMatchFt = text.match(/(?:MAX(?:IMUM)?\s*(?:WING)?SPAN|SPAN\s*RESTRICTED\s*TO|WINGSPAN\s*LIMITED\s*TO)\s*[:=]?\s*([0-9]{2,3})\s*(?:FT|FEET)?/i);
    const spanMatchM = text.match(/(?:MAX(?:IMUM)?\s*(?:WING)?SPAN|SPAN\s*RESTRICTED\s*TO|WINGSPAN\s*LIMITED\s*TO)\s*[:=]?\s*([0-9]{2})\s*M(?:ETRES|ETERS)?/i);

    let maxSpanFt = null;
    if (spanMatchFt) {
      maxSpanFt = parseInt(spanMatchFt[1], 10);
    } else if (spanMatchM) {
      maxSpanFt = Math.round(parseInt(spanMatchM[1], 10) * 3.28084);
    }

    // Code C vs Code D restriction
    const isRestrictedCodeC = /CODE\s*C\s*(?:OR\s*BELOW|ONLY|MAX)|ACFT\s*DESIGN\s*GROUP\s*(?:I{1,3})\s*ONLY/i.test(text);

    if ((maxSpanFt && maxSpanFt < 100) || isRestrictedCodeC) {
      return {
        severity: 'CRITICAL',
        score: 88,
        title: `CRITICAL WINGSPAN WARNING: Taxiway Restricted (${maxSpanFt ? maxSpanFt + ' FT' : 'Code C Only'})`,
        summary: `Taxiway is restricted to aircraft with wingspan less than 100 ft or ICAO Code C! The Gulfstream G650ER has a wingspan of 99 ft 7 in (30.36m, ICAO Code D).`,
        action: `DO NOT TAXI on this taxiway. Request progressive taxi instructions or alternate routing from Ground Control.`,
        highlight: `G650ER wingspan is 99.6 ft (Code D). Taxiway wingtip clearance is NOT guaranteed.`
      };
    }

    // Weight restrictions on taxiway
    const weightMatch = text.match(/(?:MAX(?:IMUM)?\s*(?:ACFT\s*)?(?:WT|WEIGHT)|WEIGHT\s*RESTRICTION)\s*[:=]?\s*([0-9]{2,6})\s*(?:LBS|KG|TONS?)/i);
    if (weightMatch) {
      return {
        severity: 'CAUTION',
        score: 72,
        title: 'Taxiway Aircraft Weight Restriction In Effect',
        summary: `Taxiway has maximum allowable gross weight restriction. G650ER ramp weight reaches up to 104,000 lbs.`,
        action: `Verify current gross weight does not exceed posted taxiway pavement bearing capacity (PCN/ACN).`,
        highlight: `G650ER MTOW is 103,600 lbs. Pavement structural damage risk.`
      };
    }

    // General Taxiway Closure
    if (/CLSD|CLOSED|U\/S|UNSERVICEABLE/i.test(text)) {
      const twyNameMatch = text.match(/TWY\s*([A-Z0-9]+)/i);
      const twyName = twyNameMatch ? twyNameMatch[1] : 'Taxiway';
      return {
        severity: 'CAUTION',
        score: 60,
        title: `Taxiway ${twyName} Closed`,
        summary: `Taxiway ${twyName} is closed. Routing to FBO or active runway may require back-track or detour.`,
        action: `Brief taxi routing on airport diagram. Plan extra taxi fuel and monitor FMS taxi camera / synthetic vision.`,
        highlight: `Verify route to executive FBO ramp avoids closed taxiway.`
      };
    }

    return null;
  }

  static isCustomsImpact(text, qCode) {
    if (qCode.startsWith('QCP')) return true;
    return /CUSTOMS|IMMIGRATION|PORT\s+OF\s+ENTRY|AOE\s+HOURS|BORDER\s+CONTROL|PASSPORT\s+CONTROL/i.test(text) &&
           /CLSD|CLOSED|NOT\s+AVBL|HOURS|REDUCED|SUSPENDED/i.test(text);
  }

  static checkApproachAndNavaids(text, qCode) {
    const isApproach = qCode.startsWith('QIC') || qCode.startsWith('QIL') || qCode.startsWith('QIG') ||
                       /ILS|LOCALIZER|GLIDEPATH|GLIDESLOPE|LOC|GP|DME|RNAV|RNP|LPV|IAP/i.test(text);
    if (!isApproach) return null;

    if (/U\/S|OTS|UNSERVICEABLE|OUT\s+OF\s+SERVICE|WITHDRAWN|OFF\s+AIR/i.test(text)) {
      const isIls = /ILS|LOC|GLIDEPATH|GLIDESLOPE|GP|QIC/i.test(text);
      return {
        severity: 'CAUTION',
        score: 70,
        title: isIls ? 'ILS / Glidepath Unserviceable (Cat I/II/III Unavailable)' : 'Navaid / Approach Unserviceable',
        summary: `Instrument approach aid is out of service. Precision CAT II/III approaches unavailable; non-precision or RNP RNAV minimums apply.`,
        action: `Check destination weather against higher non-precision or RNP approach minimums. Verify alternate weather requirements.`,
        highlight: `G650ER HUD/EVS CAT II/III landing capability restricted if ground NAVAID is OTS.`
      };
    }

    return null;
  }

  static checkArffRffs(text, qCode) {
    if (qCode.startsWith('QFF') || /RFFS|ARFF|FIRE\s*FIGHTING|RESCUE\s*SERVICES/i.test(text)) {
      const isDowngraded = /DOWNGRADED|REDUCED|CAT\s*[1-5]|INDEX\s*A/i.test(text);
      if (isDowngraded) {
        return {
          severity: 'CAUTION',
          score: 65,
          title: 'ARFF / RFFS Downgraded Below G650ER Standard (ICAO Cat 6 / FAA Index B)',
          summary: `Aerodrome Rescue and Fire Fighting capability reduced below ICAO Category 6.`,
          action: `Verify company Operations Specifications (OpsSpecs) and insurance coverage for low ARFF category operations.`,
          highlight: `Gulfstream G650ER requires ICAO Cat 6 / FAA Index B for standard operations.`
        };
      }
    }
    return null;
  }

  static isPprOrSlotRequired(text, qCode) {
    if (qCode.startsWith('QSP')) return true;
    return /PPR|PRIOR\s+PERMISSION\s+REQUIRED|AIRPORT\s+SLOT|RAMP\s+SLOT|PARKING\s+RESERVATION/i.test(text);
  }

  static checkLighting(text, qCode) {
    if (qCode.startsWith('QLP') || /PAPI|VASI/i.test(text)) {
      if (/U\/S|OTS|UNSERVICEABLE|OUT\s+OF\s+SERVICE/i.test(text)) {
        return {
          severity: 'CAUTION',
          score: 55,
          title: 'Visual Glide Slope Indicator (PAPI/VASI) Out of Service',
          summary: `PAPI/VASI visual approach slope indicator unserviceable.`,
          action: `Use G650ER Synthetic Vision flight path vector and ILS/RNAV glidepath for visual approach angle guidance.`,
          highlight: `Night visual approaches require higher vigilance without PAPI.`
        };
      }
    }
    if (qCode.startsWith('QLA') || /ALS|ALSF|MALSR|APPROACH\s+LIGHTS/i.test(text)) {
      if (/U\/S|OTS|UNSERVICEABLE/i.test(text)) {
        return {
          severity: 'CAUTION',
          score: 60,
          title: 'Approach Lighting System (ALS) Out of Service',
          summary: `Approach lighting system unserviceable. Visibility minimums will increase.`,
          action: `Apply inoperative lighting penalty to approach minimums (typically +1/4 SM or +400m RVR).`,
          highlight: `Landing minimums raised for night and low-visibility arrivals.`
        };
      }
    }
    return null;
  }

  static isObstacle(text, qCode) {
    if (qCode.startsWith('QOB')) return true;
    return /OBST|CRANE|MAST|TOWER\s+ERECTED|TEMPORARY\s+OBSTACLE/i.test(text);
  }

  static isBrakingActionOrContamination(text) {
    return /BRAKING\s+ACTION|BA\s+(?:POOR|NIL|MEDIUM)|FICON|SLIPPERY|CONTAMINATED\s+RWY|SNOWTAM|RUNWAY\s+CONDITION\s+REPORT/i.test(text);
  }
}
