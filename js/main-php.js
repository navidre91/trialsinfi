/**
 * Main application script for Clinical Trials website - PHP Version
 */
class ClinicalTrialsApp {
  constructor() {
    this.trialManager = new TrialManager();
    this.searchFilter = null;
    this.currentPage = 'index';
    this.isLoading = false;
    this.activeView = 'browse';
    this.patientSearchState = {
      active: false,
      rawQuery: '',
      parsedQuery: null,
      matches: null
    };
  }

  /**
   * Initialize the application
   */
  async init() {
    this.showLoadingState();
    
    try {
      // Load trials data from PHP API (no localStorage fallback in PHP version)
      await this.trialManager.loadTrials();

      // Initialize search and filter functionality
      this.searchFilter = new SearchFilter(this.trialManager);
      this.searchFilter.init();
      this.activeView = this.getInitialView();

      // Make app instance available globally before additional UI bindings
      window.currentPage = this;

      // Populate filter dropdowns with data
      this.searchFilter.populateLocationFilter();

      // Setup patient-search workflow on top of the loaded catalog
      this.setupPatientSearch();
      this.setupViewTabs();
      this.updateViewUI({ updateUrl: false });
      this.updateCatalogMeta();

      this.restorePatientSearch();

      // Apply initial filters (from URL if any) when patient search is not active
      if (this.activeView !== 'patient-search') {
        this.searchFilter.applyFilters();
      }

      // Display trials
      this.updateTrialsDisplay();
      
      // Set up pagination
      this.setupPagination();
      
    } catch (error) {
      console.error('Error initializing app:', error);
      this.showErrorState('Failed to load clinical trials. Please refresh the page.');
    }
  }

  /**
   * Show loading state in trials container
   */
  showLoadingState() {
    const trialsContainer = document.getElementById('trialsContainer');
    if (trialsContainer) {
      Utils.showLoading(trialsContainer);
    }
    this.isLoading = true;
  }

  /**
   * Show error state in trials container
   */
  showErrorState(message) {
    const trialsContainer = document.getElementById('trialsContainer');
    if (trialsContainer) {
      Utils.showError(trialsContainer, message);
    }
    this.isLoading = false;
  }

  /**
   * Update the trials display with current filtered results
   */
  updateTrialsDisplay() {
    const trialsContainer = document.getElementById('trialsContainer');
    const noResults = document.getElementById('noResults');
    
    if (!trialsContainer) return;

    if (this.activeView === 'patient-search') {
      this.renderPatientSearchView(trialsContainer, noResults);
      this.updateResultsCount();
      this.updatePagination();
      this.isLoading = false;
      return;
    }

    const currentTrials = this.trialManager.getCurrentPageTrials();
    const totalTrials = this.trialManager.getFilteredTrials().length;
    
    // Update results count
    this.updateResultsCount();
    
    if (currentTrials.length === 0) {
      // Show no results state
      trialsContainer.style.display = 'none';
      if (noResults) {
        noResults.style.display = 'block';
      }
    } else {
      // Show trials
      trialsContainer.style.display = 'grid';
      if (noResults) {
        noResults.style.display = 'none';
      }
      
      // Clear existing content
      Utils.clearElement(trialsContainer);
      
      // Create trial cards
      currentTrials.forEach(trial => {
        const trialCard = this.createTrialCard(trial);
        trialsContainer.appendChild(trialCard);
      });
    }
    
    // Update pagination
    this.updatePagination();
    this.isLoading = false;
  }

