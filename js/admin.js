/**
 * Admin Panel JavaScript - Handles admin functionality for Clinical Trials website
 */
class AdminPanel {
  constructor() {
    this.trialManager = new TrialManager();
    this.currentTrialId = null;
    this.isEditing = false;
    this.sessionKey = 'adminSession';
    this.trialDraftKey = 'trialFormDraftV1';
    this.filteredTrials = [];
    this.saveDraftDebounced = Utils.debounce(() => this.saveTrialDraft(), 250);
  }

  /**
   * Initialize admin panel
   */
  async init() {
    // Check authentication
    if (!this.checkAuth()) {
      window.location.href = 'admin-login.html';
      return;
    }

    try {
      // Load trials data
      const hasStoredData = this.trialManager.loadTrialsFromStorage();
      if (!hasStoredData) {
        await this.trialManager.loadTrials();
      }

      this.filteredTrials = this.trialManager.getAllTrials();

      // Initialize UI
      this.updateDashboardStats();
      this.renderTrialsTable();
      this.bindEventListeners();
      this.setupFormValidation();

      console.log('Admin panel initialized successfully');
    } catch (error) {
      console.error('Error initializing admin panel:', error);
      Utils.showErrorMessage('Failed to initialize admin panel');
    }
  }

  /**
   * Check if user is authenticated
   */
  checkAuth() {
    try {
      const sessionData = localStorage.getItem(this.sessionKey);
      if (!sessionData) return false;

      const session = JSON.parse(sessionData);
      if (!session.authenticated || !session.expiresAt) return false;

      // Check if session expired
      if (Date.now() > session.expiresAt) {
        this.logout();
        return false;
      }

      // Update welcome message
      const welcomeElement = document.getElementById('adminWelcome');
      if (welcomeElement) {
        welcomeElement.textContent = `Welcome, ${session.username}`;
      }

      return true;
    } catch (error) {
      console.error('Error checking auth:', error);
      return false;
    }
  }

  /**
   * Logout user
   */
  logout() {
    localStorage.removeItem(this.sessionKey);
    localStorage.removeItem('adminRemember');
    window.location.href = 'admin-login.html';
  }

