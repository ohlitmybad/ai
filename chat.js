const REMOTE_QUOTA_URL = 'https://script.google.com/macros/s/AKfycbweT-ZkpblVyID3npNRRCTvJISREBxCtCkmW3JU_tEquUpE_XPI9ZnE6NkefHjBv17icg/exec';

const ANALYST_MODEL = 'gpt-4o';
const DATASET_FILE_NAMES = {
    data: 'data.csv',
    guide: 'guide.html'
};

function __jsonp(url, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const cb = 'cb' + Math.random().toString(36).slice(2);
        const s = document.createElement('script');
        const t = setTimeout(() => { cleanup(); reject(new Error('JSONP timeout')); }, timeoutMs);
        function cleanup(){ if (s.parentNode) s.parentNode.removeChild(s); try{ delete window[cb]; }catch(_){ window[cb]=undefined; } clearTimeout(t);} 
        window[cb] = (data) => { cleanup(); resolve(data); };
        s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
        s.onerror = () => { cleanup(); reject(new Error('JSONP error')); };
        document.head.appendChild(s);
    });
}

async function remoteGetQuota(memberId) {
    if (!REMOTE_QUOTA_URL) throw new Error('REMOTE_QUOTA_URL not set');
    return __jsonp(REMOTE_QUOTA_URL + '?id=' + encodeURIComponent(memberId));
}

async function remoteBumpQuota(memberId) {
    if (!REMOTE_QUOTA_URL) throw new Error('REMOTE_QUOTA_URL not set');
    return __jsonp(REMOTE_QUOTA_URL + '?id=' + encodeURIComponent(memberId) + '&bump=1');
}

class UltimateFootballAI {
    constructor() {
        this.acTo = null;
        
        const bootstrapUrlc2 = 'aHR0cHM6Ly93b3JrZXJzLXBsYXlncm91bmQtbGluZ2VyaW5nLWRpc2stMWFhNi5kYXRhbWItZm9vdGJhbGwud29ya2Vycy5kZXYvP3Rva2VuPXN1cGVyc2VjcmV0';

        this.bootstrapPromise = fetch(atob(bootstrapUrlc2))
            .then(r => r.json())
            .then(data => {
                this.acTo = data.key; 
                this.acToAdj = this.getAdjusted();
                return this.acTo;
            });

        this.conversationId = null;
        this.containerId = null;
        this.currentResponseId = null;
        this.instructions = '';
        this.model = ANALYST_MODEL;
        this.dataFileIds = [];
        this.isInitialized = false;
        this.conversationHistory = [];
        this.chartsEnabled = false;

        
        // MONTHLY QUOTA SYSTEM - 30 QUERIES IN 30 DAYS
        this.MONTHLY_LIMIT = 30;
        this.mwKeyApplied = false;
        this.currentMemberId = '';
        
        // LOCAL CACHE FOR INSTANT UX (mirrors Google Script data)
        this.quotaCache = {}; // In-memory cache for instant checks

        this.messagesContainer = document.getElementById('messages');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.chartToggle = document.getElementById('chartToggle');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.isSending = false;
        this.fetchController = null;
        this.cancelRequested = false;
        this.status = document.getElementById('status');
        this.suggestions = document.getElementById('suggestions');

        if (this.chartsEnabled) {
            this.chartToggle.classList.add('active');
        } else {
            this.chartToggle.classList.remove('active');
        }

        this.setupEventListeners();
        this.setupQuotaTooltip();
        this.initialize();
    }

    getAdjusted() {
        const original = this.acTo || '';
        for (let i = original.length - 1; i >= 0; i--) {
            const ch = original[i];
            if (ch >= '0' && ch <= '9') {
                const incremented = (Number(ch) + 1) % 10;
                return original.slice(0, i) + String(incremented) + original.slice(i + 1);
            }
        }
        return original;
    }

    computeResetAtFromQuotaData(data) {
        // Backend already handles reset logic - just use the start timestamp
        if (Number.isFinite(Number(data && data.start))) {
            const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
            return Number(data.start) + THIRTY_DAYS_MS;
        }
        return null;
    }

    
    formatResetDate(ts) {
        try {
            const d = new Date(Number(ts));
            if (!Number.isFinite(d.getTime())) return '';
            // Force European date format: DD.MM.YY HH:MM
            const day = d.getDate().toString().padStart(2, '0');
            const month = (d.getMonth() + 1).toString().padStart(2, '0');
            const year = d.getFullYear().toString().slice(-2);
            const hours = d.getHours().toString().padStart(2, '0');
            const minutes = d.getMinutes().toString().padStart(2, '0');
            return `${day}.${month}.${year} ${hours}:${minutes}`;
        } catch (_) { return ''; }
    }

    saveQuotaCache(memberId, data) {
        // Calculate reset date once and store it
        const resetAt = this.computeResetAtFromQuotaData(data);
        
        this.quotaCache[memberId] = {
            start: Number(data.start || Date.now()),
            count: Number(data.count || 0),
            extendedQuota: Number(data.extendedQuota || 0),
            resetAt: resetAt
        };
    }

    getQuotaCache(memberId) {
        const cached = this.quotaCache[memberId];
        if (!cached) return null;
        
        return cached;
    }


    async preloadRemoteQuotaForId(memberId) {
        if (!memberId) return;
        
        // Always clear cache first to force fresh data
        this.quotaCache[memberId] = null;
        
        try {
            const data = await remoteGetQuota(memberId);
            
            // Use saveQuotaCache instead of duplicating logic
            this.saveQuotaCache(memberId, data);
            
            // Refresh quota display after preloading
            this.refreshQuotaDisplay();
            
            // Force status update to show new quota
            this.updateStatus('Ready!', 'ready');
            
        } catch (e) {
        }
    }
    

