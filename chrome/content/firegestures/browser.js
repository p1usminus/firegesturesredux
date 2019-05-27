var gGestureService = Components.utils.import("chrome://firegestures-components/content/xdGestureService.jsm", null);
console.log(gGestureService);

var FireGestures = {

	_gestureHandler: null,

	_gestureMapping: null,

	_getLocaleString: null,

	_statusTextField: null,

	_clearStatusTimer: null,

	_statusDisplay: null,

	_blockedHosts: [],

	get _isWin() {
		delete this._isWin;
		return this._isWin = navigator.platform.startsWith("Win");
	},

	init: function() {
		if ("aioGestTable" in window || "mozgestInit" in window || "ucjsMouseGestures" in window) {
			Cu.reportError("Detected an extension or script which conflicts with FireGestures.");
			toJavaScriptConsole();
			return;
		}
		
		var gestureSvc = gGestureService.xdGestureService;
		this._gestureHandler = gestureSvc.createHandler();
		this._gestureHandler.attach(gBrowser, this);
		this._gestureMapping = gestureSvc.getMappingForBrowser(); // This seems to stay null, mapping module is broken
		this._getLocaleString = gestureSvc.getLocaleString;
		this._statusTextField = gBrowser.getStatusPanel();
		window.removeEventListener("MozSwipeGesture", gGestureSupport, true);
		if (gMultiProcessBrowser) {
			window.messageManager.loadFrameScript("chrome://firegestures/content/remote.js", true);
			window.messageManager.addMessageListener("FireGesturesRemote:Response", this);
		}
	},

	uninit: function() {
		if (gMultiProcessBrowser) {
			window.messageManager.removeDelayedFrameScript("chrome://firegestures/content/remote.js");
			window.messageManager.removeMessageListener("FireGesturesRemote:Response", this);
		}
		if (this._gestureHandler) {
			this._gestureHandler.detach();
			this._gestureHandler = null;
		}
		this._gestureMapping = null;
		this._getLocaleString = null;
		if (this._clearStatusTimer)
			window.clearTimeout(this._clearStatusTimer);
		this._statusTextField = null;
	},



	get isRemote() {
		return gBrowser.selectedBrowser.getAttribute("remote") == "true";
	},

	sendAsyncMessage: function(aName, aData) {
		gBrowser.selectedBrowser.messageManager.sendAsyncMessage(aName, aData);
	},

	receiveMessage: function(aMsg) {
		switch (aMsg.data.name) {
			case "sourceNode": 
				this._gestureHandler.sourceNode = aMsg.objects.elt;
				this._selectedText = aMsg.objects.sel;
				break;
			case "linkURLs": 
				this._linkURLs = aMsg.data.linkURLs;
				break;
			case "cancelMouseGesture": 
				this._gestureHandler.cancelMouseGesture();
				break;
			case "swipe": 
				this.onMouseGesture(null, "swipe-" + aMsg.objects.direction);
				this._gestureHandler.sourceNode = null;
				break;
			default: 
		}
	},



	canStartGesture: function(event) {
		if (gInPrintPreviewMode) {
			return false;
		}
		if (event.target instanceof HTMLCanvasElement && 
		    event.target.parentNode instanceof Ci.nsIDOMXULElement) {
			return false;
		}
		if (this._blockedHosts.some(host => gBrowser.currentURI.asciiHost.endsWith(host))) {
			return false;
		}
		return true;
	},

	onDirectionChanged: function(event, aDirectionChain) {
		if (this._statusDisplay > 0) {
			var command = this._gestureMapping.getCommandForDirection(aDirectionChain);
			var name = command ? " (" + command.name + ")" : "";
			this.setStatusText(this._getLocaleString("GESTURE") + ": " + aDirectionChain + name);
		}
	},

	onMouseGesture: function(event, aDirection) {
		try {
			var command = this._gestureMapping.getCommandForDirection(aDirection);
			if (!command)
				throw null;
			if (command.type == this._gestureMapping.TYPE_SCRIPT)
				(new Function("event", command.value))(event);
			else
				this._performAction(event, command.value);
		}
		catch(ex) {
			if (this._statusDisplay > 0) {
				this.setStatusText(
					ex ? 
					this._getLocaleString("GESTURE_FAILED")  + ": " + aDirection + " (" + ex + ")" :
					this._getLocaleString("GESTURE_UNKNOWN") + ": " + aDirection
				);
			}
		}
		if (this._statusDisplay > 0)
			this.clearStatusText(this._statusDisplay);
	},

	onExtraGesture: function(event, aGesture) {
		switch (aGesture) {
			case "wheel-up": 
			case "wheel-down": 
			case "rocker-left": 
			case "rocker-right": 
			case "keypress-ctrl": 
			case "keypress-shift": 
			case "swipe-left": 
			case "swipe-right": 
			case "swipe-up": 
			case "swipe-down": 
				this.onMouseGesture(event, aGesture);
				break;
			case "keypress-start": 
				if (this.isRemote) {
					this._linkURLs = [];
					this.sendAsyncMessage("FireGestures:KeypressStart", {});
					return;
				}
				this.clearStatusText(0);
				this._linkURLs = [];
				this._linkElts = [];
				break;
			case "keypress-progress": 
				if (this.isRemote) {
					this.sendAsyncMessage("FireGestures:KeypressProgress", {
						x: event.screenX - gBrowser.selectedBrowser.boxObject.screenX, 
						y: event.screenY - gBrowser.selectedBrowser.boxObject.screenY, 
					});
					return;
				}
				var linkURL = this.getLinkURL(event.target);
				if (!this._linkURLs)
					this._linkURLs = [];
				if (linkURL && this._linkURLs.indexOf(linkURL) < 0) {
					try {
						this.checkURL(linkURL, event.target.ownerDocument);
						this._linkURLs.push(linkURL);
						this._linkElts.push(event.target);
						event.target.style.outline = "1px dashed darkorange";
					}
					catch(ex) {}
				}
				break;
			case "keypress-stop": 
				if (this.isRemote) {
					this._linkURLs = null;
					this.sendAsyncMessage("FireGestures:KeypressStop", {});
					return;
				}
				for (var i = 0; i < this._linkURLs.length; i++) {
					this._linkElts[i].style.outline = "";
					this._linkElts[i] = null;
				}
				this._linkURLs = null;
				this._linkElts = null;
				break;
			case "gesture-timeout": 
				this.clearStatusText(0);
				break;
			case "reload-prefs": 
				const PREF = "extensions.firegestures.";
				this._statusDisplay = Services.prefs.getIntPref(PREF + "status_display");
				this._blockedHosts = Services.prefs.getCharPref(PREF + "blocked_hosts").split(",").
				                     map(host => host.replace(/^[\s\*]+|\s+$/g, "")).filter(host => host);
				break;
		}
	},

	_performAction: function(event, aCommand) {
		switch (aCommand) {
			case "Browser:Back": 
				BrowserBack(event && event.type == "MozSwipeGesture" ? event : undefined);
				break;
			case "Browser:Forward": 
				BrowserForward(event && event.type == "MozSwipeGesture" ? event : undefined);
				break;
			case "FireGestures:GoUpperLevel": 
				this.goUpperLevel();
				break;
			case "FireGestures:IncrementURL": 
				this.goNumericURL(+1);
				break;
			case "FireGestures:DecrementURL": 
				this.goNumericURL(-1);
				break;
			case "FireGestures:MinimizeWindow": 
				if (event)
					event.preventDefault();
				window.minimize();
				break;
			case "FireGestures:MaximizeWindow": 
				window.windowState == window.STATE_MAXIMIZED ? window.restore() : window.maximize();
				break;
			case "cmd_close": 
				if (gBrowser.selectedTab.pinned)
					throw "Blocked closing app tab.";
				gBrowser.removeCurrentTab({ animate: true });
				break;
			case "FireGestures:CloseTabOrWindow": 
				if (gBrowser.selectedTab.pinned)
					throw "Blocked closing app tab.";
				if (gBrowser.mTabs.length > 1)
					document.getElementById("cmd_close").doCommand();
				else
					document.getElementById("cmd_closeWindow").doCommand();
				break;
			case "FireGestures:UndoCloseTab": 
				document.getElementById("History:UndoCloseTab").doCommand();
				break;
			case "FireGestures:PreviousTab": 
				gBrowser.mTabContainer.advanceSelectedTab(-1, true);
				break;
			case "FireGestures:NextTab": 
				gBrowser.mTabContainer.advanceSelectedTab(+1, true);
				break;
			case "FireGestures:DuplicateTab": 
				var orgTab = gBrowser.selectedTab;
				var newTab = gBrowser.duplicateTab(orgTab);
				gBrowser.moveTabTo(newTab, orgTab._tPos + 1);
				break;
			case "FireGestures:DetachTab": 
				gBrowser.replaceTabWithWindow(gBrowser.selectedTab);
				break;
			case "FireGestures:TogglePinTab": 
				var tab = gBrowser.selectedTab;
				tab.pinned ? gBrowser.unpinTab(tab) : gBrowser.pinTab(tab);
				break;
			case "FireGestures:ReloadAllTabs": 
				gBrowser.reloadAllTabs(gBrowser.selectedTab);
				break;
			case "FireGestures:CloseOtherTabs": 
				gBrowser.removeAllTabsBut(gBrowser.selectedTab);
				break;
			case "FireGestures:CloseLeftTabs": 
				this.closeMultipleTabs("left");
				break;
			case "FireGestures:CloseRightTabs": 
				this.closeMultipleTabs("right");
				break;
			case "Browser:ToggleTabView": 
				alert("Please add the following script:\nTabView.toggle();");
				this._gestureMapping.configure();
				break;
			case "cmd_textZoomEnlarge": 
			case "cmd_textZoomReduce": 
				if ("FullZoom" in window && !ZoomManager.useFullZoom)
					document.getElementById(aCommand.replace("text", "full")).doCommand();
				else
					gBrowser.textZoom += (aCommand == "cmd_textZoomEnlarge") ? 0.2 : -0.2;
				break;
			case "cmd_fullZoomEnlarge": 
			case "cmd_fullZoomReduce": 
				if (ZoomManager.useFullZoom)
					document.getElementById(aCommand).doCommand();
				else
					gBrowser.fullZoom += (aCommand == "cmd_fullZoomEnlarge") ? 0.2 : -0.2;
				break;
			case "cmd_textZoomReset": 
				if ("FullZoom" in window)
					aCommand = aCommand.replace("text", "full");
				document.getElementById(aCommand).doCommand();
				break;
			case "FireGestures:ScrollTop": 
			case "FireGestures:ScrollBottom": 
			case "FireGestures:ScrollPageUp": 
			case "FireGestures:ScrollPageDown": 
				aCommand = aCommand.replace("FireGestures:Scroll", "cmd_scroll");
				this.sourceNode.ownerDocument.defaultView.focus();
				if (this.isRemote) {
					this.sendAsyncMessage("FireGestures:DoCommand", { cmd: aCommand });
					return;
				}
				var docShell = gBrowser.selectedBrowser.docShell;
				if (docShell.isCommandEnabled(aCommand))
					docShell.doCommand(aCommand);
				break;
			case "FireGestures:ShowOnlyThisFrame": 
				var doc = this.sourceNode.ownerDocument;
				var docURL = doc.location.href;
				var refURI = doc.referrer ? makeURI(doc.referrer) : null;
				this.checkURL(docURL, doc.defaultView.top.document, Ci.nsIScriptSecurityManager.DISALLOW_SCRIPT);
				openUILinkIn(docURL, "current", { disallowInheritPrincipal: true, referrerURI: refURI });
				break;
			case "FireGestures:OpenFrame": 
			case "FireGestures:OpenFrameInTab": 
				var doc = this.sourceNode.ownerDocument;
				var docURL = doc.location.href;
				var refURI = doc.referrer ? makeURI(doc.referrer) : null;
				openLinkIn(docURL, aCommand == "FireGestures:OpenFrame" ? "window" : "tab", {
					charset: doc.characterSet, referrerURI: refURI
				});
				break;
			case "FireGestures:ReloadFrame": 
				this.sourceNode.ownerDocument.location.reload();
				break;
			case "FireGestures:AddBookmarkForFrame": 
				var doc = this.sourceNode.ownerDocument;
				var docURI = makeURI(doc.location.href);
				var itemId = PlacesUtils.getMostRecentBookmarkForURI(docURI);
				if (itemId == -1) {
					PlacesUIUtils.showBookmarkDialog({
						action: "add", type: "bookmark", uri: docURI, title: doc.title, 
						description: PlacesUIUtils.getDescriptionFromDocument(doc), 
						hiddenRows: ["description", "location", "loadInSidebar", "keyword" ]
					}, window.top);
				}
				else {
					PlacesUIUtils.showBookmarkDialog({
						action: "edit", type: "bookmark", itemId: itemId
					}, window.top);
				}
				break;
			case "FireGestures:SaveFrame": 
				saveDocument(this.sourceNode.ownerDocument);
				break;
			case "FireGestures:ViewFrameSource": 
				var doc = this.sourceNode.ownerDocument;
				var frameID = doc.defaultView.QueryInterface(Ci.nsIInterfaceRequestor).
				              getInterface(Ci.nsIDOMWindowUtils).outerWindowID;
				BrowserViewSourceOfDocument({
					browser: gBrowser.selectedBrowser, URL: doc.location.href, 
					outerWindowID: frameID
				});
				break;
			case "FireGestures:ViewFrameInfo": 
				BrowserPageInfo(this.sourceNode.ownerDocument);
				break;
			case "FireGestures:OpenLink": 
			case "FireGestures:OpenLinkInPrivateWindow": 
				var linkURL = this.getLinkURL();
				if (!linkURL)
					throw this._getLocaleString("ERROR_NOT_ON_LINK");
				var doc = this.sourceNode.ownerDocument;
				this.checkURL(linkURL, doc);
				openLinkIn(linkURL, "window", {
					charset: doc.characterSet, referrerURI: makeURI(doc.location.href), 
					private: aCommand == "FireGestures:OpenLinkInPrivateWindow"
				});
				break;
			case "FireGestures:OpenLinkInBgTab": 
			case "FireGestures:OpenLinkInFgTab": 
				var linkURL = this.getLinkURL();
				if (!linkURL)
					throw this._getLocaleString("ERROR_NOT_ON_LINK");
				var doc = this.sourceNode.ownerDocument;
				this.checkURL(linkURL, doc);
				gBrowser.loadOneTab(linkURL, {
					referrerURI: makeURI(doc.location.href), charset: doc.characterSet, 
					inBackground: aCommand == "FireGestures:OpenLinkInBgTab", 
					relatedToCurrent: true
				});
				break;
			case "FireGestures:AddBookmarkForLink": 
				var linkURL = this.getLinkURL();
				if (!linkURL)
					throw this._getLocaleString("ERROR_NOT_ON_LINK");
				PlacesCommandHook.bookmarkLink(PlacesUtils.bookmarksMenuFolderId, linkURL, this.getLinkText());
				break;
			case "FireGestures:SaveLink": 
				var linkURL = this.getLinkURL();
				if (!linkURL)
					throw this._getLocaleString("ERROR_NOT_ON_LINK");
				var doc = this.sourceNode.ownerDocument;
				this.checkURL(linkURL, doc);
				nsContextMenu.prototype.saveHelper(linkURL, this.getLinkText(), null, true, doc);
				break;
			case "FireGestures:ViewImage": 
				var imageURL = this.getImageURL();
				if (!imageURL)
					throw this._getLocaleString("ERROR_NOT_ON_IMAGE");
				var onCanvas = this.sourceNode instanceof HTMLCanvasElement;
				if (onCanvas)
					this.checkURL(imageURL, this.sourceNode.ownerDocument, 
					              Ci.nsIScriptSecurityManager.DISALLOW_SCRIPT);
				openUILink(imageURL, event);
				break;
			case "FireGestures:SaveImage": 
			case "FireGestures:SaveImageNow": 
				var mediaURL = this.getMediaURL();
				if (!mediaURL)
					throw this._getLocaleString("ERROR_NOT_ON_IMAGE");
				var doc = this.sourceNode.ownerDocument;
				var skipPrompt = aCommand == "FireGestures:SaveImageNow";
				var refURI = makeURI(doc.location.href);
				var isPrivate = PrivateBrowsingUtils.isBrowserPrivate(gBrowser);
				if (this.sourceNode instanceof HTMLVideoElement || 
				    this.sourceNode instanceof HTMLAudioElement) {
					this.checkURL(mediaURL, doc);
					var dialogTitle = this.sourceNode instanceof HTMLVideoElement
					                ? "SaveVideoTitle" : "SaveAudioTitle";
					nsContextMenu.prototype.saveHelper(mediaURL, null, dialogTitle, false, doc);
				}
				else if (this.sourceNode instanceof HTMLCanvasElement) {
					saveImageURL(mediaURL, "canvas.png", "SaveImageTitle", false, skipPrompt, refURI, doc, null, null, isPrivate);
				}
				else {
					this.checkURL(mediaURL, doc);
					let contType = null;
					let contDisp = null;
					try {
						let imgCache = Cc["@mozilla.org/image/tools;1"].getService(Ci.imgITools).getImgCacheForDocument(doc);
						let props = imgCache.findEntryProperties(makeURI(mediaURL, getCharsetforSave(doc)), doc);
						try { contType = props.get("type", Ci.nsISupportsCString).data; } catch(ex) {}
						try { contDisp = props.get("content-disposition", Ci.nsISupportsCString).data; } catch(ex) {}
					}
					catch(ex) {}
					saveImageURL(mediaURL, null, "SaveImageTitle", false, skipPrompt, refURI, doc, contType, contDisp, isPrivate);
				}
				break;
			case "FireGestures:WebSearch": 
				BrowserSearch.loadSearch(this.getSelectedText(), true);
				break;
			case "FireGestures:OpenLinksInSelection": 
				var linkURLs = this.gatherLinkURLsInSelection();
				if (!linkURLs || linkURLs.length == 0)
					throw "No valid links in selection";
				var doc = this.sourceNode.ownerDocument;
				this.openURLs(linkURLs, makeURI(doc.location.href), doc.charset);
				break;
			case "FireGestures:OpenURLsInSelection": 
				this.openURLsInSelection();
				break;
			case "Tools:DevToolbox": 
				document.getElementById("menu_devToolbox").doCommand();
				break;
			case "FireGestures:BrowserConsole": 
				document.getElementById("menu_browserConsole").doCommand();
				break;
			case "FireGestures:BookmarksSidebar": 
				toggleSidebar("viewBookmarksSidebar");
				break;
			case "FireGestures:HistorySidebar": 
				toggleSidebar("viewHistorySidebar");
				break;
			case "FireGestures:FindBar": 
				gFindBar.hidden ? gFindBar.onFindCommand() : gFindBar.close();
				break;
			case "FireGestures:RestartApp": 
				let cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].
				                 createInstance(Ci.nsISupportsPRBool);
				Services.obs.notifyObservers(cancelQuit, "quit-application-requested", "restart");
				if (cancelQuit.data)
					return;
				let appStartup = Cc["@mozilla.org/toolkit/app-startup;1"].
				                 getService(Ci.nsIAppStartup);
				appStartup.quit(Ci.nsIAppStartup.eAttemptQuit |  Ci.nsIAppStartup.eRestart);
				break;
			case "FireGestures:Preferences": 
				this._gestureMapping.configure();
				break;
			case "FireGestures:HybridSave": 
			case "FireGestures:HybridBookmark": 
				var doc = this.sourceNode.ownerDocument;
				var onLink  = this.getLinkURL()  != null;
				var onMedia = this.getMediaURL() != null;
				var inFrame = doc.defaultView != doc.defaultView.top;
				if (aCommand == "FireGestures:HybridSave") {
					if (onLink)       aCommand = "FireGestures:SaveLink";
					else if (onMedia) aCommand = "FireGestures:SaveImage";
					else if (inFrame) aCommand = "FireGestures:SaveFrame";
					else              aCommand = "Browser:SavePage";
				}
				else {
					if (onLink)       aCommand = "FireGestures:AddBookmarkForLink";
					else if (inFrame) aCommand = "FireGestures:AddBookmarkForFrame";
					else              aCommand = "Browser:AddBookmarkAs";
				}
				this._performAction(event, aCommand);
				break;
			case "FireGestures:HybridCopyURL": 
				var url = this.getLinkURL() || this.getImageURL() || 
				          this.sourceNode.ownerDocument.location.href;
				var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
				clipboard.copyString(url);
				break;
			case "FireGestures:HybridMetaData": 
				if (this.sourceNode instanceof Ci.nsIImageLoadingContent && this.sourceNode.src)
					BrowserPageInfo(this.sourceNode.ownerDocument, "mediaTab", this.sourceNode);
				else
					BrowserPageInfo(this.sourceNode.ownerDocument);
				break;
			case "FireGestures:HybridViewSource": 
				if (this.getSelectedText())
					nsContextMenu.prototype.viewPartialSource("selection");
				else
					this._performAction(event, "FireGestures:ViewFrameSource");
				break;
			case "FireGestures:AllTabsPopup": 
			case "FireGestures:BFHistoryPopup": 
			case "FireGestures:ClosedTabsPopup": 
			case "FireGestures:WebSearchPopup": 
				this._buildPopup(aCommand, event && event.type == "DOMMouseScroll");
				break;
			case "FireGestures:AllScriptsPopup": 
				const kTypeCol    = 0;
				const kNameCol    = 1;
				const kCommandCol = 2;
				var items = this._gestureMapping.getMappingArray().filter(function(item) {
					return item[kTypeCol] == this._gestureMapping.TYPE_SCRIPT;
				}, this);
				var names = items.map(function(item){return item[kNameCol]});
				var ret = {};
				var ok = Services.prompt.select(
					window, "FireGestures", this._getLocaleString("CHOOSE_SCRIPT"), 
					names.length, names, ret
				);
				if (!ok || ret.value < 0)
					return;
				new Function("event", items[ret.value][kCommandCol])(event);
				break;
			case "FireGestures:OpenPanelUI": 
				setTimeout(function(self) {
					PanelUI.ensureReady().then(() => {
						self._gestureHandler.openPopupAtPointer(PanelUI.panel);
					});
				}, 0, this);
				break;
			case "FireGestures:OpenHoveredLinks": 
				var doc = this.sourceNode.ownerDocument;
				this.openURLs(this._linkURLs, makeURI(doc.location.href), doc.characterSet);
				break;
			case "FireGestures:SaveHoveredLinks": 
				var delay = 0;
				var doc = this.sourceNode.ownerDocument;
				var refURI = makeURI(doc.location.href);
				this._linkURLs.forEach(function(aURL) {
					window.setTimeout(function() { saveURL(aURL, null, null, false, true, refURI, doc); }, delay);
					delay += 1000;
				});
				break;
			case "FireGestures:CopyHoveredLinks": 
				if (this._linkURLs.length < 1)
					return;
				var newLine = this._isWin ? "\r\n" : "\n";
				var urls = this._linkURLs.join(newLine);
				if (this._linkURLs.length > 1)
					urls += newLine;
				var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
				clipboard.copyString(urls);
				break;
			default: 
				var cmd = document.getElementById(aCommand);
				if (cmd && cmd.getAttribute("disabled") != "true")
					cmd.doCommand();
		}
	},

	get sourceNode() {
		return this._gestureHandler.sourceNode;
	},

	get focusedWindow() {
		var win = document.commandDispatcher.focusedWindow;
		if (win == window)
			win = this.sourceNode.ownerDocument.defaultView;
		return win;
	},

	getLinkURL: function(aNode) {
		if (!aNode)
			aNode = this.sourceNode;
		while (aNode) {
			if ((aNode instanceof HTMLAnchorElement || aNode instanceof HTMLAreaElement) && aNode.href)
				return aNode.href;
			aNode = aNode.parentNode;
		}
		return null;
	},

	getLinkText: function(aNode) {
		if (!aNode)
			aNode = this.sourceNode;
		var text = "", node = aNode.firstChild, depth = 1;
		while (node && depth > 0) {
			if (node.nodeType == Node.TEXT_NODE) {
				text += " " + node.data;
			}
			else if (node instanceof HTMLImageElement) {
				var altText = node.getAttribute("alt");
				if (altText && altText != "")
					text += " " + altText;
			}
			if (node.hasChildNodes()) {
				node = node.firstChild;
				depth++;
			}
			else {
				while (depth > 0 && !node.nextSibling) {
					node = node.parentNode;
					depth--;
				}
				if (node.nextSibling)
					node = node.nextSibling;
			}
		}
		text = text.trim().replace(/\s+/g, " ");
		if (!text || !text.match(/\S/)) {
			text = aNode.getAttribute("title");
			if (!text || !text.match(/\S/)) {
				text = aNode.getAttribute("alt");
				if (!text || !text.match(/\S/)) {
					text = this.getLinkURL(aNode);
				}
			}
		}
		return text;
	},

	getImageURL: function(aNode) {
		if (!aNode)
			aNode = this.sourceNode;
		if (aNode.ownerDocument.contentType == "application/pdf")
			return null;
		if (aNode instanceof Ci.nsIImageLoadingContent && aNode.src)
			return aNode.src;
		else if (aNode instanceof HTMLCanvasElement)
			return aNode.toDataURL();
		if (aNode instanceof HTMLHtmlElement)
			aNode = aNode.ownerDocument.body;
		var win = aNode.ownerDocument.defaultView;
		while (aNode) {
			if (aNode.nodeType == Node.ELEMENT_NODE) {
				var url = win.getComputedStyle(aNode, "").getPropertyCSSValue("background-image");
				if (url instanceof CSSValueList && url.length > 0) {
					url = url[0];
					if (url.primitiveType == CSSPrimitiveValue.CSS_URI)
						return makeURLAbsolute(aNode.baseURI, url.getStringValue());
				}
			}
			aNode = aNode.parentNode;
		}
		return null;
	},

	getMediaURL: function(aNode) {
		if (!aNode)
			aNode = this.sourceNode;
		if (aNode instanceof HTMLVideoElement || aNode instanceof HTMLAudioElement)
			return aNode.currentSrc || aNode.src;
		else
			return this.getImageURL(aNode);
	},

	_selectedText: null,

	getSelectedText: function() {
		if (this.isRemote) {
			return this._selectedText;
		}
		var win = document.commandDispatcher.focusedWindow;
		var elt = document.commandDispatcher.focusedElement;
		var sel = win.getSelection().toString();
		if (!sel && elt instanceof Ci.nsIDOMNSEditableElement) {
			if (elt instanceof Ci.nsIDOMHTMLTextAreaElement || 
			    (elt instanceof Ci.nsIDOMHTMLInputElement && elt.mozIsTextField(true))) {
				sel = elt.editor.selection.toString();
			}
		}
		return sel;
	},

	gatherLinkURLsInSelection: function() {
		var win = this.focusedWindow;
		var sel = win.getSelection();
		if (!sel || sel.isCollapsed)
			return null;
		var doc = win.document;
		var ret = [];
		for (var i = 0; i < sel.rangeCount; i++) {
			var range = sel.getRangeAt(i);
			var fragment = range.cloneContents();
			var treeWalker = fragment.ownerDocument.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT, null, true);
			while (treeWalker.nextNode()) {
				var node = treeWalker.currentNode;
				if ((node instanceof HTMLAnchorElement || node instanceof HTMLAreaElement) && node.href) {
					try {
						this.checkURL(node.href, doc, Ci.nsIScriptSecurityManager.DISALLOW_SCRIPT);
						ret.push(node.href);
					}
					catch(ex) {
					}
				}
			}
		}
		return ret;
	},

	checkURL: function(aURL, aDoc, aFlags) {
		if (this.isRemote) {
			let principal = Cc["@mozilla.org/scriptsecuritymanager;1"].
			                getService(Ci.nsIScriptSecurityManager).
			                createCodebasePrincipal(gBrowser.currentURI, {
			                                        appId: aDoc.nodePrincipal.appId,
			                                        inBrowser: true });
			urlSecurityCheck(aURL, principal, aFlags);
			return;
		}
		urlSecurityCheck(aURL, aDoc.nodePrincipal, aFlags);
	},

	openURLs: function(aURLs, aReferer, aCharset) {
		if ("TreeStyleTabService" in window)
			TreeStyleTabService.readyToOpenChildTab(gBrowser, true);
		for (let aURL of aURLs) {
			gBrowser.loadOneTab(aURL, {
				referrerURI: aReferer, charset: aCharset, 
				inBackground: true, relatedToCurrent: true
			});
		}
		if ("TreeStyleTabService" in window)
			TreeStyleTabService.stopToOpenChildTab(gBrowser);
	},

	goUpperLevel: function() {
		var uri = gBrowser.currentURI;
		if (uri.schemeIs("about")) {
			loadURI("about:about");
			return;
		}
		if (uri.path == "/") {
			if (/:\/\/[^\.]+\.([^\.]+)\./.test(uri.prePath))
				loadURI(RegExp.leftContext + "://" + RegExp.$1 + "." + RegExp.rightContext + "/");
			return;
		}
		var pathList = uri.path.split("/");
		if (!pathList.pop())
			pathList.pop();
		loadURI(uri.prePath + pathList.join("/") + "/");
	},

	goNumericURL: function(aIncrement) {
		var url = gBrowser.currentURI.spec;
		if (!url.match(/(\d+)(\D*)$/))
			throw "No numeric value in URL";
		var num = RegExp.$1;
		var digit = (num.charAt(0) == "0") ? num.length : null;
		num = parseInt(num, 10) + aIncrement;
		if (num < 0)
			throw "Cannot decrement number in URL anymore";
		num = num.toString();
		digit = digit - num.length;
		for (var i = 0; i < digit; i++)
			num = "0" + num;
		loadURI(RegExp.leftContext + num + RegExp.$2);
	},

	openURLsInSelection: function() {
		var sel = this.getSelectedText();
		if (!sel)
			throw "No selection";
		var URLs = [];
		sel.split("\n").forEach(function(str) {
			str = str.match(/([\w\+\-\=\$;:\?\.%,!#~\*\/@&]{8,})/);
			if (!str || str[1].indexOf(".") < 0)
				return;
			if (str[1].split("/").length < 3 && str[1].split(".").length < 3)
				return;
			str = str[1];
			if (str.indexOf("ttp://") == 0 || str.indexOf("ttps://") == 0)
				str = "h" + str;
			URLs.push(str);
		});
		if (URLs.length > 0)
			this.openURLs(URLs);
		else
			BrowserSearch.loadSearch(sel, true);
	},

	closeMultipleTabs: function(aLeftRight) {
		var tabs = gBrowser.visibleTabs.filter(function(tab){return !tab.pinned});
		var pos = tabs.indexOf(gBrowser.selectedTab);
		var start = aLeftRight == "left" ? 0   : pos + 1;
		var stop  = aLeftRight == "left" ? pos : tabs.length;
		tabs = tabs.slice(start, stop);
		var shouldPrompt = Services.prefs.getBoolPref("browser.tabs.warnOnCloseOtherTabs");
		if (shouldPrompt && tabs.length > 1) {
			var ps = Services.prompt;
			var bundle = gBrowser.mStringBundle;
			var message = PluralForm.get(tabs.length, bundle.getString("tabs.closeWarningMultiple")).
			              replace("#1", tabs.length);
			window.focus();
			var ret = ps.confirmEx(
				window, bundle.getString("tabs.closeWarningTitle"), message, 
				ps.BUTTON_TITLE_IS_STRING * ps.BUTTON_POS_0 + ps.BUTTON_TITLE_CANCEL * ps.BUTTON_POS_1, 
				bundle.getString("tabs.closeButtonMultiple"), 
				null, null, null, {}
			);
			if (ret != 0)
				return;
		}
		tabs.reverse().forEach(function(tab){return gBrowser.removeTab(tab)});
	},

	sendKeyEvent: function(aOptions) {
		if (this.isRemote) {
			this.sendAsyncMessage("FireGestures:SendKeyEvent", aOptions);
			return;
		}
		var evt = this.sourceNode.ownerDocument.createEvent("KeyEvents");
		evt.initKeyEvent(
			"keypress", true, true, null, 
			aOptions.ctrl  || false, 
			aOptions.alt   || false, 
			aOptions.shift || false, 
			aOptions.meta  || false, 
			aOptions.keyCode ? evt[aOptions.keyCode] : null, 
			aOptions.key ? aOptions.key.charCodeAt(0) : null
		);
		this.sourceNode.dispatchEvent(evt);
	},



	setStatusText: function(aText) {
		this._statusTextField.label = aText;
	},

	clearStatusText: function(aMillisec) {
		if (this._clearStatusTimer) {
			window.clearTimeout(this._clearStatusTimer);
			this._clearStatusTimer = null;
		}
		var text = this._statusTextField.label;
		var callback = function(self) {
			self._clearStatusTimer = null;
			if (self._statusTextField.label == text)
				self.setStatusText("");
		};
		this._clearStatusTimer = window.setTimeout(callback, aMillisec, this);
	},



	generatePopup: function(event, aAttrsList) {
		this._buildPopup("FireGestures:CustomPopup", event && event.type == "DOMMouseScroll", aAttrsList);
	},

	_buildPopup: function(aCommand, aWheelGesture, aAttrsList) {
		const POPUP_ID = "FireGesturesPopup";
		var popup = document.getElementById(POPUP_ID);
		var first = false;
		if (this._isWin) {
			if (!popup) {
				popup = document.createElement("menupopup");
				first = true;
			}
		}
		else {
			if (popup)
				popup.parentNode.removeChild(popup);
			popup = document.createElement(aWheelGesture ? "panel" : "menupopup");
			first = true;
		}
		if (first) {
			document.getElementById("mainPopupSet").appendChild(popup);
			popup.id = POPUP_ID;
			popup.style.MozBinding = "url('chrome://firegestures/content/bindings.xml#popup')";
			popup.style.maxWidth = "42em";
		}
		switch (aCommand) {
			case "FireGestures:AllTabsPopup": 
				var tabs = gBrowser.mTabs;
				if (tabs.length < 1)
					return;
				var pinned;
				for (var i = 0; i < tabs.length; i++) {
					let tab = tabs[i];
					if (tab.hidden)
						continue;
					if (pinned && !tab.pinned)
						popup.appendChild(document.createElement("menuseparator"));
					pinned = tab.pinned;
					let menuitem = popup.appendChild(document.createElement("menuitem"));
					menuitem.setAttribute("label", tab.label);
					menuitem.setAttribute("crop", tab.getAttribute("crop"));
					menuitem.setAttribute("image", tab.getAttribute("image"));
					menuitem.setAttribute("class", "menuitem-iconic alltabs-item menuitem-with-favicon");
					menuitem.setAttribute("statustext", tab.linkedBrowser.currentURI.spec);
					menuitem.index = i;
					if (tab.selected)
						menuitem.setAttribute("default", "true");
				}
				var tabContainer = gBrowser.tabContainer;
				if (tabContainer.getAttribute("overflow") != "true")
					break;
				var tabstrip = tabContainer.mTabstrip.scrollBoxObject;
				for (var i = 0; i < popup.childNodes.length; i++) {
					let menuitem = popup.childNodes[i];
					if (menuitem.localName != "menuitem")
						continue;
					let tab = gBrowser.mTabs[menuitem.index].boxObject;
					if (tab.screenX >= tabstrip.screenX && 
					    tab.screenY >= tabstrip.screenY && 
					    tab.screenX + tab.width  <= tabstrip.screenX + tabstrip.width && 
					    tab.screenY + tab.height <= tabstrip.screenY + tabstrip.height)
						menuitem.setAttribute("tabIsVisible", "true");
				}
				break;
			case "FireGestures:BFHistoryPopup": 
				function callback(sessionHistory, initial) {
					if (popup.firstChild)
						return;
					let count = sessionHistory.entries.length;
					if (count < 1)
						throw "No back/forward history for this tab.";
					var curIdx = sessionHistory.index;
					for (var i = 0; i < count; i++) {
						let entry = sessionHistory.entries[i];
						let menuitem = document.createElement("menuitem");
						popup.insertBefore(menuitem, popup.firstChild);
						menuitem.setAttribute("label", entry.title || entry.url);
						menuitem.setAttribute("statustext", entry.url);
						menuitem.index = i;
						if (i == curIdx) {
							menuitem.setAttribute("type", "radio");
							menuitem.setAttribute("checked", "true");
							menuitem.setAttribute("default", "true");
							menuitem.className = "unified-nav-current";
						}
						else {
							var entryURI = BrowserUtils.makeURI(entry.url, entry.charset, null);
							PlacesUtils.favicons.getFaviconURLForPage(entryURI, function(aURI) {
								if (!aURI)
									return;
								let iconURL = PlacesUtils.favicons.getFaviconLinkForIcon(aURI).spec;
								menuitem.style.listStyleImage = "url(" + iconURL + ")";
							});
							menuitem.className = i < curIdx
							                   ? "unified-nav-back menuitem-iconic menuitem-with-favicon"
							                   : "unified-nav-forward menuitem-iconic menuitem-with-favicon";
						}
					}
				}
				SessionStore.getSessionHistory(gBrowser.selectedTab, callback);
				break;
			case "FireGestures:ClosedTabsPopup": 
				var ss = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
				if (ss.getClosedTabCount(window) == 0)
					throw "No restorable tabs in this window.";
				var undoItems = JSON.parse(ss.getClosedTabData(window));
				for (var i = 0; i < undoItems.length; i++) {
					let menuitem = popup.appendChild(document.createElement("menuitem"));
					menuitem.setAttribute("label", undoItems[i].title);
					menuitem.setAttribute("class", "menuitem-iconic bookmark-item menuitem-with-favicon");
					menuitem.index = i;
					let iconURL = undoItems[i].image;
					if (iconURL)
						menuitem.setAttribute("image", iconURL);
					let tabData = undoItems[i].state;
					let activeIndex = (tabData.index || tabData.entries.length) - 1;
					if (activeIndex >= 0 && tabData.entries[activeIndex]) {
						let title = tabData.entries[activeIndex].title;
						let url   = tabData.entries[activeIndex].url;
						menuitem.setAttribute("tooltiptext", title + "\n" + url);
					}
				}
				break;
			case "FireGestures:WebSearchPopup": 
				var searchSvc = Cc["@mozilla.org/browser/search-service;1"].getService(Ci.nsIBrowserSearchService);
				var engines = searchSvc.getVisibleEngines({});
				if (engines.length < 1)
					throw "No search engines installed.";
				for (var i = engines.length - 1; i >= 0; --i) {
					var menuitem = document.createElement("menuitem");
					menuitem.setAttribute("label", engines[i].name);
					menuitem.setAttribute("class", "menuitem-iconic searchbar-engine-menuitem menuitem-with-favicon");
					if (engines[i].iconURI)
						menuitem.setAttribute("src", engines[i].iconURI.spec);
					popup.insertBefore(menuitem, popup.firstChild);
					menuitem.engine = engines[i];
				}
				break;
			case "FireGestures:CustomPopup": 
				for (let aAttrs of aAttrsList) {
					var menuitem;
					if (!aAttrs) {
						menuitem = document.createElement("menuseparator");
					}
					else {
						menuitem = document.createElement("menuitem");
						for (let [name, val] in Iterator(aAttrs)) {
							menuitem.setAttribute(name, val);
							if (menuitem.getAttribute("checked") == "true")
								menuitem.setAttribute("default", "true");
						}
					}
					popup.appendChild(menuitem);
				}
				break;
		}
		popup.setAttribute("wheelscroll", aWheelGesture ? "true" : "false");
		popup.setAttribute("_gesturecommand", aCommand);
		popup.addEventListener("DOMMenuItemActive", this, false);
		popup.addEventListener("DOMMenuItemInactive", this, false);
		popup.addEventListener("command", this, false);
		popup.addEventListener("popuphiding", this, false);
		document.popupNode = null;
		document.tooltipNode = null;
		this._gestureHandler.openPopupAtPointer(popup);
	},

	handleEvent: function(event) {
		var popup = document.getElementById("FireGesturesPopup");
		switch (event.type) {
			case "DOMMenuItemActive": 
				var statusText = event.target.getAttribute("statustext");
				if (statusText == "about:blank")
					statusText = " ";
				if (statusText)
					XULBrowserWindow.setOverLink(statusText, null);
				break;
			case "DOMMenuItemInactive": 
				XULBrowserWindow.setOverLink("", null);
				break;
			case "command": 
				var item = event.target;
				if (popup.defaultItem == item)
					break;
				switch (popup.getAttribute("_gesturecommand")) {
					case "FireGestures:AllTabsPopup": 
						gBrowser.selectedTab = gBrowser.mTabs[item.index];
						break;
					case "FireGestures:BFHistoryPopup": 
						gBrowser.webNavigation.gotoIndex(item.index);
						break;
					case "FireGestures:ClosedTabsPopup": 
						undoCloseTab(item.index);
						break;
					case "FireGestures:WebSearchPopup": 
						var engine = item.engine;
						if (!engine)
							break;
						var submission = engine.getSubmission(this.getSelectedText(), null);
						if (!submission)
							break;
						gBrowser.loadOneTab(submission.uri.spec, {
							postData: submission.postData,
							relatedToCurrent: true
						});
						break;
				}
				break;
			case "popuphiding": 
				popup.removeAttribute("_gesturecommand");
				popup.removeEventListener("DOMMenuItemActive", this, false);
				popup.removeEventListener("DOMMenuItemInactive", this, false);
				popup.removeEventListener("command", this, false);
				popup.removeEventListener("popuphiding", this, false);
				break;
		}
	},

	/* QueryInterface: function(aIID) {
		if (!aIID.equals(Ci.nsISupports) && 
		    !aIID.equals(Ci.nsIDOMEventListener) &&
		    !aIID.equals(Ci.xdIGestureObserver)) {
			throw Cr.NS_ERROR_NO_INTERFACE;
		}
		return this;
	} */

};

window.addEventListener("load",   function() { FireGestures.init(); },   false);
window.addEventListener("unload", function() { FireGestures.uninit(); }, false);
