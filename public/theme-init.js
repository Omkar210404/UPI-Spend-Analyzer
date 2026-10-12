// Runs before the app bundle so a saved dark theme is applied before first paint.
// Light is the default; only an explicit saved choice of "dark" changes it.
(function () {
  try {
    var saved = window.localStorage.getItem('upi-spend-analyzer:v1:theme');
    if (saved === '"dark"') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (error) {
    // Storage is blocked: stay on the light default.
  }
})();
