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
  icaoCode: 'Code D',
  faaGroup: 'Group IV / Group III',
  approachCategory: 'Cat C',
  typicalVref: '115 - 135 kts',
  requiredArffIcao: 'Category 6',
  requiredArffFaa: 'Index B',
  minRunwayWidthFt: 100,
  preferredRunwayWidthFt: 150,
  criticalRunwayLengthFt: 5000,
  marginalRunwayLengthFt: 6000,
  standardRunwayLengthFt: 6500
};

export class G650ERRulesEngine {
  /**
   * Evaluate a NOTAM against G650ER specifications and the flight context.
   */
  static evaluate(notam, flightContext = {}) {
    const rawEval = this.evaluateInternal(notam, flightContext);
    return this.applyClutterTag(rawEval, notam);
  }

  static applyClutterTag(evaluation, notam) {
    evaluation.isClutter = false;
    evaluation.clutterReason = '';

    if (!notam) return evaluation;
    const text = `${notam.bodyText || ''} ${notam.raw || ''}`.toUpperCase();
    const p = notam.parsed || notam;

    // Critical and Caution are operational priorities and NEVER clutter
    if (evaluation.severity === 'CRITICAL' || evaluation.severity === 'CAUTION') {
      return evaluation;
    }

    // Never clutter primary runway, approach lighting, navaid, fuel, or customs notices
    if (['RUNWAY', 'APPROACH_LIGHTING', 'NAVAID_APPROACH', 'FUEL', 'CUSTOMS'].includes(p.category)) {
      return evaluation;
    }

    // Grass cutting / mowing
    if (/\b(?:GRASS\s+CUTTING|MOWING|WEED|VEGETATION)\b/i.test(text)) {
      evaluation.isClutter = true;
      evaluation.clutterReason = 'Grass mowing / vegetation maintenance';
      return evaluation;
    }

    // Bird activity / wildlife hazard without runway closure
    if (/\b(?:BIRD\s+(?:ACTIVITY|HAZARD|STRIKE|WATCH|CONCENTRATION)|WILDLIFE\s+HAZARD|AVIAN\s+HAZARD|FLOCKS?\s+OF\s+BIRDS?)\b/i.test(text)) {
      evaluation.isClutter = true;
      evaluation.clutterReason = 'Routine wildlife / bird concentration notice';
      return evaluation;
    }

    // Administrative, contact, telephone, AIP SUP, Trigger notices
    if (/\b(?:TEL\s+(?:NO|NUM|CHANGED)|PHONE\s+(?:NO|NUM)|OFFICE\s+HOURS|OFFICE\s+HRS|ADMINISTRATIVE|CONTACT\s+DETAILS|AIP\s+SUP|TRIGGER\s+NOTAM)\b/i.test(text) || p.category === 'ADMIN_AIP') {
      evaluation.isClutter = true;
      evaluation.clutterReason = 'Administrative / AIP publication notice';
      return evaluation;
    }

    // Commercial passenger jetway outages (G650ER has built-in airstairs)
    if (/\b(?:JETWAY|PASSENGER\s+BOARDING\s+BRIDGE|PBB\s+U\/S)\b/i.test(text) || evaluation.tags.includes('TERMINAL')) {
      evaluation.isClutter = true;
      evaluation.clutterReason = 'Commercial jetbridge out of service (Zero G650ER impact)';
      return evaluation;
    }

    // Apron line painting / marking maintenance without closure
    if (/\b(?:LINE\s+MARKING|PAINTING|MARKING\s+MAINT)\b/i.test(text) && !/\b(?:CLSD|CLOSED)\b/i.test(text)) {
      evaluation.isClutter = true;
      evaluation.clutterReason = 'Routine apron painting / line markings';
      return evaluation;
    }

    // Distant / low obstacle outside approach path
    if (evaluation.tags.includes('OBSTACLE')) {
      if (typeof p.distanceFromNearestNm === 'number' && p.distanceFromNearestNm > 2.5) {
        evaluation.isClutter = true;
        evaluation.clutterReason = 'Low obstacle > 2.5 NM from runway threshold';
        return evaluation;
      }
      if (/\b(?:150FT\s*AGL|100FT\s*AGL|80FT\s*AGL|60FT\s*AGL|40FT\s*AGL)\b/i.test(text)) {
        evaluation.isClutter = true;
        evaluation.clutterReason = 'Low-height obstacle (< 150 ft AGL)';
        return evaluation;
      }
    }

    // Routine beacon / windsock / anemometer light bulb maintenance
    if (/\b(?:WDI\s+LIGHT|ANEMOMETER\s+LIGHT|ABN\s+U\/S|WIND\s+CONE\s+LIGHT)\b/i.test(text)) {
      evaluation.isClutter = true;
      evaluation.clutterReason = 'Routine windsock / beacon light bulb maintenance';
      return evaluation;
    }

    // Routine general notices with no pilot action required
    if (evaluation.severity === 'INFO' && !evaluation.pilotAction) {
      evaluation.isClutter = true;
      evaluation.clutterReason = 'Routine low-impact notice (No crew action required)';
      return evaluation;
    }

    return evaluation;
  }

