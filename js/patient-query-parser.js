(function (global) {
  const LOCATION_TERMS = [
    "san diego",
    "la jolla",
    "los angeles",
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

  const CANCER_SIGNALS = {
    Prostate: [
      { pattern: /\bprostate\b/i, score: 4 },
      { pattern: /\bmcrpc\b|\bnmcrpc\b|\bmcspc\b|\bmhspc\b/i, score: 5 },
      { pattern: /psma|gleason|enzalutamide|abiraterone|apalutamide|darolutamide/i, score: 3 },
      { pattern: /\bbiochemical recurrence\b|\bbcr\b/i, score: 3 }
    ],
    Bladder: [
      { pattern: /\bbladder\b|\burothelial\b|\butuc\b|upper tract urothelial|renal pelvis|ureter/i, score: 4 },
      { pattern: /\bnmibc\b|\bmibc\b|intravesical|turbt|cystectomy|trimodality|bladder[- ]sparing/i, score: 4 },
      { pattern: /\bbcg\b|carcinoma in situ|cisplatin[- ]eligible|cisplatin[- ]ineligible/i, score: 3 }
    ],
    Kidney: [
      { pattern: /\bkidney\b|renal cell carcinoma|\brcc\b/i, score: 4 },
      { pattern: /clear cell|papillary|chromophobe|collecting duct|tfe3|tfeb|vhl|imdc|nephrectomy/i, score: 4 },
      { pattern: /sarcomatoid|cabozantinib|lenvatinib|axitinib|belzutifan/i, score: 2 }
    ],
    Testicular: [
      { pattern: /\btesticular\b|\btestis\b|germ cell tumor|germ cell tumour|\bgct\b/i, score: 4 },
      { pattern: /seminoma|nonseminoma|\bnsgct\b|orchiectomy|rplnd|igcccg/i, score: 4 },
      { pattern: /afp|beta[- ]?hcg|\bhcg\b|\bldh\b|mediastinal primary|extragonadal/i, score: 2 }
    ]
  };

  function normalizeWhitespace(value) {
    return (value || "").toString().replace(/\s+/g, " ").trim();
  }

  function normalizeToken(value) {
    return normalizeWhitespace(value).toLowerCase();
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

  function pushDiseaseIds(list, ids) {
    ids.forEach(id => {
      if (id && !list.includes(id)) {
        list.push(id);
      }
    });
  }

  function createClinicalAxes() {
    return {
      bcgStatus: "",
      cisplatinStatus: "",
      cisPapillaryPattern: "",
      castrationStatus: "",
      metastaticStatus: "",
      diseaseVolume: "",
      priorArpi: "",
      priorDocetaxel: "",
      fgfr3Status: "",
      her2Status: "",
      biomarkerHrr: "",
      biomarkerLabel: "",
      psmaStatus: "",
      genomicClassifier: "",
      genomicClassifierLabel: "",
      adtStatus: "",
      histology: "",
      imdcRisk: "",
      priorSystemicLines: "",
      priorIo: "",
      priorVegfTki: "",
      nephrectomyStatus: "",
      vhlStatus: "",
      metAlteration: "",
      sarcomatoid: "",
      clinicalStage: "",
      igcccgRisk: "",
      primarySite: "",
      priorChemoLines: "",
      priorHdct: "",
      rplndStatus: "",
      markerStatus: "",
      stage1RiskFactors: ""
    };
  }

  function createTemporalFacts() {
    return {
      sinceLastSystemicTherapyDays: null,
      sinceLastRadiationDays: null,
      sinceLastSurgeryDays: null,
      recentImagingDays: null,
      progressedAfterTherapies: [],
      persistentMarkersAfterOrchiectomy: ""
    };
  }

  function detectCancerType(text) {
    let bestType = "";
    let bestScore = 0;

    Object.entries(CANCER_SIGNALS).forEach(([cancerType, signals]) => {
      const score = signals.reduce((total, signal) => total + (signal.pattern.test(text) ? signal.score : 0), 0);
      if (score > bestScore) {
        bestType = cancerType;
        bestScore = score;
      }
    });

    return bestScore > 0 ? bestType : "";
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

  function durationMatchToDays(match) {
    if (!match) {
      return null;
    }

    const amount = Number(match[1]);
    const unit = (match[2] || "").toLowerCase();
    if (!Number.isFinite(amount)) {
      return null;
    }

    if (unit.startsWith("day") || unit === "d") {
      return amount;
    }
    if (unit.startsWith("week") || unit.startsWith("wk") || unit === "w") {
      return amount * 7;
    }
    if (unit.startsWith("month") || unit.startsWith("mo")) {
      return amount * 30;
    }
    return null;
  }

  function extractRelativeDays(text, patterns) {
    for (const pattern of patterns) {
      const days = durationMatchToDays(text.match(pattern));
      if (days !== null) {
        return days;
      }
    }
    return null;
  }

  function normalizeTherapyLabel(raw) {
    const token = normalizeToken(raw).replace(/[^a-z0-9]+/g, " ").trim();
    if (!token) return "";
    if (token.includes("enzalutamide")) return "enzalutamide";
    if (token.includes("abiraterone")) return "abiraterone";
    if (token.includes("apalutamide")) return "apalutamide";
    if (token.includes("darolutamide")) return "darolutamide";
    if (token.includes("docetaxel")) return "docetaxel";
    if (token.includes("cabazitaxel")) return "cabazitaxel";
    if (token.includes("platinum") || token.includes("cisplatin") || token.includes("carboplatin")) return "platinum";
    if (token.includes("pembrolizumab")) return "pembrolizumab";
    if (token.includes("nivolumab")) return "nivolumab";
    if (token.includes("ipilimumab")) return "ipilimumab";
    if (token.includes("io") || token.includes("immunotherapy")) return "immunotherapy";
    if (token.includes("cabozantinib")) return "cabozantinib";
    if (token.includes("axitinib")) return "axitinib";
    if (token.includes("lenvatinib")) return "lenvatinib";
    if (token.includes("systemic therapy") || token.includes("therapy") || token.includes("treatment")) return "systemic therapy";
    return token;
  }

  function detectProgressedAfterTherapies(text) {
    const therapies = [];
    const patterns = [
      /progress(?:ed|ion)?\s+(?:on|after|following)\s+([a-z0-9+\/ -]{3,40})/ig,
      /(?:failed|failure of)\s+([a-z0-9+\/ -]{3,40})/ig
    ];
    const stopTokens = /\b(and|with|without|who|after|before|for|while|because|due|no prior|phase|trial)\b/i;

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let raw = normalizeWhitespace(match[1] || "");
        if (!raw) {
          continue;
        }
        raw = raw.split(/[,.;]/)[0];
        const stop = raw.match(stopTokens);
        if (stop && stop.index > 0) {
          raw = raw.slice(0, stop.index);
        }
        const normalized = normalizeTherapyLabel(raw);
        if (normalized && !therapies.includes(normalized)) {
          therapies.push(normalized);
        }
      }
    });

    return therapies;
  }

  function detectSinceLastSystemicTherapyDays(text) {
    return extractRelativeDays(text, [
      /last\s+(?:systemic therapy|therapy|treatment|study drug|platinum|cisplatin|carboplatin|docetaxel|enzalutamide|abiraterone|apalutamide|darolutamide)[^.;,\n]{0,24}?(\d+)\s*(days?|d|weeks?|wks?|months?|mos?)\s+ago/i,
      /(\d+)\s*(days?|d|weeks?|wks?|months?|mos?)\s+(?:since|after)\s+(?:last\s+)?(?:systemic therapy|therapy|treatment|study drug|platinum|cisplatin|carboplatin|docetaxel|enzalutamide|abiraterone|apalutamide|darolutamide)/i,
      /stopped\s+(?:therapy|treatment|study drug)[^.;,\n]{0,20}?(\d+)\s*(days?|d|weeks?|wks?|months?|mos?)\s+ago/i
    ]);
  }

  function detectSinceLastRadiationDays(text) {
    return extractRelativeDays(text, [
      /last\s+(?:radiation|radiotherapy|rt|xrt)[^.;,\n]{0,20}?(\d+)\s*(days?|d|weeks?|wks?|months?|mos?)\s+ago/i,
      /(\d+)\s*(days?|d|weeks?|wks?|months?|mos?)\s+(?:since|after)\s+(?:last\s+)?(?:radiation|radiotherapy|rt|xrt)/i
    ]);
  }

  function detectSinceLastSurgeryDays(text) {
    return extractRelativeDays(text, [
      /last\s+(?:surgery|prostatectomy|cystectomy|nephrectomy|orchiectomy|rplnd)[^.;,\n]{0,20}?(\d+)\s*(days?|d|weeks?|wks?|months?|mos?)\s+ago/i,
      /(\d+)\s*(days?|d|weeks?|wks?|months?|mos?)\s+(?:since|after)\s+(?:last\s+)?(?:surgery|prostatectomy|cystectomy|nephrectomy|orchiectomy|rplnd)/i
    ]);
  }

  function detectRecentImagingDays(text) {
    return extractRelativeDays(text, [
      /(?:psma pet|pet\/ct|pet ct|ct scan|mri|restaging imaging|imaging)[^.;,\n]{0,20}?(\d+)\s*(days?|d|weeks?|wks?|months?|mos?)\s+ago/i,
      /(\d+)\s*(days?|d|weeks?|wks?|months?|mos?)\s+(?:since|after)\s+(?:psma pet|pet\/ct|pet ct|ct scan|mri|restaging imaging|imaging)/i
    ]);
  }

  function detectPersistentMarkersAfterOrchiectomy(text) {
    const markerToken = /(afp|beta[- ]?hcg|hcg|ldh|markers?)/i;
    const persistenceToken = /(persist(?:ent|ently)|remain(?:s|ed)? elevated|elevated)/i;
    if ((/after orchiectomy/i.test(text) && markerToken.test(text) && persistenceToken.test(text))
      || /(persist(?:ent|ently)|remain(?:s|ed)? elevated).{0,24}(afp|beta[- ]?hcg|hcg|ldh|markers?)/i.test(text)) {
      return "yes";
    }
    return "";
  }

  function detectBcgStatus(text) {
    if (/bcg[- ]unresponsive|bcg[- ]refractory|bcg[- ]resistant|failed bcg|failure.*bcg|persistent.*after.*bcg|recurrent.*after.*bcg|after adequate bcg/i.test(text)) {
      return "BCG-Unresponsive";
    }
    if (/bcg[- ]intolerant|intolerant.*bcg|unable to tolerate bcg|unable to receive bcg/i.test(text)) {
      return "BCG-Intolerant";
    }
    if (/bcg[- ]naive|no prior bcg|bcg eligible|bcg treatment naive/i.test(text)) {
      return "BCG-Naive";
    }
    return "";
  }

  function detectCisplatinStatus(text) {
    if (/cisplatin[- ]ineligible|cisplatin[- ]unfit|ineligible for cisplatin|unable to receive cisplatin|not eligible for cisplatin/i.test(text)) {
      return "Cisplatin-Ineligible";
    }
    if (/cisplatin[- ]eligible|cisplatin[- ]fit|eligible for cisplatin|fit for cisplatin/i.test(text)) {
      return "Cisplatin-Eligible";
    }
    return "";
  }

  function detectCisPapillaryPattern(text) {
    const hasCis = /carcinoma in situ|\bcis\b/i.test(text);
    const hasPapillary = /papillary|high[- ]grade ta|high[- ]grade t1|hg ta|hg t1/i.test(text);

    if (hasCis && hasPapillary) {
      return "cis_plus_papillary";
    }
    if (hasCis) {
      return "cis_only";
    }
    if (hasPapillary) {
      return "papillary_only";
    }
    return "";
  }

  function detectFgfr3Status(text) {
    if (/fgfr3.{0,24}(susceptible alteration|mutation|mutated|fusion|altered|positive)|erdafitinib candidate|fgfr inhibitor candidate/i.test(text)) {
      return "susceptible_alteration";
    }
    if (/fgfr3.{0,24}(wild[- ]type|negative)|no fgfr3 alteration|without fgfr3 alteration/i.test(text)) {
      return "wild_type";
    }
    return "";
  }

  function detectHer2Status(text) {
    if (/\bher2\b.{0,12}(ihc\s*)?3\+|\berbb2\b.{0,24}(3\+|high|positive)|her2 overexpress/i.test(text)) {
      return "ihc_3_plus";
    }
    if (/\bher2\b.{0,12}(ihc\s*)?2\+|\berbb2\b.{0,24}2\+/i.test(text)) {
      return "ihc_2_plus";
    }
    if (/\bher2\b.{0,16}(equivocal)|\berbb2\b.{0,16}(equivocal)/i.test(text)) {
      return "equivocal";
    }
    if (/\bher2\b.{0,12}(0|1\+|negative|low)|\berbb2\b.{0,24}(negative|low)|her2 low/i.test(text)) {
      return "negative_or_low";
    }
    return "";
  }

  function detectKidneyHistology(text) {
    if (/clear[- ]cell|ccrcc/i.test(text)) {
      return "clear_cell";
    }
    if (/papillary/i.test(text)) {
      return "papillary";
    }
    if (/chromophobe/i.test(text)) {
      return "chromophobe";
    }
    if (/collecting duct/i.test(text)) {
      return "collecting_duct";
    }
    if (/tfe3|tfeb|translocation/i.test(text)) {
      return "translocation";
    }
    return "";
  }

  function detectImdcRisk(text) {
    if (/imdc.{0,12}(intermediate|poor)|intermediate[- ]poor/i.test(text)) {
      return "intermediate_poor";
    }
    if (/imdc.{0,12}favorable|favo[u]?rable risk|good risk metastatic rcc/i.test(text)) {
      return "favorable";
    }
    if (/imdc.{0,12}intermediate|intermediate risk/i.test(text)) {
      return "intermediate";
    }
    if (/imdc.{0,12}poor|poor risk/i.test(text)) {
      return "poor";
    }
    return "";
  }

  function detectPriorSystemicLines(text) {
    if (/third[- ]line|3rd[- ]line|heavily pretreated|multiple prior lines|two prior lines|2 prior lines|>= ?2 prior lines/i.test(text)) {
      return "2+";
    }
    if (/second[- ]line|2nd[- ]line|one prior line|1 prior line|after one prior line|after first[- ]line|post[- ]platinum|prior platinum|after platinum|post[- ]io|previously treated/i.test(text)) {
      return "1";
    }
    if (/treatment[- ]naive|systemic[- ]naive|no prior systemic therapy|untreated metastatic/i.test(text)) {
      return "0";
    }
    if (/(^|[^a-z])(first[- ]line|1st[- ]line)([^a-z]|$)/i.test(text) && !/after first[- ]line|post[- ]first[- ]line/i.test(text)) {
      return "0";
    }
    return "";
  }

  function detectPriorIo(text) {
    if (/io[- ]naive|no prior io|no prior immunotherapy|no prior pd-?1|no prior pd-?l1/i.test(text)) {
      return "no";
    }
    if (/prior io|prior immunotherapy|prior pd-?1|prior pd-?l1|received nivolumab|received pembrolizumab|received ipilimumab|post[- ]io/i.test(text)) {
      return "yes";
    }
    return "";
  }

  function detectPriorVegfTki(text) {
    if (/vegf[- ]tki[- ]naive|tki[- ]naive|no prior vegf|no prior tki|no prior vegf\/tki/i.test(text)) {
      return "no";
    }
    if (/prior vegf|prior tki|prior vegf\/tki|received cabozantinib|received axitinib|received lenvatinib|received sunitinib|received pazopanib|post[- ]tki/i.test(text)) {
      return "yes";
    }
    return "";
  }

  function detectNephrectomyStatus(text) {
    if (/post[- ]nephrectomy|after nephrectomy|prior nephrectomy|status post nephrectomy|s\/p nephrectomy|resected primary/i.test(text)) {
      return "prior_nephrectomy";
    }
    if (/cytoreductive nephrectomy candidate|candidate for cn|unresected primary|primary in place/i.test(text)) {
      return "cytoreductive_candidate";
    }
    if (/not a nephrectomy candidate|not candidate for nephrectomy|unfit for nephrectomy/i.test(text)) {
      return "no_nephrectomy_not_candidate";
    }
    return "";
  }

  function detectVhlStatus(text) {
    if (/von hippel[- ]lindau|\bvhl\b.{0,16}(mut|altered|associated|disease)|vhl-associated/i.test(text)) {
      return "vhl_altered";
    }
    return "";
  }

  function detectMetAlteration(text) {
    if (/\bmet\b.{0,16}(mutation|mutated|altered)/i.test(text)) {
      return "met_mutation";
    }
    if (/\bmet\b.{0,16}(amplified|amplification)/i.test(text)) {
      return "met_amplification";
    }
    return "";
  }

  function detectSarcomatoid(text) {
    if (/sarcomatoid/i.test(text)) {
      return "yes";
    }
    return "";
  }

  function detectTesticularHistology(text) {
    if (/pure seminoma|seminoma only|\bseminoma\b/i.test(text)) {
      return "pure_seminoma";
    }
    if (/mixed germ cell|mixed nonseminoma|mixed seminoma.*nsgct/i.test(text)) {
      return "mixed_gct";
    }
    if (/nonseminoma|non[- ]seminomatous|\bnsgct\b|yolk sac|embryonal|choriocarcinoma|teratoma/i.test(text)) {
      return "nsgct";
    }
    return "";
  }

  function detectClinicalStage(text) {
    if (/stage is|clinical stage is|persistently elevated markers/i.test(text)) {
      return "stage_is";
    }
    if (/stage ia|stage ib|clinical stage i\b|stage i\b/i.test(text)) {
      if (/stage ia/i.test(text)) {
        return "stage_1a";
      }
      return "stage_1_unspecified";
    }
    if (/stage iia|stage iib|cs iia|cs iib/i.test(text)) {
      return "stage_2a_2b";
    }
    if (/stage iic|stage iii|advanced gct|metastatic gct|metastatic seminoma|metastatic nonseminoma/i.test(text)) {
      return "stage_3_unspecified";
    }
    return "";
  }

  function detectIgcccgRisk(text) {
    if (/igcccg.{0,12}good|good[- ]risk|good prognosis/i.test(text)) {
      return "good";
    }
    if (/igcccg.{0,12}intermediate|intermediate[- ]risk|intermediate prognosis/i.test(text)) {
      return "intermediate";
    }
    if (/igcccg.{0,12}poor|poor[- ]risk|poor prognosis/i.test(text)) {
      return "poor";
    }
    return "";
  }

  function detectPrimarySite(text) {
    if (/mediastinal|extragonadal/i.test(text)) {
      return "mediastinal";
    }
    if (/intracranial|pineal|suprasellar/i.test(text)) {
      return "intracranial";
    }
    if (/retroperitoneal primary|retroperitoneal germ cell/i.test(text)) {
      return "retroperitoneal";
    }
    if (/\btesticular\b|\btestis\b/i.test(text)) {
      return "testicular";
    }
    return "";
  }

  function detectPriorChemoLines(text) {
    if (/third[- ]line|2 prior lines|two prior lines|heavily pretreated|multiple prior lines/i.test(text)) {
      return "2+";
    }
    if (/after bep|after ep|after first[- ]line|second[- ]line|1 prior line|one prior line|salvage/i.test(text)) {
      return "1";
    }
    if (/no prior chemotherapy|chemo[- ]naive|treatment[- ]naive/i.test(text)) {
      return "0";
    }
    if (/(^|[^a-z])(first[- ]line|1st[- ]line)([^a-z]|$)/i.test(text) && !/after first[- ]line|post[- ]first[- ]line/i.test(text)) {
      return "0";
    }
    return "";
  }

  function detectPriorHdct(text) {
    if (/no prior hdct|no prior high[- ]dose chemotherapy|hdct[- ]naive/i.test(text)) {
      return "no";
    }
    if (/prior hdct|after hdct|after high[- ]dose chemotherapy|ti-?ce|stem cell rescue/i.test(text)) {
      return "yes";
    }
    return "";
  }

  function detectMarkerStatus(text) {
    if (/markers normal|normal markers|afp normal|beta[- ]?hcg normal|ldh normal/i.test(text)) {
      return "markers_normal";
    }
    if (/elevated markers|rising markers|persistently elevated afp|persistently elevated hcg|afp elevated|beta[- ]?hcg elevated|ldh elevated/i.test(text)) {
      return "markers_elevated";
    }
    return "";
  }

  function detectStage1RiskFactors(text) {
    if (/lymphovascular invasion|\blvi\b|spermatic cord invasion|rete testis|risk factors?/i.test(text)) {
      return "present";
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

    if (/radioligand|lutetium|177lu|psma/i.test(text)) addPreference(preferences, "radioligand");
    if (/parp|olaparib|rucaparib|niraparib|talazoparib/i.test(text)) addPreference(preferences, "parp");
    if (/triplet/i.test(text)) addPreference(preferences, "triplet");
    if (/intensification/i.test(text)) addPreference(preferences, "intensification");
    if (/de[- ]intensification|deintensification/i.test(text)) addPreference(preferences, "deintensification");
    if (/intravesical|bcg|nadofaragene|anktiva|nogapendekin/i.test(text)) addPreference(preferences, "intravesical");
    if (/bladder[- ]sparing|trimodality|tmt|chemoradiation/i.test(text)) addPreference(preferences, "bladder_preservation");
    if (/immunotherapy|pd-?1|pd-?l1|nivolumab|pembrolizumab|avelumab|durvalumab|ipilimumab/i.test(text)) addPreference(preferences, "immunotherapy");
    if (/targeted|erdafitinib|fgfr|belzutifan|cabozantinib|axitinib|lenvatinib|vhl|met inhibitor/i.test(text)) addPreference(preferences, "targeted");
    if (/surveillance|active surveillance/i.test(text)) addPreference(preferences, "surveillance");
    if ((/high[- ]dose chemotherapy|hdct|ti-?ce/i.test(text)) && !/no prior hdct|no prior high[- ]dose chemotherapy|hdct[- ]naive/i.test(text)) {
      addPreference(preferences, "high_dose");
    }

    return preferences;
  }

  function finalizeDiseaseSettingIds(parsed) {
    const axes = parsed.clinicalAxes;
    const ids = [];

    if (parsed.cancerType === "Prostate") {
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

      if (parsed.diseaseGroup === "localized" || parsed.diseaseGroup === "bcr") {
        ids.push(...parsed.diseaseSettingIds);
      }
    }

    if (parsed.cancerType === "Bladder" || parsed.cancerType === "Kidney" || parsed.cancerType === "Testicular") {
      ids.push(...parsed.diseaseSettingIds);
    }

    parsed.diseaseSettingIds = Array.from(new Set(ids.filter(Boolean)));
  }

  function parseProstate(parsed, text) {
    const diseaseContext = detectDiseaseContext(text);
    parsed.diseaseGroup = diseaseContext.diseaseGroup;
    parsed.diseaseLabel = diseaseContext.diseaseLabel;
    parsed.diseaseSettingIds = diseaseContext.diseaseSettingIds.slice();

    if (parsed.diseaseGroup === "crpc") {
      parsed.clinicalAxes.castrationStatus = "castration_resistant";
      parsed.clinicalAxes.metastaticStatus = parsed.diseaseLabel === "nmCRPC" ? "nonmetastatic_crpc" : "metastatic";
    } else if (parsed.diseaseGroup === "cspc") {
      parsed.clinicalAxes.castrationStatus = "castration_sensitive";
      parsed.clinicalAxes.metastaticStatus = "metastatic";
    } else if (parsed.diseaseGroup === "localized") {
      parsed.clinicalAxes.metastaticStatus = "localized";
    }

    const arpiState = detectArpiState(text);
    parsed.clinicalAxes.priorArpi = arpiState.value;
    parsed.clinicalAxes.priorDocetaxel = detectDocetaxelState(text);

    const hrrState = detectHrrState(text);
    parsed.clinicalAxes.biomarkerHrr = hrrState.value;
    parsed.clinicalAxes.biomarkerLabel = hrrState.label;

    parsed.clinicalAxes.psmaStatus = detectPsmaState(text);

    const classifierState = detectGenomicClassifier(text);
    parsed.clinicalAxes.genomicClassifier = classifierState.value;
    parsed.clinicalAxes.genomicClassifierLabel = classifierState.label;

    parsed.clinicalAxes.diseaseVolume = detectDiseaseVolume(text);
    parsed.clinicalAxes.adtStatus = detectAdtState(text);

    if (/declines further hormonal therapy/i.test(text)) {
      parsed.notes.push("Declines further hormonal therapy");
    }
    if (/radiation candidate|eligible for radiation/i.test(text)) {
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
  }

  function parseBladder(parsed, text) {
    parsed.clinicalAxes.bcgStatus = detectBcgStatus(text);
    parsed.clinicalAxes.cisplatinStatus = detectCisplatinStatus(text);
    parsed.clinicalAxes.cisPapillaryPattern = detectCisPapillaryPattern(text);
    parsed.clinicalAxes.fgfr3Status = detectFgfr3Status(text);
    parsed.clinicalAxes.her2Status = detectHer2Status(text);
    parsed.clinicalAxes.priorSystemicLines = detectPriorSystemicLines(text);
    parsed.clinicalAxes.priorIo = detectPriorIo(text);

    if (/\bnmibc\b|non[- ]muscle[- ]invasive|carcinoma in situ|high[- ]grade t1|intravesical/i.test(text)) {
      parsed.diseaseGroup = "nmibc";
      if (parsed.clinicalAxes.bcgStatus === "BCG-Unresponsive") {
        parsed.diseaseLabel = "NMIBC — BCG-unresponsive";
        pushDiseaseIds(parsed.diseaseSettingIds, ["nmibc_bcg_unresponsive", "nmibc_general"]);
      } else if (parsed.clinicalAxes.bcgStatus === "BCG-Naive" || /high[- ]risk|cis with|cis\b|high[- ]grade/i.test(text)) {
        parsed.diseaseLabel = "NMIBC — high risk";
        pushDiseaseIds(parsed.diseaseSettingIds, ["nmibc_high_risk_bcg_naive", "nmibc_general"]);
      } else if (/intermediate[- ]risk|low[- ]grade ta|recurrent low[- ]grade/i.test(text)) {
        parsed.diseaseLabel = "NMIBC — intermediate risk";
        pushDiseaseIds(parsed.diseaseSettingIds, ["nmibc_intermediate_risk", "nmibc_general"]);
      } else {
        parsed.diseaseLabel = "NMIBC";
        pushDiseaseIds(parsed.diseaseSettingIds, ["nmibc_bcg_unresponsive", "nmibc_high_risk_bcg_naive", "nmibc_intermediate_risk", "nmibc_general"]);
      }
    } else if (/metastatic|stage ivb|m1|advanced urothelial|advanced bladder|distant metast/i.test(text)) {
      parsed.diseaseGroup = "metastatic";
      parsed.diseaseLabel = "Metastatic urothelial cancer";
      if (parsed.clinicalAxes.priorSystemicLines === "1" || /post[- ]platinum|prior platinum|platinum[- ]refractory|platinum[- ]resistant|second[- ]line/i.test(text)) {
        parsed.diseaseLabel = "Metastatic urothelial — post-platinum";
        pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_2l_plus", "metastatic_general"]);
      } else if (parsed.clinicalAxes.priorSystemicLines === "0") {
        if (parsed.clinicalAxes.cisplatinStatus === "Cisplatin-Ineligible") {
          parsed.diseaseLabel = "Metastatic urothelial — 1L cisplatin-ineligible";
          pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_1l_cisplatin_ineligible", "metastatic_1l_general", "metastatic_general"]);
        } else if (parsed.clinicalAxes.cisplatinStatus === "Cisplatin-Eligible") {
          parsed.diseaseLabel = "Metastatic urothelial — 1L cisplatin-eligible";
          pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_1l_cisplatin_eligible", "metastatic_1l_general", "metastatic_general"]);
        } else {
          parsed.diseaseLabel = "Metastatic urothelial — 1L";
          pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_1l_cisplatin_eligible", "metastatic_1l_cisplatin_ineligible", "metastatic_1l_general", "metastatic_general"]);
        }
      } else {
        pushDiseaseIds(parsed.diseaseSettingIds, [
          "metastatic_2l_plus",
          "metastatic_1l_cisplatin_eligible",
          "metastatic_1l_cisplatin_ineligible",
          "metastatic_1l_general",
          "metastatic_general"
        ]);
      }
    } else if (/locally advanced|unresectable|stage iva|node[- ]positive|n2|n3/i.test(text)) {
      parsed.diseaseGroup = "locally_advanced";
      parsed.diseaseLabel = "Locally advanced urothelial cancer";
      pushDiseaseIds(parsed.diseaseSettingIds, ["locally_advanced"]);
    } else if (/bladder[- ]preservation|bladder[- ]sparing|trimodality|\btmt\b|chemoradiation/i.test(text)) {
      parsed.diseaseGroup = "mibc";
      parsed.diseaseLabel = "MIBC — bladder preservation";
      pushDiseaseIds(parsed.diseaseSettingIds, ["mibc_bladder_preservation", "mibc_general"]);
    } else if (/adjuvant|post[- ]cystectomy|after cystectomy/i.test(text)) {
      parsed.diseaseGroup = "mibc";
      parsed.diseaseLabel = "MIBC — adjuvant";
      pushDiseaseIds(parsed.diseaseSettingIds, ["mibc_adjuvant", "mibc_general"]);
    } else if (/neoadjuvant|perioperative|pre[- ]cystectomy|before cystectomy/i.test(text)) {
      parsed.diseaseGroup = "mibc";
      parsed.diseaseLabel = "MIBC — perioperative";
      pushDiseaseIds(parsed.diseaseSettingIds, ["mibc_neoadjuvant", "mibc_general"]);
    } else if (/\bmibc\b|muscle[- ]invasive|cystectomy planned|ct2|ct3|ct4a/i.test(text)) {
      parsed.diseaseGroup = "mibc";
      parsed.diseaseLabel = "MIBC";
      pushDiseaseIds(parsed.diseaseSettingIds, ["mibc_neoadjuvant", "mibc_adjuvant", "mibc_bladder_preservation", "mibc_stage_iiib", "mibc_general"]);
    } else if (/\bbladder\b|\burothelial\b|upper tract urothelial|utuc|renal pelvis|ureter/i.test(text)) {
      parsed.diseaseGroup = "urothelial";
      parsed.diseaseLabel = "Bladder / urothelial cancer";
    }

    finalizeDiseaseSettingIds(parsed);

    if (parsed.diseaseLabel) addChip(parsed.chips, "Disease", parsed.diseaseLabel);
    if (parsed.clinicalAxes.bcgStatus) addChip(parsed.chips, "Treatment", parsed.clinicalAxes.bcgStatus);
    if (parsed.clinicalAxes.cisplatinStatus) addChip(parsed.chips, "Treatment", parsed.clinicalAxes.cisplatinStatus);
    if (parsed.clinicalAxes.cisPapillaryPattern === "cis_only") addChip(parsed.chips, "Disease", "CIS only");
    if (parsed.clinicalAxes.cisPapillaryPattern === "papillary_only") addChip(parsed.chips, "Disease", "Papillary only");
    if (parsed.clinicalAxes.cisPapillaryPattern === "cis_plus_papillary") addChip(parsed.chips, "Disease", "CIS + papillary");
    if (parsed.clinicalAxes.fgfr3Status === "susceptible_alteration") addChip(parsed.chips, "Biomarker", "FGFR3 altered");
    if (parsed.clinicalAxes.her2Status === "ihc_3_plus") addChip(parsed.chips, "Biomarker", "HER2 IHC 3+");
    if (parsed.clinicalAxes.her2Status === "ihc_2_plus") addChip(parsed.chips, "Biomarker", "HER2 IHC 2+");
    if (parsed.clinicalAxes.priorSystemicLines === "0") addChip(parsed.chips, "Treatment", "Treatment-naive");
    if (parsed.clinicalAxes.priorSystemicLines === "1") addChip(parsed.chips, "Treatment", "Previously treated");
    if (parsed.clinicalAxes.priorIo === "no") addChip(parsed.chips, "Treatment", "IO-naive");
    if (parsed.clinicalAxes.priorIo === "yes") addChip(parsed.chips, "Treatment", "Prior IO");
  }

  function parseKidney(parsed, text) {
    parsed.clinicalAxes.histology = detectKidneyHistology(text);
    parsed.clinicalAxes.imdcRisk = detectImdcRisk(text);
    parsed.clinicalAxes.priorSystemicLines = detectPriorSystemicLines(text);
    parsed.clinicalAxes.priorIo = detectPriorIo(text);
    parsed.clinicalAxes.priorVegfTki = detectPriorVegfTki(text);
    parsed.clinicalAxes.nephrectomyStatus = detectNephrectomyStatus(text);
    parsed.clinicalAxes.vhlStatus = detectVhlStatus(text);
    parsed.clinicalAxes.metAlteration = detectMetAlteration(text);
    parsed.clinicalAxes.sarcomatoid = detectSarcomatoid(text);

    if (/hereditary|von hippel|vhl[- ]associated|hereditary rcc/i.test(text) || parsed.clinicalAxes.vhlStatus) {
      parsed.diseaseGroup = "hereditary";
      parsed.diseaseLabel = "Hereditary RCC";
      pushDiseaseIds(parsed.diseaseSettingIds, ["hereditary_rcc"]);
    } else if (/adjuvant|post[- ]nephrectomy|after nephrectomy|m1 ned|disease[- ]free after nephrectomy|resected high[- ]risk/i.test(text)) {
      parsed.diseaseGroup = "adjuvant";
      parsed.diseaseLabel = "Adjuvant RCC";
      pushDiseaseIds(parsed.diseaseSettingIds, ["adjuvant_post_nephrectomy"]);
    } else if (/locally advanced|unresectable|neoadjuvant|presurgical|downsizing/i.test(text)) {
      parsed.diseaseGroup = "locally_advanced";
      parsed.diseaseLabel = "Locally advanced RCC";
      pushDiseaseIds(parsed.diseaseSettingIds, ["locally_advanced_unresectable"]);
    } else if (/metastatic|advanced|stage iv|\bmrcc\b/i.test(text)) {
      parsed.diseaseGroup = "metastatic";
      const histology = parsed.clinicalAxes.histology;
      const lines = parsed.clinicalAxes.priorSystemicLines;
      if (histology === "clear_cell") {
        if (lines === "0") {
          if (parsed.clinicalAxes.imdcRisk === "favorable") {
            parsed.diseaseLabel = "Metastatic ccRCC — favorable risk";
            pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_ccrcc_favorable_1l", "metastatic_ccrcc_1l_all_risk", "metastatic_ccrcc_general"]);
          } else if (parsed.clinicalAxes.imdcRisk === "intermediate" || parsed.clinicalAxes.imdcRisk === "poor" || parsed.clinicalAxes.imdcRisk === "intermediate_poor") {
            parsed.diseaseLabel = "Metastatic ccRCC — intermediate/poor risk";
            pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_ccrcc_int_poor_1l", "metastatic_ccrcc_1l_all_risk", "metastatic_ccrcc_general"]);
          } else {
            parsed.diseaseLabel = "Metastatic ccRCC — 1L";
            pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_ccrcc_favorable_1l", "metastatic_ccrcc_int_poor_1l", "metastatic_ccrcc_1l_all_risk", "metastatic_ccrcc_general"]);
          }
        } else if (lines === "1" && parsed.clinicalAxes.priorIo === "yes") {
          parsed.diseaseLabel = "Metastatic ccRCC — IO experienced";
          pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_ccrcc_2l_io_experienced", "metastatic_ccrcc_general"]);
        } else if (lines === "1") {
          parsed.diseaseLabel = "Metastatic ccRCC — previously treated";
          pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_ccrcc_2l_io_naive", "metastatic_ccrcc_2l_io_experienced", "metastatic_ccrcc_general"]);
        } else if (lines === "2+") {
          parsed.diseaseLabel = "Metastatic ccRCC — 3L+";
          pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_ccrcc_3l_plus", "metastatic_ccrcc_general"]);
        } else {
          parsed.diseaseLabel = "Metastatic ccRCC";
          pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_ccrcc_favorable_1l", "metastatic_ccrcc_int_poor_1l", "metastatic_ccrcc_1l_all_risk", "metastatic_ccrcc_2l_io_naive", "metastatic_ccrcc_2l_io_experienced", "metastatic_ccrcc_3l_plus", "metastatic_ccrcc_general"]);
        }
      } else if (histology === "papillary") {
        parsed.diseaseLabel = "Metastatic papillary RCC";
        pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_ncrcc_papillary", "metastatic_ncrcc_general"]);
      } else if (histology === "chromophobe") {
        parsed.diseaseLabel = "Metastatic chromophobe RCC";
        pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_ncrcc_chromophobe", "metastatic_ncrcc_general"]);
      } else if (histology === "collecting_duct") {
        parsed.diseaseLabel = "Metastatic collecting duct RCC";
        pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_ncrcc_collecting_duct", "metastatic_ncrcc_general"]);
      } else if (histology === "translocation") {
        parsed.diseaseLabel = "Metastatic translocation RCC";
        pushDiseaseIds(parsed.diseaseSettingIds, ["metastatic_ncrcc_tfe3_tfeb", "metastatic_ncrcc_general"]);
      } else {
        parsed.diseaseLabel = "Metastatic RCC";
        pushDiseaseIds(parsed.diseaseSettingIds, [
          "metastatic_ccrcc_favorable_1l",
          "metastatic_ccrcc_int_poor_1l",
          "metastatic_ccrcc_1l_all_risk",
          "metastatic_ccrcc_2l_io_naive",
          "metastatic_ccrcc_2l_io_experienced",
          "metastatic_ccrcc_3l_plus",
          "metastatic_ccrcc_general",
          "metastatic_ncrcc_papillary",
          "metastatic_ncrcc_chromophobe",
          "metastatic_ncrcc_collecting_duct",
          "metastatic_ncrcc_tfe3_tfeb",
          "metastatic_ncrcc_general"
        ]);
      }
    } else if (/t1a|small renal mass|partial nephrectomy|ablation|active surveillance/i.test(text)) {
      parsed.diseaseGroup = "localized";
      parsed.diseaseLabel = "Localized RCC — T1a";
      pushDiseaseIds(parsed.diseaseSettingIds, ["localized_t1a"]);
    } else if (/t1b|4[- ]7 cm/i.test(text)) {
      parsed.diseaseGroup = "localized";
      parsed.diseaseLabel = "Localized RCC — T1b";
      pushDiseaseIds(parsed.diseaseSettingIds, ["localized_t1b"]);
    } else if (/stage ii|stage iii|t2|t3|high[- ]risk localized/i.test(text)) {
      parsed.diseaseGroup = "localized";
      parsed.diseaseLabel = "Localized RCC — Stage II/III";
      pushDiseaseIds(parsed.diseaseSettingIds, ["localized_stage2_3"]);
    } else {
      parsed.diseaseGroup = "rcc";
      parsed.diseaseLabel = "Kidney / RCC";
    }

    finalizeDiseaseSettingIds(parsed);

    if (parsed.diseaseLabel) addChip(parsed.chips, "Disease", parsed.diseaseLabel);
    if (parsed.clinicalAxes.histology) addChip(parsed.chips, "Disease", parsed.clinicalAxes.histology.replace(/_/g, " "));
    if (parsed.clinicalAxes.imdcRisk) addChip(parsed.chips, "Risk", `IMDC ${parsed.clinicalAxes.imdcRisk.replace(/_/g, "/")}`);
    if (parsed.clinicalAxes.priorIo === "no") addChip(parsed.chips, "Treatment", "IO-naive");
    if (parsed.clinicalAxes.priorIo === "yes") addChip(parsed.chips, "Treatment", "Prior IO");
    if (parsed.clinicalAxes.priorVegfTki === "no") addChip(parsed.chips, "Treatment", "VEGF-TKI naive");
    if (parsed.clinicalAxes.priorVegfTki === "yes") addChip(parsed.chips, "Treatment", "Prior VEGF-TKI");
    if (parsed.clinicalAxes.nephrectomyStatus === "prior_nephrectomy") addChip(parsed.chips, "Treatment", "Prior nephrectomy");
    if (parsed.clinicalAxes.sarcomatoid === "yes") addChip(parsed.chips, "Disease", "Sarcomatoid");
    if (parsed.clinicalAxes.vhlStatus) addChip(parsed.chips, "Biomarker", "VHL-altered");
    if (parsed.clinicalAxes.metAlteration) addChip(parsed.chips, "Biomarker", parsed.clinicalAxes.metAlteration === "met_amplification" ? "MET amplification" : "MET mutation");
  }

  function parseTesticular(parsed, text) {
    parsed.clinicalAxes.histology = detectTesticularHistology(text);
    parsed.clinicalAxes.clinicalStage = detectClinicalStage(text);
    parsed.clinicalAxes.igcccgRisk = detectIgcccgRisk(text);
    parsed.clinicalAxes.primarySite = detectPrimarySite(text);
    parsed.clinicalAxes.priorChemoLines = detectPriorChemoLines(text);
    parsed.clinicalAxes.priorHdct = detectPriorHdct(text);
    parsed.clinicalAxes.markerStatus = detectMarkerStatus(text);
    parsed.clinicalAxes.stage1RiskFactors = detectStage1RiskFactors(text);
    if (/prior rplnd|post[- ]rplnd|after rplnd/i.test(text)) {
      parsed.clinicalAxes.rplndStatus = "prior_rplnd";
    }

    const histology = parsed.clinicalAxes.histology;
    const stage = parsed.clinicalAxes.clinicalStage;
    const lines = parsed.clinicalAxes.priorChemoLines;

    if (parsed.clinicalAxes.primarySite && parsed.clinicalAxes.primarySite !== "testicular") {
      parsed.diseaseGroup = "extragonadal";
      parsed.diseaseLabel = "Extragonadal GCT";
      pushDiseaseIds(parsed.diseaseSettingIds, ["extragonadal_gct"]);
    } else if (/recurrent|relapsed|refractory|salvage|after bep|after ep|after first[- ]line|second[- ]line|third[- ]line|ti-?ce|hdct/i.test(text) || lines === "1" || lines === "2+" || parsed.clinicalAxes.priorHdct === "yes") {
      parsed.diseaseGroup = "recurrent";
      if (histology === "pure_seminoma") {
        if (lines === "2+" || parsed.clinicalAxes.priorHdct === "yes") {
          parsed.diseaseLabel = "Seminoma — 3L+";
          pushDiseaseIds(parsed.diseaseSettingIds, ["seminoma_3l_plus", "gct_advanced_general"]);
        } else {
          parsed.diseaseLabel = "Seminoma — recurrent / 2L";
          pushDiseaseIds(parsed.diseaseSettingIds, ["seminoma_recurrent_2l", "gct_advanced_general"]);
        }
      } else if (histology === "nsgct" || histology === "mixed_gct") {
        if (lines === "2+" || parsed.clinicalAxes.priorHdct === "yes") {
          parsed.diseaseLabel = "NSGCT — 3L+";
          pushDiseaseIds(parsed.diseaseSettingIds, ["nsgct_3l_plus", "gct_advanced_general"]);
        } else {
          parsed.diseaseLabel = "NSGCT — recurrent / 2L";
          pushDiseaseIds(parsed.diseaseSettingIds, ["nsgct_recurrent_2l", "gct_advanced_general"]);
        }
      } else {
        parsed.diseaseLabel = "Recurrent GCT";
        pushDiseaseIds(parsed.diseaseSettingIds, ["gct_advanced_general"]);
      }
    } else if (stage === "stage_is" && (histology === "nsgct" || histology === "mixed_gct")) {
      parsed.diseaseGroup = "stage_is";
      parsed.diseaseLabel = "NSGCT — stage IS";
      pushDiseaseIds(parsed.diseaseSettingIds, ["nsgct_stage_is", "gct_advanced_general"]);
    } else if (stage === "stage_1a" || stage === "stage_1_unspecified") {
      parsed.diseaseGroup = "stage1";
      if (histology === "pure_seminoma") {
        parsed.diseaseLabel = "Seminoma — stage I";
        pushDiseaseIds(parsed.diseaseSettingIds, ["seminoma_stage1", "gct_stage1_general"]);
      } else if (histology === "nsgct" || histology === "mixed_gct") {
        parsed.diseaseLabel = "NSGCT — stage I";
        pushDiseaseIds(parsed.diseaseSettingIds, ["nsgct_stage1", "gct_stage1_general"]);
      } else {
        parsed.diseaseLabel = "GCT — stage I";
        pushDiseaseIds(parsed.diseaseSettingIds, ["gct_stage1_general"]);
      }
    } else if (stage === "stage_2a_2b") {
      parsed.diseaseGroup = "stage2";
      if (histology === "pure_seminoma") {
        parsed.diseaseLabel = "Seminoma — stage IIA/IIB";
        pushDiseaseIds(parsed.diseaseSettingIds, ["seminoma_stage2a_2b", "gct_advanced_general"]);
      } else if (histology === "nsgct" || histology === "mixed_gct") {
        parsed.diseaseLabel = "NSGCT — stage IIA/IIB";
        pushDiseaseIds(parsed.diseaseSettingIds, ["nsgct_stage2a_2b", "gct_advanced_general"]);
      } else {
        parsed.diseaseLabel = "GCT — stage IIA/IIB";
        pushDiseaseIds(parsed.diseaseSettingIds, ["gct_advanced_general"]);
      }
    } else if (stage === "stage_3_unspecified" || /advanced|metastatic/i.test(text)) {
      parsed.diseaseGroup = "advanced";
      if (histology === "pure_seminoma") {
        parsed.diseaseLabel = "Seminoma — advanced";
        pushDiseaseIds(parsed.diseaseSettingIds, ["seminoma_stage2c_3", "gct_advanced_general"]);
      } else if (histology === "nsgct" || histology === "mixed_gct") {
        if (parsed.clinicalAxes.igcccgRisk === "good") {
          parsed.diseaseLabel = "NSGCT — good-risk advanced";
          pushDiseaseIds(parsed.diseaseSettingIds, ["nsgct_good_risk_advanced", "gct_advanced_general"]);
        } else if (parsed.clinicalAxes.igcccgRisk === "intermediate" || parsed.clinicalAxes.igcccgRisk === "poor") {
          parsed.diseaseLabel = "NSGCT — intermediate/poor-risk advanced";
          pushDiseaseIds(parsed.diseaseSettingIds, ["nsgct_intermediate_poor_risk_advanced", "gct_advanced_general"]);
        } else {
          parsed.diseaseLabel = "NSGCT — advanced";
          pushDiseaseIds(parsed.diseaseSettingIds, ["nsgct_good_risk_advanced", "nsgct_intermediate_poor_risk_advanced", "gct_advanced_general"]);
        }
      } else {
        parsed.diseaseLabel = "Advanced GCT";
        pushDiseaseIds(parsed.diseaseSettingIds, ["gct_advanced_general"]);
      }
    } else {
      parsed.diseaseGroup = "gct";
      parsed.diseaseLabel = "Testicular / germ-cell tumor";
    }

    finalizeDiseaseSettingIds(parsed);

    if (parsed.diseaseLabel) addChip(parsed.chips, "Disease", parsed.diseaseLabel);
    if (parsed.clinicalAxes.histology) addChip(parsed.chips, "Disease", parsed.clinicalAxes.histology === "pure_seminoma" ? "Seminoma" : parsed.clinicalAxes.histology === "nsgct" ? "NSGCT" : "Mixed GCT");
    if (parsed.clinicalAxes.igcccgRisk) addChip(parsed.chips, "Risk", `IGCCCG ${parsed.clinicalAxes.igcccgRisk}`);
    if (parsed.clinicalAxes.primarySite && parsed.clinicalAxes.primarySite !== "testicular") addChip(parsed.chips, "Disease", `${parsed.clinicalAxes.primarySite} primary`);
    if (parsed.clinicalAxes.priorChemoLines === "0") addChip(parsed.chips, "Treatment", "Chemo-naive");
    if (parsed.clinicalAxes.priorChemoLines === "1") addChip(parsed.chips, "Treatment", "One prior line");
    if (parsed.clinicalAxes.priorChemoLines === "2+") addChip(parsed.chips, "Treatment", "Multiple prior lines");
    if (parsed.clinicalAxes.priorHdct === "yes") addChip(parsed.chips, "Treatment", "Prior HDCT");
    if (parsed.clinicalAxes.markerStatus === "markers_normal") addChip(parsed.chips, "Biomarker", "Markers normal");
    if (parsed.clinicalAxes.markerStatus === "markers_elevated") addChip(parsed.chips, "Biomarker", "Markers elevated");
  }

  function populateTemporalFacts(parsed, text) {
    parsed.temporalFacts.sinceLastSystemicTherapyDays = detectSinceLastSystemicTherapyDays(text);
    parsed.temporalFacts.sinceLastRadiationDays = detectSinceLastRadiationDays(text);
    parsed.temporalFacts.sinceLastSurgeryDays = detectSinceLastSurgeryDays(text);
    parsed.temporalFacts.recentImagingDays = detectRecentImagingDays(text);
    parsed.temporalFacts.progressedAfterTherapies = detectProgressedAfterTherapies(text);
    parsed.temporalFacts.persistentMarkersAfterOrchiectomy = detectPersistentMarkersAfterOrchiectomy(text);
  }

  function addTemporalChips(parsed) {
    const temporal = parsed.temporalFacts || {};

    (temporal.progressedAfterTherapies || []).forEach(therapy => {
      addChip(parsed.chips, "Temporal", `Progressed after ${therapy}`);
    });
    if (Number.isFinite(temporal.sinceLastSystemicTherapyDays)) {
      addChip(parsed.chips, "Temporal", `Last systemic therapy ${temporal.sinceLastSystemicTherapyDays}d ago`);
    }
    if (Number.isFinite(temporal.sinceLastRadiationDays)) {
      addChip(parsed.chips, "Temporal", `Last radiation ${temporal.sinceLastRadiationDays}d ago`);
    }
    if (Number.isFinite(temporal.sinceLastSurgeryDays)) {
      addChip(parsed.chips, "Temporal", `Last surgery ${temporal.sinceLastSurgeryDays}d ago`);
    }
    if (Number.isFinite(temporal.recentImagingDays)) {
      addChip(parsed.chips, "Temporal", `Imaging ${temporal.recentImagingDays}d ago`);
    }
    if (temporal.persistentMarkersAfterOrchiectomy === "yes") {
      addChip(parsed.chips, "Temporal", "Persistent markers after orchiectomy");
    }
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
      clinicalAxes: createClinicalAxes(),
      temporalFacts: createTemporalFacts(),
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
    if (!parsed.cancerType) {
      parsed.unsupportedReason = "Patient search currently supports prostate, bladder, kidney, and testicular queries. Include the cancer type or a disease-specific term.";
      return parsed;
    }

    parsed.supported = true;
    parsed.treatmentPreferences = detectTreatmentPreferences(rawQuery);
    parsed.phasePreference = detectPhasePreference(rawQuery);
    parsed.locationPreferences = detectLocationTerms(rawQuery);

    if (parsed.cancerType === "Prostate") {
      parseProstate(parsed, rawQuery);
    } else if (parsed.cancerType === "Bladder") {
      parseBladder(parsed, rawQuery);
    } else if (parsed.cancerType === "Kidney") {
      parseKidney(parsed, rawQuery);
    } else if (parsed.cancerType === "Testicular") {
      parseTesticular(parsed, rawQuery);
    }

    populateTemporalFacts(parsed, rawQuery);
    addChip(parsed.chips, "Cancer", parsed.cancerType);
    if (parsed.phasePreference) addChip(parsed.chips, "Preference", parsed.phasePreference);
    parsed.treatmentPreferences.forEach(pref => addChip(parsed.chips, "Preference", pref.replace(/_/g, " ")));
    parsed.locationPreferences.forEach(location => addChip(parsed.chips, "Location", location));
    parsed.notes.forEach(note => addChip(parsed.chips, "Note", note));
    addTemporalChips(parsed);

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
