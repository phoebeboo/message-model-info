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
                    toastr.info('扩展“Message Model Info”已加载！');
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
                if (!msg.extra) msg.extra = {};
                const model = getCurrentModel();
                const preset = getCurrentPreset();
                msg.extra.model_used = model;
                msg.extra.preset_used = preset;
                console.log('[MMI] recorded:', model, preset, 'for message:', msg.mes);
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
                                    const lastMsg = chat[chat.length - 1];
                                    if (lastMsg) {
                                        recordMessage(lastMsg);
                                    }
                                }, 200);
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

                const model = (msg.extra && msg.extra.model_used) || 'N/A';
                const preset = (msg.extra && msg.extra.preset_used) || 'N/A';
                console.log('[MMI] show float for mid=' + mid, model, preset);

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