  static evaluateInternal(notam, flightContext = {}) {
    const text = (notam.bodyText || notam.raw || '').toUpperCase();
    const qCode = (notam.qCode || '').toUpperCase();

    const evaluation = {
      severity: 'INFO', // 'CRITICAL', 'CAUTION', 'ADVISORY', 'INFO'
      severityScore: 10,
      impactTitle: 'Aeronautical Advisory',
      shortImpact: 'Routine notice',
      pilotAction: '',
      executiveSummary: '',
      tags: [],
      isSpecificToG650ER: false,
      g650erHighlights: []
    };

    // 1. RUNWAY CLOSURES (Multilingual)
    if (this.isRunwayClosed(text, qCode)) {
      const rwyMatch = text.match(/(?:RWY|RUNWAY|PISTA)\s*([0-9]{2}[LRC]?(?:\/[0-9]{2}[LRC]?)?)/i);
      const rwyName = rwyMatch ? rwyMatch[1] : 'Runway';
      const schedInfo = notam.scheduleRaw ? ` (${notam.scheduleRaw})` : '';

      evaluation.severity = 'CRITICAL';
      evaluation.severityScore = 95;
      evaluation.impactTitle = `Runway ${rwyName} Closed${schedInfo}`;
      evaluation.shortImpact = `RWY ${rwyName} Closed`;
      evaluation.tags.push('RWY CLSD');
      evaluation.executiveSummary = `Runway ${rwyName} is closed during the published window${schedInfo}. If active during your ETD/ETA, verify alternate runway availability or reschedule.`;
      evaluation.pilotAction = `Verify remaining active runway length (≥ 6,000 ft standard for G650ER) or confirm flight operates outside closure window.`;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(`G650ER MTOW (103,600 lbs) requires min 6,000 ft standard runway.`);
      return evaluation;
    }

    // 2. RUNWAY SHORTENING / DISPLACED THRESHOLD / REDUCED LDA
    const rwyLengthImpact = this.checkRunwayDistanceReduction(text);
    if (rwyLengthImpact) {
      evaluation.severity = rwyLengthImpact.severity;
      evaluation.severityScore = rwyLengthImpact.score;
      evaluation.impactTitle = rwyLengthImpact.title;
      evaluation.shortImpact = rwyLengthImpact.shortImpact;
      evaluation.tags.push('RWY LENGTH');
      evaluation.executiveSummary = rwyLengthImpact.summary;
      evaluation.pilotAction = rwyLengthImpact.action;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(rwyLengthImpact.highlight);
      return evaluation;
    }

    // 3. AIRPORT-WIDE WINGSPAN / WEIGHT LIMIT (e.g. KASE 95 FT MAX WINGSPAN or 100K LBS)
    const adLimitImpact = this.checkAirportWideLimits(text, qCode);
    if (adLimitImpact) {
      evaluation.severity = adLimitImpact.severity;
      evaluation.severityScore = adLimitImpact.score;
      evaluation.impactTitle = adLimitImpact.title;
      evaluation.shortImpact = adLimitImpact.shortImpact;
      evaluation.tags.push('AIRPORT LIMIT');
      evaluation.executiveSummary = adLimitImpact.summary;
      evaluation.pilotAction = adLimitImpact.action;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(adLimitImpact.highlight);
      return evaluation;
    }

    // 4. PAVEMENT BEARING CAPACITY / PCR / PCN
    const pcrImpact = this.checkPavementStrength(notam, text);
    if (pcrImpact) {
      evaluation.severity = pcrImpact.severity;
      evaluation.severityScore = pcrImpact.score;
      evaluation.impactTitle = pcrImpact.title;
      evaluation.shortImpact = pcrImpact.shortImpact;
      evaluation.tags.push('PCR / PCN');
      evaluation.executiveSummary = pcrImpact.summary;
      evaluation.pilotAction = pcrImpact.action;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(pcrImpact.highlight);
      return evaluation;
    }

    // 5. GPS JAMMING, SPOOFING & AVIONICS INTERFERENCE
    const gpsImpact = this.checkGpsSpoofing(text, qCode);
    if (gpsImpact) {
      evaluation.severity = gpsImpact.severity;
      evaluation.severityScore = gpsImpact.score;
      evaluation.impactTitle = gpsImpact.title;
      evaluation.shortImpact = 'GPS Spoofing / Jamming';
      evaluation.tags.push('GPS ALERT');
      evaluation.executiveSummary = gpsImpact.summary;
      evaluation.pilotAction = gpsImpact.action;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(gpsImpact.highlight);
      return evaluation;
    }

    // 6. AIRPORT CLOSURES / CURFEW / NOISE ABATEMENT / APU
    const curfewImpact = this.checkCurfewOrNoise(text, qCode);
    if (curfewImpact) {
      evaluation.severity = curfewImpact.severity;
      evaluation.severityScore = curfewImpact.score;
      evaluation.impactTitle = curfewImpact.title;
      evaluation.shortImpact = curfewImpact.shortImpact;
      evaluation.tags.push(curfewImpact.tag);
      evaluation.executiveSummary = curfewImpact.summary;
      evaluation.pilotAction = curfewImpact.action;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(curfewImpact.highlight);
      return evaluation;
    }

    // 7. JET FUEL / REFUELING RESTRICTIONS
    if (this.isFuelRestriction(text, qCode)) {
      evaluation.severity = 'CRITICAL';
      evaluation.severityScore = 85;
      evaluation.impactTitle = 'Jet-A / Jet-A1 Fuel Supply Restriction';
      evaluation.shortImpact = 'Fuel Restriction';
      evaluation.tags.push('FUEL');
      evaluation.executiveSummary = `Jet-A/A1 fuel availability is restricted or requires prior notice. G650ER max fuel capacity is 48,200 lbs (7,194 USG).`;
      evaluation.pilotAction = `Coordinate fuel uplift with FBO in advance or plan fuel tankering.`;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(`G650ER fuel capacity: 48,200 lbs (~7,194 USG).`);
      return evaluation;
    }

    // 8. TAXIWAY RESTRICTIONS & WINGSPAN / WEIGHT LIMITS
    const twyImpact = this.checkTaxiwayAndWingspan(text, qCode);
    if (twyImpact) {
      evaluation.severity = twyImpact.severity;
      evaluation.severityScore = twyImpact.score;
      evaluation.impactTitle = twyImpact.title;
      evaluation.shortImpact = twyImpact.shortImpact;
      evaluation.tags.push('TAXIWAY');
      evaluation.executiveSummary = twyImpact.summary;
      evaluation.pilotAction = twyImpact.action;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(twyImpact.highlight);
      return evaluation;
    }

    // 9. CUSTOMS, IMMIGRATION & PORT OF ENTRY (AOE)
    if (this.isCustomsImpact(text, qCode)) {
      evaluation.severity = 'CAUTION';
      evaluation.severityScore = 78;
      evaluation.impactTitle = 'Customs & Immigration (AOE) Operating Restriction';
      evaluation.shortImpact = 'Customs / AOE Notice';
      evaluation.tags.push('CUSTOMS');
      evaluation.executiveSummary = `Customs/Border clearance hours modified or prior manifest notice required for executive arrivals.`;
      evaluation.pilotAction = `Confirm customs clearance and GAR/APIS submission with FBO handler prior to departure.`;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(`Verify VIP passenger clearance window at GA terminal.`);
      return evaluation;
    }

    // 10. INSTRUMENT APPROACHES & NAVAID OUTAGES
    const approachImpact = this.checkApproachAndNavaids(text, qCode);
    if (approachImpact) {
      evaluation.severity = approachImpact.severity;
      evaluation.severityScore = approachImpact.score;
      evaluation.impactTitle = approachImpact.title;
      evaluation.shortImpact = approachImpact.shortImpact;
      evaluation.tags.push('NAVAID / IAP');
      evaluation.executiveSummary = approachImpact.summary;
      evaluation.pilotAction = approachImpact.action;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(approachImpact.highlight);
      return evaluation;
    }

    // 11. RESCUE & FIRE FIGHTING (ARFF / RFFS) DOWNGRADE
    const arffImpact = this.checkArffRffs(text, qCode);
    if (arffImpact) {
      evaluation.severity = arffImpact.severity;
      evaluation.severityScore = arffImpact.score;
      evaluation.impactTitle = arffImpact.title;
      evaluation.shortImpact = 'ARFF Downgrade';
      evaluation.tags.push('ARFF / RFFS');
      evaluation.executiveSummary = arffImpact.summary;
      evaluation.pilotAction = arffImpact.action;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(arffImpact.highlight);
      return evaluation;
    }

    // 12. PRIOR PERMISSION REQUIRED (PPR) / SLOTS / PARKING
    if (this.isPprOrSlotRequired(text, qCode)) {
      evaluation.severity = 'CAUTION';
      evaluation.severityScore = 65;
      evaluation.impactTitle = 'Mandatory PPR / Executive Ramp Slot Restriction';
      evaluation.shortImpact = 'PPR / Slot Required';
      evaluation.tags.push('PPR / SLOTS');
      evaluation.executiveSummary = `Executive aircraft parking requires prior permission (PPR) or slot confirmation.`;
      evaluation.pilotAction = `Confirm PPR and Code D stand allocation (99'7" wingspan) with FBO handling.`;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(`G650ER requires ICAO Code D ramp footprint.`);
      return evaluation;
    }

    // 13. LIGHTING & VISUAL AIDS (PAPI, ALS, WITHOUT FLASH)
    const lightingImpact = this.checkLighting(text, qCode);
    if (lightingImpact) {
      evaluation.severity = lightingImpact.severity;
      evaluation.severityScore = lightingImpact.score;
      evaluation.impactTitle = lightingImpact.title;
      evaluation.shortImpact = lightingImpact.shortImpact;
      evaluation.tags.push('LIGHTING');
      evaluation.executiveSummary = lightingImpact.summary;
      evaluation.pilotAction = lightingImpact.action;
      return evaluation;
    }

    // 14. LOW ALTITUDE AIRSPACE HAZARDS (DRONES / RPA, BALLOONS, PARACHUTES, RESTRICTED AREAS)
    const airspaceImpact = this.checkAirspaceHazard(text, notam);
    if (airspaceImpact) {
      evaluation.severity = airspaceImpact.severity;
      evaluation.severityScore = airspaceImpact.score;
      evaluation.impactTitle = airspaceImpact.title;
      evaluation.shortImpact = airspaceImpact.shortImpact;
      evaluation.tags.push('AIRSPACE');
      evaluation.executiveSummary = airspaceImpact.summary;
      evaluation.pilotAction = airspaceImpact.action;
      return evaluation;
    }

    // 15. RUNWAY CONTAMINATION / BRAKING ACTION / SNOWTAM (RWYCC)
    const rwyccImpact = this.checkBrakingActionOrContamination(text);
    if (rwyccImpact) {
      evaluation.severity = rwyccImpact.severity;
      evaluation.severityScore = rwyccImpact.score;
      evaluation.impactTitle = rwyccImpact.title;
      evaluation.shortImpact = 'Runway Friction / Frost';
      evaluation.tags.push('RWY CONDITION');
      evaluation.executiveSummary = rwyccImpact.summary;
      evaluation.pilotAction = rwyccImpact.action;
      evaluation.isSpecificToG650ER = true;
      evaluation.g650erHighlights.push(rwyccImpact.highlight);
      return evaluation;
    }

    // 16. ATC / TOWER / AFIS / FREQUENCY UPDATES
    const atcImpact = this.checkAtcAndComm(text, qCode);
    if (atcImpact) {
      evaluation.severity = atcImpact.severity;
      evaluation.severityScore = atcImpact.score;
      evaluation.impactTitle = atcImpact.title;
      evaluation.shortImpact = atcImpact.shortImpact;
      evaluation.tags.push('ATC / COMM');
      evaluation.executiveSummary = atcImpact.summary;
      evaluation.pilotAction = atcImpact.action;
      return evaluation;
    }

    // 17. OBSTACLES & CRANES NEAR AIRPORT
    if (this.isObstacle(text, qCode)) {
      evaluation.severity = 'ADVISORY';
      evaluation.severityScore = 40;
      evaluation.impactTitle = 'Temporary Obstacle / Crane in Vicinity';
      evaluation.shortImpact = 'Obstacle / Crane';
      evaluation.tags.push('OBSTACLE');
      evaluation.executiveSummary = `Temporary obstacle erected near airport approach or departure path.`;
      evaluation.pilotAction = `Verify departure OEI climb gradient clearance.`;
      return evaluation;
    }

    // 18. JETWAY / TERMINAL FACILITY
    if (text.includes('JETWAY')) {
      evaluation.severity = 'INFO';
      evaluation.severityScore = 15;
      evaluation.impactTitle = 'Terminal Jetway Unserviceable (No G650ER Impact)';
      evaluation.shortImpact = 'Jetway U/S (No Impact)';
      evaluation.tags.push('TERMINAL');
      evaluation.executiveSummary = `Commercial passenger jetbridge out of service. No impact on G650ER executive ramp operations (built-in airstair).`;
      return evaluation;
    }

    // 19. ADMINISTRATIVE / AIP SUP / TRIGGER NOTAMS
    if (notam.category === 'ADMIN_AIP') {
      evaluation.severity = 'INFO';
      evaluation.severityScore = 10;
      evaluation.impactTitle = 'AIP Supplement / AIRAC Administrative Notice';
      evaluation.shortImpact = 'AIP / Admin Update';
      evaluation.tags.push('ADMIN / AIP');
      evaluation.executiveSummary = `Administrative AIP supplement cancellation or AIRAC chart cycle trigger notice.`;
      return evaluation;
    }

    // 20. DEFAULT ADVISORY / INFO
    evaluation.severity = 'INFO';
    evaluation.severityScore = 20;
    evaluation.impactTitle = 'General Aerodrome Advisory';
    evaluation.shortImpact = 'General Notice';
    evaluation.tags.push('ROUTINE');
    evaluation.executiveSummary = notam.bodyText || `Routine aeronautical information.`;

    return evaluation;
  }

