
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const TYPE_CATEGORY = 0;
const TYPE_NORMAL   = 1;
const TYPE_SCRIPT   = 2;

const kTypeCol      = 0;
const kNameCol      = 1;
const kCommandCol   = 2;
const kDirectionCol = 3;
const kFlagsCol     = 4;

const kExtraArray1 = [
	["wheelGestureU",  "wheel-up"    ],
	["wheelGestureD",  "wheel-down"  ],
	["rockerGestureL", "rocker-left" ],
	["rockerGestureR", "rocker-right"],
	["swipeGestureL",  "swipe-left"  ],
	["swipeGestureR",  "swipe-right" ],
	["swipeGestureU",  "swipe-up"    ],
	["swipeGestureD",  "swipe-down"  ],
];

const kExtraArray2 = [
	["keypressGestureC", "keypress-ctrl" ],
	["keypressGestureS", "keypress-shift"],
];

const FG_TYPE_ATTR = "_command-type";
const DRAGDROP_FLAVOR = "text/x-moz-tree-index";
const TYPE_X_MOZ_URL = "text/x-moz-url";

const APP_VERSION = parseFloat(Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).version);

var gMappingArray = [];
var gMappingView = null;
var gShouldCommit = false;

var { xdGestureSvc } = Components.utils.import("chrome://firegestures-components/content/xdGestureService.js", null);

function getElement(aId) {
	return document.getElementById(aId);
}



