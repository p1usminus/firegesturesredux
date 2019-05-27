//Components.utils.import("resource://gre/modules/Services.jsm");

var gGestureHandler = Components.utils.import("chrome://firegestures-components/content/xdGestureHandler.jsm", null).xdGestureHandler;
var gGestureMapping = Components.utils.import("chrome://firegestures-components/content/xdGestureMapping.jsm", null).xdGestureMapping;

const Cc = Components.classes;
const Ci = Components.interfaces;

const DB_FILE_NAME = "firegestures.sqlite";
const BROWSER_ID  = "gesture_mappings";
const BROWSER_URI = "chrome://firegestures/content/browser.rdf";
const VIEWSOURCE_ID  = "viewsource_mapping";
const VIEWSOURCE_URI = "chrome://firegestures/content/viewSource.rdf";
const BUNDLE_URI = "chrome://firegestures/locale/firegestures.properties";

var EXPORTED_SYMBOLS = ["xdGestureService"];

//function xdGestureService() {
//	return this._initService();
//}

var xdGestureService = {
//xdGestureService.prototype = {

	_dbFile: null,

	_dbConn: null,
	
	_stringBundle: null,

	_mappingsMeta: {},

	_namedMappings: {},
	

	_initService: function FGS__initService() {
		if (this._dbFile)
			return;
		var dirSvc = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
		this._dbFile = dirSvc.get("ProfD", Ci.nsILocalFile);
		this._dbFile.append(DB_FILE_NAME);
		this.registerMapping(BROWSER_ID, BROWSER_URI, this.getLocaleString("BROWSER"));
		this.registerMapping(VIEWSOURCE_ID, VIEWSOURCE_URI, this.getLocaleString("VIEWSOURCE"));
	},

	createHandler: function FGS_createHandler() {
		var handler = new gGestureHandler();
		return handler;
	},

	registerMapping: function FGS_registerMapping(aID, aURI, aName) {
		if (aID in this._mappingsMeta)
			return;
		this._mappingsMeta[aID] = { uri: aURI, name: aName };
	},

	getMapping: function FGS_getMapping(aID) {
		if (aID in this._namedMappings)
			return this._namedMappings[aID];
		var meta = this._mappingsMeta[aID];
		// This seems to be where it breaks - due to xdGestureMapping.jsm?
		if (!meta)
			throw Components.results.NS_ERROR_NOT_INITIALIZED;
		var mapping = new gGestureMapping();
		mapping.init(aID, meta.uri, meta.name);
		this._namedMappings[aID] = mapping;
		return mapping;
	},

	getMappingForBrowser: function FGS_getMappingForBrowser() {
		return this.getMapping(BROWSER_ID);
	},

	getMappingsInfo: function FGS_getMappingsInfo() {
		var ret = [];
		for (var id in this._mappingsMeta) {
			var meta = this._mappingsMeta[id];
			ret.push({ id: id, uri: meta.uri, name: meta.name });
		}
		return ret;
	},

	backupMappings: function FGS_backupMappings(aFile) {
		if (!this._dbFile.exists())
			throw Components.results.NS_ERROR_FAILURE;
		if (aFile.exists())
			aFile.remove(false);
		this._dbFile.copyTo(aFile.parent, aFile.leafName);
	},

	restoreMappings: function FGS_restoreMappings(aFile) {
		if (aFile.equals(this._dbFile))
			return;
		if (this._dbConn) {
			this._dbConn.close();
			this._dbConn = null;
		}
		if (this._dbFile.exists())
			this._dbFile.remove(false);
		aFile.copyTo(this._dbFile.parent, DB_FILE_NAME);
		this._dbFile = null;
		this._initService();
		for (let { id: id, uri: uri, name: name } of this.getMappingsInfo()) {
			var mapping = this._namedMappings[id];
			if (mapping) {
				mapping.finalize();
				mapping.init(id, uri, name);
			}
		}
		var winMed = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
		var winEnum = winMed.getEnumerator(null);
		while (winEnum.hasMoreElements()) {
			var win = winEnum.getNext().QueryInterface(Ci.nsIDOMWindow);
			if (win.PrefsUI) {
				win.gShouldCommit = false;
				win.close();
			}
		}
	},

	getDBConnection: function FGS_getDBConnection(aForceOpen) {
		if (!aForceOpen && !this._dbFile.exists())
			return null;
		if (!this._dbConn || !this._dbConn.connectionReady) {
			var dbSvc = Cc["@mozilla.org/storage/service;1"].getService(Ci.mozIStorageService);
			this._dbConn = dbSvc.openDatabase(this._dbFile);
		}
		return this._dbConn;
	},

	getLocaleString: function FGS_getLocaleString(aName) {
		if (!this._stringBundle) {
			var bundleSvc = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService);
			this._stringBundle = bundleSvc.createBundle(BUNDLE_URI);
			//this._stringBundle = Services.strings.createBundle(BUNDLE_URI);
		}
		try {
			return this._stringBundle.GetStringFromName(aName);
		}
		catch (ex) {
			return aName;
		}
	},

};