  // --- HELPER RULES METHODS ---

  static isRunwayClosed(text, qCode) {
    if (qCode.startsWith('QMR') && (qCode.endsWith('LC') || qCode.endsWith('AU'))) return true;
    return /(?:RWY|RUNWAY|PISTA)\s*([0-9]{2}[LRC]?(?:\/[0-9]{2}[LRC]?)?)\s*(?:CLSD|CLOSED|FECHADA|INTERDITADA|CLAUSURADA|UNAVAILABLE)/i.test(text) ||
           /(?:ALL\s+RUNWAYS|RWYS|PISTAS)\s*CLSD/i.test(text);
  }

  static checkRunwayDistanceReduction(text) {
    const isDisplaced = /DISPLACED\s+THR|\bDTHR\b|DECLARED\s+DIST|\bTORA\b|\bTODA\b|\bASDA\b|\bLDA\b|DISTANCIAS\s+DECLARADAS/i.test(text);
    if (!isDisplaced) return null;

    const rwyMatch = text.match(/(?:RWY|RUNWAY)\s*([0-9]{2}[LRC]?(?:\/[0-9]{2}[LRC]?)?)/i);
    const rwyLabel = rwyMatch ? `RWY ${rwyMatch[1]}` : 'Runway';

    let ldaFt = null;
    const ldaMatch = text.match(/\bLDA\s*[:=]?\s*([0-9]{4,5})\s*(?:FT|FEET)?/i);
    const toraMatch = text.match(/\bTORA\s*[:=]?\s*([0-9]{4,5})\s*(?:FT|FEET)?/i);
    if (ldaMatch) ldaFt = parseInt(ldaMatch[1], 10);
    else if (toraMatch) ldaFt = parseInt(toraMatch[1], 10);

    if (ldaFt !== null) {
      if (ldaFt < G650ER_SPECS.criticalRunwayLengthFt) {
        return {
          severity: 'CRITICAL',
          score: 92,
          title: `${rwyLabel} Shortened: Available Distance ${ldaFt.toLocaleString()} ft (< 5,000 ft)`,
          shortImpact: `${rwyLabel} LDA ${ldaFt} ft`,
          summary: `${rwyLabel} declared distance reduced to ${ldaFt.toLocaleString()} ft — below practical G650ER operating threshold.`,
          action: `Mandatory AFM performance check. Plan alternative runway or diversion.`,
          highlight: `Available ${ldaFt.toLocaleString()} ft is below G650ER 6,000 ft standard margin.`
        };
      } else if (ldaFt < G650ER_SPECS.marginalRunwayLengthFt) {
        return {
          severity: 'CAUTION',
          score: 76,
          title: `${rwyLabel} Reduced Declared Distance: LDA ${ldaFt.toLocaleString()} ft`,
          shortImpact: `${rwyLabel} LDA ${ldaFt} ft`,
          summary: `${rwyLabel} available landing distance reduced to ${ldaFt.toLocaleString()} ft due to displaced threshold.`,
          action: `Compute AFM field length for actual landing/takeoff weight and verify dry runway.`,
          highlight: `G650ER MTOW balanced field length is ~5,858 ft (SL, ISA).`
        };
      } else {
        return {
          severity: 'ADVISORY',
          score: 48,
          title: `${rwyLabel} Displaced Threshold (LDA ${ldaFt.toLocaleString()} ft Available)`,
          shortImpact: `${rwyLabel} LDA ${ldaFt} ft`,
          summary: `${rwyLabel} threshold displaced; ${ldaFt.toLocaleString()} ft remains available (exceeds G650ER 6,000 ft requirement).`,
          action: `Brief displaced threshold markings and verify FMS runway data.`,
          highlight: `${ldaFt.toLocaleString()} ft available is well above G650ER landing requirements.`
        };
      }
    }

    return {
      severity: 'CAUTION',
      score: 65,
      title: `${rwyLabel} Displaced Threshold / Revised Declared Distances`,
      shortImpact: 'Declared Distances Revised',
      summary: `Threshold displaced or declared distances modified.`,
      action: `Cross-check available TORA/LDA against G650ER AFM performance.`,
      highlight: `Verify displaced threshold in FMS.`
    };
  }

