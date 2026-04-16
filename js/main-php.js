/**
 * Main application script for Clinical Trials website - PHP Version
 */
class ClinicalTrialsApp {
  constructor() {
    this.trialManager = new TrialManager();
    this.searchFilter = null;
    this.currentPage = 'index';
    this.isLoading = false;
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

      // Populate filter dropdowns with data
      this.searchFilter.populateLocationFilter();

      // Apply initial filters (from URL if any)
      this.searchFilter.applyFilters();

      // Display trials
      this.updateTrialsDisplay();
      
      // Set up pagination
      this.setupPagination();
      
      // Make app instance available globally for debugging
      window.currentPage = this;
      
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
  createTrialCard(trial) {
    const statusConfig = Utils.getStatusConfig(trial.status);
    const hospital = trial.location?.hospital || 'Not specified';
    const instituteId = Utils.getDisplayInstituteId(trial) || 'Not specified';
    const piName = trial.piName || 'Not specified';
    const websiteUpdate = Utils.getDisplayWebsiteUpdate(trial);
    const contactEmail = trial.contactEmail || '';
    const contactMarkup = contactEmail
      ? `<a href="mailto:${Utils.sanitizeHTML(contactEmail)}" class="trial-contact trial-detail-value">
                ${Utils.sanitizeHTML(contactEmail)}
              </a>`
      : '<span class="trial-detail-value">Not specified</span>';
    
    const cardHTML = `
      <div class="trial-card" data-trial-id="${trial.id}" onclick="window.clinicalTrialsApp.viewTrialDetail('${trial.id}')">
        <div class="trial-card-header">
          <h3 class="trial-title">${Utils.sanitizeHTML(trial.title)}</h3>
          <span class="trial-status ${statusConfig.className}">${statusConfig.label}</span>
        </div>
        
        <p class="trial-description">
          ${Utils.sanitizeHTML(Utils.truncateText(trial.description, 150))}
        </p>
        
        <div class="trial-details">
          <div class="trial-detail-item">
            <span class="trial-detail-icon">🏥</span>
            <div class="trial-detail-content">
              <span class="trial-detail-label">Institution</span>
              <div class="trial-detail-value trial-location">
                ${Utils.sanitizeHTML(hospital)}<br>
                <small>Institute ID: ${Utils.sanitizeHTML(instituteId)}</small>
              </div>
            </div>
          </div>
          
          <div class="trial-detail-item">
            <span class="trial-detail-icon">📧</span>
            <div class="trial-detail-content">
              <span class="trial-detail-label">Contact</span>
              ${contactMarkup}
            </div>
          </div>
          
          <div class="trial-detail-item">
            <span class="trial-detail-icon">👩‍⚕️</span>
            <div class="trial-detail-content">
              <span class="trial-detail-label">PI Name</span>
              <div class="trial-detail-value">${Utils.sanitizeHTML(piName)}</div>
            </div>
          </div>

          <div class="trial-detail-item">
            <span class="trial-detail-icon">🔬</span>
            <div class="trial-detail-content">
              <span class="trial-detail-label">Study Type</span>
              <div class="trial-detail-value">${Utils.sanitizeHTML(trial.studyType || 'Not specified')}</div>
            </div>
          </div>
        </div>
        
        <div class="trial-card-footer">
          <div class="trial-dates">
            <strong>Start:</strong> ${Utils.formatDate(trial.startDate)} | 
            <strong>Website Update:</strong> ${Utils.formatDate(websiteUpdate)}
          </div>
          <a href="trial-detail-php.html?id=${trial.id}" class="trial-view-btn" onclick="event.stopPropagation();">
            View Details
          </a>
        </div>
      </div>
    `;
    
    return Utils.createElementFromHTML(cardHTML);
  }

  /**
   * View trial detail (for card click)
   * @param {string} trialId - Trial ID
   */
  viewTrialDetail(trialId) {
    window.location.href = `trial-detail-php.html?id=${trialId}`;
  }

  /**
   * Update results count display
   */
  updateResultsCount() {
    const resultsCount = document.getElementById('resultsCount');
    if (!resultsCount) return;

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
          const searchInput = document.getElementById('searchInput');
          if (searchInput) {
            searchInput.focus();
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
