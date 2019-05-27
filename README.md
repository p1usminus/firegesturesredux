# FireGestures redux

FireGestures for Waterfox 68

There was an attempt, but frankly I bit off more than I could chew. :sweat_smile: Leaving what I've done here and a list of what's definitely broken, and maybe broken.

* I tried to replace the interfaces with JS modules using [this](https://github.com/thundernest/quicktext/commit/e1ef58dce2816ac1e685f562d30882968e24a391) as an example. I think xdGestureMapping.jsm would have to be re-written because the RDF service is... gone
* Additionally the two RDF files would need to be rewritten, presumably as JSON.
* `_gestureMapping` in browser.js doesn't work, probably because of xdGestureMapping. (Or maybe I messed up the replacement).
* Console kept telling me `this._getLocaleString` is not a function (browser.js:129) but I don't know why this is the case.
* The [expression closure syntax](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Expression_closures) was removed with FF60 so some of the functions produced errors. I tried to fix them but I don't know if I did all of them correctly, but the errors stopped lol. IIRC many of them were related to the RDF things.
* I didn't get to sorting out the preferences menu (moving from prefwindow to dialog), it felt rather pointless while we don't even have basic functions! You can successfully change preferences in about:config though.