  static checkAirportWideLimits(text, qCode) {
    const isAirportWide = /AD\s+RESTRICTION|AERODROME\s+RESTRICTION|AIRPORT\s+RESTRICTION|PROHIBITED\s+FROM\s+ALL\s+OPERATIONS/i.test(text);
    if (!isAirportWide) return null;

    const spanMatchFt = text.match(/(?:MAX(?:IMUM)?\s*(?:ACFT\s*|AIRCRAFT\s*)?(?:WING)?SPAN|WINGSPAN\s*EXCEEDING)\s*[:=]?\s*([0-9]{2,3})\s*(?:FT|FEET)?/i);
    if (spanMatchFt) {
      const maxSpanFt = parseInt(spanMatchFt[1], 10);
      if (maxSpanFt < 100) {
        return {
          severity: 'CRITICAL',
          score: 99,
          title: `Airport Wingspan Prohibition: Max ${maxSpanFt} ft (G650ER is 99'7")`,
          shortImpact: `Max Span ${maxSpanFt} ft (NO-GO)`,
          summary: `Airport prohibits aircraft with wingspan exceeding ${maxSpanFt} ft. The Gulfstream G650ER wingspan is 99 ft 7 in (30.36 m).`,
          action: `NO-GO without explicit airport/FAA waiver.`,
          highlight: `G650ER wingspan (99'7") exceeds airport limit (${maxSpanFt} ft).`
        };
      }
    }

    const wtMatch = text.match(/MAXIMUM\s+CERTIFICATED\s+TAKEOFF\s+WEIGHT\s+([0-9,]+)\s*LBS/i);
    if (wtMatch) {
      const maxWt = parseInt(wtMatch[1].replace(/,/g, ''), 10);
      if (maxWt < G650ER_SPECS.mtowLbs) {
        return {
          severity: 'CRITICAL',
          score: 94,
          title: `Airport Max Takeoff Weight Limit: ${maxWt.toLocaleString()} lbs (G650ER MTOW 103,600 lbs)`,
          shortImpact: `Max MTOW ${maxWt.toLocaleString()} lbs`,
          summary: `Airport enforces a maximum certificated takeoff weight limit of ${maxWt.toLocaleString()} lbs.`,
          action: `Verify if aircraft is certificated at a reduced weight tier or obtain prior airport permission.`,
          highlight: `Standard G650ER MTOW is 103,600 lbs.`
        };
      }
    }

    return null;
  }

