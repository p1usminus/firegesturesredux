
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var gArg;
var gNameTextbox;
var gCommandTextbox;
var gScriptTextbox;
var gDirectionTextbox;

var { xdGestureSvc } = Components.utils.import("chrome://firegestures-components/content/xdGestureService.js", null);

var EditUI = {

	_gestureHandler: null,

	init: function() {
		gArg = window.arguments[0];
		gNameTextbox      = document.getElementById("gestureName");
		gCommandTextbox   = document.getElementById("gestureCommand");
		gScriptTextbox    = document.getElementById("gestureScript");
		gDirectionTextbox = document.getElementById("gestureDirection");
		gNameTextbox.value = gArg.name;
		gDirectionTextbox.value = gArg.direction;
		if (gArg.type == Ci.xdIGestureMapping.TYPE_SCRIPT) {
			gScriptTextbox.value = gArg.command;
			gCommandTextbox.parentNode.hidden = true;
			document.getElementById("drawArea").style.height = "200px";
		}
		else {
			gCommandTextbox.value = gArg.command;
			gScriptTextbox.parentNode.hidden = true;
			gNameTextbox.readOnly = true;
			gDirectionTextbox.select();
		}
		var gestureSvc = xdGestureSvc;
		this._gestureHandler = gestureSvc.createHandler();
		this._gestureHandler.attach(document.getElementById("drawArea"), this);
	},

	uninit: function() {
		if (this._gestureHandler) {
			this._gestureHandler.detach();
			this._gestureHandler = null;
		}
	},

	accept: function() {
		if (!/^[LRUD]*$/.test(gDirectionTextbox.value) || /(?:LL|RR|UU|DD)/.test(gDirectionTextbox.value)) {
			gDirectionTextbox.select();
			return false;
		}
		if (gArg.type == Ci.xdIGestureMapping.TYPE_SCRIPT) {
			try {
				new Function("event", gScriptTextbox.value);
			}
			catch(ex) {
				var bundle = window.opener.document.getElementById("bundleMain");
				var msg = bundle.getString("INVALID_SCRIPT") + "\n" + ex;
				window.opener.PrefsUI.promptSvc.alert(window, "FireGestures", msg);
				return false;
			}
			gArg.name    = gNameTextbox.value;
			gArg.command = gScriptTextbox.value;
		}
		gArg.direction = gDirectionTextbox.value;
		gArg.accepted = true;
		return true;
	},

	canStartGesture: function(event) {
		return true;
	},

	onDirectionChanged: function(event, aDirection) {
		gDirectionTextbox.value = aDirection;
	},

	onMouseGesture: function(event, aDirection) {},
	onExtraGesture: function(event, aGesture) {},

};
