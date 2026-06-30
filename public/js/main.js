(function () {
  function filterProducts() {
    var input = document.getElementById('productSearch');
    var cards = Array.prototype.slice.call(document.querySelectorAll('.product-card'));
    var empty = document.getElementById('productEmpty');
    if (!input || !cards.length) return;

    function applyFilter() {
      var query = input.value.trim().toLowerCase();
      var visibleCount = 0;
      cards.forEach(function (card) {
        var haystack = [
          card.getAttribute('data-name') || '',
          card.getAttribute('data-categories') || ''
        ].join(' ');
        var visible = haystack.indexOf(query) !== -1;
        card.hidden = !visible;
        if (visible) visibleCount += 1;
      });
      if (empty) empty.hidden = visibleCount !== 0;
    }

    input.addEventListener('input', applyFilter);
    applyFilter();
  }

  function syncCategorySelects() {
    var productSelects = Array.prototype.slice.call(document.querySelectorAll('.js-product-select'));
    productSelects.forEach(function (productSelect) {
      productSelect.addEventListener('change', function () {
        var targetId = productSelect.getAttribute('data-category-target');
        var categorySelect = targetId ? document.getElementById(targetId) : null;
        if (!categorySelect || !productSelect.value) return;

        fetch('/api/products/' + encodeURIComponent(productSelect.value))
          .then(function (response) {
            if (!response.ok) throw new Error('Product not found');
            return response.json();
          })
          .then(function (data) {
            categorySelect.innerHTML = '';
            var categories = data.product.categoryTitles || data.product.categories || [];
            categories.forEach(function (category) {
              var title = typeof category === 'string' ? category : category.title;
              var option = document.createElement('option');
              option.value = title;
              option.textContent = title;
              categorySelect.appendChild(option);
            });
          })
          .catch(function () {
            categorySelect.innerHTML = '';
          });
      });
    });
  }

  function enableClickableCards() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.clickable-card[data-href]'));
    cards.forEach(function (card) {
      card.addEventListener('click', function (event) {
        if (event.target.closest('a, button, input, select, textarea')) return;
        window.location.href = card.getAttribute('data-href');
      });
    });
  }

  function setupHeaderDropdowns() {
    var dropdowns = Array.prototype.slice.call(document.querySelectorAll('.nav-dropdown'));
    if (!dropdowns.length) return;

    function closeAll(except) {
      dropdowns.forEach(function (dropdown) {
        if (dropdown === except) return;
        dropdown.classList.remove('open');
        var button = dropdown.querySelector('.nav-dropdown-toggle');
        if (button) button.setAttribute('aria-expanded', 'false');
      });
    }

    dropdowns.forEach(function (dropdown) {
      var button = dropdown.querySelector('.nav-dropdown-toggle');
      if (!button) return;
      button.addEventListener('click', function (event) {
        event.preventDefault();
        var isOpen = dropdown.classList.toggle('open');
        button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        closeAll(dropdown);
      });
    });

    document.addEventListener('click', function (event) {
      if (event.target.closest('.nav-dropdown')) return;
      closeAll();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeAll();
    });
  }

  function setupFooterDropdowns() {
    var toggles = Array.prototype.slice.call(document.querySelectorAll('.footer-toggle'));
    var mobileQuery = window.matchMedia('(max-width: 560px)');
    toggles.forEach(function (toggle) {
      var column = toggle.closest('.footer-col');
      if (!column) return;
      column.classList.toggle('footer-open', !mobileQuery.matches);
      toggle.setAttribute('aria-expanded', mobileQuery.matches ? 'false' : 'true');
      toggle.addEventListener('click', function () {
        var isOpen = column.classList.toggle('footer-open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    });
  }

  function setupMobileMenus() {
    var headers = Array.prototype.slice.call(document.querySelectorAll('.site-header, .guide-header'));
    headers.forEach(function (header) {
      var toggle = header.querySelector('.mobile-menu-toggle');
      var panel = header.querySelector('.mobile-menu-panel');
      if (!toggle || !panel) return;

      function setOpen(open) {
        header.classList.toggle('mobile-menu-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      }

      toggle.addEventListener('click', function (event) {
        event.preventDefault();
        setOpen(!header.classList.contains('mobile-menu-open'));
      });

      panel.addEventListener('click', function (event) {
        if (event.target.closest('a')) setOpen(false);
      });

      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') setOpen(false);
      });

      document.addEventListener('click', function (event) {
        if (header.contains(event.target)) return;
        setOpen(false);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    filterProducts();
    syncCategorySelects();
    enableClickableCards();
    setupHeaderDropdowns();
    setupFooterDropdowns();
    setupMobileMenus();
  });
})();