  static checkPavementStrength(notam, text) {
    if (!text.includes('RESISTENCIA PISO') && !/\bPCR\b|\bPCN\b/i.test(text) && !text.includes('BEARING STRENGTH')) return null;

    const pcr = notam.pcrData;
    const rwyMatch = text.match(/(?:RWY|RUNWAY|PISTA)\s*([0-9]{2}[LRC]?(?:\/[0-9]{2}[LRC]?)?)/i);
    const rwyStr = rwyMatch ? `RWY ${rwyMatch[1]}` : 'Runway';

    if (pcr) {
      const isPressureOk = pcr.tirePressure === 'X' || pcr.tirePressure === 'W';
      const isRatingOk = pcr.rating >= 300;
      const codeStr = `PCR ${pcr.rating}/${pcr.pavementType}/${pcr.subgrade}/${pcr.tirePressure}/${pcr.method}`;

      if (isRatingOk && isPressureOk) {
        return {
          severity: 'INFO',
          score: 25,
          title: `${rwyStr} Pavement Rating Updated (${codeStr}) — G650ER Compliant`,
          shortImpact: `${codeStr} (OK)`,
          summary: `${rwyStr} pavement strength is ${codeStr}. Fully compliant for G650ER MTOW (103,600 lbs) and Category X tire pressure (>254 psi).`,
          action: `No weight restriction required.`,
          highlight: `G650ER tire pressure (~214 psi) is within Category ${pcr.tirePressure}.`
        };
      } else {
        return {
          severity: 'CAUTION',
          score: 65,
          title: `${rwyStr} Pavement Strength Notice (${codeStr})`,
          shortImpact: `${codeStr}`,
          summary: `${rwyStr} pavement rating ${codeStr} may restrict high gross weight operations.`,
          action: `Cross-check G650ER ACN/ACR tables for planned weight.`,
          highlight: `Check tire pressure Category ${pcr.tirePressure} against G650ER 214 psi.`
        };
      }
    }

    return null;
  }

  static checkGpsSpoofing(text, qCode) {
    if (/GPS\s*(?:UNRELIABLE|ANOMALY|INTERFERENCE|JAMMING|SPOOFING)|GNSS\s*(?:UNRELIABLE|JAMMING|DEGRADED)/i.test(text)) {
      return {
        severity: 'CRITICAL',
        score: 93,
        title: 'GPS / GNSS Jamming or Spoofing Active in Sector',
        summary: `GPS/GNSS navigation signals unreliable or spoofed in this airspace.`,
        action: `Monitor FMS IRS drift, enable DME/DME updating, and anticipate potential SVS/EGPWS false terrain alerts.`,
        highlight: `PlaneView II may display NAV FALSE POSITION under spoofing.`
      };
    }
    return null;
  }

  static checkCurfewOrNoise(text, qCode) {
    if (/STRICT\s+NIGHT\s+CURFEW|NO\s+TAKEOFF\s+OR\s+LANDING|AD\s+CLSD|AERODROME\s+CLSD|AIRPORT\s+CLOSED/i.test(text)) {
      return {
        severity: 'CRITICAL',
        score: 90,
        title: 'Mandatory Airport Curfew / Closure Window',
        shortImpact: 'Mandatory Curfew',
        tag: 'CURFEW',
        summary: `Takeoffs and landings are prohibited during published curfew hours.`,
        action: `Ensure ETD/ETA is outside curfew hours.`,
        highlight: `Strict curfew enforcement at this executive station.`
      };
    }

    if (/VOLUNTARY\s+CURFEW|NOISE\s+ABATEMENT|APU\s+RESTRICTIONS|APU\s+PROHIBITED|REVERSE\s+THRUST\s+ABOVE\s+IDLE/i.test(text)) {
      return {
        severity: 'ADVISORY',
        score: 45,
        title: 'Noise Abatement / APU & Reverse Thrust Restriction',
        shortImpact: 'Noise / APU Limit',
        tag: 'NOISE / APU',
        summary: `Local noise abatement procedure limits APU runtime on ramp or reverse thrust above idle at night.`,
        action: `Request GPU from FBO upon block-in and limit APU operation to permitted window.`,
        highlight: `Coordinate GPU availability with handling agent.`
      };
    }

    return null;
  }

  static isFuelRestriction(text, qCode) {
    if (qCode.startsWith('QFU')) return true;
    return /JET[\s-]*A(?:-?1)?\s*(?:NOT\s*AVBL|UNAVAILABLE|U\/S|SHORTAGE|CONTAMINATED)|FUEL\s+SHORTAGE|NO\s*JET\s*FUEL|AVGAS\s*ONLY|COMBUSTIVEL\s*INDISPONIVEL/i.test(text);
  }

