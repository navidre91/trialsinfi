/**
 * Admin Dashboard - session-backed PHP version
 */
class AdminPanel {
  constructor() {
    this.trialManager = new TrialManager();
    this.currentTrialId = null;
    this.isEditing = false;
    this.filteredTrials = [];
    this.physicians = [];
    this.moderationThreads = [];
    this.session = null;
    this.trialDraftKey = 'trialFormDraftV2';
    this.saveDraftDebounced = Utils.debounce(() => this.saveTrialDraft(), 250);
  }

  async init() {
    await this.requireAdminSession();
    this.bindEventListeners();
    this.setupFormValidation();

    await Promise.all([
      this.loadTrials(),
      this.loadPhysicians(),
      this.loadModerationThreads()
    ]);
  }

  async requireAdminSession() {
    const response = await fetch('api/auth.php?action=session', {
      method: 'GET',
      credentials: 'same-origin'
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.authenticated || data.user?.role !== 'admin') {
      window.location.href = 'admin-login-php.html';
      return;
    }

    this.session = {
      user: data.user,
      csrfToken: data.csrfToken || ''
    };
    this.trialManager.setCsrfToken(this.session.csrfToken);

    const welcomeElement = document.getElementById('adminWelcome');
    if (welcomeElement) {
      welcomeElement.textContent = `Admin: ${this.session.user.username}`;
    }
  }

  async requestJson(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({
      success: false,
      message: 'Invalid server response.'
    }));

    if (!response.ok || data.success === false) {
      if (response.status === 401) {
        window.location.href = 'admin-login-php.html';
      }

      const error = new Error(data.message || `HTTP error ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  getCsrfHeaders() {
    return {
      'X-CSRF-Token': this.session?.csrfToken || ''
    };
  }

  async loadTrials() {
    try {
      await this.trialManager.loadTrials();
      this.filteredTrials = this.trialManager.getAllTrials();
      this.updateDashboardStats();
      this.renderTrialsTable();
    } catch (error) {
      console.error('Failed to load trials:', error);
      Utils.showErrorMessage('Failed to load clinical trials');
    }
  }

  async loadPhysicians() {
    try {
      const data = await this.requestJson('api/physicians.php', {
        method: 'GET'
      });
      this.physicians = Array.isArray(data.physicians) ? data.physicians : [];
      this.renderPhysiciansTable();
    } catch (error) {
      console.error('Failed to load physicians:', error);
      this.renderPhysiciansTable(error.message);
    }
  }

  async loadModerationThreads() {
    try {
      const data = await this.requestJson('api/community.php?moderation=1', {
        method: 'GET'
      });
      this.moderationThreads = Array.isArray(data.threads) ? data.threads : [];
      this.renderModerationThreads();
    } catch (error) {
      console.error('Failed to load moderation queue:', error);
      this.renderModerationThreads(error.message);
    }
  }

  bindEventListeners() {
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      this.logout();
    });

    document.getElementById('addTrialBtn')?.addEventListener('click', () => {
      this.showTrialModal();
    });

    document.getElementById('changePasswordBtn')?.addEventListener('click', () => {
      this.showChangePasswordModal();
    });

    document.getElementById('exportDataBtn')?.addEventListener('click', () => {
      this.exportData();
    });

    document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
      this.exportCsvData();
    });

    document.getElementById('uploadCsvBtn')?.addEventListener('click', () => {
      document.getElementById('csvUploadInput')?.click();
    });

    document.getElementById('csvUploadInput')?.addEventListener('change', async event => {
      await this.handleCsvUpload(event);
    });

    document.getElementById('adminSearchInput')?.addEventListener('input', Utils.debounce(() => {
      this.filterTrials();
    }, 250));

    document.getElementById('adminStatusFilter')?.addEventListener('change', () => {
      this.filterTrials();
    });

    document.getElementById('trialsTableBody')?.addEventListener('click', event => {
      const button = event.target.closest('[data-trial-action]');
      if (!button) return;

      const action = button.dataset.trialAction;
      const trialId = button.dataset.trialId;
      if (!trialId) return;

      if (action === 'edit') {
        this.editTrial(trialId);
      }

      if (action === 'delete') {
        this.showDeleteModal(trialId);
      }
    });

    document.getElementById('trialForm')?.addEventListener('submit', event => {
      event.preventDefault();
      this.handleTrialSubmit();
    });

    document.getElementById('trialForm')?.addEventListener('input', () => {
      this.saveDraftDebounced();
    });

    document.getElementById('closeModal')?.addEventListener('click', () => {
      this.hideTrialModal();
    });

    document.getElementById('cancelBtn')?.addEventListener('click', () => {
      this.hideTrialModal();
    });

    document.getElementById('discardDraftBtn')?.addEventListener('click', () => {
      this.discardTrialDraft();
    });

    document.getElementById('trialModal')?.addEventListener('click', event => {
      if (event.target === document.getElementById('trialModal')) {
        event.preventDefault();
      }
    });

    document.getElementById('closeDeleteModal')?.addEventListener('click', () => {
      this.hideDeleteModal();
    });

    document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => {
      this.hideDeleteModal();
    });

    document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => {
      this.confirmDelete();
    });

    document.getElementById('deleteModal')?.addEventListener('click', event => {
      if (event.target === document.getElementById('deleteModal')) {
        this.hideDeleteModal();
      }
    });

    document.getElementById('physicianCreateForm')?.addEventListener('submit', event => {
      event.preventDefault();
      this.handleCreatePhysician();
    });

    document.getElementById('physiciansTableBody')?.addEventListener('click', event => {
      const button = event.target.closest('[data-physician-action]');
      if (!button) return;

      const action = button.dataset.physicianAction;
      const physicianId = button.dataset.physicianId;
      if (!action || !physicianId) return;

      if (action === 'reset-password') {
        this.resetPhysicianPassword(physicianId);
      }

      if (action === 'activate' || action === 'deactivate') {
        this.togglePhysicianState(physicianId, action);
      }
    });

    document.getElementById('moderationThreadList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-moderation-action]');
      if (!button) return;

      const action = button.dataset.moderationAction;
      if (action === 'toggle-details') {
        const card = button.closest('.moderation-card');
        const details = card?.querySelector('.moderation-card-details');
        const nextExpanded = !card?.classList.contains('is-expanded');
        card?.classList.toggle('is-expanded');
        if (details) {
          details.style.display = nextExpanded ? 'block' : 'none';
        }
        return;
      }

      if (action === 'lock-thread' || action === 'unlock-thread' || action === 'delete-thread') {
        const threadId = button.dataset.threadId;
        if (threadId) {
          this.moderateThread(action, Number(threadId));
        }
      }

      if (action === 'delete-reply') {
        const replyId = button.dataset.replyId;
        if (replyId) {
          this.deleteReply(Number(replyId));
        }
      }
    });

    document.getElementById('changePasswordForm')?.addEventListener('submit', event => {
      event.preventDefault();
      this.handleChangePassword();
    });

    document.getElementById('closeChangePasswordModal')?.addEventListener('click', () => {
      this.hideChangePasswordModal();
    });

    document.getElementById('cancelChangePasswordBtn')?.addEventListener('click', () => {
      this.hideChangePasswordModal();
    });

    document.getElementById('changePasswordModal')?.addEventListener('click', event => {
      if (event.target === document.getElementById('changePasswordModal')) {
        this.hideChangePasswordModal();
      }
    });
  }

  setupFormValidation() {
    const emailField = document.getElementById('trialContactEmail');
    emailField?.addEventListener('blur', () => {
      this.validateEmail(emailField);
    });
  }

  updateDashboardStats() {
    const stats = this.trialManager.getTrialsStatistics();
    document.getElementById('totalTrials').textContent = stats.total;
    document.getElementById('recruitingTrials').textContent = stats.recruiting;
    document.getElementById('activeNotRecruitingTrials').textContent = stats.active_not_recruiting;
    document.getElementById('completedTrials').textContent = stats.completed;
  }

  filterTrials() {
    const searchQuery = document.getElementById('adminSearchInput')?.value.toLowerCase().trim() || '';
    const statusFilter = document.getElementById('adminStatusFilter')?.value || 'all';
    const normalizedStatusFilter = statusFilter === 'all'
      ? 'all'
      : (Utils.normalizeStatus(statusFilter) || statusFilter);

    this.filteredTrials = this.trialManager.getAllTrials().filter(trial => {
      const haystack = [
        trial.title,
        trial.location?.hospital || '',
        trial.location?.city || '',
        trial.piName || '',
        trial.instituteId || '',
        trial.cancerType || ''
      ].join(' ').toLowerCase();

      const trialStatus = Utils.normalizeStatus(trial.status) || 'not_specified';
      const statusMatches = normalizedStatusFilter === 'all' || trialStatus === normalizedStatusFilter;
      const searchMatches = !searchQuery || haystack.includes(searchQuery);

      return statusMatches && searchMatches;
    });

    this.renderTrialsTable();
  }

  renderTrialsTable() {
    const tableBody = document.getElementById('trialsTableBody');
    if (!tableBody) return;

    if (!this.filteredTrials.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 1rem; color: var(--text-secondary);">No clinical trials match the current filters.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = this.filteredTrials.map(trial => {
      const status = Utils.getStatusConfig(trial.status);
      const hospital = Utils.sanitizeHTML(trial.location?.hospital || 'Not specified');
      const lastUpdated = Utils.sanitizeHTML(Utils.formatDate(trial.lastWebsiteUpdate || trial.lastUpdated));
      const phase = Utils.sanitizeHTML(trial.phase || 'Not specified');
      const title = Utils.sanitizeHTML(trial.title || 'Untitled trial');
      const trialId = Utils.sanitizeHTML(trial.id);

      return `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 1rem; vertical-align: top;">
            <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem;">${title}</div>
            <div style="color: var(--text-secondary); font-size: 0.75rem;">${Utils.sanitizeHTML(trial.cancerType || 'Unspecified')}</div>
          </td>
          <td style="padding: 1rem; vertical-align: top;">
            <span class="table-status ${status.className}">${Utils.sanitizeHTML(status.label)}</span>
          </td>
          <td style="padding: 1rem; vertical-align: top;">${hospital}</td>
          <td style="padding: 1rem; vertical-align: top;">${lastUpdated}</td>
          <td style="padding: 1rem; vertical-align: top;">${phase}</td>
          <td style="padding: 1rem; vertical-align: top; text-align: center;">
            <div style="display: inline-flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center;">
              <button type="button" class="btn btn-secondary" data-trial-action="edit" data-trial-id="${trialId}">Edit</button>
              <button type="button" class="btn btn-danger" data-trial-action="delete" data-trial-id="${trialId}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  showTrialModal(trial = null) {
    const modal = document.getElementById('trialModal');
    const titleElement = document.getElementById('modalTitle');
    const form = document.getElementById('trialForm');

    this.isEditing = Boolean(trial);
    this.currentTrialId = trial?.id || null;

    titleElement.textContent = this.isEditing ? 'Edit Trial' : 'Add New Trial';
    form.reset();
    this.clearFormValidation();

    if (trial) {
      this.populateForm(trial);
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (!this.restoreTrialDraft()) {
      this.updateDraftStatus();
    }
  }

  hideTrialModal() {
    document.getElementById('trialModal')?.classList.remove('active');
    document.body.style.overflow = '';
    document.getElementById('trialForm')?.reset();
    this.clearFormValidation();
    this.currentTrialId = null;
    this.isEditing = false;
    this.updateDraftStatus();
  }

  populateForm(trial) {
    document.getElementById('trialTitle').value = trial.title || '';
    document.getElementById('trialNctId').value = trial.nctId || '';
    document.getElementById('trialStatus').value = trial.status === 'not_specified' ? '' : (trial.status || '');
    document.getElementById('trialHospital').value = trial.location?.hospital || '';
    document.getElementById('trialInstituteId').value = trial.instituteId || trial.id || '';
    document.getElementById('trialPiName').value = trial.piName || '';
    document.getElementById('trialContactEmail').value = trial.contactEmail || '';
    document.getElementById('trialStartDate').value = trial.startDate || '';
    document.getElementById('trialLastWebsiteUpdate').value = Utils.formatDateForInput(trial.lastWebsiteUpdate || trial.lastUpdated);
    document.getElementById('trialStudyType').value = trial.studyType || '';
    document.getElementById('trialPhase').value = trial.phase || '';
    document.getElementById('trialCancerType').value = trial.cancerType || '';
    document.getElementById('trialSponsor').value = trial.sponsor || '';
    document.getElementById('trialDescription').value = trial.description || '';
    document.getElementById('trialPrimaryObjective').value = trial.primaryObjective || '';
    document.getElementById('trialSecondaryObjectives').value = Array.isArray(trial.secondaryObjectives)
      ? trial.secondaryObjectives.join('\n')
      : '';
    document.getElementById('trialEligibilityCriteria').value = Array.isArray(trial.eligibilityCriteria)
      ? trial.eligibilityCriteria.join('\n')
      : '';
  }

  getFormData() {
    return Utils.normalizeTrialForSave({
      id: this.currentTrialId || undefined,
      nctId: document.getElementById('trialNctId').value.trim(),
      title: document.getElementById('trialTitle').value.trim(),
      status: document.getElementById('trialStatus').value || '',
      description: document.getElementById('trialDescription').value.trim(),
      location: {
        hospital: document.getElementById('trialHospital').value.trim()
      },
      contactEmail: document.getElementById('trialContactEmail').value.trim(),
      startDate: document.getElementById('trialStartDate').value || '',
      studyType: document.getElementById('trialStudyType').value || '',
      phase: document.getElementById('trialPhase').value || '',
      cancerType: document.getElementById('trialCancerType').value || '',
      sponsor: document.getElementById('trialSponsor').value.trim(),
      lastWebsiteUpdate: document.getElementById('trialLastWebsiteUpdate').value || '',
      instituteId: document.getElementById('trialInstituteId').value.trim(),
      piName: document.getElementById('trialPiName').value.trim(),
      primaryObjective: document.getElementById('trialPrimaryObjective').value.trim(),
      secondaryObjectives: document.getElementById('trialSecondaryObjectives').value
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean),
      eligibilityCriteria: document.getElementById('trialEligibilityCriteria').value
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean)
    });
  }

  validateEmail(field) {
    if (!field) return true;

    if (!field.value.trim()) {
      this.clearFieldError(field);
      return true;
    }

    if (!Utils.isValidEmail(field.value.trim())) {
      this.showFieldError(field, 'Please enter a valid email address');
      return false;
    }

    this.clearFieldError(field);
    return true;
  }

  validateForm() {
    const emailField = document.getElementById('trialContactEmail');
    return this.validateEmail(emailField);
  }

  showFieldError(field, message) {
    if (!field) return;

    field.classList.add('error');
    let errorElement = field.parentElement.querySelector('.field-error');
    if (!errorElement) {
      errorElement = document.createElement('div');
      errorElement.className = 'field-error';
      errorElement.style.color = 'var(--error-color)';
      errorElement.style.fontSize = '0.75rem';
      errorElement.style.marginTop = '0.25rem';
      field.parentElement.appendChild(errorElement);
    }
    errorElement.textContent = message;
  }

  clearFieldError(field) {
    if (!field) return;
    field.classList.remove('error');
    const errorElement = field.parentElement.querySelector('.field-error');
    if (errorElement) {
      errorElement.remove();
    }
  }

  clearFormValidation() {
    document.querySelectorAll('#trialForm .field-error').forEach(element => element.remove());
    document.querySelectorAll('#trialForm .error').forEach(element => element.classList.remove('error'));
  }

  setButtonLoading(buttonId, textId, spinnerId, isLoading, loadingText) {
    const button = document.getElementById(buttonId);
    const text = document.getElementById(textId);
    const spinner = document.getElementById(spinnerId);
    if (!button || !text || !spinner) return;

    button.disabled = isLoading;
    spinner.style.display = isLoading ? 'block' : 'none';
    text.style.display = isLoading ? 'none' : 'inline';
    if (!isLoading && loadingText) {
      text.textContent = loadingText;
    }
  }

  async handleTrialSubmit() {
    if (!this.validateForm()) {
      Utils.showErrorMessage('Please correct the form errors and try again');
      return;
    }

    const formData = this.getFormData();
    this.setButtonLoading('saveTrialBtn', 'saveTrialBtnText', 'saveTrialSpinner', true);

    try {
      if (this.isEditing && this.currentTrialId) {
        await this.trialManager.updateTrial(this.currentTrialId, formData);
        Utils.showSuccessMessage('Trial updated successfully');
      } else {
        await this.trialManager.addTrial(formData);
        Utils.showSuccessMessage('Trial created successfully');
      }

      this.filteredTrials = this.trialManager.getAllTrials();
      this.updateDashboardStats();
      this.renderTrialsTable();
      this.clearTrialDraft();
      this.hideTrialModal();
    } catch (error) {
      console.error('Failed saving trial:', error);
      Utils.showErrorMessage(error.message || 'Failed to save trial');
    } finally {
      this.setButtonLoading('saveTrialBtn', 'saveTrialBtnText', 'saveTrialSpinner', false);
    }
  }

  editTrial(trialId) {
    const trial = this.trialManager.getTrialById(trialId);
    if (!trial) {
      Utils.showErrorMessage('Trial not found');
      return;
    }

    this.showTrialModal(trial);
  }

  showDeleteModal(trialId) {
    const trial = this.trialManager.getTrialById(trialId);
    if (!trial) {
      Utils.showErrorMessage('Trial not found');
      return;
    }

    this.currentTrialId = trialId;
    document.getElementById('deleteTrialTitle').textContent = trial.title || 'Untitled trial';
    document.getElementById('deleteModal')?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  hideDeleteModal() {
    document.getElementById('deleteModal')?.classList.remove('active');
    document.body.style.overflow = '';
    this.currentTrialId = null;
  }

  async confirmDelete() {
    if (!this.currentTrialId) return;

    const deleteButton = document.getElementById('confirmDeleteBtn');
    deleteButton.disabled = true;

    try {
      await this.trialManager.deleteTrial(this.currentTrialId);
      this.filteredTrials = this.trialManager.getAllTrials();
      this.updateDashboardStats();
      this.renderTrialsTable();
      this.hideDeleteModal();
      Utils.showSuccessMessage('Trial deleted successfully');
    } catch (error) {
      console.error('Delete failed:', error);
      Utils.showErrorMessage(error.message || 'Failed to delete trial');
    } finally {
      deleteButton.disabled = false;
    }
  }

  exportData() {
    try {
      const data = this.trialManager.exportTrials();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `clinical-trials-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      Utils.showSuccessMessage('JSON exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      Utils.showErrorMessage('Failed to export JSON');
    }
  }

  exportCsvData() {
    try {
      const rows = this.trialManager.getAllTrials().map(trial => Utils.trialToCsvRow(trial));
      const csv = Utils.stringifyCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
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

      const result = await this.trialManager.replaceTrialsFromCsv(rows);
      this.filteredTrials = this.trialManager.getAllTrials();
      this.updateDashboardStats();
      this.renderTrialsTable();

      const imported = result.imported || 0;
      const created = result.created || 0;
      const preserved = result.preserved || 0;
      const removed = result.removed || 0;
      const deletedForumThreads = result.deletedForumThreads || 0;
      const deletedForumReplies = result.deletedForumReplies || 0;
      let message = `CSV import complete. Catalog replaced with ${imported} trials. Preserved: ${preserved}, New: ${created}, Removed: ${removed}.`;

      if (deletedForumThreads > 0 || deletedForumReplies > 0) {
        message += ` Deleted forum threads: ${deletedForumThreads}, replies: ${deletedForumReplies}.`;
      }

      Utils.showSuccessMessage(message, 7000);
    } catch (error) {
      console.error('CSV import error:', error);
      const firstError = Array.isArray(error?.data?.errors) && error.data.errors.length > 0
        ? ` First error: row ${error.data.errors[0].row || '?'}: ${error.data.errors[0].message}`
        : '';
      Utils.showErrorMessage(`Failed to import CSV: ${error.message}${firstError}`, 8000);
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
      return false;
    }

    try {
      const draft = JSON.parse(storedDraft);
      const matchesMode = draft.mode === (this.isEditing ? 'edit' : 'add');
      const matchesTrial = (draft.trialId || null) === (this.currentTrialId || null);
      if (!matchesMode || !matchesTrial) {
        return false;
      }

      this.populateForm(draft.values || {});
      this.updateDraftStatus(`Draft restored from ${new Date(draft.savedAt).toLocaleString()}`);
      return true;
    } catch (error) {
      console.error('Failed to restore trial draft:', error);
      this.clearTrialDraft();
      return false;
    }
  }

  clearTrialDraft() {
    localStorage.removeItem(this.trialDraftKey);
    this.updateDraftStatus('');
  }

  discardTrialDraft() {
    if (!localStorage.getItem(this.trialDraftKey)) {
      Utils.showErrorMessage('No draft to discard');
      return;
    }

    if (!window.confirm('Discard the saved draft for this form?')) {
      return;
    }

    this.clearTrialDraft();
    document.getElementById('trialForm')?.reset();
    if (this.isEditing && this.currentTrialId) {
      const originalTrial = this.trialManager.getTrialById(this.currentTrialId);
      if (originalTrial) {
        this.populateForm(originalTrial);
      }
    }
  }

  updateDraftStatus(message = '') {
    const element = document.getElementById('draftStatusText');
    if (!element) return;

    if (message) {
      element.textContent = message;
      return;
    }

    const storedDraft = localStorage.getItem(this.trialDraftKey);
    if (!storedDraft) {
      element.textContent = '';
      return;
    }

    try {
      const draft = JSON.parse(storedDraft);
      element.textContent = `Draft available from ${new Date(draft.savedAt).toLocaleString()}`;
    } catch (error) {
      element.textContent = '';
    }
  }

  renderPhysiciansTable(errorMessage = '') {
    const tableBody = document.getElementById('physiciansTableBody');
    if (!tableBody) return;

    if (errorMessage) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 1rem; color: var(--error-color);">${Utils.sanitizeHTML(errorMessage)}</td>
        </tr>
      `;
      return;
    }

    if (!this.physicians.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 1rem; color: var(--text-secondary);">No physician accounts have been created yet.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = this.physicians.map(physician => {
      const statusLabel = physician.isActive ? 'Active' : 'Inactive';
      const actionLabel = physician.isActive ? 'Deactivate' : 'Activate';
      const action = physician.isActive ? 'deactivate' : 'activate';
      const credentials = physician.credentials ? `, ${Utils.sanitizeHTML(physician.credentials)}` : '';
      const mustChange = physician.mustChangePassword ? '<div style="font-size: 0.75rem; color: var(--warning-color);">Password reset pending</div>' : '';

      return `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 1rem; vertical-align: top;">
            <div style="font-weight: 600; color: var(--text-primary);">${Utils.sanitizeHTML(physician.fullName)}${credentials}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">ID: ${Utils.sanitizeHTML(physician.physicianId)}</div>
          </td>
          <td style="padding: 1rem; vertical-align: top;">
            <div style="font-weight: 500; color: var(--text-primary);">${Utils.sanitizeHTML(physician.username)}</div>
            ${mustChange}
          </td>
          <td style="padding: 1rem; vertical-align: top;">${statusLabel}</td>
          <td style="padding: 1rem; vertical-align: top;">${physician.lastLoginAt ? Utils.sanitizeHTML(new Date(physician.lastLoginAt).toLocaleString()) : 'Never'}</td>
          <td style="padding: 1rem; vertical-align: top; text-align: center;">
            <div style="display: inline-flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center;">
              <button type="button" class="btn btn-secondary" data-physician-action="reset-password" data-physician-id="${Utils.sanitizeHTML(physician.physicianId)}">Reset Password</button>
              <button type="button" class="btn btn-secondary" data-physician-action="${action}" data-physician-id="${Utils.sanitizeHTML(physician.physicianId)}">${actionLabel}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async handleCreatePhysician() {
    const physicianId = document.getElementById('physicianIdInput')?.value.trim() || '';
    const fullName = document.getElementById('physicianFullNameInput')?.value.trim() || '';
    const credentials = document.getElementById('physicianCredentialsInput')?.value.trim() || '';
    const username = document.getElementById('physicianUsernameInput')?.value.trim() || '';
    const temporaryPassword = document.getElementById('physicianTempPasswordInput')?.value || '';

    if (!physicianId || !fullName || !username || !temporaryPassword) {
      Utils.showErrorMessage('Physician ID, full name, username, and temporary password are required');
      return;
    }

    const button = document.getElementById('createPhysicianBtn');
    button.disabled = true;

    try {
      const data = await this.requestJson('api/physicians.php', {
        method: 'POST',
        headers: this.getCsrfHeaders(),
        body: JSON.stringify({
          physician_id: physicianId,
          full_name: fullName,
          credentials,
          username,
          temporary_password: temporaryPassword
        })
      });

      this.physicians = Array.isArray(data.physicians) ? data.physicians : [];
      this.renderPhysiciansTable();
      document.getElementById('physicianCreateForm')?.reset();
      Utils.showSuccessMessage('Physician account created successfully');
    } catch (error) {
      console.error('Failed to create physician:', error);
      Utils.showErrorMessage(error.message || 'Failed to create physician');
    } finally {
      button.disabled = false;
    }
  }

  async resetPhysicianPassword(physicianId) {
    const temporaryPassword = window.prompt(`Enter a new temporary password for ${physicianId}:`);
    if (!temporaryPassword) return;

    try {
      const data = await this.requestJson('api/physicians.php', {
        method: 'PUT',
        headers: this.getCsrfHeaders(),
        body: JSON.stringify({
          action: 'reset_password',
          physician_id: physicianId,
          temporary_password: temporaryPassword
        })
      });

      this.physicians = Array.isArray(data.physicians) ? data.physicians : [];
      this.renderPhysiciansTable();
      Utils.showSuccessMessage('Temporary password reset successfully');
    } catch (error) {
      console.error('Failed to reset physician password:', error);
      Utils.showErrorMessage(error.message || 'Failed to reset password');
    }
  }

  async togglePhysicianState(physicianId, action) {
    const verb = action === 'activate' ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${verb} ${physicianId}?`)) {
      return;
    }

    try {
      const data = await this.requestJson('api/physicians.php', {
        method: 'PUT',
        headers: this.getCsrfHeaders(),
        body: JSON.stringify({
          action,
          physician_id: physicianId
        })
      });

      this.physicians = Array.isArray(data.physicians) ? data.physicians : [];
      this.renderPhysiciansTable();
      Utils.showSuccessMessage(`Physician ${verb}d successfully`);
    } catch (error) {
      console.error(`Failed to ${verb} physician:`, error);
      Utils.showErrorMessage(error.message || `Failed to ${verb} physician`);
    }
  }

  renderModerationThreads(errorMessage = '') {
    const container = document.getElementById('moderationThreadList');
    if (!container) return;

    if (errorMessage) {
      container.innerHTML = `<p style="color: var(--error-color); margin: 0;">${Utils.sanitizeHTML(errorMessage)}</p>`;
      return;
    }

    if (!this.moderationThreads.length) {
      container.innerHTML = '<p style="color: var(--text-secondary); margin: 0;">No discussion activity yet.</p>';
      return;
    }

    container.innerHTML = this.moderationThreads.map(thread => {
      const statusParts = [];
      if (thread.isDeleted) statusParts.push('Deleted');
      if (thread.isLocked) statusParts.push('Locked');
      if (!statusParts.length) statusParts.push('Active');

      const repliesHtml = Array.isArray(thread.replies) && thread.replies.length
        ? thread.replies.map(reply => `
            <div style="border-top: 1px solid var(--border-color); padding-top: 0.75rem; margin-top: 0.75rem;">
              <div style="display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap;">
                <div>
                  <div style="font-weight: 600; color: var(--text-primary);">${Utils.sanitizeHTML(reply.author.displayName)}</div>
                  <div style="font-size: 0.75rem; color: var(--text-secondary);">${reply.createdAt ? Utils.sanitizeHTML(new Date(reply.createdAt).toLocaleString()) : 'Unknown time'}${reply.deletedAt ? ' | Deleted' : ''}</div>
                </div>
                ${reply.deletedAt ? '' : `<button type="button" class="btn btn-danger" data-moderation-action="delete-reply" data-reply-id="${reply.id}">Delete Reply</button>`}
              </div>
              <p style="margin: 0.5rem 0 0; color: var(--text-secondary);">${Utils.sanitizeHTML(reply.body)}</p>
            </div>
          `).join('')
        : '<p style="margin: 0.75rem 0 0; color: var(--text-secondary);">No replies.</p>';

      return `
        <article class="moderation-card" style="border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 1rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap;">
            <div style="flex: 1 1 320px;">
              <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.08em; margin-bottom: 0.5rem;">${Utils.sanitizeHTML(thread.diseaseGroup)} | ${Utils.sanitizeHTML(thread.trialTitle || 'Unknown trial')}</div>
              <h4 style="margin: 0 0 0.5rem; color: var(--text-primary);">${Utils.sanitizeHTML(thread.title)}</h4>
              <p style="margin: 0 0 0.5rem; color: var(--text-secondary);">${Utils.sanitizeHTML(thread.body)}</p>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">
                ${Utils.sanitizeHTML(thread.author.displayName)} | ${thread.createdAt ? Utils.sanitizeHTML(new Date(thread.createdAt).toLocaleString()) : 'Unknown time'} | ${thread.replyCount} repl${thread.replyCount === 1 ? 'y' : 'ies'} | ${statusParts.join(', ')}
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" data-moderation-action="toggle-details">Toggle Replies</button>
              ${thread.isDeleted ? '' : thread.isLocked
                ? `<button type="button" class="btn btn-secondary" data-moderation-action="unlock-thread" data-thread-id="${thread.id}">Unlock</button>`
                : `<button type="button" class="btn btn-secondary" data-moderation-action="lock-thread" data-thread-id="${thread.id}">Lock</button>`}
              ${thread.isDeleted ? '' : `<button type="button" class="btn btn-danger" data-moderation-action="delete-thread" data-thread-id="${thread.id}">Delete Thread</button>`}
            </div>
          </div>
          <div class="moderation-card-details" style="margin-top: 1rem; display: none;">
            ${repliesHtml}
          </div>
        </article>
      `;
    }).join('');

    container.querySelectorAll('.moderation-card.is-expanded .moderation-card-details').forEach(element => {
      element.style.display = 'block';
    });
    container.querySelectorAll('.moderation-card:not(.is-expanded) .moderation-card-details').forEach(element => {
      element.style.display = 'none';
    });
  }

  async moderateThread(action, threadId) {
    const isDelete = action === 'delete-thread';
    const isLock = action === 'lock-thread';
    const confirmMessage = isDelete
      ? 'Soft-delete this thread? Replies will no longer appear to physicians.'
      : isLock
        ? 'Lock this thread so physicians can no longer reply or edit?'
        : 'Unlock this thread?';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    const apiAction = {
      'lock-thread': 'lock_thread',
      'unlock-thread': 'unlock_thread',
      'delete-thread': 'delete_thread'
    }[action];

    try {
      await this.requestJson('api/community.php', {
        method: 'PUT',
        headers: this.getCsrfHeaders(),
        body: JSON.stringify({
          action: apiAction,
          thread_id: threadId
        })
      });

      await this.loadModerationThreads();
      Utils.showSuccessMessage('Moderation action applied successfully');
    } catch (error) {
      console.error('Moderation action failed:', error);
      Utils.showErrorMessage(error.message || 'Failed to update thread moderation');
    }
  }

  async deleteReply(replyId) {
    if (!window.confirm('Soft-delete this reply?')) {
      return;
    }

    try {
      await this.requestJson('api/community.php', {
        method: 'PUT',
        headers: this.getCsrfHeaders(),
        body: JSON.stringify({
          action: 'delete_reply',
          reply_id: replyId
        })
      });

      await this.loadModerationThreads();
      Utils.showSuccessMessage('Reply deleted successfully');
    } catch (error) {
      console.error('Reply deletion failed:', error);
      Utils.showErrorMessage(error.message || 'Failed to delete reply');
    }
  }

  showChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    document.getElementById('changePasswordForm')?.reset();
    document.getElementById('newUsername').value = this.session?.user?.username || '';
    this.clearPasswordFormValidation();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  hideChangePasswordModal() {
    document.getElementById('changePasswordModal')?.classList.remove('active');
    document.body.style.overflow = '';
    document.getElementById('changePasswordForm')?.reset();
    this.clearPasswordFormValidation();
  }

  validatePasswordForm() {
    const fields = [
      document.getElementById('currentPassword'),
      document.getElementById('newUsername'),
      document.getElementById('newPassword'),
      document.getElementById('confirmNewPassword')
    ];

    fields.forEach(field => this.clearPasswordFieldError(field));

    let valid = true;
    fields.forEach(field => {
      if (!field?.value.trim()) {
        this.showPasswordFieldError(field, 'This field is required');
        valid = false;
      }
    });

    const newPassword = document.getElementById('newPassword')?.value || '';
    const confirm = document.getElementById('confirmNewPassword')?.value || '';
    if (newPassword && confirm && newPassword !== confirm) {
      this.showPasswordFieldError(document.getElementById('confirmNewPassword'), 'Passwords do not match');
      valid = false;
    }

    return valid;
  }

  showPasswordFieldError(field, message) {
    if (!field) return;
    field.classList.add('error');
    let errorElement = field.parentElement.querySelector('.field-error');
    if (!errorElement) {
      errorElement = document.createElement('div');
      errorElement.className = 'field-error';
      errorElement.style.color = 'var(--error-color)';
      errorElement.style.fontSize = '0.75rem';
      errorElement.style.marginTop = '0.25rem';
      field.parentElement.appendChild(errorElement);
    }
    errorElement.textContent = message;
  }

  clearPasswordFieldError(field) {
    if (!field) return;
    field.classList.remove('error');
    const errorElement = field.parentElement.querySelector('.field-error');
    if (errorElement) {
      errorElement.remove();
    }
  }

  clearPasswordFormValidation() {
    document.querySelectorAll('#changePasswordForm .field-error').forEach(element => element.remove());
    document.querySelectorAll('#changePasswordForm .error').forEach(element => element.classList.remove('error'));
  }

  async handleChangePassword() {
    if (!this.validatePasswordForm()) {
      Utils.showErrorMessage('Please correct the form errors and try again');
      return;
    }

    this.setButtonLoading('savePasswordBtn', 'savePasswordBtnText', 'savePasswordSpinner', true);

    try {
      const data = await this.requestJson('api/auth.php?action=change_password', {
        method: 'POST',
        headers: this.getCsrfHeaders(),
        body: JSON.stringify({
          current_password: document.getElementById('currentPassword').value,
          new_username: document.getElementById('newUsername').value.trim(),
          new_password: document.getElementById('newPassword').value,
          confirm_password: document.getElementById('confirmNewPassword').value
        })
      });

      this.session = {
        user: data.user,
        csrfToken: data.csrfToken || this.session?.csrfToken || ''
      };
      this.trialManager.setCsrfToken(this.session.csrfToken);
      document.getElementById('adminWelcome').textContent = `Admin: ${this.session.user.username}`;
      this.hideChangePasswordModal();
      Utils.showSuccessMessage('Admin credentials updated successfully');
    } catch (error) {
      console.error('Change password failed:', error);
      Utils.showErrorMessage(error.message || 'Failed to update admin credentials');
    } finally {
      this.setButtonLoading('savePasswordBtn', 'savePasswordBtnText', 'savePasswordSpinner', false);
    }
  }

  async logout() {
    try {
      await this.requestJson('api/auth.php?action=logout', {
        method: 'POST',
        headers: this.getCsrfHeaders(),
        body: JSON.stringify({})
      });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      window.location.href = 'admin-login-php.html';
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const adminPanel = new AdminPanel();

  try {
    await adminPanel.init();
  } catch (error) {
    console.error('Failed to initialize admin panel:', error);
    Utils.showErrorMessage(error.message || 'Failed to initialize admin dashboard');
  }
});
