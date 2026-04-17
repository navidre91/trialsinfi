/**
 * Search and Filter functionality for Clinical Trials
 */
class SearchFilter {
  constructor(trialManager) {
    this.trialManager = trialManager;
    this.searchInput = null;
    this.filters = {
      searchQuery: '',
      status: 'all',
      locations: [],
      phase: 'all',
      cancerType: 'all',
      sortBy: 'title'
    };
    this.debounceDelay = 300;
    this.searchDebounced = null;
  }

  /**
   * Initialize search and filter functionality
   */
  init() {
    this.bindEventListeners();
    this.setupSearchDebouncing();
    this.loadFiltersFromURL();
  }

  /**
   * Bind event listeners to filter controls
   */
  bindEventListeners() {
    this.searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');

    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.filters.searchQuery = e.target.value;
        this.searchDebounced();
        this.updateURL();
      });

      this.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.applyFilters();
        }
      });
    }

    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        this.applyFilters();
      });
    }

    const statusInputs = document.querySelectorAll('input[name="status"]');
    statusInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        this.filters.status = e.target.value;
        this.applyFilters();
        this.updateURL();
      });
    });

    const locationFilter = document.getElementById('locationFilter');
    if (locationFilter) {
      locationFilter.addEventListener('change', () => {
        this.filters.locations = Array.from(locationFilter.selectedOptions)
          .map(option => option.value)
          .filter(value => value && value !== 'all');
        this.applyFilters();
        this.updateURL();
      });
    }

    const phaseFilter = document.getElementById('phaseFilter');
    if (phaseFilter) {
      phaseFilter.addEventListener('change', (e) => {
        this.filters.phase = e.target.value;
        this.applyFilters();
        this.updateURL();
      });
    }

    const cancerTypeFilter = document.getElementById('cancerTypeFilter');
    if (cancerTypeFilter) {
      cancerTypeFilter.addEventListener('change', (e) => {
        this.filters.cancerType = e.target.value;
        this.applyFilters();
        this.updateURL();
      });
    }

    const sortBy = document.getElementById('sortBy');
    if (sortBy) {
      sortBy.addEventListener('change', (e) => {
        this.filters.sortBy = e.target.value;
        this.applyFilters();
        this.updateURL();
      });
    }

    const clearFiltersBtn = document.getElementById('clearFilters');
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => {
        this.clearAllFilters();
      });
    }

    const resetSearchBtn = document.getElementById('resetSearch');
    if (resetSearchBtn) {
      resetSearchBtn.addEventListener('click', () => {
        if (window.currentPage?.patientSearchState?.active && typeof window.currentPage.clearPatientSearch === 'function') {
          window.currentPage.clearPatientSearch();
          return;
        }
        this.clearAllFilters();
      });
    }
  }

  /**
   * Setup debounced search functionality
   */
  setupSearchDebouncing() {
    this.searchDebounced = Utils.debounce(() => {
      this.applyFilters();
    }, this.debounceDelay);
  }

  /**
   * Apply current filters to trial manager
   */
  applyFilters() {
    this.trialManager.applyFilters(this.filters);

    if (window.currentPage && window.currentPage.updateTrialsDisplay) {
      window.currentPage.updateTrialsDisplay();
    }
  }

  /**
   * Clear all filters and reset UI
   */
  clearAllFilters() {
    this.filters = {
      searchQuery: '',
      status: 'all',
      locations: [],
      phase: 'all',
      cancerType: 'all',
      sortBy: 'title'
    };

    this.updateUIControls();
    this.applyFilters();
    this.updateURL();
  }

  /**
   * Load filter values from URL parameters
   */
  loadFiltersFromURL() {
    const urlParams = Utils.getUrlParams();

    const searchQuery = urlParams.get('search');
    if (searchQuery) {
      this.filters.searchQuery = searchQuery;
    }

    const statusParam = urlParams.get('status');
    if (statusParam) {
      if (statusParam === 'all') {
        this.filters.status = 'all';
      } else {
        this.filters.status = Utils.normalizeStatus(statusParam) || 'all';
      }
    }

    const locations = urlParams.getAll('location').filter(value => value && value !== 'all');
    if (locations.length > 0) {
      this.filters.locations = locations;
    }

    const phase = urlParams.get('phase');
    if (phase && ['all', 'Phase I', 'Phase II', 'Phase III', 'Phase IV'].includes(phase)) {
      this.filters.phase = phase;
    }

    const cancerTypeParam = urlParams.get('cancerType');
    if (cancerTypeParam) {
      const normalizedCancerType = Utils.normalizeCancerType(cancerTypeParam);
      this.filters.cancerType = normalizedCancerType || 'all';
    }

    const sortBy = urlParams.get('sortBy');
    if (sortBy && ['title', 'status', 'startDate', 'location'].includes(sortBy)) {
      this.filters.sortBy = sortBy;
    }

    this.updateUIControls();
  }

  /**
   * Update URL with current filter parameters
   */
  updateURL() {
    const url = new URL(window.location);

    if (this.filters.searchQuery) {
      url.searchParams.set('search', this.filters.searchQuery);
    } else {
      url.searchParams.delete('search');
    }

    if (this.filters.status !== 'all') {
      url.searchParams.set('status', this.filters.status);
    } else {
      url.searchParams.delete('status');
    }

    url.searchParams.delete('location');
    this.filters.locations.forEach(location => {
      if (location === 'all') return;
      url.searchParams.append('location', location);
    });

    if (this.filters.phase !== 'all') {
      url.searchParams.set('phase', this.filters.phase);
    } else {
      url.searchParams.delete('phase');
    }

    if (this.filters.cancerType !== 'all') {
      url.searchParams.set('cancerType', this.filters.cancerType);
    } else {
      url.searchParams.delete('cancerType');
    }

    if (this.filters.sortBy !== 'title') {
      url.searchParams.set('sortBy', this.filters.sortBy);
    } else {
      url.searchParams.delete('sortBy');
    }

    window.history.replaceState(null, '', url);
  }

  /**
   * Populate location filter dropdown with available locations
   */
  populateLocationFilter() {
    const locationFilter = document.getElementById('locationFilter');
    if (!locationFilter) return;

    const locations = this.trialManager.getUniqueLocations();
    const selected = new Set(this.filters.locations);

    locationFilter.innerHTML = '';

    locations.forEach(location => {
      const option = document.createElement('option');
      option.value = location;
      option.textContent = location;
      if (selected.has(location)) {
        option.selected = true;
      }
      locationFilter.appendChild(option);
    });
  }

  /**
   * Backward-compatibility shim for static legacy entrypoints.
   * Study type filtering has been removed from the PHP live path.
   */
  populateStudyTypeFilter() {}

  /**
   * Get active filter count (for UI indication)
   * @returns {number} Number of active filters
   */
  getActiveFilterCount() {
    let count = 0;

    if (this.filters.searchQuery.trim()) count++;
    if (this.filters.status !== 'all') count++;
    if (this.filters.locations.length > 0) count++;
    if (this.filters.phase !== 'all') count++;
    if (this.filters.cancerType !== 'all') count++;

    return count;
  }

  /**
   * Get current filters summary for display
   * @returns {Array} Array of active filter descriptions
   */
  getActiveFiltersSummary() {
    const summary = [];

    if (this.filters.searchQuery.trim()) {
      summary.push(`Search: "${this.filters.searchQuery}"`);
    }

    if (this.filters.status !== 'all') {
      const statusConfig = Utils.getStatusConfig(this.filters.status);
      summary.push(`Status: ${statusConfig.label}`);
    }

    if (this.filters.locations.length > 0) {
      summary.push(`Locations: ${this.filters.locations.join(', ')}`);
    }

    if (this.filters.phase !== 'all') {
      summary.push(`Phase: ${this.filters.phase}`);
    }

    if (this.filters.cancerType !== 'all') {
      summary.push(`Cancer Type: ${this.filters.cancerType}`);
    }

    return summary;
  }

  /**
   * Apply quick filter (for buttons or links)
   * @param {string} filterType - Type of filter
   * @param {string} value - Filter value
   */
  applyQuickFilter(filterType, value) {
    switch (filterType) {
      case 'status':
        this.filters.status = Utils.normalizeStatus(value) || 'all';
        break;

      case 'location':
        this.filters.locations = value ? [value] : [];
        break;

      case 'phase':
        this.filters.phase = value || 'all';
        break;

      case 'cancerType': {
        const normalizedCancerType = Utils.normalizeCancerType(value);
        this.filters.cancerType = normalizedCancerType || 'all';
        break;
      }
    }

    this.updateUIControls();
    this.applyFilters();
    this.updateURL();
  }

  /**
   * Get current filter state
   * @returns {Object} Current filters
   */
  getCurrentFilters() {
    return {
      ...this.filters,
      locations: [...this.filters.locations]
    };
  }

  /**
   * Set filters from external source
   * @param {Object} newFilters - New filter values
   */
  setFilters(newFilters) {
    this.filters = {
      ...this.filters,
      ...newFilters,
      locations: Array.isArray(newFilters.locations)
        ? newFilters.locations
        : this.filters.locations
    };

    if (newFilters.status) {
      this.filters.status = Utils.normalizeStatus(newFilters.status) || this.filters.status;
    }

    if (newFilters.cancerType) {
      this.filters.cancerType = Utils.normalizeCancerType(newFilters.cancerType) || this.filters.cancerType;
    }

    this.updateUIControls();
    this.applyFilters();
    this.updateURL();
  }

  /**
   * Update UI controls to match current filter values
   */
  updateUIControls() {
    if (this.searchInput) {
      this.searchInput.value = this.filters.searchQuery;
    }

    const statusInput = document.querySelector(`input[name="status"][value="${this.filters.status}"]`);
    if (statusInput) {
      statusInput.checked = true;
    }

    const locationFilter = document.getElementById('locationFilter');
    if (locationFilter) {
      const selectedSet = new Set(this.filters.locations);
      Array.from(locationFilter.options).forEach(option => {
        option.selected = selectedSet.has(option.value);
      });
    }

    const phaseFilter = document.getElementById('phaseFilter');
    if (phaseFilter) {
      phaseFilter.value = this.filters.phase;
    }

    const cancerTypeFilter = document.getElementById('cancerTypeFilter');
    if (cancerTypeFilter) {
      cancerTypeFilter.value = this.filters.cancerType;
    }

    const sortBy = document.getElementById('sortBy');
    if (sortBy) {
      sortBy.value = this.filters.sortBy;
    }
  }
}

// Export for use in other modules
window.SearchFilter = SearchFilter;
