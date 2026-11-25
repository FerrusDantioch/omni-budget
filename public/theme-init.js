/*
 * INITIALISATION IMMEDIATE DU THEME (anti-FOUC)
 *
 * Execute de facon synchrone avant le premier rendu CSS pour eviter tout eclair
 * lumineux si le theme choisi est "sombre" ou "omni".
 */
(function () {
  try {
    var valeur = localStorage.getItem('budget-theme');
    var theme =
      valeur === 'clair' || valeur === 'sombre' || valeur === 'omni' || valeur === 'auto'
        ? valeur
        : 'auto';
    var sombre =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    var applique = theme === 'auto' ? (sombre ? 'sombre' : 'clair') : theme;
    document.documentElement.setAttribute('data-theme', applique);

    var couleur = applique === 'omni' ? '#0e0d12' : applique === 'sombre' ? '#12151a' : '#f7f8fa';
    var balises = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < balises.length; i++) {
      balises[i].setAttribute('content', couleur);
    }
  } catch (e) {
    // Stockage prive ou bloque : on conserve le theme par defaut.
  }
})();
