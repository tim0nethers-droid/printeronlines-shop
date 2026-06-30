(function () {
  var dashboardRing = {
    socket: null,
    audioContext: null,
    ringTimer: null,
    ringStopTimer: null,
    lastMessageKeys: {},
    initialized: false,
    audioUnlocked: false,
    pollHandle: null
  };

  function createToastContainer() {
    var container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  }

  function showToast(message, type) {
    var container = document.querySelector('.toast-container') || createToastContainer();
    var toast = document.createElement('div');
    toast.className = 'admin-toast toast-' + (type || 'success');

    var text = document.createElement('span');
    text.textContent = message;
    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = '&times;';

    close.addEventListener('click', function () {
      toast.remove();
    });

    toast.appendChild(text);
    toast.appendChild(close);
    container.appendChild(toast);

    window.setTimeout(function () {
      toast.classList.add('hide');
      window.setTimeout(function () {
        toast.remove();
      }, 300);
    }, 4000);
  }

  function toastFromCode(code) {
    var map = {
      'request-status-updated': ['Request status updated successfully.', 'success'],
      'filters-applied': ['Filters applied successfully.', 'success'],
      'filters-reset': ['Filters reset. Showing all records.', 'info'],
      'exported': ['Report exported successfully.', 'success']
    };
    return map[code] || null;
  }

  function isDashboardPage() {
    return window.location.pathname === '/admin/dashboard';
  }

  function unlockDashboardAudio() {
    if (dashboardRing.audioUnlocked) return;
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    var context = dashboardRing.audioContext || new AudioContext();
    dashboardRing.audioContext = context;
    if (context.state === 'suspended') context.resume().catch(function () {});
    var gain = context.createGain();
    var oscillator = context.createOscillator();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.03);
    dashboardRing.audioUnlocked = true;
  }

  function stopDashboardRing() {
    if (dashboardRing.ringTimer) {
      window.clearInterval(dashboardRing.ringTimer);
      dashboardRing.ringTimer = null;
    }
    if (dashboardRing.ringStopTimer) {
      window.clearTimeout(dashboardRing.ringStopTimer);
      dashboardRing.ringStopTimer = null;
    }
  }

  function playDashboardRing(durationMs) {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    var context = dashboardRing.audioContext || new AudioContext();
    dashboardRing.audioContext = context;
    if (context.state === 'suspended') context.resume().catch(function () {});
    stopDashboardRing();

    function playPulse() {
      var first = context.createOscillator();
      var second = context.createOscillator();
      var third = context.createOscillator();
      var gain = context.createGain();
      first.type = 'square';
      second.type = 'sine';
      third.type = 'triangle';
      first.frequency.setValueAtTime(880, context.currentTime);
      first.frequency.exponentialRampToValueAtTime(1180, context.currentTime + 0.16);
      second.frequency.setValueAtTime(660, context.currentTime);
      second.frequency.exponentialRampToValueAtTime(760, context.currentTime + 0.16);
      third.frequency.setValueAtTime(1320, context.currentTime);
      third.frequency.exponentialRampToValueAtTime(1480, context.currentTime + 0.16);
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.48, context.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.58);
      first.connect(gain);
      second.connect(gain);
      third.connect(gain);
      gain.connect(context.destination);
      first.start();
      second.start(context.currentTime + 0.08);
      third.start(context.currentTime + 0.04);
      first.stop(context.currentTime + 0.6);
      second.stop(context.currentTime + 0.6);
      third.stop(context.currentTime + 0.6);
    }

    playPulse();
    dashboardRing.ringTimer = window.setInterval(playPulse, 580);
    dashboardRing.ringStopTimer = window.setTimeout(stopDashboardRing, durationMs || 10000);
  }

  function chatMessageKey(chat) {
    var last = chat.lastMessage || {};
    return [
      chat.sessionId || chat.id || '',
      last.id || '',
      last.sender || '',
      last.text || chat.lastMessageText || '',
      chat.lastMessageAt || chat.updatedAt || ''
    ].join('|');
  }

  function detectDashboardMessages(chats) {
    var shouldRing = false;
    (chats || []).forEach(function (chat) {
      var sessionId = chat.sessionId || chat.id;
      var key = chatMessageKey(chat);
      var last = chat.lastMessage || {};
      var sender = last.sender || '';
      var isCustomerMessage = sender === 'visitor' || sender === 'customer';
      var isNew = dashboardRing.lastMessageKeys[sessionId] && dashboardRing.lastMessageKeys[sessionId] !== key;
      if (dashboardRing.initialized && isNew && isCustomerMessage) shouldRing = true;
      dashboardRing.lastMessageKeys[sessionId] = key;
    });
    if (shouldRing) {
      playDashboardRing(10000);
      showToast('New chat message received.', 'info');
    }
    dashboardRing.initialized = true;
  }

  function refreshDashboardChats() {
    fetch('/admin/api/chats')
      .then(function (response) {
        if (!response.ok || response.redirected) throw new Error('Unable to refresh chats');
        return response.json();
      })
      .then(function (payload) {
        detectDashboardMessages(payload.chats || []);
      })
      .catch(function () {});
  }

  function initDashboardRing() {
    if (!isDashboardPage()) return;

    ['click', 'keydown', 'touchstart'].forEach(function (eventName) {
      document.addEventListener(eventName, unlockDashboardAudio, { once: true, passive: true });
    });

    if (window.io) {
      dashboardRing.socket = window.io({ transports: ['websocket', 'polling'] });
      dashboardRing.socket.on('connect', function () {
        dashboardRing.socket.emit('admin:join');
      });
      dashboardRing.socket.on('admin:notify', function (payload) {
        playDashboardRing(10000);
        showToast('New message from ' + ((payload && payload.name) || 'visitor') + '.', 'info');
      });
      dashboardRing.socket.on('chat:list:update', function (chats) {
        detectDashboardMessages(chats || []);
      });
    }

    refreshDashboardChats();
    dashboardRing.pollHandle = window.setInterval(refreshDashboardChats, 2000);
  }

  window.showToast = showToast;
  window.createToastContainer = createToastContainer;

  document.addEventListener('DOMContentLoaded', function () {
    var bodyToast = document.body.getAttribute('data-toast');
    var url = new URL(window.location.href);
    var queryToast = url.searchParams.get('toast');
    var toast = toastFromCode(bodyToast || queryToast);
    if (toast) showToast(toast[0], toast[1]);

    if (window.location.pathname === '/admin/dashboard' && !queryToast && (url.searchParams.get('product') || url.searchParams.get('status'))) {
      showToast('Filters applied successfully.', 'success');
    }

    if (window.sessionStorage.getItem('adminResetToast') === '1') {
      window.sessionStorage.removeItem('adminResetToast');
      showToast('Filters reset. Showing all records.', 'info');
    }

    Array.prototype.slice.call(document.querySelectorAll('[data-toast-reset]')).forEach(function (link) {
      link.addEventListener('click', function () {
        window.sessionStorage.setItem('adminResetToast', '1');
      });
    });

    Array.prototype.slice.call(document.querySelectorAll('[data-toast-export]')).forEach(function (link) {
      link.addEventListener('click', function () {
        showToast('Report exported successfully.', 'success');
      });
    });

    initDashboardRing();
  });
})();
