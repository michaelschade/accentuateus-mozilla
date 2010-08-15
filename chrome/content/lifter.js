if ("undefined" == typeof(Charlifter)) {
    var Charlifter = {};
};

Charlifter.Lifter = {
    codes : { // API Response Codes
          liftSuccess       : 200
        , liftFailUnknown   : 400
        , langListOutdated  : 100
        , langListCurrent   : 200
        , langListOvernew   : 400
    },

    init : function() {
        /* Create dynamic menu of available */
        /* TODO: REMOVE THIS PREFERENCE SETTING */
        //    let prefs = Components.classes["@mozilla.org/preferences-service;1"]
        //        .getService(Components.interfaces.nsIPrefService).getBranch("charlifter.languages.");
        //    prefs.setCharPref("selection-code", "es");
        //    prefs.setCharPref("selection-localized", "Spanish");
        //    prefs.setIntPref("version", 1);
        //    prefs.setCharPref("locale", "en-US");
        /* TODO: REMOVE THIS PREFERENCE SETTING */
        let contextMenu = document.getElementById("contentAreaContextMenu");
        contextMenu.addEventListener("popupshowing", this.readyContextMenu, false);
        this.getLangs(function(aSuccess) {
            let owner = Charlifter.Lifter;
            response = JSON.parse(aSuccess.target.responseText);
            // TODO: Render menu from sqlite
            switch(response.code) {
                case owner.codes.langListOutdated:
                    let prefs = Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefService).getBranch("charlifter.languages.");
                    let langs = response.text.split(','); // TODO: [["es", "Espanol"], ["fr", "Francois"]]
                    let langsMenu = document.getElementById("charlifter-cmenu-languages-item");
                    for (let langPair in langs) {
                        let ele = langsMenu.appendItem(langs[langPair], langs[langPair]);
                        ele.setAttribute("oncommand",
                            "Charlifter.Lifter.liftSelection('" + langs[langPair] + "');"
                        );
                    }
                    break;
                case owner.codes.langListCurrent:
                    break;
                case owner.codes.langListOvernew:
                    break;
                default:
                    break;
            }
        }, function(aError) {
            window.alert("Failure with call: " + request._call);
        });
    },

    readyContextMenu : function(aE) {
        /* Hide context menu elements where appropriate */
        let prefs = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService).getBranch("charlifter.languages.");
        let strbundle       = document.getElementById("charlifter-string-bundle");
        let liftItem        = document.getElementById("charlifter-cmenu-item-lift");
        // TODO: Make this actually use preferences, default preferences especially.
        liftItem.setAttribute("label", strbundle.getFormattedString(
            "lift-item-label", [prefs.getCharPref("selection-localized"), prefs.getCharPref("selection-code")]
        ));
        liftItem.setAttribute("oncommand",
            "Charlifter.Lifter.liftSelection('" + "es" + "');"
        );
        let langsItem       = document.getElementById("charlifter-cmenu-languages-item");
        liftItem.hidden     = !(gContextMenu.onTextInput);
        langsItem.hidden    = !(gContextMenu.onTextInput);
    },

    genRequest : function(args, success, error) {
        /* Abstracts API calling code */
        let url = "http://ares:1932/";
        let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
        request.open("POST", url, true);
        request.onload  = success;
        request.onerror = error;
        request.setRequestHeader("Content-ype", "application/json");
        request.setRequestHeader("charset", "UTF-8");
        request._call = JSON.stringify(args);
        return request;
    },

    getLangs : function(success, error) {
        /* API Call: Get language list */
        let prefs   = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService);
        let cprefs  = prefs.getBranch("charlifter.languages.");
        let locale  = prefs.getBranch("general.useragent.").getCharPref("locale");
        let version = 0; // If the browser locale has changed, we need a new list
        if (locale == cprefs.getCharPref("locale")) {
            version = cprefs.getIntPref("version");
        }
        request = this.genRequest({
              call:     "charlifter.langs"
            , version:  version
            , locale:   locale
        }, success, error);
        request.send(request._call);
    },

    lift : function(lang, text, success, error) {
        /* API Call: Lift text */
        let prefs = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService);
        let locale  = prefs.getBranch("general.useragent.").getCharPref("locale");
        request = this.genRequest({
              call:     "charlifter.lift"
            , lang:     lang
            , text:     text
            , locale:   locale
        }, success, error);
        request.send(request._call);
    },

    liftSelection : function(lang) {
        /* Makes lift function specific to form element */
        let focused = document.commandDispatcher.focusedElement;
        focused.disabled = true;
        this.lift(lang, focused.value, function(aSuccess) {
            let owner = Charlifter.Lifter;
            let response = JSON.parse(aSuccess.target.responseText);
            switch (response.code) {
                case owner.codes.liftSuccess:
                    focused.value = response.text;
                    break;
                case owner.codes.liftFailUnknown:
                    break;
                default:
                    break;
            }
            focused.disabled = false;
        }, function(aError) {
            focused.disabled = false;
            window.alert("Failure with call: " + request._call);
        });
    },
};

window.addEventListener("load", function() {
        Charlifter.Lifter.init();
    }, false);
