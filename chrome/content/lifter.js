window.addEventListener("load", function() {
        Charlifter.Lifter.init();
    }, false);

if ("undefined" == typeof(Charlifter)) {
    var Charlifter = {};
};

Charlifter.Lifter = {
    codes : { // API Response Codes
          lang-list-outdated : 100
        , lang-list-current  : 200
        , lang-list-overnew  : 400
    },

    init : function() {
        /* Create dynamic menu of available */
        var contextMenu = document.getElementById("contentAreaContextMenu");
        contextMenu.addEventListener("popupshowing", this.readyContextMenu, false);
        this.getLangs(function(aEvent) {
            response = JSON.parse(aEvent.target.responseText)
            // TODO: Render menu from sqlite
            switch(response.code) {
                case this.codes.lang-list-outdated: // List version <  Server version
                    let prefs = Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefService).getBranch("charlifter.languages");
                    let langs = response.text.split('\n').split(':'); // [["es", "Espanol"], ["fr", "Francois"]]
                    let langsMenu = document.getElementById("charlifter-cmenu-languages-item");
                    for (langPair in langs) {
                        let ele = langsMenu.appendItem(langPair[0], langPair[1]);
                        ele.setAttribute("oncommand", String.format(
                            "Charlifter.Lifter.liftSelection('%s');", langPair[0]
                        ));
                    }
                    break;
                case this.codes.lang-list-current: // List version == erver version
                    break;
                case this.codes.lang-list-overnew: // List version >  Server version
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
        var lift            = document.getElementById("charlifter-cmenu-item-lift");
        var langsItem       = document.getElementById("charlifter-cmenu-languages-item");
        lift.hidden         = !(gContextMenu.onTextInput);
        langsItem.hidden    = !(gContextMenu.onTextInput);
    },

    genRequest : function(args, success, error) {
        /* Abstracts API calling code */
        var url = "http://ares:1932/";
        var request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
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
        let prefs = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService);
        let locale  = prefs.getBranch("general.useragent.").getCharPref("locale");
        let version = 0; // If the browser locale has changed, we need a new list
        if (locale != prefs.getBranch("charlifter.languages.").getCharPref("locale")) {
            version = prefs.getBranch("charlifter.languages.").getIntPref("version")
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
        request = this.genRequest({
              call: "charlifter.lift"
            , lang: lang
            , text: text
        }, success, error);
        request.send(request._call);
    },

    liftSelection : function(lang) {
        /* Makes lift function specific to form element */
        var focused = document.commandDispatcher.focusedElement;
        focused.disabled = true;
        this.lift(lang, focused.value, function(aSuccess) {
            focused.value       = JSON.parse(aSuccess.target.responseText).text;
            focused.disabled    = false;
        }, function(aError) {
            window.alert("Failure with call: " + request._call);
        });
    },
};