var PrefsUI = {

	_gestureSvc: null,

	_gestureMapping: null,

	get promptSvc() {
		delete this.promptSvc;
		return this.promptSvc = Cc["@mozilla.org/embedcomp/prompt-service;1"].
		                        getService(Ci.nsIPromptService);
	},

	init: function() {
		this._gestureSvc = xdGestureSvc;
		if ("arguments" in window) {
			this._gestureMapping = this._gestureSvc.getMapping(window.arguments[0]);
			document.title = this._gestureMapping.name + " : " + document.title;
			document.documentElement.setAttribute("windowtype", window.name);
		}
		else
			this._gestureMapping = this._gestureSvc.getMappingForBrowser();
		gMappingArray = this._gestureMapping.getMappingArray();
		gMappingArray = gMappingArray.filter(function(item) {
			var flags = item[kFlagsCol];
			if (flags && flags.indexOf("hidden") >= 0)
				return false;
			if (flags && /^min:firefox([\d\.]+)$/.test(flags) && parseFloat(RegExp.$1) > APP_VERSION)
				return false;
			if (flags && /^max:firefox([\d\.]+)$/.test(flags) && parseFloat(RegExp.$1) < APP_VERSION)
				return false;
			return /^[LRUD]*$/.test(item[kDirectionCol]);
		});
		var mappingTree = getElement("mappingTree");
		gMappingView = new CustomTreeView();
		mappingTree.view = gMappingView;
		this.updateCommands();
		this.rebuildExtraMenus1();
		this.rebuildExtraMenus2();
		if (("arguments" in window == false) && 
		    (navigator.platform.indexOf("Mac") < 0 || !document.documentElement.instantApply)) {
			var buttons = document.documentElement.getButton("accept").parentNode;
			buttons.insertBefore(getElement("getScripts"), buttons.firstChild);
		}
		window.sizeToContent();
	},

	done: function() {
		if (gShouldCommit) {
			for (let [id, direction] of kExtraArray1) {
				var menuList = getElement(id);
				var type = parseInt(menuList.selectedItem.getAttribute(FG_TYPE_ATTR), 10);
				gMappingArray.push([type, menuList.label, menuList.value, direction]);
			}
			for (let [id, direction] of kExtraArray2) {
				var menuList = getElement(id);
				gMappingArray.push([TYPE_NORMAL, menuList.label, menuList.value, direction]);
			}
			try {
				this._gestureMapping.saveUserMapping(gMappingArray);
			}
			catch(ex) {
				var msg = "An error occurred while saving gesture mappings.\n\n" + ex;
				this.promptSvc.alert(window, "FireGestures", msg);
			}
		}
		this._gestureMapping = null;
		this._gestureSvc = null;
	},

	rebuildExtraMenus1: function() {
		for (let [id, direction] of kExtraArray1) {
			var menuList = getElement(id);
			var commandName  = null;
			var commandValue = null;
			if (menuList.itemCount == 0) {
				var command = this._gestureMapping.getCommandForDirection(direction);
				if (command) {
					commandName  = command.name;
					commandValue = command.value;
				}
				dump("(1) " + commandName + "\n");	//# debug
			}
			else {
				commandName  = menuList.selectedItem.label;
				commandValue = menuList.selectedItem.value;
				menuList.removeAllItems();
			}
			menuList.appendItem("...", "").setAttribute(FG_TYPE_ATTR, TYPE_NORMAL);
			var selItem = null;
			for (let [type, name, command] of gMappingArray) {
				if (type == TYPE_CATEGORY) {
					var newItem = getElement("separatorTemplate").cloneNode(true);
					newItem.id = null;
					newItem.firstChild.setAttribute("value", name);
					menuList.menupopup.appendChild(newItem);
				}
				else {
					var newItem = menuList.appendItem(name, command);
					newItem.setAttribute(FG_TYPE_ATTR, type);
					if ((commandName || commandValue) && !selItem) {
						if ((type == TYPE_NORMAL && command == commandValue) || 
						    (type == TYPE_SCRIPT && name == commandName))
							selItem = newItem;
					}
				}
			}
			menuList.selectedItem = selItem || menuList.getItemAtIndex(0);
		}
	},

	rebuildExtraMenus2: function() {
		for (let [id, direction] of kExtraArray2) {
			var menuList = getElement(id);
			var command = this._gestureMapping.getCommandForDirection(direction);
			if (!command)
				continue;
			var elts = menuList.getElementsByAttribute("value", command.value);
			if (elts.length > 0)
				menuList.selectedItem = elts[0];
		}
	},

	updateMouseGestureUIGroup: function() {
		this.updateUIGroup("mousegesture");
		if (getElement("pref:mousegesture").value) {
			this.updateUIGroup("trail");
			this.updateUIGroup("status");
			this.updateUIGroup("timeout");
		}
	},

	updateSwipeGestureUIGroup: function() {
		this.updateUIGroup("swipegesture");
		if (getElement("pref:swipegesture").value) {
			this.updateUIGroup("swipetimeout");
			var enable = getElement("pref:swipetimeout").value == 0;
			var elts = document.querySelectorAll('[uigroup="swipegesture"] > grid *');
			Array.forEach(elts, function(elt) {
				elt.disabled = !enable;
			});
		}
	},

	updateUIGroup: function(aGroupName) {
		var pref = getElement(aGroupName).getAttribute("preference");
		var val = getElement(pref).value;
		var enable = false;
		switch (typeof(val)) {
			case "boolean": enable = val;
			case "number" : enable = val != 0;
			case "string" : enable = val != "0";
		}
		var elts = document.querySelectorAll("[uigroup=" + aGroupName + "] *");
		Array.forEach(elts, function(elt) {
			if (elt.id != aGroupName)
				elt.disabled = !enable;
			if (elt.localName == "colorpicker" || elt.id == "trailSample")
				elt.style.opacity = enable ? 1 : 0.5;
		});
		if (aGroupName == "trail")
			this.updateTrail();
	},

	updateTriggerButton: function() {
		var button = getElement("pref:triggerbutton").value;
		["wheelUpLabel", "wheelDownLabel"].forEach(function(id) {
			var label = getElement(id);
			label.value = label.getAttribute("value" + button);
		});
		window.sizeToContent();
	},

	updateTrail: function() {
		var enabled = getElement("pref:trail").value;
		var color   = getElement("pref:trailcolor").value;
		var size    = getElement("pref:trailsize").value;
		var sample = getElement("trailSample");
		sample.style.borderColor = color;
		sample.style.borderWidth = size.toString() + "px";
		if (enabled)
			getElement("trailButtons").decreaseDisabled = (size <= 1);
	},

	changeTrailSize: function(aIncrement) {
		var pref = getElement("pref:trailsize");
		pref.value = pref.value + aIncrement > 0 ? pref.value + aIncrement : 1;
		this.updateTrail();
	},

	generateMappingsMenu: function(event) {
		var menuPopup = event.target;
		if (menuPopup.hasAttribute("_generated"))
			return;
		menuPopup.setAttribute("_generated", "true");
		for (let { id: id, name: name } of this._gestureSvc.getMappingsInfo()) {
			var menuItem = document.createElement("menuitem");
			menuItem.setAttribute("id", id);
			menuItem.setAttribute("label", name);
			menuPopup.appendChild(menuItem);
		}
	},

	backupMappings: function(aMenuItem) {
		var dbConn = this._gestureSvc.getDBConnection(false);
		if (!dbConn)
			return;
		var filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
		filePicker.init(window, aMenuItem.getAttribute("title"), filePicker.modeSave);
		filePicker.appendFilter("SQLite", "*.sqlite");
		var dirSvc = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
		filePicker.displayDirectory = dirSvc.get("Desk", Ci.nsILocalFile);
		var date = new Date().toLocaleFormat("%Y-%m-%d");
		filePicker.defaultString = dbConn.databaseFile.leafName.replace(".", "-" + date + ".");
		if (filePicker.show() == filePicker.returnCancel || !filePicker.file)
			return;
		var file = filePicker.file.QueryInterface(Ci.nsILocalFile);
		this._gestureSvc.backupMappings(file);
	},

	restoreMappings: function(aMenuItem) {
		var filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
		filePicker.init(window, aMenuItem.getAttribute("title"), filePicker.modeOpen);
		filePicker.appendFilter("SQLite", "*.sqlite");
		if (filePicker.show() == filePicker.returnCancel || !filePicker.file)
			return;
		if (!this.promptSvc.confirm(window, "FireGestures", aMenuItem.getAttribute("alerttext")))
			return;
		var file = filePicker.file.QueryInterface(Ci.nsILocalFile);
		this._gestureSvc.restoreMappings(file);
	},

	handleTreeEvent: function(event) {
		switch (event.type) {
			case "dblclick": 
				if (event.target.localName == "treechildren")
				this.doCommand("cmd_edit_gesture");
				break;
			case "keypress": 
				switch (event.keyCode) {
					case event.DOM_VK_RETURN: 
						this.doCommand("cmd_edit_gesture");
						break;
					case event.DOM_VK_DELETE: 
						this.doCommand("cmd_clear_gesture");
						break;
					default: return;
				}
				event.preventDefault();
				break;
			case "dragstart": 
				var selIdxs = gMappingView.getSelectedIndexes();
				if (selIdxs.length != 1)
					return;
				var sourceIndex = selIdxs[0];
				if (gMappingArray[sourceIndex][kTypeCol] != TYPE_SCRIPT)
					return;
				event.dataTransfer.setData(DRAGDROP_FLAVOR, sourceIndex);
				event.dataTransfer.dropEffect = "move";
				break;
			case "dragenter": 
			case "dragover": 
				if (event.dataTransfer.types.contains(TYPE_X_MOZ_URL))
					event.preventDefault();
				break;
			case "drop": 
				const URL_PREFIX = "data:text/javascript,";
				var lines = event.dataTransfer.getData(TYPE_X_MOZ_URL).split("\n");
				if (lines.length != 2 || lines[0].indexOf(URL_PREFIX) != 0)
					return;
				lines[0] = decodeURIComponent(lines[0].substr(URL_PREFIX.length));
				gMappingView.appendItem([TYPE_SCRIPT, lines[1], lines[0], ""]);
				PrefsUI.rebuildExtraMenus1();
				gShouldCommit = true;
				break;
			default: 
		}
	},

	updateCommands: function() {
		var idxs = gMappingView.getSelectedIndexes();
		var canEdit = idxs.length > 0;
		var canDelete = false, canClear = false;
		idxs.forEach(function(idx) {
			if (gMappingArray[idx][kTypeCol] == TYPE_SCRIPT)
				canDelete = true;
			if (gMappingArray[idx][kDirectionCol])
				canClear = true;
		});
		var setElementDisabledByID = function(aID, aDisable) {
			if (aDisable)
				getElement(aID).removeAttribute("disabled");
			else
				getElement(aID).setAttribute("disabled", "true");
		};
		setElementDisabledByID("cmd_edit_gesture",  canEdit);
		setElementDisabledByID("cmd_clear_gesture", canClear);
		setElementDisabledByID("cmd_delete_script", canDelete);
	},

	doCommand: function(aCommand) {
		switch (aCommand) {
			case "cmd_add_script": 
				var suggestedName = getElement("bundleMain").getString("NEW_SCRIPT");
				var nums = [0];
				gMappingArray.forEach(function(item) {
					if (item[kNameCol].indexOf(suggestedName) == 0 && /\s\((\d+)\)$/.test(item[kNameCol]))
						nums.push(parseInt(RegExp.$1, 10));
				});
				suggestedName += " (" + (Math.max.apply(this, nums) + 1) + ")";
				var newIdx = gMappingView.appendItem([TYPE_SCRIPT, suggestedName, "", ""]);
				this.editGesture(newIdx, true);
				break;
			case "cmd_edit_gesture" : 
				var idxs = gMappingView.getSelectedIndexes();
				idxs.forEach(function(idx) { this.editGesture(idx, false); }, this);
				break;
			case "cmd_clear_gesture": 
				var idxs = gMappingView.getSelectedIndexes();
				idxs.forEach(function(idx) { gMappingArray[idx][kDirectionCol] = ""; });
				gMappingView.update();
				break;
			case "cmd_delete_script": 
				var idxs = gMappingView.getSelectedIndexes();
				for (var i = idxs.length - 1; i >= 0; i--) {
					if (gMappingArray[idxs[i]][kTypeCol] == TYPE_SCRIPT)
						gMappingView.removeItemAt(idxs[i]);
				}
				this.rebuildExtraMenus1();
				break;
		}
		this.updateCommands();
		gShouldCommit = true;
	},

	editGesture: function(aIdx, aIsNewScript) {
		var oldCommand   = gMappingArray[aIdx][kCommandCol];
		var oldDirection = gMappingArray[aIdx][kDirectionCol];
		var ret = {
			type     : gMappingArray[aIdx][kTypeCol],
			name     : gMappingArray[aIdx][kNameCol],
			command  : oldCommand,
			direction: oldDirection,
			accepted : false
		};
		var features = "chrome,modal" + (ret.type == TYPE_SCRIPT ? ",all,resizable" : "");
		document.documentElement.openSubDialog("chrome://firegestures/content/edit.xul", features, ret);
		if (!ret.accepted) {
			if (aIsNewScript)
				gMappingView.removeItemAt(aIdx);
			return;
		}
		if (this.checkConflict(ret.direction, aIdx)) {
			if (aIsNewScript)
				ret.direction = "";
			else if (oldCommand != ret.command)
				ret.direction = oldDirection;
			else
				return;
		}
		gMappingArray[aIdx][kDirectionCol] = ret.direction;
		if (ret.type == TYPE_SCRIPT) {
			gMappingArray[aIdx][kNameCol]    = ret.name;
			gMappingArray[aIdx][kCommandCol] = ret.command;
		}
		this.rebuildExtraMenus1();
		gMappingView.update();
	},

	checkConflict: function(aDirection, aIdx) {
		if (!aDirection)
			return false;
		for (var i = 0; i < gMappingArray.length; i++) {
			var item = gMappingArray[i];
			if (i != aIdx && item[kDirectionCol] == aDirection) {
				var msg = getElement("bundleMain").getFormattedString(
					"CONFIRM_CONFLICT",
					[aDirection, item[kNameCol], item[kNameCol]]
				);
				var ret = this.promptSvc.confirmEx(
					window, "FireGestures", msg, this.promptSvc.STD_YES_NO_BUTTONS,
					null, null, null, null, {}
				);
				if (ret == 1)
					return true;
				item[kDirectionCol] = "";
				return false;
			}
		}
		return false;
	},

	openURL: function(aURL) {
		var win = Cc["@mozilla.org/appshell/window-mediator;1"]
		          .getService(Ci.nsIWindowMediator)
		          .getMostRecentWindow("navigator:browser");
		if (win)
			win.gBrowser.loadOneTab(aURL, null, null, null, false, false);
		else
			window.open(aURL);
	}

};



