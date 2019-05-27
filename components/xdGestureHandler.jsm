Components.utils.import("resource://gre/modules/Services.jsm");

var EXPORTED_SYMBOLS = ["xdGestureHandler"];

const Cc = Components.classes;
const Ci = Components.interfaces;

const PREFS_DOMAIN = "extensions.firegestures.";
const HTML_NS = "http://www.w3.org/1999/xhtml";

const STATE_READY    = 0;
const STATE_GESTURE  = 1;
const STATE_ROCKER   = 2;
const STATE_WHEEL    = 3;
const STATE_KEYPRESS = 4;

function xdGestureHandler() {}

//var xdGestureHandler = {
xdGestureHandler.prototype = {
	
	//QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),
	
	sourceNode: null,

	_drawArea: null,

	_lastX: null,
	_lastY: null,

	_directionChain: "",

	_gestureTimer: null,

	_swipeTimer: null,

	_gestureObserver: null,

	_isRemote: false,

	attach: function FGH_attach(aDrawArea, aObserver) {
		//var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
		this._drawArea = aDrawArea;
		this._gestureObserver = aObserver;
		this._drawArea.addEventListener("mousedown", this, true);
		var root = this._drawArea.ownerDocument.defaultView.document.documentElement;
		root.addEventListener("mousemove", this, true);
		root.addEventListener("mouseup", this, true);
		this._drawArea.addEventListener("contextmenu", this, true);
		this._drawArea.addEventListener("dragstart", this, true);
		this._reloadPrefs();
		Services.prefs.addObserver(PREFS_DOMAIN, this); // true
	},

	detach: function FGH_detach() {
		this._drawArea.removeEventListener("mousedown", this, true);
		var root = this._drawArea.ownerDocument.defaultView.document.documentElement;
		root.removeEventListener("mousemove", this, true);
		root.removeEventListener("mouseup", this, true);
		this._drawArea.removeEventListener("contextmenu", this, true);
		this._drawArea.removeEventListener("dragstart", this, true);
		Services.prefs.removeObserver(PREFS_DOMAIN, this);
		this._clearTimeout();
		if (this._swipeTimer) {
			this._swipeTimer.cancel();
			this._swipeTimer = null;
		}
		this.sourceNode = null;
		this._drawArea = null;
		this._trailArea = null;
		this._trailContext = null;
		this._gestureObserver = null;
	},

	_reloadPrefs: function FGH__reloadPrefs() {
		var prefBranch = Services.prefs.getBranch(PREFS_DOMAIN);
		var getPref = function(aName) {
			try {
				switch (prefBranch.getPrefType(aName)) {
					case prefBranch.PREF_STRING:
						return prefBranch.getCharPref(aName);
					case prefBranch.PREF_BOOL:
						return prefBranch.getBoolPref(aName);
					case prefBranch.PREF_INT:
						return prefBranch.getIntPref(aName);
					default:
						throw null;
				}
			}
			catch(ex) {
			}
		};
		this._triggerButton  = getPref("trigger_button");
		this._suppressAlt    = getPref("suppress.alt");
		this._trailEnabled   = getPref("mousetrail");
		this._trailSize      = getPref("mousetrail.size");
		this._trailColor     = getPref("mousetrail.color");
		this._gestureTimeout = getPref("gesture_timeout");
		this._swipeTimeout   = getPref("swipe_timeout");
		this._mouseGestureEnabled    = getPref("mousegesture");
		this._wheelGestureEnabled    = getPref("wheelgesture");
		this._rockerGestureEnabled   = getPref("rockergesture");
		this._keypressGestureEnabled = getPref("keypressgesture");
		this._swipeGestureEnabled    = getPref("swipegesture");
		this._drawArea.removeEventListener("DOMMouseScroll", this, true);
		this._drawArea.removeEventListener("click", this, true);
		if (this._wheelGestureEnabled)
			this._drawArea.addEventListener("DOMMouseScroll", this, true);
		if (this._rockerGestureEnabled)
			this._drawArea.addEventListener("click", this, true);
		if (this._drawArea.localName == "tabbrowser") {
			this._drawArea.tabContainer.removeEventListener("wheel", this._wheelOnTabBar, true);
			if (getPref("tabwheelgesture"))
				this._drawArea.tabContainer.addEventListener("wheel", this._wheelOnTabBar, true);
		}
		if (this._triggerButton == 1) {
			var prefSvc = Services.prefs.getBranch("");
			prefSvc.setBoolPref("middlemouse.contentLoadURL", false);
		}
		var win = this._drawArea.ownerDocument.defaultView;
		win.removeEventListener("MozSwipeGesture", this, true);
		if (this._swipeGestureEnabled)
			win.addEventListener("MozSwipeGesture", this, true);
		this._gestureObserver.onExtraGesture(null, "reload-prefs");
	},

	_state: STATE_READY,
	_isMouseDownL: false,
	_isMouseDownM: false,
	_isMouseDownR: false,
	_suppressContext: false,
	_shouldFireContext: false,

	handleEvent: function FGH_handleEvent(event) {
		switch (event.type) {
			case "mousedown": 
				if (!this._gestureObserver.canStartGesture(event))
					break;
				if (event.button == 0) {
					if (this._triggerButton == 0) {
						var localName = event.target.localName;
						if (["input", "textarea", "select", "option", "textbox", "menulist"].indexOf(localName) >= 0) {
							break;
						}
						var localName = event.originalTarget.localName;
						if (["scrollbarbutton", "slider", "thumb"].indexOf(localName) >= 0) {
							break;
						}
					}
					this._isMouseDownL = true;
					this._isMouseDownM = false;
					if (this._triggerButton == 0 && !this._isMouseDownM && !this._isMouseDownR && !this._altKey(event)) {
						this._state = STATE_GESTURE;
						this._startGesture(event);
						if (!this._isRemote && this._mouseGestureEnabled)
							event.preventDefault();
					}
					else if (this._rockerGestureEnabled && this._isMouseDownR) {
						this._state = STATE_ROCKER;
						this._invokeExtraGesture(event, "rocker-left");
					}
				}
				else if (event.button == 1) {
					this._isMouseDownM = true;
					if (this._triggerButton == 1 && !this._isMouseDownL && !this._isMouseDownR && !this._altKey(event)) {
						this._state = STATE_GESTURE;
						this._startGesture(event);
					}
				}
				else if (event.button == 2) {
					var localName = event.target.localName;
					if (localName == "object" || localName == "embed") {
						break;
					}
					this._isMouseDownR = true;
					this._isMouseDownM = false;
					this._suppressContext = false;
					this._enableContextMenu(true);
					if (this._triggerButton == 2 && !this._isMouseDownL && !this._isMouseDownM && !this._altKey(event)) {
						this._state = STATE_GESTURE;
						this._startGesture(event);
					}
					else if (this._rockerGestureEnabled && this._isMouseDownL) {
						this._state = STATE_ROCKER;
						this._invokeExtraGesture(event, "rocker-right");
					}
				}
				break;
			case "mousemove": 
				if (this._state == STATE_GESTURE || this._state == STATE_KEYPRESS) {
					if (this._mouseGestureEnabled) {
						if (this._keypressGestureEnabled && (event.ctrlKey || event.metaKey || event.shiftKey)) {
							var type = this._state == STATE_GESTURE ? "keypress-start" : "keypress-progress";
							this._state = STATE_KEYPRESS;
							this._invokeExtraGesture(event, type);
						}
						this._progressGesture(event);
						if (this._triggerButton == 1 && this._isMouseDownM && 
						    this._drawArea.selectedBrowser._autoScrollPopup) {
							this._drawArea.selectedBrowser._autoScrollPopup.hidePopup();
						}
					}
				}
				else if (this._state == STATE_WHEEL || this._state == STATE_ROCKER) {
					this._lastX = event.screenX;
					this._lastY = event.screenY;
					if (Math.abs(this._lastX - this._lastExtraX) > 10 || 
					    Math.abs(this._lastY - this._lastExtraY) > 10) {
						this._stopGesture();
					}
				}
				break;
			case "mouseup": 
				if (event.button == 0)
					this._isMouseDownL = false;
				else if (event.button == 1)
					this._isMouseDownM = false;
				else if (event.button == 2)
					this._isMouseDownR = false;
				if (!this._isMouseDownL && !this._isMouseDownM && !this._isMouseDownR) {
					if (this._state == STATE_KEYPRESS) {
						this._state = STATE_READY;
						if (event.ctrlKey || event.metaKey)
							this._invokeExtraGesture(event, "keypress-ctrl");
						else if (event.shiftKey)
							this._invokeExtraGesture(event, "keypress-shift");
						this._invokeExtraGesture(event, "keypress-stop");
					}
					this._stopGesture(event);
					if (this._shouldFireContext) {
						this._shouldFireContext = false;
						this._enableContextMenu(true);
						var win = this._drawArea.ownerDocument.defaultView;
						var x = event.screenX - win.document.documentElement.boxObject.screenX;
						var y = event.screenY - win.document.documentElement.boxObject.screenY;
						win.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils).
						    sendMouseEvent("contextmenu", x, y, 2, 1, null);
					}
				}
				break;
			case "contextmenu": 
				if (!this._isMouseDownL && this._isMouseDownR) {
					this._suppressContext = true;
					this._shouldFireContext = true;
				}
				if (event.button == 0) {
					this._enableContextMenu(true);
				}
				if (this._suppressContext) {
					this._suppressContext = false;
					event.preventDefault();
					event.stopPropagation();
					this._enableContextMenu(false);
				}
				break;
			case "DOMMouseScroll": 
				if (this._state == STATE_GESTURE || this._state == STATE_WHEEL) {
					this._state = STATE_WHEEL;
					this._invokeExtraGesture(event, event.detail < 0 ? "wheel-up" : "wheel-down");
					event.preventDefault();
					event.stopPropagation();
				}
				break;
			case "click": 
				if (this._state == STATE_ROCKER) {
					event.preventDefault();
					event.stopPropagation();
				}
				break;
			case "dragstart": 
				if (this._state != STATE_ROCKER)
					this._isMouseDownL = false;
				break;
			case "MozSwipeGesture": 
				event.preventDefault();
				if (this._state != STATE_READY)
					return;
				if (this._swipeTimeout == 0) {
					var direction;
					switch (event.direction) {
						case event.DIRECTION_LEFT : direction = "left";  break;
						case event.DIRECTION_RIGHT: direction = "right"; break;
						case event.DIRECTION_UP   : direction = "up";    break;
						case event.DIRECTION_DOWN : direction = "down";  break;
					}
					this._isRemote = this._drawArea.selectedBrowser.getAttribute("remote") == "true";
					if (this._isRemote) {
						var zoom = this._drawArea.selectedBrowser.fullZoom;
						this._gestureObserver.sendAsyncMessage("FireGestures:SwipeGesture", {
							direction: direction, 
							x: (event.screenX - this._drawArea.selectedBrowser.boxObject.screenX) / zoom, 
							y: (event.screenY - this._drawArea.selectedBrowser.boxObject.screenY) / zoom, 
						});
						return;
					}
					this.sourceNode = event.target;
					this._invokeExtraGesture(event, "swipe-" + direction);
					this.sourceNode = null;
					return;
				}
				if (this._swipeTimer) {
					this._swipeTimer.cancel();
					this._swipeTimer = null;
				}
				this._swipeTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
				this._swipeTimer.initWithCallback(this, this._swipeTimeout, Ci.nsITimer.TYPE_ONE_SHOT);
				if (!this._directionChain) {
					this._startGesture(event);
				}
				var direction;
				switch (event.direction) {
					case event.DIRECTION_LEFT : direction = "L"; break;
					case event.DIRECTION_RIGHT: direction = "R"; break;
					case event.DIRECTION_UP   : direction = "U"; break;
					case event.DIRECTION_DOWN : direction = "D"; break;
				}
				var lastDirection = this._directionChain.charAt(this._directionChain.length - 1);
				if (direction != lastDirection) {
					this._directionChain += direction;
					this._gestureObserver.onDirectionChanged(event, this._directionChain);
				}
				break;
		}
	},

	_altKey: function(event) {
		return this._suppressAlt ? event.altKey : false;
	},

	_enableContextMenu: function FGH__enableContextMenu(aEnable) {
		var elt = this._drawArea.ownerDocument.getElementById("contentAreaContextMenu");
		if (!elt)
			elt = this._drawArea.ownerDocument.getElementById("viewSourceContextMenu");
		if (!elt)
			return;
		if (aEnable)
			elt.removeAttribute("hidden");
		else
			elt.setAttribute("hidden", "true");
	},

	_wheelOnTabBar: function FGH__wheelOnTabBar(event) {
		var tabbar = null;
		if (event.target.localName == "tab")
			tabbar = event.target.parentNode;
		else if (event.target.localName == "tabs" && event.originalTarget.localName != "menuitem")
			tabbar = event.target;
		else
			return;
		event.preventDefault();
		event.stopPropagation();
		tabbar.advanceSelectedTab(event.deltaY < 0 ? -1 : 1, true);
	},

	_startGesture: function FGH__startGesture(event) {
		if (this._drawArea.localName == "tabbrowser")
			this._isRemote = this._drawArea.selectedBrowser.getAttribute("remote") == "true";
		this.sourceNode = event.target;
		this._lastX = event.screenX;
		this._lastY = event.screenY;
		this._directionChain = "";
		this._shouldFireContext = false;
		if (!this._swipeTimer && this._trailEnabled)
			this._createTrail();
		if (this._isRemote) {
			var zoom = this._drawArea.selectedBrowser.fullZoom;
			this._gestureObserver.sendAsyncMessage("FireGestures:GestureStart", {
				type: event.type, 
				button: event.button, 
				x: (event.screenX - this._drawArea.selectedBrowser.boxObject.screenX) / zoom, 
				y: (event.screenY - this._drawArea.selectedBrowser.boxObject.screenY) / zoom, 
			});
		}
	},

	_progressGesture: function FGH__progressGesture(event) {
		var x = event.screenX;
		var y = event.screenY;
		var dx = Math.abs(x - this._lastX);
		var dy = Math.abs(y - this._lastY);
		if (dx < 10 && dy < 10)
			return;
		var direction;
		if (dx > dy)
			direction = x < this._lastX ? "L" : "R";
		else
			direction = y < this._lastY ? "U" : "D";
		if (this._trailEnabled)
			this._drawTrail(this._lastX, this._lastY, x, y);
		this._lastX = x;
		this._lastY = y;
		if (this._state == STATE_KEYPRESS)
			return;
		var lastDirection = this._directionChain.charAt(this._directionChain.length - 1);
		if (direction != lastDirection) {
			this._directionChain += direction;
			this._gestureObserver.onDirectionChanged(event, this._directionChain);
		}
		if (this._gestureTimeout > 0)
			this._setTimeout(this._gestureTimeout);
	},

	_invokeExtraGesture: function FGH__invokeExtraGesture(event, aGestureType) {
		if (this._state == STATE_WHEEL || this._state == STATE_ROCKER) {
			this._lastExtraX = event.screenX;
			this._lastExtraY = event.screenY;
		}
		if (this._state != STATE_KEYPRESS && this._trailEnabled)
			this._eraseTrail();
		if (!this.sourceNode)
			this.sourceNode = event.target;
		this._gestureObserver.onExtraGesture(event, aGestureType);
		this._suppressContext = true;
		this._shouldFireContext = false;
		this._directionChain = "";
		if (this._state == STATE_WHEEL || this._state == STATE_ROCKER) {
			if (this._gestureTimeout > 0)
				this._setTimeout(this._gestureTimeout);
		}
	},

	_stopGesture: function FGH__stopGesture(event) {
		this._state = STATE_READY;
		this._isMouseDownL = false;
		this._isMouseDownM = false;
		this._isMouseDownR = false;
		this._clearTimeout();
		if (!this._swipeTimer && this._trailEnabled)
			this._eraseTrail();
		if (this._directionChain) {
			var directionChain = this._directionChain;
			this._directionChain = "";
			this._gestureObserver.onMouseGesture(event, directionChain);
			this._suppressContext = true;
			this._shouldFireContext = false;
		}
		this.sourceNode = null;
	},



	observe: function FGH_observe(aSubject, aTopic, aData) {
		if (aTopic == "nsPref:changed")
			this._reloadPrefs();
	},



	_setTimeout: function FGH__setTimeout(aMsec) {
		this._clearTimeout();
		this._gestureTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
		this._gestureTimer.initWithCallback(this, aMsec, Ci.nsITimer.TYPE_ONE_SHOT);
	},

	_clearTimeout: function FGH__clearTimeout() {
		if (this._gestureTimer) {
			this._gestureTimer.cancel();
			this._gestureTimer = null;
		}
	},

	notify: function(aTimer) {
		switch (aTimer) {
			case this._gestureTimer: 
				this._suppressContext = true;
				this._shouldFireContext = false;
				this._directionChain = "";
				this._stopGesture();
				this._gestureObserver.onExtraGesture(null, "gesture-timeout");
				break;
			case this._swipeTimer: 
				this._stopGesture();
				this._swipeTimer = null;
				break;
		}
	},

	openPopupAtPointer: function FGH_openPopupAtPointer(aPopup) {
		var ratio = 1;
		var os = Cc["@mozilla.org/system-info;1"].getService(Ci.nsIPropertyBag2).getProperty("name");
		if (os == "Darwin") {
			ratio = aPopup.ownerDocument.defaultView.QueryInterface(Ci.nsIInterfaceRequestor).
		            getInterface(Ci.nsIDOMWindowUtils).screenPixelsPerCSSPixel;
		}
		aPopup.openPopupAtScreen(this._lastX * ratio, this._lastY * ratio, false);
		this._directionChain = "";
		this._stopGesture();
	},

	cancelMouseGesture: function FGH_cancelMouseGesture() {
		this._directionChain = "";
		this._stopGesture();
	},



	_trailArea: null,
	_trailContext: null,
	_trailOffsetX: 0,
	_trailOffsetY: 0,

	_createTrail: function FGH__createTrail() {
		var doc = this._drawArea.ownerDocument;
		var box = doc.documentElement.boxObject;
		if (this._trailArea) {
			this._trailArea.style.display = "-moz-box";
			this._trailOffsetX = box.screenX;
			this._trailOffsetY = box.screenY;
			var canvas = this._trailArea.firstChild;
			canvas.setAttribute("width",  box.width);
			canvas.setAttribute("height", box.height);
			return;
		}
		var css = "-moz-user-focus: none !important;"
		        + "-moz-user-select: none !important;"
		        + "display: -moz-box !important;"
		        + "box-sizing: border-box !important;"
		        + "pointer-events: none !important;"
		        + "margin: 0 !important;"
		        + "padding: 0 !important;"
		        + "width: 100% !important;"
		        + "height: 100% !important;"
		        + "border: none !important;"
		        + "box-shadow: none !important;"
		        + "overflow: hidden !important;"
		        + "background: none !important;"
		        + "opacity: 0.6 !important;"
		        + "position: fixed !important;"
		        + "top:  " + box.y + "px !important;"
		        + "left: " + box.x + "px !important;"
		        + "z-index: 2147483647 !important;";
		this._trailArea = doc.createElement("hbox");
		this._trailArea.id = "FireGesturesTrail";
		this._trailArea.style.cssText = css;
		this._trailOffsetX = box.screenX;
		this._trailOffsetY = box.screenY;
		var canvas = doc.createElementNS(HTML_NS, "canvas");
		canvas.setAttribute("width",  box.width);
		canvas.setAttribute("height", box.height);
		this._trailArea.appendChild(canvas);
		doc.documentElement.appendChild(this._trailArea);
		this._trailContext = canvas.getContext("2d");
	},

	_drawTrail: function FGH__drawTrail(x1, y1, x2, y2) {
		if (!this._trailArea)
			return;
		var context = this._trailContext;
		context.strokeStyle = this._trailColor;
		context.lineJoin = "round";
		context.lineWidth = this._trailSize;
		context.beginPath();
		context.moveTo(x1 - this._trailOffsetX, y1 - this._trailOffsetY);
		context.lineTo(x2 - this._trailOffsetX, y2 - this._trailOffsetY);
		context.closePath();
		context.stroke();
	},

	_eraseTrail: function FGH__eraseTrail() {
		if (!this._trailArea)
			return;
		var canvas = this._trailArea.firstChild;
		this._trailContext.clearRect(0, 0, canvas.getAttribute("width"), canvas.getAttribute("height"));
		this._trailArea.style.display = "none";
	},

};

//xdGestureHandler = new xdGestureHandler();