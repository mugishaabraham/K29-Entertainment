(function () {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'back-to-top';
  button.setAttribute('aria-label', 'Back to top');
  button.textContent = '↑';

  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function toggleVisibility() {
    button.classList.toggle('show', window.scrollY > 260);
  }

  document.body.appendChild(button);
  window.addEventListener('scroll', toggleVisibility, { passive: true });
  toggleVisibility();
})();
