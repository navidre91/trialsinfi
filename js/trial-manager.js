/**
 * Clinical Trial Manager - handles trial data operations
 */
class TrialManager {
  constructor() {
    this.trials = [];
    this.filteredTrials = [];
    this.currentPage = 1;
    this.trialsPerPage = 12;
    this.dataLoaded = false;
  }

  /**
   * Normalize trial record to canonical values and shape
   * @param {Object} trial - Trial record
   * @returns {Object} Normalized trial
   */
  normalizeTrialRecord(trial) {
    return Utils.normalizeTrialForSave(trial);
  }

  getLocationLabel(trial) {
    return trial.location?.hospital || trial.location?.city || Utils.getDisplayInstituteId(trial) || 'Not specified';
  }

  /**
   * Load trials data from JSON file
   * @returns {Promise<Array>} Array of trials
   */
  async loadTrials() {
    try {
      const response = await fetch('data/trials.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      this.trials = (data.trials || []).map(trial => this.normalizeTrialRecord(trial));
      this.filteredTrials = [...this.trials];
      this.dataLoaded = true;
      return this.trials;
    } catch (error) {
      console.error('Error loading trials:', error);
      Utils.showErrorMessage('Failed to load clinical trials data');
      return [];
    }
  }

  /**
   * Get all trials
   * @returns {Array} All trials
   */
  getAllTrials() {
    return this.trials;
  }

  /**
   * Get filtered trials
   * @returns {Array} Filtered trials
   */
  getFilteredTrials() {
    return this.filteredTrials;
  }

  /**
   * Get trial by ID
   * @param {string} trialId - Trial ID
   * @returns {Object|null} Trial object or null if not found
   */
  getTrialById(trialId) {
    return this.trials.find(trial => trial.id === trialId) || null;
  }

  /**
   * Get trials for current page
   * @returns {Array} Trials for current page
   */
  getCurrentPageTrials() {
    const startIndex = (this.currentPage - 1) * this.trialsPerPage;
    const endIndex = startIndex + this.trialsPerPage;
    return this.filteredTrials.slice(startIndex, endIndex);
  }

  /**
   * Get pagination info
   * @returns {Object} Pagination information
   */
  getPaginationInfo() {
    const totalTrials = this.filteredTrials.length;
    const totalPages = Math.ceil(totalTrials / this.trialsPerPage);
    const startIndex = (this.currentPage - 1) * this.trialsPerPage + 1;
    const endIndex = Math.min(startIndex + this.trialsPerPage - 1, totalTrials);

    return {
      currentPage: this.currentPage,
      totalPages,
      totalTrials,
      startIndex: totalTrials > 0 ? startIndex : 0,
      endIndex: totalTrials > 0 ? endIndex : 0,
      hasNextPage: this.currentPage < totalPages,
      hasPrevPage: this.currentPage > 1
    };
  }

  /**
   * Set current page
   * @param {number} page - Page number
   */
  setCurrentPage(page) {
    const totalPages = Math.ceil(this.filteredTrials.length / this.trialsPerPage);
    if (page >= 1 && page <= totalPages) {
      this.currentPage = page;
    }
  }

  /**
   * Apply filters to trials
   * @param {Object} filters - Filter criteria
   */
  applyFilters(filters) {
    const statusFilter = filters.status && filters.status !== 'all'
      ? (Utils.normalizeStatus(filters.status) || filters.status)
      : 'all';

    this.filteredTrials = this.trials.filter(trial => {
      // Status filter
      if (statusFilter !== 'all' && Utils.normalizeStatus(trial.status) !== statusFilter) {
        return false;
      }

      // Location filter
      if (filters.location && filters.location !== 'all') {
        const trialLocation = this.getLocationLabel(trial).toLowerCase();
        const filterLocation = filters.location.toLowerCase();
        if (!trialLocation.includes(filterLocation)) {
          return false;
        }
      }

      // Study type filter
      if (filters.studyType && filters.studyType !== 'all' && trial.studyType !== filters.studyType) {
        return false;
      }

      // Search query filter
      if (filters.searchQuery && filters.searchQuery.trim()) {
        const query = filters.searchQuery.toLowerCase().trim();
        const searchableFields = [
          trial.title,
          trial.description,
          trial.qualification,
          trial.location?.hospital || '',
          trial.location?.city || '',
          trial.piName || '',
          Utils.getDisplayInstituteId(trial),
          trial.primaryObjective,
          trial.sponsor
        ].join(' ').toLowerCase();
        
        if (!searchableFields.includes(query)) {
          return false;
        }
      }

      return true;
    });

    // Sort trials
    if (filters.sortBy) {
      this.sortTrials(filters.sortBy);
    }

    // Reset to first page after filtering
    this.currentPage = 1;
  }

  /**
   * Sort trials by specified criteria
   * @param {string} sortBy - Sort criteria
   */
  sortTrials(sortBy) {
    this.filteredTrials.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        
        case 'status':
          const statusOrder = {
            recruiting: 1,
            active_not_recruiting: 2,
            completed: 3,
            not_specified: 4
          };
          return (statusOrder[Utils.normalizeStatus(a.status) || 'not_specified'] || 99)
            - (statusOrder[Utils.normalizeStatus(b.status) || 'not_specified'] || 99);
        
        case 'startDate':
          return new Date(b.startDate) - new Date(a.startDate);
        
        case 'location':
          return this.getLocationLabel(a).localeCompare(this.getLocationLabel(b));
        
        default:
          return 0;
      }
    });
  }

  /**
   * Search trials by query
   * @param {string} query - Search query
   * @returns {Array} Matching trials
   */
  searchTrials(query) {
    if (!query || !query.trim()) {
      return this.trials;
    }

    const searchTerms = query.toLowerCase().trim().split(' ');
    
    return this.trials.filter(trial => {
      const eligibilityCriteria = Array.isArray(trial.eligibilityCriteria) ? trial.eligibilityCriteria : [];
      const secondaryObjectives = Array.isArray(trial.secondaryObjectives) ? trial.secondaryObjectives : [];
      const searchableContent = [
        trial.title,
        trial.description,
        trial.qualification,
        trial.location?.hospital || '',
        trial.location?.city || '',
        trial.piName || '',
        Utils.getDisplayInstituteId(trial),
        trial.primaryObjective,
        trial.sponsor,
        ...eligibilityCriteria,
        ...secondaryObjectives
      ].join(' ').toLowerCase();

      return searchTerms.every(term => searchableContent.includes(term));
    });
  }

  /**
   * Get trials by status
   * @param {string} status - Trial status
   * @returns {Array} Trials with matching status
   */
  getTrialsByStatus(status) {
    const normalizedStatus = Utils.normalizeStatus(status);
    return this.trials.filter(trial => Utils.normalizeStatus(trial.status) === normalizedStatus);
  }

  /**
   * Get trials by location
   * @param {string} location - Location name
   * @returns {Array} Trials in matching location
   */
  getTrialsByLocation(location) {
    return this.trials.filter(trial => this.getLocationLabel(trial).toLowerCase().includes(location.toLowerCase()));
  }

  /**
   * Get unique locations from all trials
   * @returns {Array} Array of unique locations
   */
  getUniqueLocations() {
    const locations = new Set();
    this.trials.forEach(trial => {
      const locationLabel = this.getLocationLabel(trial);
      if (locationLabel) {
        locations.add(locationLabel);
      }
    });
    return Array.from(locations).sort();
  }

  /**
   * Get unique study types from all trials
   * @returns {Array} Array of unique study types
   */
  getUniqueStudyTypes() {
    const studyTypes = new Set();
    this.trials.forEach(trial => {
      if (trial.studyType) {
        studyTypes.add(trial.studyType);
      }
    });
    return Array.from(studyTypes).sort();
  }

  /**
   * Get trials statistics
   * @returns {Object} Statistics about trials
   */
  getTrialsStatistics() {
    const stats = {
      total: this.trials.length,
      recruiting: 0,
      active_not_recruiting: 0,
      completed: 0,
      not_specified: 0,
      byLocation: {},
      byStudyType: {}
    };

    this.trials.forEach(trial => {
      // Count by status
      const trialStatus = Utils.normalizeStatus(trial.status) || 'not_specified';
      if (Object.prototype.hasOwnProperty.call(stats, trialStatus)) {
        stats[trialStatus] += 1;
      }

      // Count by location
      const locationLabel = this.getLocationLabel(trial);
      stats.byLocation[locationLabel] = (stats.byLocation[locationLabel] || 0) + 1;

      // Count by study type
      if (trial.studyType) {
        stats.byStudyType[trial.studyType] = (stats.byStudyType[trial.studyType] || 0) + 1;
      }
    });

    return stats;
  }

  /**
   * Add new trial (admin functionality)
   * @param {Object} trialData - Trial data
   * @returns {boolean} Success status
   */
  addTrial(trialData) {
    try {
      // Generate unique ID if not provided
      if (!trialData.id) {
        trialData.id = Utils.generateId();
      }

      // Add timestamp
      trialData.lastUpdated = new Date().toISOString();
      const normalizedTrial = this.normalizeTrialRecord(trialData);

      // Add to trials array
      this.trials.unshift(normalizedTrial);
      
      // Update filtered trials if no filters applied
      this.filteredTrials = [...this.trials];
      
      // Save to localStorage (simulating database save)
      this.saveTrialsToStorage();
      
      Utils.showSuccessMessage('Trial added successfully');
      return true;
    } catch (error) {
      console.error('Error adding trial:', error);
      Utils.showErrorMessage('Failed to add trial');
      return false;
    }
  }

  /**
   * Update existing trial (admin functionality)
   * @param {string} trialId - Trial ID
   * @param {Object} updatedData - Updated trial data
   * @returns {boolean} Success status
   */
  updateTrial(trialId, updatedData) {
    try {
      const trialIndex = this.trials.findIndex(trial => trial.id === trialId);
      if (trialIndex === -1) {
        throw new Error('Trial not found');
      }

      // Update timestamp
      updatedData.lastUpdated = new Date().toISOString();
      const normalizedTrial = this.normalizeTrialRecord({
        ...this.trials[trialIndex],
        ...updatedData,
        id: trialId
      });
      
      // Update trial
      this.trials[trialIndex] = normalizedTrial;
      
      // Update filtered trials
      this.filteredTrials = [...this.trials];
      
      // Save to localStorage
      this.saveTrialsToStorage();
      
      Utils.showSuccessMessage('Trial updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating trial:', error);
      Utils.showErrorMessage('Failed to update trial');
      return false;
    }
  }

  /**
   * Delete trial (admin functionality)
   * @param {string} trialId - Trial ID
   * @returns {boolean} Success status
   */
  deleteTrial(trialId) {
    try {
      const trialIndex = this.trials.findIndex(trial => trial.id === trialId);
      if (trialIndex === -1) {
        throw new Error('Trial not found');
      }

      // Remove trial
      this.trials.splice(trialIndex, 1);
      
      // Update filtered trials
      this.filteredTrials = [...this.trials];
      
      // Save to localStorage
      this.saveTrialsToStorage();
      
      Utils.showSuccessMessage('Trial deleted successfully');
      return true;
    } catch (error) {
      console.error('Error deleting trial:', error);
      Utils.showErrorMessage('Failed to delete trial');
      return false;
    }
  }

  /**
   * Save trials to localStorage (simulating database persistence)
   */
  saveTrialsToStorage() {
    try {
      const trialsData = {
        trials: this.trials,
        lastModified: new Date().toISOString()
      };
      localStorage.setItem('clinicalTrialsData', JSON.stringify(trialsData));
    } catch (error) {
      console.error('Error saving trials to storage:', error);
    }
  }

  /**
   * Load trials from localStorage if available
   * @returns {boolean} Whether data was loaded from storage
   */
  loadTrialsFromStorage() {
    try {
      const storedData = localStorage.getItem('clinicalTrialsData');
      if (storedData) {
        const data = JSON.parse(storedData);
        if (data.trials && Array.isArray(data.trials)) {
          this.trials = data.trials.map(trial => this.normalizeTrialRecord(trial));
          this.filteredTrials = [...this.trials];
          this.dataLoaded = true;
          return true;
        }
      }
    } catch (error) {
      console.error('Error loading trials from storage:', error);
    }
    return false;
  }

  /**
   * Reset trials to original JSON data
   */
  async resetTrials() {
    try {
      localStorage.removeItem('clinicalTrialsData');
      await this.loadTrials();
      Utils.showSuccessMessage('Trials data reset to original');
    } catch (error) {
      console.error('Error resetting trials:', error);
      Utils.showErrorMessage('Failed to reset trials data');
    }
  }

  /**
   * Export trials data
   * @returns {string} JSON string of trials data
   */
  exportTrials() {
    return JSON.stringify({
      trials: this.trials,
      exportDate: new Date().toISOString(),
      totalTrials: this.trials.length
    }, null, 2);
  }

  /**
   * Import trials data
   * @param {string} jsonData - JSON string of trials data
   * @returns {boolean} Success status
   */
  importTrials(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      if (data.trials && Array.isArray(data.trials)) {
        this.trials = data.trials.map(trial => this.normalizeTrialRecord(trial));
        this.filteredTrials = [...this.trials];
        this.saveTrialsToStorage();
        Utils.showSuccessMessage(`Imported ${data.trials.length} trials successfully`);
        return true;
      } else {
        throw new Error('Invalid data format');
      }
    } catch (error) {
      console.error('Error importing trials:', error);
      Utils.showErrorMessage('Failed to import trials data');
      return false;
    }
  }

  /**
   * Replace the entire catalog from CSV rows.
   * Matching priority for stable ids: id first, then nctId.
   * @param {Array<Object>} rows - Incoming trial rows
   * @returns {Object} Import summary
   */
  replaceTrialsFromCsv(rows) {
    const summary = {
      success: true,
      totalRows: Array.isArray(rows) ? rows.length : 0,
      imported: 0,
      created: 0,
      preserved: 0,
      removed: 0,
      errorCount: 0,
      errors: []
    };

    if (!Array.isArray(rows)) {
      return {
        ...summary,
        success: false,
        errorCount: 1,
        errors: [{ row: 0, message: 'Rows payload must be an array' }]
      };
    }

    const replacementTrials = [];
    rows.forEach((row, index) => {
      const normalizedTrial = this.normalizeTrialRecord(row);
      const rowNumber = row?._rowNumber || index + 2;
      const candidateId = normalizedTrial.id || '';
      const candidateNctId = (normalizedTrial.nctId || '').toLowerCase();

      const indexById = candidateId
        ? this.trials.findIndex(trial => trial.id === candidateId)
        : -1;
      const indexByNctId = candidateNctId
        ? this.trials.findIndex(trial => (trial.nctId || '').toLowerCase() === candidateNctId)
        : -1;

      if (indexById !== -1 && indexByNctId !== -1 && indexById !== indexByNctId) {
        summary.errors.push({
          row: rowNumber,
          message: 'Conflict: provided id and nctId reference different trials'
        });
        return;
      }

      const targetIndex = indexById !== -1 ? indexById : indexByNctId;
      const targetTrial = targetIndex !== -1 ? this.trials[targetIndex] : null;
      const finalId = targetTrial?.id || normalizedTrial.id || Utils.generateId();

      const replacementIndexById = finalId
        ? replacementTrials.findIndex(trial => trial.id === finalId)
        : -1;
      const replacementIndexByNct = candidateNctId
        ? replacementTrials.findIndex(trial => (trial.nctId || '').toLowerCase() === candidateNctId)
        : -1;

      if (replacementIndexById !== -1 && replacementIndexByNct !== -1 && replacementIndexById !== replacementIndexByNct) {
        summary.errors.push({
          row: rowNumber,
          message: 'Conflict: provided id and nctId reference different rows in the CSV'
        });
        return;
      }

      const replacementIndex = replacementIndexById !== -1 ? replacementIndexById : replacementIndexByNct;
      const replacementTarget = replacementIndex !== -1 ? replacementTrials[replacementIndex] : null;
      const nextTrial = this.normalizeTrialRecord({
        ...(targetTrial || replacementTarget || {}),
        ...normalizedTrial,
        id: replacementTarget?.id || finalId,
        lastUpdated: new Date().toISOString()
      });

      if (replacementIndex !== -1) {
        replacementTrials[replacementIndex] = nextTrial;
      } else {
        replacementTrials.push(nextTrial);
      }

      if (targetIndex !== -1) {
        summary.preserved += 1;
        return;
      }

      summary.created += 1;
    });

    summary.errorCount = summary.errors.length;
    if (summary.errorCount > 0) {
      summary.success = false;
      return summary;
    }

    summary.imported = replacementTrials.length;
    const previousIds = new Set(this.trials.map(trial => trial.id).filter(Boolean));
    const replacementIds = new Set(replacementTrials.map(trial => trial.id).filter(Boolean));
    summary.preserved = Array.from(replacementIds).filter(id => previousIds.has(id)).length;
    summary.created = replacementTrials.length - summary.preserved;
    summary.removed = Array.from(previousIds).filter(id => !replacementIds.has(id)).length;
    this.trials = replacementTrials;
    this.filteredTrials = [...this.trials];
    this.saveTrialsToStorage();

    return summary;
  }

  bulkUpsertTrials(rows) {
    return this.replaceTrialsFromCsv(rows);
  }
}

// Create global instance
window.TrialManager = TrialManager;