  static checkTaxiwayAndWingspan(text, qCode) {
    const isTwy = qCode.startsWith('QMX') || /\bTWY\b|TAXIWAY|TAXILANE/i.test(text);
    if (!isTwy) return null;

    const twyNameMatch = text.match(/\b(?:TWY|TAXIWAY|TAXILANE)\s+([A-Z0-9]{1,7})/i);
    const twyLabel = twyNameMatch ? `TWY ${twyNameMatch[1]}` : 'Taxiway';

    const spanMatchFt = text.match(/(?:MAX(?:IMUM)?\s*(?:WING)?SPAN|SPAN\s*RESTRICTED\s*TO|WINGSPAN\s*LIMITED\s*TO)\s*[:=]?\s*([0-9]{2,3})\s*(?:FT|FEET)?/i);
    const spanMatchM = text.match(/(?:MAX(?:IMUM)?\s*(?:WING)?SPAN|SPAN\s*RESTRICTED\s*TO|WINGSPAN\s*LIMITED\s*TO)\s*[:=]?\s*([0-9]{2})\s*M(?:ETRES|ETERS)?/i);

    let maxSpanFt = null;
    if (spanMatchFt) maxSpanFt = parseInt(spanMatchFt[1], 10);
    else if (spanMatchM) maxSpanFt = Math.round(parseInt(spanMatchM[1], 10) * 3.28084);

    const isRestrictedCodeC = /CODE\s*C\s*(?:OR\s*BELOW|ONLY|MAX)|ACFT\s*DESIGN\s*GROUP\s*(?:I{1,3})\s*ONLY/i.test(text);

    if ((maxSpanFt && maxSpanFt < 100) || isRestrictedCodeC) {
      return {
        severity: 'CRITICAL',
        score: 88,
        title: `${twyLabel} Wingspan Limit: Max ${maxSpanFt ? maxSpanFt + ' ft' : 'Code C'} (G650ER is 99'7")`,
        shortImpact: `${twyLabel} Span < ${maxSpanFt || 100} ft`,
        summary: `${twyLabel} is restricted to wingspans under ${maxSpanFt ? maxSpanFt + ' ft' : 'Code C'}. The G650ER wingspan is 99 ft 7 in (30.36 m, Code D).`,
        action: `Avoid ${twyLabel}. Request alternate taxi route from Ground Control.`,
        highlight: `G650ER wingspan (99'7") exceeds ${twyLabel} clearance limit.`
      };
    }

    if (/CLSD|CLOSED|U\/S|UNSERVICEABLE|INTERDITADA/i.test(text)) {
      return {
        severity: 'CAUTION',
        score: 58,
        title: `${twyLabel} Closed for Maintenance`,
        shortImpact: `${twyLabel} Closed`,
        summary: `${twyLabel} is closed; expect alternate ground routing to/from FBO ramp.`,
        action: `Review airport taxi chart prior to pushback or landing rollout.`,
        highlight: `Brief alternate taxi route.`
      };
    }

    return null;
  }

  static isCustomsImpact(text, qCode) {
    if (qCode.startsWith('QCP')) return true;
    return /\bCUSTOMS\b|\bIMMIGRATION\b|PORT\s+OF\s+ENTRY|\bAOE\b|\bUKBF\b|BORDER\s+FORCE|BORDER\s+PROTECTION/i.test(text);
  }

  static checkApproachAndNavaids(text, qCode) {
    const isApproach = qCode.startsWith('QIC') || qCode.startsWith('QIL') || qCode.startsWith('QIG') || qCode.startsWith('QNM') ||
                       /\bILS\b|LOCALIZER|GLIDEPATH|GLIDESLOPE|\bVOR\/DME\b|\bDVOR\b|\bRNAV\b|\bRNP\b/i.test(text);
    if (!isApproach) return null;

    if (/\bU\/S\b|\bOTS\b|UNSERVICEABLE|OUT\s+OF\s+SERVICE|INOPERANTE/i.test(text)) {
      const isIls = /\bILS\b|LOCALIZER|GLIDEPATH|GLIDESLOPE|QIC|QIG|QIL/i.test(text);
      const rwyMatch = text.match(/RWY\s*([0-9]{2}[LRC]?)/i);
      const rwyStr = rwyMatch ? ` RWY ${rwyMatch[1]}` : '';
      const vorMatch = text.match(/VOR\/DME\s*(?:\(DVOR\))?\s*([A-Z]{3})/i);
      const vorStr = vorMatch ? ` (${vorMatch[1]})` : '';

      return {
        severity: 'CAUTION',
        score: isIls ? 72 : 55,
        title: isIls ? `ILS${rwyStr} Component Out of Service` : `VOR/DME${vorStr} Out of Service`,
        shortImpact: isIls ? `ILS${rwyStr} Degraded` : `VOR/DME${vorStr} OTS`,
        summary: isIls
          ? `Precision ILS${rwyStr} capability degraded or unserviceable. Check applicable Cat I / LOC / RNP minimums.`
          : `Ground VOR/DME${vorStr} station unserviceable. Use FMS RNP / GNSS navigation.`,
        action: isIls
          ? `Brief backup RNP (RNAV) or Localizer minima and verify destination weather.`
          : `Deselect affected VOR/DME from FMS navaid tuning if required.`,
        highlight: isIls
          ? `Check G650ER HUD/EFVS approach minimums.`
          : `G650ER triple FMS / GNSS navigation unaffected.`
      };
    }

    return null;
  }

  static checkArffRffs(text, qCode) {
    if (qCode.startsWith('QFF') || /\bRFFS\b|\bARFF\b|FIRE\s+AND\s+RESCUE|RESCUE\s+AND\s+FIRE/i.test(text)) {
      const catMatch = text.match(/CATEGORY\s*([0-9])/i);
      const catNum = catMatch ? parseInt(catMatch[1], 10) : null;

      if (catNum !== null && catNum >= 6) {
        return {
          severity: 'ADVISORY',
          score: 42,
          title: `Rescue & Fire Fighting (RFFS) Adjusted to Category ${catNum} (Meets G650ER Cat 6)`,
          summary: `Airport RFFS adjusted to ICAO Category ${catNum}, which meets the G650ER requirement (ICAO Category 6).`,
          action: `Standard G650ER operations permitted.`,
          highlight: `G650ER requires ICAO Category 6 / FAA Index B.`
        };
      }

      if (/DOWNGRADED|REDUCED|CAT\s*[1-5]|INDEX\s*A/i.test(text)) {
        return {
          severity: 'CAUTION',
          score: 68,
          title: 'ARFF / RFFS Downgraded Below ICAO Category 6',
          summary: `Aerodrome Rescue and Fire Fighting reduced below ICAO Category 6.`,
          action: `Verify company OpsSpecs and insurance requirements for downgraded ARFF.`,
          highlight: `G650ER fuselage length (99'9") is ICAO Category 6.`
        };
      }
    }
    return null;
  }

  static isPprOrSlotRequired(text, qCode) {
    if (qCode.startsWith('QSP')) return true;
    return /\bPPR\b|PRIOR\s+PERMISSION\s+REQUIRED|AIRPORT\s+SLOT|RAMP\s+SLOT|PARKING\s+CONGESTION|\bCOHOR\b/i.test(text);
  }

