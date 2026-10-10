// Run before styles load; an external script also works under production's CSP.
try {
  document.documentElement.dataset.theme = localStorage.getItem('gymverse-theme') === 'light' ? 'light' : 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}
