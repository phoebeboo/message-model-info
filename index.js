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

            // 启动提示
            context.eventSource.on('appReady', function () {
                if (typeof toastr !== 'undefined') {
                    toastr.info('扩展"Message Model Info"已加载！');
                } else {
                    alert('扩展已加载！');
                }
            });

            // ---------- 读取当前模型和预设 ----------
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
                // 备选通用预设
                const generic = document.querySelector('#settings_preset');
                if (generic && generic.selectedIndex >= 0) {
                    const val = generic.options[generic.selectedIndex].text.trim();
                    if (val) return val;
                }
                return 'Default';
            }

            // ---------- 通用记录函数 ----------
            function recordMessage(msg) {
                if (!msg) return;
                // 只记录 AI 回复（is_user === false）
                if (msg.is_user !== false) {
                    console.log('[MMI] skip user message:', msg.mes);
                    return;
                }
                
                const model = getCurrentModel();
                const preset = getCurrentPreset();
                
                // 为当前生成的swipe记录信息
                if (!msg.extra) msg.extra = {};
                if (!msg.extra.swipe_info) msg.extra.swipe_info = {};
                
                // 获取当前swipe_id（如果没有就是0，即第一条）
                const currentSwipeId = msg.swipe_id || 0;
                
                // 记录到对应的swipe位置
                msg.extra.swipe_info[currentSwipeId] = {
                    model_used: model,
                    preset_used: preset,
                    timestamp: Date.now()
                };
                
                console.log('[MMI] recorded for swipe', currentSwipeId, ':', model, preset, 'for message:', msg.mes);
            }

            // ---------- 验证和修复swipe信息 ----------
            function validateAndFixSwipeInfo(msg) {
                if (!msg || !msg.swipes || msg.swipes.length <= 1) return;
                
                if (!msg.extra) msg.extra = {};
                if (!msg.extra.swipe_info) msg.extra.swipe_info = {};
                
                const currentSwipeCount = msg.swipes.length;
                const recordedSwipeCount = Object.keys(msg.extra.swipe_info).length;
                
                console.log('[MMI] validating swipe info:', {
                    messageId: msg.mes_id || 'unknown',
                    currentSwipes: currentSwipeCount,
                    recordedSwipes: recordedSwipeCount
                });
                
                // 如果记录的swipe数量少于实际swipe数量，尝试修复
                if (recordedSwipeCount < currentSwipeCount) {
                    console.log('[MMI] missing swipe records detected, attempting to fix...');
                    
                    const model = getCurrentModel();
                    const preset = getCurrentPreset();
                    
                    // 为缺失的swipe记录信息
                    for (let i = recordedSwipeCount; i < currentSwipeCount; i++) {
                        if (!msg.extra.swipe_info[i]) {
                            msg.extra.swipe_info[i] = {
                                model_used: model,
                                preset_used: preset,
                                timestamp: Date.now(),
                                auto_fixed: true // 标记为自动修复
                            };
                            console.log('[MMI] auto-fixed swipe', i, ':', model, preset);
                        }
                    }
                }
            }

            // ---------- 方法1：尝试已知事件（用于诊断） ----------
            const events = ['messageSent', 'messageGenerated', 'characterMessageGenerated', 'newMessage'];
            events.forEach(evt => {
                context.eventSource.on(evt, function (data) {
                    console.log('[MMI] Event "' + evt + '" fired with:', data);
                });
            });

            // ---------- 方法2：MutationObserver 监听新消息 DOM 节点 ----------
            const chatContainer = document.getElementById('chat');
            if (!chatContainer) {
                console.error('[MMI] #chat container not found');
                return;
            }

            // 存储最后处理的message ID，避免重复处理
            let lastProcessedMessageId = null;

            const observer = new MutationObserver(function (mutations) {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            // 检查新增节点是否是 .mes 元素
                            if (node.nodeType === 1 && node.matches && node.matches('.mes')) {
                                console.log('[MMI] new .mes element detected');
                                
                                // 延迟以确保 context.chat 已更新
                                setTimeout(() => {
                                    const chat = context.chat;
                                    if (!chat || chat.length === 0) return;
                                    
                                    // 找到最新的AI消息
                                    let latestAIMessage = null;
                                    for (let i = chat.length - 1; i >= 0; i--) {
                                        if (chat[i].is_user === false) {
                                            latestAIMessage = chat[i];
                                            break;
                                        }
                                    }
                                    
                                    if (latestAIMessage) {
                                        // 检查是否已经处理过这条消息
                                        const messageId = latestAIMessage.mes_id || latestAIMessage.send_date;
                                        if (messageId && messageId !== lastProcessedMessageId) {
                                            lastProcessedMessageId = messageId;
                                            recordMessage(latestAIMessage);
                                        }
                                    }
                                }, 300);
                            }
                        });
                    }
                }
            });

            observer.observe(chatContainer, {
                childList: true,
                subtree: true,
            });
            console.log('[MMI] MutationObserver started');

            // ---------- 监听消息生成事件（更可靠的方式） ----------
            context.eventSource.on('messageGenerated', function (data) {
                console.log('[MMI] messageGenerated event:', data);
                if (data && data.message) {
                    // 延迟确保消息已经完全处理
                    setTimeout(() => {
                        recordMessage(data.message);
                    }, 500);
                }
            });

            // ---------- 监听swipe相关事件 ----------
            context.eventSource.on('swipeChanged', function (data) {
                console.log('[MMI] swipe changed:', data);
                // 当用户切换swipe时，确保新显示的swipe也有模型信息记录
                if (data && data.message) {
                    const msg = data.message;
                    const currentSwipeId = msg.swipe_id || 0;
                    
                    // 验证并修复swipe信息
                    validateAndFixSwipeInfo(msg);
                    
                    // 如果这个swipe还没有记录模型信息，就记录当前设置
                    if (!msg.extra || !msg.extra.swipe_info || !msg.extra.swipe_info[currentSwipeId]) {
                        const model = getCurrentModel();
                        const preset = getCurrentPreset();
                        
                        if (!msg.extra) msg.extra = {};
                        if (!msg.extra.swipe_info) msg.extra.swipe_info = {};
                        
                        msg.extra.swipe_info[currentSwipeId] = {
                            model_used: model,
                            preset_used: preset,
                            timestamp: Date.now()
                        };
                        
                        console.log('[MMI] auto-recorded for new swipe', currentSwipeId, ':', model, preset);
                    }
                }
            });

            context.eventSource.on('swipeGenerated', function (data) {
                console.log('[MMI] new swipe generated:', data);
                // 新swipe生成时，立即记录模型信息
                if (data && data.message) {
                    const msg = data.message;
                    
                    // 延迟一下，确保swipe已经添加到数组中
                    setTimeout(() => {
                        const currentSwipeCount = msg.swipes ? msg.swipes.length : 1;
                        const newSwipeId = currentSwipeCount - 1; // 新生成的swipe是最后一个
                        
                        const model = getCurrentModel();
                        const preset = getCurrentPreset();
                        
                        if (!msg.extra) msg.extra = {};
                        if (!msg.extra.swipe_info) msg.extra.swipe_info = {};
                        
                        msg.extra.swipe_info[newSwipeId] = {
                            model_used: model,
                            preset_used: preset,
                            timestamp: Date.now()
                        };
                        
                        console.log('[MMI] recorded for newly generated swipe', newSwipeId, ':', model, preset);
                        
                        // 验证修复
                        validateAndFixSwipeInfo(msg);
                    }, 300);
                }
            });

            // 监听"获取更多回复"按钮点击
            $(document).on('click', '.regenerate_swipe_button, .regenerate-button, [title*="regenerate"], [title*="重新生成"], [title*="更多回复"]', function () {
                console.log('[MMI] regenerate/swipe button clicked');
                // 延迟一下，等待新swipe生成
                setTimeout(() => {
                    const chat = context.chat;
                    if (!chat || chat.length === 0) return;
                    
                    // 找到最后一条AI消息
                    let lastAIMessage = null;
                    for (let i = chat.length - 1; i >= 0; i--) {
                        if (chat[i].is_user === false) {
                            lastAIMessage = chat[i];
                            break;
                        }
                    }
                    
                    if (lastAIMessage) {
                        // 验证并修复所有swipe信息
                        validateAndFixSwipeInfo(lastAIMessage);
                    }
                }, 1500); // 延迟1.5秒确保swipe已完全生成
            });

            // ---------- 悬浮窗显示（基于编辑按钮点击） ----------
            const editBtnSelector = '.mes_edit, .message_edit, [title="编辑"], [title="Edit"]';
            $(document).on('click', editBtnSelector, function (e) {
                const $btn = $(this);
                const $mes = $btn.closest('.mes');
                if (!$mes.length || $mes.find('.model-info-float').length > 0) return;

                let mid = parseInt($mes.data('mid'));
                if (isNaN(mid)) {
                    const all = $('#chat .mes');
                    const idx = all.index($mes);
                    if (idx >= 0 && idx < context.chat.length) mid = idx;
                    else {
                        console.warn('[MMI] cannot get mid');
                        return;
                    }
                }

                const msg = context.chat[mid];
                if (!msg) {
                    console.warn('[MMI] no message for mid', mid);
                    return;
                }

                // 首先验证并修复swipe信息
                validateAndFixSwipeInfo(msg);

                // 获取当前显示的swipe_id（默认为0）
                const currentSwipeId = msg.swipe_id || 0;
                
                // 从swipe_info中读取对应swipe的模型信息
                let model = 'N/A';
                let preset = 'N/A';
                
                if (msg.extra && msg.extra.swipe_info && msg.extra.swipe_info[currentSwipeId]) {
                    model = msg.extra.swipe_info[currentSwipeId].model_used || 'N/A';
                    preset = msg.extra.swipe_info[currentSwipeId].preset_used || 'N/A';
                } else {
                    // 兼容旧数据：如果没有swipe_info，回退到旧的extra字段
                    model = (msg.extra && msg.extra.model_used) || 'N/A';
                    preset = (msg.extra && msg.extra.preset_used) || 'N/A';
                }
                
                console.log('[MMI] show float for mid=' + mid, 'swipe=' + currentSwipeId, model, preset);

                const $float = $(`<div class="model-info-float">${model} <span class="sep">~</span> ${preset}</div>`);
                $mes.css('position', 'relative');
               $mes.prepend($float);

                // 编辑结束时移除
                const interval = setInterval(() => {
                    if ($mes.find('.edit_textarea, textarea.mes_edit_area').length === 0) {
                        clearInterval(interval);
                        $mes.find('.model-info-float').fadeOut(300, function () { $(this).remove(); });
                    }
                }, 500);
            });

            // 定期验证所有消息的swipe信息
            setInterval(() => {
                const chat = context.chat;
                if (!chat) return;
                
                chat.forEach((msg, index) => {
                    if (msg && msg.is_user === false) {
                        validateAndFixSwipeInfo(msg);
                    }
                });
            }, 10000); // 每10秒验证一次

            // 初始化时验证所有现有消息
            setTimeout(() => {
                const chat = context.chat;
                if (!chat) return;
                
                console.log('[MMI] initial validation of all messages');
                chat.forEach((msg, index) => {
                    if (msg && msg.is_user === false) {
                        validateAndFixSwipeInfo(msg);
                    }
                });
            }, 2000);

            console.log('Message Model Info: setup complete');
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
