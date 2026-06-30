(function () {
  var state = {
    socket: null,
    selectedId: new URLSearchParams(window.location.search).get('session') || '',
    chats: [],
    currentChat: null,
    listFilter: 'all',
    searchQuery: '',
    initialized: false,
    pollHandle: null,
    typingTimer: null,
    audioContext: null,
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
    if (message && window.showToast) window.showToast(message, 'error');
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
    if (response.status === 429) throw new Error('Too many requests. Please wait a moment, then refresh.');
    throw new Error(fallbackMessage);
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

  function formatTime(value) {
    if (!value) return '';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function selectedFilter() {
    var select = $('liveProductFilter');
    return select ? select.value : '';
  }

  function chatMatchesSearch(chat) {
    if (!state.searchQuery) return true;
    var visitor = chat.visitor || {};
    var haystack = [
      visitor.name,
      visitor.email,
      visitor.phone,
      chat.productName,
      chat.product,
      chat.issueCategory,
      chat.lastMessageText
    ].join(' ').toLowerCase();
    return haystack.indexOf(state.searchQuery) !== -1;
  }

  function chatMatchesListFilter(chat) {
    var status = String(chat.status || '').toLowerCase();
    if (state.listFilter === 'unread') return Number(chat.unreadAdmin || 0) > 0;
    if (state.listFilter === 'open') return status === 'open' || status === 'in progress' || status === 'new';
    if (state.listFilter === 'pending') return status === 'pending';
    if (state.listFilter === 'closed') return status === 'closed';
    return true;
  }

  function renderVisitorList(chats) {
    var list = $('visitorList');
    if (!list) return;
    var filter = selectedFilter();
    var visibleChats = chats.filter(function (chat) {
      return (!filter || chat.productSlug === filter) && chatMatchesListFilter(chat) && chatMatchesSearch(chat);
    });
    list.innerHTML = '';

    if (!visibleChats.length) {
      var empty = document.createElement('p');
      empty.className = 'empty-state inline';
      empty.textContent = 'No chat conversations yet.';
      list.appendChild(empty);
      return;
    }

    visibleChats.forEach(function (chat) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'visitor-item live-visitor-item' + (chat.sessionId === state.selectedId ? ' active' : '');
      button.dataset.id = chat.sessionId;

      var top = document.createElement('span');
      top.className = 'visitor-product-row';

      var logo = document.createElement('span');
      logo.className = 'product-logo product-logo-tiny ' + (chat.productIconClass || '');
      var logoText = document.createElement('span');
      logoText.textContent = chat.productIconText || '';
      logo.appendChild(logoText);

      var nameWrap = document.createElement('span');
      nameWrap.className = 'visitor-name-stack';
      var name = document.createElement('strong');
      name.textContent = (chat.visitor && chat.visitor.name) || 'Visitor';
      var product = document.createElement('small');
      product.textContent = chat.productName || chat.product || 'Product';
      nameWrap.appendChild(name);
      nameWrap.appendChild(product);

      var flags = document.createElement('span');
      flags.className = 'visitor-flags';
      var online = document.createElement('i');
      online.className = chat.visitorOnline ? 'online-dot is-online' : 'online-dot';
      flags.appendChild(online);
      if (chat.unreadAdmin) {
        var unread = document.createElement('b');
        unread.className = 'unread-badge';
        unread.textContent = chat.unreadAdmin > 9 ? '9+' : String(chat.unreadAdmin);
        flags.appendChild(unread);
      }

      top.appendChild(logo);
      top.appendChild(nameWrap);
      top.appendChild(flags);

      var preview = document.createElement('span');
      preview.className = 'visitor-preview';
      preview.textContent = chat.lastMessageText || (chat.lastMessage && chat.lastMessage.text) || chat.issueCategory || 'New chat';

      var meta = document.createElement('span');
      meta.className = 'visitor-meta-line';
      meta.textContent = (chat.status || 'Open') + ' | ' + (chat.issueCategory || 'General question') + ' | ' + formatTime(chat.lastMessageAt || chat.updatedAt);

      button.appendChild(top);
      button.appendChild(preview);
      button.appendChild(meta);
      button.addEventListener('click', function () {
        selectChat(chat.sessionId);
      });
      list.appendChild(button);
    });
  }

  function renderConversation(chat) {
    state.currentChat = chat;
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

    var titleWrap = document.createElement('div');
    var title = document.createElement('h2');
    title.textContent = ((chat.visitor && chat.visitor.name) || 'Visitor') + ' - ' + (chat.productName || chat.product || 'Product');
    var status = document.createElement('p');
    status.className = 'live-chat-status-line';
    status.textContent = (chat.visitorOnline ? 'Online' : 'Offline') + ' | ' + (chat.status || 'Open') + ' | ' + (chat.issueCategory || 'General question');
    titleWrap.appendChild(title);
    titleWrap.appendChild(status);

    headingRow.appendChild(logo);
    headingRow.appendChild(titleWrap);

    var details = document.createElement('dl');
    [
      ['Phone', chat.visitor && chat.visitor.phone],
      ['Email', chat.visitor && chat.visitor.email],
      ['Visitor IP', chat.visitor && chat.visitor.ip],
      ['Page path', chat.visitor && chat.visitor.pagePath],
      ['User agent', chat.visitor && chat.visitor.userAgent]
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
    (chat.messages || []).forEach(function (message) {
      var row = document.createElement('div');
      row.className = 'message ' + (message.sender === 'customer' ? 'visitor' : message.sender);
      var label = document.createElement('span');
      label.textContent = message.sender === 'admin' ? 'Admin' : message.sender === 'bot' ? 'Auto reply' : 'Visitor';
      var bubble = document.createElement('p');
      bubble.textContent = message.text || '';
      var time = document.createElement('small');
      time.textContent = formatTime(message.createdAt || message.at);
      row.appendChild(label);
      row.appendChild(bubble);
      row.appendChild(time);
      messages.appendChild(row);
    });

    var typing = document.createElement('div');
    typing.id = 'adminTypingIndicator';
    typing.className = 'admin-typing-indicator';
    typing.hidden = true;
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;
    renderVisitorDetails(chat);
  }

  function renderVisitorDetails(chat) {
    var detailsBox = $('visitorDetails');
    if (!detailsBox || !chat) return;
    var visitor = chat.visitor || {};
    detailsBox.innerHTML = '';
    var heading = document.createElement('h2');
    heading.textContent = 'Visitor Details';
    detailsBox.appendChild(heading);

    var rows = [
      ['Name', visitor.name],
      ['Email', visitor.email],
      ['Phone', visitor.phone],
      ['Product', chat.productName || chat.product],
      ['Topic', chat.issueCategory],
      ['Status', chat.status],
      ['Online', chat.visitorOnline ? 'Yes' : 'No'],
      ['IP address', visitor.ip],
      ['Page URL', visitor.pagePath],
      ['User agent', visitor.userAgent],
      ['Created', chat.createdAt]
    ];

    var dl = document.createElement('dl');
    rows.forEach(function (item) {
      var wrapper = document.createElement('div');
      var term = document.createElement('dt');
      var desc = document.createElement('dd');
      term.textContent = item[0];
      desc.textContent = item[1] || 'Unknown';
      wrapper.appendChild(term);
      wrapper.appendChild(desc);
      dl.appendChild(wrapper);
    });
    detailsBox.appendChild(dl);
  }

  function setCustomerTyping(isTyping) {
    var typing = $('adminTypingIndicator');
    if (!typing) return;
    typing.textContent = isTyping ? 'Visitor is typing...' : '';
    typing.hidden = !isTyping;
  }

  function selectChat(sessionId) {
    state.selectedId = sessionId;
    renderVisitorList(state.chats);
    if (state.socket && state.socket.connected) {
      state.socket.emit('admin:openChat', { sessionId: sessionId }, function (reply) {
        if (reply && reply.ok) {
          renderConversation(reply.chat);
          showError('');
        } else {
          loadConversation();
        }
      });
    } else {
      loadConversation();
    }
  }

  function applyChatList(chats) {
    state.chats = chats || [];
    if (!state.selectedId && state.chats.length) state.selectedId = state.chats[0].sessionId || state.chats[0].id;
    if (state.selectedId && !state.chats.some(function (chat) { return (chat.sessionId || chat.id) === state.selectedId; })) {
      state.selectedId = state.chats.length ? (state.chats[0].sessionId || state.chats[0].id) : '';
    }
    renderVisitorList(state.chats);
    if (state.selectedId && !state.currentChat) selectChat(state.selectedId);
    state.initialized = true;
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
        showError('');
      })
      .catch(function (error) {
        if (error.message !== 'session-expired') showError(error.message || 'Unable to load conversation.');
      });
  }

  function pollChats() {
    if (state.sessionExpired) return;
    fetch('/admin/api/chats?product=' + encodeURIComponent(selectedFilter()))
      .then(function (response) {
        if (!response.ok || response.redirected) handleFetchError(response, 'Unable to load chats');
        return response.json();
      })
      .then(function (payload) {
        showError('');
        applyChatList(payload.chats || []);
        if (state.selectedId) loadConversation();
      })
      .catch(function (error) {
        if (error.message !== 'session-expired') showError(error.message || 'Unable to refresh chat list.');
      });
  }

  function postStatus(status) {
    if (!state.selectedId) return;
    if (state.socket && state.socket.connected) {
      state.socket.emit('admin:updateStatus', { sessionId: state.selectedId, status: status }, function (reply) {
        if (reply && reply.ok) {
          renderConversation(reply.chat);
          if (window.showToast) window.showToast('Chat status updated successfully.', 'success');
          return;
        }
        postStatusRest(status);
      });
      return;
    }
    postStatusRest(status);
  }

  function postStatusRest(status) {
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

  function sendReply(message, input) {
    if (state.socket && state.socket.connected) {
      state.socket.emit('admin:message', { sessionId: state.selectedId, text: message }, function (reply) {
        if (reply && reply.ok) {
          if (input) input.value = '';
          renderConversation(reply.chat);
          if (window.showToast) window.showToast('Reply sent successfully.', 'success');
          return;
        }
        sendReplyRest(message, input, reply && reply.error);
      });
      return;
    }
    sendReplyRest(message, input);
  }

  function sendReplyRest(message, input, socketError) {
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
        showError((payload && payload.error) || socketError || 'Unable to send reply.');
      });
  }

  function exportSelectedChat() {
    if (!state.currentChat) return;
    var payload = JSON.stringify(state.currentChat, null, 2);
    var blob = new Blob([payload], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = (state.currentChat.sessionId || 'chat') + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    if (window.showToast) window.showToast('Chat exported successfully.', 'success');
  }

  function initSocket() {
    if (!window.io) return;
    state.socket = window.io({ transports: ['websocket', 'polling'] });

    state.socket.on('connect', function () {
      state.socket.emit('admin:join');
      if (state.selectedId) selectChat(state.selectedId);
    });

    state.socket.on('chat:list:update', function (chats) {
      applyChatList(chats || []);
    });

    state.socket.on('admin:notify', function (payload) {
      if (isSoundEnabled()) beep();
      if (window.showToast) {
        window.showToast('New message from ' + ((payload && payload.name) || 'visitor') + '.', 'info');
      }
    });

    state.socket.on('chat:message:new', function (payload) {
      if (!payload || !payload.chat) return;
      if (payload.sessionId === state.selectedId) {
        renderConversation(payload.chat);
        state.socket.emit('admin:seen', { sessionId: state.selectedId });
      }
      pollChats();
    });

    state.socket.on('chat:typing', function (payload) {
      if (!payload || payload.sessionId !== state.selectedId || payload.sender !== 'customer') return;
      setCustomerTyping(payload.isTyping);
    });

    state.socket.on('chat:status:update', function (payload) {
      if (payload && payload.sessionId === state.selectedId && payload.chat) renderConversation(payload.chat);
      pollChats();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var replyForm = $('adminReplyForm');
    var productFilter = $('liveProductFilter');
    var soundToggle = $('soundToggle');
    var input = $('adminReply');
    var searchInput = $('adminChatSearch');
    var exportButton = $('exportChatButton');

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

    initSocket();

    if (replyForm) {
      replyForm.addEventListener('submit', function (event) {
        event.preventDefault();
        showError('');
        var message = input ? input.value.trim() : '';
        if (!state.selectedId || !message) return;
        sendReply(message, input);
      });
    }

    if (input) {
      input.addEventListener('input', function () {
        if (!state.socket || !state.selectedId) return;
        state.socket.emit('admin:typing', { sessionId: state.selectedId, isTyping: true });
        window.clearTimeout(state.typingTimer);
        state.typingTimer = window.setTimeout(function () {
          state.socket.emit('admin:typing', { sessionId: state.selectedId, isTyping: false });
        }, 900);
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
        state.currentChat = null;
        pollChats();
        if (window.showToast) window.showToast('Chat filter applied.', 'success');
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        state.searchQuery = searchInput.value.trim().toLowerCase();
        renderVisitorList(state.chats);
      });
    }

    Array.prototype.slice.call(document.querySelectorAll('[data-list-filter]')).forEach(function (button) {
      button.addEventListener('click', function () {
        state.listFilter = button.getAttribute('data-list-filter') || 'all';
        Array.prototype.slice.call(document.querySelectorAll('[data-list-filter]')).forEach(function (item) {
          item.classList.toggle('active', item === button);
        });
        renderVisitorList(state.chats);
      });
    });

    if (exportButton) {
      exportButton.addEventListener('click', exportSelectedChat);
    }

    pollChats();
    state.pollHandle = window.setInterval(pollChats, 2000);
  });
})();
