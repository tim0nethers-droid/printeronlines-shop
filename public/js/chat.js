(function () {
  var state = {
    chatId: '',
    token: '',
    pollHandle: null,
    lastRendered: ''
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
      name: data.get('name') || '',
      email: data.get('email') || '',
      phone: data.get('phone') || '',
      product: data.get('product') || data.get('productSlug') || '',
      productSlug: data.get('productSlug') || data.get('product') || '',
      issue: data.get('issue') || '',
      message: data.get('message') || ''
    };
  }

  function renderMessages(messages) {
    var container = $('chatMessages');
    if (!container) return;
    var fingerprint = messages.map(function (message) {
      return message.id + message.text;
    }).join('|');
    if (fingerprint === state.lastRendered) return;
    state.lastRendered = fingerprint;
    container.innerHTML = '';

    messages.forEach(function (message) {
      var row = document.createElement('div');
      row.className = 'chat-message ' + (message.sender === 'visitor' ? 'customer' : message.sender);
      var label = document.createElement('span');
      label.textContent = message.sender === 'admin' ? 'Portal team' : message.sender === 'bot' ? 'Auto reply' : 'You';
      var bubble = document.createElement('p');
      bubble.textContent = message.text;
      row.appendChild(label);
      row.appendChild(bubble);
      container.appendChild(row);
    });
    container.scrollTop = container.scrollHeight;
  }

  function pollMessages() {
    if (!state.chatId || !state.token) return;
    fetch('/api/chat/' + encodeURIComponent(state.chatId) + '/messages?token=' + encodeURIComponent(state.token))
      .then(function (response) {
        if (!response.ok) throw new Error('Chat not found');
        return response.json();
      })
      .then(function (data) {
        var status = $('chatStatus');
        if (status) status.textContent = data.status || 'Open';
        renderMessages(data.messages || []);
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

  document.addEventListener('DOMContentLoaded', function () {
    var startForm = $('chatStartForm');
    var replyForm = $('chatReplyForm');

    if (startForm) {
      startForm.addEventListener('submit', function (event) {
        event.preventDefault();
        showError($('chatStartError'), '');

        fetch('/api/chat/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formToObject(startForm))
        })
          .then(function (response) {
            return response.json().then(function (payload) {
              if (!response.ok) throw payload;
              return payload;
            });
          })
          .then(function (payload) {
            state.chatId = payload.chatId;
            state.token = payload.token;
            startForm.hidden = true;
            var chatWindow = $('chatWindow');
            if (chatWindow) chatWindow.hidden = false;
            var title = $('chatTitle');
            if (title && payload.chat) title.textContent = payload.chat.product + ' product question';
            renderMessages(payload.chat.messages || []);
            startPolling();
          })
          .catch(function (payload) {
            var errors = payload && payload.errors ? Object.values(payload.errors).join(' ') : 'Unable to start chat.';
            showError($('chatStartError'), errors);
          });
      });
    }

    if (replyForm) {
      replyForm.addEventListener('submit', function (event) {
        event.preventDefault();
        showError($('chatReplyError'), '');
        var input = $('chatMessage');
        var message = input ? input.value.trim() : '';
        if (!message) return;

        fetch('/api/chat/' + encodeURIComponent(state.chatId) + '/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: state.token, message: message })
        })
          .then(function (response) {
            return response.json().then(function (payload) {
              if (!response.ok) throw payload;
              return payload;
            });
          })
          .then(function (payload) {
            if (input) input.value = '';
            renderMessages(payload.chat.messages || []);
          })
          .catch(function (payload) {
            showError($('chatReplyError'), payload && payload.error ? payload.error : 'Unable to send message.');
          });
      });
    }
  });
})();
