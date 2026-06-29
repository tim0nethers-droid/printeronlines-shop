(function () {
  var state = {
    selectedId: new URLSearchParams(window.location.search).get('session') || '',
    initialized: false,
    counts: {},
    lastMessageIds: {},
    pollHandle: null,
    audioContext: null,
    lastError: '',
    sessionExpired: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function showError(message) {
    var box = $('adminLiveError');
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
    if (message && message !== state.lastError && window.showToast) window.showToast(message, 'error');
    state.lastError = message || '';
  }

  function handleFetchError(response, fallbackMessage) {
    if (response.status === 401 || response.redirected) {
      state.sessionExpired = true;
      if (state.pollHandle) window.clearInterval(state.pollHandle);
      showError('Admin session expired. Please log in again.');
      window.setTimeout(function () {
        window.location.href = '/admin/login';
      }, 1200);
      throw new Error('session-expired');
    }
    if (response.status === 429) {
      throw new Error('Too many requests. Please wait a moment, then refresh.');
    }
    throw new Error(fallbackMessage);
  }

  function beep() {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    var context = state.audioContext || new AudioContext();
    state.audioContext = context;
    if (context.state === 'suspended') {
      context.resume().catch(function () {});
    }
    var oscillator = context.createOscillator();
    var gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(720, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.24);
  }

  function isSoundEnabled() {
    var toggle = $('soundToggle');
    return !!(toggle && toggle.checked);
  }

  function shouldNotify(chat, previousCount) {
    if (!state.initialized || !isSoundEnabled()) return false;
    if (chat.messageCount <= previousCount) return false;
    if (!chat.lastMessage) return true;
    if (chat.lastMessage.id && state.lastMessageIds[chat.id] === chat.lastMessage.id) return false;
    return chat.lastMessage.sender !== 'admin';
  }

  function renderVisitorList(chats) {
    var list = $('visitorList');
    if (!list) return;
    list.innerHTML = '';
    if (!chats.length) {
      var empty = document.createElement('p');
      empty.className = 'empty-state inline';
      empty.textContent = 'No chat conversations yet.';
      list.appendChild(empty);
      return;
    }

    chats.forEach(function (chat) {
      var previousCount = state.counts[chat.id] || 0;
      if (shouldNotify(chat, previousCount)) {
        beep();
        if (window.showToast) window.showToast('New live chat message received.', 'info');
      }
      state.counts[chat.id] = chat.messageCount;
      if (chat.lastMessage && chat.lastMessage.id) state.lastMessageIds[chat.id] = chat.lastMessage.id;

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'visitor-item' + (chat.id === state.selectedId ? ' active' : '');
      button.dataset.id = chat.id;
      var header = document.createElement('span');
      header.className = 'visitor-product-row';
      var logo = document.createElement('span');
      logo.className = 'product-logo product-logo-tiny ' + (chat.productIconClass || '');
      var logoText = document.createElement('span');
      logoText.textContent = chat.productIconText || '';
      logo.appendChild(logoText);
      var title = document.createElement('strong');
      title.textContent = chat.visitor.name + ' - ' + chat.product;
      header.appendChild(logo);
      header.appendChild(title);
      var meta = document.createElement('span');
      meta.textContent = chat.status + ' | ' + chat.issueCategory;
      button.appendChild(header);
      button.appendChild(meta);
      button.addEventListener('click', function () {
        state.selectedId = chat.id;
        loadConversation();
        renderVisitorList(chats);
      });
      list.appendChild(button);
    });
    state.initialized = true;
  }

  function renderConversation(chat) {
    var meta = $('conversationMeta');
    var messages = $('adminMessages');
    if (!meta || !messages) return;

    meta.innerHTML = '';
    var headingRow = document.createElement('div');
    headingRow.className = 'conversation-heading-row';
    var logo = document.createElement('span');
    logo.className = 'product-logo product-logo-tiny ' + (chat.productIconClass || '');
    var logoText = document.createElement('span');
    logoText.textContent = chat.productIconText || '';
    logo.appendChild(logoText);
    var title = document.createElement('h2');
    title.textContent = chat.visitor.name + ' - ' + chat.product;
    headingRow.appendChild(logo);
    headingRow.appendChild(title);
    var details = document.createElement('dl');
    [
      ['Phone', chat.visitor.phone],
      ['Email', chat.visitor.email],
      ['Issue', chat.issueCategory],
      ['Status', chat.status],
      ['Visitor IP', chat.visitor.ip],
      ['Page path', chat.visitor.pagePath],
      ['User agent', chat.visitor.userAgent]
    ].forEach(function (item) {
      var wrapper = document.createElement('div');
      var term = document.createElement('dt');
      var desc = document.createElement('dd');
      term.textContent = item[0];
      desc.textContent = item[1] || 'Unknown';
      wrapper.appendChild(term);
      wrapper.appendChild(desc);
      details.appendChild(wrapper);
    });
    meta.appendChild(headingRow);
    meta.appendChild(details);

    messages.innerHTML = '';
    chat.messages.forEach(function (message) {
      var row = document.createElement('div');
      row.className = 'message ' + message.sender;
      var label = document.createElement('span');
      label.textContent = message.sender === 'admin' ? 'Admin' : message.sender === 'bot' ? 'Auto reply' : 'Visitor';
      var bubble = document.createElement('p');
      bubble.textContent = message.text;
      row.appendChild(label);
      row.appendChild(bubble);
      messages.appendChild(row);
    });
    messages.scrollTop = messages.scrollHeight;
  }

  function loadConversation() {
    if (!state.selectedId || state.sessionExpired) return;
    fetch('/admin/api/chats/' + encodeURIComponent(state.selectedId))
      .then(function (response) {
        if (!response.ok || response.redirected) handleFetchError(response, 'Chat not found');
        return response.json();
      })
      .then(function (payload) {
        renderConversation(payload.chat);
      })
      .catch(function (error) {
        if (error.message !== 'session-expired') showError(error.message || 'Unable to load conversation.');
      });
  }

  function pollChats() {
    if (state.sessionExpired) return;
    var filter = $('liveProductFilter') ? $('liveProductFilter').value : '';
    fetch('/admin/api/chats?product=' + encodeURIComponent(filter))
      .then(function (response) {
        if (!response.ok || response.redirected) handleFetchError(response, 'Unable to load chats');
        return response.json();
      })
      .then(function (payload) {
        showError('');
        var chats = payload.chats || [];
        if (!state.selectedId && chats.length) state.selectedId = chats[0].id;
        if (state.selectedId && !chats.some(function (chat) { return chat.id === state.selectedId; })) {
          state.selectedId = chats.length ? chats[0].id : '';
        }
        renderVisitorList(chats);
        if (state.selectedId) loadConversation();
      })
      .catch(function (error) {
        if (error.message !== 'session-expired') showError(error.message || 'Unable to refresh chat list.');
      });
  }

  function postStatus(status) {
    if (!state.selectedId) return;
    fetch('/admin/api/chats/' + encodeURIComponent(state.selectedId) + '/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    })
      .then(function (response) {
        if (!response.ok || response.redirected) handleFetchError(response, 'Unable to update status');
        return response.json();
      })
      .then(function (payload) {
        renderConversation(payload.chat);
        pollChats();
        if (window.showToast) window.showToast('Chat status updated successfully.', 'success');
      })
      .catch(function (error) {
        if (error.message !== 'session-expired') showError(error.message || 'Unable to update chat status.');
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var replyForm = $('adminReplyForm');
    var productFilter = $('liveProductFilter');
    var soundToggle = $('soundToggle');

    if (soundToggle) {
      var savedSound = window.localStorage.getItem('adminLiveSound');
      soundToggle.checked = savedSound === null ? true : savedSound === 'true';
      soundToggle.addEventListener('change', function () {
        window.localStorage.setItem('adminLiveSound', soundToggle.checked ? 'true' : 'false');
        if (soundToggle.checked) {
          beep();
          if (window.showToast) window.showToast('New chat sound enabled.', 'success');
        } else if (window.showToast) {
          window.showToast('New chat sound disabled.', 'info');
        }
      });
    }

    if (replyForm) {
      replyForm.addEventListener('submit', function (event) {
        event.preventDefault();
        showError('');
        var input = $('adminReply');
        var message = input ? input.value.trim() : '';
        if (!state.selectedId || !message) return;

        fetch('/admin/api/chats/' + encodeURIComponent(state.selectedId) + '/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message })
          })
          .then(function (response) {
            if (response.status === 401 || response.redirected) handleFetchError(response, 'Admin session expired. Please log in again.');
            return response.json().then(function (payload) {
              if (!response.ok) throw payload;
              return payload;
            });
          })
        .then(function (payload) {
          if (input) input.value = '';
          renderConversation(payload.chat);
          pollChats();
          if (window.showToast) window.showToast('Reply sent successfully.', 'success');
        })
        .catch(function (payload) {
          showError(payload && payload.error ? payload.error : 'Unable to send reply.');
          });
      });
    }

    Array.prototype.slice.call(document.querySelectorAll('[data-chat-status]')).forEach(function (button) {
      button.addEventListener('click', function () {
        postStatus(button.getAttribute('data-chat-status'));
      });
    });

    if (productFilter) {
      productFilter.addEventListener('change', function () {
        state.selectedId = '';
        pollChats();
      });
    }

    pollChats();
    state.pollHandle = window.setInterval(pollChats, 2000);
  });
})();
