#!/usr/bin/env node

const assert = require('node:assert/strict');
const path = require('node:path');

const PatientQueryParser = require(path.resolve(__dirname, '../../js/patient-query-parser.js'));
const PatientTrialMatcher = require(path.resolve(__dirname, '../../js/patient-trial-matcher.js'));

function buildTrial(overrides = {}) {
  return {
    id: 'trial',
    title: 'Synthetic Prostate Trial',
    description: 'Synthetic prostate trial for smoke testing.',
    cancerType: 'Prostate',
    phase: 'Phase II',
    classificationConfidence: 'HIGH',
    siteCount: 1,
    diseaseSettingPrimaryId: '',
    diseaseSettingAllIds: [],
    diseaseSettingAll: [],
    clinicalAxes: {},
    sourceTags: {},
    conditions: ['prostate cancer'],
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

function main() {
  const radioligandTrial = buildTrial({
    id: 'radioligand',
    title: '177Lu-PSMA Radioligand Study',
    description: 'PSMA radioligand treatment for metastatic castration-resistant prostate cancer.',
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
    interventions: ['177Lu-PSMA-617']
  });

  const parpTrial = buildTrial({
    id: 'parp',
    title: 'PARP Trial for BRCA/HRR Positive mCRPC',
    description: 'Olaparib-based treatment for biomarker-selected metastatic castration-resistant prostate cancer.',
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
    interventions: ['olaparib']
  });

  const classifierTrial = buildTrial({
    id: 'classifier',
    title: 'Genomic Classifier Guided Radiation Intensification',
    description: 'Localized unfavorable intermediate-risk prostate cancer trial using Decipher-style selection.',
    phase: 'Phase III',
    diseaseSettingPrimaryId: 'localized_unfavorable_ir',
    diseaseSettingAllIds: ['localized_unfavorable_ir', 'localized_general'],
    clinicalAxes: {
      metastaticStatus: 'localized',
      genomicClassifier: 'classifier_required'
    }
  });

  const tripletTrial = buildTrial({
    id: 'triplet',
    title: 'Triplet Intensification in High-Volume mCSPC',
    description: 'Triplet therapy in metastatic castration-sensitive prostate cancer.',
    phase: 'Phase III',
    diseaseSettingPrimaryId: 'cspc_high_volume',
    diseaseSettingAllIds: ['cspc_high_volume', 'cspc_general'],
    clinicalAxes: {
      castrationStatus: 'castration_sensitive',
      metastaticStatus: 'metastatic',
      diseaseVolume: 'high_volume',
      priorDocetaxel: 'no'
    },
    interventions: ['docetaxel', 'darolutamide']
  });

  const trials = [radioligandTrial, parpTrial, classifierTrial, tripletTrial];

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

  console.log('Patient matching smoke tests passed.');
}

main();
