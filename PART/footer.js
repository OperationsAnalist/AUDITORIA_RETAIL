document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("appFooterFixed")) return;

  const footer = document.createElement("footer");
  footer.id = "appFooterFixed";
  footer.className = "app-footer-fixed";
  footer.innerHTML = `
    <span>© 2026</span>
    <span>SMART LOGISTICS SOLUTIONS</span>
    <span>BPE Perú</span>
  `;

  document.body.appendChild(footer);
});
