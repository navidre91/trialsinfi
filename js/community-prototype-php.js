class PhysicianCommunityApp {
  constructor() {
    this.authUrl = 'api/auth.php';
    this.communityUrl = 'api/community.php';
    this.session = null;
    this.groups = [];
    this.selectedGroup = null;
    this.selectedTrialId = null;
    this.selectedTrial = null;
    this.threads = [];
    this.sortBy = 'recent';
    this.replyComposerThreadId = null;
    this.editingThreadId = null;
    this.editingReplyId = null;
  }

  async init() {
    await this.requirePhysicianSession();
    this.cacheElements();
    this.bindEvents();
    await this.loadBootstrap();
  }

  cacheElements() {
    this.elements = {
      identity: document.getElementById('communityIdentity'),
      groupList: document.getElementById('communityGroupList'),
      selectedGroupLabel: document.getElementById('communitySelectedGroupLabel'),
      selectedTrialLabel: document.getElementById('communitySelectedTrialLabel'),
      trialSelectorList: document.getElementById('communityTrialSelectorList'),
      sortFilter: document.getElementById('communitySortFilter'),
      refreshThreadsBtn: document.getElementById('communityRefreshThreadsBtn'),
      feedMeta: document.getElementById('communityFeedMeta'),
      apiNotice: document.getElementById('communityApiNotice'),
      emptyState: document.getElementById('communityEmptyState'),
      threadList: document.getElementById('communityThreadList'),
      trialContextList: document.getElementById('communityTrialList'),
      createThreadTitle: document.getElementById('communityComposerTitleInput'),
      createThreadBody: document.getElementById('communityComposerInput'),
      createThreadBtn: document.getElementById('communityCreateThreadBtn'),
      changePasswordBtn: document.getElementById('communityChangePasswordBtn'),
      logoutBtn: document.getElementById('communityLogoutBtn'),
      passwordModal: document.getElementById('communityPasswordModal'),
      passwordForm: document.getElementById('communityPasswordForm'),
      passwordGateNotice: document.getElementById('communityPasswordGateNotice'),
      passwordModalTitle: document.getElementById('communityPasswordModalTitle'),
      currentPassword: document.getElementById('communityCurrentPassword'),
      newPassword: document.getElementById('communityNewPassword'),
      confirmPassword: document.getElementById('communityConfirmPassword'),
      closePasswordModal: document.getElementById('communityClosePasswordModal'),
      cancelPasswordBtn: document.getElementById('communityCancelPasswordBtn'),
      savePasswordBtn: document.getElementById('communitySavePasswordBtn'),
      savePasswordBtnText: document.getElementById('communitySavePasswordBtnText'),
      savePasswordSpinner: document.getElementById('communitySavePasswordSpinner')
    };
  }

  async requirePhysicianSession() {
    const response = await fetch(`${this.authUrl}?action=session`, {
      method: 'GET',
      credentials: 'same-origin'
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.authenticated || data.user?.role !== 'physician') {
      window.location.href = 'physician-login-php.html';
      return;
    }

    this.session = {
      user: data.user,
      csrfToken: data.csrfToken || ''
    };
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
        window.location.href = 'physician-login-php.html';
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

  bindEvents() {
    this.elements.groupList?.addEventListener('click', event => {
      const button = event.target.closest('[data-group]');
      if (!button) return;
      this.setSelectedGroup(button.dataset.group);
    });

    this.elements.trialSelectorList?.addEventListener('click', event => {
      const button = event.target.closest('[data-trial-id]');
      if (!button) return;
      this.setSelectedTrial(button.dataset.trialId);
    });

    this.elements.sortFilter?.addEventListener('change', event => {
      this.sortBy = event.target.value || 'recent';
      this.renderThreads();
    });

    this.elements.refreshThreadsBtn?.addEventListener('click', () => {
      this.loadThreads();
    });

    this.elements.createThreadBtn?.addEventListener('click', () => {
      this.createThread();
    });

    this.elements.changePasswordBtn?.addEventListener('click', () => {
      this.openPasswordModal(false);
    });

    this.elements.logoutBtn?.addEventListener('click', () => {
      this.logout();
    });

    this.elements.threadList?.addEventListener('click', event => {
      const actionElement = event.target.closest('[data-community-action]');
      if (!actionElement) return;

      const action = actionElement.dataset.communityAction;
      const threadId = Number(actionElement.dataset.threadId || 0);
      const replyId = Number(actionElement.dataset.replyId || 0);

      if (action === 'edit-thread') {
        this.editingThreadId = threadId;
        this.editingReplyId = null;
        this.renderThreads();
      }

      if (action === 'cancel-edit-thread') {
        this.editingThreadId = null;
        this.renderThreads();
      }

      if (action === 'save-thread') {
        this.saveThreadEdit(threadId);
      }

      if (action === 'toggle-reply') {
        this.replyComposerThreadId = this.replyComposerThreadId === threadId ? null : threadId;
        this.editingReplyId = null;
        this.renderThreads();
      }

      if (action === 'save-reply') {
        this.createReply(threadId);
      }

      if (action === 'cancel-reply') {
        this.replyComposerThreadId = null;
        this.renderThreads();
      }

      if (action === 'edit-reply') {
        this.editingReplyId = replyId;
        this.replyComposerThreadId = null;
        this.editingThreadId = null;
        this.renderThreads();
      }

      if (action === 'cancel-edit-reply') {
        this.editingReplyId = null;
        this.renderThreads();
      }

      if (action === 'save-edit-reply') {
        this.saveReplyEdit(replyId);
      }
    });

    this.elements.passwordForm?.addEventListener('submit', event => {
      event.preventDefault();
      this.handlePasswordChange();
    });

    this.elements.closePasswordModal?.addEventListener('click', () => {
      if (!this.session?.user?.mustChangePassword) {
        this.closePasswordModal();
      }
    });

    this.elements.cancelPasswordBtn?.addEventListener('click', () => {
      if (!this.session?.user?.mustChangePassword) {
        this.closePasswordModal();
      }
    });

    this.elements.passwordModal?.addEventListener('click', event => {
      if (event.target === this.elements.passwordModal && !this.session?.user?.mustChangePassword) {
        this.closePasswordModal();
      }
    });
  }

  async loadBootstrap() {
    try {
      const data = await this.requestJson(`${this.communityUrl}?bootstrap=1`, {
        method: 'GET'
      });

      this.groups = Array.isArray(data.groups) ? data.groups : [];
      this.session.user = data.user || this.session.user;
      this.renderIdentity();
      this.renderGroups();
      this.renderTrialSelector();
      this.renderTrialContext();
      this.renderThreads();
      this.updateComposerState();

      if (this.session.user.mustChangePassword) {
        this.openPasswordModal(true);
      }
    } catch (error) {
      console.error('Failed loading community bootstrap:', error);
      this.showApiNotice(error.message || 'Failed to load physician forum');
    }
  }

  renderIdentity() {
    const credentials = this.session.user.credentials ? `, ${this.session.user.credentials}` : '';
    this.elements.identity.textContent = `Signed in as ${this.session.user.fullName}${credentials}`;
  }

  getSelectedGroupRecord() {
    return this.groups.find(group => group.name === this.selectedGroup) || null;
  }

  getSelectedTrialRecord() {
    const group = this.getSelectedGroupRecord();
    if (!group) return null;
    return (group.trials || []).find(trial => trial.id === this.selectedTrialId) || null;
  }

  getCommunityStatusClass(status) {
    const normalizedStatus = Utils.normalizeStatus(status) || 'not_specified';

    if (normalizedStatus === 'active_not_recruiting') {
      return 'active';
    }

    if (normalizedStatus === 'not_specified') {
      return 'completed';
    }

    return normalizedStatus;
  }

  renderGroups() {
    if (this.session.user.mustChangePassword) {
      this.elements.groupList.innerHTML = '<div class="community-state-info">Change your temporary password to unlock the physician forum.</div>';
      this.elements.selectedGroupLabel.textContent = 'Password change required before forum access.';
      return;
    }

    if (!this.groups.length) {
      this.elements.groupList.innerHTML = '<div class="community-state-info">No disease groups are available for your account yet.</div>';
      return;
    }

    this.elements.groupList.innerHTML = this.groups.map(group => {
      const activeClass = group.name === this.selectedGroup ? ' is-active' : '';
      return `
        <button type="button" class="community-group-card${activeClass}" data-group="${Utils.sanitizeHTML(group.name)}" aria-pressed="${group.name === this.selectedGroup}">
          <div class="community-group-head">
            <h4>${Utils.sanitizeHTML(group.name)}</h4>
            <span class="community-unread-badge">${group.trialCount} trials</span>
          </div>
          <p>${Utils.sanitizeHTML(group.description)}</p>
        </button>
      `;
    }).join('');

    this.elements.selectedGroupLabel.textContent = this.selectedGroup
      ? `Selected disease group: ${this.selectedGroup}`
      : 'No disease group selected.';
  }

  renderTrialSelector() {
    if (this.session.user.mustChangePassword) {
      this.elements.trialSelectorList.innerHTML = '<div class="community-state-info">Change your password to load trial discussions.</div>';
      this.elements.selectedTrialLabel.textContent = 'Password change required before forum access.';
      return;
    }

    const group = this.getSelectedGroupRecord();
    if (!group) {
      this.elements.trialSelectorList.innerHTML = '<div class="community-state-info">Select a disease group to load trial options.</div>';
      this.elements.selectedTrialLabel.textContent = 'No trial selected.';
      return;
    }

    const trials = Array.isArray(group.trials) ? group.trials : [];
    if (!trials.length) {
      this.elements.trialSelectorList.innerHTML = '<div class="community-state-info">No trials are currently available in this disease group.</div>';
      this.elements.selectedTrialLabel.textContent = 'No trial selected.';
      return;
    }

    this.elements.trialSelectorList.innerHTML = trials.map(trial => {
      const activeClass = trial.id === this.selectedTrialId ? ' is-active' : '';
      const statusConfig = Utils.getStatusConfig(trial.status);
      return `
        <button type="button" class="community-trial-selector-item${activeClass}" data-trial-id="${Utils.sanitizeHTML(trial.id)}" aria-pressed="${trial.id === this.selectedTrialId}">
          <div class="community-trial-selector-head">
            <h4>${Utils.sanitizeHTML(trial.title)}</h4>
            <span class="community-status-chip ${Utils.sanitizeHTML(this.getCommunityStatusClass(trial.status))}">${Utils.sanitizeHTML(statusConfig.label)}</span>
          </div>
          <p class="community-trial-selector-meta">${Utils.sanitizeHTML(trial.hospital || 'Institution not specified')} | ID: ${Utils.sanitizeHTML(trial.instituteId || trial.id)}</p>
          <p class="community-trial-selector-meta">PI: ${Utils.sanitizeHTML(trial.piName || 'Not specified')}</p>
        </button>
      `;
    }).join('');

    const selectedTrial = this.getSelectedTrialRecord();
    this.elements.selectedTrialLabel.textContent = selectedTrial
      ? `Selected trial: ${selectedTrial.title}`
      : 'No trial selected.';
  }

  renderTrialContext() {
    if (this.session.user.mustChangePassword) {
      this.elements.trialContextList.innerHTML = '<div class="community-state-info">Change your password to unlock trial context and live discussions.</div>';
      return;
    }

    const trial = this.selectedTrial;
    if (!trial) {
      this.elements.trialContextList.innerHTML = '<div class="community-state-info">Select a trial to view contextual trial details.</div>';
      return;
    }

    const statusConfig = Utils.getStatusConfig(trial.status);
    const detailLink = `trial-detail-php.html?id=${encodeURIComponent(trial.id)}`;

    this.elements.trialContextList.innerHTML = `
      <article class="community-trial-item">
        <div class="community-trial-head">
          <h4>${Utils.sanitizeHTML(trial.title)}</h4>
          <span class="community-status-chip ${Utils.sanitizeHTML(this.getCommunityStatusClass(trial.status))}">${Utils.sanitizeHTML(statusConfig.label)}</span>
        </div>
        <p class="community-trial-site">Institution: ${Utils.sanitizeHTML(trial.hospital || 'Not specified')}</p>
        <p class="community-trial-meta">Institute ID: ${Utils.sanitizeHTML(trial.instituteId || trial.id)} | Updated: ${Utils.sanitizeHTML(Utils.formatDate(trial.lastWebsiteUpdate))}</p>
        <p class="community-trial-meta">Phase: ${Utils.sanitizeHTML(trial.phase || 'Not specified')} | City: ${Utils.sanitizeHTML(trial.city || 'Not specified')}</p>
        <p class="community-trial-meta">${Utils.sanitizeHTML(Utils.truncateText(trial.description || '', 220))}</p>
        <a class="btn btn-outline community-trial-link" href="${detailLink}">View Trial Details</a>
      </article>
    `;
  }

  showApiNotice(message) {
    this.elements.apiNotice.hidden = false;
    this.elements.apiNotice.textContent = message;
  }

  hideApiNotice() {
    this.elements.apiNotice.hidden = true;
    this.elements.apiNotice.textContent = '';
  }

  setSelectedGroup(groupName) {
    this.selectedGroup = groupName || null;
    this.selectedTrialId = null;
    this.selectedTrial = null;
    this.threads = [];
    this.replyComposerThreadId = null;
    this.editingThreadId = null;
    this.editingReplyId = null;
    this.renderGroups();
    this.renderTrialSelector();
    this.renderTrialContext();
    this.renderThreads();
    this.updateComposerState();
  }

  async setSelectedTrial(trialId) {
    this.selectedTrialId = trialId || null;
    this.selectedTrial = this.getSelectedTrialRecord();
    this.replyComposerThreadId = null;
    this.editingThreadId = null;
    this.editingReplyId = null;
    this.renderTrialSelector();
    this.renderTrialContext();
    this.updateComposerState();
    await this.loadThreads();
  }

  getSortedThreads() {
    const threads = [...this.threads];

    if (this.sortBy === 'most_discussed') {
      threads.sort((a, b) => {
        if (b.replyCount !== a.replyCount) {
          return b.replyCount - a.replyCount;
        }
        return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
      });
      return threads;
    }

    threads.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    return threads;
  }

  async loadThreads() {
    if (!this.selectedTrialId) {
      this.threads = [];
      this.selectedTrial = null;
      this.renderThreads();
      return;
    }

    this.elements.threadList.innerHTML = '<div class="community-state-info">Loading live discussion threads...</div>';
    this.hideApiNotice();

    try {
      const data = await this.requestJson(`${this.communityUrl}?trial_id=${encodeURIComponent(this.selectedTrialId)}`, {
        method: 'GET'
      });

      this.selectedTrial = data.trial || this.selectedTrial;
      this.threads = Array.isArray(data.threads) ? data.threads : [];
      this.renderTrialContext();
      this.renderThreads();
    } catch (error) {
      console.error('Failed loading threads:', error);
      this.threads = [];
      this.renderThreads();
      this.showApiNotice(error.message || 'Failed to load discussion threads');
    }
  }

  updateComposerState() {
    const disabled = !this.selectedTrialId || this.session.user.mustChangePassword;
    this.elements.createThreadTitle.disabled = disabled;
    this.elements.createThreadBody.disabled = disabled;
    this.elements.createThreadBtn.disabled = disabled;
  }

  renderThreads() {
    if (this.session.user.mustChangePassword) {
      this.elements.feedMeta.textContent = 'Password change required before loading forum content.';
      this.elements.emptyState.hidden = true;
      this.elements.threadList.innerHTML = '<div class="community-state-info">Update your temporary password to view or post discussions.</div>';
      return;
    }

    const selectedTrial = this.getSelectedTrialRecord();
    this.elements.feedMeta.textContent = selectedTrial
      ? `${selectedTrial.title} | ${this.threads.length} thread${this.threads.length === 1 ? '' : 's'}`
      : 'Select a trial to view the physician discussion forum.';

    if (!selectedTrial) {
      this.elements.emptyState.hidden = true;
      this.elements.threadList.innerHTML = '<div class="community-state-info">Select a trial to load live discussion threads.</div>';
      return;
    }

    if (!this.threads.length) {
      this.elements.emptyState.hidden = false;
      this.elements.threadList.innerHTML = '';
      return;
    }

    this.elements.emptyState.hidden = true;
    this.elements.threadList.innerHTML = this.getSortedThreads().map(thread => this.renderThreadCard(thread)).join('');
  }

  renderThreadCard(thread) {
    const isEditingThread = this.editingThreadId === thread.id;
    const isReplyComposerOpen = this.replyComposerThreadId === thread.id;
    const threadEditedLabel = thread.editedAt ? ` | Edited ${new Date(thread.editedAt).toLocaleString()}` : '';
    const repliesHtml = Array.isArray(thread.replies) && thread.replies.length
      ? thread.replies.map(reply => this.renderReply(reply, thread)).join('')
      : '<p style="margin: 0.75rem 0 0; color: var(--text-secondary);">No replies yet.</p>';

    const threadBodyHtml = isEditingThread
      ? `
          <div style="display: grid; gap: 0.75rem; margin-top: 1rem;">
            <input type="text" class="form-input" data-thread-edit-title="${thread.id}" value="${Utils.sanitizeHTML(thread.title)}">
            <textarea class="community-composer-input" rows="4" data-thread-edit-body="${thread.id}">${Utils.sanitizeHTML(thread.body)}</textarea>
            <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary" data-community-action="save-thread" data-thread-id="${thread.id}">Save Changes</button>
              <button type="button" class="btn btn-secondary" data-community-action="cancel-edit-thread" data-thread-id="${thread.id}">Cancel</button>
            </div>
          </div>
        `
      : `
          <p class="community-thread-body">${Utils.sanitizeHTML(thread.body)}</p>
        `;

    const replyComposerHtml = isReplyComposerOpen
      ? `
          <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
            <textarea class="community-composer-input" rows="3" data-reply-body="${thread.id}" placeholder="Add a de-identified reply"></textarea>
            <div style="display: flex; gap: 0.75rem; margin-top: 0.75rem; flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary" data-community-action="save-reply" data-thread-id="${thread.id}">Post Reply</button>
              <button type="button" class="btn btn-secondary" data-community-action="cancel-reply" data-thread-id="${thread.id}">Cancel</button>
            </div>
          </div>
        `
      : '';

    return `
      <article class="community-thread" style="padding: 1rem 1.25rem;">
        <div class="community-thread-header">
          <div>
            <button type="button" class="community-thread-toggle" aria-expanded="true" disabled style="cursor: default; opacity: 1;">
              ${Utils.sanitizeHTML(thread.title)}
            </button>
            <p class="community-thread-author">Posted by ${Utils.sanitizeHTML(thread.author.displayName)} | ${Utils.sanitizeHTML(new Date(thread.createdAt).toLocaleString())}${threadEditedLabel}</p>
          </div>
          <span class="community-thread-time">${thread.replyCount} repl${thread.replyCount === 1 ? 'y' : 'ies'}${thread.isLocked ? ' | Locked' : ''}</span>
        </div>
        ${threadBodyHtml}
        <div class="community-thread-actions">
          ${thread.canEdit ? `<button type="button" class="community-action-toggle" data-community-action="edit-thread" data-thread-id="${thread.id}">Edit Thread</button>` : ''}
          ${!thread.isLocked ? `<button type="button" class="community-action-toggle" data-community-action="toggle-reply" data-thread-id="${thread.id}">Reply</button>` : ''}
          ${thread.isLocked ? '<span class="community-thread-replies">Thread locked by administrator</span>' : ''}
        </div>
        <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
          ${repliesHtml}
          ${replyComposerHtml}
        </div>
      </article>
    `;
  }

  renderReply(reply, thread) {
    const isEditingReply = this.editingReplyId === reply.id;
    const editedLabel = reply.editedAt ? ` | Edited ${new Date(reply.editedAt).toLocaleString()}` : '';

    if (isEditingReply) {
      return `
        <div style="border-top: 1px solid var(--border-color); padding-top: 0.75rem; margin-top: 0.75rem;">
          <div style="font-weight: 600; color: var(--text-primary);">${Utils.sanitizeHTML(reply.author.displayName)}</div>
          <textarea class="community-composer-input" rows="3" data-reply-edit-body="${reply.id}" style="margin-top: 0.75rem;">${Utils.sanitizeHTML(reply.body)}</textarea>
          <div style="display: flex; gap: 0.75rem; margin-top: 0.75rem; flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary" data-community-action="save-edit-reply" data-reply-id="${reply.id}">Save Reply</button>
            <button type="button" class="btn btn-secondary" data-community-action="cancel-edit-reply" data-reply-id="${reply.id}">Cancel</button>
          </div>
        </div>
      `;
    }

    return `
      <div style="border-top: 1px solid var(--border-color); padding-top: 0.75rem; margin-top: 0.75rem;">
        <div style="display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap;">
          <div>
            <div style="font-weight: 600; color: var(--text-primary);">${Utils.sanitizeHTML(reply.author.displayName)}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">${Utils.sanitizeHTML(new Date(reply.createdAt).toLocaleString())}${editedLabel}</div>
          </div>
          ${reply.canEdit && !thread.isLocked ? `<button type="button" class="community-action-toggle" data-community-action="edit-reply" data-reply-id="${reply.id}">Edit Reply</button>` : ''}
        </div>
        <p style="margin: 0.5rem 0 0; color: var(--text-secondary);">${Utils.sanitizeHTML(reply.body)}</p>
      </div>
    `;
  }

  async createThread() {
    if (!this.selectedTrialId) {
      Utils.showErrorMessage('Select a trial before posting a new thread');
      return;
    }

    const title = this.elements.createThreadTitle.value.trim();
    const body = this.elements.createThreadBody.value.trim();

    if (!title || !body) {
      Utils.showErrorMessage('Thread title and body are required');
      return;
    }

    this.elements.createThreadBtn.disabled = true;

    try {
      await this.requestJson(this.communityUrl, {
        method: 'POST',
        headers: this.getCsrfHeaders(),
        body: JSON.stringify({
          type: 'thread',
          trial_id: this.selectedTrialId,
          title,
          body
        })
      });

      this.elements.createThreadTitle.value = '';
      this.elements.createThreadBody.value = '';
      Utils.showSuccessMessage('Discussion thread posted successfully');
      await this.loadThreads();
    } catch (error) {
      console.error('Failed creating thread:', error);
      Utils.showErrorMessage(error.message || 'Failed to create thread');
    } finally {
      this.elements.createThreadBtn.disabled = false;
    }
  }

  async createReply(threadId) {
    const textarea = this.elements.threadList.querySelector(`[data-reply-body="${threadId}"]`);
    const body = textarea?.value.trim() || '';

    if (!body) {
      Utils.showErrorMessage('Reply body is required');
      return;
    }

    try {
      await this.requestJson(this.communityUrl, {
        method: 'POST',
        headers: this.getCsrfHeaders(),
        body: JSON.stringify({
          type: 'reply',
          thread_id: threadId,
          body
        })
      });

      this.replyComposerThreadId = null;
      Utils.showSuccessMessage('Reply posted successfully');
      await this.loadThreads();
    } catch (error) {
      console.error('Failed creating reply:', error);
      Utils.showErrorMessage(error.message || 'Failed to post reply');
    }
  }

  async saveThreadEdit(threadId) {
    const titleField = this.elements.threadList.querySelector(`[data-thread-edit-title="${threadId}"]`);
    const bodyField = this.elements.threadList.querySelector(`[data-thread-edit-body="${threadId}"]`);
    const title = titleField?.value.trim() || '';
    const body = bodyField?.value.trim() || '';

    if (!title || !body) {
      Utils.showErrorMessage('Thread title and body are required');
      return;
    }

    try {
      await this.requestJson(this.communityUrl, {
        method: 'PUT',
        headers: this.getCsrfHeaders(),
        body: JSON.stringify({
          type: 'thread',
          thread_id: threadId,
          title,
          body
        })
      });

      this.editingThreadId = null;
      Utils.showSuccessMessage('Thread updated successfully');
      await this.loadThreads();
    } catch (error) {
      console.error('Failed updating thread:', error);
      Utils.showErrorMessage(error.message || 'Failed to update thread');
    }
  }

  async saveReplyEdit(replyId) {
    const bodyField = this.elements.threadList.querySelector(`[data-reply-edit-body="${replyId}"]`);
    const body = bodyField?.value.trim() || '';

    if (!body) {
      Utils.showErrorMessage('Reply body is required');
      return;
    }

    try {
      await this.requestJson(this.communityUrl, {
        method: 'PUT',
        headers: this.getCsrfHeaders(),
        body: JSON.stringify({
          type: 'reply',
          reply_id: replyId,
          body
        })
      });

      this.editingReplyId = null;
      Utils.showSuccessMessage('Reply updated successfully');
      await this.loadThreads();
    } catch (error) {
      console.error('Failed updating reply:', error);
      Utils.showErrorMessage(error.message || 'Failed to update reply');
    }
  }

  openPasswordModal(isForced) {
    this.elements.passwordForm.reset();
    this.elements.passwordGateNotice.style.display = isForced ? 'block' : 'none';
    this.elements.passwordModalTitle.textContent = isForced ? 'Change Temporary Password' : 'Change Password';
    this.elements.closePasswordModal.style.display = isForced ? 'none' : 'inline-flex';
    this.elements.cancelPasswordBtn.style.display = isForced ? 'none' : 'inline-flex';
    this.elements.passwordModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  closePasswordModal() {
    this.elements.passwordModal.classList.remove('active');
    document.body.style.overflow = '';
    this.elements.passwordForm.reset();
  }

  setPasswordSaveLoading(isLoading) {
    this.elements.savePasswordBtn.disabled = isLoading;
    this.elements.savePasswordSpinner.style.display = isLoading ? 'block' : 'none';
    this.elements.savePasswordBtnText.style.display = isLoading ? 'none' : 'inline';
  }

  async handlePasswordChange() {
    const currentPassword = this.elements.currentPassword.value;
    const newPassword = this.elements.newPassword.value;
    const confirmPassword = this.elements.confirmPassword.value;

    if (!currentPassword || !newPassword || !confirmPassword) {
      Utils.showErrorMessage('All password fields are required');
      return;
    }

    if (newPassword !== confirmPassword) {
      Utils.showErrorMessage('Password confirmation does not match');
      return;
    }

    this.setPasswordSaveLoading(true);

    try {
      const data = await this.requestJson(`${this.authUrl}?action=change_password`, {
        method: 'POST',
        headers: this.getCsrfHeaders(),
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword
        })
      });

      this.session.user = data.user || this.session.user;
      this.session.csrfToken = data.csrfToken || this.session.csrfToken;
      this.closePasswordModal();
      this.renderIdentity();
      this.updateComposerState();
      Utils.showSuccessMessage('Password updated successfully');

      if (!this.session.user.mustChangePassword) {
        await this.loadBootstrap();
      }
    } catch (error) {
      console.error('Password change failed:', error);
      Utils.showErrorMessage(error.message || 'Failed to update password');
    } finally {
      this.setPasswordSaveLoading(false);
    }
  }

  async logout() {
    try {
      await this.requestJson(`${this.authUrl}?action=logout`, {
        method: 'POST',
        headers: this.getCsrfHeaders(),
        body: JSON.stringify({})
      });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      window.location.href = 'physician-login-php.html';
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const app = new PhysicianCommunityApp();

  try {
    await app.init();
  } catch (error) {
    console.error('Failed to initialize physician community:', error);
    Utils.showErrorMessage(error.message || 'Failed to initialize physician community');
  }
});