    canSendNow() {
        // Must be logged in
        if (!(this.mwKeyApplied && this.currentMemberId)) {
            this.showError('You must be logged in');
            this.updateStatus('Login required', 'error');
            return false;
        }

        // Check cached quota for instant blocking
        const cached = this.getQuotaCache(this.currentMemberId);
        if (cached) {
            // Calculate total available quota including extended quota
            let totalLimit = this.MONTHLY_LIMIT;
            if (cached.extendedQuota && cached.extendedQuota > 0) {
                // Extended quota doesn't expire - always add it
                totalLimit += cached.extendedQuota;
            }
            
            if (cached.count >= totalLimit) {
                this.showMonthlyLimitError(cached.resetAt || null);
                const t = window.currentTranslations || null;
                
                // Check if this is a banned user (count: 999)
                const isBannedUser = cached.count === 999;
                
                if (isBannedUser) {
                    // For banned users, show "No access" with 0/0 quota
                    const statusText = (t?.status?.noAccess || 'No access') + ' <span class="status-separator">|</span> <span class="quota-display" data-used="0" data-total="0" data-remaining="0" data-reset="">0 <i class="fas fa-bolt"></i></span>';
                    this.updateStatus(statusText, 'error');
                } else {
                    // Regular monthly limit reached
                    const quotaText = this.getQuotaDisplayText();
                    const statusText = (t?.status?.monthlyLimitReached || 'Monthly limit reached') + (quotaText ? ' <span class="status-separator">|</span>' + quotaText : '');
                    this.updateStatus(statusText, 'error');
                }
                return false;
            }
        }

        return true; // Allow if no cache (optimistic) or under limit
    }

    async bumpQuotaAsync() {
        if (!(this.mwKeyApplied && this.currentMemberId)) return;
        
        try {
            const data = await remoteBumpQuota(this.currentMemberId);
            this.saveQuotaCache(this.currentMemberId, data);
        } catch (e) {
            const cached = this.getQuotaCache(this.currentMemberId);
            if (cached) {
                cached.count += 1;
            }
        }
    }

    // Compose and show the monthly limit error using i18n fragments if available
    showMonthlyLimitError(resetAt) {
        const t = window.currentTranslations || null;
        
        // Check if this is a banned user (they have count: 999)
        const cached = this.getQuotaCache(this.currentMemberId);
        const isBannedUser = cached && cached.count === 999;
        
        if (isBannedUser) {
            // Show banned user message
            const errorText = t?.errors?.bannedUser || 'Free accounts do not get AI access, create a new account to try DataMB Chat.';
            const subscribeLink = `<a href="https://datamb.football/join" target="_blank" class="payment-link">${t?.payment?.subscribe || 'Subscribe'}</a>`;
            
            const errorHTML = `
                <div class="error">
                    ${errorText}
                </div>
                ${subscribeLink}
            `;
            
            const errorMessage = this.createMessageContainer('assistant');
            const contentDiv = errorMessage.querySelector('.message-content');
            contentDiv.innerHTML = errorHTML;
            return;
        }
        
        // Regular monthly limit reached message
        const resetDate = resetAt ? this.formatResetDate(resetAt) : null;
        const errorText = t?.errors?.monthlyLimitReached || 'Monthly query limit reached.';
        const resetInfo = resetDate ? ` ${t?.errors?.resets || 'Resets'} ${resetDate}.` : '';
        
        const finalErrorText = `${errorText}${resetInfo} <br>You can add 100 requests if you don't want to wait.`;
        
        const paymentLink = `<a href="https://buy.stripe.com/bJe00jebp5sH7pl37rcbC0b" target="_blank" class="payment-link" onclick="clearCacheAndShowReload()">${t?.payment?.addMoreRequests || 'Buy (€10)'}</a>`;
        
        const errorHTML = `
            <div class="error">
                ${finalErrorText}
            </div>
            ${paymentLink}
        `;
        
        const errorMessage = this.createMessageContainer('assistant');
        const contentDiv = errorMessage.querySelector('.message-content');
        contentDiv.innerHTML = errorHTML;
    }


