(function () {
    'use strict';

    // ========== 日志系统 ==========
    const mmiLogBuffer = [];
    const MMI_Log = {
        log: function (...args) {
            const msg = args.join(' ');
            console.log(...args);
            mmiLogBuffer.push(msg);
            if (mmiLogBuffer.length > 200) mmiLogBuffer.shift();
        }
    };

    // ========== 全局可调用 API ==========
    window.MMI = window.MMI || {};
    window.MMI.refreshAll = () => {
        document.querySelectorAll('.mes').forEach(m => refreshFloat(m));
    };
    window.MMI.resetAll = () => {
        const context = SillyTavern.getContext();
        if (!context) return MMI_Log.log('MMI: no context');
        const scopes = getScopes();
        scopes.ai = scopes.user = scopes.all = null;
        if (context.chat) {
            context.chat.forEach(m => {
                if (m.extra) {
                    delete m.extra.pinned_this;
                    delete m.extra.display_text;
                }
            });
        }
        document.querySelectorAll('.model-info-float').forEach(f => f.remove());
        document.querySelectorAll('.mmi-editor-wrapper').forEach(e => e.remove());
        MMI_Log.log('MMI: all display data cleared.');
    };

    // ========== 主启动 ==========
    const init = function () {
        try {
            if (typeof SillyTavern === 'undefined' || !SillyTavern.getContext) {
                setTimeout(init, 500);
                return;
            }
            const context = SillyTavern.getContext();
            if (!context || !context.eventSource) {
                setTimeout(init, 500);
                return;
            }

            // ========== 注入极简样式 ==========
            const styleId = 'mmi-style';
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = `
                    .model-info-float {
                        position: absolute;
                        top: -14px;
                        right: 10px;
                        z-index: 1000;
                        white-space: nowrap;
                        pointer-events: auto;
                        cursor: pointer;
                        background: transparent;
                        color: var(--SmartThemeQuoteColor, rgba(150,150,150,0.8));
                        font-size: 10px;
                        font-style: italic;
                        letter-spacing: 0.3px;
                        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                        display: none;
                        padding: 0 4px;
                        transition: opacity 0.2s, color 0.2s;
                        opacity: 0.4;
                        user-select: none;
                    }
                    .model-info-float.force-visible,
                    .model-info-float.editing {
                        display: block;
                    }
                    .model-info-float.pinned,
                    .model-info-float.scope-visible,
                    .model-info-float.mmi-editing,
                    .model-info-float.always-visible {
                        opacity: 1;
                    }
                    .model-info-float:hover {
                        color: rgba(255,255,255,0.9);
                        opacity: 0.9;
                    }
                    .mmi-editor-wrapper {
                        position: absolute;
                        top: -16px;
                        right: 10px;
                        z-index: 1001;
                        background: rgba(20,20,20,0.95);
                        border-radius: 4px;
                        padding: 4px 6px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                        display: none;
                        flex-direction: column;
                        gap: 4px;
                        font-style: normal;
                        border: 1px solid rgba(255,255,255,0.05);
                    }
                    .mmi-editor-input {
                        background: transparent;
                        border: none;
                        border-bottom: 1px dashed rgba(128,128,128,0.5);
                        color: rgba(255,255,255,0.9);
                        font-size: 11px;
                        font-family: monospace;
                        padding: 2px 0;
                        width: 200px;
                        outline: none;
                    }
                    .mmi-editor-input:focus {
                        border-bottom: 1px solid rgba(255,255,255,0.9);
                    }
                    .mmi-toolbar {
                        display: flex;
                        gap: 8px;
                        justify-content: flex-end;
                        margin-top: 2px;
                    }
                    .mmi-btn {
                        background: transparent;
                        border: none;
                        color: rgba(150,150,150,0.8);
                        font-size: 10px;
                        cursor: pointer;
                        padding: 0;
                        letter-spacing: 1px;
                        transition: color 0.2s;
                    }
                    .mmi-btn:hover {
                        color: rgba(255,255,255,0.9);
                    }
                    .mmi-sub-panel {
                        display: none;
                        justify-content: flex-end;
                        gap: 6px;
                        padding-top: 4px;
                        border-top: 1px solid rgba(255,255,255,0.05);
                        margin-top: 2px;
                        flex-wrap: wrap;
                    }
                    .mmi-sub-btn {
                        background: transparent;
                        border: none;
                        color: rgba(200,200,200,0.85);
                        font-size: 10px;
                        cursor: pointer;
                        padding: 0;
                    }
                    .mmi-sub-btn:hover {
                        color: rgba(255,255,255,0.95);
                    }
                    .mmi-pin-btn {
                        color: rgba(220,220,220,0.85);
                    }
                    .mmi-pin-btn:hover {
                        color: rgba(255,255,255,0.95);
                    }
                    .mmi-clear-btn {
                        color: rgba(170,170,170,0.75);
                        font-size: 9px;
                    }
                    .mmi-clear-btn:hover {
                        color: rgba(255,255,255,0.9);
                    }
                    .mmi-always-btn {
                        color: rgba(180,180,180,0.9);
                    }
                    .mmi-always-btn.active {
                        color: rgba(220,220,220,0.95);
                        text-shadow: 0 0 4px rgba(255,255,255,0.3);
                    }
                    /* 日志面板 */
                    .mmi-log-panel {
                        display: none;
                        background: rgba(20,20,20,0.95);
                        border: 1px solid rgba(255,255,255,0.05);
                        border-radius: 4px;
                        max-height: 150px;
                        overflow-y: auto;
                        padding: 4px;
                        font-family: monospace;
                        font-size: 10px;
                        color: rgba(200,200,200,0.9);
                        margin-top: 4px;
                        line-height: 1.4;
                    }
                    .mmi-log-line {
                        white-space: pre-wrap;
                        word-break: break-all;
                        padding: 2px 0;
                        border-bottom: 1px solid rgba(255,255,255,0.03);
                    }
                    .mmi-log-line:last-child {
                        border-bottom: none;
                    }
                `;
                document.head.appendChild(style);
            }

            // ========== 全局常驻开关 ==========
            let alwaysShowFloats = localStorage.getItem('mmi_alwaysShowFloats') === 'true';

            function setAlwaysShowFloats(val) {
                alwaysShowFloats = !!val;
                localStorage.setItem('mmi_alwaysShowFloats', alwaysShowFloats);
                updateAllAlwaysButtons();
                refreshAllFloats();
            }

            function updateAllAlwaysButtons() {
                document.querySelectorAll('.mmi-always-btn').forEach(btn => {
                    btn.textContent = alwaysShowFloats ? '常驻：开' : '常驻：关';
                    if (alwaysShowFloats) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
            }

            MMI_Log.log('Message Model Info: extension loaded (advanced editor).');

            context.eventSource.on('appReady', function () {
                if (typeof toastr !== 'undefined') {
                    toastr.info('扩展"Message Model Info"已加载！');
                } else {
                    MMI_Log.log('Extension loaded.');
                }
                setupFloatSystem();
            });

            // ========== 工具函数 ==========
            function escapeHTML(str) {
                const div = document.createElement('div');
                div.appendChild(document.createTextNode(str));
                return div.innerHTML;
            }

            function getCurrentModel() {
                const el = document.querySelector('#model_custom_select');
                if (el && el.selectedIndex >= 0) {
                    const val = el.options[el.selectedIndex].text.trim();
                    if (val && val !== '-- 连接到 API --') return val;
                }
                const inp = document.querySelector('#custom_model_id');
                if (inp && inp.value.trim() !== '') return inp.value.trim();
                return 'Unknown Model';
            }

            function getCurrentPreset() {
                const el = document.querySelector('#settings_preset_openai');
                if (el && el.selectedIndex >= 0) {
                    const val = el.options[el.selectedIndex].text.trim();
                    if (val) return val;
                }
                const generic = document.querySelector('#settings_preset');
                if (generic && generic.selectedIndex >= 0) {
                    const val = generic.options[generic.selectedIndex].text.trim();
                    if (val) return val;
                }
                return 'Default';
            }

            function getLastAIFloor() {
                const allMessages = document.querySelectorAll('.mes');
                for (let i = allMessages.length - 1; i >= 0; i--) {
                    const el = allMessages[i];
                    if (el.classList.contains('user')) continue;
                    const floorEl = el.querySelector('.mesIDDisplay');
                    if (floorEl) {
                        const text = floorEl.textContent.trim();
                        const match = text.match(/\d+/);
                        if (match) return parseInt(match[0], 10);
                    }
                }
                return -1;
            }

            function getMessageByFloor(floor) {
                const chat = context.chat;
                if (Array.isArray(chat) && floor >= 0 && floor < chat.length) return chat[floor];
                return null;
            }

            function recordSwipe(msg, swipeId) {
                if (!msg || msg.is_user !== false) return;
                if (!msg.extra) msg.extra = {};
                if (!msg.extra.swipe_info) msg.extra.swipe_info = {};
                const key = String(swipeId);
                if (msg.extra.swipe_info[key]) return;
                const model = getCurrentModel();
                const preset = getCurrentPreset();
                msg.extra.swipe_info[key] = {
                    model_used: model,
                    preset_used: preset,
                    timestamp: Date.now()
                };
                const floor = context.chat.indexOf(msg);
                MMI_Log.log(`[MMI] recorded swipe ${key} (${floor >= 0 ? '#' + floor : '?'}) => ${model} | ${preset}`);
            }

            function fillMissingSwipes(msg) {
                if (!msg || !msg.swipes) return;
                for (let i = 0; i < msg.swipes.length; i++) recordSwipe(msg, i);
            }

            // ========== 监控器 ==========
            let activeMonitorId = null;
            let stopRequested = false;

            function stopMonitor(reason) {
                if (activeMonitorId) {
                    clearInterval(activeMonitorId);
                    activeMonitorId = null;
                    MMI_Log.log('[MMI] Monitor ended (' + reason + ')');
                }
            }

            function finalizeAndRecord(options) {
                stopRequested = false;
                const delay = 3000;
                const doRecord = () => {
                    if (options.type === 'new_message') {
                        const currentFloor = getLastAIFloor();
                        if (currentFloor > options.floor) {
                            const msg = getMessageByFloor(currentFloor);
                            if (msg) recordSwipe(msg, 0);
                        } else if (currentFloor === options.floor) {
                            MMI_Log.log('[MMI] No new message generated');
                        }
                    } else if (options.type === 'more_replies') {
                        const msg = getMessageByFloor(options.floor);
                        if (msg) fillMissingSwipes(msg);
                    } else if (options.type === 'regenerate') {
                        const msg = getMessageByFloor(options.floor);
                        if (msg && msg !== options.oldMsg && msg.is_user === false) recordSwipe(msg, 0);
                    }
                    stopMonitor('done');
                    setTimeout(() => {
                        if (options.floor !== undefined) {
                            document.querySelectorAll('.mes').forEach(el => {
                                const f = getFloorFromElement(el);
                                if (f === options.floor) refreshFloat(el);
                            });
                        }
                    }, 300);
                };
                setTimeout(doRecord, delay);
            }

            function startMonitor(options) {
                stopMonitor('restart');
                stopRequested = false;
                MMI_Log.log('[MMI] Monitor started for ' + options.type);
                const startTime = Date.now();
                const timeout = 120000;
                activeMonitorId = setInterval(() => {
                    if (stopRequested) { finalizeAndRecord(options); return; }
                    let done = false;
                    if (options.type === 'new_message') {
                        if (getLastAIFloor() > options.floor) done = true;
                    } else if (options.type === 'more_replies') {
                        const msg = getMessageByFloor(options.floor);
                        if (msg && Array.isArray(msg.swipes) && msg.swipes.length > options.oldSwipeCount) done = true;
                    } else if (options.type === 'regenerate') {
                        const msg = getMessageByFloor(options.floor);
                        if (msg && msg !== options.oldMsg && msg.is_user === false) done = true;
                    }
                    if (done) { finalizeAndRecord(options); return; }
                    if (Date.now() - startTime > timeout) { stopMonitor('timeout'); }
                }, 800);
            }

            // ========== 用户动作监听 ==========
            $(document).on('click', '.fa-paper-plane', function (e) {
                if (!$(e.target).is(':visible')) return;
                MMI_Log.log('[MMI] Send button clicked');
                const lastFloor = getLastAIFloor();
                if (lastFloor === -1) return;
                startMonitor({ type: 'new_message', floor: lastFloor });
            });

            $(document).on('click', '.mes .swipe_right', function (e) {
                if (!$(e.target).is(':visible')) return;
                MMI_Log.log('[MMI] More replies button clicked');
                const mesEl = $(this).closest('.mes')[0];
                const floor = mesEl ? getFloorFromElement(mesEl) : -1;
                if (floor === -1) return;
                const msg = getMessageByFloor(floor);
                if (!msg) return;
                const curCount = Array.isArray(msg.swipes) ? msg.swipes.length : 0;
                startMonitor({ type: 'more_replies', floor: floor, oldSwipeCount: curCount });
                setTimeout(() => { if (mesEl) refreshFloat(mesEl); }, 200);
            });

            $(document).on('click', '.mes .swipe_left', function (e) {
                const mesEl = $(this).closest('.mes')[0];
                if (!mesEl) return;
                setTimeout(() => refreshFloat(mesEl), 200);
            });

            $(document).on('click', '#option_regenerate', function (e) {
                if (!$(e.target).is(':visible')) return;
                MMI_Log.log('[MMI] Regenerate button clicked');
                const lastFloor = getLastAIFloor();
                if (lastFloor === -1) return;
                const oldMsg = getMessageByFloor(lastFloor);
                if (!oldMsg || oldMsg.is_user !== false) return;
                startMonitor({ type: 'regenerate', floor: lastFloor, oldMsg: oldMsg });
            });

            $(document).on('click', '.fa-circle-stop', function (e) {
                if (!$(e.target).is(':visible')) return;
                MMI_Log.log('[MMI] Stop button clicked');
                stopRequested = true;
            });

            // ========== 编辑按钮处理 ==========
            $(document).on('click', '.mes_edit, .message_edit, [title="编辑"], [title="Edit"]', function (e) {
                const mesEl = $(this).closest('.mes')[0];
                if (!mesEl) return;
                const floor = getFloorFromElement(mesEl);
                if (floor >= 0) {
                    MMI_Log.log(`[MMI] show float for #${floor} (edit mode)`);
                }
                mesEl.classList.add('mmi-editing');
                ensureFloatStructure(mesEl);
                const float = mesEl.querySelector('.model-info-float');
                if (float && floor >= 0) {
                    const msg = context.chat[floor];
                    if (msg) {
                        const fmt = (msg.extra && msg.extra.custom_format) ? msg.extra.custom_format : globalTemplate;
                        float.textContent = parseTemplate(fmt, msg);
                        float.style.display = 'block';
                        float.classList.add('force-visible');
                    }
                }
            });

            // ========== 模板系统 ==========
            const STORAGE_KEY_TEMPLATE = 'mmi_globalTemplate';
            let globalTemplate = localStorage.getItem(STORAGE_KEY_TEMPLATE) || '{model} ~ {preset}';

            function saveGlobalTemplate(val) {
                globalTemplate = val;
                localStorage.setItem(STORAGE_KEY_TEMPLATE, val);
            }

            function getScopes() {
                if (!context.chatMetadata) context.chatMetadata = {};
                if (!context.chatMetadata.mmi) context.chatMetadata.mmi = {};
                if (!context.chatMetadata.mmi.scopes) context.chatMetadata.mmi.scopes = { ai: null, user: null, all: null };
                return context.chatMetadata.mmi.scopes;
            }

            function parseTemplate(templateStr, msg) {
                let model = 'N/A', preset = 'N/A';
                if (msg && msg.extra && msg.extra.swipe_info) {
                    const key = String(msg.swipe_id || 0);
                    if (msg.extra.swipe_info[key]) {
                        model = msg.extra.swipe_info[key].model_used || 'N/A';
                        preset = msg.extra.swipe_info[key].preset_used || 'N/A';
                    }
                }
                if (model === 'N/A') model = getCurrentModel();
                if (preset === 'N/A') preset = getCurrentPreset();

                const userName = context.name1 || 'User';
                const charName = context.name2 || 'Char';

                return templateStr
                    .replace(/{model}/g, model)
                    .replace(/{preset}/g, preset)
                    .replace(/{user}/g, userName)
                    .replace(/{char}/g, charName);
            }

            function getDisplayTextForMsg(msg) {
                if (msg.extra && msg.extra.pinned_this && msg.extra.display_text) {
                    return parseTemplate(msg.extra.display_text, msg);
                }
                const scopes = getScopes();
                if (msg.is_user === false && scopes.ai) return parseTemplate(scopes.ai, msg);
                if (msg.is_user === true && scopes.user) return parseTemplate(scopes.user, msg);
                if (scopes.all) return parseTemplate(scopes.all, msg);

                const fmt = (msg.extra && msg.extra.custom_format) ? msg.extra.custom_format : globalTemplate;
                return parseTemplate(fmt, msg);
            }

            function isFloatPinnedOrScoped(msg) {
                if (msg.extra && msg.extra.pinned_this) return true;
                const scopes = getScopes();
                if (msg.is_user === false && scopes.ai) return true;
                if (msg.is_user === true && scopes.user) return true;
                if (scopes.all) return true;
                return false;
            }

            function getFloorFromElement(mesEl) {
                const floorEl = mesEl.querySelector('.mesIDDisplay');
                if (!floorEl) return -1;
                const match = floorEl.textContent.trim().match(/\d+/);
                return match ? parseInt(match[0], 10) : -1;
            }

            function refreshFloat(mesEl) {
                const floor = getFloorFromElement(mesEl);
                if (floor < 0 || floor >= context.chat.length) return;
                const msg = context.chat[floor];
                if (!msg) return;

                const float = mesEl.querySelector('.model-info-float');
                if (!float) return;

                const isEditing = mesEl.classList.contains('mmi-editing') ||
                                  !!mesEl.querySelector('.edit_textarea, textarea.mes_edit_area');

                if (isEditing) {
                    const fmt = (msg.extra && msg.extra.custom_format) ? msg.extra.custom_format : globalTemplate;
                    float.textContent = parseTemplate(fmt, msg);
                    float.style.display = 'block';
                    float.classList.add('force-visible');
                } else {
                    float.textContent = getDisplayTextForMsg(msg);
                    const shouldShow = isFloatPinnedOrScoped(msg) || alwaysShowFloats;
                    if (shouldShow) {
                        float.style.display = 'block';
                        float.classList.add('force-visible');
                        if (alwaysShowFloats) float.classList.add('always-visible');
                        if (isFloatPinnedOrScoped(msg)) float.classList.add('scope-visible');
                    } else {
                        float.style.display = 'none';
                        float.classList.remove('force-visible', 'scope-visible', 'always-visible');
                    }
                }
            }

            function refreshAllFloats() {
                document.querySelectorAll('.mes').forEach(mes => refreshFloat(mes));
            }

            function renderLogPanel(panel) {
                panel.innerHTML = mmiLogBuffer.map(line => `<div class="mmi-log-line">${escapeHTML(line)}</div>`).join('');
                panel.scrollTop = panel.scrollHeight;
            }

            function ensureFloatStructure(mesEl) {
                if (mesEl.querySelector('.model-info-float')) return;

                const floor = getFloorFromElement(mesEl);
                if (floor < 0) return;
                const msg = context.chat[floor];
                if (!msg) return;

                const float = document.createElement('div');
                float.className = 'model-info-float';
                float.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEditor(mesEl);
                });
                mesEl.style.position = 'relative';
                mesEl.appendChild(float);

                const editor = document.createElement('div');
                editor.className = 'mmi-editor-wrapper';
                editor.id = 'mmi-editor-' + floor;

                const curFmt = (msg.extra && msg.extra.custom_format) ? msg.extra.custom_format : globalTemplate;

                // 工具栏：日志 辅助 展示 保存 模板 常驻 取消
                editor.innerHTML = `
                    <input type="text" class="mmi-editor-input" value="${curFmt.replace(/"/g, '&quot;')}">
                    <div class="mmi-toolbar">
                        <button class="mmi-btn mmi-log-btn">日志</button>
                        <button class="mmi-btn mmi-helper-btn">辅助</button>
                        <button class="mmi-btn mmi-pin-btn-display">展示</button>
                        <button class="mmi-btn mmi-save-btn">保存</button>
                        <button class="mmi-btn mmi-template-btn">模板</button>
                        <button class="mmi-btn mmi-always-btn">${alwaysShowFloats ? '常驻：开' : '常驻：关'}</button>
                        <button class="mmi-btn mmi-cancel-btn">取消</button>
                    </div>
                    <!-- 日志面板 -->
                    <div class="mmi-log-panel"></div>
                    <div class="mmi-sub-panel mmi-helper-panel">
                        <button class="mmi-sub-btn mmi-insert-model">+模型</button>
                        <button class="mmi-sub-btn mmi-insert-preset">+预设</button>
                        <button class="mmi-sub-btn mmi-insert-user">+User</button>
                        <button class="mmi-sub-btn mmi-insert-char">+Char</button>
                    </div>
                    <div class="mmi-sub-panel mmi-pin-panel">
                        <button class="mmi-sub-btn mmi-pin-btn mmi-pin-this">常驻此条</button>
                        <button class="mmi-sub-btn mmi-pin-btn mmi-pin-ai">常驻AI</button>
                        <button class="mmi-sub-btn mmi-pin-btn mmi-pin-user">常驻User</button>
                        <button class="mmi-sub-btn mmi-pin-btn mmi-pin-all">常驻全体</button>
                        <button class="mmi-sub-btn mmi-clear-btn mmi-pin-clear">清除展示</button>
                    </div>
                `;
                mesEl.appendChild(editor);

                const input = editor.querySelector('.mmi-editor-input');

                // 日志按钮事件
                editor.querySelector('.mmi-log-btn').addEventListener('click', () => {
                    const logPanel = editor.querySelector('.mmi-log-panel');
                    const isVisible = logPanel.style.display === 'block';
                    if (isVisible) {
                        logPanel.style.display = 'none';
                    } else {
                        editor.querySelector('.mmi-helper-panel').style.display = 'none';
                        editor.querySelector('.mmi-pin-panel').style.display = 'none';
                        renderLogPanel(logPanel);
                        logPanel.style.display = 'block';
                    }
                });

                // 辅助按钮：隐藏日志和展示面板
                editor.querySelector('.mmi-helper-btn').addEventListener('click', () => {
                    const hp = editor.querySelector('.mmi-helper-panel');
                    hp.style.display = hp.style.display === 'flex' ? 'none' : 'flex';
                    editor.querySelector('.mmi-pin-panel').style.display = 'none';
                    editor.querySelector('.mmi-log-panel').style.display = 'none';
                });

                // 展示按钮：隐藏日志和辅助面板
                editor.querySelector('.mmi-pin-btn-display').addEventListener('click', () => {
                    const pp = editor.querySelector('.mmi-pin-panel');
                    pp.style.display = pp.style.display === 'flex' ? 'none' : 'flex';
                    editor.querySelector('.mmi-helper-panel').style.display = 'none';
                    editor.querySelector('.mmi-log-panel').style.display = 'none';
                });

                // 常驻按钮事件
                const alwaysBtn = editor.querySelector('.mmi-always-btn');
                alwaysBtn.addEventListener('click', () => {
                    const newState = !alwaysShowFloats;
                    setAlwaysShowFloats(newState);
                    closeEditor(mesEl);  // 自动关闭编辑器，切换后就可看到效果
                });

                // 插入宏
                const insertAtCursor = (str) => {
                    const start = input.selectionStart, end = input.selectionEnd;
                    const val = input.value;
                    input.value = val.substring(0, start) + str + val.substring(end);
                    input.focus();
                    input.selectionStart = input.selectionEnd = start + str.length;
                };
                editor.querySelector('.mmi-insert-model').addEventListener('click', () => insertAtCursor('{model}'));
                editor.querySelector('.mmi-insert-preset').addEventListener('click', () => insertAtCursor('{preset}'));
                editor.querySelector('.mmi-insert-user').addEventListener('click', () => insertAtCursor('{user}'));
                editor.querySelector('.mmi-insert-char').addEventListener('click', () => insertAtCursor('{char}'));

                // 保存
                editor.querySelector('.mmi-save-btn').addEventListener('click', () => {
                    const newVal = input.value.trim();
                    if (!msg.extra) msg.extra = {};
                    msg.extra.custom_format = newVal;
                    const swipeKey = String(msg.swipe_id || 0);
                    if (!msg.extra.swipe_info) msg.extra.swipe_info = {};
                    if (!msg.extra.swipe_info[swipeKey]) recordSwipe(msg, swipeKey);
                    closeEditor(mesEl);
                });

                // 模板
                editor.querySelector('.mmi-template-btn').addEventListener('click', () => {
                    const newVal = input.value.trim();
                    saveGlobalTemplate(newVal);
                    if (msg.extra) delete msg.extra.custom_format;
                    closeEditor(mesEl);
                    refreshAllFloats();
                });

                // 展示逻辑
                const applyDisplay = (scope) => {
                    const val = input.value.trim();
                    if (!val) return;
                    if (scope === 'this') {
                        if (!msg.extra) msg.extra = {};
                        msg.extra.pinned_this = true;
                        msg.extra.display_text = val;
                    } else {
                        const scopes = getScopes();
                        if (scope === 'all') {
                            scopes.ai = scopes.user = null;
                            scopes.all = val;
                            context.chat.forEach(m => {
                                if (m.extra) { delete m.extra.pinned_this; delete m.extra.display_text; }
                            });
                        } else if (scope === 'ai') {
                            scopes.ai = val;
                            context.chat.forEach(m => {
                                if (m.is_user === false && m.extra) { delete m.extra.pinned_this; delete m.extra.display_text; }
                            });
                        } else if (scope === 'user') {
                            scopes.user = val;
                            context.chat.forEach(m => {
                                if (m.is_user === true && m.extra) { delete m.extra.pinned_this; delete m.extra.display_text; }
                            });
                        }
                    }
                    closeEditor(mesEl);
                    refreshAllFloats();
                };

                editor.querySelector('.mmi-pin-this').addEventListener('click', () => applyDisplay('this'));
                editor.querySelector('.mmi-pin-ai').addEventListener('click', () => applyDisplay('ai'));
                editor.querySelector('.mmi-pin-user').addEventListener('click', () => applyDisplay('user'));
                editor.querySelector('.mmi-pin-all').addEventListener('click', () => applyDisplay('all'));

                editor.querySelector('.mmi-pin-clear').addEventListener('click', () => {
                    const scopes = getScopes();
                    scopes.ai = scopes.user = scopes.all = null;
                    context.chat.forEach(m => {
                        if (m.extra) { delete m.extra.pinned_this; delete m.extra.display_text; }
                    });
                    closeEditor(mesEl);
                    refreshAllFloats();
                });

                editor.querySelector('.mmi-cancel-btn').addEventListener('click', () => closeEditor(mesEl));

                // 初始化常驻按钮样式（已在HTML中设置文本，但需补充active类）
                if (alwaysShowFloats) {
                    alwaysBtn.classList.add('active');
                }

                refreshFloat(mesEl);
            }

            function openEditor(mesEl) {
                const floor = getFloorFromElement(mesEl);
                if (floor < 0) return;
                document.querySelectorAll('.mmi-editor-wrapper').forEach(w => w.style.display = 'none');
                document.querySelectorAll('.mmi-log-panel').forEach(p => p.style.display = 'none');
                const editor = mesEl.querySelector('.mmi-editor-wrapper');
                const float = mesEl.querySelector('.model-info-float');
                if (editor) {
                    editor.style.display = 'flex';
                    const msg = context.chat[floor];
                    if (msg) {
                        const curFmt = (msg.extra && msg.extra.custom_format) ? msg.extra.custom_format : globalTemplate;
                        editor.querySelector('.mmi-editor-input').value = curFmt;
                    }
                    editor.querySelector('.mmi-helper-panel').style.display = 'none';
                    editor.querySelector('.mmi-pin-panel').style.display = 'none';
                    // 常驻按钮文字更新（以防万一）
                    const alwaysBtn = editor.querySelector('.mmi-always-btn');
                    if (alwaysBtn) {
                        alwaysBtn.textContent = alwaysShowFloats ? '常驻：开' : '常驻：关';
                        if (alwaysShowFloats) alwaysBtn.classList.add('active');
                        else alwaysBtn.classList.remove('active');
                    }
                }
                if (float) float.style.display = 'none';
            }

            function closeEditor(mesEl) {
                const editor = mesEl.querySelector('.mmi-editor-wrapper');
                if (editor) {
                    editor.style.display = 'none';
                    editor.querySelector('.mmi-log-panel').style.display = 'none';
                }
                refreshFloat(mesEl);
            }

            function trackEditState(mesEl) {
                const observer = new MutationObserver(() => {
                    const hasEditArea = mesEl.querySelector('.edit_textarea, textarea.mes_edit_area') !== null;
                    if (hasEditArea) {
                        if (!mesEl.classList.contains('mmi-editing')) {
                            mesEl.classList.add('mmi-editing');
                            refreshFloat(mesEl);
                        }
                    } else {
                        if (mesEl.classList.contains('mmi-editing')) {
                            mesEl.classList.remove('mmi-editing');
                            refreshFloat(mesEl);
                        }
                    }
                });
                observer.observe(mesEl, { childList: true, subtree: true, attributes: false });
            }

            function setupFloatSystem() {
                document.querySelectorAll('.mes').forEach(mes => {
                    ensureFloatStructure(mes);
                    trackEditState(mes);
                });

                const chatContainer = document.getElementById('chat') || document.body;
                const mesObserver = new MutationObserver((mutations) => {
                    mutations.forEach(mut => {
                        mut.addedNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                if (node.classList && node.classList.contains('mes')) {
                                    ensureFloatStructure(node);
                                    trackEditState(node);
                                }
                                node.querySelectorAll && node.querySelectorAll('.mes').forEach(mes => {
                                    ensureFloatStructure(mes);
                                    trackEditState(mes);
                                });
                            }
                        });
                    });
                });
                mesObserver.observe(chatContainer, { childList: true, subtree: true });
                MMI_Log.log('[MMI] Float system initialized.');

                // 初始应用常驻状态
                if (alwaysShowFloats) refreshAllFloats();
            }

            setupFloatSystem();
            MMI_Log.log('Message Model Info: advanced editor active (v3).');

        } catch (e) {
            MMI_Log.log('Message Model Info init error:', e);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
