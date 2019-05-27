//var gGestureService = Components.utils.import("chrome://firegestures-components/content/xdGestureService.jsm", null);

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const TYPE_CATEGORY = 0;
const TYPE_NORMAL   = 1;
const TYPE_SCRIPT   = 2;

const RDF_NS   = "http://www.xuldev.org/firegestures-mapping#";
const RDF_ROOT = "urn:mapping:root";
const BROWSER_ID = "gesture_mappings";
const WINDOW_TYPE = "FireGestures:Options";

var EXPORTED_SYMBOLS = ["xdGestureMapping"];

function alert(aMsg) {
	Cu.reportError(aMsg);
	var fuelApp = Cc["@mozilla.org/fuel/application;1"].getService(Ci.fuelIApplication);
	fuelApp.console.open();
}

function xdGestureMapping() {}

//var xdGestureMapping = {
xdGestureMapping.prototype = {

	get rdfSvc() {
		var svc = Cc["@mozilla.org/rdf/rdf-service;1"].getService(Ci.nsIRDFService);
		this.__defineGetter__("rdfSvc", function() {return svc});
		return this.rdfSvc;
	},

	id: null,

	name: null,

	_dataSource: null,

	_mapping: null,

	_getDBConnection: null,


	init: function FGM_init(aID, aURI, aName) {
		if (this._dataSource)
			throw Cr.NS_ERROR_ALREADY_INITIALIZED;
		if (!/^\w+$/.test(aID))
			throw Cr.NS_ERROR_ILLEGAL_VALUE;
		this.id = aID;
		this.name = aName;
		var gestureSvc = gGestureService.xdGestureService;
		this._getDBConnection = gestureSvc.getDBConnection;
		try {
			this._dataSource = this.rdfSvc.GetDataSourceBlocking(aURI);
		}
		catch(ex) {
			alert("FireGestures: An error occurred while parsing gesture mapping.\n\n" + ex);
			throw ex;
		}
		this._reloadMapping();
	},

	_ensureInit: function FGM__ensureInit() {
		if (!this._dataSource)
			throw Cr.NS_ERROR_NOT_INITIALIZED;
	},

	finalize: function FGM_finalize() {
		if (this._dataSource)
			this.rdfSvc.UnregisterDataSource(this._dataSource);
		this.id   = null;
		this.name = null;
		this._dataSource = null;
		this._mapping    = null;
	},

	_reloadMapping: function FGM__reloadMapping() {
		this._mapping = null;
		this._getUserMapping() || this._getDefaultMapping();
	},

	_getUserMapping: function FGM__getUserMapping() {
		this._ensureInit();
		var dbConn = this._getDBConnection(false);
		if (!dbConn || !dbConn.tableExists(this.id))
			return false;
		this._mapping = {};
		var stmt = dbConn.createStatement("SELECT * FROM " + this.id);
		try {
			while (stmt.executeStep()) {
				var type      = stmt.getInt32(0);
				var name      = stmt.getUTF8String(1);
				var command   = stmt.getUTF8String(2);
				var direction = stmt.getUTF8String(3);
				if (!command || !direction)
					continue;
				if (type != TYPE_SCRIPT)
					name = this._getLocalizedNameForCommand(command);
				this._mapping[direction] = new xdGestureCommand(type, name, command);
			}
		}
		catch(ex) { Cu.reportError(ex); }
		finally { stmt.reset(); stmt.finalize(); }
		var swipes = ["swipe-left", "swipe-right", "swipe-up", "swipe-down"];
		if (swipes.every(function(swipe){return this._mapping[swipe]} === undefined, this)) {
			swipes.forEach(function(swipe) {
				var prop    = this.rdfSvc.GetResource(RDF_NS + "extra");
				var target  = this.rdfSvc.GetLiteral(swipe);
				var res     = this._dataSource.GetSource(prop, target, true);
				var command = res.Value.substr(("urn:").length);
				var name    = this._getLocalizedNameForCommand(command);
				this._mapping[swipe] = new xdGestureCommand(TYPE_NORMAL, name, command);
			}, this);
		}
		return true;
	},

	_getDefaultMapping: function FGM__getDefaultMapping() {
		this._ensureInit();
		this._mapping = {};
		var rdfCont = Cc["@mozilla.org/rdf/container;1"].createInstance(Ci.nsIRDFContainer);
		rdfCont.Init(this._dataSource, this.rdfSvc.GetResource(RDF_ROOT));
		var resEnum = rdfCont.GetElements();
		while (resEnum.hasMoreElements()) {
			var res = resEnum.getNext().QueryInterface(Ci.nsIRDFResource);
			var type      = parseInt(this._getPropertyValue(res, "type"), 10);
			var name      = this._getPropertyValue(res, "name");
			var command   = res.Value.substr(("urn:").length);
			var direction = this._getPropertyValue(res, "direction");
			var extra     = this._getPropertyValue(res, "extra");
			if (type == TYPE_CATEGORY || (!direction && !extra))
				continue;
			this._mapping[direction] = new xdGestureCommand(type, name, command);
			if (extra)
				this._mapping[extra] = new xdGestureCommand(type, name, command);
		}
	},

	_getLocalizedNameForCommand: function FGM__getLocalizedNameForCommand(aCommand) {
		var res = this.rdfSvc.GetResource("urn:" + aCommand);
		return this._getPropertyValue(res, "name");
	},

	_getPropertyValue: function FGM__getPropertyValue(aRes, aProp) {
		aProp = this.rdfSvc.GetResource(RDF_NS + aProp);
		try {
			var target = this._dataSource.GetTarget(aRes, aProp, true);
			return target ? target.QueryInterface(Ci.nsIRDFLiteral).Value : null;
		}
		catch(ex) {
			return null;
		}
	},


	getCommandForDirection: function FGM_getCommandForDirection(aDirection) {
		return this._mapping[aDirection];
	},

	configure: function FGS_configure() {
		var browser = this.id == BROWSER_ID;
		var type = browser ? WINDOW_TYPE : WINDOW_TYPE + ":" + this.id;
		var winMed = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
		var win = winMed.getMostRecentWindow(type);
		if (win) {
			win.focus();
			win.document.documentElement.showPane(win.document.getElementById("mappingPane"));
			return;
		}
		var url = browser ? "chrome://firegestures/content/prefs.xul" : 
		                    "chrome://firegestures/content/prefs-generic.xul";
		var features = "chrome,titlebar,toolbar,centerscreen,resizable,dialog=no";
		win = winMed.getMostRecentWindow(null);
		if (browser)
			win.openDialog(url, type, features);
		else
			win.openDialog(url, type, features, this.id);
	},

	getMappingArray: function FGM_getMappingArray() {
		this._ensureInit();
		var items = [];
		var dbConn = this._getDBConnection(false);
		if (!dbConn || !dbConn.tableExists(this.id))
			dbConn = null;
		var rdfCont = Cc["@mozilla.org/rdf/container;1"].createInstance(Ci.nsIRDFContainer);
		rdfCont.Init(this._dataSource, this.rdfSvc.GetResource(RDF_ROOT));
		var resEnum = rdfCont.GetElements();
		while (resEnum.hasMoreElements()) {
			var res = resEnum.getNext().QueryInterface(Ci.nsIRDFResource);
			var type    = parseInt(this._getPropertyValue(res, "type"), 10);
			var name    = this._getPropertyValue(res, "name");
			var command = res.Value.substr("urn:".length);
			var flags   = this._getPropertyValue(res, "flags");
			if (dbConn && type == TYPE_NORMAL) {
				var directions = [];
				var stmt = dbConn.createStatement("SELECT direction FROM " + this.id + " WHERE command = ?");
				stmt.bindUTF8StringParameter(0, command);
				try {
					while (stmt.executeStep())
						directions.push(stmt.getUTF8String(0));
				}
				catch(ex) { Cu.reportError(ex); }
				finally { stmt.reset(); stmt.finalize(); }
				if (!directions.some(function(direction) { return /^[LRUD]*$/.test(direction); }))
					directions.unshift("");
				for (let direction of directions)
					items.push([type, name, command, direction, flags]);
			}
			else {
				var direction = this._getPropertyValue(res, "direction") || "";
				var extra     = this._getPropertyValue(res, "extra");
				items.push([type, name, command, direction, flags]);
				if (extra)
					items.push([type, name, command, extra, flags]);
			}
		}
		if (dbConn) {
			var sql = "SELECT name, command, direction FROM " + this.id + " WHERE type = " + TYPE_SCRIPT;
			var stmt = dbConn.createStatement(sql);
			try {
				while (stmt.executeStep()) {
					items.push([
						TYPE_SCRIPT, stmt.getUTF8String(0), stmt.getUTF8String(1), stmt.getUTF8String(2), null
					]);
				}
			}
			catch(ex) { Cu.reportError(ex); }
			finally { stmt.reset(); stmt.finalize(); }
		}
		return items;
	},

	saveUserMapping: function FGM_saveUserMapping(aItems) {
		this._ensureInit();
		var dbConn = this._getDBConnection(true);
		dbConn.executeSimpleSQL("DROP TABLE IF EXISTS " + this.id);
		dbConn.createTable(this.id, "type INTEGER, name TEXT, command TEXT, direction TEXT");
		dbConn.beginTransaction();
		for (let [type, name, command, direction] of aItems) {
			if (type == TYPE_CATEGORY || (type == TYPE_NORMAL && (!direction || !command)))
				continue;
			var stmt = dbConn.createStatement("INSERT INTO " + this.id + " VALUES(?,?,?,?)");
			stmt.bindInt32Parameter(0, type);
			stmt.bindUTF8StringParameter(1, type == TYPE_SCRIPT ? name : "");
			stmt.bindUTF8StringParameter(2, command);
			stmt.bindUTF8StringParameter(3, direction);
			try {
				stmt.execute();
			}
			catch(ex) { Cu.reportError(ex); }
			finally { stmt.reset(); stmt.finalize(); }
		}
		dbConn.commitTransaction();
		this._reloadMapping();
	},

	addScriptCommands: function FGM_addScriptCommands(aItems) {
		this._ensureInit();
		var added = false;
		var items = this.getMappingArray();
		outer: for (let aItem of aItems) {
			if (this.getCommandForDirection(aItem.direction))
				aItem.direction = "";
			inner: for (let [ type, , script, ] of items) {
				if (type != TYPE_SCRIPT)
					continue inner;
				if (script == aItem.script)
					continue outer;
			}
			items.push([TYPE_SCRIPT, aItem.name, aItem.script, aItem.direction, null]);
			added = true;
		}
		if (!added)
			return;
		this.saveUserMapping(items);
		this._reloadMapping();
	},

};



function xdGestureCommand(aType, aName, aCommand, aDirection) {
	this.type = aType;
	this.name = aName;
	this.value = aCommand;
	this.direction = aDirection;
}

/* xdGestureCommand.prototype = {
	QueryInterface: function(aIID) {
		if (!aIID.equals(Ci.nsISupports) && 
		    !aIID.equals(Ci.xdIGestureCommand)) {
			throw Cr.NS_ERROR_NO_INTERFACE;
		}
		return this;
	}
}; */

//xdGestureMapping = new xdGestureMapping();