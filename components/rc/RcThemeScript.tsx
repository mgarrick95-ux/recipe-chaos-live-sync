import React from "react";

/**
 * Drop this in app/layout.tsx inside <head> to apply theme ASAP.
 * Uses localStorage "rc_ui_prefs_v1" with shape: { theme: "dark"|"light" }.
 */
export default function RcThemeScript() {
  const code = `
(function(){
  try{
    var key="rc_ui_prefs_v1";
    var raw=localStorage.getItem(key);
    var parsed=raw?JSON.parse(raw):null;
    var theme=(parsed && parsed.theme) ? String(parsed.theme).toLowerCase() : "dark";
    if(theme!=="light" && theme!=="dark") theme="dark";
    document.documentElement.dataset.theme=theme;
    document.documentElement.classList.toggle("theme-dark", theme==="dark");
    document.documentElement.classList.toggle("theme-light", theme==="light");
  }catch(e){}
})();`.trim();

  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
