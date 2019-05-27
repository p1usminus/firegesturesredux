
let { classes: Cc, interfaces: Ci, utils: Cu } = Components;

const HTML_NS = "http://www.w3.org/1999/xhtml";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "BrowserUtils", "resource://gre/modules/BrowserUtils.jsm");


let FireGesturesRemote = {

	init: function FGR_init() {
		addMessageListener("FireGestures:GestureStart", this);
		addMessageListener("FireGestures:KeypressStart", this);
		addMessageListener("FireGestures:KeypressProgress", this);
		addMessageListener("FireGestures:KeypressStop", this);
		addMessageListener("FireGestures:SwipeGesture", this);
		addMessageListener("FireGestures:DoCommand", this);
		addMessageListener("FireGestures:SendKeyEvent", this);
	},

	receiveMessage: function FGR_receiveMessage(aMsg) {
		switch (aMsg.name) {
			case "FireGestures:GestureStart"    : this._onGestureStart(aMsg.data); break;
			case "FireGestures:KeypressStart"   : this._onKeypressStart(); break;
			case "FireGestures:KeypressProgress": this._onKeypressProgress(aMsg.data); break;
			case "FireGestures:KeypressStop"    : this._onKeypressStop(); break;
			case "FireGestures:SwipeGesture"    : this._onSwipeGesture(aMsg.data); break;
			case "FireGestures:DoCommand"   : this._doCommand(aMsg.data); break;
			case "FireGestures:SendKeyEvent": this._sendKeyEvent(aMsg.data); break;
		}
	},



	_startX: 0,
	_startY: 0,

	_onGestureStart: function FGR__onGestureStart(aData) {
		this._startX = aData.x;
		this._startY = aData.y;
		let { doc, elt } = this._elementFromPoint(aData.x, aData.y);
		if (aData.type != "MozSwipeGesture" && aData.button == 0) {
			let localName = elt.localName;
			if (["input", "textarea", "select", "option", "textbox", "menulist"].indexOf(localName) >= 0) {
				sendSyncMessage("FireGesturesRemote:Response", { name: "cancelMouseGesture" }, {});
				return;
			}
			let win = doc.defaultView;
			win.removeEventListener("scroll", this, false);
			win.addEventListener("scroll", this, false);
			let sel = win.getSelection();
			if (sel.isCollapsed)
				win.setTimeout(function() { sel.removeAllRanges(); }, 10);
		}
		let sel = this._getSelectedText(doc, elt);
		sendRpcMessage("FireGesturesRemote:Response", { name: "sourceNode" }, { elt, sel });
	},

	_onSwipeGesture: function(aData) {
		let { doc, elt } = this._elementFromPoint(aData.x, aData.y);
		let sel = this._getSelectedText(doc, elt);
		sendRpcMessage("FireGesturesRemote:Response", { name: "sourceNode" }, { elt, sel });
		sendSyncMessage("FireGesturesRemote:Response", { name: "swipe" }, { direction: aData.direction });
	},

	_getSelectedText: function(doc, elt) {
		let sel = doc.defaultView.getSelection().toString();
		if (!sel && elt instanceof Ci.nsIDOMNSEditableElement) {
			if (elt instanceof Ci.nsIDOMHTMLTextAreaElement || 
			    (elt instanceof Ci.nsIDOMHTMLInputElement && elt.mozIsTextField(true))) {
				sel = elt.editor.selection.toString();
			}
		}
		return sel;
	},

	handleEvent: function(event) {
		switch (event.type) {
			case "scroll": 
				let win = event.target.defaultView;
				win.removeEventListener("scroll", this, false);
				sendSyncMessage("FireGesturesRemote:Response", { name: "cancelMouseGesture" }, {});
				break;
			default: 
		}
	},



	_linkURLs: null,
	_linkElts: null,

	_onKeypressStart: function FGR__onKeypressStart() {
		this._linkURLs = [];
		this._linkElts = [];
	},

	_onKeypressProgress: function FGR__onKeypressProgress(aData) {
		let { doc, elt } = this._elementFromPoint(aData.x, aData.y);
		let linkURL = this.getLinkURL(elt);
		if (!this._linkURLs)
			this._linkURLs = [];
		if (!linkURL || this._linkURLs.indexOf(linkURL) >= 0)
			return;
		try {
			BrowserUtils.urlSecurityCheck(linkURL, doc.nodePrincipal);
		}
		catch(ex) {
			return;
		}
		this._linkURLs.push(linkURL);
		this._linkElts.push(elt);
		elt.style.outline = "1px dashed darkorange";
		sendSyncMessage("FireGesturesRemote:Response", { name: "linkURLs", linkURLs: this._linkURLs });
	},

	_onKeypressStop: function FGR__onKeypressStop() {
		for (let i = 0; i < this._linkURLs.length; i++) {
			this._linkElts[i].style.outline = "";
			this._linkElts[i] = null;
		}
		this._linkURLs = null;
		this._linkElts = null;
	},

	getLinkURL: function FGR_getLinkURL(aNode) {
		while (aNode) {
			if (aNode instanceof Ci.nsIDOMHTMLAnchorElement || aNode instanceof Ci.nsIDOMHTMLAreaElement) {
				if (aNode.href)
					return aNode.href;
			}
			aNode = aNode.parentNode;
		}
		return null;
	},



	_doCommand: function FGR__doCommand(aData) {
		if (docShell.isCommandEnabled(aData.cmd))
			docShell.doCommand(aData.cmd);
	},

	_sendKeyEvent: function FGR__sendKeyEvent(aOptions) {
		let { doc, elt } = this._elementFromPoint(this._startX, this._startY);
		let evt = doc.createEvent("KeyEvents");
		evt.initKeyEvent(
			"keypress", true, true, null, 
			aOptions.ctrl  || false, 
			aOptions.alt   || false, 
			aOptions.shift || false, 
			aOptions.meta  || false, 
			aOptions.keyCode ? evt[aOptions.keyCode] : null, 
			aOptions.key ? aOptions.key.charCodeAt(0) : null
		);
		elt.dispatchEvent(evt);
	},



	_elementFromPoint: function FGR__elementFromPoint(x, y) {
		let doc = content.document;
		let elt = doc.elementFromPoint(x, y) || doc.body || doc.documentElement;
		while (/^i?frame$/.test(elt.localName.toLowerCase())) {
			x -= elt.getBoundingClientRect().left;
			y -= elt.getBoundingClientRect().top;
			doc = elt.contentDocument;
			elt = doc.elementFromPoint(x, y);
		}
		return { doc, elt };
	},


};

FireGesturesRemote.init();