  static checkLighting(text, qCode) {
    const rwyMatch = text.match(/RWY\s*([0-9]{2}[LRC]?)/i);
    const rwyStr = rwyMatch ? ` RWY ${rwyMatch[1]}` : '';

    if (text.includes('SEM FLASH') || text.includes('WITHOUT FLASH')) {
      return {
        severity: 'ADVISORY',
        score: 44,
        title: `Approach Lighting (ALS${rwyStr}) Operating Without Strobe Flashers`,
        shortImpact: `ALS${rwyStr} No Flash`,
        summary: `Approach lighting system steady lights are normal; sequenced flashing strobes are off.`,
        action: `Standard approach minimums apply unless sequenced flashers are required by chart.`
      };
    }

    if (qCode.startsWith('QLP') || /\bPAPI\b|\bVASI\b/i.test(text)) {
      if (/\bU\/S\b|\bOTS\b|UNSERVICEABLE|OUT\s+OF\s+SERVICE|INOPERANTE/i.test(text)) {
        return {
          severity: 'CAUTION',
          score: 55,
          title: `Visual Glide Slope (PAPI${rwyStr}) Out of Service`,
          shortImpact: `PAPI${rwyStr} OTS`,
          summary: `PAPI visual glidepath indicator unserviceable.`,
          action: `Use ILS or RNAV vertical guidance on approach.`
        };
      }
    }

    if (qCode.startsWith('QLA') || /\bALS\b|\bALSF\b|\bMALSR\b|APPROACH\s+LIGHT/i.test(text)) {
      if (/\bU\/S\b|\bOTS\b|UNSERVICEABLE|INOPERANTE/i.test(text)) {
        return {
          severity: 'CAUTION',
          score: 60,
          title: `Approach Lighting System (ALS${rwyStr}) Out of Service`,
          shortImpact: `ALS${rwyStr} OTS`,
          summary: `Approach lighting system out of service; higher visibility minimums apply.`,
          action: `Apply inoperative ALS visibility penalty to approach chart minimums.`
        };
      }
    }
    return null;
  }

  static checkAirspaceHazard(text, notam) {
    const isFlightCheck = /\bFLTCK\b|FLIGHT\s+CHECK|CALIBRATION/i.test(text);
    const isLightTest = /TESTING\s+AND\s+USING\s+LIGHTS/i.test(text);
    const isDrone = /FLT\s+RPA|REMOTELY\s+PILOTED|UNMANNED\s+AIRCRAFT|\bDRONE\b|\bUA\b\s+WILL\s+TAKE\s+PLACE|QWULW/i.test(text + ' ' + notam.qCode);
    const isBalloon = /BALAO\s+LIVRE|BALONISMO|FREE\s+BALLOON|HOT\s+AIR\s+BALLOON|AEROLOGICAL\s+OBSERVATORY|QWLLW/i.test(text + ' ' + notam.qCode);
    const isFireworks = /FIREWORKS|QWMLW/i.test(text + ' ' + notam.qCode);
    const isParachute = /PARACHUTE|\bPJE\b|MIL\s+PJE|QWPLW/i.test(text + ' ' + notam.qCode);
    const isRestrictedArea = /QRRCA|QRTCA|SGR-\d+|RESTRICTED\s+AREA\s+ACTIVATED/i.test(text + ' ' + notam.qCode);

    const upper = notam.upperLimit || 'Low Altitude';
    const isHighAltitude = /^FL\s*[0-9]{3}/i.test(upper);
    const locNote = text.includes('BARUERI') ? ' (Barueri-SP)'
                  : text.includes('SOROCABA') ? ' (Sorocaba)'
                  : text.includes('NU GUAZU') ? ' (Ñu Guazú / SGAS Approach)'
                  : text.includes('LUQUE') ? ' (Luque / SGAS Vicinity)'
                  : text.includes('AEROLOGICAL') ? ' (SGAS Observatory)'
                  : text.includes('SGR-7') ? ' (SGR-7 Hayes)' : '';

    if (isFlightCheck) {
      return {
        severity: 'CAUTION',
        score: 62,
        title: `Flight Check / Navaid Calibration Aircraft Active (FLTCK)`,
        shortImpact: `Flight Check Ops (FLTCK)`,
        summary: `Flight inspection / calibration aircraft operating in terminal airspace during daylight hours (${notam.scheduleRaw || 'SR-SS'}).`,
        action: `Expect potential ATC vectors or brief holding if calibration aircraft is on final approach.`
      };
    }

    if (isLightTest) {
      return {
        severity: 'INFO',
        score: 24,
        title: `Stadium Light Testing${locNote} — Up to ${upper}`,
        shortImpact: `Light Testing (≤ ${upper})`,
        summary: `High-intensity light testing at Olympic Committee complex${locNote} up to ${upper}.`,
        action: `Routine visual awareness on night final approach.`
      };
    }

    if (isDrone) {
      return {
        severity: 'ADVISORY',
        score: 38,
        title: `Drone / Unmanned Aircraft Area${locNote} — Up to ${upper}`,
        shortImpact: `Drone Area (≤ ${upper})`,
        summary: `Unmanned aircraft (RPA) activity${locNote} from surface up to ${upper}.${notam.groupedCount > 1 ? ` (${notam.groupedCount} duplicate sector NOTAMs merged)` : ''}`,
        action: `Maintain visual scan below ${upper} during departure/arrival.`
      };
    }

    if (isBalloon) {
      return {
        severity: isHighAltitude ? 'CAUTION' : 'ADVISORY',
        score: isHighAltitude ? 60 : 40,
        title: `Free Balloon Ascent${locNote} — Up to ${upper}`,
        shortImpact: `Balloons (≤ ${upper})`,
        summary: `Free balloon launch${locNote} from surface up to ${upper}${notam.scheduleRaw ? ` (${notam.scheduleRaw})` : ''}.${notam.groupedCount > 1 ? ` (${notam.groupedCount} duplicate notices merged)` : ''}`,
        action: `Confirm launch window (${notam.scheduleRaw || 'published times'}) with ATC during climb/descent below ${upper}.`
      };
    }

    if (isParachute) {
      return {
        severity: isHighAltitude ? 'CAUTION' : 'ADVISORY',
        score: isHighAltitude ? 66 : 45,
        title: `Military Parachute Jumping${locNote} — Up to ${upper}`,
        shortImpact: `Parachute Ops (≤ ${upper})`,
        summary: `Military parachute jumping (PJE) active${locNote} within 0.5 NM radius from surface up to ${upper}, subject to ATC coordination.`,
        action: `Confirm jump status with Asunción Approach/Tower (118.1 / 118.85 MHz) prior to descending below ${upper}.`
      };
    }

    if (isFireworks) {
      return {
        severity: 'INFO',
        score: 25,
        title: `Low-Level Fireworks Display${locNote} — Up to ${upper}`,
        shortImpact: `Fireworks (≤ ${upper})`,
        summary: `Localized fireworks display up to ${upper} (${notam.scheduleRaw || 'scheduled window'}).`,
        action: `No operational impact on IFR flight path.`
      };
    }

    if (isRestrictedArea) {
      return {
        severity: isHighAltitude ? 'CAUTION' : 'ADVISORY',
        score: isHighAltitude ? 64 : 42,
        title: `Restricted Airspace Activated${locNote} (${notam.lowerLimit || 'SFC'} to ${upper})`,
        shortImpact: `Restricted Area (${notam.lowerLimit || 'SFC'}–${upper})`,
        summary: `Restricted airspace${locNote} active from ${notam.lowerLimit || 'SFC'} to ${upper}${notam.scheduleRaw ? ` (${notam.scheduleRaw})` : ''}.`,
        action: `Verify arrival/descent profile clears active sector or obtain ATC clearance through sector.`
      };
    }

    return null;
  }

