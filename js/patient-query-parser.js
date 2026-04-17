(function (global) {
  const LOCATION_TERMS = [
    "san diego",
    "la jolla",
    "los angeles",
    "la",
    "orange county",
    "orange",
    "duarte",
    "irvine",
    "newport beach",
    "loma linda",
    "ucla",
    "usc",
    "cedars",
    "city of hope",
    "hoag",
    "uc irvine",
    "uci",
    "ucsd",
    "moores",
    "scripps"
  ];

  function normalizeWhitespace(value) {
    return (value || "").toString().replace(/\s+/g, " ").trim();
  }

  function addChip(chips, group, label) {
    if (!label) {
      return;
    }

    if (!chips.some(chip => chip.group === group && chip.label === label)) {
      chips.push({ group, label });
    }
  }

  function addPreference(preferences, value) {
    if (value && !preferences.includes(value)) {
      preferences.push(value);
    }
  }

  function detectCancerType(text) {
    if (/(prostate|mcrpc|mcspc|mhspc|nmcrpc|gleason|psma|enzalutamide|abiraterone|docetaxel|biochemical recurrence|\bbcr\b)/i.test(text)) {
      return "Prostate";
    }
    return "";
  }

  function detectDiseaseContext(text) {
    const context = {
      diseaseGroup: "",
      diseaseLabel: "",
      diseaseSettingIds: []
    };

    if (/\bnmcrpc\b|m0 crpc|non[- ]metastatic castration[- ]resistant/i.test(text)) {
      context.diseaseGroup = "crpc";
      context.diseaseLabel = "nmCRPC";
      context.diseaseSettingIds = ["crpc_nonmetastatic"];
      return context;
    }

    if (/\bmcrpc\b|metastatic castration[- ]resistant/i.test(text)) {
      context.diseaseGroup = "crpc";
      context.diseaseLabel = "mCRPC";
      return context;
    }

    if (/\bmcspc\b|\bmhspc\b|metastatic castration[- ]sensitive|hormone[- ]sensitive metastatic/i.test(text)) {
      context.diseaseGroup = "cspc";
      context.diseaseLabel = "mCSPC";
      return context;
    }

    if (/\bbiochemical recurrence\b|\bbcr\b/i.test(text)) {
      context.diseaseGroup = "bcr";
      context.diseaseLabel = "Biochemical recurrence";
      if (/prostatectomy|post[- ]rp|post[- ]prostatectomy|after prostatectomy/i.test(text)) {
        context.diseaseSettingIds = ["bcr_post_rp", "bcr_general"];
      } else if (/post[- ]rt|after radiation|after rt/i.test(text)) {
        context.diseaseSettingIds = ["bcr_post_rt", "bcr_general"];
      } else {
        context.diseaseSettingIds = ["bcr_general"];
      }
      return context;
    }

    if (/unfavo[u]?rable intermediate/i.test(text)) {
      context.diseaseGroup = "localized";
      context.diseaseLabel = "Unfavorable intermediate risk";
      context.diseaseSettingIds = ["localized_unfavorable_ir", "localized_general"];
      return context;
    }

    if (/high risk|very high risk/i.test(text)) {
      context.diseaseGroup = "localized";
      context.diseaseLabel = "High / very high risk";
      context.diseaseSettingIds = ["localized_high_very_high_risk", "localized_general"];
      return context;
    }

    if (/localized|newly diagnosed prostate cancer|gleason|radiation candidate|ct2/i.test(text)) {
      context.diseaseGroup = "localized";
      context.diseaseLabel = "Localized prostate cancer";
      context.diseaseSettingIds = ["localized_general"];
      return context;
    }

    return context;
  }

  function detectArpiState(text) {
    const agents = [];
    [
      { key: "enzalutamide", pattern: /enzalutamide/i },
      { key: "abiraterone", pattern: /abiraterone/i },
      { key: "apalutamide", pattern: /apalutamide/i },
      { key: "darolutamide", pattern: /darolutamide/i }
    ].forEach(entry => {
      if (entry.pattern.test(text)) {
        agents.push(entry.key);
      }
    });

    if (/arpi[- ]naive|no prior arpi|novel hormonal naive|enzalutamide naive|abiraterone naive/i.test(text)) {
      return { value: "no", agents: [] };
    }

    if (agents.length > 0 || /post[- ]arpi|progressed on .*enzalutamide|progressed on .*abiraterone/i.test(text)) {
      return { value: "yes", agents };
    }

    return { value: "", agents: [] };
  }

  function detectDocetaxelState(text) {
    if (/no prior (docetaxel|chemo|chemotherapy)|chemo[- ]naive|chemotherapy[- ]naive|taxane[- ]naive|docetaxel[- ]naive/i.test(text)) {
      return "no";
    }

    if (/prior docetaxel|post[- ]docetaxel|after docetaxel|received docetaxel/i.test(text)) {
      return "yes";
    }

    return "";
  }

  function detectHrrState(text) {
    if (/brca\s*1?\s*2?\s*\+|brca1\+|brca2\+|hrr positive|atm (mutation|mutated)|cdk12 (mutation|mutated)|hrr mutation|hrr deficient/i.test(text)) {
      const match = text.match(/brca1\+|brca2\+|brca\+|atm(?: mutation| mutated)?|cdk12(?: mutation| mutated)?/i);
      return {
        value: "positive",
        label: match ? normalizeWhitespace(match[0]).replace(/\bmutation\b/i, "").trim() : "HRR+"
      };
    }

    if (/wild[- ]type|hrr wild[- ]type|brca negative|hrr negative/i.test(text)) {
      return { value: "negative", label: "HRR wild-type" };
    }

    return { value: "", label: "" };
  }

  function detectPsmaState(text) {
    if (/psma[^.]{0,24}(confirmed|positive|avid)|psma[- ]avid|psma positive/i.test(text)) {
      return "positive";
    }

    if (/psma negative/i.test(text)) {
      return "negative";
    }

    return "";
  }

  function detectGenomicClassifier(text) {
    const brandMatch = text.match(/decipher|oncotype gps|oncotype|prolaris|artera ai|artera|genomic risk classifier|genomic classifier/i);
    if (brandMatch) {
      return {
        value: "available",
        label: normalizeWhitespace(brandMatch[0])
      };
    }

    const scoreMatch = text.match(/score[: ]+([0-9]+(?:\.[0-9]+)?)/i);
    if (scoreMatch) {
      return {
        value: "available",
        label: `Genomic score ${scoreMatch[1]}`
      };
    }

    return { value: "", label: "" };
  }

  function detectDiseaseVolume(text) {
    if (/oligometastatic|oligo[- ]metastatic/i.test(text)) {
      return "oligometastatic";
    }

    if (/high[- ]volume|high[- ]burden/i.test(text)) {
      return "high_volume";
    }

    if (/low[- ]volume|low[- ]burden/i.test(text)) {
      return "low_volume";
    }

    const boneMatch = text.match(/(\d+)\s+(?:bone mets?|bone metastases|bone lesions?)/i);
    if (boneMatch) {
      const count = Number(boneMatch[1]);
      if (Number.isFinite(count)) {
        if (count >= 4) {
          return "high_volume";
        }
        if (count > 0 && count <= 3) {
          return "low_volume";
        }
      }
    }

    if (/(lung|liver|visceral).{0,18}(met|mets|metastases|nodule)/i.test(text)) {
      return "high_volume";
    }

    return "";
  }

  function detectAdtState(text) {
    if (/adt[- ]naive|no prior adt|no prior androgen deprivation/i.test(text)) {
      return "naive";
    }

    if (/prior adt|received adt|on adt/i.test(text)) {
      return "prior";
    }

    return "";
  }

  function detectPhasePreference(text) {
    const match = text.match(/phase\s*(i{1,3}|iv)\s*only/i);
    if (!match) {
      return "";
    }

    const roman = match[1].toUpperCase();
    if (roman === "I") return "Phase I";
    if (roman === "II") return "Phase II";
    if (roman === "III") return "Phase III";
    if (roman === "IV") return "Phase IV";
    return "";
  }

  function detectLocationTerms(text) {
    const lowered = text.toLowerCase();
    return LOCATION_TERMS.filter(term => lowered.includes(term));
  }

  function detectTreatmentPreferences(text) {
    const preferences = [];

    if (/radioligand|lutetium|177lu|psma/i.test(text)) {
      addPreference(preferences, "radioligand");
    }
    if (/parp|olaparib|rucaparib|niraparib|talazoparib/i.test(text)) {
      addPreference(preferences, "parp");
    }
    if (/triplet/i.test(text)) {
      addPreference(preferences, "triplet");
    }
    if (/intensification/i.test(text)) {
      addPreference(preferences, "intensification");
    }
    if (/de[- ]intensification|deintensification/i.test(text)) {
      addPreference(preferences, "deintensification");
    }

    return preferences;
  }

  function finalizeDiseaseSettingIds(parsed) {
    const axes = parsed.clinicalAxes;
    const ids = [];

    if (parsed.diseaseGroup === "crpc") {
      if (axes.metastaticStatus === "nonmetastatic_crpc") {
        ids.push("crpc_nonmetastatic");
      } else if (axes.metastaticStatus === "metastatic") {
        if (axes.priorArpi === "yes") {
          ids.push("crpc_metastatic_postARPI", "crpc_general");
        } else if (axes.priorArpi === "no") {
          ids.push("crpc_metastatic_preARPI", "crpc_general");
        } else {
          ids.push("crpc_metastatic_preARPI", "crpc_metastatic_postARPI", "crpc_general");
        }
      } else {
        ids.push("crpc_nonmetastatic", "crpc_metastatic_preARPI", "crpc_metastatic_postARPI", "crpc_general");
      }
    }

    if (parsed.diseaseGroup === "cspc") {
      if (axes.diseaseVolume === "high_volume") {
        ids.push("cspc_high_volume", "cspc_general");
      } else if (axes.diseaseVolume === "oligometastatic") {
        ids.push("cspc_oligometastatic", "cspc_general");
      } else {
        ids.push("cspc_high_volume", "cspc_general", "cspc_oligometastatic");
      }
    }

    if (parsed.diseaseGroup === "localized") {
      ids.push(...parsed.diseaseSettingIds);
      if (ids.length === 0) {
        ids.push("localized_general");
      }
    }

    if (parsed.diseaseGroup === "bcr") {
      ids.push(...parsed.diseaseSettingIds);
    }

    parsed.diseaseSettingIds = Array.from(new Set(ids.filter(Boolean)));
  }

  function parse(query) {
    const rawQuery = normalizeWhitespace(query);
    const parsed = {
      rawQuery,
      supported: false,
      unsupportedReason: "",
      cancerType: "",
      diseaseGroup: "",
      diseaseLabel: "",
      diseaseSettingIds: [],
      clinicalAxes: {
        castrationStatus: "",
        metastaticStatus: "",
        diseaseVolume: "",
        priorArpi: "",
        priorDocetaxel: "",
        biomarkerHrr: "",
        biomarkerLabel: "",
        psmaStatus: "",
        genomicClassifier: "",
        genomicClassifierLabel: "",
        adtStatus: ""
      },
      treatmentPreferences: [],
      phasePreference: "",
      locationPreferences: [],
      chips: [],
      notes: []
    };

    if (!rawQuery) {
      parsed.unsupportedReason = "Enter a patient description to run matching.";
      return parsed;
    }

    parsed.cancerType = detectCancerType(rawQuery);
    if (parsed.cancerType !== "Prostate") {
      parsed.unsupportedReason = "The current matching MVP only supports prostate patient queries.";
      return parsed;
    }

    parsed.supported = true;

    const diseaseContext = detectDiseaseContext(rawQuery);
    parsed.diseaseGroup = diseaseContext.diseaseGroup;
    parsed.diseaseLabel = diseaseContext.diseaseLabel;
    parsed.diseaseSettingIds = diseaseContext.diseaseSettingIds.slice();

    if (parsed.diseaseGroup === "crpc") {
      parsed.clinicalAxes.castrationStatus = "castration_resistant";
      if (parsed.diseaseLabel === "nmCRPC") {
        parsed.clinicalAxes.metastaticStatus = "nonmetastatic_crpc";
      } else {
        parsed.clinicalAxes.metastaticStatus = "metastatic";
      }
    } else if (parsed.diseaseGroup === "cspc") {
      parsed.clinicalAxes.castrationStatus = "castration_sensitive";
      parsed.clinicalAxes.metastaticStatus = "metastatic";
    } else if (parsed.diseaseGroup === "localized") {
      parsed.clinicalAxes.metastaticStatus = "localized";
    }

    const arpiState = detectArpiState(rawQuery);
    parsed.clinicalAxes.priorArpi = arpiState.value;

    parsed.clinicalAxes.priorDocetaxel = detectDocetaxelState(rawQuery);

    const hrrState = detectHrrState(rawQuery);
    parsed.clinicalAxes.biomarkerHrr = hrrState.value;
    parsed.clinicalAxes.biomarkerLabel = hrrState.label;

    parsed.clinicalAxes.psmaStatus = detectPsmaState(rawQuery);

    const classifierState = detectGenomicClassifier(rawQuery);
    parsed.clinicalAxes.genomicClassifier = classifierState.value;
    parsed.clinicalAxes.genomicClassifierLabel = classifierState.label;

    parsed.clinicalAxes.diseaseVolume = detectDiseaseVolume(rawQuery);
    parsed.clinicalAxes.adtStatus = detectAdtState(rawQuery);

    parsed.treatmentPreferences = detectTreatmentPreferences(rawQuery);
    parsed.phasePreference = detectPhasePreference(rawQuery);
    parsed.locationPreferences = detectLocationTerms(rawQuery);

    if (/declines further hormonal therapy/i.test(rawQuery)) {
      parsed.notes.push("Declines further hormonal therapy");
    }
    if (/radiation candidate|eligible for radiation/i.test(rawQuery)) {
      parsed.notes.push("Radiation candidate");
    }

    finalizeDiseaseSettingIds(parsed);

    if (parsed.diseaseLabel) addChip(parsed.chips, "Disease", parsed.diseaseLabel);
    if (arpiState.value === "yes") {
      addChip(parsed.chips, "Treatment", arpiState.agents.length > 0 ? `Post-${arpiState.agents[0]}` : "Post-ARPI");
    } else if (arpiState.value === "no") {
      addChip(parsed.chips, "Treatment", "ARPI-naive");
    }
    if (parsed.clinicalAxes.priorDocetaxel === "no") addChip(parsed.chips, "Treatment", "Chemo-naive");
    if (parsed.clinicalAxes.priorDocetaxel === "yes") addChip(parsed.chips, "Treatment", "Prior docetaxel");
    if (parsed.clinicalAxes.biomarkerLabel) addChip(parsed.chips, "Biomarker", parsed.clinicalAxes.biomarkerLabel);
    if (parsed.clinicalAxes.psmaStatus === "positive") addChip(parsed.chips, "Biomarker", "PSMA-confirmed");
    if (parsed.clinicalAxes.genomicClassifierLabel) addChip(parsed.chips, "Biomarker", parsed.clinicalAxes.genomicClassifierLabel);
    if (parsed.clinicalAxes.diseaseVolume === "high_volume") addChip(parsed.chips, "Disease", "High-volume");
    if (parsed.clinicalAxes.diseaseVolume === "low_volume") addChip(parsed.chips, "Disease", "Low-volume");
    if (parsed.clinicalAxes.diseaseVolume === "oligometastatic") addChip(parsed.chips, "Disease", "Oligometastatic");
    if (parsed.clinicalAxes.adtStatus === "naive") addChip(parsed.chips, "Treatment", "ADT-naive");
    if (parsed.phasePreference) addChip(parsed.chips, "Preference", parsed.phasePreference);
    parsed.treatmentPreferences.forEach(pref => addChip(parsed.chips, "Preference", pref));
    parsed.locationPreferences.forEach(location => addChip(parsed.chips, "Location", location));
    parsed.notes.forEach(note => addChip(parsed.chips, "Note", note));

    return parsed;
  }

  const api = {
    parse
  };

  global.PatientQueryParser = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