            setupEventListeners() {
                this.sendButton.addEventListener('click', () => {
                    if (this.currentResponseId || this.isSending) {
                        this.stopRequest();
                    } else {
                        this.sendMessage();
                    }
                });
                this.messageInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this.sendMessage();
                    }
                });

                this.messageInput.addEventListener('input', (e) => {
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
                    this.updateContextualSuggestions(e.target.value);
                });

                // Chart toggle
                this.chartToggle.addEventListener('click', () => this.toggleCharts());
                if (this.newChatBtn) this.newChatBtn.addEventListener('click', () => this.newChat());

                // Suggestion clicks
                this.suggestions.addEventListener('click', (e) => {
                    const chip = e.target.closest('.suggestion-chip');
                    if (!chip) return;
                    const query = chip.getAttribute('data-query') || '';
                    this.messageInput.value = query;
                    // Turn charts ON for certain suggestion chips
                    const qLower = query.toLowerCase();
                    const shouldEnableCharts = (
                        qLower.includes('radar') ||
                        qLower.includes('radar chart') ||
                        qLower.includes('scatter plot') ||
                        qLower.includes('plot') ||
                        qLower.includes('bar chart') ||
                        qLower.includes('heatmap') ||
                        qLower.includes('visual') ||
                        qLower.includes('age vs performance') ||
                        qLower.includes('xg vs goals') ||
                        (qLower.includes('xg') && qLower.includes('goals'))
                    );
                    if (shouldEnableCharts && !this.chartsEnabled) {
                        this.toggleCharts();
                    }
                    // Re-apply autosize and show caret at end
                    this.messageInput.style.height = 'auto';
                    this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 150) + 'px';
                    this.messageInput.focus();
                    const len = this.messageInput.value.length;
                    this.messageInput.setSelectionRange(len, len);
                });

                window.chatbot = this;
            }

            updateContextualSuggestions(input) {
                if (input.length < 3) return;
                
                const suggestions = this.generateSmartSuggestions(input);
                if (suggestions.length > 0) {
                    this.renderSuggestions(suggestions);
                }
            }

            generateSmartSuggestions(input) {
                const lowerInput = input.toLowerCase();
                const suggestions = [];

                // Player name suggestions
                if (this.playerIndex && this.playerIndex.size > 0) {
                    const matchingPlayers = Array.from(this.playerIndex.keys())
                        .filter(name => name.toLowerCase().includes(lowerInput))
                        .slice(0, 3);
                    
                    matchingPlayers.forEach(player => {
                        suggestions.push({
                            text: `Report for ${player}`,
                            query: `Create a detailed scouting report for ${player}`
                        });
                    });
                }
                

                // Context-based suggestions
                if (lowerInput.includes('compare')) {
                    suggestions.push({
                        text: 'vs Analysis',
                        query: 'Compare their key stats with percentiles and visualizations'
                    });
                } else if (lowerInput.includes('best') || lowerInput.includes('top')) {
                    suggestions.push({
                        text: 'With Charts',
                        query: input + ' and create a visualization'
                    });
                }

                return suggestions.slice(0, 4);
            }
            

            renderSuggestions(suggestions) {
                        this.suggestions.innerHTML = suggestions.map(s => 
                    `<div class=\"suggestion-chip\" data-query=\"${s.query}\"><i class=\"fas fa-wand-magic-sparkles\"></i><span>${s.text}</span></div>`
                ).join('');
            }

            askQuestion(question) {
                this.messageInput.value = question;
                this.sendMessage();
            }

            toggleCharts() {
                        this.chartsEnabled = !this.chartsEnabled;
                
                if (this.chartsEnabled) {
                    this.chartToggle.classList.add('active');
                    this.chartToggle.querySelector('.toggle-text').textContent = 'ON';
                    this.chartToggle.setAttribute('data-i18n', 'tooltips.chartsEnabled');
                    this.chartToggle.setAttribute('data-i18n-attr', 'title');
                    window.translateElement && window.translateElement(this.chartToggle, window.currentTranslations);
                } else {
                    this.chartToggle.classList.remove('active');
                    this.chartToggle.querySelector('.toggle-text').textContent = 'OFF';
                    this.chartToggle.setAttribute('data-i18n', 'tooltips.chartsDisabled');
                    this.chartToggle.setAttribute('data-i18n-attr', 'title');
                    window.translateElement && window.translateElement(this.chartToggle, window.currentTranslations);
                }
                
                // Show brief feedback
                const status = this.chartsEnabled ? 'Charts: ON' : 'Charts: OFF';
                this.updateStatus(status, this.chartsEnabled ? 'ready' : 'loading');
                setTimeout(() => {
                    if (this.isInitialized) {
                        this.updateStatus('Ready!', 'ready');
                    }
                }, 1500);
            }

            openaiHeaders(includeJson) {
                const headers = {
                    'Authorization': `Bearer ${this.acToAdj}`
                };
                if (includeJson) headers['Content-Type'] = 'application/json';
                return headers;
            }

            async loadInstructions() {
                const response = await fetch('./instructions.txt', {
                    signal: (this.fetchController && this.fetchController.signal) || undefined
                });
                if (!response.ok) {
                    throw new Error(`Failed to load instructions (${response.status})`);
                }
                const text = await response.text();
                this.instructions = String(text || '').replace(/^\s*\{\{CHANGE FILE IDS\}\}\s*/m, '').trim();
                if (!this.instructions) {
                    throw new Error('Instructions file is empty');
                }
            }

            pickLatestFile(files, filename) {
                const matches = (files || []).filter(f =>
                    String(f.filename || '').toLowerCase() === String(filename).toLowerCase()
                );
                if (!matches.length) return null;
                return matches.reduce((latest, current) =>
                    (current.created_at || 0) > (latest.created_at || 0) ? current : latest
                );
            }

            async listOpenAIFiles() {
                const files = [];
                let after = null;
                for (let page = 0; page < 20; page++) {
                    const params = new URLSearchParams({ limit: '100' });
                    if (after) params.set('after', after);
                    const response = await fetch(`https://api.openai.com/v1/files?${params.toString()}`, {
                        headers: this.openaiHeaders(false),
                        signal: (this.fetchController && this.fetchController.signal) || undefined
                    });
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(`File list failed: ${errorData.error?.message || response.statusText}`);
                    }
                    const data = await response.json();
                    const batch = data.data || [];
                    files.push(...batch);
                    if (!data.has_more || !batch.length) break;
                    after = batch[batch.length - 1].id;
                }
                return files;
            }

            async findLatestDatasetFiles() {
                const files = await this.listOpenAIFiles();
                const dataFile = this.pickLatestFile(files, DATASET_FILE_NAMES.data);
                const guideFile = this.pickLatestFile(files, DATASET_FILE_NAMES.guide);
                if (!dataFile || !guideFile) {
                    const missing = [
                        !dataFile ? DATASET_FILE_NAMES.data : null,
                        !guideFile ? DATASET_FILE_NAMES.guide : null
                    ].filter(Boolean).join(' and ');
                    throw new Error(`Dataset files not found (${missing})`);
                }
                this.dataFileIds = [dataFile.id, guideFile.id];
            }

            async initialize() {
                try {
                    await this.bootstrapPromise;
                    this.setLoading(true);

                    this.updateStatus('Loading AI assistant...', 'loading');
                    await this.loadInstructions();
                    await this.findLatestDatasetFiles();

                    this.updateStatus('Setting up conversation...', 'loading');
                    await this.createConversation();
                    this.showDataInsights();

                    this.updateStatus('Ready!', 'ready');
                    this.isInitialized = true;
                    this.setLoading(false);
                    this.messageInput.disabled = false;
                    this.sendButton.disabled = false;
                } catch (error) {
                    this.showError(`🚨 Setup failed: ${error.message}`);
                    this.updateStatus('❌ Setup failed', 'error');
                    this.setLoading(false);
                }
            }

            async createConversation() {
                const response = await fetch('https://api.openai.com/v1/conversations', {
                    method: 'POST',
                    headers: this.openaiHeaders(true),
                    body: JSON.stringify({
                        metadata: { user_id: this.currentMemberId || 'anonymous' }
                    }),
                    signal: (this.fetchController && this.fetchController.signal) || undefined
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`Conversation creation failed: ${errorData.error?.message || response.statusText}`);
                }

                const data = await response.json();
                this.conversationId = data.id;
                this.containerId = null;
                this.currentResponseId = null;
            }

            async cancelResponse(responseId) {
                const id = responseId || this.currentResponseId;
                try {
                    if (id) {
                        await fetch(`https://api.openai.com/v1/responses/${id}/cancel`, {
                            method: 'POST',
                            headers: this.openaiHeaders(true)
                        });
                    }
                } catch (_) {}
            }

            async newChat() {
                try {
                    this.updateStatus('Starting new chat...', 'loading');
                    const responseId = this.currentResponseId;
                    this.cancelRequested = true;
                    if (!this.fetchController) this.fetchController = new AbortController();
                    try { this.fetchController.abort(); } catch(_) {}
                    await this.cancelResponse(responseId);
                    this.fetchController = null;
                    await this.createConversation();
                    this.messagesContainer.innerHTML = '';
                    this.conversationHistory = [];
                    this.currentResponseId = null;
                    this.cancelRequested = false;
                    this.fetchController = null;
                    this.setLoading(false);
                    this.messageInput.value = '';
                    this.showDataInsights();
                    this.updateStatus('Ready!', 'ready');
                } catch (e) {
                    this.showError('Failed to start a new chat.');
                    this.updateStatus('Error', 'error');
                }
            }


            async sendMessage() {
                if (!this.isInitialized || !this.messageInput.value.trim()) return;

                if (this.currentMemberId && !this.quotaCache[this.currentMemberId]) {
                    await this.preloadRemoteQuotaForId(this.currentMemberId);
                }

                const message = this.messageInput.value.trim();

                // Give immediate UI feedback: show user's message and clear input right away
                this.messageInput.value = '';
                this.messageInput.style.height = 'auto';
                this.addMessage(message, 'user');

                // Enforce quota without blocking UI; bump remotely in background
                if (!this.canSendNow()) {
                    return;
                }
                this.bumpQuotaAsync();

                this.isSending = true;
                this.setLoading(true);
                this.setStopUI(true);

                try {
                    // prepare cancellation controller
                    this.cancelRequested = false;
                    this.fetchController = new AbortController();
                    // Decorate message with client-side hints for charts/definitions
                    // Determine guide-definition mode and extract likely term(s)
                    const defLike = /\b(what\s+is|explain|definition|how\s+(is|was)\s+.*(computed|calculated)|methodology)\b/i.test(message);
                    let guideTerm = '';
                    const termCandidates = [
                        /performance\s*index/i,
                        /possession\s*\+\-?/i
                    ];
                    for (const rx of termCandidates) {
                        const m = message.match(rx);
                        if (m && m[0]) { guideTerm = m[0]; break; }
                    }

                    let decorated = message + (this.chartsEnabled
                        ? '\n\n[CHARTS ENABLED: Create visualizations when they add value to the analysis]'
                        : '\n\n[CHARTS DISABLED: Provide text-only responses]');
                    // Resolve league group aliases (Europe's Top 5/7, top 5/7 leagues, big 5)
                    const alias = this.resolveLeagueAliases(message);
                    if (alias) {
                        decorated += `\n[LEAGUE GROUP: ${alias.name} ⇒ ${alias.list.join(', ')}]`;
                        decorated += `\n[APPLY FILTER: Only include rows where League ∈ {${alias.list.join(', ')}}]`;
                    }
                    if (defLike) {
                        decorated += '\n\n[DEFINITIONS MODE: Use guide.html ONLY for definitions/methodology. Do NOT rely on general knowledge. Quote and cite the relevant section. Parse the local HTML file. Do NOT use network requests. If not found, state: "Not specified in the DataMB Guide."]';
                        if (guideTerm) {
                            decorated += `\n[GUIDE SEARCH TERM: ${guideTerm}]`;
                            if (/performance\s*index/i.test(guideTerm)) {
                                decorated += '\n[GUIDE ANCHOR HINT: id="performanceindex" and <h4>Performance Index</h4>]';
                            }
                        }
                        // Explicitly list attached files and local-access instruction
                        decorated += '\n[ATTACHED FILES: data.csv, guide.html. Access with open(\'guide.html\', encoding=\'utf-8\').]';
                        // Provide a minimal code scaffold to ensure correct parsing
                        decorated += '\n[CODE SCAFFOLD:\nfrom bs4 import BeautifulSoup\nhtml=open(\'guide.html\', encoding=\'utf-8\').read()\nsoup=BeautifulSoup(html, \'html.parser\')\nsec=soup.select_one(\'#performanceindex\') or soup.find(id=\'performanceindex\')\nprint(sec.get_text("\n", strip=True) if sec else "NOT_FOUND")\n]';
                    }

                    if (!this.dataFileIds.length) {
                        await this.findLatestDatasetFiles();
                    }

                    const response = await fetch('https://api.openai.com/v1/responses', {
                        method: 'POST',
                        headers: this.openaiHeaders(true),
                        body: JSON.stringify({
                            model: this.model,
                            instructions: this.instructions,
                            input: [{ role: 'user', content: decorated }],
                            conversation: this.conversationId,
                            tools: [{
                                type: 'code_interpreter',
                                container: {
                                    type: 'auto',
                                    memory_limit: '4g',
                                    file_ids: this.dataFileIds
                                }
                            }],
                            truncation: 'auto',
                            background: true,
                            store: true
                        }),
                        signal: (this.fetchController && this.fetchController.signal) || undefined
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(`Response failed: ${errorData.error?.message || response.statusText}`);
                    }

                    const data = await response.json();
                    this.currentResponseId = data.id;

                    if (data.status === 'completed') {
                        await this.processResponseOutput(data);
                    } else if (data.status === 'failed' || data.status === 'cancelled' || data.status === 'incomplete') {
                        const detail = data.error?.message || data.incomplete_details?.reason || 'Unknown error';
                        throw new Error(`Analysis ${data.status}: ${detail}`);
                    } else {
                        await this.pollResponseStatus(data.id);
                    }

                } catch (error) {
                    if (!this.isAbortError(error)) {
                        this.showError(`Analysis failed: ${error.message}`);
                    }
                } finally {
                    this.setLoading(false);
                    this.setStopUI(false);
                    this.isSending = false;
                    this.currentResponseId = null;
                }
            }


            async pollResponseStatus(responseId) {
                const startTime = Date.now();
                let pollInterval = 500;
                const maxInterval = 3000;

                while (true) {
                    if (this.cancelRequested) {
                        throw new Error('Cancelled');
                    }
                    try {
                        const response = await fetch(`https://api.openai.com/v1/responses/${responseId}`, {
                            headers: this.openaiHeaders(false),
                            signal: (this.fetchController && this.fetchController.signal) || undefined
                        });

                        if (!response.ok) {
                            if (this.cancelRequested) throw new Error('Cancelled');
                            throw new Error(`Status check failed: ${response.statusText}`);
                        }

                        const result = await response.json();

                        if (result.status === 'in_progress' || result.status === 'queued') {
                            const usingCode = Array.isArray(result.output) && result.output.some(item => item.type === 'code_interpreter_call');
                            this.updateStatus(usingCode ? 'Running calculations...' : 'Analyzing data...', 'loading');
                        }

                        if (result.status === 'completed') {
                            await this.processResponseOutput(result);
                            break;
                        } else if (result.status === 'failed' || result.status === 'cancelled' || result.status === 'incomplete') {
                            if (this.cancelRequested) throw new Error('Cancelled');
                            const detail = result.error?.message || result.incomplete_details?.reason || 'Unknown error';
                            throw new Error(`Analysis ${result.status}: ${detail}`);
                        }

                        const elapsed = Date.now() - startTime;
                        if (elapsed > 10000) {
                            pollInterval = Math.min(maxInterval, pollInterval * 1.2);
                        }

                        await new Promise(resolve => setTimeout(resolve, pollInterval));
                    } catch (error) {
                        if (this.cancelRequested) { throw new Error('Cancelled'); }
                        throw error;
                    }
                }
            }

            isChartFileName(name) {
                return /\.(png|jpe?g|gif|webp|svg)$/i.test(String(name || ''));
            }

            async processResponseOutput(data) {
                const shownFiles = new Set();
                const pendingImages = [];
                let fullContent = '';

                for (const item of data.output || []) {
                    if (item.type === 'code_interpreter_call' && item.container_id) {
                        this.containerId = item.container_id;
                    }

                    if (item.type === 'message' && (item.role === 'assistant' || !item.role)) {
                        for (const part of item.content || []) {
                            if (part.type === 'output_text') {
                                fullContent += part.text || '';
                                for (const ann of part.annotations || []) {
                                    if (ann.type === 'container_file_citation' && this.isChartFileName(ann.filename || ann.file_id)) {
                                        pendingImages.push({
                                            fileId: ann.file_id,
                                            containerId: ann.container_id || this.containerId
                                        });
                                    }
                                }
                            } else if (part.type === 'image_file' && part.image_file?.file_id) {
                                pendingImages.push({
                                    fileId: part.image_file.file_id,
                                    containerId: this.containerId
                                });
                            }
                        }
                    }
                }

                if (this.chartsEnabled && this.containerId) {
                    try {
                        const extra = await this.listContainerImageFiles(this.containerId);
                        for (const img of extra) pendingImages.push(img);
                    } catch (_) {}
                }

                for (const img of pendingImages) {
                    const key = `${img.containerId || ''}:${img.fileId}`;
                    if (!img.fileId || shownFiles.has(key)) continue;
                    shownFiles.add(key);
                    await this.displayGeneratedFile(img.fileId, img.containerId);
                }

                if (!fullContent && data.output_text) {
                    fullContent = data.output_text;
                }

                if (fullContent) {
                    this.addMessage(fullContent, 'assistant');
                    this.updateStatus('Analysis complete!', 'ready');
                } else if (shownFiles.size > 0) {
                    this.updateStatus('Analysis complete!', 'ready');
                }
            }

            async listContainerImageFiles(containerId) {
                const response = await fetch(`https://api.openai.com/v1/containers/${containerId}/files`, {
                    headers: this.openaiHeaders(false),
                    signal: (this.fetchController && this.fetchController.signal) || undefined
                });
                if (!response.ok) return [];
                const data = await response.json();
                const files = data.data || data.files || [];
                return files
                    .filter(f => f && f.id && this.isChartFileName(f.path || f.filename || f.id) && f.source === 'assistant')
                    .map(f => ({
                        fileId: f.id,
                        containerId: f.container_id || containerId
                    }));
            }

            async displayGeneratedFile(fileId, containerId) {
                try {
                    let res = null;
                    if (containerId) {
                        res = await fetch(`https://api.openai.com/v1/containers/${containerId}/files/${fileId}/content`, {
                            headers: { 'Authorization': `Bearer ${this.acToAdj}` },
                            signal: (this.fetchController && this.fetchController.signal) || undefined
                        });
                    }
                    if (!res || !res.ok) {
                        res = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
                            headers: { 'Authorization': `Bearer ${this.acToAdj}` },
                            signal: (this.fetchController && this.fetchController.signal) || undefined
                        });
                    }
                    if (!res.ok) {
                        throw new Error(`Image fetch failed (${res.status})`);
                    }
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);

                    const imageDiv = document.createElement('div');
                    imageDiv.className = 'chart-container';
                    imageDiv.innerHTML = `<img src="${url}" alt="Generated Chart" style="max-width: 100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);"/>`;
                    this.messagesContainer.appendChild(imageDiv);
                    this.scrollToBottom();
                } catch (err) {
                }
            }

            async displayImageFile(fileId) {
                await this.displayGeneratedFile(fileId, this.containerId);
            }

            // Now using OpenAI Responses API + Code Interpreter for all analysis

            createMessageContainer(role) {
                const messageDiv = document.createElement('div');
                messageDiv.className = `message ${role}`;

                const avatar = document.createElement('div');
                avatar.className = 'avatar';
                if (role === 'user') {
                    avatar.textContent = 'You';
                } else {
                    avatar.innerHTML = '<img src="./chat.png" alt="AI" />';
                }

                const messageContent = document.createElement('div');
                messageContent.className = 'message-content';

                messageDiv.appendChild(avatar);
                messageDiv.appendChild(messageContent);
                this.messagesContainer.appendChild(messageDiv);
                
                this.scrollToBottom();
                return messageDiv;
            }

            addMessage(content, role) {
                const messageDiv = this.createMessageContainer(role);
                const contentDiv = messageDiv.querySelector('.message-content');
                contentDiv.innerHTML = this.formatContent(content);
            }

            formatContent(content) {
                // Parse Markdown and sanitize
                try {
                    if (window.marked) {
                        marked.setOptions({ gfm: true, breaks: true });
                    }
                const parsed = window.marked ? marked.parse(content || '') : (content || '').replace(/\n/g, '<br>');
                const clean = window.DOMPurify ? DOMPurify.sanitize(parsed) : parsed;
                    // Enhance tables
                    const container = document.createElement('div');
                const isSingleLine = (content || '').trim().indexOf('\n') === -1 && (content || '').trim().length <= 60;
                container.className = 'markdown-body' + (isSingleLine ? ' compact' : '');
                container.innerHTML = clean;
                    const tables = container.querySelectorAll('table');
                    tables.forEach((table) => {
                        table.classList.add('data-table');
                        const totalRows = table.querySelectorAll('tbody tr').length;
                        const wrapper = document.createElement('div');
                        wrapper.className = 'table-container';
                        if (totalRows > 10) {
                            wrapper.classList.add('collapsed');
                            const controls = document.createElement('div');
                            controls.className = 'table-controls';
                            controls.innerHTML = `
                                <div class=\"table-info\">Showing ${Math.min(10, totalRows)} of ${totalRows} results</div>
                                <button class=\"expand-button\" onclick=\"toggleTable(this)\">Show All</button>
                            `;
                            wrapper.appendChild(controls);
                        }
                        table.parentNode.insertBefore(wrapper, table);
                        wrapper.appendChild(table);
                        // Add a small spacer after each table to separate following text
                        const spacer = document.createElement('div');
                        spacer.style.height = '12px';
                        wrapper.after(spacer);
                    });
                    return container.outerHTML;
                } catch (e) {
                    return (content || '')
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/\n/g, '<br>');
                }
            }

            scrollToBottom() {
                setTimeout(() => {
                    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                }, 100);
            }

            setLoading(isLoading) {
                // Do NOT disable the send button so user can stop
                this.messageInput.disabled = isLoading;

                // Manage assistant typing bubble
                if (isLoading) {
                    if (!this.typingMessageEl) {
                        const typingMsg = this.createMessageContainer('assistant');
                        typingMsg.classList.add('typing-message');
                        typingMsg.querySelector('.message-content').innerHTML = `
                            <div class="typing">
                                <div class="typing-dot"></div>
                                <div class="typing-dot"></div>
                                <div class="typing-dot"></div>
                            </div>
                        `;
                        this.typingMessageEl = typingMsg;
                    }
                } else {
                    if (this.typingMessageEl) {
                        this.typingMessageEl.remove();
                        this.typingMessageEl = null;
                    }
                }
            }

            setStopUI(active) {
                try {
                    const iconSpan = this.sendButton.querySelector('span');
                    if (active) {
                        this.sendButton.classList.add('stop');
                        if (iconSpan) iconSpan.innerHTML = '<i class="fas fa-stop"></i>';
                        this.sendButton.setAttribute('data-i18n', 'tooltips.stop');
                        this.sendButton.setAttribute('data-i18n-attr', 'title');
                        window.translateElement && window.translateElement(this.sendButton, window.currentTranslations);
                    } else {
                        this.sendButton.classList.remove('stop');
                        if (iconSpan) iconSpan.innerHTML = '<i class="fas fa-chevron-up"></i>';
                        this.sendButton.setAttribute('data-i18n', 'tooltips.send');
                        this.sendButton.setAttribute('data-i18n-attr', 'title');
                        window.translateElement && window.translateElement(this.sendButton, window.currentTranslations);
                    }
                } catch (_) {}
            }

            async stopRequest() {
                const responseId = this.currentResponseId;
                try {
                    this.cancelRequested = true;
                    if (!this.fetchController) this.fetchController = new AbortController();
                    try { this.fetchController.abort(); } catch(_) {}
                    await this.cancelResponse(responseId);
                    this.updateStatus('Stopped', 'ready');
                } catch (_) {
                } finally {
                    this.setLoading(false);
                    this.setStopUI(false);
                    this.cancelRequested = false;
                    this.fetchController = null;
                    this.currentResponseId = null;
                }
            }

            isAbortError(error) {
                if (!error) return false;
                const msg = String(error && (error.message || error.toString() || ''));
                return (
                    error.name === 'AbortError' ||
                    /aborted/i.test(msg) ||
                    /cancelled/i.test(msg) ||
                    /canceled/i.test(msg)
                );
            }

            // Helper function to get quota display text
            getQuotaDisplayText() {
                if (!this.currentMemberId) return '';
                
                const cached = this.getQuotaCache(this.currentMemberId);
                if (!cached) return '';
                
                // Check if this is a banned user (count: 999)
                const isBannedUser = cached.count === 999;
                
                if (isBannedUser) {
                    // For banned users, always show 0/0 with no reset date
                    return ` <span class="quota-display" data-used="0" data-total="0" data-remaining="0" data-reset="">0 <i class="fas fa-bolt"></i></span>`;
                }
                
                const used = cached.count || 0;
                const totalLimit = this.MONTHLY_LIMIT + (cached.extendedQuota || 0);
                const remaining = totalLimit - used;
                
                return ` <span class="quota-display" data-used="${used}" data-total="${totalLimit}" data-remaining="${remaining}" data-reset="${cached.resetAt || ''}">${remaining} <i class="fas fa-bolt"></i></span>`;
            }

            // Refresh quota display in status
            refreshQuotaDisplay() {
                if (this.status && this.status.querySelector('.status-text')) {
                    const statusText = this.status.querySelector('.status-text');
                    if (statusText.textContent.includes('Ready!')) {
                        this.updateStatus('Ready!', 'ready');
                    }
                }
            }

            // Setup quota tooltip functionality
            setupQuotaTooltip() {
                // Handle clicks (for non-hover devices)
                document.addEventListener('click', (e) => {
                    // Close tooltip if clicking outside
                    if (!e.target.closest('.quota-display') && !e.target.closest('.quota-tooltip')) {
                        this.closeQuotaTooltip();
                    }
                });

                // Handle quota display clicks
                document.addEventListener('click', (e) => {
                    const quotaDisplay = e.target.closest('.quota-display');
                    if (quotaDisplay) {
                        this.toggleQuotaTooltip(quotaDisplay, e);
                    }
                });
            }

            // Show quota tooltip
            showQuotaTooltip(quotaDisplay) {
                // Don't show if already visible
                if (document.querySelector('.quota-tooltip')) return;
                
                const used = parseInt(quotaDisplay.dataset.used);
                const total = parseInt(quotaDisplay.dataset.total);
                const remaining = parseInt(quotaDisplay.dataset.remaining);
                const resetAt = quotaDisplay.dataset.reset;

                // Calculate reset date (like limit reached but no minutes/hours)
                let resetDate = '';
                if (resetAt) {
                    const resetTime = parseInt(resetAt);
                    if (resetTime) {
                        const resetDateObj = new Date(resetTime);
                        // Force European date format: DD.MM.YY
                        const day = resetDateObj.getDate().toString().padStart(2, '0');
                        const month = (resetDateObj.getMonth() + 1).toString().padStart(2, '0');
                        const year = resetDateObj.getFullYear().toString().slice(-2);
                        resetDate = `${day}.${month}.${year}`;
                    }
                }

                // Create tooltip with clean icons
                const tooltip = document.createElement('div');
                tooltip.className = 'quota-tooltip';
                tooltip.innerHTML = `
                    <div class="tooltip-content">
                        <div class="quota-row">
                            <span class="quota-label">${used}</span>
                            <span class="quota-separator">/</span>
                            <span class="quota-value">${total}</span>
                        </div>
                        ${resetDate ? `
                        <div class="quota-row">
                            <i class="fas fa-redo"></i>
                            <span class="quota-label">${resetDate}</span>
                        </div>
                        ` : ''}
                    </div>
                `;

                // Position tooltip UNDER the quota display but LEFT-aligned
                const rect = quotaDisplay.getBoundingClientRect();
                tooltip.style.position = 'fixed';
                tooltip.style.left = `${rect.left - 84}px`; // 100px to the left so it's centered under
                tooltip.style.top = `${rect.bottom + 15}px`; // 25px lower to align with title bar
                tooltip.style.zIndex = '1000';

                document.body.appendChild(tooltip);
            }

            // Toggle quota tooltip (for clicks)
            toggleQuotaTooltip(quotaDisplay, event) {
                const existingTooltip = document.querySelector('.quota-tooltip');
                if (existingTooltip) {
                    this.closeQuotaTooltip();
                    return;
                }

                this.showQuotaTooltip(quotaDisplay);
            }

            // Close quota tooltip
            closeQuotaTooltip() {
                const tooltip = document.querySelector('.quota-tooltip');
                if (tooltip) {
                    tooltip.remove();
                }
            }

            updateStatus(message, type) {
                const statusElement = this.status;
                const indicator = statusElement.querySelector('.status-indicator');
                
                // Get translated base message first
                let displayMessage = message;
                let i18nKey = null;
                
                try {
                    if (window.currentTranslations) {
                        const statusMap = {
                            'Stopped': 'status.stopped',
                            'Analysis complete!': 'status.analysisComplete',
                            'Analyzing data...': 'status.analyzingData',
                            'Running calculations...': 'status.runningCalculations',
                            'Error': 'status.error',
                            'Ready!': 'status.ready',
                            'Starting new chat...': 'status.startingNewChat',
                            'Setting up conversation...': 'status.settingUpConversation',
                            'Loading AI assistant...': 'status.loadingAIAssistant',
                            'Reading dataset...': 'status.readingDataset',
                            'No access': 'status.noAccess',
                            'Login required': 'status.loginRequired'
                        };
                        i18nKey = statusMap[message];
                        
                        // Translate the base message first
                        if (i18nKey) {
                            const keys = i18nKey.split('.');
                            let value = window.currentTranslations;
                            for (const key of keys) {
                                if (value === undefined || value === null) break;
                                value = value[key];
                            }
                            if (value) {
                                displayMessage = value;
                            }
                        }
                    }
                } catch (_) {}
                
                            // Add quota info to ready status and analysis complete
            if (type === 'ready' && (message === 'Ready!' || message === 'Analysis complete!')) {
                const quotaText = this.getQuotaDisplayText();
                if (quotaText) {
                    displayMessage += ' <span class="status-separator">|</span>' + quotaText;
                }
            }
                
                statusElement.innerHTML = `
                    <div class="status-indicator"></div>
                    <span class="status-text">${displayMessage}</span>
                `;
                
                const newIndicator = statusElement.querySelector('.status-indicator');
                
                switch (type) {
                    case 'loading':
                        newIndicator.style.background = '#f59e0b';
                        break;
                    case 'ready':
                        newIndicator.style.background = '#4ade80';
                        break;
                    case 'error':
                        newIndicator.style.background = '#ef4444';
                        break;
                }
            }
            

            showDataInsights() {
                const insightsHTML = `<div data-i18n="welcomeMsg">How can I help you today? <br><br>I am trained on the 2026/27 and 2026 DataMB Pro dataset (40 leagues). I can answer any question about the data and handle complex requests — from metric definitions to advanced analysis, scouting reports, and deeper insights. <br><br>Enable the graph toggle for on-demand charts and visual queries.</div>`;
                
                const insightMessage = this.createMessageContainer('assistant');
                const contentDiv = insightMessage.querySelector('.message-content');
                contentDiv.innerHTML = insightsHTML;
            }

            showError(message) {
                const errorHTML = `
                    <div class="error">
                        ${message}
                    </div>
                `;
                
                const errorMessage = this.createMessageContainer('assistant');
                const contentDiv = errorMessage.querySelector('.message-content');
                contentDiv.innerHTML = errorHTML;
                try {
                    // If message matches known i18n errors, tag it
                    const map = {
                        'You must be logged in': 'errors.loginRequired'
              
                  };
          
              const key = map[message];
                    if (key) {
                        const errEl = contentDiv.querySelector('.error');
                        errEl.setAttribute('data-i18n', key);
                        window.translateElement && window.translateElement(errEl, window.currentTranslations);
                    }
                } catch (_) {}
            }
            
            // Resolve league alias phrases to explicit league lists
            resolveLeagueAliases(text) {
                if (!text) return null;
                const t = text.toLowerCase();
                const top5 = ["Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1"];
                const top7 = ["Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1", "Liga Portugal", "Eredivisie"];
                const isTop5 = /(europe'?s\s*top\s*5|\btop\s*5\s*leagues\b|\bbig\s*5\b)/i.test(text);
                const isTop7 = /(europe'?s\s*top\s*7|\btop\s*7\s*leagues\b)/i.test(text);
                if (isTop7) {
                    return { name: "Europe's Top 7", list: top7 };
                }
                if (isTop5) {
                    return { name: "Europe's Top 5", list: top5 };
                }
                return null;
            }
        }

        // Cache clearing and reload functions for payment flow
        function clearCacheAndShowReload() {
            if (window.chatbot) {
                window.chatbot.quotaCache = {};
                                 const reloadButton = `<button onclick="window.location.reload()" class="payment-link" style="border: none; cursor: pointer; font-family: inherit;"><i class="fas fa-sync-alt"></i></button>`;
                
                const reloadMessage = `
                    <div class="reload-message" data-i18n="payment.reloadMessage">
                        Payment page opened in new tab. After completing payment, click the button below to refresh the page.
                    </div>
                    ${reloadButton}
                `;
                const messageContainer = window.chatbot.createMessageContainer('assistant');
                const contentDiv = messageContainer.querySelector('.message-content');
                contentDiv.innerHTML = reloadMessage;
            }
        }

 
        document.addEventListener('DOMContentLoaded', function() {
            window.chatbot = new UltimateFootballAI();
        });
        // Global toggle for collapsible tables
        function toggleTable(button) {
            const tableContainer = button.closest('.table-container');
            const isExpanded = tableContainer.classList.contains('expanded');
            if (isExpanded) {
                tableContainer.classList.remove('expanded');
                tableContainer.classList.add('collapsed');
                button.textContent = 'Show All';
            } else {
                tableContainer.classList.remove('collapsed');
                tableContainer.classList.add('expanded');
                button.textContent = 'Show Less';
            }
        }