  /**
   * Create a trial card element
   * @param {Object} trial - Trial data
   * @returns {HTMLElement} Trial card element
   */
  createTrialCard(trial, matchContext = null) {
    const statusConfig = Utils.getStatusConfig(trial.status);
    const institutions = Utils.getTrialInstitutions(trial);
    const primaryInstitution = institutions[0] || trial.location?.hospital || 'Not specified';
    const siteCount = Number(trial.siteCount || institutions.length || 0);
    const institutionLabel = siteCount > 1
      ? `${primaryInstitution} + ${siteCount - 1} more`
      : primaryInstitution;
    const piName = Utils.getPrimaryPiName(trial) || 'Not specified';
    const websiteUpdate = Utils.getDisplayWebsiteUpdate(trial);
    const contactEmail = Utils.getPrimaryContactEmail(trial);
    const diseaseSetting = Utils.getDiseaseSettingLabel(trial) || 'Not specified';
    const treatmentModality = trial.treatmentModality || 'Not specified';
    const classificationConfidence = trial.classificationConfidence || 'Not specified';
    const phaseLabel = Utils.getDisplayPhase(trial);
    const cancerTypes = Utils.getDisplayCancerTypes(trial);
    const detailUrl = this.buildDetailUrl(trial.id, Boolean(matchContext));
    const sourceTags = matchContext ? (matchContext.sourceTagSummary || []) : [];
    const cardToneClass = matchContext
      ? (matchContext.badgeTone === 'strong' ? 'trial-card--match-strong trial-card--patient-search' : 'trial-card--match-possible trial-card--patient-search')
      : `trial-card--${statusConfig.className}`;
    const siteChipLabel = `${siteCount || 1} ${siteCount === 1 ? 'site' : 'sites'}`;
    const badgeHTML = matchContext
      ? `<span class="trial-match-pill trial-match-pill--${matchContext.badgeTone === 'strong' ? 'strong' : 'possible'}">${Utils.sanitizeHTML(matchContext.badge)}</span>`
      : '';
    const reasonHTML = matchContext?.reasonText
      ? `
        <section class="trial-match-reason trial-match-reason--${matchContext.badgeTone === 'strong' ? 'strong' : 'possible'}">
          <span class="trial-match-reason-label">Why it matched</span>
          <p>${Utils.sanitizeHTML(matchContext.reasonText)}</p>
        </section>
      `
      : '';
    const flagsHTML = matchContext?.flags?.length
      ? `
        <div class="trial-flag-list">
          ${matchContext.flags.map(flag => `
            <div class="trial-flag-card">
              <div class="trial-flag-title">${Utils.sanitizeHTML(flag.title)}</div>
              <div class="trial-flag-message">${Utils.sanitizeHTML(flag.message)}</div>
            </div>
          `).join('')}
        </div>
      `
      : '';
    const sourceTagsHTML = sourceTags.length > 0
      ? `
        <div class="trial-source-tags">
          ${sourceTags.map(tag => `
            <span class="trial-source-tag">${Utils.sanitizeHTML(tag)}</span>
          `).join('')}
        </div>
      `
      : '';
    const icon = (name) => {
      const icons = {
        sites: '<svg class="trial-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="11" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
        disease: '<svg class="trial-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h16M4 14.5h10M8 4v16M16 4v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        pi: '<svg class="trial-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 19.5c1.5-3.1 4-4.7 6.5-4.7s5 1.6 6.5 4.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
        treatment: '<svg class="trial-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6M10 4v5l-4.8 8.1A3 3 0 0 0 7.8 21h8.4a3 3 0 0 0 2.6-3.9L14 9V4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.8 15h6.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
      };
      return icons[name] || '';
    };
    const detailItems = [
      {
        key: 'sites',
        label: 'Sites',
        value: institutionLabel,
        subvalue: cancerTypes,
        icon: icon('sites')
      },
      {
        key: 'disease',
        label: 'Disease setting',
        value: diseaseSetting,
        subvalue: '',
        icon: icon('disease')
      },
      {
        key: 'pi',
        label: 'Lead PI',
        value: piName,
        subvalue: '',
        icon: icon('pi')
      },
      {
        key: 'treatment',
        label: 'Treatment',
        value: treatmentModality,
        subvalue: classificationConfidence,
        icon: icon('treatment')
      }
    ];
    const detailGridHTML = detailItems.map(item => `
      <div class="trial-detail-card trial-detail-card--${item.key}">
        <div class="trial-detail-icon">${item.icon}</div>
        <div class="trial-detail-content">
          <span class="trial-detail-label">${Utils.sanitizeHTML(item.label)}</span>
          <div class="trial-detail-value">${Utils.sanitizeHTML(item.value)}</div>
          ${item.subvalue ? `<div class="trial-detail-subvalue">${Utils.sanitizeHTML(item.subvalue)}</div>` : ''}
        </div>
      </div>
    `).join('');
    const extrasHTML = (reasonHTML || flagsHTML || sourceTagsHTML)
      ? `
        <div class="trial-card-extras">
          ${reasonHTML}
          ${flagsHTML}
          ${sourceTagsHTML}
        </div>
      `
      : '';
    
    const cardHTML = `
      <div class="trial-card ${cardToneClass}" data-trial-id="${trial.id}" onclick="window.clinicalTrialsApp.viewTrialDetail('${trial.id}', ${matchContext ? 'true' : 'false'})">
        <div class="trial-card-topline">
          <div class="trial-card-chips">
            <span class="trial-meta-chip">${Utils.sanitizeHTML(phaseLabel)}</span>
            <span class="trial-meta-chip">${Utils.sanitizeHTML(siteChipLabel)}</span>
          </div>
          <div class="trial-card-topline-right">
            ${badgeHTML}
            <span class="trial-status ${statusConfig.className}">${statusConfig.label}</span>
          </div>
        </div>

        <div class="trial-card-header">
          <div class="trial-title-wrap">
            <h3 class="trial-title">${Utils.sanitizeHTML(trial.title)}</h3>
            <p class="trial-description">
              ${Utils.sanitizeHTML(Utils.truncateText(trial.description, 150))}
            </p>
          </div>
        </div>
        
        <div class="trial-details">
          ${detailGridHTML}
        </div>

        ${extrasHTML}
        
        <div class="trial-card-footer">
          <div class="trial-dates">
            <span class="trial-date-item">
              <span class="trial-date-label">Synced</span>
              <span class="trial-date-value">${Utils.sanitizeHTML(Utils.formatDate(websiteUpdate))}</span>
            </span>
          </div>
          <div class="trial-card-actions">
            ${contactEmail ? `<a href="mailto:${Utils.sanitizeHTML(contactEmail)}" class="trial-view-btn trial-view-btn--ghost" onclick="event.stopPropagation();">Email PI</a>` : ''}
            ${trial.ctGovUrl ? `<a href="${Utils.sanitizeHTML(trial.ctGovUrl)}" target="_blank" rel="noopener noreferrer" class="trial-view-btn trial-view-btn--ghost" onclick="event.stopPropagation();">CT.gov</a>` : ''}
            <a href="${detailUrl}" class="trial-view-btn" onclick="event.stopPropagation();">
              View Details
            </a>
          </div>
        </div>
      </div>
    `;
    
    return Utils.createElementFromHTML(cardHTML);
  }

