(function () {
  var storagePrefix = 'php_chat_';
  var state = {
    socket: null,
    chatId: window.localStorage.getItem(storagePrefix + 'session_id') || '',
    token: window.localStorage.getItem(storagePrefix + 'token') || '',
    lastRendered: '',
    pollHandle: null,
    typingTimer: null,
    audioContext: null
  };

  function $(id) {
    return document.getElementById(id);
  }

  function showError(element, message) {
    if (!element) return;
    element.textContent = message || '';
    element.hidden = !message;
  }

  function formToObject(form) {
    var data = new FormData(form);
    return {
      name: String(data.get('name') || '').trim(),
      email: String(data.get('email') || '').trim(),
      phone: String(data.get('phone') || '').trim(),
      product: String(data.get('product') || data.get('productSlug') || '').trim(),
      productSlug: String(data.get('productSlug') || data.get('product') || '').trim(),
      issue: String(data.get('issue') || 'General question').trim(),
      message: String(data.get('message') || '').trim(),
      pagePath: window.location.pathname + window.location.search
    };
  }

  function saveSession(chat) {
    if (!chat) return;
    state.chatId = chat.sessionId || chat.id || state.chatId;
    state.token = chat.token || state.token;
    if (state.chatId) window.localStorage.setItem(storagePrefix + 'session_id', state.chatId);
    if (state.token) window.localStorage.setItem(storagePrefix + 'token', state.token);
    if (chat.visitor && chat.visitor.name) window.localStorage.setItem(storagePrefix + 'customer_name', chat.visitor.name);
    if (chat.productSlug) window.localStorage.setItem(storagePrefix + 'product', chat.productSlug);
  }

  function showChatWindow(chat) {
    var startForm = $('chatStartForm');
    var chatWindow = $('chatWindow');
    if (startForm) startForm.hidden = true;
    if (chatWindow) chatWindow.hidden = false;
    var title = $('chatTitle');
    if (title && chat) title.textContent = (chat.productName || chat.product || 'Product') + ' conversation';
    var status = $('chatStatus');
    if (status && chat) status.textContent = chat.status || 'Open';
  }

  function messageSenderClass(sender) {
    return sender === 'visitor' || sender === 'customer' ? 'customer' : sender;
  }

  function renderMessages(messages) {
    var container = $('chatMessages');
    if (!container) return;
    var fingerprint = (messages || []).map(function (message) {
      return (message.id || '') + (message.sender || '') + (message.text || '');
    }).join('|');
    if (fingerprint === state.lastRendered) return;
    state.lastRendered = fingerprint;
    container.innerHTML = '';

    (messages || []).forEach(function (message) {
      var row = document.createElement('div');
      row.className = 'chat-message ' + messageSenderClass(message.sender);
      var label = document.createElement('span');
      label.textContent = message.sender === 'admin' ? 'Portal team' : message.sender === 'bot' ? 'Auto reply' : 'You';
      var bubble = document.createElement('p');
      bubble.textContent = message.text || '';
      row.appendChild(label);
      row.appendChild(bubble);
      container.appendChild(row);
    });
    container.scrollTop = container.scrollHeight;
  }

  function setTyping(isTyping) {
    var box = $('chatTyping');
    if (!box) {
      var messages = $('chatMessages');
      if (!messages || !messages.parentNode) return;
      box = document.createElement('div');
      box.id = 'chatTyping';
      box.className = 'chat-typing';
      messages.parentNode.insertBefore(box, messages.nextSibling);
    }
    box.textContent = isTyping ? 'Portal team is typing...' : '';
    box.hidden = !isTyping;
  }

  function beep() {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    var context = state.audioContext || new AudioContext();
    state.audioContext = context;
    if (context.state === 'suspended') context.resume().catch(function () {});
    var oscillator = context.createOscillator();
    var gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(920, context.currentTime + 0.16);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.24);
  }

  function pollMessages() {
    if (!state.chatId || !state.token) return;
    fetch('/api/chat/' + encodeURIComponent(state.chatId) + '/messages?token=' + encodeURIComponent(state.token))
      .then(function (response) {
        if (!response.ok) throw new Error('Chat not found');
        return response.json();
      })
      .then(function (data) {
        saveSession(data.chat || data);
        showChatWindow(data.chat || data);
        renderMessages(data.messages || (data.chat && data.chat.messages) || []);
      })
      .catch(function () {
        showError($('chatReplyError'), 'Unable to refresh chat messages.');
      });
  }

  function startPolling() {
    if (state.pollHandle) window.clearInterval(state.pollHandle);
    pollMessages();
    state.pollHandle = window.setInterval(pollMessages, 2000);
  }

  function startViaRest(payload) {
    return fetch('/api/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok) throw body;
          return body;
        });
      })
      .then(function (body) {
        saveSession(body.chat);
        showChatWindow(body.chat);
        renderMessages(body.chat.messages || []);
        startPolling();
      });
  }

  function joinSocket(payload, callback) {
    if (!state.socket || !state.socket.connected) return callback({ ok: false });
    state.socket.emit('customer:join', {
      sessionId: state.chatId,
      token: state.token,
      name: payload.name || window.localStorage.getItem(storagePrefix + 'customer_name') || 'Visitor',
      email: payload.email || '',
      phone: payload.phone || '',
      productSlug: payload.productSlug || payload.product || window.localStorage.getItem(storagePrefix + 'product') || 'microsoft',
      issue: payload.issue || 'General question',
      pagePath: window.location.pathname + window.location.search
    }, callback);
  }

  function sendSocketMessage(message, callback) {
    if (!state.socket || !state.socket.connected) return callback({ ok: false });
    state.socket.emit('customer:message', {
      sessionId: state.chatId,
      text: message
    }, callback);
  }

  function initSocket() {
    if (!window.io) return;
    state.socket = window.io({
      transports: ['websocket', 'polling']
    });

    state.socket.on('connect', function () {
      if (!state.chatId) return;
      joinSocket({}, function (reply) {
        if (reply && reply.ok) {
          saveSession(reply.chat);
          showChatWindow(reply.chat);
          renderMessages(reply.chat.messages || []);
          state.socket.emit('customer:seen', { sessionId: state.chatId });
        }
      });
    });

    state.socket.on('chat:init', function (chat) {
      saveSession(chat);
      showChatWindow(chat);
      renderMessages(chat.messages || []);
    });

    state.socket.on('chat:message:new', function (payload) {
      if (!payload || payload.sessionId !== state.chatId) return;
      saveSession(payload.chat);
      showChatWindow(payload.chat);
      renderMessages(payload.chat.messages || []);
      if (payload.message && payload.message.sender === 'admin') beep();
      state.socket.emit('customer:seen', { sessionId: state.chatId });
    });

    state.socket.on('chat:typing', function (payload) {
      if (!payload || payload.sessionId !== state.chatId || payload.sender !== 'admin') return;
      setTyping(payload.isTyping);
    });

    state.socket.on('chat:status:update', function (payload) {
      if (!payload || payload.sessionId !== state.chatId) return;
      var status = $('chatStatus');
      if (status) status.textContent = payload.status || 'Open';
    });

    state.socket.on('disconnect', function () {
      startPolling();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var startForm = $('chatStartForm');
    var replyForm = $('chatReplyForm');
    var messageInput = $('chatMessage');
    initSocket();

    if (state.chatId && state.token) {
      startPolling();
    }

    if (startForm) {
      startForm.addEventListener('submit', function (event) {
        event.preventDefault();
        showError($('chatStartError'), '');
        var payload = formToObject(startForm);

        joinSocket(payload, function (joinReply) {
          if (!joinReply || !joinReply.ok) {
            startViaRest(payload).catch(function (error) {
              var errors = error && error.errors ? Object.values(error.errors).join(' ') : 'Unable to start chat.';
              showError($('chatStartError'), errors);
            });
            return;
          }
          saveSession(joinReply.chat);
          showChatWindow(joinReply.chat);
          renderMessages(joinReply.chat.messages || []);
          sendSocketMessage(payload.message, function (messageReply) {
            if (!messageReply || !messageReply.ok) {
              showError($('chatReplyError'), messageReply && messageReply.error ? messageReply.error : 'Unable to send message.');
              return;
            }
            saveSession(messageReply.chat);
            renderMessages(messageReply.chat.messages || []);
          });
        });
      });
    }

    if (replyForm) {
      replyForm.addEventListener('submit', function (event) {
        event.preventDefault();
        showError($('chatReplyError'), '');
        var message = messageInput ? messageInput.value.trim() : '';
        if (!message) return;

        sendSocketMessage(message, function (reply) {
          if (reply && reply.ok) {
            if (messageInput) messageInput.value = '';
            saveSession(reply.chat);
            renderMessages(reply.chat.messages || []);
            return;
          }

          fetch('/api/chat/' + encodeURIComponent(state.chatId) + '/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: state.token, message: message })
          })
            .then(function (response) {
              return response.json().then(function (body) {
                if (!response.ok) throw body;
                return body;
              });
            })
            .then(function (body) {
              if (messageInput) messageInput.value = '';
              saveSession(body.chat);
              renderMessages(body.chat.messages || []);
            })
            .catch(function (error) {
              showError($('chatReplyError'), error && error.error ? error.error : 'Unable to send message.');
            });
        });
      });
    }

    if (messageInput) {
      messageInput.addEventListener('input', function () {
        if (!state.socket || !state.chatId) return;
        state.socket.emit('customer:typing', { sessionId: state.chatId, isTyping: true });
        window.clearTimeout(state.typingTimer);
        state.typingTimer = window.setTimeout(function () {
          state.socket.emit('customer:typing', { sessionId: state.chatId, isTyping: false });
        }, 900);
      });
    }
  });
})();
