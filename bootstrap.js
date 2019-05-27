Components.utils.import("resource://gre/modules/Services.jsm");

let appinfo = Services.appinfo;
let options = {
  application: appinfo.ID,
  appversion: appinfo.version,
  platformversion: appinfo.platformVersion,
  os: appinfo.OS,
  osversion: Services.sysinfo.getProperty("version"),
  abi: appinfo.XPCOMABI
};

let man = `
overlay	chrome://browser/content/browser.xul	chrome://firegestures/content/browser.xul
overlay	chrome://global/content/viewSource.xul	chrome://firegestures/content/viewSource.xul
overlay	chrome://global/content/viewPartialSource.xul	chrome://firegestures/content/viewSource.xul
overlay	chrome://global/content/selectDialog.xul	chrome://firegestures/content/selectDialog.xul
`;

function showRestartNotifcation(verb, window) {
  window.PopupNotifications._currentNotifications.shift();
  window.PopupNotifications.show(
    window.gBrowser.selectedBrowser,
    'addon-install-restart',
	'FireGestures has been ' + verb + ', but a restart is required to ' + ((verb == 'upgraded' || verb == 'installed') || verb == 're-enabled' ? 'enable' : 'remove') + ' add-on functionality.',
    'addons-notification-icon',
    {
      label: 'Restart Now',
      accessKey: 'R',
      callback() {
        window.BrowserUtils.restartApplication();
      }
    },
    [{
      label: 'Not Now',
      accessKey: 'N',
      callback: () => {},
    }],
    {
      popupIconURL: 'chrome://firegestures/skin/addon-install-restart.svg',
      persistent: false,
      hideClose: true,
      timeout: Date.now() + 30000,
      removeOnDismissal: true
    }
  );
}

function install(data, reason) {
  const window = Services.wm.getMostRecentWindow('navigator:browser');
  showRestartNotifcation("installed", window);
  return;
}

function uninstall() { }

function startup(data, reason) {
  var temp = {};
  Services.scriptloader.loadSubScript("chrome://firegestures/content/firegestures-prefs.js", temp, 'UTF-8');
  delete temp;

  Components.utils.import("chrome://firegestures/content/ChromeManifest.jsm");
  Components.utils.import("chrome://firegestures/content/Overlays.jsm");
  
  const window = Services.wm.getMostRecentWindow('navigator:browser');
  if (reason === ADDON_UPGRADE || reason === ADDON_DOWNGRADE) {
      showRestartNotifcation("upgraded", window);
      return;
  } else if (reason === ADDON_ENABLE) {
      showRestartNotifcation("re-enabled", window);
      return;
  }

  (async function () {
    let chromeManifest = new ChromeManifest(function () { return man; }, options);
    await chromeManifest.parse();

    let documentObserver = {
      observe(document) {
        if (document.constructor.name === "XULDocument") {
          Overlays.load(chromeManifest, document.defaultView);
        }
      }
    };
    Services.obs.addObserver(documentObserver, "chrome-document-loaded");
  })();
}

function shutdown(data, reason) {
  const window = Services.wm.getMostRecentWindow('navigator:browser');
  if (reason === ADDON_DISABLE) {
      showRestartNotifcation("disabled", window);
      return;
  } else if (reason === ADDON_UNINSTALL) {
      showRestartNotifcation("uninstalled", window);
      return;
  }
}
