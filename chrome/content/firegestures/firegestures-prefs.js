(function () {
  function pref(name, value) {
    let branch = Services.prefs.getBranch("");
    let defaultBranch = Services.prefs.getDefaultBranch("");
    if (defaultBranch.getPrefType(name) == Components.interfaces.nsIPrefBranch.PREF_INVALID) {
      // Only use the default branch if it doesn't already have the pref set.
      // If there is already a pref with this value on the default branch, the
      // extension wants to override a built-in value.
      branch = defaultBranch;
    } else if (defaultBranch.prefHasUserValue(name)) {
      // If a pref already has a user-set value it proper type
      // will be returned (not PREF_INVALID). In that case keep the user's
      // value and overwrite the default.
      branch = defaultBranch;
    }

    if (typeof value == "boolean") {
      branch.setBoolPref(name, value);
    } else if (typeof value == "string") {
      // I have not seen any references to StringPref elsewhere, only CharPref in browser.js
	  //branch.setStringPref(name, value);
	  branch.setCharPref(name, value);
    } else if (typeof value == "number" && Number.isInteger(value)) {
      branch.setIntPref(name, value);
    }
  }
  
  pref("extensions.firegestures.mousegesture", true);
  pref("extensions.firegestures.wheelgesture", true);
  pref("extensions.firegestures.rockergesture", false);
  pref("extensions.firegestures.keypressgesture", true);
  pref("extensions.firegestures.tabwheelgesture", false);
  pref("extensions.firegestures.swipegesture", true);
  pref("extensions.firegestures.trigger_button", 2);
  pref("extensions.firegestures.suppress.alt", false);
  pref("extensions.firegestures.mousetrail", true);
  pref("extensions.firegestures.mousetrail.size", 2);
  pref("extensions.firegestures.mousetrail.color", "#33FF33");
  pref("extensions.firegestures.gesture_timeout", 3000);
  pref("extensions.firegestures.status_display", 2000);
  pref("extensions.firegestures.swipe_timeout", 0);
  pref("extensions.firegestures.blocked_hosts", "");
  
})()