  /**
   * View trial detail (for card click)
   * @param {string} trialId - Trial ID
   */
  viewTrialDetail(trialId, fromPatientSearch = false) {
    window.location.href = this.buildDetailUrl(trialId, fromPatientSearch);
  }

  buildDetailUrl(trialId, fromPatientSearch = false) {
    const params = new URLSearchParams({ id: trialId });
    if (fromPatientSearch) {
      params.set('patientSearch', '1');
    }
    return `trial-detail-php.html?${params.toString()}`;
  }

  getInitialView() {
    const url = new URL(window.location.href);
    return url.searchParams.get('view') === 'patient-search' ? 'patient-search' : 'browse';
  }

  setupViewTabs() {
    const tabLinks = document.querySelectorAll('[data-app-view-target]');
    if (!tabLinks.length) {
      return;
    }

    tabLinks.forEach(link => {
      link.addEventListener('click', (event) => {
        const view = link.getAttribute('data-app-view-target');
        if (!view) {
          return;
        }
        event.preventDefault();
        this.setActiveView(view);
      });
    });
  }

  setActiveView(view, options = {}) {
    const normalizedView = view === 'patient-search' ? 'patient-search' : 'browse';
    const viewChanged = this.activeView !== normalizedView;
    this.activeView = normalizedView;
    this.updateViewUI({ updateUrl: options.updateUrl !== false });
    this.updateCatalogMeta();

    if (this.activeView === 'browse' && this.searchFilter) {
      this.searchFilter.applyFilters();
    } else {
      this.updateTrialsDisplay();
    }

    if (options.scroll === false) {
      return;
    }

    const scrollTarget = this.activeView === 'patient-search' ? '#patientSearchPanel' : '#browseSearchSection';
    Utils.scrollToElement(scrollTarget);

    if (!viewChanged) {
      return;
    }

    const focusTarget = this.activeView === 'patient-search'
      ? document.getElementById('patientQueryInput')
      : document.getElementById('searchInput');
    focusTarget?.focus();
  }