  static checkAtcAndComm(text, qCode) {
    if (/TWR[\s\S]*?FREQ\s*([0-9]{3}\.[0-9]{1,3})\s*MHZ[\s\S]*?(?:\bU\/S\b|UNSERVICEABLE|OUT\s+OF\s+SERVICE)/i.test(text)) {
      const uMatch = text.match(/FREQ\s*([0-9]{3}\.[0-9]{1,3})\s*MHZ/i);
      const altMatch = text.match(/(?:ALTERNATE|ALTN|USE|OPR)\s*(?:FREQ)?\s*([0-9]{3}\.[0-9]{1,3})\s*MHZ/i);
      const uFreq = uMatch ? `${uMatch[1]} MHz` : 'Primary Freq';
      const altFreq = altMatch ? ` — Use ${altMatch[1]} MHz` : '';
      return {
        severity: 'CAUTION',
        score: 68,
        title: `Control Tower ${uFreq} Out of Service${altFreq}`,
        shortImpact: `TWR ${uFreq} U/S${altFreq}`,
        summary: `Control Tower primary frequency (${uFreq}) is unserviceable.${altMatch ? ` Alternate frequency ${altMatch[1]} MHz is active.` : ''}`,
        action: `Pre-set alternate Tower frequency${altMatch ? ` ${altMatch[1]} MHz` : ''} in G650ER PlaneView II COM prior to approach.`
      };
    }

    if (/TWR\s+HR\s+SER/i.test(text)) {
      const hrMatch = text.match(/HR\s+SER\s+([0-9]{4}-[0-9]{4})/i);
      const hrs = hrMatch ? hrMatch[1] : 'Published Hours';
      return {
        severity: 'INFO',
        score: 30,
        title: `Control Tower Hours of Service: ${hrs} UTC`,
        shortImpact: `TWR Hours ${hrs}Z`,
        summary: `Control Tower operating hours are ${hrs} UTC.`,
        action: `Verify AFIS/Approach frequency if operating outside Tower hours.`
      };
    }

    if (/AFIS(?:\s+[A-Z]+)?\s+HR\s+SER/i.test(text)) {
      return {
        severity: 'INFO',
        score: 28,
        title: `AFIS Service Hours & Frequency Notice`,
        shortImpact: `AFIS Hours Notice`,
        summary: `Aerodrome Flight Information Service (AFIS) operating hours published.`,
        action: `Monitor published AFIS frequency if diverting.`
      };
    }

    if (/TWR\s+[A-Z]+\s+FREQ\s+[0-9.]+MHZ\s+INSTL/i.test(text)) {
      const freqMatch = text.match(/([0-9]{3}\.[0-9]{1,3}MHZ)/i);
      const freq = freqMatch ? freqMatch[1] : '';
      return {
        severity: 'INFO',
        score: 25,
        title: `Control Tower Frequency ${freq} Installed`,
        shortImpact: `TWR Freq ${freq}`,
        summary: `Tower primary frequency ${freq} in service.`,
        action: `Use ${freq} for Tower communications.`
      };
    }

    if (/FIS\s+CURITIBA|ACC\s+PRI\s+FREQ/i.test(text)) {
      return {
        severity: 'INFO',
        score: 22,
        title: `FIR / ACC Sector Frequency Assignment`,
        shortImpact: `FIR Sector Freqs`,
        summary: `Regional Flight Information Service / ACC sector frequencies published.`,
        action: `Standard VHF frequency handoffs via ATC.`
      };
    }

    return null;
  }

  static isObstacle(text, qCode) {
    if (qCode.startsWith('QOB')) return true;
    return /\bOBST\b|\bCRANE\b|\bMAST\b|TOWER\s+ERECTED|TEMPORARY\s+OBSTACLE/i.test(text);
  }

  static checkBrakingActionOrContamination(text) {
    if (!/BRAKING\s+ACTION|\bBA\s+(?:POOR|NIL|MEDIUM)|\bRWYCC\b|SNOWTAM|FICON|\bFROST\b/i.test(text)) {
      return null;
    }

    const rwyccMatch = text.match(/RWYCC\s*([0-6])\/([0-6])\/([0-6])/i);
    if (rwyccMatch) {
      const [, c1, c2, c3] = rwyccMatch;
      const minCode = Math.min(parseInt(c1, 10), parseInt(c2, 10), parseInt(c3, 10));
      return {
        severity: minCode <= 1 ? 'CRITICAL' : 'CAUTION',
        score: minCode <= 1 ? 95 : 75,
        title: `Contaminated Runway: RWYCC ${c1}/${c2}/${c3}`,
        summary: `Runway condition code reported as ${c1}/${c2}/${c3}.`,
        action: `Apply Gulfstream QRH contaminated runway landing distance factors.`,
        highlight: `Crosswind limits reduced on contaminated runways.`
      };
    }

    return {
      severity: 'CAUTION',
      score: 70,
      title: 'Runway Surface Condition / Braking Action Advisory',
      summary: `Runway surface frost or reduced braking action reported during published window.`,
      action: `Verify runway surface condition and apply AFM contaminated runway factors if active.`,
      highlight: `Check G650ER contaminated runway performance.`
    };
  }
}
