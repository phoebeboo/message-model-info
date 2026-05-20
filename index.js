(function () {
    'use strict';

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

            console.log('Message Model Info: extension loaded.');

            context.eventSource.on('appReady', function () {
                if (typeof toastr !== 'undefined') {
                    toastr.info('扩展"Message Model Info"已加载！');
                } else {
                    alert('扩展已加载！');
                }
            });

            // ========== 工具函数 ==========
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

            // 获取最后一个 AI 消息的楼层编号（从 .mesIDDisplay 中提取数字，0-based）
            function getLastAIFloor() {
                const allMessages = document.querySelectorAll('.mes');
                for (let i = allMessages.length - 1; i >= 0; i--) {
                    const el = allMessages[i];
                    if (el.classList.contains('user')) continue;
                    const floorEl = el.querySelector('.mesIDDisplay');
                    if (floorEl) {
                        const text = floorEl.textContent.trim();
                        const match = text.match(/\d+/);
                        if (match) {
                            return parseInt(match[0], 10);
                        }
                    }
                }
                return -1;
            }

            // 通过楼层获取消息对象
            function getMessageByFloor(floor) {
                const chat = context.chat;
                if (Array.isArray(chat) && floor >= 0 && floor < chat.length) {
                    return chat[floor];
                }
                return null;
            }

            // 记录一条消息的指定 swipe
            function recordSwipe(msg, swipeId) {
                if (!msg || msg.is_user !== false) return;
                if (!msg.extra) msg.extra = {};
                if (!msg.extra.swipe_info) msg.extra.swipe_info = {};

                const key = String(swipeId);
                if (msg.extra.swipe_info[key]) {
                    // 已有记录，跳过但输出调试信息
                    console.log(`[MMI] swipe ${key} already recorded, skipping`);
                    return;
                }

                const model = getCurrentModel();
                const preset = getCurrentPreset();
                msg.extra.swipe_info[key] = {
                    model_used: model,
                    preset_used: preset,
                    timestamp: Date.now()
                };
                const floor = context.chat.indexOf(msg);
                console.log(`[MMI] recorded swipe ${key} (${floor >= 0 ? '#' + floor : '?'}) => ${model} | ${preset}`);
            }

            // 补录缺失的 swipe（用于更多回复）
            function fillMissingSwipes(msg) {
                if (!msg || !msg.swipes) return;
                for (let i = 0; i < msg.swipes.length; i++) {
                    recordSwipe(msg, i);
                }
            }

            // ========== 监控器 ==========
            let activeMonitorId = null;
            let stopRequested = false;

            function stopMonitor(reason) {
                if (activeMonitorId) {
                    clearInterval(activeMonitorId);
                    activeMonitorId = null;
                    console.log('[MMI] Monitor ended (' + reason + ')');
                }
            }

            // 执行记录并停止监控
            function finalizeAndRecord(options) {
                stopRequested = false;
                const delay = 3000; // 等待流式输出完成

                // 根据类型延迟后记录
                const doRecord = () => {
                    if (options.type === 'new_message') {
                        const currentFloor = getLastAIFloor();
                        if (currentFloor > options.floor) {
                            const msg = getMessageByFloor(currentFloor);
                            if (msg) recordSwipe(msg, 0);
                        } else if (currentFloor === options.floor) {
                            console.log('[MMI] No new message generated (empty or canceled)');
                        }
                    } else if (options.type === 'more_replies') {
                        const msg = getMessageByFloor(options.floor);
                        if (msg) fillMissingSwipes(msg);
                    } else if (options.type === 'regenerate') {
                        const msg = getMessageByFloor(options.floor);
                        if (msg && msg !== options.oldMsg && msg.is_user === false) {
                            recordSwipe(msg, 0);
                        }
                    }
                    stopMonitor('done');
                };

                // 如果已经触发了，但有流式还在进行，我们延迟执行以获取完整内容
                setTimeout(doRecord, delay);
            }

            function startMonitor(options) {
                stopMonitor('restart');
                stopRequested = false;
                console.log('[MMI] Monitor started for ' + options.type);

                const startTime = Date.now();
                const timeout = 120000;

                activeMonitorId = setInterval(() => {
                    if (stopRequested) {
                        // 用户点击停止，立即检查并记录（如果新内容已出现）
                        finalizeAndRecord(options);
                        return;
                    }

                    let done = false;
                    if (options.type === 'new_message') {
                        const currentFloor = getLastAIFloor();
                        if (currentFloor > options.floor) {
                            done = true;
                        }
                    } else if (options.type === 'more_replies') {
                        const msg = getMessageByFloor(options.floor);
                        if (msg && Array.isArray(msg.swipes) && msg.swipes.length > options.oldSwipeCount) {
                            done = true;
                        }
                    } else if (options.type === 'regenerate') {
                        const msg = getMessageByFloor(options.floor);
                        // 新消息对象出现（且是AI消息）
                        if (msg && msg !== options.oldMsg && msg.is_user === false) {
                            done = true;
                        }
                    }

                    if (done) {
                        finalizeAndRecord(options);
                        return;
                    }

                    if (Date.now() - startTime > timeout) {
                        console.warn('[MMI] Monitor timed out');
                        stopMonitor('timeout');
                    }
                }, 800);
            }

            // ========== 用户动作监听 ==========
            // 发送按钮
            $(document).on('click', '.fa-paper-plane', function (e) {
                if (!$(e.target).is(':visible')) return;
                console.log('[MMI] Send button clicked');
                const lastFloor = getLastAIFloor();
                if (lastFloor === -1) {
                    console.warn('[MMI] Cannot determine last AI floor, abort');
                    return;
                }
                startMonitor({ type: 'new_message', floor: lastFloor });
            });

            // 更多回复按钮（右箭头）
            $(document).on('click', '.mes .swipe_right', function (e) {
                if (!$(e.target).is(':visible')) return;
                console.log('[MMI] More replies button clicked');
                const lastFloor = getLastAIFloor();
                if (lastFloor === -1) return;
                const msg = getMessageByFloor(lastFloor);
                if (!msg) return;
                const currentSwipeCount = Array.isArray(msg.swipes) ? msg.swipes.length : 0;
                startMonitor({ type: 'more_replies', floor: lastFloor, oldSwipeCount: currentSwipeCount });
            });

            // 重新回复按钮
            $(document).on('click', '#option_regenerate', function (e) {
                if (!$(e.target).is(':visible')) return;
                console.log('[MMI] Regenerate button clicked');
                const lastFloor = getLastAIFloor();
                if (lastFloor === -1) {
                    console.warn('[MMI] No AI message to regenerate');
                    return;
                }
                const oldMsg = getMessageByFloor(lastFloor);
                if (!oldMsg || oldMsg.is_user !== false) {
                    console.warn('[MMI] Last AI message invalid');
                    return;
                }
                startMonitor({ type: 'regenerate', floor: lastFloor, oldMsg: oldMsg });
            });

            // 停止按钮（提前终止生成）
            $(document).on('click', '.fa-circle-stop', function (e) {
                if (!$(e.target).is(':visible')) return;
                console.log('[MMI] Stop button clicked');
                stopRequested = true;
                // 如果没有活跃监控，则忽略（不会影响其他操作）
            });

            // ========== 悬浮窗显示（编辑按钮点开时） ==========
            const editBtnSelector = '.mes_edit, .message_edit, [title="编辑"], [title="Edit"]';
            $(document).on('click', editBtnSelector, function (e) {
                const $btn = $(this);
                const $mes = $btn.closest('.mes');
                if (!$mes.length || $mes.find('.model-info-float').length > 0) return;

                const floorEl = $mes.find('.mesIDDisplay');
                let floor = -1;
                if (floorEl.length) {
                    const text = floorEl.text().trim();
                    const match = text.match(/\d+/);
                    if (match) {
                        floor = parseInt(match[0], 10);
                    }
                }

                if (floor === -1 || floor >= context.chat.length) {
                    console.warn('[MMI] Invalid floor', floor);
                    return;
                }

                const msg = context.chat[floor];
                if (!msg) return;

                const currentSwipeId = String(msg.swipe_id || 0);
                let model = 'N/A';
                let preset = 'N/A';

                if (msg.extra && msg.extra.swipe_info && msg.extra.swipe_info[currentSwipeId]) {
                    model = msg.extra.swipe_info[currentSwipeId].model_used || 'N/A';
                    preset = msg.extra.swipe_info[currentSwipeId].preset_used || 'N/A';
                }

                console.log(`[MMI] show float for #${floor} swipe=${currentSwipeId} | ${model} | ${preset}`);

                const $float = $(`<div class="model-info-float">
                    <span class="mmi-model">${model}</span>
                    <span class="sep">~</span>
                    <span class="mmi-preset">${preset}</span>
                    ${model === 'N/A' ? '<button class="mmi-record-now" style="margin-left:6px;font-size:0.8em;">记录当前</button>' : ''}
                </div>`);

                $float.find('.mmi-record-now').on('click', function (ev) {
                    ev.stopPropagation();
                    const nowModel = getCurrentModel();
                    const nowPreset = getCurrentPreset();
                    if (!msg.extra) msg.extra = {};
                    if (!msg.extra.swipe_info) msg.extra.swipe_info = {};
                    msg.extra.swipe_info[currentSwipeId] = {
                        model_used: nowModel,
                        preset_used: nowPreset,
                        timestamp: Date.now()
                    };
                    $float.find('.mmi-model').text(nowModel);
                    $float.find('.mmi-preset').text(nowPreset);
                    $(this).remove();
                    console.log(`[MMI] manually recorded swipe ${currentSwipeId} => ${nowModel} | ${nowPreset}`);
                });

                $mes.css('position', 'relative');
                $mes.prepend($float);

                const interval = setInterval(() => {
                    if ($mes.find('.edit_textarea, textarea.mes_edit_area').length === 0) {
                        clearInterval(interval);
                        $mes.find('.model-info-float').fadeOut(300, function () { $(this).remove(); });
                    }
                }, 500);
            });

            console.log('Message Model Info: floor-based recording (supporting regenerate) active');

        } catch (e) {
            console.error('Message Model Info init error:', e);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
