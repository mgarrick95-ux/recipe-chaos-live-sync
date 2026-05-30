"use client";

export default function ThemeInitScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function () {
  try {
    var raw = window.localStorage.getItem("recipechaos_ui_prefs_v1");
    var prefs = raw ? JSON.parse(raw) : null;
    var theme = prefs && (prefs.theme === "light" || prefs.theme === "dark") ? prefs.theme : "dark";

    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("theme-dark", theme === "dark");
    document.documentElement.classList.toggle("theme-light", theme === "light");
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.classList.add("theme-dark");
    document.documentElement.classList.remove("theme-light");
  }
})();
        `,
      }}
    />
  );
}
