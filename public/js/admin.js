(function () {
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
  });
})();