  /**
   * Bind event listeners
   */
  bindEventListeners() {
    // Logout button
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      this.logout();
    });

    // Add trial button
    document.getElementById('addTrialBtn')?.addEventListener('click', () => {
      this.showTrialModal();
    });

    // Export data button
    document.getElementById('exportDataBtn')?.addEventListener('click', () => {
      this.exportData();
    });

    // Export CSV button
    document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
      this.exportCsvData();
    });

    // Upload CSV button
    document.getElementById('uploadCsvBtn')?.addEventListener('click', () => {
      document.getElementById('csvUploadInput')?.click();
    });

    document.getElementById('csvUploadInput')?.addEventListener('change', async (event) => {
      await this.handleCsvUpload(event);
    });

    // Search and filter
    const searchInput = document.getElementById('adminSearchInput');
    const statusFilter = document.getElementById('adminStatusFilter');

    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce(() => {
        this.filterTrials();
      }, 300));
    }

    if (statusFilter) {
      statusFilter.addEventListener('change', () => {
        this.filterTrials();
      });
    }

    // Modal event listeners
    this.bindModalEventListeners();
  }

  /**
   * Bind modal event listeners
   */
  bindModalEventListeners() {
    // Trial modal
    const trialModal = document.getElementById('trialModal');
    const closeModal = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const discardDraftBtn = document.getElementById('discardDraftBtn');
    const trialForm = document.getElementById('trialForm');

    closeModal?.addEventListener('click', () => {
      this.hideTrialModal();
    });

    cancelBtn?.addEventListener('click', () => {
      this.hideTrialModal();
    });

    discardDraftBtn?.addEventListener('click', () => {
      this.discardTrialDraft();
    });

    trialModal?.addEventListener('click', (e) => {
      if (e.target === trialModal) {
        // Keep modal open to avoid losing draft data by accident
        e.preventDefault();
      }
    });

    trialForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleTrialSubmit();
    });

    // Delete modal
    const deleteModal = document.getElementById('deleteModal');
    const closeDeleteModal = document.getElementById('closeDeleteModal');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    closeDeleteModal?.addEventListener('click', () => {
      this.hideDeleteModal();
    });

    cancelDeleteBtn?.addEventListener('click', () => {
      this.hideDeleteModal();
    });

    deleteModal?.addEventListener('click', (e) => {
      if (e.target === deleteModal) {
        this.hideDeleteModal();
      }
    });

    confirmDeleteBtn?.addEventListener('click', () => {
      this.confirmDelete();
    });
  }

  /**
   * Update dashboard statistics
   */
  updateDashboardStats() {
    const stats = this.trialManager.getTrialsStatistics();

    document.getElementById('totalTrials').textContent = stats.total;
    document.getElementById('recruitingTrials').textContent = stats.recruiting;
    document.getElementById('activeNotRecruitingTrials').textContent = stats.active_not_recruiting;
    document.getElementById('completedTrials').textContent = stats.completed;
  }

  /**
   * Filter trials based on search and status
   */
  filterTrials() {
    const searchQuery = document.getElementById('adminSearchInput')?.value.toLowerCase().trim() || '';
    const statusFilter = document.getElementById('adminStatusFilter')?.value || 'all';
    const normalizedStatusFilter = statusFilter === 'all' ? 'all' : (Utils.normalizeStatus(statusFilter) || statusFilter);

    this.filteredTrials = this.trialManager.getAllTrials().filter(trial => {
      const location = trial.location || {};

      // Search filter
      if (searchQuery) {
        const searchableText = [
          trial.title,
          trial.description,
          location.hospital,
          location.city,
          trial.sponsor,
          trial.contactEmail,
          trial.cancerType || '',
          trial.nctId || ''
        ].join(' ').toLowerCase();

        if (!searchableText.includes(searchQuery)) {
          return false;
        }
      }

      // Status filter
      if (normalizedStatusFilter !== 'all' && Utils.normalizeStatus(trial.status) !== normalizedStatusFilter) {
        return false;
      }

      return true;
    });

    this.renderTrialsTable();
  }

  /**
   * Render trials table
   */
  renderTrialsTable() {
    const tableBody = document.getElementById('trialsTableBody');
    if (!tableBody) return;

    if (this.filteredTrials.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
            <div>
              <h4 style="margin-bottom: 0.5rem;">No trials found</h4>
              <p>Try adjusting your search or filter criteria.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = this.filteredTrials.map(trial => {
      const statusConfig = Utils.getStatusConfig(trial.status);
      const institutionName = trial.location?.hospital || 'Not specified';
      const instituteId = Utils.getDisplayInstituteId(trial) || 'Not specified';
      const piName = trial.piName || 'Not specified';
      const websiteUpdate = Utils.getDisplayWebsiteUpdate(trial);
      return `
        <tr>
          <td>
            <div style="font-weight: 500; color: var(--text-primary); margin-bottom: 0.25rem;">
              ${Utils.sanitizeHTML(Utils.truncateText(trial.title || 'Untitled trial', 50))}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">
              Institute ID: ${Utils.sanitizeHTML(instituteId)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">
              NCTID: ${Utils.sanitizeHTML(trial.nctId || 'Not specified')}
            </div>
          </td>
          <td>
            <span class="table-status ${statusConfig.className}">
              ${statusConfig.label}
            </span>
          </td>
          <td>
            <div style="font-weight: 500; color: var(--text-primary);">
              ${Utils.sanitizeHTML(institutionName)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">
              PI: ${Utils.sanitizeHTML(piName)}
            </div>
          </td>
          <td>
            ${Utils.formatDate(websiteUpdate)}
          </td>
          <td>
            ${Utils.sanitizeHTML(trial.phase || 'N/A')}
          </td>
          <td>
            <div class="action-buttons">
              <a href="trial-detail.html?id=${trial.id}" 
                 class="action-btn action-btn-view" 
                 title="View Details">
                👁️ View
              </a>
              <button class="action-btn action-btn-edit" 
                      onclick="window.adminPanel.editTrial('${trial.id}')"
                      title="Edit Trial">
                ✏️ Edit
              </button>
              <button class="action-btn action-btn-delete" 
                      onclick="window.adminPanel.showDeleteModal('${trial.id}')"
                      title="Delete Trial">
                🗑️ Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Show trial modal for adding or editing
   */
  showTrialModal(trial = null) {
    const modal = document.getElementById('trialModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('trialForm');

    this.isEditing = !!trial;
    this.currentTrialId = trial ? trial.id : null;

    if (this.isEditing) {
      modalTitle.textContent = 'Edit Trial';
      this.populateForm(trial);
      this.clearFormValidation();
    } else {
      modalTitle.textContent = 'Add New Trial';
      form.reset();
      this.clearFormValidation();
    }

    this.restoreTrialDraft();
    this.updateDraftStatus();

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Focus first input
    setTimeout(() => {
      document.getElementById('trialTitle')?.focus();
    }, 100);
  }

  /**
   * Hide trial modal
   */
  hideTrialModal() {
    const modal = document.getElementById('trialModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  /**
   * Populate form with trial data
   */
  populateForm(trial) {
    document.getElementById('trialTitle').value = trial.title || '';
    document.getElementById('trialNctId').value = trial.nctId || '';
    document.getElementById('trialStatus').value = Utils.normalizeStatus(trial.status) || '';
    document.getElementById('trialHospital').value = trial.location?.hospital || '';
    document.getElementById('trialInstituteId').value = trial.instituteId || trial.id || '';
    document.getElementById('trialPiName').value = trial.piName || '';
    document.getElementById('trialContactEmail').value = trial.contactEmail || '';
    document.getElementById('trialStartDate').value = Utils.formatDateForInput(trial.startDate);
    document.getElementById('trialLastWebsiteUpdate').value = Utils.formatDateForInput(Utils.getDisplayWebsiteUpdate(trial));
    document.getElementById('trialStudyType').value = trial.studyType || '';
    document.getElementById('trialPhase').value = trial.phase || '';
    document.getElementById('trialCancerType').value = Utils.normalizeCancerType(trial.cancerType) || '';
    document.getElementById('trialSponsor').value = trial.sponsor || '';
    document.getElementById('trialDescription').value = trial.description || '';
    document.getElementById('trialPrimaryObjective').value = trial.primaryObjective || '';
    document.getElementById('trialSecondaryObjectives').value = 
      Array.isArray(trial.secondaryObjectives) ? trial.secondaryObjectives.join('\n') : '';
    document.getElementById('trialEligibilityCriteria').value = 
      Array.isArray(trial.eligibilityCriteria) ? trial.eligibilityCriteria.join('\n') : '';
  }

  /**
   * Handle trial form submission
   */
  async handleTrialSubmit() {
    if (!this.validateForm()) {
      Utils.showErrorMessage('Please correct the form errors and try again');
      return;
    }

    const formData = this.getFormData();
    
    this.showSaveLoading();

    try {
      let success;
      if (this.isEditing) {
        success = this.trialManager.updateTrial(this.currentTrialId, formData);
      } else {
        success = this.trialManager.addTrial(formData);
      }

      if (success) {
        this.filteredTrials = this.trialManager.getAllTrials();
        this.updateDashboardStats();
        this.renderTrialsTable();
        this.clearTrialDraft();
        document.getElementById('trialForm')?.reset();
        this.clearFormValidation();
        this.currentTrialId = null;
        this.isEditing = false;
        this.updateDraftStatus();
        this.hideTrialModal();
      }
    } catch (error) {
      console.error('Error saving trial:', error);
      Utils.showErrorMessage('Failed to save trial');
    } finally {
      this.hideSaveLoading();
    }
  }

  /**
   * Get form data
   */
  getFormData() {
    const secondaryObjectives = document.getElementById('trialSecondaryObjectives').value
      .split('\n')
      .map(obj => obj.trim())
      .filter(obj => obj.length > 0);

    const eligibilityCriteria = document.getElementById('trialEligibilityCriteria').value
      .split('\n')
      .map(criteria => criteria.trim())
      .filter(criteria => criteria.length > 0);

    return Utils.normalizeTrialForSave({
      title: document.getElementById('trialTitle').value.trim(),
      nctId: document.getElementById('trialNctId').value.trim(),
      status: Utils.normalizeStatus(document.getElementById('trialStatus').value) || 'not_specified',
      description: document.getElementById('trialDescription').value.trim(),
      location: {
        hospital: document.getElementById('trialHospital').value.trim()
      },
      contactEmail: document.getElementById('trialContactEmail').value.trim(),
      startDate: document.getElementById('trialStartDate').value,
      lastWebsiteUpdate: document.getElementById('trialLastWebsiteUpdate').value,
      instituteId: document.getElementById('trialInstituteId').value.trim(),
      piName: document.getElementById('trialPiName').value.trim(),
      studyType: document.getElementById('trialStudyType').value,
      phase: document.getElementById('trialPhase').value,
      cancerType: Utils.normalizeCancerType(document.getElementById('trialCancerType').value) || '',
      sponsor: document.getElementById('trialSponsor').value.trim(),
      primaryObjective: document.getElementById('trialPrimaryObjective').value.trim(),
      secondaryObjectives,
      eligibilityCriteria
    });
  }

  /**
   * Setup form validation
   */
  setupFormValidation() {
    const form = document.getElementById('trialForm');
    if (!form) return;

    const fields = form.querySelectorAll('.form-input, .form-textarea, .form-select');

    fields.forEach(field => {
      field.addEventListener('blur', () => this.validateField(field));
      field.addEventListener('input', () => {
        this.clearFieldError(field);
        this.saveDraftDebounced();
      });
      field.addEventListener('change', () => {
        this.saveDraftDebounced();
      });
    });

    // Email validation
    const emailField = document.getElementById('trialContactEmail');
    if (emailField) {
      emailField.addEventListener('blur', () => this.validateEmail(emailField));
    }

  }

  /**
   * Validate form
   */
  validateForm() {
    let isValid = true;

    // Email validation
    const emailField = document.getElementById('trialContactEmail');
    if (!this.validateEmail(emailField)) {
      isValid = false;
    }

    return isValid;
  }

  /**
   * Validate individual field
   */
  validateField(field) {
    if (!field) return true;

    this.clearFieldError(field);
    return true;
  }

  /**
   * Validate email field
   */
  validateEmail(field) {
    if (!field) return true;
    const value = field.value.trim();
    
    if (!value) {
      this.clearFieldError(field);
      return true;
    }

    if (!Utils.isValidEmail(value)) {
      this.showFieldError(field, 'Please enter a valid email address');
      return false;
    }

    this.clearFieldError(field);
    return true;
  }

  /**
   * Show field error
   */
  showFieldError(field, message) {
    this.clearFieldError(field);
    
    field.classList.add('invalid');
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'form-error';
    errorDiv.textContent = message;
    
    field.parentNode.appendChild(errorDiv);
  }

  /**
   * Clear field error
   */
  clearFieldError(field) {
    if (!field) return;
    field.classList.remove('invalid', 'valid');
    
    const errorDiv = field.parentNode.querySelector('.form-error');
    if (errorDiv) {
      errorDiv.remove();
    }
  }

  /**
   * Clear all form validation
   */
  clearFormValidation() {
    const form = document.getElementById('trialForm');
    if (!form) return;
    const fields = form.querySelectorAll('.form-input, .form-textarea, .form-select');
    const errors = form.querySelectorAll('.form-error');

    fields.forEach(field => {
      field.classList.remove('invalid', 'valid');
    });

    errors.forEach(error => {
      error.remove();
    });
  }

  /**
   * Show save loading state
   */
  showSaveLoading() {
    const btn = document.getElementById('saveTrialBtn');
    const btnText = document.getElementById('saveTrialBtnText');
    const spinner = document.getElementById('saveTrialSpinner');

    btn.disabled = true;
    btnText.style.display = 'none';
    spinner.style.display = 'block';
  }

  /**
   * Hide save loading state
   */
  hideSaveLoading() {
    const btn = document.getElementById('saveTrialBtn');
    const btnText = document.getElementById('saveTrialBtnText');
    const spinner = document.getElementById('saveTrialSpinner');

    btn.disabled = false;
    btnText.style.display = 'block';
    spinner.style.display = 'none';
  }

  /**
   * Edit trial
   */
  editTrial(trialId) {
    const trial = this.trialManager.getTrialById(trialId);
    if (trial) {
      this.showTrialModal(trial);
    } else {
      Utils.showErrorMessage('Trial not found');
    }
  }

  /**
   * Show delete confirmation modal
   */
  showDeleteModal(trialId) {
    const trial = this.trialManager.getTrialById(trialId);
    if (!trial) {
      Utils.showErrorMessage('Trial not found');
      return;
    }

    this.currentTrialId = trialId;
    
    const modal = document.getElementById('deleteModal');
    const titleElement = document.getElementById('deleteTrialTitle');
    
    titleElement.textContent = trial.title;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  /**
   * Hide delete modal
   */
  hideDeleteModal() {
    const modal = document.getElementById('deleteModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    this.currentTrialId = null;
  }

  /**
   * Confirm delete trial
   */
  confirmDelete() {
    if (!this.currentTrialId) return;

    const success = this.trialManager.deleteTrial(this.currentTrialId);
    
    if (success) {
      this.filteredTrials = this.trialManager.getAllTrials();
      this.updateDashboardStats();
      this.renderTrialsTable();
      this.hideDeleteModal();
    }
  }

  /**
   * Export data
   */
  exportData() {
    try {
      const data = this.trialManager.exportTrials();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `clinical-trials-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      Utils.showSuccessMessage('Data exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      Utils.showErrorMessage('Failed to export data');
    }
  }

  exportCsvData() {
    try {
      const rows = this.trialManager.getAllTrials().map(trial => Utils.trialToCsvRow(trial));
      const csvData = Utils.stringifyCsv(rows, Utils.getTrialCsvHeaders());
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `clinical-trials-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
      Utils.showSuccessMessage('CSV exported successfully');
    } catch (error) {
      console.error('CSV export error:', error);
      Utils.showErrorMessage('Failed to export CSV');
    }
  }

  async handleCsvUpload(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = Utils.parseCsv(text);
      const supportedHeaders = new Set(Utils.getTrialCsvHeaders());
      const hasSupportedHeader = parsed.headers.some(header => supportedHeaders.has(header));

      if (!hasSupportedHeader) {
        Utils.showErrorMessage('CSV must include at least one supported trial column');
        return;
      }

      if (parsed.rows.length === 0) {
        Utils.showErrorMessage('CSV file has no data rows');
        return;
      }

      const rows = parsed.rows.map(row => ({
        ...Utils.csvRowToTrial(row),
        _rowNumber: row._rowNumber
      }));

      const result = this.trialManager.replaceTrialsFromCsv(rows);
      if (!result.success) {
        const firstError = Array.isArray(result.errors) && result.errors.length > 0
          ? ` First error: row ${result.errors[0].row}: ${result.errors[0].message}`
          : '';
        Utils.showErrorMessage(`Failed to import CSV: validation failed.${firstError}`, 8000);
        return;
      }

      this.filteredTrials = this.trialManager.getAllTrials();
      this.updateDashboardStats();
      this.renderTrialsTable();

      const imported = result.imported || 0;
      const created = result.created || 0;
      const preserved = result.preserved || 0;
      const removed = result.removed || 0;
      const message = `CSV import complete. Catalog replaced with ${imported} trials. Preserved: ${preserved}, New: ${created}, Removed: ${removed}.`;
      Utils.showSuccessMessage(message, 7000);
    } catch (error) {
      console.error('CSV import error:', error);
      Utils.showErrorMessage(`Failed to import CSV: ${error.message}`);
    } finally {
      if (input) {
        input.value = '';
      }
    }
  }

  saveTrialDraft() {
    const modal = document.getElementById('trialModal');
    if (!modal?.classList.contains('active')) return;

    const draft = {
      mode: this.isEditing ? 'edit' : 'add',
      trialId: this.currentTrialId || null,
      values: this.getFormData(),
      savedAt: new Date().toISOString()
    };

    localStorage.setItem(this.trialDraftKey, JSON.stringify(draft));
    this.updateDraftStatus(`Draft saved ${new Date(draft.savedAt).toLocaleTimeString()}`);
  }

  restoreTrialDraft() {
    const storedDraft = localStorage.getItem(this.trialDraftKey);
    if (!storedDraft) {
      this.updateDraftStatus();
      return false;
    }

    let draft;
    try {
      draft = JSON.parse(storedDraft);
    } catch (error) {
      console.error('Failed to parse trial draft:', error);
      this.clearTrialDraft();
      return false;
    }

    const currentMode = this.isEditing ? 'edit' : 'add';
    const matchesMode = draft.mode === currentMode;
    const matchesTrial = (draft.trialId || null) === (this.currentTrialId || null);
    if (!matchesMode || !matchesTrial) {
      this.updateDraftStatus();
      return false;
    }

    this.applyTrialFormData(draft.values);
    this.clearFormValidation();
    this.updateDraftStatus(`Draft restored from ${new Date(draft.savedAt).toLocaleString()}`);
    return true;
  }

  clearTrialDraft() {
    localStorage.removeItem(this.trialDraftKey);
    this.updateDraftStatus();
  }

  discardTrialDraft() {
    const hasDraft = !!localStorage.getItem(this.trialDraftKey);
    if (!hasDraft) {
      Utils.showErrorMessage('No draft to discard');
      return;
    }

    const confirmed = window.confirm('Discard the saved draft for this form?');
    if (!confirmed) return;

    this.clearTrialDraft();
    this.clearFormValidation();

    if (this.isEditing && this.currentTrialId) {
      const originalTrial = this.trialManager.getTrialById(this.currentTrialId);
      if (originalTrial) {
        this.populateForm(originalTrial);
      }
    } else {
      document.getElementById('trialForm')?.reset();
    }

    this.updateDraftStatus('Draft discarded');
  }

  applyTrialFormData(data = {}) {
    document.getElementById('trialTitle').value = data.title || '';
    document.getElementById('trialNctId').value = data.nctId || '';
    document.getElementById('trialStatus').value = data.status === 'not_specified' ? '' : (data.status || '');
    document.getElementById('trialHospital').value = data.location?.hospital || '';
    document.getElementById('trialInstituteId').value = data.instituteId || data.id || '';
    document.getElementById('trialPiName').value = data.piName || '';
    document.getElementById('trialContactEmail').value = data.contactEmail || '';
    document.getElementById('trialStartDate').value = data.startDate || '';
    document.getElementById('trialLastWebsiteUpdate').value = Utils.formatDateForInput(data.lastWebsiteUpdate || data.lastUpdated);
    document.getElementById('trialStudyType').value = data.studyType || '';
    document.getElementById('trialPhase').value = data.phase || '';
    document.getElementById('trialCancerType').value = data.cancerType || '';
    document.getElementById('trialSponsor').value = data.sponsor || '';
    document.getElementById('trialDescription').value = data.description || '';
    document.getElementById('trialPrimaryObjective').value = data.primaryObjective || '';
    document.getElementById('trialSecondaryObjectives').value = Array.isArray(data.secondaryObjectives)
      ? data.secondaryObjectives.join('\n')
      : '';
    document.getElementById('trialEligibilityCriteria').value = Array.isArray(data.eligibilityCriteria)
      ? data.eligibilityCriteria.join('\n')
      : '';
  }

  updateDraftStatus(message = '') {
    const draftStatusElement = document.getElementById('draftStatusText');
    if (!draftStatusElement) return;

    if (message) {
      draftStatusElement.textContent = message;
      return;
    }

    const storedDraft = localStorage.getItem(this.trialDraftKey);
    if (!storedDraft) {
      draftStatusElement.textContent = '';
      return;
    }

    try {
      const draft = JSON.parse(storedDraft);
      const currentMode = this.isEditing ? 'edit' : 'add';
      const matchesMode = draft.mode === currentMode;
      const matchesTrial = (draft.trialId || null) === (this.currentTrialId || null);
      if (matchesMode && matchesTrial) {
        draftStatusElement.textContent = `Draft available from ${new Date(draft.savedAt).toLocaleString()}`;
      } else {
        draftStatusElement.textContent = '';
      }
    } catch (error) {
      draftStatusElement.textContent = '';
    }
  }
}

// Initialize admin panel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const adminPanel = new AdminPanel();
  adminPanel.init();
  
  // Make admin panel available globally
  window.adminPanel = adminPanel;
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && window.adminPanel) {
    // Check auth when page becomes visible
    if (!window.adminPanel.checkAuth()) {
      window.location.href = 'admin-login.html';
    }
  }
});

// Export for other modules
window.AdminPanel = AdminPanel;
