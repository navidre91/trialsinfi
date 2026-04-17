#!/usr/bin/env node

const assert = require('node:assert/strict');
const path = require('node:path');

const PatientQueryParser = require(path.resolve(__dirname, '../../js/patient-query-parser.js'));
const PatientTrialMatcher = require(path.resolve(__dirname, '../../js/patient-trial-matcher.js'));

function buildTrial(overrides = {}) {
  return {
    id: 'trial',
    title: 'Synthetic Trial',
    description: 'Synthetic trial for smoke testing.',
    cancerType: 'Prostate',
    phase: 'Phase II',
    classificationConfidence: 'HIGH',
    siteCount: 1,
    diseaseSettingPrimaryId: '',
    diseaseSettingAllIds: [],
    diseaseSettingAll: [],
    clinicalAxes: {},
    sourceTags: {},
    conditions: [],
    interventions: [],
    ...overrides
  };
}

function findEntry(result, trialId) {
  return [
    ...(result.strongMatches || []),
    ...(result.possibleMatches || [])
  ].find(entry => entry.trial.id === trialId);
}

function flagCodes(entry) {
  return (entry?.match?.flags || []).map(flag => flag.code).sort();
}

function runQuery(trials, query) {
  const parsedQuery = PatientQueryParser.parse(query);
  assert.equal(parsedQuery.supported, true, `Expected supported query: ${query}`);
  return PatientTrialMatcher.matchTrials({ trials, parsedQuery });
}

function buildProstateTrials() {
  const radioligandTrial = buildTrial({
    id: 'radioligand',
    title: '177Lu-PSMA Radioligand Study',
    description: 'PSMA radioligand treatment for metastatic castration-resistant prostate cancer.',
    cancerType: 'Prostate',
    diseaseSettingPrimaryId: 'crpc_metastatic_postARPI',
    diseaseSettingAllIds: ['crpc_metastatic_postARPI', 'crpc_general'],
    clinicalAxes: {
      castrationStatus: 'castration_resistant',
      metastaticStatus: 'metastatic',
      priorArpi: 'yes',
      priorDocetaxel: 'no',
      biomarkerHrr: 'not_required',
      psmaStatus: 'required'
    },
    conditions: ['prostate cancer'],
    interventions: ['177Lu-PSMA-617']
  });

  const parpTrial = buildTrial({
    id: 'parp',
    title: 'PARP Trial for BRCA/HRR Positive mCRPC',
    description: 'Olaparib-based treatment for biomarker-selected metastatic castration-resistant prostate cancer.',
    cancerType: 'Prostate',
    diseaseSettingPrimaryId: 'crpc_metastatic_postARPI',
    diseaseSettingAllIds: ['crpc_metastatic_postARPI', 'crpc_general'],
    clinicalAxes: {
      castrationStatus: 'castration_resistant',
      metastaticStatus: 'metastatic',
      priorArpi: 'yes',
      priorDocetaxel: 'no',
      biomarkerHrr: 'positive',
      psmaStatus: 'not_required'
    },
    conditions: ['prostate cancer'],
    interventions: ['olaparib']
  });

  const classifierTrial = buildTrial({
    id: 'classifier',
    title: 'Genomic Classifier Guided Radiation Intensification',
    description: 'Localized unfavorable intermediate-risk prostate cancer trial using Decipher-style selection.',
    cancerType: 'Prostate',
    phase: 'Phase III',
    diseaseSettingPrimaryId: 'localized_unfavorable_ir',
    diseaseSettingAllIds: ['localized_unfavorable_ir', 'localized_general'],
    clinicalAxes: {
      metastaticStatus: 'localized',
      genomicClassifier: 'classifier_required'
    },
    conditions: ['prostate cancer']
  });

  const tripletTrial = buildTrial({
    id: 'triplet',
    title: 'Triplet Intensification in High-Volume mCSPC',
    description: 'Triplet therapy in metastatic castration-sensitive prostate cancer.',
    cancerType: 'Prostate',
    phase: 'Phase III',
    diseaseSettingPrimaryId: 'cspc_high_volume',
    diseaseSettingAllIds: ['cspc_high_volume', 'cspc_general'],
    clinicalAxes: {
      castrationStatus: 'castration_sensitive',
      metastaticStatus: 'metastatic',
      diseaseVolume: 'high_volume',
      priorDocetaxel: 'no'
    },
    conditions: ['prostate cancer'],
    interventions: ['docetaxel', 'darolutamide']
  });

  return [radioligandTrial, parpTrial, classifierTrial, tripletTrial];
}

