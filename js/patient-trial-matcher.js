(function (global) {
  let parserApi = global.PatientQueryParser;
  if (!parserApi && typeof require === "function") {
    try {
      parserApi = require("./patient-query-parser.js");
    } catch (error) {
      parserApi = null;
    }
  }

  const CONFIDENCE_SCORES = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
    UNCLASSIFIED: 0
  };

  const FLAG_DEFINITIONS = {
    brca_hrr: {
      title: "BRCA/HRR status not confirmed",
      message: "Order germline and somatic HRR testing before referring to PARP inhibitor trials. Most labs return in 2-3 weeks."
    },
    psma_status: {
      title: "PSMA-PET required",
      message: "Confirm PSMA imaging has been performed and is positive before referring to radioligand trials."
    },
    disease_volume: {
      title: "Confirm disease volume",
      message: "Review imaging for bone lesion count and visceral disease. High-volume = 4 or more bone metastases or any visceral metastasis."
    },
    prior_arpi: {
      title: "Confirm ARPI history",
      message: "Confirm whether the patient has received enzalutamide, abiraterone, apalutamide, or darolutamide."
    },
    chemotherapy_history: {
      title: "Confirm chemotherapy history",
      message: "Confirm prior docetaxel exposure. Some trials require chemo-naive disease; others require prior docetaxel."
    },
    genomic_classifier: {
      title: "Genomic classifier result needed",
      message: "Confirm a genomic risk classifier result exists, such as Decipher, Oncotype GPS, Prolaris, Artera AI, or equivalent."
    },
    castration_status: {
      title: "Confirm castration status",
      message: "Confirm whether the patient is castration-sensitive or castration-resistant before referral."
    },
    staging: {
      title: "Confirm staging",
      message: "Confirm whether the patient has distant metastatic disease on current imaging."
    },
    adt_history: {
      title: "Confirm ADT history",
      message: "Most mCSPC intensification studies require ADT-naive disease or tightly limit prior ADT exposure."
    }
  };

  function normalizeWhitespace(value) {
    return (value || "").toString().replace(/\s+/g, " ").trim();
  }

  function normalizeList(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map(item => normalizeWhitespace(item))
      .filter(Boolean);
  }

  function normalizeMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const normalized = {};
    Object.entries(value).forEach(([key, mapValue]) => {
      const normalizedKey = normalizeWhitespace(key);
      if (!normalizedKey) {
        return;
      }

      if (mapValue && typeof mapValue === "object" && !Array.isArray(mapValue)) {
        const nested = {};
        Object.entries(mapValue).forEach(([nestedKey, nestedValue]) => {
          const normalizedNestedKey = normalizeWhitespace(nestedKey);
          const normalizedNestedValue = normalizeWhitespace(nestedValue);
          if (normalizedNestedKey && normalizedNestedValue) {
            nested[normalizedNestedKey] = normalizedNestedValue;
          }
        });
        if (Object.keys(nested).length > 0) {
          normalized[normalizedKey] = nested;
        }
        return;
      }

      const normalizedValue = normalizeWhitespace(mapValue);
      if (normalizedValue) {
        normalized[normalizedKey] = normalizedValue;
      }
    });

    return normalized;
  }

  function deriveLegacyDiseaseSettingIds(trial) {
    const primaryLabel = normalizeWhitespace(trial.diseaseSettingPrimary);
    const fallbackLabels = normalizeList(trial.diseaseSettingAll);
    const haystack = (primaryLabel || fallbackLabels[0] || "").toLowerCase();
    const ids = [];

    if (!haystack) {
      return ids;
    }

    if (/crpc/.test(haystack)) {
      if (/non[- ]metastatic|nmcrpc/.test(haystack)) {
        ids.push("crpc_nonmetastatic", "crpc_general");
      } else if (/metastatic/.test(haystack)) {
        if (/post[- ]arpi|2l\+/.test(haystack)) {
          ids.push("crpc_metastatic_postARPI", "crpc_general");
        } else if (/pre[- ]arpi|1l/.test(haystack)) {
          ids.push("crpc_metastatic_preARPI", "crpc_general");
        } else {
          ids.push("crpc_metastatic_preARPI", "crpc_metastatic_postARPI", "crpc_general");
        }
      } else {
        ids.push("crpc_general");
      }
    }

    if (/mcspc|hormone[- ]sensitive/.test(haystack)) {
      if (/oligometastatic|low-volume/.test(haystack)) {
        ids.push("cspc_oligometastatic", "cspc_general");
      } else if (/high-volume/.test(haystack)) {
        ids.push("cspc_high_volume", "cspc_general");
      } else {
        ids.push("cspc_general");
      }
    }

    if (/\bbcr\b|biochemical recurrence/.test(haystack)) {
      if (/after rp|post[- ]rp|prostatectomy/.test(haystack)) {
        ids.push("bcr_post_rp", "bcr_general");
      } else if (/after rt|post[- ]rt|radiation/.test(haystack)) {
        ids.push("bcr_post_rt", "bcr_general");
      } else {
        ids.push("bcr_general");
      }
    }

    if (/unfavorable intermediate/.test(haystack)) {
      ids.push("localized_unfavorable_ir", "localized_general");
    }

    if (/high\s*\/\s*very high risk|high[- ]risk|very high[- ]risk/.test(haystack)) {
      ids.push("localized_high_very_high_risk", "localized_general");
    }

    if (/low\s*\/\s*favorable intermediate|favorable intermediate|low risk/.test(haystack)) {
      ids.push("localized_low_favorable_ir", "localized_general");
    }

    if (/regional\s*\(n1\)|regional n1/.test(haystack)) {
      ids.push("localized_regional_n1", "localized_general");
    }

    if (/localized/.test(haystack) && ids.length === 0) {
      ids.push("localized_general");
    }

    return Array.from(new Set(ids));
  }

  function uniqueSources(trial) {
    const tags = normalizeMap(trial.sourceTags);
    const flat = new Set();

    Object.values(tags).forEach(value => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        Object.values(value).forEach(nestedValue => {
          if (nestedValue) {
            flat.add(nestedValue);
          }
        });
        return;
      }
      if (value) {
        flat.add(value);
      }
    });

    return Array.from(flat);
  }

  function buildTrialSearchText(trial) {
    return [
      trial.title,
      trial.description,
      trial.treatmentModality,
      ...(normalizeList(trial.interventions)),
      ...(normalizeList(trial.conditions))
    ].join(" ").toLowerCase();
  }

  function confidenceScore(trial) {
    return CONFIDENCE_SCORES[(trial.classificationConfidence || "").toUpperCase()] || 0;
  }

  function buildLocationScore(trial, parsedQuery) {
    if (!Array.isArray(parsedQuery.locationPreferences) || parsedQuery.locationPreferences.length === 0) {
      return 0;
    }

    const haystack = [
      trial.location?.hospital,
      trial.location?.city,
      ...(normalizeList(trial.availableInstitutions)),
      ...normalizeList((trial.sites || []).map(site => `${site.institution || ""} ${site.city || ""}`))
    ].join(" ").toLowerCase();

    return parsedQuery.locationPreferences.some(term => haystack.includes(term.toLowerCase())) ? 1 : 0;
  }

  function buildPreferenceScore(trial, parsedQuery) {
    const trialText = buildTrialSearchText(trial);
    let score = 0;

    (parsedQuery.treatmentPreferences || []).forEach(pref => {
      if (pref === "radioligand" && /(radioligand|177lu|lutetium|psma)/i.test(trialText)) score += 2;
      if (pref === "parp" && /(parp|olaparib|rucaparib|niraparib|talazoparib)/i.test(trialText)) score += 2;
      if (pref === "triplet" && /(docetaxel|darolutamide|abiraterone)/i.test(trialText)) score += 1;
      if (pref === "intensification" && /(abiraterone|darolutamide|docetaxel|intensification)/i.test(trialText)) score += 1;
      if (pref === "deintensification" && /(de-?intensification|rt alone|surveillance)/i.test(trialText)) score += 1;
    });

    if (parsedQuery.phasePreference && trial.phase !== parsedQuery.phasePreference) {
      return -10;
    }

    return score;
  }

  function normalizeTrial(trial) {
    const diseaseSettingAll = normalizeList(trial.diseaseSettingAll);
    const diseaseSettingAllIds = normalizeList(trial.diseaseSettingAllIds);
    const diseaseSettingPrimaryId = normalizeWhitespace(trial.diseaseSettingPrimaryId);
    const derivedDiseaseSettingIds = diseaseSettingAllIds.length > 0 || diseaseSettingPrimaryId
      ? []
      : deriveLegacyDiseaseSettingIds({ ...trial, diseaseSettingAll });

    return {
      ...trial,
      diseaseSettingPrimaryId: diseaseSettingPrimaryId || derivedDiseaseSettingIds[0] || "",
      diseaseSettingAllIds: diseaseSettingAllIds.length > 0 ? diseaseSettingAllIds : derivedDiseaseSettingIds,
      diseaseSettingAll,
      classificationEvidence: normalizeList(trial.classificationEvidence),
      availableInstitutions: normalizeList(trial.availableInstitutions),
      clinicalAxes: normalizeMap(trial.clinicalAxes),
      sourceTags: normalizeMap(trial.sourceTags)
    };
  }

  function addFlag(flags, code) {
    const definition = FLAG_DEFINITIONS[code];
    if (!definition) {
      return;
    }
    if (!flags.some(flag => flag.code === code)) {
      flags.push({
        code,
        title: definition.title,
        message: definition.message
      });
    }
  }

  function addResolvedFact(facts, value) {
    if (value && !facts.includes(value)) {
      facts.push(value);
    }
  }

  function buildDiseaseFact(parsedQuery) {
    if (parsedQuery.diseaseLabel === "Unfavorable intermediate risk") {
      return "unfavorable IR";
    }
    if (parsedQuery.diseaseLabel === "High / very high risk") {
      return "high-risk localized";
    }
    return parsedQuery.diseaseLabel;
  }

  function resolveDiseaseIds(parsedQuery) {
    return normalizeList(parsedQuery.diseaseSettingIds);
  }

  function trialMatchesDiseaseSetting(trial, parsedQuery) {
    const allowedIds = resolveDiseaseIds(parsedQuery);
    if (allowedIds.length === 0) {
      return true;
    }

    const trialIds = trial.diseaseSettingAllIds.length > 0
      ? trial.diseaseSettingAllIds
      : normalizeList([trial.diseaseSettingPrimaryId]);

    return trialIds.some(id => allowedIds.includes(id));
  }

  function resolveArpiFact(parsedQuery) {
    const raw = (parsedQuery.rawQuery || "").toLowerCase();
    if (raw.includes("enzalutamide")) return "post-enzalutamide";
    if (raw.includes("abiraterone")) return "post-abiraterone";
    if (raw.includes("apalutamide")) return "post-apalutamide";
    if (raw.includes("darolutamide")) return "post-darolutamide";
    return "post-ARPI";
  }

  function resolveBiomarkerFact(parsedQuery) {
    if (!parsedQuery.clinicalAxes.biomarkerLabel) {
      return "HRR+ eligible";
    }

    if (/brca2/i.test(parsedQuery.clinicalAxes.biomarkerLabel)) {
      return "BRCA2+ eligible";
    }

    return `${parsedQuery.clinicalAxes.biomarkerLabel} eligible`;
  }

  function applyBinaryAxisRule(options) {
    const {
      trialValue,
      queryValue,
      resolvedFacts,
      factsLabel,
      flags,
      flagCode,
      excludes,
      allowValues
    } = options;

    if (!trialValue || trialValue === "unknown" || trialValue === "Not applicable" || trialValue === "not_required") {
      return;
    }

    if (queryValue) {
      if (!allowValues.includes(queryValue)) {
        excludes.push(flagCode);
        return;
      }
      if (trialValue !== queryValue && trialValue !== "required") {
        excludes.push(flagCode);
        return;
      }
      if (factsLabel) {
        addResolvedFact(resolvedFacts, factsLabel);
      }
      return;
    }

    addFlag(flags, flagCode);
  }

  function matchSingleTrial(trialInput, parsedQueryInput) {
    const trial = normalizeTrial(trialInput);
    const parsedQuery = parsedQueryInput || (parserApi ? parserApi.parse("") : { supported: false });

    if (!parsedQuery.supported) {
      return { included: false, excludedReason: parsedQuery.unsupportedReason || "Unsupported query." };
    }

    if ((trial.cancerType || "") !== "Prostate") {
      return { included: false, excludedReason: "Non-prostate trial." };
    }

    if (!trialMatchesDiseaseSetting(trial, parsedQuery)) {
      return { included: false, excludedReason: "Disease setting mismatch." };
    }

    const resolvedFacts = [];
    const flags = [];
    const excludes = [];
    const trialAxes = trial.clinicalAxes || {};
    const queryAxes = parsedQuery.clinicalAxes || {};

    if (parsedQuery.diseaseLabel) {
      addResolvedFact(resolvedFacts, buildDiseaseFact(parsedQuery));
    }

    applyBinaryAxisRule({
      trialValue: trialAxes.castrationStatus,
      queryValue: queryAxes.castrationStatus,
      resolvedFacts,
      factsLabel: parsedQuery.diseaseGroup === "crpc" ? "castration-resistant" : parsedQuery.diseaseGroup === "cspc" ? "castration-sensitive" : "",
      flags,
      flagCode: "castration_status",
      excludes,
      allowValues: ["castration_sensitive", "castration_resistant"]
    });

    if (trialAxes.metastaticStatus && trialAxes.metastaticStatus !== "unknown" && queryAxes.metastaticStatus) {
      if (trialAxes.metastaticStatus !== queryAxes.metastaticStatus && !(trialAxes.metastaticStatus === "metastatic" && parsedQuery.diseaseGroup === "cspc")) {
        excludes.push("staging");
      }
    } else if (trialAxes.metastaticStatus && trialAxes.metastaticStatus !== "unknown" && !queryAxes.metastaticStatus) {
      addFlag(flags, "staging");
    }

    if (trialAxes.priorArpi && trialAxes.priorArpi !== "unknown") {
      if (queryAxes.priorArpi) {
        if (trialAxes.priorArpi !== queryAxes.priorArpi) {
          excludes.push("prior_arpi");
        } else if (queryAxes.priorArpi === "yes") {
          addResolvedFact(resolvedFacts, resolveArpiFact(parsedQuery));
        }
      } else {
        addFlag(flags, "prior_arpi");
      }
    }

    if (trialAxes.priorDocetaxel && trialAxes.priorDocetaxel !== "unknown") {
      if (queryAxes.priorDocetaxel) {
        if (trialAxes.priorDocetaxel !== queryAxes.priorDocetaxel) {
          excludes.push("chemotherapy_history");
        } else if (queryAxes.priorDocetaxel === "no") {
          addResolvedFact(resolvedFacts, "chemo-naive permitted");
        } else {
          addResolvedFact(resolvedFacts, "post-docetaxel");
        }
      } else {
        addFlag(flags, "chemotherapy_history");
      }
    }

    if (trialAxes.biomarkerHrr && trialAxes.biomarkerHrr !== "unknown" && trialAxes.biomarkerHrr !== "not_required") {
      if (queryAxes.biomarkerHrr) {
        if (trialAxes.biomarkerHrr !== queryAxes.biomarkerHrr) {
          excludes.push("brca_hrr");
        } else {
          addResolvedFact(resolvedFacts, resolveBiomarkerFact(parsedQuery));
        }
      } else {
        addFlag(flags, "brca_hrr");
      }
    }

    if (trialAxes.psmaStatus && trialAxes.psmaStatus !== "unknown" && trialAxes.psmaStatus !== "not_required") {
      if (queryAxes.psmaStatus) {
        if (queryAxes.psmaStatus === "negative") {
          excludes.push("psma_status");
        } else {
          addResolvedFact(resolvedFacts, "PSMA-confirmed");
        }
      } else {
        addFlag(flags, "psma_status");
      }
    }

    if (trialAxes.genomicClassifier && trialAxes.genomicClassifier !== "unknown" && trialAxes.genomicClassifier !== "not_required") {
      if (queryAxes.genomicClassifier) {
        addResolvedFact(resolvedFacts, "genomic classifier confirmed");
      } else {
        addFlag(flags, "genomic_classifier");
      }
    }

    if (trialAxes.diseaseVolume && trialAxes.diseaseVolume !== "unknown") {
      if (queryAxes.diseaseVolume) {
        if (trialAxes.diseaseVolume !== queryAxes.diseaseVolume) {
          excludes.push("disease_volume");
        } else if (queryAxes.diseaseVolume === "high_volume") {
          addResolvedFact(resolvedFacts, "high-volume confirmed");
        } else if (queryAxes.diseaseVolume === "oligometastatic") {
          addResolvedFact(resolvedFacts, "oligometastatic");
        } else {
          addResolvedFact(resolvedFacts, "low-volume confirmed");
        }
      } else {
        addFlag(flags, "disease_volume");
      }
    }

    if (parsedQuery.diseaseGroup === "cspc" && !queryAxes.adtStatus) {
      addFlag(flags, "adt_history");
    } else if (parsedQuery.diseaseGroup === "cspc" && queryAxes.adtStatus === "naive") {
      addResolvedFact(resolvedFacts, "ADT-naive");
    }

    const preferenceScore = buildPreferenceScore(trial, parsedQuery);
    if (preferenceScore < 0) {
      return { included: false, excludedReason: "Phase preference mismatch." };
    }

    if (excludes.length > 0) {
      return { included: false, excludedReason: excludes[0] };
    }

    const locationScore = buildLocationScore(trial, parsedQuery);
    const badge = flags.length > 0 ? "Possible match" : "Strong match";
    const reasonText = resolvedFacts.length > 0
      ? `Matches: ${resolvedFacts.join(" · ")}`
      : "Matches: disease setting — multiple eligibility axes unresolved";

    return {
      included: true,
      badge,
      badgeTone: flags.length > 0 ? "possible" : "strong",
      reasonText,
      resolvedFacts,
      flags,
      preferenceScore,
      locationScore,
      aiExtractedReview: Object.keys(trialAxes).length > 0,
      sourceTagSummary: uniqueSources(trial),
      sortScore: (flags.length === 0 ? 1000 : 500) + (preferenceScore * 20) + (locationScore * 10) + (confidenceScore(trial) * 5) + Number(trial.siteCount || 0)
    };
  }

  function matchTrials(options) {
    const trials = Array.isArray(options?.trials) ? options.trials : [];
    const parsedQuery = options?.parsedQuery || (parserApi ? parserApi.parse(options?.query || "") : { supported: false });

    const result = {
      parsedQuery,
      strongMatches: [],
      possibleMatches: [],
      totalConsidered: 0
    };

    trials.forEach(trial => {
      const match = matchSingleTrial(trial, parsedQuery);
      if (!match.included) {
        return;
      }

      result.totalConsidered += 1;
      const entry = { trial, match };
      if (match.badgeTone === "strong") {
        result.strongMatches.push(entry);
      } else {
        result.possibleMatches.push(entry);
      }
    });

    result.strongMatches.sort((a, b) => b.match.sortScore - a.match.sortScore);
    result.possibleMatches.sort((a, b) => b.match.sortScore - a.match.sortScore);
    return result;
  }

  const api = {
    matchSingleTrial,
    matchTrials,
    FLAG_DEFINITIONS
  };

  global.PatientTrialMatcher = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
