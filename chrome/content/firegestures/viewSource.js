var { xdGestureSvc } = Components.utils.import("chrome://firegestures-components/content/xdGestureService.js", null);

var FireGesturesViewSource = {

	_gestureHandler: null,

	_gestureMapping: null,

	get inPrintPreviewMode() {
		return document.getElementById("viewSource-toolbox").hidden;
	},

	init: function() {
		var gestureSvc = xdGestureSvc;
		this._gestureHandler = gestureSvc.createHandler();
		this._gestureHandler.attach(getBrowser(), this);
		this._gestureMapping = gestureSvc.getMapping("viewsource_mapping");
		window.removeEventListener("MozSwipeGesture", ViewSourceChrome, true);
	},

	uninit: function() {
		if (this._gestureHandler) {
			this._gestureHandler.detach();
			this._gestureHandler = null;
		}
		this._gestureMapping = null;
	},

	canStartGesture: function(event) {
		return true;
	},

	onDirectionChanged: function(event, aDirectionChain) {},

	onMouseGesture: function(event, aDirectionChain) {
		if (this.inPrintPreviewMode)
			return;
		var command = this._gestureMapping.getCommandForDirection(aDirectionChain);
		if (command)
			this._performAction(event, command.value);
	},

	onExtraGesture: function(event, aGestureType) {
		if (this.inPrintPreviewMode)
			return;
		if (aGestureType == "gesture-timeout")
			return;
		if (aGestureType == "reload-prefs")
			return;
		this.onMouseGesture(event, aGestureType);
	},

	_performAction: function(event, aCommand) {
		switch (aCommand) {
			case "cmd_scrollTop": 
			case "cmd_scrollBottom": 
			case "cmd_scrollPageUp": 
			case "cmd_scrollPageDown": 
				goDoCommand(aCommand);
				break;
			case "ViewSource:MinimizeWindow": 
				window.minimize();
				break;
			case "ViewSource:MaximizeWindow": 
				window.windowState == window.STATE_MAXIMIZED ? window.restore() : window.maximize();
				break;
			case "ViewSource:FireGestures": 
				this._gestureMapping.configure();
				break;
			default: 
				var cmd = document.getElementById(aCommand);
				if (cmd && cmd.getAttribute("disabled") != "true")
					cmd.doCommand();
		}
	},

};

window.addEventListener("load",   function(){ FireGesturesViewSource.init(); },   false);
window.addEventListener("unload", function(){ FireGesturesViewSource.uninit(); }, false);