function buildBladderTrials() {
  const nmibcTrial = buildTrial({
    id: 'nmibc-bcg',
    title: 'BCG-Unresponsive NMIBC Study',
    description: 'Intravesical therapy for BCG-unresponsive NMIBC with CIS.',
    cancerType: 'Bladder',
    diseaseSettingPrimaryId: 'nmibc_bcg_unresponsive',
    diseaseSettingAllIds: ['nmibc_bcg_unresponsive', 'nmibc_general'],
    clinicalAxes: {
      bcgStatus: 'BCG-Unresponsive'
    },
    conditions: ['bladder cancer'],
    interventions: ['intravesical therapy']
  });

  const metastatic1LTrial = buildTrial({
    id: 'muc-1l-cis-ineligible',
    title: 'First-Line Cisplatin-Ineligible mUC Trial',
    description: 'Systemic treatment for first-line cisplatin-ineligible metastatic urothelial carcinoma.',
    cancerType: 'Bladder',
    diseaseSettingPrimaryId: 'metastatic_1l_cisplatin_ineligible',
    diseaseSettingAllIds: ['metastatic_1l_cisplatin_ineligible', 'metastatic_1l_general', 'metastatic_general'],
    clinicalAxes: {
      cisplatinStatus: 'Cisplatin-Ineligible'
    },
    conditions: ['urothelial carcinoma']
  });

  const metastatic2LTrial = buildTrial({
    id: 'muc-2l',
    title: 'Post-Platinum mUC Trial',
    description: 'Second-line treatment for metastatic urothelial carcinoma after platinum.',
    cancerType: 'Bladder',
    diseaseSettingPrimaryId: 'metastatic_2l_plus',
    diseaseSettingAllIds: ['metastatic_2l_plus', 'metastatic_general'],
    clinicalAxes: {},
    conditions: ['urothelial carcinoma']
  });

  return [nmibcTrial, metastatic1LTrial, metastatic2LTrial];
}

function buildKidneyTrials() {
  const ccRccTrial = buildTrial({
    id: 'ccrcc-1l',
    title: 'Intermediate/Poor Risk mccRCC Trial',
    description: 'First-line immunotherapy combination for metastatic clear-cell RCC.',
    cancerType: 'Kidney',
    diseaseSettingPrimaryId: 'metastatic_ccrcc_int_poor_1l',
    diseaseSettingAllIds: ['metastatic_ccrcc_int_poor_1l', 'metastatic_ccrcc_1l_all_risk', 'metastatic_ccrcc_general'],
    clinicalAxes: {
      histology: 'clear_cell',
      imdcRisk: 'intermediate_poor',
      priorSystemicLines: '0',
      priorIo: 'no',
      priorVegfTki: 'no',
      nephrectomyStatus: 'prior_nephrectomy',
      sarcomatoid: 'yes'
    },
    conditions: ['renal cell carcinoma']
  });

  const papillaryTrial = buildTrial({
    id: 'papillary-met',
    title: 'MET-Directed Papillary RCC Trial',
    description: 'Targeted therapy for metastatic papillary RCC with MET alteration.',
    cancerType: 'Kidney',
    diseaseSettingPrimaryId: 'metastatic_ncrcc_papillary',
    diseaseSettingAllIds: ['metastatic_ncrcc_papillary', 'metastatic_ncrcc_general'],
    clinicalAxes: {
      histology: 'papillary_type2',
      priorSystemicLines: '0',
      metAlteration: 'met_mutation'
    },
    conditions: ['papillary renal cell carcinoma']
  });

  return [ccRccTrial, papillaryTrial];
}

function buildTesticularTrials() {
  const seminomaTrial = buildTrial({
    id: 'seminoma-stage1',
    title: 'Seminoma Stage I Surveillance Trial',
    description: 'Management study for stage I seminoma after orchiectomy.',
    cancerType: 'Testicular',
    diseaseSettingPrimaryId: 'seminoma_stage1',
    diseaseSettingAllIds: ['seminoma_stage1', 'gct_stage1_general'],
    clinicalAxes: {
      histology: 'pure_seminoma',
      clinicalStage: 'stage_1_unspecified',
      markerStatus: 'markers_normal'
    },
    conditions: ['testicular seminoma']
  });

  const recurrentTrial = buildTrial({
    id: 'nsgct-2l',
    title: 'Relapsed NSGCT Salvage Trial',
    description: 'Second-line salvage treatment for relapsed NSGCT.',
    cancerType: 'Testicular',
    diseaseSettingPrimaryId: 'nsgct_recurrent_2l',
    diseaseSettingAllIds: ['nsgct_recurrent_2l', 'gct_advanced_general'],
    clinicalAxes: {
      histology: 'nsgct',
      priorChemoLines: '1',
      priorHdct: 'no'
    },
    conditions: ['nonseminomatous germ cell tumor']
  });

  return [seminomaTrial, recurrentTrial];
}