  updateViewUI(options = {}) {
    const updateUrl = options.updateUrl !== false;
    const isPatientView = this.activeView === 'patient-search';
    this.syncViewTabs();
    this.setCatalogLayoutForPatientSearch(isPatientView);
    if (updateUrl) {
      this.updateViewUrl();
    }
  }

  syncViewTabs() {
    const tabLinks = document.querySelectorAll('[data-app-view-target]');
    tabLinks.forEach(link => {
      const targetView = link.getAttribute('data-app-view-target');
      const isActive = targetView === this.activeView;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  updateViewUrl() {
    const url = new URL(window.location.href);
    if (this.activeView === 'patient-search') {
      url.searchParams.set('view', 'patient-search');
    } else {
      url.searchParams.delete('view');
    }
    window.history.replaceState(null, '', url);
  }

  setupPatientSearch() {
    const input = document.getElementById('patientQueryInput');
    const runButton = document.getElementById('runPatientSearch');
    const clearButton = document.getElementById('clearPatientSearch');

    if (!input || !runButton || !clearButton) {
      return;
    }

    runButton.addEventListener('click', () => {
      this.runPatientSearch(input.value);
    });

    clearButton.addEventListener('click', () => {
      this.clearPatientSearch();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.runPatientSearch(input.value);
      }
    });
  }

  restorePatientSearch() {
    const input = document.getElementById('patientQueryInput');
    const storedQuery = window.localStorage.getItem('cts_patient_query');
    if (!input || !storedQuery) {
      return false;
    }

    input.value = storedQuery;
    return this.runPatientSearch(storedQuery, {
      persist: false,
      silentUnsupported: true,
      activateView: this.activeView === 'patient-search'
    });
  }

  runPatientSearch(rawQuery, options = {}) {
    const query = (rawQuery || '').toString().trim();
    const status = document.getElementById('patientSearchStatus');
    const noResultsText = document.querySelector('#noResults p');

    if (!query) {
      this.clearPatientSearch();
      if (status) {
        status.textContent = 'Enter a patient description to run protocol-style matching.';
      }
      return false;
    }

    if (!window.PatientQueryParser || !window.PatientTrialMatcher) {
      this.patientSearchState = {
        active: false,
        rawQuery: query,
        parsedQuery: null,
        matches: null
      };
      this.updateViewUI({ updateUrl: false });
      this.updateCatalogMeta();
      this.updateTrialsDisplay();
      if (status) {
        status.textContent = 'Patient search scripts did not load. Hard refresh the page or re-deploy the updated js files.';
      }
      if (options.persist !== false) {
        window.localStorage.removeItem('cts_patient_query');
      }
      return false;
    }

    const parsedQuery = window.PatientQueryParser?.parse(query);
    if (!parsedQuery?.supported) {
      this.patientSearchState = {
        active: false,
        rawQuery: query,
        parsedQuery,
        matches: null
      };
      this.renderPatientQueryChips(parsedQuery);
      this.updateViewUI({ updateUrl: false });
      if (status && !options.silentUnsupported) {
        status.textContent = parsedQuery?.unsupportedReason || 'Patient search currently supports prostate, bladder, kidney, and testicular queries.';
      }
      if (noResultsText) {
        noResultsText.textContent = 'Try adjusting your search criteria or filters to find more results.';
      }
      if (options.persist !== false) {
        window.localStorage.removeItem('cts_patient_query');
      }
      this.updateCatalogMeta();
      if (this.activeView === 'browse') {
        this.searchFilter.applyFilters();
      } else {
        this.updateTrialsDisplay();
      }
      return false;
    }

    const matches = window.PatientTrialMatcher?.matchTrials({
      trials: this.trialManager.getAllTrials(),
      parsedQuery
    }) || {
      parsedQuery,
      strongMatches: [],
      possibleMatches: []
    };

    this.patientSearchState = {
      active: true,
      rawQuery: query,
      parsedQuery,
      matches
    };

    if (this.activeView !== 'patient-search' && options.activateView !== false) {
      this.activeView = 'patient-search';
      this.updateViewUI();
    }

    if (options.persist !== false) {
      window.localStorage.setItem('cts_patient_query', query);
    }

    if (status) {
      const cancerLabel = parsedQuery?.cancerType ? `${parsedQuery.cancerType.toLowerCase()} matching` : 'patient matching';
      status.textContent = `${cancerLabel.charAt(0).toUpperCase()}${cancerLabel.slice(1)} is active. Catalog filters are hidden until you clear the patient search.`;
    }

    this.renderPatientQueryChips(parsedQuery);
    this.updateCatalogMeta();
    this.updateTrialsDisplay();
    Utils.scrollToElement('.results-header');
    return true;
  }

  clearPatientSearch() {
    const input = document.getElementById('patientQueryInput');
    const status = document.getElementById('patientSearchStatus');
    const chips = document.getElementById('patientQueryChips');
    const noResultsText = document.querySelector('#noResults p');
    const isPatientSearchView = this.activeView === 'patient-search';

    this.patientSearchState = {
      active: false,
      rawQuery: '',
      parsedQuery: null,
      matches: null
    };

    window.localStorage.removeItem('cts_patient_query');

    if (input) {
      input.value = '';
    }
    if (status) {
      status.textContent = isPatientSearchView
        ? 'Enter a patient description to run protocol-style matching.'
        : '';
    }
    if (chips) {
      chips.innerHTML = '';
      chips.style.display = 'none';
    }
    if (noResultsText) {
      noResultsText.textContent = 'Try adjusting your search criteria or filters to find more results.';
    }

    if (isPatientSearchView) {
      this.updateViewUI({ updateUrl: false });
      this.updateCatalogMeta();
      this.updateTrialsDisplay();
      return;
    }

    this.updateCatalogMeta();
    if (this.searchFilter) {
      this.searchFilter.applyFilters();
      return;
    }

    this.updateTrialsDisplay();
  }

  renderPatientQueryChips(parsedQuery) {
    const container = document.getElementById('patientQueryChips');
    if (!container) {
      return;
    }

    container.innerHTML = '';
    const chips = Array.isArray(parsedQuery?.chips) ? parsedQuery.chips : [];
    if (chips.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';
    chips.forEach(chip => {
      const element = document.createElement('span');
      element.style.cssText = 'display:inline-flex;align-items:center;gap:0.35rem;padding:0.3rem 0.7rem;border-radius:999px;background:#ffffff;border:1px solid var(--border-color);font-size:0.8rem;color:var(--text-secondary);';
      element.innerHTML = `<strong style="color: var(--text-primary);">${Utils.sanitizeHTML(chip.group)}:</strong> <span>${Utils.sanitizeHTML(chip.label)}</span>`;
      container.appendChild(element);
    });
  }

  setCatalogLayoutForPatientSearch(active) {
    const patientPanel = document.getElementById('patientSearchPanel');
    const browseSearchSection = document.getElementById('browseSearchSection');
    const sidebar = document.querySelector('.filters-sidebar');
    const layout = document.querySelector('.content-layout');
    const sortControls = document.querySelector('.sort-controls');

    if (patientPanel) {
      patientPanel.hidden = !active;
    }
    if (browseSearchSection) {
      browseSearchSection.hidden = active;
    }
    if (sidebar) {
      sidebar.hidden = active;
    }
    if (layout) {
      layout.style.gridTemplateColumns = active ? '1fr' : '';
    }
    if (sortControls) {
      sortControls.hidden = active;
    }
  }

  renderPatientSearchView(trialsContainer, noResults) {
    if (this.patientSearchState.active) {
      this.renderPatientSearchResults(trialsContainer, noResults);
      return;
    }

    this.renderPatientSearchLandingState(trialsContainer, noResults);
  }

  renderPatientSearchLandingState(trialsContainer, noResults) {
    const noResultsTitle = document.querySelector('#noResults h3');
    const noResultsText = document.querySelector('#noResults p');

    Utils.clearElement(trialsContainer);
    this.hidePagination();
    trialsContainer.style.display = 'block';

    if (noResults) {
      noResults.style.display = 'none';
    }
    if (noResultsTitle) {
      noResultsTitle.textContent = 'No trials found';
    }
    if (noResultsText) {
      noResultsText.textContent = 'Try adjusting your search criteria or filters to find more results.';
    }

    const emptyState = Utils.createElementFromHTML(`
      <section class="patient-search-empty">
        <h3>Patient search is separate from the catalog now</h3>
        <p>Describe a prostate, bladder, kidney, or testicular patient in plain language to generate protocol-style strong and possible matches. The browse tab still shows the full trial catalog with normal filters.</p>
        <div class="patient-search-empty-note">Deterministic multi-cancer matching</div>
      </section>
    `);
    trialsContainer.appendChild(emptyState);
  }

  renderPatientSearchResults(trialsContainer, noResults) {
    const matches = this.patientSearchState.matches || { strongMatches: [], possibleMatches: [] };
    const strongMatches = matches.strongMatches || [];
    const possibleMatches = matches.possibleMatches || [];
    const totalMatches = strongMatches.length + possibleMatches.length;
    const noResultsTitle = document.querySelector('#noResults h3');
    const noResultsText = document.querySelector('#noResults p');

    Utils.clearElement(trialsContainer);
    this.hidePagination();

    if (totalMatches === 0) {
      trialsContainer.style.display = 'none';
      if (noResults) {
        noResults.style.display = 'block';
      }
      if (noResultsTitle) {
        noResultsTitle.textContent = 'No patient-matched trials found';
      }
      if (noResultsText) {
        noResultsText.textContent = 'Try adding disease setting, prior treatment history, histology, biomarkers, or risk-group details. Incomplete queries should still return possible matches with verification flags.';
      }
      return;
    }

    trialsContainer.style.display = 'block';
    if (noResults) {
      noResults.style.display = 'none';
    }
    if (noResultsTitle) {
      noResultsTitle.textContent = 'No trials found';
    }
    if (noResultsText) {
      noResultsText.textContent = 'Try adjusting your search criteria or filters to find more results.';
    }

    if (strongMatches.length > 0) {
      trialsContainer.appendChild(this.renderPatientSearchGroup(
        'Strong Matches',
        strongMatches,
        '#166534',
        '#dcfce7',
        'No strong matches for the current query.'
      ));
    }

    if (possibleMatches.length > 0) {
      trialsContainer.appendChild(this.renderPatientSearchGroup(
        'Possible Matches',
        possibleMatches,
        '#92400e',
        '#fef3c7',
        'No possible matches for the current query.'
      ));
    }
  }

  renderPatientSearchGroup(title, entries, accentColor, backgroundColor, emptyState) {
    const section = document.createElement('section');
    section.style.cssText = 'margin-bottom: 2rem;';

    const header = document.createElement('div');
    header.style.cssText = `display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.25rem;border-radius:16px;background:${backgroundColor};margin-bottom:1rem;`;
    header.innerHTML = `
      <div>
        <h3 style="margin:0;font-size:1.15rem;color:${accentColor};">${Utils.sanitizeHTML(title)}</h3>
        <p style="margin:0.2rem 0 0;color:${accentColor};opacity:0.88;font-size:0.9rem;">${entries.length} trial${entries.length === 1 ? '' : 's'}</p>
      </div>
    `;
    section.appendChild(header);

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding: 1rem 1.25rem; border-radius: 16px; background: var(--card-background); color: var(--text-secondary); box-shadow: var(--shadow-sm);';
      empty.textContent = emptyState;
      section.appendChild(empty);
      return section;
    }

    const grid = document.createElement('div');
    grid.className = 'trials-grid';
    entries.forEach(entry => {
      grid.appendChild(this.createTrialCard(entry.trial, entry.match));
    });
    section.appendChild(grid);
    return section;
  }

  updateCatalogMeta() {
    const meta = document.getElementById('catalogMeta');
    if (!meta) {
      return;
    }

    const metadata = this.trialManager.catalogMetadata || {};
    const totalTrials = Number(metadata.trialCount || this.trialManager.getAllTrials().length || 0);
    const syncDate = Utils.formatDate(metadata.lastSyncAt || '');
    const institutionCount = Number(metadata.institutionCount || 0);
    const scopeText = this.activeView === 'patient-search'
      ? 'Patient search view'
      : 'Catalog view';

    meta.textContent = `${scopeText} · ${totalTrials} synced trial${totalTrials === 1 ? '' : 's'} · ${institutionCount || 'SoCal'} institutions · Last sync ${syncDate}`;
  }

  /**
   * Update results count display
   */
  updateResultsCount() {
    const resultsCount = document.getElementById('resultsCount');
    if (!resultsCount) return;

    if (this.activeView === 'patient-search') {
      if (!this.patientSearchState.active) {
        resultsCount.textContent = 'Patient search ready';
        return;
      }

      const strongCount = this.patientSearchState.matches?.strongMatches?.length || 0;
      const possibleCount = this.patientSearchState.matches?.possibleMatches?.length || 0;
      const totalCount = strongCount + possibleCount;

      if (totalCount === 0) {
        resultsCount.textContent = 'No patient-matched trials found';
        return;
      }

      resultsCount.textContent = `${strongCount} strong match${strongCount === 1 ? '' : 'es'} · ${possibleCount} possible match${possibleCount === 1 ? '' : 'es'}`;
      return;
    }

    const paginationInfo = this.trialManager.getPaginationInfo();
    const activeFilters = this.searchFilter ? this.searchFilter.getActiveFilterCount() : 0;
    
    let countText = '';
    if (paginationInfo.totalTrials === 0) {
      countText = 'No trials found';
    } else if (paginationInfo.totalTrials <= this.trialManager.trialsPerPage) {
      countText = `Showing ${paginationInfo.totalTrials} trial${paginationInfo.totalTrials > 1 ? 's' : ''}`;
    } else {
      countText = `Showing ${paginationInfo.startIndex}-${paginationInfo.endIndex} of ${paginationInfo.totalTrials} trials`;
    }
    
    if (activeFilters > 0) {
      countText += ` (filtered)`;
    }
    
    resultsCount.textContent = countText;
  }

  /**
   * Setup pagination controls
   */
  setupPagination() {
    if (this.activeView === 'patient-search') {
      this.hidePagination();
      return;
    }

    const paginationInfo = this.trialManager.getPaginationInfo();
    
    if (paginationInfo.totalPages <= 1) {
      // No pagination needed
      this.hidePagination();
      return;
    }

    let paginationHTML = '<div class="pagination">';
    
    // Previous button
    if (paginationInfo.hasPrevPage) {
      paginationHTML += `<button class="pagination-btn" onclick="window.currentPage.goToPage(${paginationInfo.currentPage - 1})">Previous</button>`;
    } else {
      paginationHTML += `<button class="pagination-btn" disabled>Previous</button>`;
    }
    
    // Page numbers
    const startPage = Math.max(1, paginationInfo.currentPage - 2);
    const endPage = Math.min(paginationInfo.totalPages, paginationInfo.currentPage + 2);
    
    if (startPage > 1) {
      paginationHTML += `<button class="pagination-btn" onclick="window.currentPage.goToPage(1)">1</button>`;
      if (startPage > 2) {
        paginationHTML += `<span class="pagination-info">...</span>`;
      }
    }
    
    for (let i = startPage; i <= endPage; i++) {
      const activeClass = i === paginationInfo.currentPage ? ' active' : '';
      paginationHTML += `<button class="pagination-btn${activeClass}" onclick="window.currentPage.goToPage(${i})">${i}</button>`;
    }
    
    if (endPage < paginationInfo.totalPages) {
      if (endPage < paginationInfo.totalPages - 1) {
        paginationHTML += `<span class="pagination-info">...</span>`;
      }
      paginationHTML += `<button class="pagination-btn" onclick="window.currentPage.goToPage(${paginationInfo.totalPages})">${paginationInfo.totalPages}</button>`;
    }
    
    // Next button
    if (paginationInfo.hasNextPage) {
      paginationHTML += `<button class="pagination-btn" onclick="window.currentPage.goToPage(${paginationInfo.currentPage + 1})">Next</button>`;
    } else {
      paginationHTML += `<button class="pagination-btn" disabled>Next</button>`;
    }
    
    paginationHTML += '</div>';
    
    this.showPagination(paginationHTML);
  }

  /**
   * Update pagination display
   */
  updatePagination() {
    this.setupPagination();
  }

  /**
   * Show pagination
   * @param {string} paginationHTML - Pagination HTML
   */
  showPagination(paginationHTML) {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    // Remove existing pagination
    const existingPagination = mainContent.querySelector('.pagination');
    if (existingPagination) {
      existingPagination.remove();
    }

    // Add new pagination
    const paginationElement = Utils.createElementFromHTML(paginationHTML);
    mainContent.appendChild(paginationElement);
  }

  /**
   * Hide pagination
   */
  hidePagination() {
    const existingPagination = document.querySelector('.pagination');
    if (existingPagination) {
      existingPagination.remove();
    }
  }

  /**
   * Navigate to specific page
   * @param {number} page - Page number
   */
  goToPage(page) {
    this.trialManager.setCurrentPage(page);
    this.updateTrialsDisplay();
    
    // Scroll to top of results
    Utils.scrollToElement('.results-header');
  }

  /**
   * Handle keyboard navigation
   */
  setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
      // Only handle if no input is focused
      if (document.activeElement.tagName === 'INPUT' || 
          document.activeElement.tagName === 'SELECT' ||
          document.activeElement.tagName === 'TEXTAREA') {
        return;
      }

      const paginationInfo = this.trialManager.getPaginationInfo();
      
      switch (e.key) {
        case 'ArrowLeft':
          if (paginationInfo.hasPrevPage) {
            this.goToPage(paginationInfo.currentPage - 1);
          }
          break;
          
        case 'ArrowRight':
          if (paginationInfo.hasNextPage) {
            this.goToPage(paginationInfo.currentPage + 1);
          }
          break;
          
        case '/':
          e.preventDefault();
          if (this.activeView === 'patient-search') {
            document.getElementById('patientQueryInput')?.focus();
          } else {
            document.getElementById('searchInput')?.focus();
          }
          break;
      }
    });
  }

  /**
   * Setup responsive behavior
   */
  setupResponsiveBehavior() {
    // Handle mobile filter toggle if needed
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        // Mobile specific adjustments
        this.handleMobileLayout();
      } else {
        // Desktop specific adjustments
        this.handleDesktopLayout();
      }
    };

    window.addEventListener('resize', Utils.debounce(handleResize, 250));
    handleResize(); // Initial call
  }

  /**
   * Handle mobile layout adjustments
   */
  handleMobileLayout() {
    // Adjust trials per page for mobile
    if (this.trialManager.trialsPerPage !== 6) {
      this.trialManager.trialsPerPage = 6;
      this.updateTrialsDisplay();
    }
  }

  /**
   * Handle desktop layout adjustments
   */
  handleDesktopLayout() {
    // Reset trials per page for desktop
    if (this.trialManager.trialsPerPage !== 12) {
      this.trialManager.trialsPerPage = 12;
      this.updateTrialsDisplay();
    }
  }

  /**
   * Get application statistics for debugging
   */
  getAppStats() {
    return {
      totalTrials: this.trialManager.trials.length,
      filteredTrials: this.trialManager.filteredTrials.length,
      currentPage: this.trialManager.currentPage,
      activeFilters: this.searchFilter ? this.searchFilter.getCurrentFilters() : {},
      isLoading: this.isLoading
    };
  }
}

/**
 * Initialize application when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', () => {
  const app = new ClinicalTrialsApp();
  app.init();
  
  // Setup additional features
  app.setupKeyboardNavigation();
  app.setupResponsiveBehavior();
  
  // Make app available globally for debugging
  window.clinicalTrialsApp = app;
});

// Handle page visibility changes to refresh data if needed
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && window.clinicalTrialsApp) {
    // Page became visible - could refresh data here if needed
    console.log('Page became visible');
  }
});

// Export for other modules
window.ClinicalTrialsApp = ClinicalTrialsApp;