function CustomTreeView() {}

CustomTreeView.prototype = {

	get atomSvc() {
		var svc = Cc["@mozilla.org/atom-service;1"].getService(Ci.nsIAtomService);
		this.__defineGetter__("atomSvc", function() {return svc});
		return this.atomSvc;
	},

	_treeBoxObject: null,

	appendItem: function(aItem) {
		gMappingArray.push(aItem);
		var newIdx = this.rowCount - 1;
		this._treeBoxObject.rowCountChanged(newIdx, 1);
		this.selection.select(newIdx);
		this._treeBoxObject.ensureRowIsVisible(newIdx);
		this._treeBoxObject.treeBody.focus();
		return newIdx;
	},

	removeItemAt: function(aIndex) {
		gMappingArray.splice(aIndex, 1);
		this._treeBoxObject.rowCountChanged(aIndex, -1);
	},

	moveItem: function(aSourceIndex, aTargetIndex) {
		var removedItems = gMappingArray.splice(aSourceIndex, 1);
		gMappingArray.splice(aTargetIndex, 0, removedItems[0]);
		gShouldCommit = true;
	},

	update: function() {
		this._treeBoxObject.invalidate();
	},

	getSelectedIndexes: function() {
		var ret = [];
		var sel = this.selection;
		for (var rc = 0; rc < sel.getRangeCount(); rc++) {
			var start = {}, end = {};
			sel.getRangeAt(rc, start, end);
			for (var idx = start.value; idx <= end.value; idx++) {
				if (!this.isSeparator(idx))
					ret.push(idx);
			}
		}
		return ret;
	},

	getSourceIndexFromDrag: function(dataTransfer) {
		if (!dataTransfer.types.contains(DRAGDROP_FLAVOR))
			return -1;
		else
			return parseInt(dataTransfer.getData(DRAGDROP_FLAVOR));
	},


	get rowCount() {
		return gMappingArray.length;
	},
	selection: null,
	getRowProperties: function(index) {},
	getCellProperties: function(row, col) {},
	getColumnProperties: function(col) {},
	isContainer: function(index) { return false; },
	isContainerOpen: function(index) { return false; },
	isContainerEmpty: function(index) { return false; },
	isSeparator: function(index) {
		return gMappingArray[index][kTypeCol] == TYPE_CATEGORY;
	},
	isSorted: function() { return false; },
	canDrop: function(targetIndex, orientation, dataTransfer) {
		var sourceIndex = this.getSourceIndexFromDrag(dataTransfer);
		return (
			gMappingArray[targetIndex][kTypeCol] == TYPE_SCRIPT && 
			sourceIndex != -1 && 
			sourceIndex != targetIndex && 
			sourceIndex != (targetIndex + orientation)
		);
	},
	drop: function(targetIndex, orientation, dataTransfer) {
		if (!this.canDrop(targetIndex, orientation, dataTransfer))
			return;
		var sourceIndex = this.getSourceIndexFromDrag(dataTransfer);
		if (sourceIndex == -1)
			return;
		if (sourceIndex < targetIndex) {
			if (orientation == Ci.nsITreeView.DROP_BEFORE)
				targetIndex--;
		}
		else {
			if (orientation == Ci.nsITreeView.DROP_AFTER)
				targetIndex++;
		}
		this.moveItem(sourceIndex, targetIndex);
		this.update();
		this.selection.clearSelection();
		this.selection.select(targetIndex);
	},
	getParentIndex: function(rowIndex) { return -1; },
	hasNextSibling: function(rowIndex, afterIndex) { return false; },
	getLevel: function(index) { return 0; },
	getImageSrc: function(row, col) {},
	getProgressMode: function(row, col) {},
	getCellValue: function(row, col) {},
	getCellText: function(row, col) {
		switch (col.index) {
			case 0: return gMappingArray[row][kNameCol];
			case 1: return gMappingArray[row][kCommandCol].replace(/\r|\n|\t/g, " ");
			case 2: return gMappingArray[row][kDirectionCol];
		}
	},
	setTree: function(tree) {
		this._treeBoxObject = tree;
	},
	toggleOpenState: function(index) {},
	cycleHeader: function(col) {},
	selectionChanged: function() {},
	cycleCell: function(row, col) {},
	isEditable: function(row, col) { return false; },
	isSelectable: function(row, col) {},
	setCellValue: function(row, col, value) {},
	setCellText: function(row, col, value) {
		if (col.index == 0)
			gMappingArray[row][kNameCol] = value;
		else if (col.index == 1)
			gMappingArray[row][kCommandCol] = value;
		else if (col.index == 2)
			gMappingArray[row][kDirectionCol] = value;
	},
	performAction: function(action) {},
	performActionOnRow: function(action, row) {},
	performActionOnCell: function(action, row, col) {},

};