function testProstate() {
  const trials = buildProstateTrials();

  let result = runQuery(
    trials,
    'Male, 65. mCRPC. Progressed on enzalutamide. BRCA2+. PSMA-positive PET. No prior docetaxel.'
  );
  assert.deepEqual(
    result.strongMatches.map(entry => entry.trial.id).sort(),
    ['parp', 'radioligand'],
    'Full biomarker-complete mCRPC query should strongly match radioligand and PARP trials.'
  );

  result = runQuery(
    trials,
    'Male, 65. mCRPC. Progressed on enzalutamide. PSMA-positive PET. No prior docetaxel.'
  );
  assert.equal(findEntry(result, 'radioligand').match.badge, 'Strong match');
  assert.equal(findEntry(result, 'parp').match.badge, 'Possible match');
  assert.deepEqual(flagCodes(findEntry(result, 'parp')), ['brca_hrr']);

  result = runQuery(
    trials,
    'Male, 65. mCRPC. Progressed on enzalutamide. BRCA2+. No prior docetaxel.'
  );
  assert.equal(findEntry(result, 'parp').match.badge, 'Strong match');
  assert.equal(findEntry(result, 'radioligand').match.badge, 'Possible match');
  assert.deepEqual(flagCodes(findEntry(result, 'radioligand')), ['psma_status']);

  result = runQuery(
    trials,
    'Man with unfavorable intermediate-risk localized prostate cancer considering radiation. Phase III only.'
  );
  assert.equal(findEntry(result, 'classifier').match.badge, 'Possible match');
  assert.deepEqual(flagCodes(findEntry(result, 'classifier')), ['genomic_classifier']);

  result = runQuery(
    trials,
    'Male with mCSPC high-volume prostate cancer. No prior docetaxel.'
  );
  assert.equal(findEntry(result, 'triplet').match.badge, 'Possible match');
  assert.deepEqual(flagCodes(findEntry(result, 'triplet')), ['adt_history']);

  result = runQuery(
    trials,
    'Male, 65. mCRPC.'
  );
  assert.ok(result.possibleMatches.length >= 2, 'Broad mCRPC query should still surface possible matches.');
}

function testBladder() {
  const trials = buildBladderTrials();

  let result = runQuery(
    trials,
    'Bladder cancer, BCG-unresponsive NMIBC with CIS after adequate BCG.'
  );
  assert.equal(findEntry(result, 'nmibc-bcg').match.badge, 'Strong match');

  result = runQuery(
    trials,
    'Metastatic urothelial carcinoma, first-line.'
  );
  assert.equal(findEntry(result, 'muc-1l-cis-ineligible').match.badge, 'Possible match');
  assert.deepEqual(flagCodes(findEntry(result, 'muc-1l-cis-ineligible')), ['cisplatin_eligibility']);

  result = runQuery(
    trials,
    'Metastatic urothelial carcinoma, cisplatin-ineligible, first-line.'
  );
  assert.equal(findEntry(result, 'muc-1l-cis-ineligible').match.badge, 'Strong match');
  assert.equal(findEntry(result, 'muc-2l'), undefined, 'First-line metastatic query should exclude 2L bladder trials.');
}

function testKidney() {
  const trials = buildKidneyTrials();

  let result = runQuery(
    trials,
    'Metastatic clear-cell RCC, IMDC intermediate risk, treatment-naive, no prior IO, no prior VEGF-TKI, prior nephrectomy, sarcomatoid.'
  );
  assert.equal(findEntry(result, 'ccrcc-1l').match.badge, 'Strong match');
  assert.equal(findEntry(result, 'papillary-met'), undefined);

  result = runQuery(
    trials,
    'Metastatic clear-cell RCC, treatment-naive, no prior IO, no prior VEGF-TKI, prior nephrectomy, sarcomatoid.'
  );
  assert.equal(findEntry(result, 'ccrcc-1l').match.badge, 'Possible match');
  assert.deepEqual(flagCodes(findEntry(result, 'ccrcc-1l')), ['imdc_risk']);

  result = runQuery(
    trials,
    'Metastatic papillary RCC, MET mutation, treatment-naive.'
  );
  assert.equal(findEntry(result, 'papillary-met').match.badge, 'Strong match');
}

function testTesticular() {
  const trials = buildTesticularTrials();

  let result = runQuery(
    trials,
    'Seminoma stage I after orchiectomy, no prior chemotherapy, markers normal.'
  );
  assert.equal(findEntry(result, 'seminoma-stage1').match.badge, 'Strong match');

  result = runQuery(
    trials,
    'Seminoma stage I after orchiectomy, no prior chemotherapy.'
  );
  assert.equal(findEntry(result, 'seminoma-stage1').match.badge, 'Possible match');
  assert.deepEqual(flagCodes(findEntry(result, 'seminoma-stage1')), ['marker_status']);

  result = runQuery(
    trials,
    'Relapsed NSGCT after first-line BEP, no prior HDCT.'
  );
  assert.equal(findEntry(result, 'nsgct-2l').match.badge, 'Strong match');

  result = runQuery(
    trials,
    'Relapsed NSGCT after first-line BEP.'
  );
  assert.equal(findEntry(result, 'nsgct-2l').match.badge, 'Possible match');
  assert.deepEqual(flagCodes(findEntry(result, 'nsgct-2l')), ['hdct_history']);
}

function main() {
  testProstate();
  testBladder();
  testKidney();
  testTesticular();
  console.log('Patient matching smoke tests passed.');
}

main();
